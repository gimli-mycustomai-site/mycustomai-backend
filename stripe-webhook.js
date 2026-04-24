function getStripe() {
  return require('stripe')(process.env.STRIPE_SECRET_KEY);
}
const { sendPlaybookEmail }    = require('./playbook-pdf');

// ── Stripe webhook handler ────────────────────────────────
// Verifies payment completed, then triggers PDF generation
async function verifyStripeWebhook(req, res) {
  const stripe = getStripe();
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('[webhook] Signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle checkout.session.completed
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    console.log('[webhook] Payment completed:', session.id);

    // Extract metadata (set when creating payment link)
    // Stripe passes customer_details and metadata from the session
    const customerEmail = session.customer_details?.email;
    const customerName  = session.customer_details?.name || '';
    const plan = session.metadata?.plan || 
      (session.amount_total === 70000 ? 'pro' : 'starter');

    if (!customerEmail) {
      console.error('[webhook] No email in session');
      return res.json({ received: true });
    }

    // Note: Full intake form data comes via /api/submit
    // The webhook is just a payment verification backup.
    // Log the verified payment for our records.
    console.log(`[webhook] Verified payment from ${customerEmail} — plan: ${plan}`);

    // Send the free In-House AI Playbook PDF on every purchase
    sendPlaybookEmail(customerEmail, customerName).catch(err => {
      console.error('[webhook] Playbook email error:', err.message);
    });
  }

  res.json({ received: true });
}

module.exports = { verifyStripeWebhook };
