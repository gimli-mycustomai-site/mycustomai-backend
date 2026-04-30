/**
 * playbook-pdf.js — MyCustomAI
 * Generates the static "Building AI In-House: The Complete Playbook" PDF
 * and emails it to the customer on every purchase (all tiers).
 */

const PDFDocument = require('pdfkit');
const { Resend }  = require('resend');
const { PDFDocument: PDFLib, rgb, degrees } = require('pdf-lib');
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');

const MCA_SQS_URL = process.env.MCA_SQS_QUEUE_URL || 'https://sqs.us-west-2.amazonaws.com/034797416133/mca-pdf-delivery';

async function enqueuePdfDelivery(email, name, product, stripeEventId = '') {
  const sqsClient = new SQSClient({
    region: process.env.AWS_SES_REGION || 'us-west-2',
    credentials: {
      accessKeyId: process.env.AWS_SES_ACCESS_KEY,
      secretAccessKey: process.env.AWS_SES_SECRET_KEY,
    }
  });
  const msg = JSON.stringify({ email, name, product, stripe_event_id: stripeEventId });
  await sqsClient.send(new SendMessageCommand({ QueueUrl: MCA_SQS_URL, MessageBody: msg }));
  console.log(`[MCA-PDF] Enqueued ${product} for ${email}`);
  return true;
}

async function watermarkPDF(pdfBuffer, buyerEmail) {
  try {
    const pdfDoc = await PDFLib.load(pdfBuffer);
    const pages = pdfDoc.getPages();
    const watermarkText = buyerEmail;

    for (const page of pages) {
      const { width, height } = page.getSize();
      const step = 120;
      for (let y = 0; y < height + width; y += step) {
        page.drawText(watermarkText, {
          x: -100,
          y: y,
          size: 11,
          color: rgb(0.6, 0.6, 0.6),
          opacity: 0.18,
          rotate: degrees(45),
        });
      }
    }

    const watermarkedBytes = await pdfDoc.save();
    return Buffer.from(watermarkedBytes);
  } catch (err) {
    console.error('[watermarkPDF] Error:', err.message);
    return pdfBuffer;
  }
}

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

// ── Color palette ─────────────────────────────────────────────
const NAVY      = '#0A0F2C';
const INDIGO    = '#6366F1';
const INDIGO_LT = '#818CF8';
const WHITE     = '#FFFFFF';
const OFF_WHITE = '#F8FAFC';
const TEXT_DARK = '#0F172A';
const TEXT_MID  = '#334155';
const TEXT_SOFT = '#64748B';
const ACCENT    = '#22C55E';

// ── Helper: draw a section header bar ─────────────────────────
function sectionHeader(doc, text) {
  doc.moveDown(0.6);
  const y = doc.y;
  doc.rect(50, y, doc.page.width - 100, 24).fill(INDIGO);
  doc.fillColor(WHITE).fontSize(10.5).font('Helvetica-Bold')
     .text(text.toUpperCase(), 58, y + 6, { characterSpacing: 0.8 });
  doc.moveDown(1.1);
}

// ── Helper: bullet point ──────────────────────────────────────
function bullet(doc, text, indent = 0) {
  doc.fontSize(10).font('Helvetica').fillColor(TEXT_MID)
     .text(`• ${text}`, 50 + indent, doc.y, { lineGap: 3, indent: 10 + indent });
}

// ── Helper: body text ─────────────────────────────────────────
function body(doc, text) {
  doc.fontSize(10).font('Helvetica').fillColor(TEXT_MID)
     .text(text, { lineGap: 4 });
  doc.moveDown(0.3);
}

// ── Helper: bold label + text on same line ────────────────────
function labelText(doc, label, text) {
  doc.fontSize(10).font('Helvetica-Bold').fillColor(TEXT_DARK)
     .text(label + ' ', { continued: true });
  doc.font('Helvetica').fillColor(TEXT_MID)
     .text(text, { lineGap: 3 });
}

// ── Helper: numbered item ─────────────────────────────────────
function numbered(doc, n, text) {
  doc.fontSize(10).font('Helvetica-Bold').fillColor(INDIGO)
     .text(`${n}. `, { continued: true });
  doc.font('Helvetica').fillColor(TEXT_MID)
     .text(text, { lineGap: 3 });
}

// ── Helper: callout box ───────────────────────────────────────
function callout(doc, text, color = INDIGO) {
  doc.moveDown(0.3);
  const y = doc.y;
  const height = 36;
  doc.rect(50, y, doc.page.width - 100, height)
     .fill(`${color}11`);
  doc.rect(50, y, 3, height).fill(color);
  doc.fontSize(9.5).font('Helvetica-Oblique').fillColor(TEXT_DARK)
     .text(text, 62, y + 10, { width: doc.page.width - 120 });
  doc.moveDown(1.2);
}

// ── Helper: table row ─────────────────────────────────────────
function tableRow(doc, col1, col2, col3, isHeader = false) {
  const y = doc.y;
  const font = isHeader ? 'Helvetica-Bold' : 'Helvetica';
  const color = isHeader ? WHITE : TEXT_MID;
  const bg = isHeader ? INDIGO : (doc._tableRowAlt ? '#F1F5F9' : WHITE);
  doc._tableRowAlt = !doc._tableRowAlt;

  doc.rect(50, y, doc.page.width - 100, 18).fill(bg);
  doc.fontSize(8.5).font(font).fillColor(color)
     .text(col1, 54, y + 4, { width: 140, ellipsis: true })
     .text(col2, 200, y + 4, { width: 130, ellipsis: true })
     .text(col3, 335, y + 4, { width: 175, ellipsis: true });
  doc.moveDown(0.9);
}

// ── Helper: pitfall row ───────────────────────────────────────
function pitfallRow(doc, pitfall, solution) {
  const y = doc.y;
  doc.rect(50, y, doc.page.width - 100, 28).fill('#FFF7ED');
  doc.rect(50, y, 3, 28).fill('#F97316');
  doc.fontSize(9).font('Helvetica-Bold').fillColor('#C2410C')
     .text(pitfall, 62, y + 4, { width: 200 });
  doc.fontSize(9).font('Helvetica').fillColor(TEXT_MID)
     .text(solution, 270, y + 4, { width: doc.page.width - 330 });
  doc.moveDown(1.4);
}

// ── Build the playbook PDF ────────────────────────────────────
async function buildPlaybookPDF(customerName) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 50, autoFirstPage: false });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end',  () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    // ══════════════════════════════════════════════════════════
    // COVER PAGE
    // ══════════════════════════════════════════════════════════
    doc.addPage();
    doc.rect(0, 0, doc.page.width, doc.page.height).fill(NAVY);

    // Top accent bar
    doc.rect(0, 0, doc.page.width, 6).fill(INDIGO);

    // Brand
    doc.fillColor(INDIGO_LT).fontSize(11).font('Helvetica-Bold')
       .text('MYCUSTOMAI.CO', 50, 60, { characterSpacing: 2 });

    // Title
    doc.fillColor(WHITE).fontSize(32).font('Helvetica-Bold')
       .text('Building AI In-House:', 50, 110)
       .text('The Complete Playbook', 50, 150);

    // Subtitle
    doc.fillColor(INDIGO_LT).fontSize(13).font('Helvetica')
       .text('How to Build, Run & Maintain Powerful AI Systems\\nWithout Keeping Experts on Retainer', 50, 205);

    // Divider
    doc.rect(50, 250, 80, 2).fill(INDIGO);

    // Version + recipient
    doc.fillColor(TEXT_SOFT).fontSize(10).font('Helvetica')
       .text('Version 4.0  ·  2026 Edition', 50, 270);
    if (customerName) {
      doc.fillColor(WHITE).fontSize(10)
         .text(`Prepared for: ${customerName}`, 50, 290)
         .text(`Date: ${today}`, 50, 306);
    }

    // Table of contents preview
    doc.fillColor(INDIGO_LT).fontSize(10).font('Helvetica-Bold')
       .text('CONTENTS', 50, 360);
    const toc = [
      '1. Executive Summary & The Reality Check',
      '2. How AI Actually Works in Business',
      '3. Mastering Effective Interaction with AI – The #1 Skill',
      '4. Critical Thinking & Debugging When AI Breaks',
      '5. Building Reliable AI Agents That Don\'t Hallucinate',
      '6. AI Tool Selection Guide – Best Tool for Each Job',
      '7. Open-Source Agent Deep Dive: Real Examples & Cost Strategy',
      '8. Common Pitfalls & How to Avoid Them',
      '9. Maintenance, Updates & Future-Proofing',
      '10. 30-Day Implementation Roadmap & Templates',
      '11. Measuring Success & Scaling',
      'Appendix: Prompt Library, Checklists & Resources',
    ];
    let tocY = 382;
    toc.forEach(item => {
      doc.fillColor(TEXT_SOFT).fontSize(8.5).font('Helvetica').text(item, 50, tocY);
      tocY += 14;
    });

    // Bottom bar
    doc.rect(0, doc.page.height - 50, doc.page.width, 50).fill('#0D1235');
    doc.fillColor(TEXT_SOFT).fontSize(8.5).font('Helvetica')
       .text('mycustomai.co  ·  Own the Logic. Own the Asset.  ·  Confidential — For Client Use Only',
             50, doc.page.height - 30, { align: 'center', width: doc.page.width - 100 });

    // ══════════════════════════════════════════════════════════
    // PAGE 2 — Section 1 & 2
    // ══════════════════════════════════════════════════════════
    doc.addPage({ background: OFF_WHITE });
    doc.rect(0, 0, doc.page.width, 6).fill(INDIGO);

    // Page header
    doc.fillColor(NAVY).fontSize(22).font('Helvetica-Bold')
       .text('Part 1: Foundation', 50, 30);
    doc.moveDown(0.5);

    sectionHeader(doc, '1. Executive Summary & The Reality Check');

    body(doc, 'AI moves extremely fast. Companies that master it will outpace competitors. Poorly managed AI creates wasted time, hallucinations, and rising costs.');

    doc.moveDown(0.3);
    doc.fontSize(11).font('Helvetica-Bold').fillColor(TEXT_DARK).text('2026 Key Truths:');
    doc.moveDown(0.2);
    bullet(doc, 'AI amplifies human judgment — it does not replace it.');
    bullet(doc, 'No technical experts needed on retainer if you follow structured processes.');
    bullet(doc, 'Starting now builds in-house capability before API costs skyrocket due to data-center energy constraints.');
    bullet(doc, 'Patience + structured interaction + open-source stacks = dramatic, sustainable results.');

    callout(doc, 'Goal: Give your team a self-contained system to build and run reliable AI agents independently.');

    sectionHeader(doc, '2. How AI Actually Works in Business (Capabilities vs Limitations)');

    doc.fontSize(10.5).font('Helvetica-Bold').fillColor(ACCENT).text('Excels At:');
    doc.moveDown(0.2);
    ['Research, drafting, data filtering at scale',
     'Repetitive automation, iteration, pattern spotting'].forEach(t => bullet(doc, t));

    doc.moveDown(0.3);
    doc.fontSize(10.5).font('Helvetica-Bold').fillColor('#EF4444').text('Cannot Do Well:');
    doc.moveDown(0.2);
    ['True critical/strategic thinking, novel creative problem-solving',
     'Understanding your unique context without explicit guidance',
     'Consistent accuracy without verification'].forEach(t => bullet(doc, t));

    doc.moveDown(0.3);
    body(doc, 'Real-World Example: Grok suggested manual LinkedIn profile reviews. The winning approach: batch profiles + strict parameters (human strategy + AI scale execution).');

    callout(doc, 'Rule: Keep critical thinking and final decisions human.', '#EF4444');

    // Page footer
    doc.fontSize(8).fillColor(TEXT_SOFT).font('Helvetica')
       .text('mycustomai.co  ·  Building AI In-House: The Complete Playbook', 50, doc.page.height - 30, { align: 'center', width: doc.page.width - 100 });

    // ══════════════════════════════════════════════════════════
    // PAGE 3 — Section 3
    // ══════════════════════════════════════════════════════════
    doc.addPage({ background: OFF_WHITE });
    doc.rect(0, 0, doc.page.width, 6).fill(INDIGO);
    doc.fillColor(NAVY).fontSize(22).font('Helvetica-Bold').text('Part 2: Mastering AI Interaction', 50, 30);
    doc.moveDown(0.5);

    sectionHeader(doc, '3. Mastering Effective Interaction with AI – The #1 Skill');

    doc.moveDown(0.3);
    doc.fontSize(11).font('Helvetica-Bold').fillColor(TEXT_DARK).text('Core Rule — The No-Assumption Protocol');
    doc.moveDown(0.2);

    // Protocol callout box
    doc.moveDown(0.2);
    const pY = doc.y;
    doc.rect(50, pY, doc.page.width - 100, 52).fill('#EEF2FF');
    doc.rect(50, pY, 4, 52).fill(INDIGO);
    doc.fontSize(9.5).font('Helvetica-Oblique').fillColor(TEXT_DARK)
       .text('"You are strictly forbidden from making any assumptions. If anything is unclear, ask specific clarifying questions until you have the complete picture. Never guess."',
             62, pY + 8, { width: doc.page.width - 124 });
    doc.moveDown(2.8);

    doc.fontSize(11).font('Helvetica-Bold').fillColor(TEXT_DARK).text('Proven Interaction Framework (use every time):');
    doc.moveDown(0.3);
    [
      ['1. Role + Goal', '— Assign a clear role and objective.'],
      ['2. Full Context & Constraints', '— Provide all relevant background and success criteria.'],
      ['3. Examples (few-shot)', '— Give 1–2 examples of desired output.'],
      ['4. "Think step by step. Show reasoning."', '— Force explicit reasoning before answers.'],
      ['5. Exact Output Format', '— Specify format (tables, JSON, bullet points, etc.).'],
      ['6. "Self-check for assumptions before finalizing."', '— Built-in verification step.'],
    ].forEach(([label, text]) => labelText(doc, label, text));

    doc.moveDown(0.5);
    doc.fontSize(11).font('Helvetica-Bold').fillColor(TEXT_DARK).text('Advanced Techniques:');
    doc.moveDown(0.2);
    bullet(doc, 'Iterative refinement: "Improve this by making it more [specific quality]. Here is what was missing…"');
    bullet(doc, 'Cross-model checking: "Review this output from Grok + Claude and suggest improvements."');
    bullet(doc, 'Low temperature for facts, higher for creativity in advanced setups.');

    callout(doc, 'How to Think: Treat AI like a fast, overconfident junior who sometimes hallucinates. You handle strategy; AI handles execution.');

    doc.fontSize(8).fillColor(TEXT_SOFT).font('Helvetica')
       .text('mycustomai.co  ·  Building AI In-House: The Complete Playbook', 50, doc.page.height - 30, { align: 'center', width: doc.page.width - 100 });

    // ══════════════════════════════════════════════════════════
    // PAGE 4 — Section 4 & 5
    // ══════════════════════════════════════════════════════════
    doc.addPage({ background: OFF_WHITE });
    doc.rect(0, 0, doc.page.width, 6).fill(INDIGO);
    doc.fillColor(NAVY).fontSize(22).font('Helvetica-Bold').text('Part 3: Debugging & Building Agents', 50, 30);
    doc.moveDown(0.5);

    sectionHeader(doc, '4. Critical Thinking & Debugging When AI Breaks or Underperforms');

    doc.fontSize(11).font('Helvetica-Bold').fillColor(TEXT_DARK).text('4-Step Debugging Method:');
    doc.moveDown(0.3);

    [
      ['1. Reproduce Exactly', 'Capture prompt, inputs, outputs, logs.'],
      ['2. Diagnose Root Cause', 'Ask AI: "Analyze why this failed. What assumptions? Where did reasoning break?"'],
      ['3. Fix Minimally', '"Propose the smallest safe change. Show before/after + root-cause explanation."'],
      ['4. Verify Rigorously', 'Run 3–5 test cases. Confirm it works in all scenarios.'],
    ].forEach(([label, text]) => {
      doc.moveDown(0.2);
      labelText(doc, label, text);
    });

    doc.moveDown(0.4);
    doc.fontSize(11).font('Helvetica-Bold').fillColor(TEXT_DARK).text('Copy-Paste Debugging Prompts:');
    doc.moveDown(0.2);
    bullet(doc, '"List every assumption you are making."');
    bullet(doc, '"This output is incorrect because [exact issue]. Fix completely and explain the cause."');
    bullet(doc, '"Act as senior QA: find every flaw, edge case, hallucination risk."');

    callout(doc, 'Mindset: Expect 3–7 iterations. Document lessons in a shared "AI Knowledge Base."');

    sectionHeader(doc, '5. Building Reliable AI Agents That Don\'t Hallucinate');

    doc.fontSize(11).font('Helvetica-Bold').fillColor(TEXT_DARK).text('Mandatory Workflow:');
    doc.moveDown(0.3);
    [
      'Primer Phase: "Research this topic thoroughly. Become an expert. List all common bugs, problems, best practices."',
      'Embed No-Assumption Protocol.',
      'Build small → Test → Feed back failures → Repeat until clean.',
      'Document + schedule monthly updates (use Grok for latest info).',
    ].forEach(t => bullet(doc, t));

    doc.fontSize(8).fillColor(TEXT_SOFT).font('Helvetica')
       .text('mycustomai.co  ·  Building AI In-House: The Complete Playbook', 50, doc.page.height - 30, { align: 'center', width: doc.page.width - 100 });

    // ══════════════════════════════════════════════════════════
    // PAGE 5 — Section 6 & 7 (Tool Selection + Open Source)
    // ══════════════════════════════════════════════════════════
    doc.addPage({ background: OFF_WHITE });
    doc.rect(0, 0, doc.page.width, 6).fill(INDIGO);
    doc.fillColor(NAVY).fontSize(22).font('Helvetica-Bold').text('Part 4: Tools & Open-Source Strategy', 50, 30);
    doc.moveDown(0.5);

    sectionHeader(doc, '6. AI Tool Selection Guide – Best Tool for Each Job (2026)');

    doc.fontSize(11).font('Helvetica-Bold').fillColor(TEXT_DARK).text('Model Strengths:');
    doc.moveDown(0.3);
    bullet(doc, 'Claude (Sonnet/Opus): Best for coding, debugging, complex reasoning, professional writing.');
    bullet(doc, 'Grok: Best for real-time social/X data, trends, rapid prototyping, speed.');

    doc.moveDown(0.5);
    callout(doc, 'Strategy: Route tasks to the model with the right strengths and combine them.');

    sectionHeader(doc, '7. Open-Source Agent Deep Dive: Real Examples & Cost Strategy');

    doc.fontSize(11).font('Helvetica-Bold').fillColor(TEXT_DARK).text('Best Open-Source Combos (2026):');
    doc.moveDown(0.3);
    bullet(doc, 'OpenClaw + Ollama + Qwen: Messaging gateway to agents. One-command setup.');
    bullet(doc, 'Hermes Agent + Ollama + Qwen 3.5/3.6: Self-improving agent with 70+ skills, persistent memory.');
    bullet(doc, 'Hybrid Stack: OpenClaw (messaging) + Hermes (brain) + local Qwen via Ollama.');

    doc.moveDown(0.4);
    doc.fontSize(11).font('Helvetica-Bold').fillColor(TEXT_DARK).text('Why Build In-House:');
    doc.moveDown(0.2);
    body(doc, 'Data-center electricity use (~415 TWh in 2024) projected to double+ by 2030. Cloud API prices will climb sharply. Building in-house now locks in low costs.');

    doc.moveDown(0.4);
    doc.fontSize(11).font('Helvetica-Bold').fillColor(TEXT_DARK).text('High-Impact Use Cases (Real 2026 Data):');
    doc.moveDown(0.3);
    bullet(doc, '24/7 Customer Service: Replaces Intercom/Zendesk ($2k-9k/mo) → $20-80/mo (90-95% savings)');
    bullet(doc, 'Lead Generation: Replaces Apollo/Clay ($500-2k/mo) → $10-60/mo (85-95% savings)');
    bullet(doc, 'Email Triage: Replaces Superhuman/VA ($300-1.5k/mo) → $0-30/mo (85-100% savings)');
    bullet(doc, 'Social Media Automation: Replaces Buffer + writer ($200-1k/mo) → $0-50/mo (90%+ savings)');

    callout(doc, 'Bottom Line: Most users report $300–$5,000+ monthly savings once first 2–3 agents are live.');

    doc.fontSize(8).fillColor(TEXT_SOFT).font('Helvetica')
       .text('mycustomai.co  ·  Building AI In-House: The Complete Playbook', 50, doc.page.height - 30, { align: 'center', width: doc.page.width - 100 });

    // ══════════════════════════════════════════════════════════
    // PAGE 6 — Sections 8, 9, 10, 11 + Appendix
    // ══════════════════════════════════════════════════════════
    doc.addPage({ background: OFF_WHITE });
    doc.rect(0, 0, doc.page.width, 6).fill(INDIGO);
    doc.fillColor(NAVY).fontSize(22).font('Helvetica-Bold').text('Part 5: Implementation & Scaling', 50, 30);
    doc.moveDown(0.5);

    sectionHeader(doc, '8. Common Pitfalls & How to Avoid Them');
    [
      ['Hallucinations & confident falsehoods', 'No-Assumption Protocol + verification layers'],
      ['Assumptions baked into agents', 'Embed protocol + run Primer Phase first'],
      ['Over-reliance on one model', 'Multi-model routing + cross-check outputs'],
      ['Expecting perfection first try', 'Plan for 3–7 iteration cycles'],
      ['Ignoring maintenance', 'Schedule monthly updates — AI evolves fast'],
    ].forEach(([p, s]) => pitfallRow(doc, p, s));

    sectionHeader(doc, '9. Maintenance, Updates & Future-Proofing');
    bullet(doc, 'Schedule monthly "Update Sessions" using Grok for latest developments.');
    bullet(doc, 'Build a central AI knowledge base — document every lesson learned.');
    bullet(doc, 'Start in-house now — when costs rise, you\'ll already have systems and skills.');

    sectionHeader(doc, '10. 30-Day Implementation Roadmap');
    doc.moveDown(0.2);
    [
      ['Week 1:', 'Train team on interaction + No-Assumption Protocol.'],
      ['Week 2:', 'Install OpenClaw + Hermes via Ollama + first Qwen model. Build 2 agents.'],
      ['Week 3:', 'Test, debug, document.'],
      ['Week 4:', 'Deploy, measure, expand.'],
    ].forEach(([label, text]) => labelText(doc, label, text));

    doc.moveDown(0.4);
    doc.fontSize(10.5).font('Helvetica-Bold').fillColor(TEXT_DARK).text('Templates:');
    doc.moveDown(0.2);
    ['Agent Creation Template', 'Primer Prompt', 'No-Assumption System Prompt',
     'Debugging Prompts', 'Maintenance Checklist', 'ROI Tracking Sheet']
      .forEach(t => bullet(doc, t));

    sectionHeader(doc, '11. Measuring Success & Scaling');
    doc.fontSize(10.5).font('Helvetica-Bold').fillColor(TEXT_DARK).text('Key Metrics:');
    doc.moveDown(0.2);
    ['Time saved per task', 'Cost reduction vs. previous method', 'Accuracy after review',
     'Agents deployed', 'Team confidence score (monthly survey)'].forEach(t => bullet(doc, t));

    doc.moveDown(0.4);
    callout(doc, 'Scaling Path: Start small → Core agents → Full in-house AI operating system.');

    sectionHeader(doc, 'Appendix: Prompt Library');

    doc.fontSize(10.5).font('Helvetica-Bold').fillColor(TEXT_DARK).text('No-Assumption Protocol (paste into every agent):');
    doc.moveDown(0.2);
    const aY = doc.y;
    doc.rect(50, aY, doc.page.width - 100, 36).fill('#EEF2FF');
    doc.rect(50, aY, 4, 36).fill(INDIGO);
    doc.fontSize(8.5).font('Courier').fillColor(TEXT_DARK)
       .text('"You are strictly forbidden from making assumptions. If unclear, ask specific questions until complete picture. Never guess."',
             62, aY + 7, { width: doc.page.width - 124 });
    doc.moveDown(2.2);

    doc.fontSize(10.5).font('Helvetica-Bold').fillColor(TEXT_DARK).text('Primer Phase Prompt:');
    doc.moveDown(0.2);
    const bY = doc.y;
    doc.rect(50, bY, doc.page.width - 100, 30).fill('#F0FDF4');
    doc.rect(50, bY, 4, 30).fill(ACCENT);
    doc.fontSize(8.5).font('Courier').fillColor(TEXT_DARK)
       .text('"Research this topic thoroughly. Become an expert. List all common bugs, problems, best practices."',
             62, bY + 7, { width: doc.page.width - 124 });
    doc.moveDown(1.8);

    doc.fontSize(8).fillColor(TEXT_SOFT).font('Helvetica')
       .text('mycustomai.co  ·  Building AI In-House: The Complete Playbook', 50, doc.page.height - 30, { align: 'center', width: doc.page.width - 100 });

    // ══════════════════════════════════════════════════════════
    // FINAL PAGE — Encouragement + contact
    // ══════════════════════════════════════════════════════════
    doc.addPage();
    doc.rect(0, 0, doc.page.width, doc.page.height).fill(NAVY);
    doc.rect(0, 0, doc.page.width, 6).fill(INDIGO);

    doc.fillColor(WHITE).fontSize(26).font('Helvetica-Bold')
       .text('You Now Have Everything', 50, 120)
       .text('You Need.', 50, 158);

    doc.fillColor(INDIGO_LT).fontSize(13).font('Helvetica')
       .text('Your AI will make mistakes — sometimes repeatedly.\\nStay persistent with iteration and the debugging process.', 50, 210);

    doc.moveDown(0.8);
    doc.fillColor(TEXT_SOFT).fontSize(11).font('Helvetica')
       .text('Teams that treat AI like a muscle (consistent training + open-source ownership) create massive, sustainable advantage — and huge cost savings.', 50, doc.y, { width: doc.page.width - 100, lineGap: 5 });

    doc.moveDown(1.2);
    doc.fillColor(INDIGO_LT).fontSize(12).font('Helvetica')
       .text('You now have everything to build powerful, private, low-cost AI capability completely in-house — before the energy-driven price surge hits everyone else.', 50, doc.y, { width: doc.page.width - 100, lineGap: 5 });

    doc.moveDown(1.5);
    doc.fillColor(WHITE).fontSize(12).font('Helvetica-Bold').text('Questions or need help?');
    doc.fillColor(INDIGO_LT).fontSize(11).font('Helvetica')
       .text('mycustomai.co  ·  WhatsApp: +1 (808) 936-4170');

    doc.rect(0, doc.page.height - 50, doc.page.width, 50).fill('#0D1235');
    doc.fillColor(TEXT_SOFT).fontSize(8.5).font('Helvetica')
       .text('© 2026 MyCustomAI  ·  mycustomai.co  ·  Own the Logic. Own the Asset.  ·  Confidential — For Client Use Only',
             50, doc.page.height - 30, { align: 'center', width: doc.page.width - 100 });

    doc.end();
  });
}

// ── Send playbook email ───────────────────────────────────────
async function sendPlaybookEmail(customerEmail, customerName, stripeEventId = '') {
  const ok = await enqueuePdfDelivery(customerEmail, customerName, 'package-1', stripeEventId);
  return { success: ok, queued: true };
}


// ── Send Package 2 (Notion AI OS) email ──────────────────────────
async function sendPackage2PDF(customerEmail, customerName, stripeEventId = '') {
  const ok = await enqueuePdfDelivery(customerEmail, customerName, 'package-2', stripeEventId);
  return { success: ok, queued: true };
}

// ── Send Package 3 (Agent Starter Kit) email ─────────────────────────
async function sendPackage3PDF(customerEmail, customerName, stripeEventId = '') {
  const ok = await enqueuePdfDelivery(customerEmail, customerName, 'package-3', stripeEventId);
  return { success: ok, queued: true };
}

// ── Send Package 4 (Industry-Specific AI Playbook Editions) email ────────────
async function sendPackage4PDF(customerEmail, customerName, stripeEventId = '') {
  const ok = await enqueuePdfDelivery(customerEmail, customerName, 'package-4', stripeEventId);
  return { success: ok, queued: true };
}

// ── Send Package 5 (Prompt & SOP Mastery Library) email ──────────────────────
async function sendPackage5PDF(customerEmail, customerName, stripeEventId = '') {
  const ok = await enqueuePdfDelivery(customerEmail, customerName, 'package-5', stripeEventId);
  return { success: ok, queued: true };
}

// ── Send Package 6 (Monthly AI Update & Agent Self-Maintenance Infrastructure) email ──
async function sendPackage6PDF(customerEmail, customerName, stripeEventId = '') {
  const ok = await enqueuePdfDelivery(customerEmail, customerName, 'package-6', stripeEventId);
  return { success: ok, queued: true };
}

module.exports = { sendPlaybookEmail, buildPlaybookPDF, sendPackage2PDF, sendPackage3PDF, sendPackage4PDF, sendPackage5PDF, sendPackage6PDF };

async function sendPackage7PDF(customerEmail, customerName, stripeEventId = '') {
  const ok = await enqueuePdfDelivery(customerEmail, customerName, 'package-7', stripeEventId);
  return { success: ok, queued: true };
}
module.exports = Object.assign(module.exports || {}, { sendPackage7PDF });

async function sendPackage8PDF(customerEmail, customerName, stripeEventId = '') {
  const ok = await enqueuePdfDelivery(customerEmail, customerName, 'package-8', stripeEventId);
  return { success: ok, queued: true };
}
module.exports = Object.assign(module.exports || {}, { sendPackage8PDF });


async function sendPackage9PDF(customerEmail, customerName, stripeEventId = '') {
  const ok = await enqueuePdfDelivery(customerEmail, customerName, 'package-9', stripeEventId);
  return { success: ok, queued: true };
}
module.exports = Object.assign(module.exports || {}, { sendPackage9PDF });