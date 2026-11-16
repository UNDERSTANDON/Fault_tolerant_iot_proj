import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidBrowserToken } from './bridge_auth.mjs';

test('accepts the configured browser token', () => {
  assert.equal(isValidBrowserToken('a'.repeat(64), 'a'.repeat(64)), true);
});

test('rejects incorrect and malformed browser tokens', () => {
  assert.equal(isValidBrowserToken('b'.repeat(64), 'a'.repeat(64)), false);
  assert.equal(isValidBrowserToken('', 'a'.repeat(64)), false);
  assert.equal(isValidBrowserToken('a'.repeat(257), 'a'.repeat(64)), false);
  assert.equal(isValidBrowserToken(null, 'a'.repeat(64)), false);
});
