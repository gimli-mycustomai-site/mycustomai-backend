/**
 * playbook-pdf.js — MyCustomAI
 * Generates the static "Building AI In-House: The Complete Playbook" PDF
 * and emails it to the customer on every purchase (all tiers).
 */

const PDFDocument = require('pdfkit');
const { Resend }  = require('resend');

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
       .text('How to Build, Run & Maintain Powerful AI Systems\nWithout Keeping Experts on Retainer', 50, 205);

    // Divider
    doc.rect(50, 250, 80, 2).fill(INDIGO);

    // Version + recipient
    doc.fillColor(TEXT_SOFT).fontSize(10).font('Helvetica')
       .text('Version 2.0  ·  2026 Edition', 50, 270);
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
      '3. Mastering Effective Interaction with AI',
      '4. Critical Thinking & Debugging When AI Fails',
      '5. Building Reliable AI Agents That Don\'t Hallucinate',
      '6. AI Tool Selection Guide – Best Tool for Each Job',
      '7. Common Pitfalls & How to Avoid Them',
      '8. Maintenance, Updates & Future-Proofing',
      '9. 30-Day Implementation Roadmap & Templates',
      '10. Measuring Success & Scaling',
      'Appendix: Prompt Library, Checklists & Resources',
    ];
    let tocY = 382;
    toc.forEach(item => {
      doc.fillColor(TEXT_SOFT).fontSize(9).font('Helvetica').text(item, 50, tocY);
      tocY += 16;
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

    body(doc, 'AI moves extremely fast. Companies that master it will outpace competitors in speed, cost, and output. However, unmanaged AI creates more problems than solutions: wasted time, bad decisions, hallucinations, security risks, and frustrated teams.');

    doc.moveDown(0.3);
    doc.fontSize(11).font('Helvetica-Bold').fillColor(TEXT_DARK).text('Key Truths (2026 Reality):');
    doc.moveDown(0.2);
    bullet(doc, 'AI is a powerful amplifier — not a replacement for human judgment.');
    bullet(doc, 'You do not need technical experts on retainer, but you must learn structured interaction and debugging.');
    bullet(doc, 'Starting now builds in-house capability before API costs skyrocket.');
    bullet(doc, 'Open-source and agent frameworks are powerful but require regular maintenance and persistence.');
    bullet(doc, 'Patience + structured processes = dramatic results.');

    callout(doc, 'Goal of this Playbook: Give your team a complete, self-contained system to build, run, and maintain AI agents independently.');

    sectionHeader(doc, '2. How AI Actually Works in Business (Capabilities vs Limitations)');

    doc.fontSize(10.5).font('Helvetica-Bold').fillColor(ACCENT).text('What AI Excels At (2026):');
    doc.moveDown(0.2);
    ['Research, data synthesis, and filtering at scale',
     'Drafting content, code, emails, plans',
     'Repetitive tasks, automation, and iteration',
     'Bug fixing and refinement (with guidance)',
     'Pattern spotting and rapid brainstorming'].forEach(t => bullet(doc, t));

    doc.moveDown(0.4);
    doc.fontSize(10.5).font('Helvetica-Bold').fillColor('#EF4444').text('What AI Still Cannot Do Well:');
    doc.moveDown(0.2);
    ['True critical/strategic thinking in novel situations',
     'Understanding your unique business context without explicit guidance',
     'Consistent accuracy without verification layers',
     'Long-term judgment or ethical nuance in ambiguous scenarios'].forEach(t => bullet(doc, t));

    doc.moveDown(0.5);
    callout(doc, 'Rule: Always keep critical thinking, final decisions, and high-stakes judgment on the human side.', '#EF4444');

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

    body(doc, 'This single skill determines 80% of your success with AI. Most failures come not from bad tools, but from how people interact with them.');

    doc.moveDown(0.3);
    doc.fontSize(11).font('Helvetica-Bold').fillColor(TEXT_DARK).text('Core Rule — The No-Assumption Protocol');
    doc.moveDown(0.2);
    body(doc, 'Embed this verbatim in every agent and prompt:');

    // Protocol callout box
    doc.moveDown(0.2);
    const pY = doc.y;
    doc.rect(50, pY, doc.page.width - 100, 52).fill('#EEF2FF');
    doc.rect(50, pY, 4, 52).fill(INDIGO);
    doc.fontSize(9.5).font('Helvetica-Oblique').fillColor(TEXT_DARK)
       .text('"You are strictly forbidden from making any assumptions. If anything is unclear, missing, or ambiguous, ask specific clarifying questions until you have the complete picture. Never guess, infer, or proceed with incomplete information. Confirm understanding before acting."',
             62, pY + 8, { width: doc.page.width - 124 });
    doc.moveDown(2.8);

    doc.fontSize(11).font('Helvetica-Bold').fillColor(TEXT_DARK).text('Proven Interaction Framework (Use Every Time):');
    doc.moveDown(0.3);
    [
      ['1. Role + Goal', '— Assign a clear role and objective.'],
      ['2. Full Context', '— Provide all relevant background, constraints, and success criteria.'],
      ['3. Examples', '— Give 1–2 examples of desired output (few-shot prompting).'],
      ['4. Step-by-Step Thinking', '— Instruct: "Think step by step. Show your reasoning before the final answer."'],
      ['5. Output Format', '— Specify exact format (tables, JSON, bullet points, etc.).'],
      ['6. Verification', '— End with: "Before finalizing, self-check for assumptions, accuracy, and completeness."'],
    ].forEach(([label, text]) => labelText(doc, label, text));

    doc.moveDown(0.5);
    doc.fontSize(11).font('Helvetica-Bold').fillColor(TEXT_DARK).text('Advanced Techniques:');
    doc.moveDown(0.2);
    bullet(doc, 'Iterative refinement: "Improve this by making it more [specific quality]. Here is what was missing…"');
    bullet(doc, 'Cross-model checking: "Review this output from Claude/Grok and suggest improvements."');
    bullet(doc, 'Temperature control: Use lower temperature (0.0–0.3) for factual/critical tasks in advanced setups.');

    callout(doc, 'How to Think When Using AI: Treat every AI like an extremely fast, overconfident junior employee who sometimes hallucinates facts. Your job = Strategy + Quality Control. AI\'s job = Fast execution + Research.');

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

    body(doc, 'This is the missing skill most people lack. When an agent hallucinates, loops, forgets context, or produces wrong output — use this systematic framework.');

    doc.fontSize(11).font('Helvetica-Bold').fillColor(TEXT_DARK).text('The 4-Step Debugging Method:');
    doc.moveDown(0.3);

    [
      ['1. Reproduce Exactly', 'Capture: exact prompt, input data, expected output, actual output, and error logs.'],
      ['2. Diagnose Root Cause', 'Prompt the AI: "Analyze step-by-step why this failed. What assumptions did you make? Where did the reasoning break?"'],
      ['3. Fix with Minimal Change', '"Propose the smallest, safest change that fixes this. Show before/after. Explain root cause."'],
      ['4. Verify Rigorously', '"Run 3–5 test cases. Self-check against requirements. Confirm it works in all scenarios."'],
    ].forEach(([label, text]) => {
      doc.moveDown(0.2);
      labelText(doc, label, text);
    });

    doc.moveDown(0.4);
    doc.fontSize(11).font('Helvetica-Bold').fillColor(TEXT_DARK).text('Powerful Debugging Prompts (Copy-Paste Ready):');
    doc.moveDown(0.2);
    bullet(doc, '"List every assumption you are making before answering."');
    bullet(doc, '"This output is incorrect because [explain exactly]. Fix it completely and explain the exact cause."');
    bullet(doc, '"Act as a senior QA engineer. Find every possible flaw, edge case, or hallucination risk in this output."');
    bullet(doc, '"Reproduce the error, then debug it like a senior developer would."');

    callout(doc, 'Expect multiple rounds — 3–7+ iterations are normal. Document recurring issues in a shared "AI Lessons Learned" knowledge base. Use Claude for deep analysis, Grok for quick cross-checks.');

    sectionHeader(doc, '5. Building Reliable AI Agents That Don\'t Hallucinate');

    doc.fontSize(11).font('Helvetica-Bold').fillColor(TEXT_DARK).text('Mandatory Agent Creation Workflow:');
    doc.moveDown(0.3);
    [
      '1. Primer Phase (Never skip) — "Research this topic thoroughly. List all common bugs, problems, and failure modes for [specific task]."',
      '2. Embed the No-Assumption Protocol from Section 3.',
      '3. Build Iteratively — Start small → Test → Feed back failures → Repeat.',
      '4. Rigorous Testing — Run multiple test cases using the debugging method until clean every time.',
      '5. Document & Maintain — Create a one-page instruction sheet + schedule monthly updates.',
    ].forEach(t => bullet(doc, t));

    callout(doc, 'Pro Tip: Use Grok + recent YouTube/content for rapid updates on new AI developments before each major build.');

    doc.fontSize(8).fillColor(TEXT_SOFT).font('Helvetica')
       .text('mycustomai.co  ·  Building AI In-House: The Complete Playbook', 50, doc.page.height - 30, { align: 'center', width: doc.page.width - 100 });

    // ══════════════════════════════════════════════════════════
    // PAGE 5 — Section 6 (Tool Selection)
    // ══════════════════════════════════════════════════════════
    doc.addPage({ background: OFF_WHITE });
    doc.rect(0, 0, doc.page.width, 6).fill(INDIGO);
    doc.fillColor(NAVY).fontSize(22).font('Helvetica-Bold').text('Part 4: Tools & Pitfalls', 50, 30);
    doc.moveDown(0.5);

    sectionHeader(doc, '6. AI Tool Selection Guide – Best Tool for Each Job (2026)');

    doc.fontSize(11).font('Helvetica-Bold').fillColor(TEXT_DARK).text('Model Strengths:');
    doc.moveDown(0.3);
    bullet(doc, 'Claude (Sonnet 4.x / Opus 4.x): Best for coding, debugging, complex reasoning, long-form structured work, professional writing, and careful analysis.');
    bullet(doc, 'Grok: Best for real-time information, social media trends, X/Twitter data, current events, rapid prototyping, brainstorming, and speed.');

    doc.moveDown(0.5);
    doc._tableRowAlt = false;
    tableRow(doc, 'Use Case', 'Best Tool(s)', 'Why It Wins', true);
    [
      ['Coding & Debugging',         'Claude',                    'Superior architecture, edge-case handling, long-horizon reasoning'],
      ['Real-time Research',         'Grok',                      'Native X integration & live social data'],
      ['Social Media / Leads',       'Grok',                      'Unmatched real-time social intelligence'],
      ['Email & Copywriting',        'Claude + Omnisend/HubSpot', 'High-quality writing + execution'],
      ['Accounting & Bookkeeping',   'QuickBooks AI / Zoho Zia',  'Specialized financial logic & compliance'],
      ['Scheduling Automation',      'Motion, Reclaim.ai, Lindy', 'Intelligent time-blocking & calendar AI'],
      ['Podcast / Audio Production', 'Claude + Descript/Castmagic', 'Scripting + editing pipeline'],
      ['Lead Generation',            'Grok + Apollo.io / Clay',   'Data + execution'],
      ['Workflow Automation',        'Zapier/Make + Claude/Grok', 'Orchestration layer'],
      ['Data Analysis',              'Claude or Grok + Code',     'Strong reasoning + execution'],
    ].forEach(([a, b, c]) => tableRow(doc, a, b, c));

    callout(doc, 'Strategy: Never force one tool to do everything. Route tasks to the model with the right strengths and combine them.');

    sectionHeader(doc, '7. Common Pitfalls & How to Avoid Them');

    doc._tableRowAlt = false;
    [
      ['Hallucinations & confident falsehoods', 'No-Assumption Protocol + verification layers on every output'],
      ['Assumptions baked into agents',         'Embed the protocol + always run the Primer Phase first'],
      ['Over-reliance on one model',            'Multi-model routing + cross-check critical outputs'],
      ['Expecting perfection first try',        'Plan for 3–7 iteration cycles — this is normal'],
      ['Ignoring maintenance',                  'Schedule monthly "Update Sessions" — AI tools evolve fast'],
      ['Context degradation / loops',           'Use the 4-step debugging method + implement persistent memory'],
    ].forEach(([p, s]) => pitfallRow(doc, p, s));

    doc.fontSize(8).fillColor(TEXT_SOFT).font('Helvetica')
       .text('mycustomai.co  ·  Building AI In-House: The Complete Playbook', 50, doc.page.height - 30, { align: 'center', width: doc.page.width - 100 });

    // ══════════════════════════════════════════════════════════
    // PAGE 6 — Sections 8, 9, 10 + Appendix
    // ══════════════════════════════════════════════════════════
    doc.addPage({ background: OFF_WHITE });
    doc.rect(0, 0, doc.page.width, 6).fill(INDIGO);
    doc.fillColor(NAVY).fontSize(22).font('Helvetica-Bold').text('Part 5: Roadmap, Scaling & Appendix', 50, 30);
    doc.moveDown(0.5);

    sectionHeader(doc, '8. Maintenance, Updates & Future-Proofing');
    bullet(doc, 'Open-source agents are powerful but need regular maintenance and feeding with new information.');
    bullet(doc, 'Schedule monthly "Update Sessions" using Grok for latest developments.');
    bullet(doc, 'Build a central company AI knowledge base — document every lesson learned.');
    bullet(doc, 'Start in-house now — when costs rise, you\'ll already have the systems and the skills.');

    sectionHeader(doc, '9. 30-Day Implementation Roadmap');
    doc.moveDown(0.2);
    [
      ['Week 1:', 'Team training on interaction + No-Assumption Protocol. Everyone reads Sections 3 and 4.'],
      ['Week 2:', 'Build first 2 agents using the Primer Phase + Iterative method from Section 5.'],
      ['Week 3:', 'Test, debug, document. Run all test cases. Build your "AI Lessons Learned" knowledge base.'],
      ['Week 4:', 'Deploy, measure, plan next agents. Set up monthly maintenance schedule.'],
    ].forEach(([label, text]) => labelText(doc, label, text));

    doc.moveDown(0.4);
    doc.fontSize(10.5).font('Helvetica-Bold').fillColor(TEXT_DARK).text('Ready-to-Use Templates (in Appendix):');
    doc.moveDown(0.2);
    ['Agent Creation Template', 'Primer Prompt', 'No-Assumption System Prompt',
     'Iterative Bug-Fix Prompt', 'Agent Maintenance Checklist', 'ROI Tracking Sheet']
      .forEach(t => bullet(doc, t));

    sectionHeader(doc, '10. Measuring Success & Scaling');
    doc.fontSize(10.5).font('Helvetica-Bold').fillColor(TEXT_DARK).text('Key Metrics:');
    doc.moveDown(0.2);
    ['Time saved per task', 'Cost reduction vs. previous method', 'Accuracy rate after human review',
     'Number of deployed agents', 'Team confidence score (survey monthly)'].forEach(t => bullet(doc, t));

    doc.moveDown(0.4);
    callout(doc, 'Scaling Path: Start small → Core agents → Agent-building team → Full AI operating system.');

    sectionHeader(doc, 'Appendix: Prompt Library');

    doc.fontSize(10.5).font('Helvetica-Bold').fillColor(TEXT_DARK).text('No-Assumption Protocol (paste into every agent):');
    doc.moveDown(0.2);
    const aY = doc.y;
    doc.rect(50, aY, doc.page.width - 100, 44).fill('#EEF2FF');
    doc.rect(50, aY, 4, 44).fill(INDIGO);
    doc.fontSize(9).font('Courier').fillColor(TEXT_DARK)
       .text('"You are strictly forbidden from making any assumptions. If anything is unclear, missing, or ambiguous, ask specific clarifying questions until you have the complete picture. Never guess, infer, or proceed with incomplete information."',
             62, aY + 7, { width: doc.page.width - 124 });
    doc.moveDown(2.4);

    doc.fontSize(10.5).font('Helvetica-Bold').fillColor(TEXT_DARK).text('Primer Phase Prompt:');
    doc.moveDown(0.2);
    const bY = doc.y;
    doc.rect(50, bY, doc.page.width - 100, 30).fill('#F0FDF4');
    doc.rect(50, bY, 4, 30).fill(ACCENT);
    doc.fontSize(9).font('Courier').fillColor(TEXT_DARK)
       .text('"First, research this topic thoroughly. Become an expert. List all common bugs, problems, best practices, and failure modes people encounter when building [specific task]. Summarize key lessons learned."',
             62, bY + 7, { width: doc.page.width - 124 });
    doc.moveDown(1.8);

    doc.fontSize(10.5).font('Helvetica-Bold').fillColor(TEXT_DARK).text('Monthly Maintenance Checklist:');
    doc.moveDown(0.2);
    ['Review all active agents for accuracy and outdated information',
     'Use Grok to search for new developments in your AI tools',
     'Re-test all critical workflows end-to-end',
     'Update the "AI Lessons Learned" knowledge base',
     'Check API costs and optimize where possible'].forEach((t, i) => {
      doc.fontSize(9.5).font('Helvetica').fillColor(TEXT_MID)
         .text(`☐  ${t}`, 58, doc.y, { lineGap: 3 });
    });

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
       .text('Your AI will make mistakes — sometimes repeatedly.\nStay persistent with the iteration and debugging process.', 50, 210);

    doc.moveDown(0.8);
    doc.fillColor(TEXT_SOFT).fontSize(11).font('Helvetica')
       .text('The teams that win treat AI like a muscle: consistent training and refinement create massive strength. The playbook you\'ve just read is your foundation — use it, reference it, and build on it.', 50, doc.y, { width: doc.page.width - 100, lineGap: 5 });

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
async function sendPlaybookEmail(customerEmail, customerName) {
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

  const resend = getResend();
  await resend.emails.send({
    from: 'My Custom AI <reports@send.mycustomai.co>',
    to:   customerEmail,
    subject: 'Your Free Playbook: Building AI In-House (Attached)',
    html,
    attachments: [{
      filename: 'mycustomai-building-ai-in-house-playbook.pdf',
      content:  pdfBuffer.toString('base64'),
    }]
  });

  console.log(`[playbook] Sent to ${customerEmail}`);
}

module.exports = { sendPlaybookEmail };
