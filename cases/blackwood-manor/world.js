// Map layout for "Blackwood Manor". Spoiler-safe (examine point flavor text
// and clue ids are already sent to the client), served to the client as-is
// via lib/gameEngine.js#buildPublicCase so public/game.js can render any
// case's world without hardcoding room/prop/character-look data.

module.exports = {
  width: 1600,
  height: 1000,
  playerStart: { x: 800, y: 520 },

  rooms: [
    { id: "hall", x: 560, y: 360, w: 480, h: 300, floor: "#4a3626", label: "Entrance Hall" },
    {
      id: "study",
      x: 1080,
      y: 60,
      w: 440,
      h: 340,
      floor: "#3c1f24",
      label: "The Study",
      // Purely decorative rectangles drawn over the room's floor (e.g. a rug).
      decor: [{ x: 60, y: 70, w: 260, h: 200, color: "#2a1418" }],
    },
    { id: "drawing_room", x: 80, y: 60, w: 440, h: 340, floor: "#28341f", label: "Drawing Room" },
    { id: "kitchen", x: 80, y: 560, w: 440, h: 340, floor: "#33383f", label: "Kitchen" },
    { id: "garden", x: 1080, y: 560, w: 460, h: 360, floor: "#1e3521", label: "Garden", outdoor: true },
  ],

  props: [
    { x: 1220, y: 150, w: 120, h: 60, color: "#4a3220", label: "desk" },
    { x: 1090, y: 75, w: 18, h: 220, color: "#2a1c14", label: "shelf" },
    { x: 120, y: 280, w: 150, h: 46, color: "#6b3f42", label: "sofa" },
    { x: 480, y: 75, w: 18, h: 260, color: "#2a1c14", label: "shelf" },
    { x: 100, y: 590, w: 210, h: 36, color: "#5a5a62", label: "counter" },
    { x: 340, y: 760, w: 110, h: 66, color: "#4a3220", label: "table" },
    { x: 700, y: 430, w: 170, h: 66, color: "#4a3220", label: "table" },
    { x: 600, y: 405, w: 56, h: 40, color: "#3a2a1c", label: "cart" },
    { x: 1300, y: 806, w: 84, h: 26, color: "#3a2a1c", label: "bench" },
  ],

  // Circular colliders drawn as filled/stroked discs (fountains, pillars, etc).
  circleObstacles: [{ x: 1265, y: 685, r: 40, color: "#3c5560", strokeColor: "#7a9aa5" }],

  examinePoints: [
    {
      id: "crime_scene",
      room: "study",
      x: 1260,
      y: 175,
      radius: 90,
      title: "The Study — Crime Scene",
      clueId: "weapon_brandy",
      flavor:
        "A chalk outline marks where Edmund was found slumped over his desk. Beside it, an " +
        "overturned brandy glass, a dark stain soaked into the rug beneath it.",
      // Known decor renderers in public/game.js: "chalk_outline".
      decor: "chalk_outline",
    },
  ],
};
