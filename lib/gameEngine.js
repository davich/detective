// Case-agnostic game logic shared by every case: clue-tag parsing, the
// spoiler-safe payload sent to the client, and the judge/confession/mock-mode
// prompt builders. None of this file knows anything about Blackwood Manor
// specifically — all story content comes from the `activeCase` passed in.

const CLUE_TAG_RE = /\[CLUE:([a-zA-Z0-9_]+)\]/g;

function extractClues(text, allowedIds) {
  const found = new Set();
  let match;
  while ((match = CLUE_TAG_RE.exec(text)) !== null) {
    if (allowedIds.includes(match[1])) found.add(match[1]);
  }
  const cleaned = text.replace(CLUE_TAG_RE, "").trim();
  return { cleaned, clues: Array.from(found) };
}

function buildPublicCharacter(c) {
  return {
    id: c.id,
    name: c.name,
    title: c.title,
    room: c.room,
    pos: c.pos,
    colors: c.colors,
    look: c.look || {},
    greeting: c.greeting,
    description: c.description,
    suggestedQuestions: c.suggestedQuestions || [],
  };
}

// Everything the client needs to boot: case meta/world for rendering, public
// character info, the clue library, and the suspect list for the accusation
// form. Deliberately excludes systemPrompt, knownClues, solution, and judge/
// confession data.
function buildPublicCase(activeCase) {
  return {
    id: activeCase.id,
    meta: activeCase.meta,
    world: activeCase.world,
    characters: Object.values(activeCase.characters).map(buildPublicCharacter),
    clueLibrary: activeCase.clueLibrary,
    suspects: activeCase.suspectOptions,
  };
}

function mockReply(character, history, clueLibrary) {
  const turn = Math.floor(history.length / 2);
  const clueIds = character.knownClues;
  if (turn === 0) {
    return `${character.greeting} (offline demo mode — add OPENROUTER_API_KEY to .env for live AI dialogue)`;
  }
  const idx = turn - 1;
  if (idx < clueIds.length) {
    const id = clueIds[idx];
    const fact = clueLibrary[id].label;
    return `[demo] Well, since you ask... ${fact} [CLUE:${id}]`;
  }
  return `[demo] I'm afraid I've told you everything I know, Detective.`;
}

function buildJudgePrompt(activeCase) {
  return `You are the impartial judge for a murder-mystery detective game called
"${activeCase.meta.title}". ${activeCase.judge.solutionBrief}

The player has named a suspect (handled separately, NOT part of your evaluation) and
written a free-text justification for their accusation. Judge ONLY the justification
text below on whether it correctly and specifically identifies these elements of the
true solution through actual reasoning, not a lucky guess or a vague accusation.

Respond with ONLY a single valid JSON object and nothing else — no markdown fences, no
commentary before or after — in exactly this shape:
{"weaponIdentified": true or false, "motiveIdentified": true or false, "opportunityIdentified": true or false, "feedback": "2-3 sentences of in-world feedback for the detective, encouraging if they're close, but never stating the true solution outright if they're missing a piece of it"}`;
}

function buildConfessionPrompt(activeCase, justification) {
  const character = activeCase.characters[activeCase.confession.characterId];
  const safeJustification = String(justification || "").slice(0, 800);
  return `${activeCase.settingPrompt}

You are ${character.name.toUpperCase()}. ${activeCase.confession.briefing}

The detective has just confronted you directly, in front of the household, with this
case against you:
"${safeJustification}"

The evidence is airtight and you know it — there is no more room to lie. Break down
and confess fully, in your own voice, in first person. Explain, with real emotion
(fear, shame, defiance, whatever feels true to ${character.name} in this moment), what
actually happened. Keep it to a short, dramatic monologue of 4-8 sentences. Do not
break character, do not mention that you are an AI, do not include any [CLUE:...]
tags, and do not add any narration outside of what ${character.name} themself would
say.`;
}

function mockJudge(activeCase, justification) {
  const text = String(justification || "").toLowerCase();
  const { weaponIdentified: weaponRe, motiveIdentified: motiveRe, opportunityIdentified: opportunityRe } =
    activeCase.judge.mockPatterns;
  const weaponIdentified = weaponRe.test(text);
  const motiveIdentified = motiveRe.test(text);
  const opportunityIdentified = opportunityRe.test(text);
  let feedback;
  if (weaponIdentified && motiveIdentified) {
    feedback = "Your case holds together — the method and the reason both check out.";
  } else if (weaponIdentified || motiveIdentified) {
    feedback = "You're onto something, but your case is only half-built. What's missing — the how, or the why?";
  } else {
    feedback = "This doesn't hold up yet. You'll need something concrete tying your suspect to both a method and a reason.";
  }
  return { weaponIdentified, motiveIdentified, opportunityIdentified, feedback };
}

module.exports = {
  extractClues,
  buildPublicCharacter,
  buildPublicCase,
  mockReply,
  buildJudgePrompt,
  buildConfessionPrompt,
  mockJudge,
};
