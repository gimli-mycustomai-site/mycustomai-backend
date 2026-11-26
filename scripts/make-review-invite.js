#!/usr/bin/env node
/**
 * make-review-invite.js — print a one-time review link for a client
 *
 * Usage:
 *   REVIEW_INVITE_SECRET=... node scripts/make-review-invite.js "Client Name" [days]
 *
 * days defaults to 14 (max 60). The client name is only printed for your
 * records — it is not embedded in the link.
 */

const { createInviteToken } = require('../review-token');

const label = process.argv[2];
const days  = Number(process.argv[3] || 14);

if (!label) {
  console.error('Usage: REVIEW_INVITE_SECRET=... node scripts/make-review-invite.js "Client Name" [days]');
  process.exit(1);
}
if (!(days > 0 && days <= 60)) {
  console.error('days must be between 1 and 60');
  process.exit(1);
}

try {
  const { token, id, exp } = createInviteToken(process.env.REVIEW_INVITE_SECRET, days);
  console.log(`Client:  ${label}`);
  console.log(`Invite:  ${id}`);
  console.log(`Expires: ${new Date(exp * 1000).toISOString()}`);
  console.log(`Link:    https://mycustomai.co/review.html?t=${token}`);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
