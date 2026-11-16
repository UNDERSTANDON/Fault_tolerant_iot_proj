import { createHash, timingSafeEqual } from 'node:crypto';

export function isValidBrowserToken(candidate, expected) {
  if (typeof candidate !== 'string' || typeof expected !== 'string'
    || candidate.length === 0 || candidate.length > 256 || expected.length === 0) {
    return false;
  }

  const candidateHash = createHash('sha256').update(candidate, 'utf8').digest();
  const expectedHash = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(candidateHash, expectedHash);
}
