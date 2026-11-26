#!/usr/bin/env node
// Unit checks for review-token.js — run: node scripts/test-review-token.js
const assert = require('assert');
const { createInviteToken, verifyInviteToken } = require('../review-token');

const SECRET = 'x'.repeat(40);
const OTHER  = 'y'.repeat(40);

const { token, id } = createInviteToken(SECRET, 14);
const [v, tid, exp, sig] = token.split('.');

assert.deepStrictEqual(verifyInviteToken(SECRET, token).ok, true, 'valid token');
assert.strictEqual(verifyInviteToken(SECRET, token).id, id, 'id round-trips');
assert.strictEqual(verifyInviteToken(OTHER, token).reason, 'invalid', 'wrong secret');
assert.strictEqual(verifyInviteToken(SECRET, `${v}.${tid}.${Number(exp) + 999}.${sig}`).reason, 'invalid', 'tampered exp');
assert.strictEqual(verifyInviteToken(SECRET, token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A')).ok, false, 'tampered last char');
assert.strictEqual(verifyInviteToken(SECRET, `v2.${tid}.${exp}.${sig}`).reason, 'invalid', 'wrong version');
assert.strictEqual(verifyInviteToken(SECRET, 'garbage').reason, 'invalid', 'malformed');
assert.strictEqual(verifyInviteToken(SECRET, undefined).reason, 'invalid', 'missing');
assert.strictEqual(verifyInviteToken(SECRET, { a: 1 }).reason, 'invalid', 'non-string');
assert.strictEqual(verifyInviteToken(SECRET, 'a'.repeat(500)).reason, 'invalid', 'too long');
assert.strictEqual(verifyInviteToken('', token).reason, 'server_not_configured', 'no secret');
assert.strictEqual(verifyInviteToken('short', token).reason, 'server_not_configured', 'short secret');
assert.throws(() => createInviteToken('short', 14), 'create rejects short secret');

const expired = createInviteToken(SECRET, -1).token;
assert.strictEqual(verifyInviteToken(SECRET, expired).reason, 'expired', 'expired');

console.log('review-token: all checks passed');
