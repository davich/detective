(() => {
  "use strict";

  // ---------------------------------------------------------------------
  // World layout — populated from /api/case on boot() so any case can supply
  // its own map without touching this file. See cases/*/world.js for shape.
  // ---------------------------------------------------------------------
  const VIEW_W = 960;
  const VIEW_H = 600;
  const INTERACT_RADIUS = 78;

  let WORLD_W = VIEW_W;
  let WORLD_H = VIEW_H;
  let ROOMS = [];
  let PROPS = [];
  let CIRCLE_OBSTACLES = [];
  let EXAMINE_POINTS = [];

  // Decorative renderers an examine point can opt into via its `decor` field.
  // Add new keys here as new cases need new scene dressing.
  const EXAMINE_DECOR_RENDERERS = {
    chalk_outline(point) {
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.ellipse(point.x - 40, point.y + 30, 26, 12, 0.3, 0, Math.PI * 2);
      ctx.moveTo(point.x - 30, point.y + 22);
      ctx.lineTo(point.x + 10, point.y - 4);
      ctx.lineTo(point.x + 40, point.y + 6);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = "#7a2e1a";
      ctx.beginPath();
      ctx.ellipse(point.x + 18, point.y - 8, 14, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    },
  };

  // ---------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const player = {
    x: 0,
    y: 0,
    w: 26,
    h: 34,
    speed: 210,
    facing: 1,
    moving: false,
  };

  const keys = new Set();
  let npcs = [];
  let clueLibrary = {};
  let suspects = [];
  let discovered = []; // ordered clue ids
  const discoveredSet = new Set();
  const conversations = {}; // characterId -> {history:[]}
  const examinedSet = new Set();

  let dialogueOpen = false;
  let activeCharacterId = null;
  let notebookOpen = false;
  let sending = false;
  let introDismissed = false;
  let resetting = false;
  let cutsceneSeen = false;

  // ---------------------------------------------------------------------
  // Save / load (localStorage)
  // ---------------------------------------------------------------------
  // Scoped per case id (set in boot()) so switching cases never loads another
  // case's save data (mismatched clue ids, out-of-bounds player position, etc).
  let SAVE_KEY = "game-save-v1";

  function loadSavedState() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function saveState() {
    if (resetting) return;
    try {
      const state = {
        player: { x: player.x, y: player.y, facing: player.facing },
        discovered,
        examined: Array.from(examinedSet),
        conversations,
        introDismissed,
        cutsceneSeen,
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    } catch {
      // localStorage unavailable (private mode, quota, etc.) — progress just won't persist
    }
  }

  function clearSavedState() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      // ignore
    }
  }

  function applySavedState(saved) {
    if (!saved) return;

    if (saved.player && Number.isFinite(saved.player.x) && Number.isFinite(saved.player.y)) {
      player.x = saved.player.x;
      player.y = saved.player.y;
      if (saved.player.facing === 1 || saved.player.facing === -1) player.facing = saved.player.facing;
    }

    if (Array.isArray(saved.discovered)) {
      saved.discovered.forEach((id) => {
        if (clueLibrary[id] && !discoveredSet.has(id)) {
          discoveredSet.add(id);
          discovered.push(id);
        }
      });
      document.getElementById("clue-count").textContent = String(discovered.length);
    }

    if (Array.isArray(saved.examined)) {
      saved.examined.forEach((id) => examinedSet.add(id));
    }

    if (saved.conversations && typeof saved.conversations === "object") {
      Object.keys(saved.conversations).forEach((id) => {
        if (conversations[id] && Array.isArray(saved.conversations[id].history)) {
          conversations[id].history = saved.conversations[id].history;
        }
      });
    }

    if (saved.introDismissed) {
      introDismissed = true;
    }
    if (saved.cutsceneSeen) {
      cutsceneSeen = true;
    }
  }

  // ---------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------
  function applyCaseMeta(meta) {
    document.title = `${meta.title} — ${meta.tagline || ""}`.trim().replace(/\s*—\s*$/, "");
    document.getElementById("hud-title").textContent = meta.title;
    document.getElementById("hud-objective").innerHTML =
      `${escapeHtml(meta.objective)} <kbd>WASD</kbd>/<kbd>Arrows</kbd> to move, <kbd>E</kbd> to interact.`;

    document.getElementById("intro-heading").textContent = (meta.intro && meta.intro.heading) || meta.title;
    const copy = document.getElementById("intro-copy");
    copy.innerHTML = "";
    ((meta.intro && meta.intro.paragraphs) || []).forEach((text, i) => {
      const p = document.createElement("p");
      p.className = i === 0 ? "lede" : "";
      p.textContent = text;
      copy.appendChild(p);
    });
  }

  function applyWorld(world) {
    WORLD_W = world.width;
    WORLD_H = world.height;
    ROOMS = world.rooms || [];
    PROPS = world.props || [];
    CIRCLE_OBSTACLES = world.circleObstacles || [];
    EXAMINE_POINTS = world.examinePoints || [];
    player.x = world.playerStart.x;
    player.y = world.playerStart.y;
  }

  async function boot() {
    const caseData = await fetch("/api/case").then((r) => r.json());

    SAVE_KEY = `game-save-${caseData.id}-v1`;
    clueLibrary = caseData.clueLibrary;
    suspects = caseData.suspects;

    applyCaseMeta(caseData.meta);
    applyWorld(caseData.world);

    npcs = caseData.characters.map((c) => ({
      ...c,
      w: 26,
      h: 34,
      facing: -1,
      bobSeed: Math.random() * 10,
    }));

    npcs.forEach((n) => (conversations[n.id] = { history: [] }));

    applySavedState(loadSavedState());

    populateAccuseOptions();
    bindInput();
    bindUI();

    if (!introDismissed) {
      const scenes = (caseData.meta && caseData.meta.cutscene) || [];
      if (!cutsceneSeen && scenes.length) {
        startCutscene(scenes);
      } else {
        document.getElementById("intro-modal").classList.remove("hidden");
      }
    }

    setInterval(saveState, 2000);
    window.addEventListener("pagehide", saveState);
    window.addEventListener("beforeunload", saveState);

    requestAnimationFrame(loop);
  }

  // ---------------------------------------------------------------------
  // Prologue cutscene — a short, spoiler-free cinematic played once before
  // the intro modal, showing the death being discovered (no clues, no
  // culprit). Scenes are data-driven (case.meta.cutscene) so any case can
  // supply its own beats; rendering is a small library of procedural,
  // silhouette-style scenes keyed by `scene`, with a generic fallback for
  // unrecognized keys so a case can ship without adding new art.
  // ---------------------------------------------------------------------
  const cutsceneCanvas = document.getElementById("cutscene-canvas");
  const cutsceneCtx = cutsceneCanvas.getContext("2d");
  const CUTSCENE_HOLD_MS = 7000;

  let cutsceneScenes = [];
  let cutsceneIndex = 0;
  let cutsceneSceneStart = 0;
  let cutsceneRAF = null;

  function startCutscene(scenes) {
    cutsceneScenes = scenes;
    cutsceneIndex = 0;
    cutsceneSceneStart = performance.now();
    document.getElementById("cutscene-modal").classList.remove("hidden");
    buildCutsceneDots();
    showCutsceneCaption(cutsceneScenes[0]);
    cutsceneRAF = requestAnimationFrame(cutsceneFrame);
  }

  function cutsceneFrame(now) {
    const scene = cutsceneScenes[cutsceneIndex];
    if (!scene) return;
    const t = now - cutsceneSceneStart;
    drawCutsceneScene(scene, t);
    if (t >= CUTSCENE_HOLD_MS) {
      cutsceneAdvance();
    } else {
      cutsceneRAF = requestAnimationFrame(cutsceneFrame);
    }
  }

  function cutsceneAdvance() {
    if (cutsceneRAF) cancelAnimationFrame(cutsceneRAF);
    cutsceneIndex += 1;
    if (cutsceneIndex >= cutsceneScenes.length) {
      finishCutscene();
      return;
    }
    cutsceneSceneStart = performance.now();
    updateCutsceneDots();
    showCutsceneCaption(cutsceneScenes[cutsceneIndex]);
    cutsceneRAF = requestAnimationFrame(cutsceneFrame);
  }

  function finishCutscene() {
    if (cutsceneRAF) cancelAnimationFrame(cutsceneRAF);
    cutsceneRAF = null;
    cutsceneSeen = true;
    saveState();
    document.getElementById("cutscene-modal").classList.add("hidden");
    document.getElementById("intro-modal").classList.remove("hidden");
  }

  function buildCutsceneDots() {
    const wrap = document.getElementById("cutscene-dots");
    wrap.innerHTML = "";
    cutsceneScenes.forEach((_, i) => {
      const d = document.createElement("div");
      d.className = "dot" + (i === 0 ? " active" : "");
      wrap.appendChild(d);
    });
  }

  function updateCutsceneDots() {
    const dots = document.querySelectorAll("#cutscene-dots .dot");
    dots.forEach((d, i) => d.classList.toggle("active", i === cutsceneIndex));
  }

  function showCutsceneCaption(scene) {
    const caption = document.getElementById("cutscene-caption");
    caption.classList.remove("show");
    setTimeout(() => {
      document.getElementById("cutscene-caption-title").textContent = scene.title || "";
      document.getElementById("cutscene-caption-body").textContent = scene.body || "";
      caption.classList.add("show");
    }, 220);
  }

  function vignetteOverlay(c, w, h, strength) {
    const g = c.createRadialGradient(w / 2, h * 0.52, h * 0.16, w / 2, h * 0.52, h * 0.78);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, `rgba(0,0,0,${strength})`);
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  }

  function drawGlow(c, x, y, r, color) {
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = g;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
  }

  // Simple humanoid silhouette (seated or standing), reused across scenes.
  function drawFigure(c, x, y, opts = {}) {
    const scale = opts.scale || 1;
    const tone = opts.tone || "#0a0710";
    c.save();
    c.translate(x, y);
    c.scale(scale, scale);
    c.fillStyle = tone;
    if (opts.seated) {
      c.save();
      c.rotate(opts.lean || 0.18);
      c.beginPath();
      c.ellipse(0, -30, 15, 24, 0, 0, Math.PI * 2);
      c.fill();
      c.restore();
      c.beginPath();
      c.arc(opts.headX || 6, opts.headY || -56, 10, 0, Math.PI * 2);
      c.fill();
    } else {
      c.fillRect(-9, -46, 18, 42);
      c.beginPath();
      c.arc(0, -54, 10, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  }

  function renderStudyAlone(c, w, h, t) {
    const flicker = 0.9 + Math.sin(t / 140) * 0.06 + Math.sin(t / 71) * 0.03;
    drawGlow(c, 350, 360, 230 * flicker, "rgba(214,150,70,0.35)");
    // desk
    c.fillStyle = "#1c130c";
    c.fillRect(270, 372, 190, 46);
    // seated figure at the desk
    drawFigure(c, 350, 372, { seated: true, lean: 0.12 });
    // glass on the desk, catching the glow
    c.fillStyle = "rgba(214,150,70,0.85)";
    c.beginPath();
    c.ellipse(420, 366, 5, 3, 0, 0, Math.PI * 2);
    c.fill();
    // tall window, cool moonlight, right side
    const win = c.createLinearGradient(0, 60, 0, 420);
    win.addColorStop(0, "rgba(90,110,150,0.16)");
    win.addColorStop(1, "rgba(40,50,70,0.05)");
    c.fillStyle = win;
    c.fillRect(760, 60, 140, 360);
  }

  function renderTimePasses(c, w, h, t, holdMs) {
    const progress = Math.min(1, t / holdMs);
    const flicker = (0.55 - progress * 0.3) + Math.sin(t / 110) * 0.05;
    drawGlow(c, 350, 360, 190 * Math.max(flicker, 0.15), "rgba(214,150,70,0.3)");
    c.fillStyle = "#1c130c";
    c.fillRect(270, 372, 190, 46);
    drawFigure(c, 350, 372, { seated: true, lean: 0.12, tone: "#080609" });
    // a small clock, hand slowly sweeping, top corner
    c.save();
    c.translate(860, 90);
    c.strokeStyle = "rgba(232,201,136,0.4)";
    c.lineWidth = 2;
    c.beginPath();
    c.arc(0, 0, 26, 0, Math.PI * 2);
    c.stroke();
    c.save();
    c.rotate((t / 1400) * Math.PI * 2);
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(0, -18);
    c.stroke();
    c.restore();
    c.restore();
    // darkening overlay as the scene progresses
    c.fillStyle = `rgba(4,3,6,${progress * 0.35})`;
    c.fillRect(0, 0, w, h);
  }

  function renderDiscovery(c, w, h, t) {
    const startle = Math.max(0, 1 - t / 500);
    // hallway light spilling through an open door, left side
    const doorGlow = c.createLinearGradient(0, 0, 260, 0);
    doorGlow.addColorStop(0, "rgba(214,170,110,0.28)");
    doorGlow.addColorStop(1, "rgba(214,170,110,0)");
    c.fillStyle = doorGlow;
    c.fillRect(0, 0, 260, h);

    drawGlow(c, 350, 360, 150, "rgba(214,150,70,0.22)");
    c.fillStyle = "#1c130c";
    c.fillRect(270, 372, 190, 46);
    // figure now slumped forward over the desk
    drawFigure(c, 350, 372, { seated: true, lean: 0.62, headX: 24, headY: -34, tone: "#08060a" });

    // Jenkins in the doorway, startled
    const jitter = startle * Math.sin(t / 18) * 3;
    drawFigure(c, 150 + jitter, 400, { scale: 1.02, tone: "#0a0710" });
    // a dropped tray/cup, small circles settling near his feet
    if (t > 450) {
      c.fillStyle = "rgba(200,190,180,0.55)";
      c.beginPath();
      c.ellipse(178, 424, 9, 3, 0, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.arc(196, 420, 3, 0, Math.PI * 2);
      c.fill();
    }
    // a heartbeat-like double vignette pulse for emphasis
    const pulse = Math.max(0, Math.sin(t / 900) * 0.12);
    c.fillStyle = `rgba(0,0,0,${pulse})`;
    c.fillRect(0, 0, w, h);
  }

  function renderHouseholdGathers(c, w, h, t) {
    const p = Math.min(1, t / 3200);
    const doorGlow = c.createLinearGradient(300, 0, 660, 0);
    doorGlow.addColorStop(0, "rgba(214,170,110,0)");
    doorGlow.addColorStop(0.5, "rgba(214,170,110,0.3)");
    doorGlow.addColorStop(1, "rgba(214,170,110,0)");
    c.fillStyle = doorGlow;
    c.fillRect(300, 40, 360, h - 80);

    const bob = (seed) => Math.sin(t / 130 + seed) * 2;
    // two figures hurrying in from the left
    drawFigure(c, 120 + p * 190, 470 + bob(1), { tone: "#0a0710" });
    drawFigure(c, 60 + p * 150, 500 + bob(2), { scale: 0.94, tone: "#0a0710" });
    // one from the right
    drawFigure(c, 860 - p * 190, 480 + bob(3), { scale: 0.98, tone: "#0a0710" });
    // the still figure at the center, glimpsed through the gathering crowd
    drawGlow(c, 480, 330, 130, "rgba(214,150,70,0.18)");
    drawFigure(c, 480, 350, { seated: true, lean: 0.5, headX: 20, headY: -34, tone: "#060509" });
  }

  function renderGenericScene(c, w, h, t) {
    const flicker = 0.9 + Math.sin(t / 150) * 0.06;
    drawGlow(c, w / 2, h * 0.6, 220 * flicker, "rgba(214,150,70,0.25)");
    drawFigure(c, w / 2, h * 0.62, { seated: true, lean: 0.15, tone: "#0a0710" });
  }

  const CUTSCENE_RENDERERS = {
    study_alone: renderStudyAlone,
    time_passes: renderTimePasses,
    discovery: renderDiscovery,
    household_gathers: renderHouseholdGathers,
  };

  function drawCutsceneScene(scene, t) {
    const c = cutsceneCtx;
    const w = cutsceneCanvas.width;
    const h = cutsceneCanvas.height;
    c.clearRect(0, 0, w, h);
    const bg = c.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, "#161020");
    bg.addColorStop(1, "#08060b");
    c.fillStyle = bg;
    c.fillRect(0, 0, w, h);

    const renderer = CUTSCENE_RENDERERS[scene.scene] || renderGenericScene;
    renderer(c, w, h, t, CUTSCENE_HOLD_MS);
    vignetteOverlay(c, w, h, 0.5);
  }

  // ---------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------
  function isTypingTarget(el) {
    return el && (el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "TEXTAREA");
  }

  function bindInput() {
    window.addEventListener("keydown", (e) => {
      if (isTypingTarget(e.target)) {
        if (e.key === "Escape") e.target.blur();
        return;
      }
      const k = e.key.toLowerCase();
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) {
        keys.add(k);
        e.preventDefault();
      }
      if (k === "e") {
        e.preventDefault();
        tryInteract();
      }
      if (k === "escape") closeTopLayer();
      if (k === "tab") {
        e.preventDefault();
        toggleNotebook();
      }
    });
    window.addEventListener("keyup", (e) => {
      keys.delete(e.key.toLowerCase());
    });
  }

  function closeTopLayer() {
    if (!document.getElementById("cutscene-modal").classList.contains("hidden")) finishCutscene();
    else if (dialogueOpen) closeDialogue();
    else if (!document.getElementById("accuse-modal").classList.contains("hidden")) hideAccuseModal();
    else if (!document.getElementById("reset-modal").classList.contains("hidden")) {
      document.getElementById("reset-modal").classList.add("hidden");
    } else if (notebookOpen) toggleNotebook();
  }

  // ---------------------------------------------------------------------
  // UI wiring
  // ---------------------------------------------------------------------
  function bindUI() {
    document.getElementById("cutscene-skip").addEventListener("click", (e) => {
      e.stopPropagation();
      finishCutscene();
    });
    document.getElementById("cutscene-modal").addEventListener("click", (e) => {
      if (e.target.id === "cutscene-skip") return;
      cutsceneAdvance();
    });

    document.getElementById("begin-btn").addEventListener("click", () => {
      document.getElementById("intro-modal").classList.add("hidden");
      introDismissed = true;
      saveState();
    });

    document.getElementById("reset-btn").addEventListener("click", () => {
      document.getElementById("reset-modal").classList.remove("hidden");
    });
    document.getElementById("reset-cancel").addEventListener("click", () => {
      document.getElementById("reset-modal").classList.add("hidden");
    });
    document.getElementById("reset-confirm").addEventListener("click", () => {
      resetting = true;
      clearSavedState();
      window.location.reload();
    });

    document.getElementById("notebook-btn").addEventListener("click", toggleNotebook);
    document.getElementById("notebook-close").addEventListener("click", toggleNotebook);

    document.getElementById("dialogue-close").addEventListener("click", closeDialogue);
    document.getElementById("dialogue-form").addEventListener("submit", (e) => {
      e.preventDefault();
      submitDialogue();
    });

    document.getElementById("accuse-btn").addEventListener("click", showAccuseModal);
    document.getElementById("accuse-cancel").addEventListener("click", hideAccuseModal);
    document.getElementById("accuse-form").addEventListener("submit", (e) => {
      e.preventDefault();
      submitAccusation();
    });

    document.getElementById("result-close").addEventListener("click", () => {
      document.getElementById("result-modal").classList.add("hidden");
    });
  }

  function populateAccuseOptions() {
    fillSelect("accuse-suspect", suspects);
  }
  function fillSelect(id, opts) {
    const el = document.getElementById(id);
    el.innerHTML = "";
    opts.forEach((o) => {
      const opt = document.createElement("option");
      opt.value = o.id;
      opt.textContent = o.label;
      el.appendChild(opt);
    });
  }

  function showAccuseModal() {
    document.getElementById("accuse-modal").classList.remove("hidden");
  }
  function hideAccuseModal() {
    document.getElementById("accuse-modal").classList.add("hidden");
  }

  async function submitAccusation() {
    const suspect = document.getElementById("accuse-suspect").value;
    const justification = document.getElementById("accuse-justification").value.trim();
    if (!justification) return;

    const submitBtn = document.getElementById("accuse-submit");
    submitBtn.disabled = true;
    submitBtn.textContent = "Weighing the case…";

    let res;
    try {
      res = await fetch("/api/accuse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suspect, justification }),
      }).then((r) => r.json());
    } catch {
      res = { correct: false, feedback: "Something went wrong reaching the AI service. Try again." };
    }

    submitBtn.disabled = false;
    submitBtn.textContent = "Accuse";
    hideAccuseModal();

    const title = document.getElementById("result-title");
    title.textContent = res.correct ? "Case Closed" : "Not Quite";
    title.className = res.correct ? "win" : "lose";
    document.getElementById("result-narrative").textContent = res.error || res.feedback || "";

    const confessionEl = document.getElementById("result-confession");
    if (res.correct && res.confession) {
      confessionEl.textContent = res.confession;
      confessionEl.classList.remove("hidden");
    } else {
      confessionEl.classList.add("hidden");
    }
    document.getElementById("result-modal").classList.remove("hidden");
  }

  // ---------------------------------------------------------------------
  // Notebook
  // ---------------------------------------------------------------------
  function toggleNotebook() {
    notebookOpen = !notebookOpen;
    document.getElementById("notebook-panel").classList.toggle("hidden", !notebookOpen);
    if (notebookOpen) renderNotebook();
  }

  function renderNotebook() {
    const list = document.getElementById("notebook-list");
    const empty = document.getElementById("notebook-empty");
    list.innerHTML = "";
    empty.classList.toggle("hidden", discovered.length > 0);
    discovered.forEach((id) => {
      const clue = clueLibrary[id];
      if (!clue) return;
      const div = document.createElement("div");
      div.className = "clue-card";
      div.innerHTML = `${escapeHtml(clue.label)}<span class="clue-source">${escapeHtml(clue.source)}</span>`;
      list.appendChild(div);
    });
  }

  function addClue(id) {
    if (!id || discoveredSet.has(id) || !clueLibrary[id]) return;
    discoveredSet.add(id);
    discovered.push(id);
    document.getElementById("clue-count").textContent = String(discovered.length);
    if (notebookOpen) renderNotebook();
    saveState();
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  // ---------------------------------------------------------------------
  // Dialogue
  // ---------------------------------------------------------------------
  function openDialogueWith(npc) {
    dialogueOpen = true;
    activeCharacterId = npc.id;
    document.getElementById("dialogue-panel").classList.remove("hidden");
    document.getElementById("dialogue-name").textContent = npc.name;
    document.getElementById("dialogue-title").textContent = npc.title;
    document.getElementById("dialogue-avatar").style.background = npc.colors.body;
    document.getElementById("dialogue-avatar").style.borderColor = npc.colors.accent;

    const log = document.getElementById("dialogue-log");
    log.innerHTML = "";
    const conv = conversations[npc.id];
    if (conv.history.length === 0) {
      appendBubble("them", npc.greeting);
      conv.history.push({ role: "assistant", content: npc.greeting });
      saveState();
    } else {
      conv.history.forEach((m) => appendBubble(m.role === "user" ? "me" : "them", m.content));
    }
    document.getElementById("dialogue-form").classList.remove("hidden");
    document.getElementById("dialogue-input").value = "";
    document.getElementById("dialogue-input").focus();

    const hasAsked = conv.history.some((m) => m.role === "user");
    if (!hasAsked && npc.suggestedQuestions && npc.suggestedQuestions.length) {
      renderSuggestions(npc.suggestedQuestions);
    } else {
      hideSuggestions();
    }
  }

  function renderSuggestions(questions) {
    const box = document.getElementById("dialogue-suggestions");
    box.innerHTML = "";
    questions.forEach((q) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "suggestion-chip";
      btn.textContent = q;
      btn.addEventListener("click", () => {
        document.getElementById("dialogue-input").value = q;
        submitDialogue();
      });
      box.appendChild(btn);
    });
    box.classList.remove("hidden");
  }

  function hideSuggestions() {
    const box = document.getElementById("dialogue-suggestions");
    box.classList.add("hidden");
    box.innerHTML = "";
  }

  function openExaminePanel(point) {
    dialogueOpen = true;
    activeCharacterId = null;
    document.getElementById("dialogue-panel").classList.remove("hidden");
    document.getElementById("dialogue-name").textContent = point.title;
    document.getElementById("dialogue-title").textContent = "Examine";
    document.getElementById("dialogue-avatar").style.background = "#5a1e22";
    document.getElementById("dialogue-avatar").style.borderColor = "#c9a15a";

    const log = document.getElementById("dialogue-log");
    log.innerHTML = "";
    appendBubble("them", point.flavor);
    if (!examinedSet.has(point.id)) {
      examinedSet.add(point.id);
      addClue(point.clueId);
      appendBubble("system", "New clue added to your notebook.");
    }
    document.getElementById("dialogue-form").classList.add("hidden");
    hideSuggestions();
  }

  function closeDialogue() {
    dialogueOpen = false;
    activeCharacterId = null;
    document.getElementById("dialogue-panel").classList.add("hidden");
  }

  function appendBubble(kind, text) {
    const log = document.getElementById("dialogue-log");
    const div = document.createElement("div");
    div.className = `bubble ${kind}`;
    div.textContent = text;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
    return div;
  }

  async function submitDialogue() {
    if (sending || !activeCharacterId) return;
    const input = document.getElementById("dialogue-input");
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    hideSuggestions();
    sending = true;
    document.getElementById("dialogue-send").disabled = true;

    appendBubble("me", text);
    const conv = conversations[activeCharacterId];
    const priorHistory = conv.history.slice();
    const typingBubble = appendBubble("typing", "…");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId: activeCharacterId, message: text, history: priorHistory }),
      }).then((r) => r.json());

      typingBubble.remove();

      if (res.error) {
        appendBubble("system", res.error);
      } else {
        appendBubble("them", res.reply);
        conv.history.push({ role: "user", content: text }, { role: "assistant", content: res.reply });
        (res.clues || []).forEach((id) => {
          const wasNew = !discoveredSet.has(id);
          addClue(id);
          if (wasNew) appendBubble("system", "New clue added to your notebook.");
        });
        saveState();
      }
    } catch (err) {
      typingBubble.remove();
      appendBubble("system", "Something went wrong reaching the AI service.");
    } finally {
      sending = false;
      document.getElementById("dialogue-send").disabled = false;
      input.focus();
    }
  }

  // ---------------------------------------------------------------------
  // Interaction
  // ---------------------------------------------------------------------
  function findInteractable() {
    let best = null;
    let bestDist = INTERACT_RADIUS;
    const px = player.x + player.w / 2;
    const py = player.y + player.h / 2;

    npcs.forEach((n) => {
      const d = Math.hypot(px - n.pos.x, py - n.pos.y);
      if (d < bestDist) {
        bestDist = d;
        best = { type: "npc", ref: n };
      }
    });
    EXAMINE_POINTS.forEach((p) => {
      const d = Math.hypot(px - p.x, py - p.y);
      if (d < Math.min(bestDist, p.radius)) {
        bestDist = d;
        best = { type: "examine", ref: p };
      }
    });
    return best;
  }

  function tryInteract() {
    if (dialogueOpen) return;
    const target = findInteractable();
    if (!target) return;
    if (target.type === "npc") openDialogueWith(target.ref);
    else openExaminePanel(target.ref);
  }

  // ---------------------------------------------------------------------
  // Update / physics
  // ---------------------------------------------------------------------
  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function collidesAt(x, y) {
    const box = { x, y, w: player.w, h: player.h };
    if (x < 0 || y < 0 || x + player.w > WORLD_W || y + player.h > WORLD_H) return true;
    for (const p of PROPS) {
      if (rectsOverlap(box, p)) return true;
    }
    for (const o of CIRCLE_OBSTACLES) {
      const dx = box.x + box.w / 2 - o.x;
      const dy = box.y + box.h - o.y;
      if (Math.hypot(dx, dy) < o.r) return true;
    }
    return false;
  }

  let lastTime = performance.now();
  function update(dt) {
    if (
      dialogueOpen ||
      notebookOpen ||
      !document.getElementById("intro-modal").classList.contains("hidden") ||
      !document.getElementById("cutscene-modal").classList.contains("hidden")
    ) {
      player.moving = false;
      return;
    }
    let dx = 0, dy = 0;
    if (keys.has("w") || keys.has("arrowup")) dy -= 1;
    if (keys.has("s") || keys.has("arrowdown")) dy += 1;
    if (keys.has("a") || keys.has("arrowleft")) dx -= 1;
    if (keys.has("d") || keys.has("arrowright")) dx += 1;

    player.moving = dx !== 0 || dy !== 0;
    if (player.moving) {
      const len = Math.hypot(dx, dy) || 1;
      dx /= len; dy /= len;
      if (dx !== 0) player.facing = dx > 0 ? 1 : -1;
      const nx = player.x + dx * player.speed * dt;
      const ny = player.y + dy * player.speed * dt;
      if (!collidesAt(nx, player.y)) player.x = nx;
      if (!collidesAt(player.x, ny)) player.y = ny;
    }
  }

  // ---------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------
  function drawRooms(cam) {
    ctx.fillStyle = "#171017";
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    // corridor wood-plank texture across whole world (visible between rooms)
    ctx.save();
    ctx.translate(-cam.x, -cam.y);
    ctx.fillStyle = "#241b1d";
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    ctx.strokeStyle = "rgba(0,0,0,0.15)";
    for (let y = 0; y < WORLD_H; y += 26) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(WORLD_W, y);
      ctx.stroke();
    }

    ROOMS.forEach((r) => {
      ctx.fillStyle = r.floor;
      ctx.fillRect(r.x, r.y, r.w, r.h);

      if (r.outdoor) {
        ctx.fillStyle = "rgba(0,0,0,0.12)";
        for (let i = 0; i < 60; i++) {
          const gx = r.x + ((i * 53) % r.w);
          const gy = r.y + ((i * 97) % r.h);
          ctx.fillRect(gx, gy, 3, 3);
        }
        ctx.strokeStyle = "#3a5a3a";
        ctx.lineWidth = 14;
        ctx.strokeRect(r.x + 7, r.y + 7, r.w - 14, r.h - 14);
      } else {
        ctx.strokeStyle = "rgba(255,255,255,0.04)";
        for (let gy = r.y; gy < r.y + r.h; gy += 24) {
          ctx.beginPath();
          ctx.moveTo(r.x, gy);
          ctx.lineTo(r.x + r.w, gy);
          ctx.stroke();
        }
      }

      ctx.strokeStyle = "#5a4630";
      ctx.lineWidth = 3;
      ctx.strokeRect(r.x, r.y, r.w, r.h);

      ctx.fillStyle = "rgba(232,201,136,0.85)";
      ctx.font = "600 13px Inter, sans-serif";
      ctx.fillText(r.label.toUpperCase(), r.x + 12, r.y + 20);

      (r.decor || []).forEach((d) => {
        ctx.fillStyle = d.color;
        ctx.fillRect(d.x, d.y, d.w, d.h);
      });
    });

    CIRCLE_OBSTACLES.forEach((o) => {
      ctx.fillStyle = o.color || "#3c5560";
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = o.strokeColor || "#7a9aa5";
      ctx.lineWidth = 3;
      ctx.stroke();
    });

    ctx.restore();
  }

  function drawProps(cam) {
    ctx.save();
    ctx.translate(-cam.x, -cam.y);
    PROPS.forEach((p) => {
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(p.x + 3, p.y + p.h - 6, p.w, 8);
      ctx.fillStyle = p.color;
      roundRect(p.x, p.y, p.w, p.h, 6);
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = 2;
      ctx.stroke();
    });
    ctx.restore();
  }

  function drawExamineDecor(cam) {
    ctx.save();
    ctx.translate(-cam.x, -cam.y);
    EXAMINE_POINTS.forEach((point) => {
      const render = point.decor && EXAMINE_DECOR_RENDERERS[point.decor];
      if (render) render(point);
    });
    ctx.restore();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawPerson(screenX, screenY, colors, hat, facing, bob, label, highlighted) {
    ctx.save();
    ctx.translate(screenX, screenY);

    // shadow
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.beginPath();
    ctx.ellipse(0, 2, 15, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    const bobY = Math.sin(bob) * 1.6;

    // legs
    ctx.fillStyle = "#20181c";
    ctx.fillRect(-8, -14 + bobY, 6, 14);
    ctx.fillRect(2, -14 + bobY, 6, 14);

    // body
    ctx.fillStyle = colors.body;
    roundRect(-11, -40 + bobY, 22, 28, 7);
    ctx.fill();

    // head
    ctx.fillStyle = colors.skin;
    ctx.beginPath();
    ctx.arc(0, -48 + bobY, 10, 0, Math.PI * 2);
    ctx.fill();

    // eyes
    ctx.fillStyle = "#241a1a";
    ctx.beginPath();
    ctx.arc(2 * facing, -48 + bobY, 1.4, 0, Math.PI * 2);
    ctx.fill();

    // hat / hair accessory
    ctx.fillStyle = colors.accent;
    drawHat(hat, bobY);

    ctx.restore();

    if (highlighted) {
      ctx.save();
      ctx.translate(screenX, screenY);
      ctx.strokeStyle = "#e8c988";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 2, 19, 8, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    if (label) {
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.font = "600 11px Inter, sans-serif";
      const w = ctx.measureText(label).width;
      ctx.fillRect(screenX - w / 2 - 5, screenY - 70, w + 10, 15);
      ctx.fillStyle = "#f2e9dc";
      ctx.fillText(label, screenX - w / 2, screenY - 59);
    }
  }

  function drawHat(hat, bobY) {
    const y = -56 + bobY;
    switch (hat) {
      case "bowler":
        ctx.beginPath();
        ctx.ellipse(0, y + 2, 9, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        roundRect(-6, y - 6, 12, 8, 3);
        ctx.fill();
        break;
      case "sunhat":
        ctx.beginPath();
        ctx.ellipse(0, y + 3, 14, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(0, y - 1, 7, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      case "ponytail":
        ctx.beginPath();
        ctx.ellipse(-9, y + 6, 4, 9, 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(0, y - 3, 10, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      case "strawhat":
        ctx.beginPath();
        ctx.ellipse(0, y + 3, 15, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(0, y - 2, 7, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      case "slick":
        ctx.beginPath();
        ctx.ellipse(0, y - 2, 9, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      case "fedora":
        ctx.beginPath();
        ctx.ellipse(0, y + 2, 13, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        roundRect(-6, y - 7, 12, 8, 3);
        ctx.fill();
        break;
      default:
        break;
    }
  }

  function draw(cam, interactable, time) {
    drawRooms(cam);
    drawProps(cam);
    drawExamineDecor(cam);

    ctx.save();
    ctx.translate(-cam.x, -cam.y);

    // draw npcs + player sorted by y for depth
    const drawables = [
      ...npcs.map((n) => ({
        x: n.pos.x, y: n.pos.y, colors: n.colors, hat: (n.look || {}).hat,
        facing: -1, bob: time / 400 + (n.bobSeed || 0), label: n.name,
        highlighted: interactable && interactable.type === "npc" && interactable.ref.id === n.id,
      })),
      {
        x: player.x + player.w / 2, y: player.y + player.h,
        colors: { body: "#3a4a5a", accent: "#c9a15a", skin: "#e0b088" },
        hat: "fedora", facing: player.facing,
        bob: player.moving ? time / 90 : 0, label: "You", highlighted: false,
      },
    ].sort((a, b) => a.y - b.y);

    drawables.forEach((d) => drawPerson(d.x, d.y, d.colors, d.hat, d.facing, d.bob, d.label, d.highlighted));

    if (interactable && interactable.type === "examine") {
      ctx.save();
      ctx.strokeStyle = "#e8c988";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.strokeRect(interactable.ref.x - 55, interactable.ref.y - 45, 110, 90);
      ctx.setLineDash([]);
      ctx.restore();
    }

    ctx.restore();

    // vignette
    const grad = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H / 3, VIEW_W / 2, VIEW_H / 2, VIEW_W / 1.1);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, "rgba(0,0,0,0.45)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  function updateInteractHint(cam, interactable) {
    const hint = document.getElementById("interact-hint");
    if (!interactable || dialogueOpen) {
      hint.classList.add("hidden");
      return;
    }
    hint.classList.remove("hidden");
    const wx = interactable.type === "npc" ? interactable.ref.pos.x : interactable.ref.x;
    const wy = interactable.type === "npc" ? interactable.ref.pos.y : interactable.ref.y;
    const scaleX = canvas.clientWidth / VIEW_W;
    const scaleY = canvas.clientHeight / VIEW_H;
    const sx = (wx - cam.x) * scaleX;
    const sy = (wy - cam.y - 70) * scaleY;
    hint.style.left = `${sx}px`;
    hint.style.top = `${sy}px`;
  }

  // ---------------------------------------------------------------------
  // Main loop
  // ---------------------------------------------------------------------
  function loop(now) {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;

    update(dt);

    const cam = {
      x: Math.max(0, Math.min(WORLD_W - VIEW_W, player.x + player.w / 2 - VIEW_W / 2)),
      y: Math.max(0, Math.min(WORLD_H - VIEW_H, player.y + player.h / 2 - VIEW_H / 2)),
    };

    const interactable = dialogueOpen ? null : findInteractable();
    draw(cam, interactable, now);
    updateInteractHint(cam, interactable);

    requestAnimationFrame(loop);
  }

  boot();
})();
