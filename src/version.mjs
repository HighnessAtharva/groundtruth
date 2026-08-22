import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const version = JSON.parse(
  readFileSync(path.join(here, '..', 'package.json'), 'utf8'),
).version;
