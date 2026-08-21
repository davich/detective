// Registry of playable cases (levels/storylines). To add a new one:
//   1. Create cases/<your-case-id>/ following the shape of cases/blackwood-manor
//      (see index.js there for the required fields: meta, settingPrompt, world,
//      characters, clueLibrary, suspectOptions, solution, judge, confession,
//      loseNarrative).
//   2. require() it below and add it to REGISTRY.
//   3. Run the server with CASE_ID=<your-case-id> to play it (defaults to the
//      first entry in REGISTRY).

const blackwoodManor = require("./blackwood-manor");

const REGISTRY = [blackwoodManor];

function listCases() {
  return REGISTRY.map((c) => ({ id: c.id, title: c.meta.title }));
}

function getCase(id) {
  if (!id) return REGISTRY[0];
  const found = REGISTRY.find((c) => c.id === id);
  if (!found) {
    const available = REGISTRY.map((c) => c.id).join(", ");
    throw new Error(`Unknown CASE_ID "${id}". Available cases: ${available}`);
  }
  return found;
}

module.exports = { REGISTRY, listCases, getCase };
