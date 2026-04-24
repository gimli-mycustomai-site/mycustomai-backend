require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const bodyParser = require('body-parser');
const { generateAndSendReport } = require('./pdf');
const { verifyStripeWebhook }   = require('./stripe-webhook');
const { handleTestimonial }     = require('./testimonials');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── CORS — allow mycustomai.co ────────────────────────────
app.use(cors({
  origin: ['https://mycustomai.co', 'https://gimli-mycustomai-site.github.io', 'http://localhost'],
  methods: ['POST', 'GET', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// ── Raw body for Stripe webhook signature verification ────
app.use('/webhook/stripe', bodyParser.raw({ type: 'application/json' }));

// ── JSON body for all other routes ────────────────────────
app.use(bodyParser.json({ limit: '1mb' }));

// ── Root ──────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'mycustomai-backend' });
});

// ── Health check (Render deploy gating + uptime monitoring) ─
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    service: 'mycustomai-backend'
  });
});

// ── Submit intake form → generate + email PDF ─────────────
// Called directly from intake.html after successful Stripe payment
app.post('/api/submit', async (req, res) => {
  try {
    const data = req.body;

    // Basic validation
    if (!data.email || !data.bizName || !data.ownerName) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    console.log(`[submit] New intake: ${data.bizName} (${data.email}) — plan: ${data.plan || 'starter'}`);

    // Fire and forget — don't make the user wait
    generateAndSendReport(data).catch(err => {
      console.error('[submit] PDF generation error:', err.message);
    });

    res.json({ success: true, message: 'Report is being generated. Check your email!' });
  } catch (err) {
    console.error('[submit] Error:', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// ── Stripe webhook → verify payment + trigger PDF ─────────
app.post('/webhook/stripe', async (req, res) => {
  try {
    await verifyStripeWebhook(req, res);
  } catch (err) {
    console.error('[webhook] Error:', err.message);
    res.status(400).send('Webhook error');
  }
});

// ── Submit testimonial → GitHub → live site ───────────────
app.post('/api/testimonial', handleTestimonial);

app.listen(PORT, () => {
  console.log(`mycustomai backend running on port ${PORT}`);
});
