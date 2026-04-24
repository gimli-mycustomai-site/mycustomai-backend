/**
 * audit-notify.js — Send raw audit form + estimate to Telegram "Business Meetings"
 * Called by audit.html on form submit.
 * POST /api/audit-notify
 * Body: { data: {...formFields}, estimate: {...computedEstimate} }
 */

const https = require('https');

const TELEGRAM_TOKEN   = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = '-1003937855108'; // Business Meetings channel

function telegramSend(text) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: 'HTML' });
    const req = https.request({
      hostname: 'api.telegram.org',
      path:     `/bot${TELEGRAM_TOKEN}/sendMessage`,
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(JSON.parse(d)));
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function handleAuditNotify(req, res) {
  try {
    const { data, estimate } = req.body || {};
    if (!data || !data.name) return res.status(400).json({ error: 'Missing audit data' });

    if (!TELEGRAM_BOT_TOKEN) {
      console.warn('[audit-notify] TELEGRAM_BOT_TOKEN not set — skipping notify');
      return res.json({ success: true, message: 'Skipped (no token)' });
    }

    const flagsText = estimate && estimate.flags && estimate.flags.length
      ? '\n⚠️ <b>Flags:</b>\n' + estimate.flags.map(f => `  • ${f}`).join('\n')
      : '';

    const msg = [
      '📋 <b>New Audit Request — MyCustomAI.co</b>',
      '',
      `👤 <b>Name:</b> ${data.name}`,
      `🏢 <b>Company:</b> ${data.company || '—'}`,
      `📧 <b>Email:</b> ${data.email}`,
      `📍 <b>Location:</b> ${data.location || '—'}`,
      `👥 <b>Size:</b> ${data.size}`,
      `🎯 <b>Target Function:</b> ${data.target_function || '—'}`,
      `🔧 <b>Stack:</b> ${data.stack || '—'}`,
      `⏱ <b>Manual Hours/Week:</b> ${data.manual_hours || '—'}`,
      `🧠 <b>AI Proficiency:</b> ${data.proficiency || '—'}`,
      `💾 <b>Data Readiness:</b> ${data.data_readiness || '—'}`,
      `🚀 <b>Driver:</b> ${data.driver || '—'}`,
      '',
      `🔥 <b>Bottleneck:</b> ${data.bottleneck || '—'}`,
      '',
      estimate ? [
        '─────────────────────',
        `💰 <b>Estimate: ${estimate.tierName} — ${estimate.priceDisplay}</b>`,
        `📅 <b>Timeline:</b> ${estimate.timeline}`,
        `🔄 <b>Retainer Rec:</b> ${estimate.retainerName} ${estimate.retainerPrice}`,
        flagsText,
        `📝 <b>Summary:</b> ${estimate.summary}`,
        `⚡ <b>Review Note:</b> ${estimate.reviewNote}`,
      ].join('\n') : '',
      '',
      '─────────────────────',
      `📖 <b>Deep Dive:</b>\n${(data.deep_dive || '—').slice(0, 800)}${data.deep_dive && data.deep_dive.length > 800 ? '…' : ''}`,
    ].join('\n');

    await telegramSend(msg);
    console.log(`[audit-notify] Sent to Business Meetings: ${data.name} (${data.email})`);
    res.json({ success: true });

  } catch (err) {
    console.error('[audit-notify] Error:', err.message);
    // Don't fail — client already sees their estimate
    res.json({ success: false, error: err.message });
  }
}

module.exports = { handleAuditNotify };
