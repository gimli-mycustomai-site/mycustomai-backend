const OpenAI   = require('openai');
const { Resend } = require('resend');
const PDFDocument = require('pdfkit');

// Lazy-init so env vars are loaded before clients are created
function getOpenAI() {
  return new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: 'https://openrouter.ai/api/v1',
    defaultHeaders: {
      'HTTP-Referer': 'https://mycustomai.co',
      'X-Title': 'My Custom AI',
    },
  });
}
function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

const TOOL_LABELS = {
  scheduling: 'Scheduling & Bookings',
  textsched:  'Text Message Scheduling',
  accounting: 'Accounting & Invoicing',
  customer:   'Customer Service & Chat',
  marketing:  'Marketing & Social Media',
  inventory:  'Inventory Management',
  hr:         'HR & Staff Scheduling',
  other:      'Custom Automation',
};

const BIZ_TYPE_LABELS = {
  restaurant: 'Restaurant / Food Service',
  retail:     'Retail Store',
  contractor: 'Contractor / Trades',
  salon:      'Salon / Beauty',
  healthcare: 'Healthcare / Medical',
  realestate: 'Real Estate',
  accounting: 'Accounting / Finance',
  legal:      'Legal Services',
  other:      'Other Business',
};

// ── Generate AI report content ────────────────────────────
async function generateReportContent(data) {
  const painPointLabels = (data.painPoints || [])
    .map(p => TOOL_LABELS[p] || p).join(', ');
  const bizTypeLabel = BIZ_TYPE_LABELS[data.bizType] || data.bizType || 'Business';

  const prompt = `You are an expert AI consultant helping small businesses in Hawaii adopt AI tools.

A business owner filled out an intake form. Generate a custom AI tools report based on their answers.

BUSINESS INFO:
- Business Name: ${data.bizName}
- Owner Name: ${data.ownerName}
- Business Type: ${bizTypeLabel}
- Employees: ${data.employees || 'Not specified'}
- Monthly Budget: ${data.budget || 'Not specified'}
- Current Tools: ${data.currentTools || 'None mentioned'}
- Areas for Help: ${painPointLabels || 'General automation'}
- Description: ${data.description || 'Not provided'}
- Notes: ${data.extra || 'None'}

Write a personalized report with these sections (use plain text, no markdown symbols):

EXECUTIVE SUMMARY
[2-3 sentences specific to their business]

TOP AI RECOMMENDATIONS
[3-5 tools, each with: tool name, why it fits their business, setup steps, pricing, timeline]

QUICK WINS
[2-3 things they can do TODAY for free, under 30 minutes each]

90-DAY ROADMAP
Week 1-2: [actions]
Month 1: [actions]
Month 2-3: [actions]

WHAT TO AVOID
[2-3 common mistakes for their business type]

Be specific, use plain language, no tech jargon. Write like a trusted local consultant.`;

  const openai = getOpenAI();
  const completion = await openai.chat.completions.create({
    model: 'anthropic/claude-sonnet-4-6',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 2500,
    temperature: 0.7,
  });

  return completion.choices[0].message.content;
}

// ── Build PDF using PDFKit ────────────────────────────────
async function buildPDF(data, reportContent) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 50 });
    const chunks = [];

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const GREEN_DARK  = '#2D5016';
    const GREEN_MID   = '#4A7C59';
    const OFF_WHITE   = '#F7F4F0';
    const TEXT_DARK   = '#1A1A1A';
    const TEXT_MID    = '#4A4A4A';

    const today = new Date().toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric'
    });
    const planLabel = data.plan === 'pro' ? 'Pro Plan' : 'Starter Plan';
    const bizTypeLabel = BIZ_TYPE_LABELS[data.bizType] || 'Business';

    // ── Cover block ───────────────────────────────────────
    doc.rect(0, 0, doc.page.width, 200).fill(GREEN_DARK);

    doc.fillColor('#FFFFFF')
       .fontSize(11).font('Helvetica-Bold')
       .text('MY CUSTOM AI', 50, 40, { characterSpacing: 2 });

    doc.fontSize(26).font('Helvetica-Bold')
       .text(`Your Custom AI Plan`, 50, 70)
       .text(`for ${data.bizName}`, 50, 102);

    doc.fontSize(13).font('Helvetica')
       .fillColor('rgba(255,255,255,0.8)')
       .text(`${bizTypeLabel}  ·  ${planLabel}`, 50, 140);

    doc.fontSize(10).fillColor('rgba(255,255,255,0.65)')
       .text(`Prepared for ${data.ownerName}  ·  ${today}  ·  Confidential`, 50, 172);

    // ── Content ───────────────────────────────────────────
    doc.moveDown(4);

    const lines = reportContent.split('\n');
    let y = 220;

    for (let line of lines) {
      line = line.trim();
      if (!line) { doc.moveDown(0.4); continue; }

      // Section headers (ALL CAPS lines)
      if (line === line.toUpperCase() && line.length > 3 && !line.startsWith('-')) {
        doc.moveDown(0.8);
        doc.fontSize(13).font('Helvetica-Bold').fillColor(GREEN_MID)
           .text(line, { continued: false });
        doc.moveDown(0.2);
        // Underline
        const lineY = doc.y;
        doc.moveTo(50, lineY).lineTo(doc.page.width - 50, lineY)
           .strokeColor(GREEN_MID).lineWidth(1).stroke();
        doc.moveDown(0.4);
      }
      // Bullet points
      else if (line.startsWith('- ') || line.startsWith('• ')) {
        doc.fontSize(10.5).font('Helvetica').fillColor(TEXT_MID)
           .text(`  • ${line.replace(/^[-•]\s*/, '')}`, { indent: 10 });
      }
      // Sub-headers (e.g. "Week 1-2:", "Month 1:")
      else if (/^(Week|Month|Day|Step)\s/i.test(line) || line.endsWith(':')) {
        doc.moveDown(0.3);
        doc.fontSize(11).font('Helvetica-Bold').fillColor(TEXT_DARK)
           .text(line);
      }
      // Normal paragraph text
      else {
        doc.fontSize(10.5).font('Helvetica').fillColor(TEXT_MID)
           .text(line, { lineGap: 3 });
      }
    }

    // ── Footer ────────────────────────────────────────────
    const footerY = doc.page.height - 60;
    doc.rect(0, footerY, doc.page.width, 60).fill(OFF_WHITE);
    doc.fillColor(TEXT_MID).fontSize(9).font('Helvetica')
       .text('My Custom AI  ·  mycustomai.co  ·  Questions? WhatsApp: +1 (808) 936-4170',
             50, footerY + 22, { align: 'center', width: doc.page.width - 100 });

    doc.end();
  });
}

// ── Send email with PDF attachment ────────────────────────
async function sendReportEmail(data, pdfBuffer) {
  const isProPlan = data.plan === 'pro';

  const upgradeSection = isProPlan
    ? `<div style="background:#e8f0e9;border-left:4px solid #4A7C59;padding:16px;margin:20px 0;border-radius:0 8px 8px 0">
        <strong style="color:#2D5016">Your consultation is included.</strong><br>
        <span style="color:#4a4a4a">Reply to this email or WhatsApp us at +1 (808) 936-4170 to schedule your 1-hour AI strategy session.</span>
       </div>`
    : `<div style="background:#e8f0e9;border-left:4px solid #4A7C59;padding:16px;margin:20px 0;border-radius:0 8px 8px 0">
        <strong style="color:#2D5016">Want hands-on help?</strong><br>
        <span style="color:#4a4a4a">Upgrade to Pro for a 1-hour AI consultation — reply here or WhatsApp us at +1 (808) 936-4170.</span>
       </div>`;

  const emailHtml = `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a">
  <div style="background:linear-gradient(135deg,#2D5016,#4A7C59);padding:32px;color:white;border-radius:8px 8px 0 0">
    <div style="font-size:20px;font-weight:bold">My Custom AI</div>
  </div>
  <div style="padding:32px;background:#f7f4f0;border-radius:0 0 8px 8px">
    <h2 style="color:#2D5016;margin-bottom:16px">Hi ${data.ownerName},</h2>
    <p style="margin-bottom:16px;line-height:1.7">Your custom AI plan for <strong>${data.bizName}</strong> is attached as a PDF.</p>
    <p style="margin-bottom:16px;line-height:1.7">It includes hand-picked AI tools matched to your specific needs, with step-by-step setup guides you can follow at your own pace.</p>
    ${upgradeSection}
    <p style="color:#777;font-size:13px;margin-top:24px">— My Custom AI Team · mycustomai.co</p>
  </div>
</div>`;

  const resend = getResend();
  await resend.emails.send({
    from: 'My Custom AI <reports@mail.mycustomai.co>',
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

// ── Main: generate + send ─────────────────────────────────
async function generateAndSendReport(data) {
  console.log(`[pdf] Generating report for ${data.bizName}...`);
  const content = await generateReportContent(data);
  console.log(`[pdf] Content ready (${content.length} chars)`);
  const pdfBuffer = await buildPDF(data, content);
  console.log(`[pdf] PDF built (${pdfBuffer.length} bytes)`);
  await sendReportEmail(data, pdfBuffer);
  console.log(`[pdf] Delivered to ${data.email}`);
}

module.exports = { generateAndSendReport };
