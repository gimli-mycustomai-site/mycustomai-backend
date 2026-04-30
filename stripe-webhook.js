function getStripe() {
  return require('stripe')(process.env.STRIPE_SECRET_KEY);
}

// ── SQS client for async PDF delivery ───────────────
const AWS = require('aws-sdk');
const sqs = new AWS.SQS({
  accessKeyId:     process.env.AWS_SES_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SES_SECRET_KEY,
  region:          process.env.AWS_SES_REGION || 'us-west-2'
});
const MCA_QUEUE_URL = 'https://sqs.us-west-2.amazonaws.com/034797416133/mca-pdf-delivery';

function enqueuePdfDelivery(email, name, productId, stripeEventId) {
  const params = {
    QueueUrl:    MCA_QUEUE_URL,
    MessageBody: JSON.stringify({
      email,
      name:            name || 'Valued Customer',
      product:         productId,
      stripe_event_id: stripeEventId || ''
    })
  };
  return sqs.sendMessage(params).promise()
    .then(() => console.log(`[webhook] Queued async delivery: ${productId} → ${email}`))
    .catch(err => console.error(`[webhook] SQS enqueue failed for ${email}:`, err.message));
}

// ── Stripe webhook handler ────────────────────────────────
// Verifies payment completed, then enqueues PDF delivery to SQS → Lambda
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

  // Return 200 to Stripe FIRST — async delivery handles the rest
  res.json({ received: true });

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
      return;
    }

    console.log(`[webhook] Verified payment from ${customerEmail} — plan: ${plan} — amount: ${amountTotal}`);

    // Detect package by price ID (most reliable) or amount fallback
    const lineItems = session.line_items?.data || [];
    const priceId   = lineItems[0]?.price?.id || session.metadata?.price_id || '';

    const isPackage2 = priceId === 'price_1TR4CeFJIk3vLNePzYNf9HTa';
    const isPackage3 = priceId === 'price_1TR4L9FJIk3vLNePAPcvTesI' || amountTotal === 7700;
    const isPackage4 = priceId === 'price_1TR4bAFJIk3vLNePe3rwStRc' || amountTotal === 13000;
    const isPackage5 = priceId === 'price_1TR4pTFJIk3vLNePOYFuIQEL' || amountTotal === 9700;
    const isPackage6 = priceId === 'price_1TR4xLFJIk3vLNePHgVWrEC8' || amountTotal === 6700;
    const isPackage7 = priceId === 'price_1TR57RFJIk3vLNePfyRPFRcQ' || amountTotal === 5700;
    const isPackage8 = priceId === 'price_1TR5J6FJIk3vLNeP4Yn6LSIm' || amountTotal === 14700;
    const isPackage9 = priceId === 'price_1TR5g5FJIk3vLNeP9IzUpwpT' || amountTotal === 12700;

    if      (isPackage9) enqueuePdfDelivery(customerEmail, customerName, 'package-9', event.id);
    else if (isPackage8) enqueuePdfDelivery(customerEmail, customerName, 'package-8', event.id);
    else if (isPackage7) enqueuePdfDelivery(customerEmail, customerName, 'package-7', event.id);
    else if (isPackage6) enqueuePdfDelivery(customerEmail, customerName, 'package-6', event.id);
    else if (isPackage5) enqueuePdfDelivery(customerEmail, customerName, 'package-5', event.id);
    else if (isPackage4) enqueuePdfDelivery(customerEmail, customerName, 'package-4', event.id);
    else if (isPackage3) enqueuePdfDelivery(customerEmail, customerName, 'package-3', event.id);
    else if (isPackage2) enqueuePdfDelivery(customerEmail, customerName, 'package-2', event.id);
    else                 enqueuePdfDelivery(customerEmail, customerName, 'package-1', event.id);
  }
}

module.exports = { verifyStripeWebhook };
