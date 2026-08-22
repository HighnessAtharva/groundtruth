// Public API. What a config file and a custom rule or adapter may import.
// Everything here is covered by semver. Nothing else is.

export { defineRule, ConfigError, UsageError, NetworkError } from './core/rules.mjs';
export { SEVERITY, FIX_KINDS } from './core/findings.mjs';
export { DEFAULT_VERDICTS, DERIVED_VERDICTS } from './core/config.mjs';
export { parseMarkdown, flatten, walkBlocks } from './core/markdown.mjs';
export { normalize, collapse, locateQuote, similarity, wordCount } from './core/text.mjs';
export { version } from './version.mjs';
