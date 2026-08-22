#!/usr/bin/env node
import { main } from '../src/cli/index.mjs';

try {
  const code = await main(process.argv.slice(2));
  process.exitCode = code ?? 0;
} catch (error) {
  const known = typeof error?.exitCode === 'number';
  process.stderr.write(`\ngroundtruth: ${error.message}\n`);
  if (!known) {
    process.stderr.write(`${error.stack?.split('\n').slice(1).join('\n') || ''}\n`);
    process.stderr.write('\nThis is a bug. Please report it:\n  https://github.com/HighnessAtharva/groundtruth/issues\n');
  }
  process.stderr.write('\n');
  process.exitCode = known ? error.exitCode : 4;
}
