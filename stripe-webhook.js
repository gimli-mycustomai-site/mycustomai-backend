function getStripe() {
  return require('stripe')(process.env.STRIPE_SECRET_KEY);
}
const { sendPlaybookEmail, sendPackage2PDF, sendPackage3PDF, sendPackage4PDF, sendPackage5PDF, sendPackage6PDF } = require('./playbook-pdf');

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
    // Determine product type from amount or line items
    let plan = session.metadata?.plan;
    if (!plan) {
      switch (session.amount_total) {
        case 3700:   plan = 'pdf-only'; break;     // $37 PDF
        case 100000: plan = 'quick-launch'; break; // $1,000
        case 250000: plan = 'full-mastery'; break; // $2,500  
        case 500000: plan = 'team-foundation'; break; // $5,000
        case 1000000: plan = 'corporate'; break;   // $10,000
        default:     plan = 'unknown'; break;
      }
    }

    if (!customerEmail) {
      console.error('[webhook] No email in session');
      return res.json({ received: true });
    }

    // Note: Full intake form data comes via /api/submit
    // The webhook is just a payment verification backup.
    // Log the verified payment for our records.
    console.log(`[webhook] Verified payment from ${customerEmail} — plan: ${plan}`);

    // Detect if this is a Package 2 purchase by checking price ID in line items
    const lineItems = session.line_items?.data || [];
    const isPackage2 = lineItems.some(item => item.price?.id === 'price_1TR4CeFJIk3vLNePzYNf9HTa') ||
                       session.metadata?.price_id === 'price_1TR4CeFJIk3vLNePzYNf9HTa' ||
                       session.amount_total === 6700; // $67

    const isPackage3 = lineItems.some(item => item.price?.id === 'price_1TR4L9FJIk3vLNePAPcvTesI') ||
                       session.metadata?.price_id === 'price_1TR4L9FJIk3vLNePAPcvTesI' ||
                       session.amount_total === 7700; // $77

    const isPackage4 = lineItems.some(item => item.price?.id === 'price_1TR4bAFJIk3vLNePe3rwStRc') ||
                       session.metadata?.price_id === 'price_1TR4bAFJIk3vLNePe3rwStRc' ||
                       session.amount_total === 13000; // $130

    const isPackage5 = lineItems.some(item => item.price?.id === 'price_1TR4pTFJIk3vLNePOYFuIQEL') ||
                       session.metadata?.price_id === 'price_1TR4pTFJIk3vLNePOYFuIQEL' ||
                       session.amount_total === 9700; // $97

    const isPackage6 = lineItems.some(item => item.price?.id === 'price_1TR4xLFJIk3vLNePHgVWrEC8') ||
                       session.metadata?.price_id === 'price_1TR4xLFJIk3vLNePHgVWrEC8';

    if (isPackage2) {
      sendPackage2PDF(customerEmail, customerName).catch(err => {
        console.error('[webhook] Package2 email error:', err.message);
      });
    } else if (isPackage3) {
      sendPackage3PDF(customerEmail, customerName).catch(err => {
        console.error('[webhook] Package3 email error:', err.message);
      });
    } else if (isPackage4) {
      sendPackage4PDF(customerEmail, customerName).catch(err => {
        console.error('[webhook] Package4 email error:', err.message);
      });
    } else if (isPackage5) {
      sendPackage5PDF(customerEmail, customerName).catch(err => {
        console.error('[webhook] Package5 email error:', err.message);
      });
    } else if (isPackage6) {
      sendPackage6PDF(customerEmail, customerName).catch(err => {
        console.error('[webhook] Package6 email error:', err.message);
      });
    } else {
      // Send the free In-House AI Playbook PDF on every other purchase
      sendPlaybookEmail(customerEmail, customerName).catch(err => {
        console.error('[webhook] Playbook email error:', err.message);
      });
    }
  }

  res.json({ received: true });
}

module.exports = { verifyStripeWebhook };
