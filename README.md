# Blackwood Manor Mystery

A 2D top-down mystery prototype where you talk to LLM-driven characters to solve a murder.

The game engine (`server.js`, `lib/gameEngine.js`, `public/game.js`) is generic — it
renders whatever world/characters/story a "case" provides. "Blackwood Manor" is just
the case that ships by default, under `cases/blackwood-manor/`.

## Requirements

- Node.js 18+
- (Optional) an [OpenRouter](https://openrouter.ai/keys) API key for AI-generated dialogue. Without one, the game runs in offline demo mode with scripted dialogue instead.

## Quick start

```bash
./run.sh
```

This installs dependencies on first run, creates a `.env` file if you don't have one yet, and starts the server. Then open **http://localhost:3000** in your browser.

## Manual setup

```bash
npm install
cp .env.example .env   # then edit .env and add your OpenRouter API key
npm start
```

## Configuration

Set these in `.env`:

| Variable | Description |
| --- | --- |
| `OPENROUTER_API_KEY` | Your OpenRouter API key. Leave blank to run in offline demo mode. |
| `OPENROUTER_MODEL` | Model slug to use (default: `deepseek/deepseek-chat`). See [openrouter.ai/models](https://openrouter.ai/models). |
| `PORT` | Port to run the server on (default: `3000`). |
| `CASE_ID` | Which case (level/storyline) to serve, from `cases/index.js` (default: the first registered case). |

## Adding a new case (level / storyline / cast of characters)

Each case is a self-contained folder under `cases/`. Copy `cases/blackwood-manor/`
as a starting point:

- `story.js` — the narrative setting, each character (bio, room, look, greeting,
  per-character `systemPrompt`, and the clue ids they can reveal), the clue library,
  suspect list, the true solution, the judge's keyword patterns (for offline demo
  mode), and the killer's confession briefing.
- `world.js` — the map: rooms, props, circular obstacles (fountains, pillars, ...),
  and examine points (clickable/`E`-able scene details tied to a clue). This is
  spoiler-safe data served straight to the client, so no case secrets belong here.
- `index.js` — assembles the above into the case object the engine expects (see the
  comments in `cases/index.js` for the exact required shape).

Then register it in `cases/index.js` and either make it the first entry (the
default) or select it per-run with `CASE_ID=your-case-id npm start`.

Everything else — rendering, movement/collision, dialogue, the notebook, the
accusation/judge/confession flow, and localStorage save/load — is generic and lives
in `lib/gameEngine.js`, `server.js`, and `public/game.js`; you shouldn't need to
touch them to ship a new case.

## Development

```bash
npm run dev
```

Runs the server with `node --watch`, restarting automatically on file changes.
