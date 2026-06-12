import { AudioEngine } from "./audio-engine.mjs";
import { CanvasAnimator } from "./canvas-animator.mjs";
import { SocketHandler } from "./socket-handler.mjs";
import { SpeakerWidget } from "./speaker-widget.mjs";
import { SimpleAnimationConfig } from "./simple-animation-config.mjs";

function registerSettings() {
  // ── Visible in main settings panel ────────────────────────────

  game.settings.register("token-speaker", "advancedMode", {
    name: "Advanced Mode",
    hint: "Enable viseme lip-sync (requires sprite textures). Unchecked = Simple bounce animation.",
    scope: "client",
    config: true,
    type: Boolean,
    default: false,
  });

  game.settings.register("token-speaker", "sensitivity", {
    name: "Mic Sensitivity",
    hint: "Raise if your mic is quiet. Lower to reduce background noise.",
    scope: "client",
    config: true,
    type: Number,
    default: 50,
    range: { min: 0, max: 100, step: 1 },
  });

  game.settings.register("token-speaker", "intensity", {
    name: "Animation Intensity",
    hint: "Gain on mic volume for animation. Higher = easier to reach animation limits.",
    scope: "client",
    config: true,
    type: Number,
    default: 1.0,
    range: { min: 0.1, max: 3.0, step: 0.1 },
  });

  game.settings.registerMenu("token-speaker", "simpleAnimConfig", {
    name: "Simple Animation",
    label: "Configure Limits",
    hint: "Adjust bounce, wobble, and scale limits for Simple mode.",
    icon: "fas fa-sliders",
    type: SimpleAnimationConfig,
    restricted: false,
  });

  game.settings.register("token-speaker", "speakerWidget", {
    name: "Speaker Widget",
    hint: "Adds a token picker toolbar button for GMs to speak through NPC tokens.",
    scope: "client",
    config: true,
    type: Boolean,
    default: false,
    onChange: () => ui.controls.initialize(),
  });

  // ── Hidden — managed by Simple Animation submenu ───────────────

  game.settings.register("token-speaker", "bounceMax",    { scope: "client", config: false, type: Number, default: 8    });
  game.settings.register("token-speaker", "angleMax",     { scope: "client", config: false, type: Number, default: 5    });
  game.settings.register("token-speaker", "scaleAxis",    { scope: "client", config: false, type: String, default: "xy" });
  game.settings.register("token-speaker", "scaleLow",     { scope: "client", config: false, type: Number, default: 1.0  });
  game.settings.register("token-speaker", "scaleHigh",    { scope: "client", config: false, type: Number, default: 1.15 });
  game.settings.register("token-speaker", "scaleDamping", { scope: "client", config: false, type: Number, default: 0.7  });

}

Hooks.on("init", () => {
  registerSettings();
});

Hooks.on("getSceneControlButtons", controls => {
  // v14: controls is a plain object keyed by layer name, tools is also an object
  if (!game.settings.get("token-speaker", "speakerWidget")) return;
  if (!controls.tokens) return;
  controls.tokens.tools["token-speaker-widget"] = {
    name: "token-speaker-widget",
    title: "Token Speaker",
    icon: "fas fa-microphone",
    button: true,
    onClick: () => SpeakerWidget.toggle(),
  };
});

Hooks.on("canvasReady", () => {
  CanvasAnimator.reset();
  SpeakerWidget.clearPin();
  SpeakerWidget._instance?.render({ force: true });
});

Hooks.on("createToken", () => {
  SpeakerWidget._instance?.render({ force: true });
});

Hooks.on("deleteToken", (doc) => {
  CanvasAnimator.cleanupToken(doc.id);
  if (SpeakerWidget.pinnedTokenId === doc.id) SpeakerWidget.clearPin();
  SpeakerWidget._instance?.render({ force: true });
});

Hooks.on("ready", () => {
  SocketHandler.init();
  CanvasAnimator.init();

  if (game.user.character || game.user.isGM) {
    AudioEngine.init((state) => {
      const token = CanvasAnimator.applyLocalState(state);
      if (token) SocketHandler.broadcast(state, token.id);
    });
  }
});
