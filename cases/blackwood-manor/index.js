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
        "Word reached you within the hour. By the time you arrive at the gates, the " +
          "household has gathered inside — shaken, and not quite looking at each other.",
        "You are the detective. Walk the manor grounds, talk to the household, and piece " +
          "together what really happened. Everyone knows something. Not everyone is " +
          "telling the truth.",
      ],
    },

    // Spoiler-free prologue cinematic, played once before the intro modal.
    // `scene` picks a procedural renderer in public/game.js (falls back to a
    // generic one for unrecognized keys); `title`/`body` are plain text.
    cutscene: [
      {
        scene: "study_alone",
        title: "The Study — Blackwood Manor",
        body: "Lord Edmund Blackwood sits alone with a brandy at his elbow, the sound of " +
          "the party drifting faintly beyond the door.",
      },
      {
        scene: "time_passes",
        title: "Later That Evening",
        body: "The candle burns low. A clock somewhere in the house strikes nine, and the " +
          "evening goes on without him.",
      },
      {
        scene: "discovery",
        title: "Just Past Ten",
        body: "Jenkins comes to collect the tray — and finds his master slumped at the " +
          "desk, utterly still.",
      },
      {
        scene: "household_gathers",
        title: "Blackwood Manor",
        body: "A cry goes up through the halls. One by one, the household comes running.",
      },
    ],
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
