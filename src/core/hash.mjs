import { createHash } from 'node:crypto';

export function sha256(input) {
  return createHash('sha256').update(input).digest('hex');
}

export function shortHash(input, length = 12) {
  return sha256(input).slice(0, length);
}
