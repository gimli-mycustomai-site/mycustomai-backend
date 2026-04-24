/**
 * testimonials.js — MyCustomAI Testimonial Endpoint
 *
 * POST /api/testimonial
 * Body: { name, company, title, testimonial, rating, permission }
 *
 * Validates → checks permission → fetches testimonials.json from GitHub
 * → appends entry → pushes back via GitHub Contents API.
 * No third-party deps — uses Node built-in https module.
 */

const https = require('https');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_OWNER   = 'gimli-mycustomai-site';
const REPO_NAME    = 'mycustomai-site';
const FILE_PATH    = 'testimonials.json';
const BRANCH       = 'main';

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

// ── Route handler ──────────────────────────────────────────────
async function handleTestimonial(req, res) {
  try {
    const { name, company, title, testimonial, rating, permission } = req.body || {};

    // Validate
    if (!name || !testimonial) {
      return res.status(400).json({ error: 'Name and testimonial are required.' });
    }
    if (!permission || permission.toLowerCase() !== 'yes') {
      // Accept submission but don't publish — just ack
      console.log(`[testimonial] No publish permission from: ${name}`);
      return res.json({ success: true, message: 'Thank you for your feedback.' });
    }
    if (!GITHUB_TOKEN) {
      console.error('[testimonial] GITHUB_TOKEN not set in environment');
      return res.status(500).json({ error: 'Server configuration error.' });
    }

    // Fetch current testimonials.json
    const getResp = await githubRequest('GET', FILE_PATH);
    if (getResp.status !== 200) {
      console.error('[testimonial] GitHub GET failed:', getResp.status, getResp.body);
      return res.status(500).json({ error: 'Could not fetch testimonials.' });
    }

    const sha      = getResp.body.sha;
    const existing = JSON.parse(
      Buffer.from(getResp.body.content.replace(/\n/g, ''), 'base64').toString('utf8')
    );

    // Build new entry
    const entry = {
      name:        name.trim(),
      company:     (company || '').trim(),
      title:       (title || (company ? `Client, ${company}` : 'Client')).trim(),
      testimonial: testimonial.trim(),
      rating:      Math.min(5, Math.max(1, parseInt(rating) || 5)),
      date:        new Date().toISOString().split('T')[0]
    };

    existing.push(entry);

    // Push updated file back to GitHub
    const newContent = Buffer.from(JSON.stringify(existing, null, 2)).toString('base64');
    const putResp = await githubRequest('PUT', FILE_PATH, {
      message: `Add testimonial from ${entry.name}`,
      content: newContent,
      sha,
      branch: BRANCH
    });

    if (putResp.status !== 200 && putResp.status !== 201) {
      console.error('[testimonial] GitHub PUT failed:', putResp.status, putResp.body);
      return res.status(500).json({ error: 'Could not publish testimonial.' });
    }

    console.log(`[testimonial] Published: ${entry.name}`);
    res.json({ success: true, message: 'Thank you! Your review is now live.' });

  } catch (err) {
    console.error('[testimonial] Error:', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}

module.exports = { handleTestimonial };
