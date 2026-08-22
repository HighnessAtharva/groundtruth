// Minimal argument parser. No dependency, no magic.
//
// Supports: --flag, --no-flag, --key value, --key=value, -abc (bundled short),
// positionals, and `--` to stop parsing. A key listed in `boolean` never eats
// the next token, which is the one ambiguity a naive parser always gets wrong:
// `check --json path/to/file.md` must not read the path as the value of --json.

const NUMERIC = /^-?\d+(\.\d+)?$/;

export function parseArgs(argv, spec = {}) {
  const boolean = new Set(spec.boolean || []);
  const alias = spec.alias || {};
  const collect = new Set(spec.collect || []);

  const flags = Object.create(null);
  const positionals = [];
  const unknown = [];
  let passthrough = [];

  const setFlag = (rawKey, value) => {
    const key = alias[rawKey] || rawKey;
    if (collect.has(key)) {
      (flags[key] ||= []).push(value);
    } else {
      flags[key] = value;
    }
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (token === '--') {
      passthrough = argv.slice(i + 1);
      break;
    }

    if (token.startsWith('--')) {
      const body = token.slice(2);
      const eq = body.indexOf('=');

      if (eq !== -1) {
        setFlag(body.slice(0, eq), coerce(body.slice(eq + 1)));
        continue;
      }
      if (body.startsWith('no-')) {
        setFlag(body.slice(3), false);
        continue;
      }
      const key = alias[body] || body;
      if (boolean.has(key)) {
        setFlag(body, true);
        continue;
      }
      const next = argv[i + 1];
      if (next === undefined || (next.startsWith('-') && !NUMERIC.test(next))) {
        setFlag(body, true);
      } else {
        setFlag(body, coerce(next));
        i += 1;
      }
      continue;
    }

    if (token.length > 1 && token[0] === '-' && !NUMERIC.test(token)) {
      const letters = token.slice(1).split('');
      for (let j = 0; j < letters.length; j += 1) {
        const letter = letters[j];
        const key = alias[letter];
        if (!key) {
          unknown.push(`-${letter}`);
          continue;
        }
        const isLast = j === letters.length - 1;
        if (boolean.has(key) || !isLast) {
          setFlag(letter, true);
        } else {
          const next = argv[i + 1];
          if (next === undefined || next.startsWith('-')) {
            setFlag(letter, true);
          } else {
            setFlag(letter, coerce(next));
            i += 1;
          }
        }
      }
      continue;
    }

    positionals.push(token);
  }

  return { flags, positionals, passthrough, unknown };
}

function coerce(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (NUMERIC.test(value)) return Number(value);
  return value;
}
