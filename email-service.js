/**
 * email-service.js — High-volume email service for MyCustomAI
 * Handles thousands of emails with retry logic, rate limiting, and monitoring
 */

const { Resend } = require('resend');
const https = require('https');

class EmailService {
  constructor() {
    this.resend = new Resend(process.env.RESEND_API_KEY);
    this.rateLimitStore = new Map(); // In production, use Redis
    this.retryQueue = [];
    this.stats = {
      sent: 0,
      failed: 0,
      retried: 0,
      ratelimited: 0
    };
  }

  // Rate limiting: 10 emails per minute per IP/user
  checkRateLimit(identifier) {
    const now = Date.now();
    const windowMs = 60000; // 1 minute
    const maxRequests = 10;

    if (!this.rateLimitStore.has(identifier)) {
      this.rateLimitStore.set(identifier, []);
    }

    const requests = this.rateLimitStore.get(identifier);
    // Remove old requests outside the window
    const validRequests = requests.filter(time => now - time < windowMs);
    
    if (validRequests.length >= maxRequests) {
      this.stats.ratelimited++;
      return false;
    }

    validRequests.push(now);
    this.rateLimitStore.set(identifier, validRequests);
    return true;
  }

  // Exponential backoff retry logic
  async retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
    let lastError;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        this.stats.retried++;
        
        if (attempt === maxRetries) break;
        
        const delay = baseDelay * Math.pow(2, attempt);
        await this.sleep(delay);
      }
    }
    
    throw lastError;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Send playbook email with retry logic
  async sendPlaybookEmail(customerEmail, customerName, identifier = 'system') {
    if (!this.checkRateLimit(identifier)) {
      throw new Error('Rate limit exceeded. Try again later.');
    }

    return this.retryWithBackoff(async () => {
      // Generate PDF (consider caching for identical requests)
      const { buildPlaybookPDF } = require('./playbook-pdf');
      const pdfBuffer = await buildPlaybookPDF(customerName);

      const html = `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a">
  <div style="background:linear-gradient(135deg,#0A0F2C,#6366F1);padding:32px;color:white;border-radius:8px 8px 0 0">
    <div style="font-size:11px;letter-spacing:2px;color:#818CF8;margin-bottom:8px">MYCUSTOMAI.CO</div>
    <div style="font-size:22px;font-weight:bold">Your Free Playbook is Attached</div>
  </div>
  <div style="padding:32px;background:#f8fafc;border-radius:0 0 8px 8px">
    <h2 style="color:#0A0F2C;margin-bottom:16px">Hi ${customerName || 'there'},</h2>
    <p style="margin-bottom:16px;line-height:1.7">
      As part of your MyCustomAI purchase, here's your complimentary copy of:
    </p>
    <div style="background:#EEF2FF;border-left:4px solid #6366F1;padding:16px;border-radius:0 8px 8px 0;margin-bottom:24px">
      <strong style="color:#0A0F2C;font-size:15px">Building AI In-House: The Complete Playbook</strong><br>
      <span style="color:#475569;font-size:13px">How to Build, Run &amp; Maintain Powerful AI Systems Without Keeping Experts on Retainer</span>
    </div>
    <p style="line-height:1.7;margin-bottom:16px">
      This is your permanent reference guide. Use it to build your first agents, debug when things break, select the right tools, and scale your AI capability over time.
    </p>
    <p style="line-height:1.7;margin-bottom:24px">
      Nainoa and the team are available if you have questions — just reply to this email or reach us on WhatsApp.
    </p>
    <div style="text-align:center;margin-bottom:24px">
      <a href="https://mycustomai.co" style="background:#6366F1;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px">
        Visit mycustomai.co
      </a>
    </div>
    <p style="color:#94a3b8;font-size:12px;margin-top:24px">— Nainoa & The MyCustomAI Team · mycustomai.co · WhatsApp: +1 (808) 936-4170</p>
  </div>
</div>`;

      const result = await this.resend.emails.send({
        from: 'My Custom AI <reports@send.mycustomai.co>',
        to: customerEmail,
        subject: 'Your Free Playbook: Building AI In-House (Attached)',
        html,
        attachments: [{
          filename: 'mycustomai-building-ai-in-house-playbook.pdf',
          content: pdfBuffer.toString('base64'),
        }]
      });

      this.stats.sent++;
      console.log(`[email-service] Playbook sent to ${customerEmail} (ID: ${result.id})`);
      return result;
    });
  }

  // Send audit notification to Telegram with retry
  async sendAuditNotification(auditData, estimate, identifier = 'system') {
    if (!this.checkRateLimit(`telegram_${identifier}`)) {
      throw new Error('Telegram rate limit exceeded');
    }

    return this.retryWithBackoff(async () => {
      const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
      const TELEGRAM_CHAT_ID = '-1003937855108';

      if (!TELEGRAM_BOT_TOKEN) {
        console.warn('[email-service] TELEGRAM_BOT_TOKEN not set — skipping notify');
        return { success: false, message: 'No token' };
      }

      const flagsText = estimate && estimate.flags && estimate.flags.length
        ? '\n⚠️ <b>Flags:</b>\n' + estimate.flags.map(f => `  • ${f}`).join('\n')
        : '';

      const msg = [
        '📋 <b>New Audit Request — MyCustomAI.co</b>',
        '',
        `👤 <b>Name:</b> ${auditData.name}`,
        `🏢 <b>Company:</b> ${auditData.company || '—'}`,
        `📧 <b>Email:</b> ${auditData.email}`,
        `📍 <b>Location:</b> ${auditData.location || '—'}`,
        `👥 <b>Size:</b> ${auditData.size}`,
        `🎯 <b>Target Function:</b> ${auditData.target_function || '—'}`,
        `🔧 <b>Stack:</b> ${auditData.stack || '—'}`,
        `⏱ <b>Manual Hours/Week:</b> ${auditData.manual_hours || '—'}`,
        `🧠 <b>AI Proficiency:</b> ${auditData.proficiency || '—'}`,
        `💾 <b>Data Readiness:</b> ${auditData.data_readiness || '—'}`,
        `🚀 <b>Driver:</b> ${auditData.driver || '—'}`,
        '',
        `🔥 <b>Bottleneck:</b> ${auditData.bottleneck || '—'}`,
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
        `📖 <b>Deep Dive:</b>\n${(auditData.deep_dive || '—').slice(0, 2000)}${auditData.deep_dive && auditData.deep_dive.length > 2000 ? '…' : ''}`,
      ].join('\n');

      return this.telegramSend(TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, msg);
    });
  }

  // Telegram send with proper error handling
  telegramSend(botToken, chatId, text) {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' });
      
      const req = https.request({
        hostname: 'api.telegram.org',
        path: `/bot${botToken}/sendMessage`,
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'Content-Length': Buffer.byteLength(payload) 
        },
        timeout: 30000 // 30 second timeout
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const result = JSON.parse(data);
            if (result.ok) {
              this.stats.sent++;
              resolve(result);
            } else {
              this.stats.failed++;
              reject(new Error(`Telegram API error: ${result.description}`));
            }
          } catch (e) {
            this.stats.failed++;
            reject(new Error(`Invalid Telegram response: ${data}`));
          }
        });
      });

      req.on('error', (err) => {
        this.stats.failed++;
        reject(err);
      });

      req.on('timeout', () => {
        this.stats.failed++;
        req.destroy();
        reject(new Error('Telegram request timeout'));
      });

      req.write(payload);
      req.end();
    });
  }

  // Send intake form notification with retry
  async sendIntakeNotification(intakeData, estimate, identifier = 'system') {
    if (!this.checkRateLimit(identifier)) {
      throw new Error('Rate limit exceeded for intake notifications');
    }

    return this.retryWithBackoff(async () => {
      const emailHtml = [
        '<h2>New Buildout Request</h2>',
        '<table style="border-collapse:collapse;width:100%;font-family:sans-serif;">',
        `<tr><td style="padding:8px;font-weight:bold;background:#f5f5f5;">Business</td><td style="padding:8px;">${intakeData.bizName || ''}</td></tr>`,
        `<tr><td style="padding:8px;font-weight:bold;background:#f5f5f5;">Owner</td><td style="padding:8px;">${intakeData.ownerName || ''}</td></tr>`,
        `<tr><td style="padding:8px;font-weight:bold;background:#f5f5f5;">Type</td><td style="padding:8px;">${intakeData.bizType || ''}</td></tr>`,
        `<tr><td style="padding:8px;font-weight:bold;background:#f5f5f5;">Employees</td><td style="padding:8px;">${intakeData.employees || ''}</td></tr>`,
        `<tr><td style="padding:8px;font-weight:bold;background:#f5f5f5;">Package</td><td style="padding:8px;">${intakeData.plan || ''}</td></tr>`,
        `<tr><td style="padding:8px;font-weight:bold;background:#f5f5f5;">Current Tools</td><td style="padding:8px;">${intakeData.currentTools || ''}</td></tr>`,
        `<tr><td style="padding:8px;font-weight:bold;background:#f5f5f5;">Pain Points</td><td style="padding:8px;">${Array.isArray(intakeData.painPoints) ? intakeData.painPoints.join(', ') : ''}</td></tr>`,
        '</table>',
        `<h3>Description</h3><p>${(intakeData.description || '').replace(/\n/g, '<br>')}</p>`,
        `<h3>Extra Notes</h3><p>${(intakeData.extra || '').replace(/\n/g, '<br>')}</p>`,
        estimate ? this.buildEstimateHtml(estimate) : ''
      ].join('');

      const result = await this.resend.emails.send({
        from: 'MyCustomAI Intake <intake@send.mycustomai.co>',
        to: ['gimlikazaddum@gmail.com'],
        subject: `New Buildout Request - ${intakeData.bizName || 'Unknown Business'}`,
        html: emailHtml
      });

      this.stats.sent++;
      console.log(`[email-service] Intake notification sent (ID: ${result.id})`);
      return result;
    });
  }

  buildEstimateHtml(estimate) {
    const flagsHtml = estimate.flags ? estimate.flags.map(f => `<li>${f}</li>`).join('') : '<li>None</li>';
    const scopeHtml = estimate.scope ? estimate.scope.map(s => `<li>${s}</li>`).join('') : '<li>Standard scope</li>';
    
    return [
      '<table style="border-collapse:collapse;width:100%;font-family:sans-serif;margin-bottom:16px;">',
      `<tr><td style="padding:8px;font-weight:bold;background:#f0f4ff;width:200px;">Recommended Tier</td><td style="padding:8px;">${estimate.tierName} — ${estimate.priceDisplay}</td></tr>`,
      `<tr><td style="padding:8px;font-weight:bold;background:#f0f4ff;">Retainer Recommendation</td><td style="padding:8px;">${estimate.retainerName} — ${estimate.retainerPrice} (${estimate.retainerReason})</td></tr>`,
      `<tr><td style="padding:8px;font-weight:bold;background:#f0f4ff;">Estimated Timeline</td><td style="padding:8px;">${estimate.timeline}</td></tr>`,
      '</table>',
      `<h3 style="color:#1a1a1a;">Complexity Flags</h3><ul>${flagsHtml}</ul>`,
      `<h3 style="color:#1a1a1a;">Scope</h3><ul>${scopeHtml}</ul>`,
      `<h3 style="color:#1a1a1a;">Summary</h3><p>${estimate.summary}</p>`,
      `<h3 style="color:#c0392b;">Review Note</h3><p>${estimate.reviewNote}</p>`,
      '<hr style="margin:32px 0;border-color:#ccc;">',
      '<p style="color:#888;font-size:0.85rem;">—— END ESTIMATE ——</p>'
    ].join('');
  }

  // Get service statistics
  getStats() {
    return {
      ...this.stats,
      rateLimit: {
        activeIdentifiers: this.rateLimitStore.size,
        totalRequests: Array.from(this.rateLimitStore.values()).reduce((sum, requests) => sum + requests.length, 0)
      }
    };
  }

  // Health check endpoint data
  async healthCheck() {
    try {
      // Test Resend connection
      const testResult = await this.resend.emails.send({
        from: 'My Custom AI <reports@send.mycustomai.co>',
        to: 'test@example.com', // This will fail but test the connection
        subject: 'Health Check',
        html: 'Test'
      });
      return { 
        status: 'healthy',
        resend: 'connected',
        stats: this.getStats(),
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'degraded',
        resend: error.message,
        stats: this.getStats(),
        timestamp: new Date().toISOString()
      };
    }
  }
}

module.exports = EmailService;
