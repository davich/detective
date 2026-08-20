require("dotenv").config();
const express = require("express");
const path = require("path");
const {
  CHARACTERS,
  CLUE_LIBRARY,
  SOLUTION,
  SUSPECT_OPTIONS,
  WEAPON_OPTIONS,
  MOTIVE_OPTIONS,
  WIN_NARRATIVE,
  LOSE_NARRATIVE,
  buildPublicCharacter,
  label,
} = require("./story");

const PORT = process.env.PORT || 3000;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "deepseek/deepseek-chat";
const MOCK_MODE = !OPENROUTER_API_KEY;

if (MOCK_MODE) {
  console.warn(
    "\n[manor-mystery] No OPENROUTER_API_KEY found in .env — running in OFFLINE DEMO MODE.\n" +
      "  Dialogue will be scripted rather than AI-generated. Add a key to .env to enable real chat.\n"
  );
} else {
  console.log(`[manor-mystery] Using OpenRouter model: ${OPENROUTER_MODEL}`);
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ---- Public, spoiler-safe data -------------------------------------------------

app.get("/api/characters", (req, res) => {
  res.json(Object.values(CHARACTERS).map(buildPublicCharacter));
});

app.get("/api/clues", (req, res) => {
  res.json(CLUE_LIBRARY);
});

app.get("/api/options", (req, res) => {
  res.json({
    suspects: SUSPECT_OPTIONS,
    weapons: WEAPON_OPTIONS,
    motives: MOTIVE_OPTIONS,
  });
});

// ---- Chat -----------------------------------------------------------------------

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

function mockReply(character, history) {
  const turn = Math.floor(history.length / 2);
  const clueIds = character.knownClues;
  if (turn === 0) {
    return `${character.greeting} (offline demo mode — add OPENROUTER_API_KEY to .env for live AI dialogue)`;
  }
  const idx = turn - 1;
  if (idx < clueIds.length) {
    const id = clueIds[idx];
    const fact = CLUE_LIBRARY[id].label;
    return `[demo] Well, since you ask... ${fact} [CLUE:${id}]`;
  }
  return `[demo] I'm afraid I've told you everything I know, Detective.`;
}

app.post("/api/chat", async (req, res) => {
  try {
    const { characterId, message, history } = req.body || {};
    const character = CHARACTERS[characterId];
    if (!character) return res.status(404).json({ error: "Unknown character" });
    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "Empty message" });
    }
    const safeHistory = Array.isArray(history) ? history.slice(-12) : [];

    if (MOCK_MODE) {
      const raw = mockReply(character, safeHistory);
      const { cleaned, clues } = extractClues(raw, character.knownClues);
      return res.json({ reply: cleaned, clues });
    }

    const messages = [
      { role: "system", content: character.systemPrompt },
      ...safeHistory
        .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
        .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) })),
      { role: "user", content: message.slice(0, 1000) },
    ];

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost",
        "X-Title": "Blackwood Manor Mystery",
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages,
        temperature: 0.85,
        max_tokens: 260,
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      console.error("OpenRouter error", response.status, errText);
      return res.status(502).json({ error: "The AI service failed to respond. Try again." });
    }

    const data = await response.json();
    const raw = data?.choices?.[0]?.message?.content || "";
    const { cleaned, clues } = extractClues(raw, character.knownClues);
    res.json({ reply: cleaned || "...", clues });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ---- Accusation -------------------------------------------------------------

app.post("/api/accuse", (req, res) => {
  const { suspect, weapon, motive } = req.body || {};
  const correct =
    suspect === SOLUTION.suspect &&
    weapon === SOLUTION.weapon &&
    motive === SOLUTION.motive;

  if (correct) {
    return res.json({ correct: true, narrative: WIN_NARRATIVE });
  }

  res.json({
    correct: false,
    narrative: LOSE_NARRATIVE,
    hint: {
      suspectRight: suspect === SOLUTION.suspect,
      weaponRight: weapon === SOLUTION.weapon,
      motiveRight: motive === SOLUTION.motive,
    },
  });
});

app.listen(PORT, () => {
  console.log(`[manor-mystery] listening on http://localhost:${PORT}`);
});
