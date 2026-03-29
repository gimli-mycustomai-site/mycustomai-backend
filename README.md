# mycustomai-backend

PDF generation + email delivery backend for mycustomai.co.

## How it works

1. Customer fills intake form on mycustomai.co
2. Form POSTs to `/api/submit` with their business data
3. Server calls OpenAI GPT-4o to generate a custom AI tools report
4. Report is converted to a styled PDF via Puppeteer
5. PDF is emailed to the customer via Resend

## Deploy to Render

1. Push this folder to a new GitHub repo: `mycustomai-backend`
2. Go to render.com → New → Web Service → connect the repo
3. Set these environment variables in Render dashboard:
   - `OPENAI_API_KEY` — your OpenAI API key
   - `RESEND_API_KEY` — re_9btMtALT_KtKU358beaEmovP9UtpqFdnd
   - `STRIPE_SECRET_KEY` — from Stripe dashboard → Developers → API keys
   - `STRIPE_WEBHOOK_SECRET` — from Stripe dashboard → Developers → Webhooks
4. Render will auto-deploy. Your backend URL will be: `https://mycustomai-backend.onrender.com`

## After deploy

Update the intake.html form action URL to point to your Render URL:
```
fetch('https://mycustomai-backend.onrender.com/api/submit', ...)
```

## Environment Variables

See `.env.example` for the full list.

## Local dev

```bash
npm install
cp .env.example .env
# Fill in .env with real keys
node server.js
```
