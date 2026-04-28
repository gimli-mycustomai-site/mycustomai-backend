function getStripe() {
  return require('stripe')(process.env.STRIPE_SECRET_KEY);
}
const {
  sendPlaybookEmail,
  sendPackage2PDF, sendPackage3PDF, sendPackage4PDF,
  sendPackage5PDF, sendPackage6PDF, sendPackage7PDF,
  sendPackage8PDF, sendPackage9PDF
} = require('./playbook-pdf');

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

    const customerEmail = session.customer_details?.email;
    const customerName  = session.customer_details?.name || '';
    const amountTotal   = session.amount_total;

    // Determine plan label for logging
    let plan = session.metadata?.plan;
    if (!plan) {
      switch (amountTotal) {
        case 3700:   plan = 'pdf-only'; break;
        case 6700:   plan = 'package-2'; break;
        case 7700:   plan = 'package-3'; break;
        case 9700:   plan = 'package-5'; break;
        case 12700:  plan = 'package-9'; break;
        case 13000:  plan = 'package-4'; break;
        case 14700:  plan = 'package-8'; break;
        case 100000: plan = 'quick-launch'; break;
        case 250000: plan = 'full-mastery'; break;
        case 500000: plan = 'team-foundation'; break;
        case 1000000: plan = 'corporate'; break;
        default:     plan = 'unknown'; break;
      }
    }

    if (!customerEmail) {
      console.error('[webhook] No email in session');
      return res.json({ received: true });
    }

    console.log(`[webhook] Verified payment from ${customerEmail} — plan: ${plan} — amount: ${amountTotal}`);

    // Detect package by price ID (most reliable) or amount fallback
    const lineItems = session.line_items?.data || [];
    const priceId   = lineItems[0]?.price?.id || session.metadata?.price_id || '';

    const isPackage2 = priceId === 'price_1TR4CeFJIk3vLNePzYNf9HTa' || amountTotal === 6700;
    const isPackage3 = priceId === 'price_1TR4L9FJIk3vLNePAPcvTesI' || amountTotal === 7700;
    const isPackage4 = priceId === 'price_1TR4bAFJIk3vLNePe3rwStRc' || amountTotal === 13000;
    const isPackage5 = priceId === 'price_1TR4pTFJIk3vLNePOYFuIQEL' || amountTotal === 9700;
    const isPackage6 = priceId === 'price_1TR4xLFJIk3vLNePHgVWrEC8';
    const isPackage7 = priceId === 'price_1TR57RFJIk3vLNePfyRPFRcQ' || amountTotal === 5700;
    const isPackage8 = priceId === 'price_1TR5J6FJIk3vLNeP4Yn6LSIm' || amountTotal === 14700;
    const isPackage9 = priceId === 'price_1TR5g5FJIk3vLNeP9IzUpwpT' || amountTotal === 12700;

    if (isPackage9) {
      sendPackage9PDF(customerEmail, customerName).catch(err => {
        console.error('[webhook] Package9 email error:', err.message);
      });
    } else if (isPackage8) {
      sendPackage8PDF(customerEmail, customerName).catch(err => {
        console.error('[webhook] Package8 email error:', err.message);
      });
    } else if (isPackage7) {
      sendPackage7PDF(customerEmail, customerName).catch(err => {
        console.error('[webhook] Package7 email error:', err.message);
      });
    } else if (isPackage6) {
      sendPackage6PDF(customerEmail, customerName).catch(err => {
        console.error('[webhook] Package6 email error:', err.message);
      });
    } else if (isPackage5) {
      sendPackage5PDF(customerEmail, customerName).catch(err => {
        console.error('[webhook] Package5 email error:', err.message);
      });
    } else if (isPackage4) {
      sendPackage4PDF(customerEmail, customerName).catch(err => {
        console.error('[webhook] Package4 email error:', err.message);
      });
    } else if (isPackage3) {
      sendPackage3PDF(customerEmail, customerName).catch(err => {
        console.error('[webhook] Package3 email error:', err.message);
      });
    } else if (isPackage2) {
      sendPackage2PDF(customerEmail, customerName).catch(err => {
        console.error('[webhook] Package2 email error:', err.message);
      });
    } else {
      // Default: send the free In-House AI Playbook PDF
      sendPlaybookEmail(customerEmail, customerName).catch(err => {
        console.error('[webhook] Playbook email error:', err.message);
      });
    }
  }

  res.json({ received: true });
}

module.exports = { verifyStripeWebhook };
