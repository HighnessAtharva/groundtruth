// The signal bank.
//
// Ported from the harness this tool was extracted from. Every comment explaining
// why a pattern has the shape it does came from a real false positive, so the
// comments are the calibration record and they travel with the pattern.
//
// A project replaces any of these through `readability.overrides.signals`.

/** Subordinators and relative pronouns. Each past the first is a clause held open. */
export const SUBORDINATORS =
  /\b(although|though|whereas|because|since|unless|until|while|whilst|whether|which|whose|wherein|whom|that\s+the|so\s+that|even\s+if|even\s+though|in\s+order\s+to|rather\s+than|as\s+well\s+as|not\s+only)\b/gi;

/**
 * "was applied", "is measured", "gets flagged", "been revoked".
 *
 * The trailing alternation keeps attributive participles out. "are fixed
 * settings" and "is a shared pool" are adjectives, and a real passive is nearly
 * always followed by a preposition, a conjunction, or the end of the clause.
 * Without that guard this fired on roughly a third of a 108-document corpus and
 * the flag stopped meaning anything.
 */
export const PASSIVE =
  /\b(?:is|are|was|were|be|been|being|gets|got)\s+(?:not\s+|already\s+|never\s+|also\s+|only\s+|still\s+)?[a-z]+(?:ed|en|wn|ne|it)\b(?=\s*(?:[.,;:!?)]|$|\b(?:by|to|in|on|at|from|for|with|into|onto|against|across|as|when|if|so|and|or|but|before|after|until|while|because|than|that|which|out|back|down|up|over|under|per)\b))/gi;

/**
 * Verbs turned into nouns. "the application of X" instead of "applying X".
 *
 * Lower case only, for the same reason the jargon count is. A product name like
 * "Snowflake Intelligence" or "Autoscale Misconfiguration" is not a writer
 * burying a verb. Case-insensitive, this asked for rewrites that cannot exist.
 */
export const NOMINALIZATION =
  /\b[a-z]\w{3,}(?:tion|tions|ment|ments|ance|ancy|ence|ency|ity|ities|ness)\b/g;

/** Words that add length without adding meaning. */
export const FILLER =
  /\b(actually|basically|essentially|simply|really|very|quite|somewhat|fairly|in\s+fact|of\s+course|as\s+such|it\s+is\s+worth|there\s+(?:is|are)\s+(?:a|an|no|some|several|many))\b/gi;

/**
 * Two independent clauses welded with a coordinator: "X, and the page redraws".
 *
 * The verb guard is the whole difficulty. Without it this fires on every list
 * that uses a serial comma, because "the tiles, the daily chart, and all three
 * tables" looks identical up to the coordinator. So the clause after it must
 * carry a finite verb within a few words.
 *
 * Two branches, because the gap between subject and verb is what separates an
 * attributive adjective from a finite verb. English does not allow "the walked",
 * so after an article the head noun comes first and the verb cannot be adjacent.
 * After a pronoun it must be adjacent. Splitting the branches killed a whole
 * class of false positive where a participle sat right after an article.
 *
 * The pronoun branch carries no verb requirement, because a pronoun after a
 * coordinator is unambiguously the subject of a new clause. Demanding an
 * inflected verb there dropped "and they combine", since a plural subject takes
 * an uninflected verb.
 */
export const COORD_FUSED =
  /,\s+(?:and|but|so|then|yet)\s+(?:(?:it|they|you|we|there)\s+[\w'-]+|(?:the|a|an|its|their|your|every|each|this|that|[\w'-]+ing)(?:\s+[\w'-]+){1,4}?\s+(?:is|are|was|were|has|have|had|does|do|did|can|could|will|would|should|may|might|must|gets|got|[\w'-]+(?:s|ed)))\b/i;

/**
 * An adverbial opener that holds the main subject back. Counted once, and only
 * when the opener runs long enough to cost something. "For the window you pick,"
 * costs a reader something. "So," does not.
 */
export const FRONT_LOADED =
  /^(?:For|When|Where|While|Because|Since|If|Under|After|Before|Once|Although|Though|Given|With|By|Across|Within|Unless|Until)\b[^,]{8,},\s/;

/** A runway in front of a claim that could have led. "That tells you X" is X. */
export const PREAMBLE =
  /^(?:That (?:tells|means|shows|gives) (?:you|us)|What (?:this|that) means is|It is worth noting that|The (?:point|thing) (?:here )?is that|This means that)\b/i;

/**
 * Finite-verb test, used to tell a list item from a clause. Deliberately crude:
 * an auxiliary, or a common inflected lexical verb. A list item like "SQL Server"
 * or "column-level lineage" has neither.
 */
export const HAS_VERB =
  /\b(is|are|was|were|be|been|being|has|have|had|does|do|did|can|could|will|would|should|may|might|must|gets|got|goes|went|takes|took|makes|made|runs|ran|reads|writes|returns|covers|means|lists|ships|holds|keeps|needs|puts|shows)\b/i;

export const DEFAULT_SIGNALS = {
  subordinators: SUBORDINATORS,
  passive: PASSIVE,
  nominalization: NOMINALIZATION,
  filler: FILLER,
  coordFused: COORD_FUSED,
  frontLoaded: FRONT_LOADED,
  preamble: PREAMBLE,
  hasVerb: HAS_VERB,
};

/** Count non-overlapping matches without leaking `lastIndex` between calls. */
export function countMatches(text, pattern) {
  if (!pattern) return 0;
  const re = pattern.global ? pattern : new RegExp(pattern.source, `${pattern.flags}g`);
  re.lastIndex = 0;
  let count = 0;
  while (re.exec(text) !== null) {
    count += 1;
    if (re.lastIndex === 0) break;
  }
  return count;
}
