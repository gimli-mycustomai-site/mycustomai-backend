const OpenAI  = require('openai');
const { Resend } = require('resend');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const resend = new Resend(process.env.RESEND_API_KEY);

// ── Tool labels for display ───────────────────────────────
const TOOL_LABELS = {
  scheduling:  'Scheduling & Bookings',
  textsched:   'Text Message Scheduling',
  accounting:  'Accounting & Invoicing',
  customer:    'Customer Service & Chat',
  marketing:   'Marketing & Social Media',
  inventory:   'Inventory Management',
  hr:          'HR & Staff Scheduling',
  other:       'Custom Automation',
};

const BIZ_TYPE_LABELS = {
  restaurant:  'Restaurant / Food Service',
  retail:      'Retail Store',
  contractor:  'Contractor / Trades',
  salon:       'Salon / Beauty',
  healthcare:  'Healthcare / Medical',
  realestate:  'Real Estate',
  accounting:  'Accounting / Finance',
  legal:       'Legal Services',
  other:       'Other Business',
};

// ── Generate AI report content ────────────────────────────
async function generateReportContent(data) {
  const painPointLabels = (data.painPoints || [])
    .map(p => TOOL_LABELS[p] || p)
    .join(', ');

  const bizTypeLabel = BIZ_TYPE_LABELS[data.bizType] || data.bizType || 'Business';

  const prompt = `You are an expert AI consultant helping small businesses in Hawaii adopt AI tools.

A business owner has filled out an intake form. Based on their answers, generate a custom AI tools report.

BUSINESS INFO:
- Business Name: ${data.bizName}
- Owner Name: ${data.ownerName}
- Business Type: ${bizTypeLabel}
- Employees: ${data.employees || 'Not specified'}
- Monthly Budget for Tools: ${data.budget || 'Not specified'}
- Current Tools They Use: ${data.currentTools || 'None mentioned'}
- Areas They Want Help With: ${painPointLabels || 'General automation'}
- Description of Business/Challenges: ${data.description || 'Not provided'}
- Additional Notes: ${data.extra || 'None'}

Generate a detailed, personalized AI tools report with the following sections:

1. EXECUTIVE SUMMARY (2-3 sentences specific to their business)

2. YOUR TOP AI RECOMMENDATIONS (3-5 tools, each with):
   - Tool name and what it does
   - Why it's right for ${data.bizName} specifically
   - Exact setup steps (step by step, beginner friendly)
   - Pricing (free tier / paid options)
   - Expected time to see results

3. QUICK WINS (2-3 things they can do TODAY for free, under 30 minutes each)

4. 90-DAY IMPLEMENTATION ROADMAP
   - Week 1-2: Start here
   - Month 1: Build momentum
   - Month 2-3: Scale what's working

5. WHAT TO AVOID (common mistakes businesses like theirs make with AI)

Be specific to their business type and challenges. Use plain language — no tech jargon. 
Make it feel like advice from a trusted local consultant, not a generic report.
Format with clear headers and bullet points.`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 3000,
    temperature: 0.7,
  });

  return completion.choices[0].message.content;
}

// ── Convert report content to styled HTML ─────────────────
function buildReportHTML(data, reportContent) {
  const bizTypeLabel = BIZ_TYPE_LABELS[data.bizType] || data.bizType || 'Business';
  const planLabel = data.plan === 'pro' ? 'Pro Plan' : 'Starter Plan';
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  // Convert markdown-style content to HTML
  let contentHtml = reportContent
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^## (.+)$/gm, '<h2>$2</h2>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^\*\*(.+)\*\*$/gm, '<strong>$1</strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/^(?!<[hul])/gm, '')
    .split('\n').filter(l => l.trim()).join('\n');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Georgia', serif; background: #fff; color: #1a1a1a; font-size: 14px; line-height: 1.7; }
  .cover { background: linear-gradient(135deg, #2D5016 0%, #4A7C59 100%); color: white; padding: 60px 50px; min-height: 280px; }
  .cover-logo { font-size: 13px; font-weight: bold; letter-spacing: 0.15em; text-transform: uppercase; opacity: 0.8; margin-bottom: 40px; }
  .cover h1 { font-size: 32px; font-weight: 400; line-height: 1.3; margin-bottom: 12px; }
  .cover .subtitle { font-size: 16px; opacity: 0.85; margin-bottom: 30px; }
  .cover-meta { font-size: 12px; opacity: 0.7; border-top: 1px solid rgba(255,255,255,0.3); padding-top: 20px; margin-top: 30px; display: flex; gap: 40px; }
  .content { padding: 50px; max-width: 750px; margin: 0 auto; }
  h1 { font-size: 22px; color: #2D5016; margin: 36px 0 14px; padding-bottom: 8px; border-bottom: 2px solid #4A7C59; }
  h2 { font-size: 18px; color: #2D5016; margin: 28px 0 10px; }
  h3 { font-size: 15px; color: #4A7C59; margin: 20px 0 8px; }
  p { margin: 10px 0; color: #333; }
  ul { margin: 10px 0 10px 24px; }
  li { margin: 6px 0; color: #333; }
  strong { color: #1a1a1a; }
  .tool-card { background: #f7f4f0; border-left: 4px solid #4A7C59; padding: 18px 20px; margin: 18px 0; border-radius: 0 8px 8px 0; }
  .footer { margin-top: 60px; padding: 24px 50px; background: #f7f4f0; border-top: 2px solid #4A7C59; font-size: 12px; color: #666; display: flex; justify-content: space-between; }
  .plan-badge { display: inline-block; background: #4A7C59; color: white; font-size: 11px; font-weight: bold; padding: 3px 10px; border-radius: 50px; letter-spacing: 0.05em; text-transform: uppercase; margin-left: 8px; vertical-align: middle; }
</style>
</head>
<body>

<div class="cover">
  <div class="cover-logo">My Custom AI</div>
  <h1>Your Custom AI Plan<br>for ${data.bizName}</h1>
  <div class="subtitle">${bizTypeLabel} · ${planLabel}</div>
  <div class="cover-meta">
    <span>Prepared for: ${data.ownerName}</span>
    <span>Date: ${today}</span>
    <span>Confidential</span>
  </div>
</div>

<div class="content">
${contentHtml}
</div>

<div class="footer">
  <span>My Custom AI — mycustomai.co</span>
  <span>Questions? Message us on WhatsApp: +1 (808) 936-4170</span>
</div>

</body>
</html>`;
}

// ── Generate PDF using Puppeteer ──────────────────────────
async function htmlToPdf(html) {
  let browser;
  try {
    // Try puppeteer-core with @sparticuz/chromium (works on Render)
    const chromium = require('@sparticuz/chromium');
    const puppeteer = require('puppeteer-core');

    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });
  } catch (e) {
    // Fallback: try regular puppeteer if available locally
    try {
      const puppeteer = require('puppeteer');
      browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    } catch (e2) {
      throw new Error('No puppeteer available: ' + e2.message);
    }
  }

  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  const pdf = await page.pdf({
    format: 'Letter',
    printBackground: true,
    margin: { top: '0', right: '0', bottom: '0', left: '0' }
  });
  await browser.close();
  return pdf;
}

// ── Send email with PDF attachment ────────────────────────
async function sendReportEmail(data, pdfBuffer) {
  const planLabel = data.plan === 'pro' ? 'Pro' : 'Starter';
  const isProPlan = data.plan === 'pro';

  const emailHtml = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a1a;">
      <div style="background: linear-gradient(135deg, #2D5016, #4A7C59); padding: 32px; color: white; border-radius: 8px 8px 0 0;">
        <div style="font-size: 20px; font-weight: bold;">My Custom AI</div>
      </div>
      <div style="padding: 32px; background: #f7f4f0; border-radius: 0 0 8px 8px;">
        <h2 style="color: #2D5016; margin-bottom: 16px;">Hi ${data.ownerName},</h2>
        <p style="margin-bottom: 16px; line-height: 1.7;">Your custom AI plan for <strong>${data.bizName}</strong> is attached to this email as a PDF.</p>
        <p style="margin-bottom: 16px; line-height: 1.7;">Your report includes hand-picked AI tools matched to your specific business needs, along with step-by-step setup guides you can follow at your own pace.</p>
        ${isProPlan ? `
        <div style="background: #e8f0e9; border-left: 4px solid #4A7C59; padding: 16px; margin: 20px 0; border-radius: 0 8px 8px 0;">
          <strong style="color: #2D5016;">Your consultation is included.</strong><br>
          <span style="color: #4a4a4a;">Reply to this email or message us on WhatsApp at +1 (808) 936-4170 to schedule your 1-hour AI strategy session.</span>
        </div>
        ` : `
        <div style="background: #e8f0e9; border-left: 4px solid #4A7C59; padding: 16px; margin: 20px 0; border-radius: 0 8px 8px 0;">
          <strong style="color: #2D5016;">Want hands-on help?</strong><br>
          <span style="color: #4a4a4a;">Upgrade to Pro for a 1-hour AI consultation. Reply to this email or message us on WhatsApp at +1 (808) 936-4170.</span>
        </div>
        `}
        <p style="color: #777; font-size: 13px; margin-top: 24px;">— My Custom AI Team · mycustomai.co</p>
      </div>
    </div>
  `;

  await resend.emails.send({
    from: 'My Custom AI <reports@mycustomai.co>',
    to: data.email,
    subject: `Your Custom AI Plan for ${data.bizName} is ready`,
    html: emailHtml,
    attachments: [{
      filename: `mycustomai-plan-${data.bizName.toLowerCase().replace(/\s+/g, '-')}.pdf`,
      content: pdfBuffer.toString('base64'),
    }]
  });

  console.log(`[email] Report sent to ${data.email}`);
}

// ── Main export: generate report + send email ─────────────
async function generateAndSendReport(data) {
  console.log(`[pdf] Generating report for ${data.bizName}...`);

  const reportContent = await generateReportContent(data);
  console.log(`[pdf] AI content generated (${reportContent.length} chars)`);

  const html = buildReportHTML(data, reportContent);
  const pdfBuffer = await htmlToPdf(html);
  console.log(`[pdf] PDF generated (${pdfBuffer.length} bytes)`);

  await sendReportEmail(data, pdfBuffer);
  console.log(`[pdf] Done — report delivered to ${data.email}`);
}

module.exports = { generateAndSendReport };
