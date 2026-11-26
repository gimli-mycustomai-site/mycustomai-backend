/**
 * testimonials.js — MyCustomAI invite-only testimonial endpoints
 *
 * GET  /api/review-invite/check?t=TOKEN
 * POST /api/testimonial
 * Body: { token, name, company, title, testimonial, rating, permission }
 *
 * Token must be a valid invite from review-token.js. One-time use: the
 * invite id is stored on the published entry; GitHub's sha check rejects
 * a concurrent second write. Publishes to testimonials.json via the
 * GitHub Contents API. No third-party deps — uses Node built-ins.
 */

const https = require('https');
const { verifyInviteToken } = require('./review-token');
const { telegramSend }      = require('./audit-notify');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_OWNER   = 'gimli-mycustomai-site';
const REPO_NAME    = 'mycustomai-site';
const FILE_PATH    = 'testimonials.json';
const BRANCH       = 'main';

// Local testing only — never set on Render
const DRY_RUN    = process.env.TESTIMONIALS_DRY_RUN === '1';
const dryRunList = [];

function getSecret() {
  return process.env.REVIEW_INVITE_SECRET;
}

// ── GitHub API helper ──────────────────────────────────────────
function githubRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'api.github.com',
      path:     `/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`,
      method,
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'User-Agent':    'mycustomai-backend',
        'Accept':        'application/vnd.github.v3+json',
        'Content-Type':  'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function loadTestimonials() {
  if (DRY_RUN) return { sha: 'dry-run', list: dryRunList.slice() };
  const resp = await githubRequest('GET', `${FILE_PATH}?ref=${BRANCH}`);
  if (resp.status !== 200) throw new Error(`GitHub GET failed: ${resp.status}`);
  const list = JSON.parse(Buffer.from(resp.body.content.replace(/\n/g, ''), 'base64').toString('utf8'));
  return { sha: resp.body.sha, list: Array.isArray(list) ? list : [] };
}

// Returns true on success, false on any non-2xx (e.g. stale sha)
async function saveTestimonials(list, sha, entry) {
  if (DRY_RUN) {
    dryRunList.length = 0;
    dryRunList.push(...list);
    return true;
  }
  const resp = await githubRequest('PUT', FILE_PATH, {
    message: `Add verified testimonial from ${entry.name}`,
    content: Buffer.from(JSON.stringify(list, null, 2)).toString('base64'),
    sha,
    branch: BRANCH
  });
  if (resp.status !== 200 && resp.status !== 201) {
    console.error('[testimonial] GitHub PUT failed:', resp.status);
    return false;
  }
  return true;
}

// ── Rate limit (in-memory; resets on restart) ──────────────────
const WINDOW_MS  = 15 * 60 * 1000;
const MAX_PER_IP = 10;
const hits = new Map();

function rateLimited(ip) {
  const now = Date.now();
  if (hits.size > 5000) hits.clear();
  const list = (hits.get(ip) || []).filter(t => now - t < WINDOW_MS);
  if (list.length >= MAX_PER_IP) {
    hits.set(ip, list);
    return true;
  }
  list.push(now);
  hits.set(ip, list);
  return false;
}

// ── Input helpers ──────────────────────────────────────────────
// Returns cleaned string, '' if absent, or null if wrong type / too long
function clean(value, max, multiline) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') return null;
  let s = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  s = multiline ? s.replace(/\r\n?/g, '\n') : s.replace(/[\r\n\t]+/g, ' ');
  s = s.trim();
  return s.length > max ? null : s;
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function notifyPublished(entry) {
  if (!process.env.TELEGRAM_BOT_TOKEN || DRY_RUN) return;
  const text = [
    '⭐ <b>New verified review — MyCustomAI.co</b>',
    '',
    `👤 <b>Name:</b> ${escapeHtml(entry.name)}`,
    `🏢 <b>Title:</b> ${escapeHtml(entry.title)}`,
    `⭐ <b>Rating:</b> ${entry.rating}/5`,
    `🔑 <b>Invite:</b> ${escapeHtml(entry.inviteId)}`,
    '',
    escapeHtml(entry.testimonial)
  ].join('\n');
  telegramSend(text).catch(err => console.error('[testimonial] Telegram notify failed:', err.message));
}

// ── GET /api/review-invite/check ───────────────────────────────
async function handleInviteCheck(req, res) {
  if (rateLimited(req.ip)) return res.status(429).json({ valid: false, reason: 'rate_limited' });

  const v = verifyInviteToken(getSecret(), req.query.t);
  if (!v.ok) {
    return res.status(v.reason === 'server_not_configured' ? 503 : 200).json({ valid: false, reason: v.reason });
  }

  try {
    const { list } = await loadTestimonials();
    if (list.some(e => e.inviteId === v.id)) return res.json({ valid: false, reason: 'used' });
    res.json({ valid: true, expiresAt: new Date(v.exp * 1000).toISOString() });
  } catch (err) {
    console.error('[review-check] Error:', err.message);
    res.status(500).json({ valid: false, reason: 'server_error' });
  }
}

// ── POST /api/testimonial ──────────────────────────────────────
async function handleTestimonial(req, res) {
  try {
    if (rateLimited(req.ip)) {
      return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }

    const body = req.body || {};

    const v = verifyInviteToken(getSecret(), body.token);
    if (!v.ok) {
      if (v.reason === 'server_not_configured') {
        console.error('[testimonial] REVIEW_INVITE_SECRET not set or too short');
        return res.status(503).json({ error: 'Reviews are temporarily unavailable.' });
      }
      return res.status(401).json({
        error: v.reason === 'expired'
          ? 'This review link has expired. Please ask Nainoa for a new one.'
          : 'This review link is not valid.'
      });
    }

    const name        = clean(body.name, 80, false);
    const company     = clean(body.company, 100, false);
    const title       = clean(body.title, 100, false);
    const testimonial = clean(body.testimonial, 2000, true);
    const rating      = (typeof body.rating === 'number' || typeof body.rating === 'string') ? Number(body.rating) : NaN;

    if (name === null || company === null || title === null || testimonial === null) {
      return res.status(400).json({ error: 'One or more fields is too long.' });
    }
    if (!name || !testimonial) {
      return res.status(400).json({ error: 'Name and review are required.' });
    }
    if (testimonial.length < 20) {
      return res.status(400).json({ error: 'Please write at least a sentence or two (20+ characters).' });
    }
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Please choose a star rating from 1 to 5.' });
    }
    if (body.permission !== 'yes') {
      return res.status(400).json({ error: 'Permission to publish is required to submit a review.' });
    }
    if (!DRY_RUN && !GITHUB_TOKEN) {
      console.error('[testimonial] GITHUB_TOKEN not set in environment');
      return res.status(500).json({ error: 'Could not publish your review. Please try again.' });
    }

    const entry = {
      name,
      company,
      title:      title || (company ? `Client, ${company}` : 'Client'),
      testimonial,
      rating,
      date:       new Date().toISOString().split('T')[0],
      inviteId:   v.id,
      verified:   true
    };

    // Two attempts: a stale sha (concurrent write) gets one fresh re-read
    for (let attempt = 1; attempt <= 2; attempt++) {
      const { sha, list } = await loadTestimonials();
      if (list.some(e => e.inviteId === v.id)) {
        return res.status(409).json({ error: 'This review link has already been used.' });
      }
      if (await saveTestimonials([...list, entry], sha, entry)) {
        console.log(`[testimonial] Published verified review, invite ${v.id}`);
        notifyPublished(entry);
        return res.json({
          success: true,
          message: 'Thank you! Your review has been published and will appear on the site within a few minutes.'
        });
      }
    }

    res.status(500).json({ error: 'Could not publish your review. Please try again.' });

  } catch (err) {
    console.error('[testimonial] Error:', err.message);
    res.status(500).json({ error: 'Could not publish your review. Please try again.' });
  }
}

module.exports = { handleTestimonial, handleInviteCheck };
