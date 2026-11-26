#!/usr/bin/env node
/**
 * review-local-server.js — local test harness for the review endpoints.
 * Forces TESTIMONIALS_DRY_RUN=1 (in-memory store, no GitHub, no Telegram).
 *
 * Run: REVIEW_INVITE_SECRET=<32+ chars> node scripts/review-local-server.js
 * Then curl http://localhost:3999/...
 */

process.env.TESTIMONIALS_DRY_RUN = '1';

const express = require('express');
const cors    = require('cors');
const { handleTestimonial, handleInviteCheck } = require('../testimonials');

const app = express();
app.set('trust proxy', 1);
app.use(cors({ origin: 'http://localhost:8899' }));
app.use(express.json({ limit: '1mb' }));
app.get('/api/review-invite/check', handleInviteCheck);
app.post('/api/testimonial', handleTestimonial);

app.listen(3999, () => console.log('review test server on http://localhost:3999 (dry run)'));
