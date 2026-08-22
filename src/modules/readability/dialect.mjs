// Spelling dialect.
//
// Off by default, because a universal tool should not have an opinion about
// whether you write "colour". Turn it on when your project has picked one and
// wants the pick enforced.
//
// Scope is deliberately narrow. Words where the two spellings mean different
// things in technical writing are absent on purpose: "practice" and "practise",
// "licence" and "license", "programme" and "program". Flagging those produces a
// wrong answer often enough to teach a writer to ignore the checker.

const TO_AMERICAN = {
  analyse: 'analyze', analysed: 'analyzed', analyses: 'analyzes', analysing: 'analyzing',
  behaviour: 'behavior', behaviours: 'behaviors', behavioural: 'behavioral',
  cancelled: 'canceled', cancelling: 'canceling',
  catalogue: 'catalog', catalogues: 'catalogs',
  centre: 'center', centres: 'centers', centred: 'centered',
  colour: 'color', colours: 'colors', coloured: 'colored', colouring: 'coloring',
  customise: 'customize', customised: 'customized', customising: 'customizing',
  defence: 'defense', defences: 'defenses',
  dialogue: 'dialog',
  emphasise: 'emphasize', emphasised: 'emphasized', emphasising: 'emphasizing',
  favour: 'favor', favours: 'favors', favoured: 'favored', favourite: 'favorite',
  fibre: 'fiber',
  flavour: 'flavor', flavours: 'flavors',
  fulfil: 'fulfill', fulfils: 'fulfills', fulfilment: 'fulfillment',
  grey: 'gray',
  honour: 'honor', honoured: 'honored',
  initialise: 'initialize', initialised: 'initialized', initialising: 'initializing',
  labelled: 'labeled', labelling: 'labeling',
  litre: 'liter', litres: 'liters',
  metre: 'meter', metres: 'meters',
  minimise: 'minimize', minimised: 'minimized', minimising: 'minimizing',
  modelled: 'modeled', modelling: 'modeling',
  normalise: 'normalize', normalised: 'normalized', normalising: 'normalizing',
  optimise: 'optimize', optimised: 'optimized', optimising: 'optimizing',
  organisation: 'organization', organisations: 'organizations',
  organise: 'organize', organised: 'organized', organising: 'organizing',
  parameterise: 'parameterize', parameterised: 'parameterized',
  prioritise: 'prioritize', prioritised: 'prioritized', prioritising: 'prioritizing',
  realise: 'realize', realised: 'realized', realising: 'realizing',
  recognise: 'recognize', recognised: 'recognized', recognising: 'recognizing',
  serialise: 'serialize', serialised: 'serialized', serialising: 'serializing',
  signalled: 'signaled', signalling: 'signaling',
  standardise: 'standardize', standardised: 'standardized',
  summarise: 'summarize', summarised: 'summarized', summarising: 'summarizing',
  synchronise: 'synchronize', synchronised: 'synchronized',
  travelled: 'traveled', travelling: 'traveling',
  utilise: 'utilize', utilised: 'utilized',
  visualise: 'visualize', visualised: 'visualized', visualising: 'visualizing',
};

const TO_BRITISH = Object.fromEntries(
  Object.entries(TO_AMERICAN).map(([british, american]) => [american, british]),
);

export function dialectFindings(doc, settings) {
  const target = settings.target === 'british' ? 'british' : 'american';
  const dictionary = target === 'american' ? TO_AMERICAN : TO_BRITISH;
  const extra = settings.words || {};
  const table = { ...dictionary, ...extra };
  const pattern = new RegExp(`\\b(${Object.keys(table).join('|')})\\b`, 'gi');
  const out = [];

  // Reader text only. That is what exempts fenced code, inline code, link
  // targets and image sources for free, because none of them contribute reader
  // text. The source harness has to maintain an explicit exempt-range list to get
  // the same result.
  for (const block of doc.query.all()) {
    const scored = [block, ...(block.type === 'table' ? tableCellsOf(block) : [])];
    for (const piece of scored) {
      if (!piece.readerText) continue;
      for (const run of piece.inlines || []) {
        if (run.kind !== 'text' || !run.text) continue;
        for (const match of run.text.matchAll(pattern)) {
          const wrong = match[1];
          const right = table[wrong.toLowerCase()];
          if (!right) continue;
          out.push({
            rule: 'read.dialect',
            line: doc.lineAt(run.sourceStart),
            message: `"${wrong}" is not ${target} spelling. Use "${matchCase(wrong, right)}".`,
            fix: {
              kind: 'edit',
              instruction: `Replace "${wrong}" with "${matchCase(wrong, right)}".`,
              patch: {
                file: doc.path,
                line: doc.lineAt(run.sourceStart),
                find: wrong,
                replace: matchCase(wrong, right),
              },
            },
          });
        }
      }
    }
  }

  return out;
}

function tableCellsOf(table) {
  return [...(table.header || []), ...(table.rows || []).flat()];
}

function matchCase(source, replacement) {
  if (source === source.toUpperCase()) return replacement.toUpperCase();
  if (source[0] === source[0].toUpperCase()) {
    return replacement[0].toUpperCase() + replacement.slice(1);
  }
  return replacement;
}
