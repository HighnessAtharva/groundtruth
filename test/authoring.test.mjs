import test from 'node:test';
import assert from 'node:assert/strict';
import { Document } from '../src/core/document.mjs';
import { findCandidates } from '../src/modules/grounding/candidates.mjs';
import { renderSpanMap } from '../src/modules/grounding/spanmap.mjs';
import { verifySpan } from '../src/modules/grounding/verify.mjs';
import { rules as styleRules } from '../src/modules/style/index.mjs';
import { DEFAULT_VERDICTS } from '../src/core/config.mjs';
import atharva from '../presets/atharva.mjs';
import ste from '../presets/ste.mjs';
import path from 'node:path';
import { tmpdir } from 'node:os';

function doc(source, profile = { grounding: { enabled: true } }) {
  return new Document({
    absolutePath: path.join(tmpdir(), 'a.md'),
    relativePath: 'a.md',
    source,
    profile,
    profileName: 'test',
  });
}

// ---------------------------------------------------------------------------
// Claim extraction
// ---------------------------------------------------------------------------

const BODY = [
  '# A piece',
  '',
  'The engine supports 13 platforms and only four of them ship a native driver.',
  'That is a design decision rather than an accident.',
  '',
  'Most teams run it with the default settings.',
  '',
  'It is nice.',
  '',
  'The queue is faster than the old one.',
].join('\n');

test('claim extraction picks sentences with numbers, absolutes and capabilities', () => {
  const found = findCandidates(doc(BODY));
  const texts = found.map((entry) => entry.text);
  assert.ok(texts.some((t) => t.includes('13 platforms')), JSON.stringify(texts));
  assert.ok(texts.some((t) => t.startsWith('Most teams')), 'a hedge is the shape of an unsourced consensus claim');
  assert.ok(texts.some((t) => t.includes('faster than')), 'a comparison needs two sources');
});

test('claim extraction skips prose that asserts nothing', () => {
  const found = findCandidates(doc(BODY)).map((entry) => entry.text);
  assert.ok(!found.some((t) => t === 'It is nice'), 'too short and claims nothing');
  assert.ok(
    !found.some((t) => t.startsWith('That is a design decision')),
    'an opinion with no number, absolute or capability is not a claim',
  );
});

test('every extracted candidate already verifies against the document', () => {
  // A scaffold that fails is worse than no scaffold, because the first thing a new
  // user sees would be a wall of errors from a file the tool wrote itself.
  const document = doc(BODY);
  for (const candidate of findCandidates(document)) {
    const verification = verifySpan({ match: candidate.text }, document);
    assert.equal(verification.ok, true, `${candidate.text} would not verify`);
  }
});

test('an extracted candidate never carries markdown that is not reader text', () => {
  const document = doc('# T\n\nThe engine supports **13 platforms** and only `four` ship a driver.\n');
  for (const candidate of findCandidates(document)) {
    assert.ok(!candidate.text.includes('*'), candidate.text);
    assert.ok(!candidate.text.includes('`'), candidate.text);
    assert.equal(verifySpan({ match: candidate.text }, document).ok, true);
  }
});

test('candidates come back in document order with a line number', () => {
  const found = findCandidates(doc(BODY));
  const lines = found.map((entry) => entry.line);
  assert.deepEqual([...lines].sort((a, b) => a - b), lines);
  assert.ok(lines.every((line) => line > 0));
});

test('a scaffolded map never names a source without a quote', () => {
  // The validator refuses that combination, so emitting it would make the tool
  // fail on its own output.
  const rendered = renderSpanMap({
    document: 'a.md',
    audited: '2026-08-22',
    spans: findCandidates(doc(BODY)).map((candidate) => ({
      match: candidate.text,
      source: null,
      quote: null,
      verdict: 'TODO',
      note: 'TODO',
    })),
  });
  assert.ok(!/source: '[^']+'/.test(rendered), rendered);
  assert.match(rendered, /source: null/);
});

// ---------------------------------------------------------------------------
// The TODO verdict
// ---------------------------------------------------------------------------

test('TODO warns and UNSOURCED blocks, because they are different facts', () => {
  // TODO records that nobody has looked. UNSOURCED records that somebody looked
  // and found nothing. Conflating them made a fresh scaffold report errors from a
  // file the tool had just written.
  assert.equal(DEFAULT_VERDICTS.TODO.severity, 'warn');
  assert.equal(DEFAULT_VERDICTS.UNSOURCED.severity, 'error');
  assert.deepEqual(DEFAULT_VERDICTS.TODO.requires, []);
});

// ---------------------------------------------------------------------------
// The style module
// ---------------------------------------------------------------------------

function runStyle(source, style) {
  const profile = { readability: {}, style: { enabled: true, preset: style } };
  const document = doc(source, profile);
  const found = [];
  for (const rule of styleRules) {
    rule.run({
      doc: document,
      blocks: document.query,
      frontmatter: document.frontmatter,
      config: {},
      profile,
      finding: (input) => found.push({ rule: rule.id, ...input }),
    });
  }
  return found;
}

test('the style module ships silent, so nobody inherits an opinion', () => {
  const found = runStyle('This will utilize a comprehensive approach; it is seamless.\n', {});
  assert.deepEqual(found, []);
});

test('the opinionated preset catches its own banned words and punctuation', () => {
  const found = runStyle('We will utilize a comprehensive approach; it is seamless.\n', atharva.style);
  const rules = found.map((entry) => entry.rule);
  assert.ok(rules.includes('style.banned-word'), JSON.stringify(found));
  assert.ok(rules.includes('style.punctuation'), JSON.stringify(found));
  const words = found.filter((f) => f.rule === 'style.banned-word').map((f) => f.message);
  assert.ok(words.some((m) => m.includes('utilize')));
  assert.ok(words.some((m) => m.includes('comprehensive')));
  assert.ok(words.some((m) => m.includes('seamless')));
});

test('a banned word inside inline code is left alone', () => {
  // Banning a word inside `utilize()` asks for a rename nobody can make.
  const found = runStyle('Call `utilize()` when the buffer fills up and the queue drains.\n', atharva.style);
  assert.deepEqual(found.filter((entry) => entry.rule === 'style.banned-word'), []);
});

test('a banned word inside a quotation is left alone', () => {
  const found = runStyle('> Their docs call it a comprehensive platform.\n', atharva.style);
  assert.deepEqual(found.filter((entry) => entry.rule === 'style.banned-word'), []);
});

test('a banned phrase matches across a line break', () => {
  const found = runStyle('There is a caveat. It is worth\nnoting that the cache is cold.\n', atharva.style);
  assert.ok(
    found.some((entry) => entry.rule === 'style.banned-phrase'),
    JSON.stringify(found),
  );
});

test('the STE preset enforces a sentence cap and a finite verb', () => {
  const long = 'Remove the access panel and then disconnect the wiring harness and then check the connector body for corrosion before you continue with the next step.';
  const found = runStyle(`${long}\n\nSame panel. Same harness.\n`, ste.style);
  assert.ok(found.some((entry) => entry.rule === 'style.sentence-length'), JSON.stringify(found.map((f) => f.rule)));
  assert.ok(found.some((entry) => entry.rule === 'style.fragment'), JSON.stringify(found.map((f) => f.rule)));
});

test('the STE preset has no opinion on the em dash', () => {
  // A maintenance manual using one is not wrong, and STE does not say it is.
  assert.deepEqual(ste.style.punctuation, {});
});

test('every style rule that fires reports a line inside the document', () => {
  const source = '# T\n\nParagraph one is fine.\n\nWe will utilize this; it is seamless.\n';
  const found = runStyle(source, atharva.style);
  assert.ok(found.length > 0);
  for (const entry of found) {
    assert.ok(entry.line >= 5, `${entry.rule} reported line ${entry.line}, but the offending prose starts at 5`);
  }
});

test('the two shipped opinions do not overlap in what they claim to enforce', () => {
  // STE is a controlled language and the other is a house style. A reader picking
  // one should not get the other's rules by accident.
  assert.ok(atharva.style.bannedWords.length > 40);
  assert.equal((ste.style.bannedWords || []).length, 0);
  assert.equal(atharva.style.maxSentenceWords, undefined);
  assert.equal(ste.style.maxSentenceWords, 20);
});
