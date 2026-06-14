import { AudioEngine } from "./audio-engine.mjs";
import { CanvasAnimator } from "./canvas-animator.mjs";
import { SocketHandler } from "./socket-handler.mjs";
import { SpeakerWidget } from "./speaker-widget.mjs";
import { TalkingHeads } from "./talking-heads.mjs";
import { SimpleAnimationConfig } from "./simple-animation-config.mjs";
import { TalkingHeadsConfig } from "./talking-heads-config.mjs";

let _combatActive = false;

function _isEffectivelyEnabled() {
  return game.settings.get("token-speaker", "enabled")
    && !(game.settings.get("token-speaker", "disableDuringCombat") && _combatActive);
}

function _applyState() {
  const enabled = _isEffectivelyEnabled();
  CanvasAnimator._enabled = enabled;
  TalkingHeads._enabled   = enabled;
  if (!enabled) TalkingHeads.setAllIdle();
}

function _applyCombatState() {
  _combatActive = !!game.combat?.started
    && game.combat.scene?.id === canvas.scene?.id;
  _applyState();
}

function registerSettings() {
  // ── Visible in main settings panel ────────────────────────────

  // ── Player-visible settings ───────────────────────────────────

  game.settings.register("token-speaker", "sensitivity", {
    name: "Mic Sensitivity",
    hint: "Raise if your mic is quiet. Lower to reduce background noise.",
    scope: "client",
    config: true,
    type: Number,
    default: 50,
    range: { min: 0, max: 100, step: 1 },
  });

  // ── GM-only menus ─────────────────────────────────────────────

  game.settings.registerMenu("token-speaker", "simpleAnimConfig", {
    name: "Token Animation Config",
    label: "Configure",
    hint: "Adjust animation mode, intensity, bounce, wobble, and scale for canvas tokens. GM only.",
    icon: "fas fa-sliders",
    type: SimpleAnimationConfig,
    restricted: true,
  });

  game.settings.register("token-speaker", "speakerWidget", {
    name: "Speaker Widget",
    hint: "Adds a token picker toolbar button for GMs to speak through NPC tokens.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: () => ui.controls.initialize(),
  });

  // ── Talking Heads ──────────────────────────────────────────────

  // Visibility mode for talking heads ("always" | "speaking"). Managed inside the
  // Talking Heads Config as an "Always visible" boolean. Heads are disabled
  // entirely via headMode = "none".
  game.settings.register("token-speaker", "talkingHeads", {
    scope: "world",
    config: false,
    type: String,
    default: "speaking",
    onChange: () => TalkingHeads.rebuild(),
  });

  game.settings.registerMenu("token-speaker", "talkingHeadsConfig", {
    name: "Talking Heads Config",
    label: "Configure",
    hint: "Adjust portrait size, aspect ratio, name display, mask, animation mode, and per-player mirror. GM only.",
    icon: "fas fa-sliders",
    type: TalkingHeadsConfig,
    restricted: true,
  });

  // ── Hidden — debug toggle + bounce presets (managed by config submenus) ─

  game.settings.register("token-speaker", "debugMode",       { scope: "world", config: false, type: Boolean, default: false });
  game.settings.register("token-speaker", "bouncePreset",     { scope: "world", config: false, type: String, default: "bouncy" });
  game.settings.register("token-speaker", "headBouncePreset", { scope: "world", config: false, type: String, default: "bouncy" });

  // ── Hidden — managed by Token Animation Config submenu (GM only) ─

  game.settings.register("token-speaker", "indicatorStyle", { scope: "world", config: false, type: String, default: "ring" });
  game.settings.register("token-speaker", "mode",         { scope: "world",  config: false, type: String, default: "simple", onChange: () => CanvasAnimator.onModeChange() });
  game.settings.register("token-speaker", "intensity",    { scope: "world",  config: false, type: Number, default: 1.0  });
  game.settings.register("token-speaker", "bounceMax",    { scope: "world",  config: false, type: Number, default: 8    });
  game.settings.register("token-speaker", "angleMax",     { scope: "world",  config: false, type: Number, default: 5    });
  game.settings.register("token-speaker", "scaleAxis",    { scope: "world",  config: false, type: String, default: "xy" });
  game.settings.register("token-speaker", "scaleLow",     { scope: "world",  config: false, type: Number, default: 1.0  });
  game.settings.register("token-speaker", "scaleHigh",    { scope: "world",  config: false, type: Number, default: 1.15 });
  game.settings.register("token-speaker", "scaleDamping", { scope: "world",  config: false, type: Number, default: 0.7  });

  // ── Hidden — managed by Talking Heads Config submenu (world = GM-controlled for all) ──

  game.settings.register("token-speaker", "headIndicatorStyle", { scope: "world", config: false, type: String, default: "ring" });
  game.settings.register("token-speaker", "headWidth",        { scope: "world",  config: false, type: Number, default: 100,      onChange: () => TalkingHeads.rebuild() });
  game.settings.register("token-speaker", "headAspectRatio",  { scope: "world",  config: false, type: Boolean, default: false,  onChange: () => TalkingHeads.rebuild() });
  game.settings.register("token-speaker", "showHeadName",     { scope: "world",  config: false, type: Boolean, default: true,   onChange: () => TalkingHeads.rebuild() });
  game.settings.register("token-speaker", "headNameSize",     { scope: "world",  config: false, type: Number, default: 1.0,    onChange: () => TalkingHeads.rebuild() });
  game.settings.register("token-speaker", "headMode",        { scope: "world",  config: false, type: String, default: "simple", onChange: () => TalkingHeads.rebuild() });
  game.settings.register("token-speaker", "headMask",        { scope: "world",  config: false, type: String, default: "",       onChange: () => TalkingHeads.rebuild() });
  // Avatar mode: show a separate "{tokenBase}-avatar.ext" image (full-body/portrait),
  // static aspect ratio, no visemes. Decoupled from headMode (forced simple bounce).
  game.settings.register("token-speaker", "headUseAvatar",   { scope: "world",  config: false, type: Boolean, default: false,  onChange: () => TalkingHeads.rebuild() });
  game.settings.register("token-speaker", "headAvatarWidth",  { scope: "world",  config: false, type: Number, default: 240,    onChange: () => TalkingHeads.rebuild() });
  // Cartoon silhouette outline (Talking Heads only). Follows the alpha from the mask,
  // or — with Cutout on — the portrait PNG's own transparency.
  game.settings.register("token-speaker", "headOutline",      { scope: "world",  config: false, type: Boolean, default: false,  onChange: () => TalkingHeads.rebuild() });
  game.settings.register("token-speaker", "headOutlineWidth", { scope: "world",  config: false, type: Number,  default: 3,      onChange: () => TalkingHeads.rebuild() });
  game.settings.register("token-speaker", "headOutlineAuto",  { scope: "world",  config: false, type: Boolean, default: true,   onChange: () => TalkingHeads.rebuild() }); // true = each player's colour
  game.settings.register("token-speaker", "headOutlineColor", { scope: "world",  config: false, type: String,  default: "#ffffff", onChange: () => TalkingHeads.rebuild() });
  game.settings.register("token-speaker", "headCutout",       { scope: "world",  config: false, type: Boolean, default: false,  onChange: () => TalkingHeads.rebuild() });
  // Avatar mode has its own outline config (silhouette = avatar PNG alpha, so no Cutout toggle).
  game.settings.register("token-speaker", "headAvatarOutline",      { scope: "world", config: false, type: Boolean, default: false,    onChange: () => TalkingHeads.rebuild() });
  game.settings.register("token-speaker", "headAvatarOutlineWidth", { scope: "world", config: false, type: Number,  default: 3,        onChange: () => TalkingHeads.rebuild() });
  game.settings.register("token-speaker", "headAvatarOutlineAuto",  { scope: "world", config: false, type: Boolean, default: true,     onChange: () => TalkingHeads.rebuild() });
  game.settings.register("token-speaker", "headAvatarOutlineColor", { scope: "world", config: false, type: String,  default: "#ffffff", onChange: () => TalkingHeads.rebuild() });
  game.settings.register("token-speaker", "headBounceMax",    { scope: "world",  config: false, type: Number, default: 10   });
  game.settings.register("token-speaker", "headAngleMax",     { scope: "world",  config: false, type: Number, default: 5    });
  game.settings.register("token-speaker", "headScaleAxis",    { scope: "world",  config: false, type: String, default: "xy" });
  game.settings.register("token-speaker", "headScaleLow",     { scope: "world",  config: false, type: Number, default: 1.0  });
  game.settings.register("token-speaker", "headScaleHigh",    { scope: "world",  config: false, type: Number, default: 1.08 });
  game.settings.register("token-speaker", "headScaleDamping", { scope: "world",  config: false, type: Number, default: 0.7  });
  game.settings.register("token-speaker", "headIntensity",    { scope: "world",  config: false, type: Number, default: 1.0  });
  game.settings.register("token-speaker", "headMirrorMap",    { scope: "world",  config: false, type: Object, default: {}   });

  // ── Hidden — managed by scene control toggle button ───────────

  game.settings.register("token-speaker", "enabled", {
    scope: "world",
    config: false,
    type: Boolean,
    default: true,
    onChange: () => { ui.controls.initialize(); _applyState(); },
  });

  // ── Last in panel ─────────────────────────────────────────────

  game.settings.register("token-speaker", "disableDuringCombat", {
    name: "Pause During Encounters",
    hint: "Automatically disables Token Speaker when a combat encounter is active on the current scene.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: () => _applyCombatState(),
  });

  game.settings.register("token-speaker", "disableAnimations", {
    name: "Disable Token Speaker",
    hint: "Skip all animation processing on this client — no microphone access, no canvas animation, no talking heads. Use on low-end hardware.",
    scope: "client",
    config: true,
    type: Boolean,
    default: false,
  });

}

Hooks.on("init", () => {
  registerSettings();
});

Hooks.on("getSceneControlButtons", controls => {
  // v14: controls is a plain object keyed by layer name, tools is also an object
  if (!game.user.isGM) return;
  if (!controls.tokens) return;

  controls.tokens.tools["token-speaker-toggle"] = {
    name:   "token-speaker-toggle",
    title:  "Token Speaker",
    icon:   "fas fa-microphone",
    toggle: true,
    active: game.settings.get("token-speaker", "enabled"),
    onClick: () => game.settings.set("token-speaker", "enabled",
      !game.settings.get("token-speaker", "enabled")),
  };

  if (!game.settings.get("token-speaker", "speakerWidget")) return;
  controls.tokens.tools["token-speaker-widget"] = {
    name: "token-speaker-widget",
    title: "Token Speaker: Pin NPC",
    icon: "fas fa-microphone-lines",
    button: true,
    onClick: () => SpeakerWidget.toggle(),
  };
});

Hooks.on("canvasReady", () => {
  CanvasAnimator.reset();
  SpeakerWidget.clearPin();
  SpeakerWidget._instance?.render({ force: true });
  TalkingHeads.syncScene();
  _applyCombatState();
});

Hooks.on("updateScene", (scene, diff) => {
  if (scene.id === canvas.scene?.id && diff.flags?.["token-speaker"]?.headPositions) {
    TalkingHeads.syncScene();
  }
});

Hooks.on("controlToken", () => {
  if (!game.user.isGM) return;

  // Resolve which token (if any) is now the GM's talking head
  let gmTokenId = null;
  if (canvas.ready) {
    const controlled = canvas.tokens?.controlled ?? [];
    if (controlled.length === 1) {
      const t = controlled[0];
      const isPlayerChar = game.users.some(u => !u.isGM && u.active && u.character?.id === t.document.actorId);
      if (!isPlayerChar) gmTokenId = t.id;
    }
  }

  // Apply locally — GM filters own socket messages so we can't rely on echo
  TalkingHeads.setGMAutoToken(gmTokenId);

  // Broadcast to players
  game.socket.emit("module.token-speaker", {
    type: "gmHead",
    userId: game.user.id,
    tokenId: gmTokenId,
  });
});

// Selecting a viseme token: immediately discover its assets and hold the -closed
// rest frame, instead of waiting for the next audio frame. CanvasAnimator keeps
// the token in its active set so the tick re-asserts the closed frame each frame,
// surviving Foundry's own post-selection mesh refresh.
Hooks.on("controlToken", (token, controlled) => {
  if (!controlled) return;
  if (game.settings.get("token-speaker", "disableAnimations")) return;
  CanvasAnimator.prepareToken(token);
});

Hooks.on("createCombat",  _applyCombatState);
Hooks.on("deleteCombat",  _applyCombatState);
Hooks.on("updateCombat",  _applyCombatState);

Hooks.on("createToken", () => {
  SpeakerWidget._instance?.render({ force: true });
});

Hooks.on("deleteToken", (doc) => {
  CanvasAnimator.cleanupToken(doc.id);
  if (SpeakerWidget.pinnedTokenId === doc.id) SpeakerWidget.clearPin();
  SpeakerWidget._instance?.render({ force: true });
});

Hooks.on("ready", () => {
  // One-time migration: advancedMode (Boolean) → mode (String)
  const store = game.settings.storage.get("client");
  if (store?.getItem("token-speaker.advancedMode") !== null && store?.getItem("token-speaker.mode") === null) {
    game.settings.set("token-speaker", "mode", store.getItem("token-speaker.advancedMode") === "true" ? "advanced" : "simple");
  }

  if (game.settings.get("token-speaker", "disableAnimations")) return;

  SocketHandler.init();
  CanvasAnimator.init();
  TalkingHeads.init();

  if (game.user.character || game.user.isGM) {
    AudioEngine.init((state) => {
      if (!_isEffectivelyEnabled()) return;
      const token = CanvasAnimator.applyLocalState(state);
      // Always broadcast so remote clients can animate talking heads even when
      // there is no canvas token for this user. tokenId is null in that case;
      // the receiver skips canvas animation but still updates talking heads.
      SocketHandler.broadcast(state, token?.id ?? null);
      TalkingHeads.update(game.user.id, state);
    });
  }

  _applyCombatState();
});
