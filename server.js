require("dotenv").config();
const express = require("express");
const path = require("path");
const { getCase } = require("./cases");
const {
  extractClues,
  buildPublicCase,
  mockReply,
  buildJudgePrompt,
  buildConfessionPrompt,
  mockJudge,
} = require("./lib/gameEngine");

const PORT = process.env.PORT || 3000;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "deepseek/deepseek-chat";
const MOCK_MODE = !OPENROUTER_API_KEY;

let activeCase;
try {
  activeCase = getCase(process.env.CASE_ID);
} catch (err) {
  console.error(`[game] ${err.message}`);
  process.exit(1);
}

console.log(`[game] Loaded case: ${activeCase.meta.title} (${activeCase.id})`);
if (MOCK_MODE) {
  console.warn(
    "\n[game] No OPENROUTER_API_KEY found in .env — running in OFFLINE DEMO MODE.\n" +
      "  Dialogue will be scripted rather than AI-generated. Add a key to .env to enable real chat.\n"
  );
} else {
  console.log(`[game] Using OpenRouter model: ${OPENROUTER_MODEL}`);
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ---- Public, spoiler-safe case data ------------------------------------------

app.get("/api/case", (req, res) => {
  res.json(buildPublicCase(activeCase));
});

// ---- Shared OpenRouter helper -----------------------------------------------

async function callOpenRouter(messages, { temperature = 0.85, max_tokens = 1000 } = {}) {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost",
      "X-Title": activeCase.meta.title,
    },
    body: JSON.stringify({ model: OPENROUTER_MODEL, messages, temperature, max_tokens }),
  });
  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    console.error("OpenRouter error", response.status, errText);
    throw new Error("openrouter_failed");
  }
  const data = await response.json();
  return data?.choices?.[0]?.message?.content || "";
}

// ---- Chat -----------------------------------------------------------------------

app.post("/api/chat", async (req, res) => {
  try {
    const { characterId, message, history } = req.body || {};
    const character = activeCase.characters[characterId];
    if (!character) return res.status(404).json({ error: "Unknown character" });
    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "Empty message" });
    }
    const safeHistory = Array.isArray(history) ? history.slice(-12) : [];

    if (MOCK_MODE) {
      const raw = mockReply(character, safeHistory, activeCase.clueLibrary);
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

    let raw;
    try {
      raw = await callOpenRouter(messages, { temperature: 0.85, max_tokens: 1000 });
    } catch {
      return res.status(502).json({ error: "The AI service failed to respond. Try again." });
    }

    const { cleaned, clues } = extractClues(raw, character.knownClues);
    res.json({ reply: cleaned || "...", clues });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ---- Accusation -------------------------------------------------------------

function parseJudgeJson(text) {
  const match = String(text || "").match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    return {
      weaponIdentified: !!parsed.weaponIdentified,
      motiveIdentified: !!parsed.motiveIdentified,
      opportunityIdentified: !!parsed.opportunityIdentified,
      feedback: typeof parsed.feedback === "string" ? parsed.feedback : "",
    };
  } catch {
    return null;
  }
}

app.post("/api/accuse", async (req, res) => {
  const { suspect, justification } = req.body || {};
  if (!activeCase.suspectOptions.some((s) => s.id === suspect)) {
    return res.status(400).json({ error: "Unknown suspect" });
  }
  const safeJustification = String(justification || "").trim().slice(0, 800);
  if (!safeJustification) {
    return res.status(400).json({ error: "Write a justification for your accusation first." });
  }

  const suspectCorrect = suspect === activeCase.solution.suspect;

  let verdict;
  if (MOCK_MODE) {
    verdict = mockJudge(activeCase, safeJustification);
  } else {
    try {
      const raw = await callOpenRouter(
        [
          { role: "system", content: buildJudgePrompt(activeCase) },
          { role: "user", content: `Justification: "${safeJustification}"` },
        ],
        { temperature: 0.2, max_tokens: 1000 }
      );
      verdict = parseJudgeJson(raw) || mockJudge(activeCase, safeJustification);
    } catch {
      verdict = mockJudge(activeCase, safeJustification);
    }
  }

  const correct = suspectCorrect && activeCase.solution.requiredElements.every((key) => verdict[key]);

  if (!correct) {
    let feedback = verdict.feedback || activeCase.loseNarrative;
    if (!suspectCorrect) {
      feedback = "You may be looking at the wrong person. " + feedback;
    }
    return res.json({ correct: false, feedback });
  }

  let confession = activeCase.confession.fallbackText;
  if (!MOCK_MODE) {
    try {
      confession = await callOpenRouter(
        [{ role: "system", content: buildConfessionPrompt(activeCase, safeJustification) }],
        { temperature: 0.9, max_tokens: 1000 }
      );
    } catch {
      confession = activeCase.confession.fallbackText;
    }
  }

  res.json({ correct: true, feedback: verdict.feedback, confession });
});

app.listen(PORT, () => {
  console.log(`[game] listening on http://localhost:${PORT}`);
});
