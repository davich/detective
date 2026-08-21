// Assembles the "Blackwood Manor" case object consumed by lib/gameEngine.js
// and server.js. This is the shape every case under cases/ must export —
// see cases/index.js and README.md for how to add a new one.

const world = require("./world");
const {
  SETTING,
  CHARACTERS,
  CLUE_LIBRARY,
  SUSPECT_OPTIONS,
  SOLUTION_SUSPECT,
  REQUIRED_JUDGE_ELEMENTS,
  CASE_SOLUTION_BRIEF,
  MOCK_JUDGE_PATTERNS,
  CONFESSION,
  LOSE_NARRATIVE,
} = require("./story");

module.exports = {
  id: "blackwood-manor",

  meta: {
    title: "Blackwood Manor",
    tagline: "A Murder Mystery",
    objective:
      'Find Edmund\'s killer. Walk with WASD/Arrows, press E near someone to talk.',
    intro: {
      heading: "Blackwood Manor",
      paragraphs: [
        "Lord Edmund Blackwood was found dead in his study tonight, during a small " +
          "family gathering at the estate. The household believes it was his heart — but " +
          "the brandy glass beside him tells a different story.",
        "You are the detective. Walk the manor grounds, talk to the household, and piece " +
          "together what really happened. Everyone knows something. Not everyone is " +
          "telling the truth.",
      ],
    },
  },

  settingPrompt: SETTING,
  world,
  characters: CHARACTERS,
  clueLibrary: CLUE_LIBRARY,
  suspectOptions: SUSPECT_OPTIONS,

  solution: {
    suspect: SOLUTION_SUSPECT,
    requiredElements: REQUIRED_JUDGE_ELEMENTS,
  },

  judge: {
    solutionBrief: CASE_SOLUTION_BRIEF,
    mockPatterns: MOCK_JUDGE_PATTERNS,
  },

  confession: CONFESSION,
  loseNarrative: LOSE_NARRATIVE,
};
