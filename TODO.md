# Blackwood Manor Mystery — Improvement TODO

Ideas for taking the prototype further. Nothing here is scheduled — pick off
whatever's most fun or highest-impact next.

## Audio
- [ ] Ambient background music (looping, per-room or global; e.g. tense strings for
      the manor, softer tone in the garden)
- [ ] SFX: footsteps, door/interact "E" prompt sound, notebook open/close,
      clue-discovered chime, accusation drumroll/sting
- [ ] Voice-over or text-blip sound (Animal Crossing–style) during dialogue typing
- [ ] Mute/volume controls in the HUD

## Graphics — characters & world
- [ ] Replace primitive canvas shapes (rects/circles in `game.js`) with actual
      sprite art for the player and NPCs — even a simple 2–4 frame walk cycle
      would be a big upgrade over the current stick-figure blobs
- [ ] Per-character sprites/portraits matching their `look` data in `story.js`
      (currently just color blocks) — also use for the dialogue panel portrait
- [ ] Tile-based floor/wall textures instead of flat `fillRect` floors
- [ ] Prop art (desk, shelf, sofa, fountain, etc.) instead of solid-color boxes
- [ ] Lighting/shadow pass — soft character shadow, warmer light in interiors vs.
      cooler light in the garden
- [ ] Simple idle/walk animation state machine (currently characters look static
      apart from a bob)
- [ ] Weather/time-of-day flavor for the outdoor garden scene

## UI / UX polish
- [ ] Animated transitions for modals (intro, accusation, result) instead of
      instant show/hide
- [ ] Visual "new clue" toast/notification when a clue is added to the notebook
      (not just the counter incrementing)
- [ ] Minimap or room labels visible while walking, not just on entry
- [ ] Typing indicator while waiting on the LLM response in dialogue
- [ ] Mobile/touch controls (on-screen joystick + interact button) — right now
      it's keyboard-only (WASD/arrows + E)
- [ ] Accessibility: focus states, ARIA labels on modals, colorblind-friendly
      palette check, adjustable text size

## Gameplay depth
- [ ] More cases/storylines beyond Blackwood Manor (engine already supports this
      via `cases/`) — a second mystery would prove out the "generic engine" design
- [ ] Difficulty/hint system — e.g. a limited number of hints if stuck, or a
      timer/day-cycle that adds pressure
- [ ] Branching consequences — suspects react differently if you've already
      confronted them with a clue
- [ ] Red herrings / false leads that need to be discredited, not just clues that
      all point one way
- [ ] Multiple endings beyond "correct/incorrect accusation" (e.g. partial credit
      for right suspect wrong motive)
- [ ] Inventory or evidence board view (corkboard with string, detective-style)
      instead of/alongside the notebook list

## AI / dialogue
- [ ] Smarter offline demo-mode dialogue (currently keyword/pattern based per
      README) — maybe a small local rules engine with more variety
- [ ] Memory across characters — an NPC could reference something the player told
      a different NPC, for more of a "living manor" feel
- [ ] Cost/latency guardrails on the OpenRouter calls (streaming responses,
      response caching for repeated questions)
- [ ] Content moderation / guard-railing so player free-text input can't derail
      characters off-story

## Engineering / infra
- [ ] Automated tests for `lib/gameEngine.js` (save/load, clue tracking,
      accusation judging) — currently no test suite in `package.json`
- [ ] Loading state / error handling in `game.js` if the OpenRouter API errors or
      times out mid-conversation
- [ ] Config validation on startup (clear error if `OPENROUTER_API_KEY` present
      but invalid, vs. silently falling back to demo mode)
