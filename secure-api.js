/**
 * secure-api.js — Secure backend endpoints for MyCustomAI email functions
 * Replaces direct frontend API calls with proper backend validation
 */

const express = require('express');
const cors = require('cors');
const EmailService = require('./email-service');

const app = express();
const emailService = new EmailService();

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(cors({
  origin: ['https://mycustomai.co', 'http://localhost:3000'], // Only allow your domains
  credentials: true
}));

// Security: Simple rate limiting middleware
const rateLimitMap = new Map();
function simpleRateLimit(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  const windowMs = 60000; // 1 minute
  const maxRequests = 20; // 20 requests per minute per IP

  if (!rateLimitMap.has(ip)) {
    rateLimitMap.set(ip, []);
  }

  const requests = rateLimitMap.get(ip);
  const validRequests = requests.filter(time => now - time < windowMs);
  
  if (validRequests.length >= maxRequests) {
    return res.status(429).json({ 
      error: 'Rate limit exceeded',
      retryAfter: 60
    });
  }

  validRequests.push(now);
  rateLimitMap.set(ip, validRequests);
  next();
}

app.use(simpleRateLimit);

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const health = await emailService.healthCheck();
    res.json(health);
  } catch (error) {
    res.status(500).json({ 
      status: 'unhealthy', 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Secure audit notification endpoint
app.post('/api/audit-notify', async (req, res) => {
  try {
    const { data, estimate } = req.body || {};
    
    if (!data || !data.name || !data.email) {
      return res.status(400).json({ 
        error: 'Missing required audit data (name, email)' 
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(data.email)) {
      return res.status(400).json({ 
        error: 'Invalid email format' 
      });
    }

    const ip = req.ip || req.connection.remoteAddress;
    await emailService.sendAuditNotification(data, estimate, ip);
    
    res.json({ 
      success: true, 
      message: 'Audit notification sent',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[secure-api] Audit notify error:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to send notification',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Secure intake form endpoint
app.post('/api/intake-submit', async (req, res) => {
  try {
    const intakeData = req.body;
    
    if (!intakeData.bizName || !intakeData.ownerName) {
      return res.status(400).json({ 
        error: 'Missing required intake data (bizName, ownerName)' 
      });
    }

    const ip = req.ip || req.connection.remoteAddress;
    const estimate = intakeData.estimate; // Include estimate if provided
    
    await emailService.sendIntakeNotification(intakeData, estimate, ip);
    
    res.json({ 
      success: true, 
      message: 'Intake form submitted successfully',
      redirectUrl: `confirmation.html?plan=${intakeData.plan || 'unknown'}`,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[secure-api] Intake submit error:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to submit intake form',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Stripe webhook for playbook emails (secure endpoint)
app.post('/api/stripe-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
  
  if (!endpointSecret) {
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  try {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const customerEmail = session.customer_details?.email;
      const customerName = session.customer_details?.name;
      
      if (customerEmail) {
        await emailService.sendPlaybookEmail(customerEmail, customerName, 'stripe');
        console.log(`[secure-api] Playbook email sent to ${customerEmail}`);
      }
    }
    
    res.json({ received: true });

  } catch (error) {
    console.error('[secure-api] Stripe webhook error:', error.message);
    res.status(400).json({ error: error.message });
  }
});

// Statistics endpoint (for monitoring)
app.get('/api/email-stats', (req, res) => {
  res.json(emailService.getStats());
});

// Error handler
app.use((error, req, res, next) => {
  console.error('[secure-api] Unhandled error:', error);
  res.status(500).json({ 
    error: 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Endpoint not found',
    availableEndpoints: ['/health', '/api/audit-notify', '/api/intake-submit', '/api/stripe-webhook', '/api/email-stats']
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`[secure-api] MyCustomAI secure API server running on port ${PORT}`);
  console.log(`[secure-api] Email service initialized with rate limiting and retry logic`);
});

module.exports = app;
