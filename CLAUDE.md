# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Token Speaker is a **Foundry VTT v14 module** (vanilla ES modules, no build step). It listens to the local microphone and animates the speaking player's canvas token and/or floating "Talking Head" portraits in real time. State is broadcast peer-to-peer over Foundry's socket — **no database writes, no server round-trip** for animation.

## Build / release / test

- **No build, bundler, or package manager.** Source `.mjs` and `.css` ship as-is. CSS is auto-built/served by Foundry — do not compile or hand-edit compiled CSS.
- **No test suite, no linter.** Verification is manual: load the module in a running Foundry v14 world and speak into a mic.
- **Release is automated** by [.github/workflows/release.yml](.github/workflows/release.yml): on push to `main`, *if and only if* the `version` field in [module.json](module.json) changed, it zips (`module.json assets/ scripts/ styles/ templates/ LICENSE`) and publishes a GitHub release. **To cut a release: bump `version` in module.json and push to main.** Nothing else triggers it.

## Entry point & load order

[module.json](module.json) loads a single ESM: [scripts/token-speaker.mjs](scripts/token-speaker.mjs). It owns all Foundry `Hooks` and orchestrates the subsystems. Key lifecycle:

- `init` → `registerSettings()` (all `game.settings` live here, including hidden world-scoped animation params managed by the config sub-apps).
- `ready` → bails if client setting `disableAnimations` is on; otherwise inits `SocketHandler`, `CanvasAnimator`, `TalkingHeads`, then `AudioEngine.init(callback)`. The callback is the **per-frame fan-out**: apply locally → broadcast over socket → update local talking heads.
- `controlToken` (GM) → decides which selected non-player token becomes the GM's talking head, applies locally, and broadcasts a `gmHead` socket message (GM filters its own socket echo, so local application is required).

## Data flow (the core architecture)

```
mic → AudioEngine._poll (30 Hz)         → state {mode, volume, viseme?}
        ↓ onState callback (token-speaker.mjs ready hook)
   CanvasAnimator.applyLocalState(state) → animates local PIXI token mesh
   SocketHandler.broadcast(state, tokenId)
        ↓ module.token-speaker socket (throttled 15 Hz)
   remote: CanvasAnimator.applyRemoteState + TalkingHeads.update
```

Two render loops run independently off this shared `state`:
- **CanvasAnimator** drives the PIXI token mesh on `PIXI.Ticker.shared`.
- **TalkingHeads** drives DOM `<div>` portraits on `requestAnimationFrame`.

`state.volume` is normalized RMS (noise-gated by `sensitivity`). `state.speaking` is a **hysteresis** flag (enter/exit thresholds + silence-hold in AudioEngine) — animation is gated on it, not on raw volume, so ambient noise can't flicker it. `state.viseme` is only attached when some mode wants lip-sync.

**Two different scale drivers (don't conflate):** the *token* (`CanvasAnimator`) bounce/stretch amplitude comes from a per-frame **waveform peak** (`AudioEngine.getWaveformSample()`). The *talking head* scale was changed to track the **sensitivity-gated volume envelope** `effectiveVol = volume × intensity` (clamped 0–1) instead — so the `sensitivity` slider and `intensity` both control how easily a head reaches peak stretch, and quiet mics don't need shouting. Head scale is expansion-only (`scaleHigh`); the head `scaleLow`/squish path was dropped. Head motion is additionally gated on `effectiveVol > 0.06` (a deadzone above the `speaking` hold flag) so ambient noise during the silence-hold window can't jitter it.

**Idle gating (important):** both loops are sleep/wake. A token/head animates only while `speaking`; once silent AND eased back to rest it is snapped to an exact rest pose, dropped from the active set, and the loop **detaches** (`PIXI.Ticker.shared.remove` / stops rescheduling rAF). Zero CPU at idle, and nothing animates when silent — just a static rest frame. `applyLocalState`/`applyRemoteState`/`update` early-return on a silent+settled entry so silent socket frames don't re-wake anything. `CanvasAnimator._wake()` snapshots settings into `_cfg` (no per-frame `game.settings.get`).

## Animation modes

A token/head `mode` is one of `simple` (bounce/wobble/stretch), `advanced` (viseme image swap), `hybrid` (advanced if viseme images exist for that token, else simple), `both` (visemes + bounce), or `none`. Effective mode is resolved **per token at tick time** based on whether viseme textures were discovered. Canvas mode setting key is `mode`; talking-head equivalent is `headMode`. The two are independent — viseme classification runs if *either* wants it.

**Mode-gated asset loading:** viseme/mask discovery (`_ensureTokenTextures`, head `_discoverHeadImages`) only runs when that surface's mode actually swaps images (advanced/both/hybrid). Simple/none never browse files or fire 404 probes, and the token/portrait keeps the player's original art. Changing `mode` fires `CanvasAnimator.onModeChange()` (restores swapped meshes, clears caches); `headMode` fires `TalkingHeads.rebuild()`.

## Viseme / mask asset discovery

Both renderers discover sibling image files next to a token's base image, by naming convention (documented for users in [README.md](README.md)):
- **Flipbook**: `{base}-sheet.ext` (or `_sheet`) — a 2×2 grid sliced into closed=TL, ah=TR, ee=BL, oo=BR. This exact layout is duplicated in `CanvasAnimator._loadFlipbook` (PIXI crop) and `TalkingHeads._loadFlipbookURLs` (Canvas2D → data URLs). **Keep them in sync.**
- **Individual files**: `{base}-closed/-OO/-AH/-EE.ext`. The closed frame is now a **dedicated `-closed` file** — the base token art is no longer repurposed as the mouth (falls back to original art only if `-closed` is absent).
- **Mask**: `{base}-mask.ext` — grayscale luminance → alpha. Canvas tokens apply it as a PIXI mask sprite; talking heads apply it as a CSS `mask-image` with `mask-mode: luminance`.

Discovery has **two paths**: GM/assistant uses `FilePicker.browse` (directory listing, no 404 noise); players fall back to `fetch HEAD` probes (causes expected 404 console noise — by design, players can't browse). Viseme classification (`AudioEngine._classifyViseme`) is FFT-bin band energy → oo/ah/ee, with a latch + "bridge through closed" to avoid mouth jitter.

## Bounce presets

[scripts/animation-presets.mjs](scripts/animation-presets.mjs) holds `TOKEN_BOUNCE_PRESETS`, `HEAD_BOUNCE_PRESETS` (independent tables), and the shared `BOUNCE_PRESET_OPTIONS` dropdown list. Each preset is a full snapshot of the 7 simple-animation params (`bounceMax, angleMax, scaleAxis, scaleLow, scaleHigh, intensity, scaleDamping`). Presets are **not live** — selecting one and hitting Save in a config sub-app *copies* its values into the hidden world-scoped settings ([talking-heads-config.mjs](scripts/talking-heads-config.mjs) / [simple-animation-config.mjs](scripts/simple-animation-config.mjs), the `else` branch of `_onSave`). Editing the preset table alone changes nothing until the preset is re-selected and saved. Debug mode bypasses presets and writes the raw slider values. `scaleDamping` higher = slower/smoother scale (it sets the lerp tau); lower = snappier/wobblier. Convention: `toon` smooth, `toonWobble` same shape but lower damping.

## Talking-head cartoon outline

Talking Heads (only — not canvas tokens) can draw a silhouette **outline** + an alpha-shaped speaking glow. DOM nests `.ts-head-glow > .ts-head-outline > .ts-head-frame` when "silhouette mode" is active. **Why the wrappers:** CSS `filter` runs *before* `mask` on the same element, so an outline filter on the masked frame would itself be clipped — it must live on a parent. `.ts-head-outline` carries a per-head inline SVG `feMorphology` filter (`_outlineSVG()`: dilate alpha → flood colour → composite original on top); `.ts-head-glow` gets a `drop-shadow` (player colour) only while `.ts-speaking`. Silhouette mode suppresses the normal box-border ring (`.ts-head--silhouette` CSS). It needs a real alpha source: a `headMask`, or `headCutout` (treat the portrait PNG's own transparency — drops the circular clip, `object-fit:contain`). Settings: `headOutline`, `headOutlineWidth`, `headOutlineAuto` (true = each player's colour), `headOutlineColor`, `headCutout`.

## Avatar mode

`headUseAvatar` swaps each head's image for a sibling **`{tokenBase}-avatar.ext`** (full-body/portrait), with `img.onerror` fallback to the original art. Avatar is **decoupled from `headMode`**: `rebuild()`'s `headMode === "none"` early-return is bypassed for avatars, the tick forces simple bounce (`doBounce = true`), and viseme discovery is skipped. Aspect ratio is forced on, mask ignored, silhouette comes from the avatar PNG alpha. Avatar has its **own** outline settings (`headAvatarOutline`, `headAvatarOutlineWidth/Auto/Color`) and width (`headAvatarWidth`), read in place of the portrait ones in `_createHead` when `useAvatar`. Other head settings (name, name size `headNameSize`, indicator) still apply.

## Config sub-app UI gating (CSS-class pattern)

The two config `.hbs` forms show/hide sections by toggling form-level classes in `_onRender` (mirrors how Foundry never re-renders on every input). Pairs: `ts-debug-on`→`.ts-debug-only`, `ts-bounce-on`→`.ts-bounce-config`, `ts-outline-on`→`.ts-outline-only`, `ts-avatar-on`→`.ts-avatar-hide` (hide) / `.ts-avatar-only` (show), `ts-avatar-outline-on`→`.ts-avatar-outline-only`. Rules live in [styles/token-speaker.css](styles/token-speaker.css). Initial state comes from `{{#if ...}}` on the `<form>`; checkbox `change` handlers keep it live. Note `.ts-avatar-only` is `display:block` for fieldsets but overridden to `flex` for `.form-group`.

## Subsystem map

| File | Role |
| --- | --- |
| [token-speaker.mjs](scripts/token-speaker.mjs) | Hooks, settings registration, orchestration |
| [audio-engine.mjs](scripts/audio-engine.mjs) | Mic capture, RMS volume, viseme classification |
| [canvas-animator.mjs](scripts/canvas-animator.mjs) | PIXI token mesh animation, texture/mask swap, speaking ring/bubble overlays |
| [talking-heads.mjs](scripts/talking-heads.mjs) | Floating DOM portraits, drag-to-position (GM), per-scene position flags, cartoon outline + avatar mode |
| [animation-presets.mjs](scripts/animation-presets.mjs) | Token/head bounce preset tables + dropdown options (copied into settings on Save) |
| [socket-handler.mjs](scripts/socket-handler.mjs) | `module.token-speaker` socket emit/receive, throttle |
| [speaker-widget.mjs](scripts/speaker-widget.mjs) | ApplicationV2 GM toolbar picker to "pin" an NPC token as speaker |
| [simple-animation-config.mjs](scripts/simple-animation-config.mjs) / [talking-heads-config.mjs](scripts/talking-heads-config.mjs) | GM-only config sub-apps that write the hidden world-scoped settings |

## Conventions & gotchas

- **Foundry v14 namespaced APIs only**: `foundry.applications.api.{ApplicationV2, HandlebarsApplicationMixin}`, `foundry.applications.apps.FilePicker.implementation.browse`, `foundry.canvas.loadTexture`, `foundry.applications.handlebars.loadTemplates` (not the deprecated global `loadTemplates`).
- Scene-tool buttons are registered in `getSceneControlButtons` by assigning into `controls.tokens.tools[...]` (v14 object-keyed shape, not the old array).
- Hidden animation params (`bounceMax`, `headScaleHigh`, etc.) are **world-scoped** so every client animates identically; `sensitivity` and `disableAnimations` are **client-scoped**.
- Talking-head positions persist as a per-scene flag `token-speaker.headPositions` and sync via `updateScene` hook + socket.
- **Dead code**: [settings-app.mjs](scripts/settings-app.mjs) (`TokenSpeakerSettings`) is not imported anywhere and references a non-existent `CanvasAnimator.reloadTextures()` and `sprite*` settings that are never registered. Don't extend it; the live config UIs are the two `*-config.mjs` sub-apps.
</content>
</invoke>
