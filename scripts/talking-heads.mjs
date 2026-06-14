import { AudioEngine } from "./audio-engine.mjs";

const SOCKET_EVENT = "module.token-speaker";
const LERP = 0.2;

export class TalkingHeads {
  static _container       = null;
  static _heads           = new Map(); // userId → HTMLElement
  static _speakingTimers  = new Map(); // userId → setTimeout id
  static _dragState       = null;
  static _gmPinnedTokenId = null;  // explicit SpeakerWidget pin (local GM only)
  static _gmAutoTokenId   = null;  // broadcast from controlToken (shown on all clients)
  static _headImages      = new Map(); // userId → { closed?, ah?, ee?, oo? } URL strings
  static _imagesPending   = new Set();

  // Animation state
  static _targets         = new Map(); // userId → state { mode, volume, viseme? }
  static _lerped          = new Map(); // userId → { scaleX, scaleY, offsetYPct, angle }
  static _rafId           = null;
  static _enabled         = true;
  static _waveSmooth      = 0;      // EMA of mic waveform peak — smooths head scale
  static _lastTime        = 0;      // prev rAF timestamp, for framerate-independent lerp

  // ── Lifecycle ────────────────────────────────────────────────────

  static setAllIdle() {
    for (const [userId, head] of TalkingHeads._heads) {
      clearTimeout(TalkingHeads._speakingTimers.get(userId));
      TalkingHeads._speakingTimers.delete(userId);
      head.classList.remove("ts-speaking");
      const frame = head.querySelector(".ts-head-frame");
      if (frame) frame.style.transform = "";   // don't freeze mid-bounce
      const img = head.querySelector(".ts-head-img");
      if (img?.dataset.originalSrc) { img.src = img.dataset.originalSrc; img.dataset.curViseme = "__rest__"; }
    }
    TalkingHeads._targets.clear();
    TalkingHeads._lerped.clear();
  }

  static init() {
    if (TalkingHeads._container) return;
    const el = document.createElement("div");
    el.id = "ts-talking-heads";
    document.body.appendChild(el);
    TalkingHeads._container = el;
    TalkingHeads.rebuild();
    // rAF starts on demand when a head begins speaking (see _ensureRunning).
  }

  static _ensureRunning() {
    if (TalkingHeads._rafId === null) {
      TalkingHeads._waveSmooth = 0;
      TalkingHeads._lastTime   = 0;
      TalkingHeads._rafId = requestAnimationFrame(TalkingHeads._tick);
    }
  }

  static destroy() {
    if (TalkingHeads._rafId !== null) {
      cancelAnimationFrame(TalkingHeads._rafId);
      TalkingHeads._rafId = null;
    }
    TalkingHeads._container?.remove();
    TalkingHeads._container = null;
    TalkingHeads._heads.clear();
    TalkingHeads._speakingTimers.forEach(t => clearTimeout(t));
    TalkingHeads._speakingTimers.clear();
    TalkingHeads._headImages.clear();
    TalkingHeads._imagesPending.clear();
    TalkingHeads._targets.clear();
    TalkingHeads._lerped.clear();
  }

  // ── Rebuild ───────────────────────────────────────────────────────

  static async rebuild() {
    const container = TalkingHeads._container;
    if (!container) return;

    TalkingHeads._speakingTimers.forEach(t => clearTimeout(t));
    TalkingHeads._speakingTimers.clear();
    container.innerHTML = "";
    TalkingHeads._heads.clear();
    TalkingHeads._targets.clear();
    TalkingHeads._lerped.clear();
    TalkingHeads._headImages.clear();
    TalkingHeads._imagesPending.clear();

    const mode = game.settings.get("token-speaker", "talkingHeads");
    container.className = `ts-mode-${mode}`;
    // headMode "none" = talking heads disabled entirely — but Avatar mode is
    // decoupled from headMode, so it still builds.
    const useAvatar = game.settings.get("token-speaker", "headUseAvatar");
    if (!useAvatar && game.settings.get("token-speaker", "headMode") === "none") return;

    const speakers = TalkingHeads._collectSpeakers();
    const saved    = canvas.scene?.getFlag("token-speaker", "headPositions") ?? {};

    // Per-head avatar detection (once, at build): which heads have a "-avatar"
    // sibling. Heads without one fall back to the portrait/viseme pipeline.
    if (useAvatar) {
      await Promise.all(speakers.map(async info => {
        info.hasAvatar = await TalkingHeads._hasAvatarFile(info.img);
      }));
    }

    speakers.forEach((info, idx) => {
      const head = TalkingHeads._createHead(info);
      container.appendChild(head);
      TalkingHeads._heads.set(info.userId, head);

      const pos = saved[info.userId];
      head.style.left = `${pos?.x ?? 10}px`;
      head.style.top  = `${pos?.y ?? (60 + idx * 110)}px`;
    });
  }

  // Does a "{base}-avatar" sibling exist for this image? GM lists the directory
  // (no 404 noise); players HEAD-probe. Result drives per-head avatar vs fallback.
  static async _hasAvatarFile(imgPath) {
    const q         = imgPath.indexOf("?");
    const clean     = q >= 0 ? imgPath.slice(0, q) : imgPath;
    const lastSlash = clean.lastIndexOf("/");
    const folder    = lastSlash >= 0 ? clean.slice(0, lastSlash) : "";
    const filename  = lastSlash >= 0 ? clean.slice(lastSlash + 1) : clean;
    const lastDot   = filename.lastIndexOf(".");
    const base      = lastDot >= 0 ? filename.slice(0, lastDot) : filename;

    try {
      // GM: directory listing — matches "-avatar" regardless of extension/case.
      const result = await foundry.applications.apps.FilePicker.implementation.browse("data", folder || "/");
      const files = result.files ?? [];
      const re = new RegExp(`^${_escRegex(base)}-avatar\\.[^.]+$`, "i");
      return files.some(f => re.test(f.includes("/") ? f.slice(f.lastIndexOf("/") + 1) : f));
    } catch { /* no FILES_BROWSE permission — HEAD probe the same-ext guess instead */ }

    const avatarPath = TalkingHeads._avatarPath(imgPath);
    const url = avatarPath.startsWith("/") || avatarPath.includes("://") ? avatarPath : `/${avatarPath}`;
    try { return (await fetch(url, { method: "HEAD" })).ok; }
    catch { return false; }
  }

  // ── Speaker list ─────────────────────────────────────────────────

  static _collectSpeakers() {
    const list = [];

    for (const user of game.users) {
      if (!user.active || user.isGM) continue;
      if (!user.character) continue;

      // Prefer the on-canvas token texture so viseme files match
      const token = canvas.ready
        ? canvas.tokens?.placeables?.find(t => t.document.actorId === user.character.id)
        : null;
      const img = token?.document.texture.src ?? user.character.img;

      list.push({ userId: user.id, name: user.character.name, img });
    }

    // GM head: explicit SpeakerWidget pin first, then auto-detected controlled token
    // (auto token is set locally for the GM and broadcast via socket to players)
    const gm = game.users.find(u => u.active && u.isGM);
    if (gm && canvas.ready) {
      const gmTokenId = TalkingHeads._gmPinnedTokenId ?? TalkingHeads._gmAutoTokenId;
      if (gmTokenId) {
        const t = canvas.tokens?.placeables?.find(t => t.id === gmTokenId);
        if (t) list.push({ userId: gm.id, name: t.document.name, img: t.document.texture.src });
      }
    }

    return list;
  }

  // ── GM token management ──────────────────────────────────────────

  static setGMPin(tokenId) {
    TalkingHeads._gmPinnedTokenId = tokenId;
    TalkingHeads.rebuild();
    // Broadcast so players can also show/hide the GM head
    game.socket.emit(SOCKET_EVENT, {
      type: "gmHead",
      userId: game.user.id,
      tokenId: tokenId ?? null,
    });
  }

  // Called on player clients via socket when GM controls/decontrols a token
  static setGMAutoToken(tokenId) {
    TalkingHeads._gmAutoTokenId = tokenId ?? null;
    TalkingHeads.rebuild();
  }

  // ── DOM creation ─────────────────────────────────────────────────

  // SVG feMorphology outline: dilate the alpha, flood it with `color`, then
  // paint the original portrait back on top → crisp uniform silhouette outline.
  static _outlineSVG(id, width, color) {
    return `<svg class="ts-head-filter" width="0" height="0" aria-hidden="true">`
      + `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%" color-interpolation-filters="sRGB">`
      + `<feMorphology in="SourceAlpha" operator="dilate" radius="${width}" result="d"/>`
      + `<feFlood flood-color="${color}" result="c"/>`
      + `<feComposite in="c" in2="d" operator="in" result="o"/>`
      + `<feMerge><feMergeNode in="o"/><feMergeNode in="SourceGraphic"/></feMerge>`
      + `</filter></svg>`;
  }

  // "{dir}/{base}.ext" → "{dir}/{base}-avatar.ext" (sibling avatar image).
  static _avatarPath(src) {
    const q     = src.indexOf("?");
    const clean = q >= 0 ? src.slice(0, q) : src;
    const slash = clean.lastIndexOf("/");
    const dot   = clean.lastIndexOf(".");
    return dot > slash
      ? `${clean.slice(0, dot)}-avatar${clean.slice(dot)}`
      : `${clean}-avatar`;
  }

  static _createHead(info) {
    // Avatar is per-head: only when the global toggle is on AND this head actually
    // has a "-avatar" sibling (probed in rebuild → info.hasAvatar). Heads without
    // one fall through to the normal portrait/viseme pipeline (the fallback).
    const useAvatar = game.settings.get("token-speaker", "headUseAvatar") && info.hasAvatar === true;
    const width     = game.settings.get("token-speaker", useAvatar ? "headAvatarWidth" : "headWidth");
    // Avatar always keeps natural aspect; mask is ignored (silhouette comes from
    // the avatar PNG's own alpha when Cutout is on).
    const ratio     = useAvatar ? true : game.settings.get("token-speaker", "headAspectRatio");
    const showName  = game.settings.get("token-speaker", "showHeadName");
    const nameSize  = game.settings.get("token-speaker", "headNameSize");
    const headMask  = useAvatar ? "" : game.settings.get("token-speaker", "headMask");
    const cutout    = game.settings.get("token-speaker", "headCutout");
    // Avatar and portrait/fallback have independent outline configs.
    const gs = k => game.settings.get("token-speaker", k);
    const outlineOn    = useAvatar ? gs("headAvatarOutline")      : gs("headOutline");
    const outlineWidth = useAvatar ? gs("headAvatarOutlineWidth") : gs("headOutlineWidth");
    const outlineAuto  = useAvatar ? gs("headAvatarOutlineAuto")  : gs("headOutlineAuto");
    const outlineColor = useAvatar ? gs("headAvatarOutlineColor") : gs("headOutlineColor");
    // Silhouette mode: outline + alpha-shaped ring need a real alpha source —
    // the mask, (Cutout) the portrait's transparency, or (Avatar) the avatar PNG's.
    const silhouette = outlineOn && (useAvatar || !!headMask || cutout);

    const head = document.createElement("div");
    head.className = "ts-head"
      + (silhouette ? " ts-head--silhouette" : "")
      + (useAvatar ? " ts-head--avatar" : "");
    head.dataset.userId = info.userId;
    head.style.width = `${width}px`;

    // Player colour (also the default outline/ring colour)
    const user = game.users.get(info.userId);
    const hex  = user?.color?.css ?? "#ff6400";
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    head.style.setProperty("--ts-player-color", hex);
    head.style.setProperty("--ts-player-color-glow", `rgba(${r}, ${g}, ${b}, 0.65)`);

    const frame = document.createElement("div");
    frame.className = "ts-head-frame" + (ratio ? " ts-head-frame--ratio" : "");
    frame.style.width = `${width}px`;
    if (!ratio) frame.style.height = `${width}px`;

    if (headMask) {
      const maskUrl = headMask.startsWith("/") || headMask.includes("://") ? headMask : `/${headMask}`;
      // Remove circular clip so the CSS mask fully controls the portrait shape.
      // Without this, border-radius:50% + overflow:hidden clips to a circle first
      // and the mask can only further subtract from that circle — never reshape it.
      frame.style.borderRadius = "0";
      // Apply as CSS mask — luminance mode so greyscale masks work (white=visible, black=hidden)
      frame.style.maskImage = `url("${maskUrl}")`;
      frame.style.webkitMaskImage = `url("${maskUrl}")`;
      frame.style.maskSize = "cover";
      frame.style.webkitMaskSize = "cover";
      frame.style.maskRepeat = "no-repeat";
      frame.style.webkitMaskRepeat = "no-repeat";
      frame.style.maskPosition = "center";
      frame.style.webkitMaskPosition = "center";
      frame.style.maskMode = "luminance";
    }

    const img = document.createElement("img");
    img.className = "ts-head-img";
    const baseSrc = useAvatar ? TalkingHeads._avatarPath(info.img) : info.img;
    if (useAvatar) {
      // Fall back to the original token/portrait art if no "-avatar" file exists.
      img.addEventListener("error", function onErr() {
        img.removeEventListener("error", onErr);
        img.src = info.img;
        img.dataset.originalSrc = info.img;
      });
    }
    img.src = baseSrc;
    img.dataset.originalSrc = baseSrc;
    img.alt = info.name.replace(/"/g, "&quot;");
    img.draggable = false;

    frame.appendChild(img);

    // Speech bubble — floats above the portrait frame (positioned absolutely)
    const bubble = document.createElement("div");
    bubble.className = "ts-head-bubble";
    const dotsEl = document.createElement("span");
    dotsEl.className = "ts-head-dots";
    dotsEl.textContent = "·";
    bubble.appendChild(dotsEl);
    head.appendChild(bubble);

    if (silhouette) {
      if (!headMask) {
        // Cutout: silhouette comes from the PNG's own alpha — don't clip it to the
        // circular frame, and fit (not crop) so the whole shape stays outlined.
        frame.style.borderRadius = "0";
        frame.style.overflow     = "visible";
        img.style.objectFit      = "contain";
      }
      // Two wrappers above the masked frame so the outline isn't clipped by the
      // mask (filter runs before mask on the same element): glow > outline > frame.
      const glow    = document.createElement("div");
      glow.className = "ts-head-glow";
      const outline = document.createElement("div");
      outline.className = "ts-head-outline";

      const width2  = outlineWidth;
      const color   = outlineAuto ? hex : outlineColor;
      const filterId = `ts-outline-${info.userId}`;
      outline.insertAdjacentHTML("afterbegin", TalkingHeads._outlineSVG(filterId, width2, color));
      outline.style.filter = `url(#${filterId})`;

      outline.appendChild(frame);
      glow.appendChild(outline);
      head.appendChild(glow);
    } else {
      head.appendChild(frame);
    }

    if (showName) {
      const nameEl = document.createElement("div");
      nameEl.className = "ts-head-name";
      nameEl.style.maxWidth = `${width}px`;
      // Scale font proportionally with head width (baseline: 0.72em at 80px), then
      // apply the GM Name Size multiplier.
      nameEl.style.fontSize = `${(Math.max(0.55, (width / 100) * 0.72) * (nameSize || 1)).toFixed(2)}em`;
      nameEl.textContent = info.name;
      head.appendChild(nameEl);
    }

    if (game.user.isGM) {
      head.dataset.draggable = "true";
      head.addEventListener("mousedown", TalkingHeads._onDragStart);
    }

    head.addEventListener("dragstart", e => e.preventDefault());

    // Only discover viseme assets when the head mode actually swaps images.
    // Avatar mode is static-image + bounce only — never visemes.
    const headMode = game.settings.get("token-speaker", "headMode");
    if (!useAvatar && (headMode === "advanced" || headMode === "both" || headMode === "hybrid")) {
      TalkingHeads._discoverHeadImages(info.userId, info.img);
    }

    return head;
  }

  // ── Animation tick (rAF) ─────────────────────────────────────────

  static _tick(ts) {
    const get = k => game.settings.get("token-speaker", k);
    // All animation params are world-scoped → same values for every client
    const headMode     = get("headMode");
    const bounceMax    = get("headBounceMax");    // % of frame height
    const angleMax     = get("headAngleMax");
    const scaleAxis    = get("headScaleAxis");
    const scaleHigh    = get("headScaleHigh");
    const intensity    = get("headIntensity");
    const scaleDamping = get("headScaleDamping");
    const mirrorMap    = get("headMirrorMap");
    const now          = Date.now();

    // Framerate-independent scale smoothing: damping → tau → alpha
    const t            = ts ?? performance.now();
    const delta        = TalkingHeads._lastTime ? (t - TalkingHeads._lastTime) : (1000 / 60);
    TalkingHeads._lastTime = t;
    const scaleTau     = scaleDamping <= 0 ? 0 : -(1000 / 60) / Math.log(Math.min(scaleDamping, 0.999));
    const scaleAlpha   = scaleTau <= 0 ? 1 : 1 - Math.exp(-delta / scaleTau);
    let   waveFrame    = false;

    for (const [userId, target] of TalkingHeads._targets) {
      const head = TalkingHeads._heads.get(userId);
      if (!head) continue;

      const frame = head.querySelector(".ts-head-frame");
      const img   = head.querySelector(".ts-head-img");
      if (!frame || !img) continue;

      let s = TalkingHeads._lerped.get(userId);
      if (!s) {
        s = { scaleX: 1, scaleY: 1, offsetYPct: 0, angle: 0 };
        TalkingHeads._lerped.set(userId, s);
      }

      const speaking         = target.speaking === true;
      const vol              = target.volume;
      const effectiveVol     = Math.min(vol * intensity, 1.0);
      const hasVisemes       = head.classList.contains("ts-head--has-visemes");
      const speakerSendsVis  = target.viseme !== undefined;
      const mirrored         = mirrorMap[userId] === true;

      // The asset caps the motion: only viseme heads can lip-sync. Avatar (solo
      // image) and plain token heads have no viseme class → they degrade through
      // the same branches below (simple/hybrid/both → bounce, advanced → static,
      // none → still). So one Motion mode (headMode) drives every head; capability
      // is clamped automatically by hasVisemes.
      let doBounce;
      if (headMode === "none") {
        doBounce = false;
      } else if (headMode === "simple") {
        doBounce = true;
      } else if (headMode === "advanced") {
        doBounce = false;                              // lip-sync where capable, else static
      } else if (headMode === "hybrid") {
        doBounce = !speakerSendsVis || !hasVisemes;    // bounce when no visemes to sync
      } else { // "both"
        doBounce = true;
      }

      // Bounce/stretch only while actively voiced. Gate on real gated volume,
      // not just the `speaking` hold flag — otherwise ambient noise during the
      // silence-hold window (and the ungated waveform scale) jitters the head.
      const voiced = effectiveVol > 0.06;

      if (doBounce && speaking && voiced) {
        // Scale amplitude tracks the sensitivity-gated volume envelope (× intensity)
        // so the Sensitivity slider and Intensity both control how easily you reach
        // peak stretch — no screaming, no dependence on raw mic input gain.
        const s0 = Math.min(1, effectiveVol);
        const sf = 1.0 + s0 * (scaleHigh - 1.0);
        const tSX = scaleAxis !== "y" ? sf : 1.0;
        const tSY = scaleAxis !== "x" ? sf : 1.0;
        s.scaleX += (tSX - s.scaleX) * scaleAlpha;
        s.scaleY += (tSY - s.scaleY) * scaleAlpha;

        const tOY  = bounceMax * effectiveVol;
        const tAng = (angleMax > 0 && effectiveVol > 0.02)
          ? Math.sin(now * 0.01) * effectiveVol * angleMax
          : 0;
        s.offsetYPct += (tOY  - s.offsetYPct) * LERP;
        s.angle      += (tAng - s.angle)       * LERP;
      } else {
        s.scaleX     += (1.0 - s.scaleX)     * LERP;
        s.scaleY     += (1.0 - s.scaleY)     * LERP;
        s.offsetYPct += (0   - s.offsetYPct) * LERP;
        s.angle      += (0   - s.angle)      * LERP;
      }

      // Settle: silent and back at rest → snap, set rest frame, drop from active.
      if (!speaking
          && Math.abs(s.scaleX - 1)     < 0.001
          && Math.abs(s.scaleY - 1)     < 0.001
          && Math.abs(s.offsetYPct)     < 0.05
          && Math.abs(s.angle)          < 0.05) {
        s.scaleX = 1; s.scaleY = 1; s.offsetYPct = 0; s.angle = 0;
        frame.style.transform = "";
        head.classList.remove("ts-speaking");
        TalkingHeads._setRestImage(head, userId);
        TalkingHeads._targets.delete(userId);
        continue;
      }

      frame.style.transform =
        `translateY(-${s.offsetYPct.toFixed(2)}%) ` +
        `scale(${s.scaleX.toFixed(4)}, ${s.scaleY.toFixed(4)}) ` +
        `rotate(${s.angle.toFixed(2)}deg)`;

      // Mirror flips only the image pixel content; frame border/glow stay unaffected
      img.style.transform = mirrored ? "scaleX(-1)" : "";

      // Animate bubble dots when speaking
      if (head.classList.contains("ts-speaking") && head.classList.contains("ts-head--show-bubble")) {
        const dotsEl = head.querySelector(".ts-head-dots");
        if (dotsEl) {
          const tick = Math.floor(now / 280) % 3;
          dotsEl.textContent = tick === 0 ? "·" : tick === 1 ? "··" : "···";
        }
      }
    }

    // Keep going only while heads are still animating; otherwise stop the loop.
    TalkingHeads._rafId = TalkingHeads._targets.size
      ? requestAnimationFrame(TalkingHeads._tick)
      : null;
  }

  // Rest frame: dedicated closed image in viseme modes, else the original portrait.
  static _setRestImage(head, userId) {
    const img = head.querySelector(".ts-head-img");
    if (!img) return;
    if (img.dataset.curViseme === "__rest__") return;
    const headMode     = game.settings.get("token-speaker", "headMode");
    const wantsVisemes = headMode === "advanced" || headMode === "hybrid" || headMode === "both";
    const hasVisemes   = head.classList.contains("ts-head--has-visemes");
    const images       = TalkingHeads._headImages.get(userId);
    const rest = (wantsVisemes && hasVisemes && images?.closed) ? images.closed : img.dataset.originalSrc;
    if (rest) img.src = rest;
    img.dataset.curViseme = "__rest__";
  }

  // ── Animation state update ────────────────────────────────────────

  static update(userId, state) {
    if (!TalkingHeads._enabled) return;
    const head = TalkingHeads._heads.get(userId);
    if (!head) return;

    const speaking = state.speaking === true;

    // Silent and already settled (not in the active set) → nothing to do, stay idle.
    if (!speaking && !TalkingHeads._targets.has(userId)) return;

    // Store for the rAF tick
    TalkingHeads._targets.set(userId, state);

    const headMode     = game.settings.get("token-speaker", "headMode");
    const wantsVisemes = headMode === "advanced" || headMode === "hybrid" || headMode === "both";
    const hasVisemes   = head.classList.contains("ts-head--has-visemes");
    const doVisemes    = wantsVisemes && state.viseme !== undefined && hasVisemes;

    const headIndicator = game.settings.get("token-speaker", "headIndicatorStyle");
    head.classList.toggle("ts-head--show-ring",   headIndicator === "ring"   || headIndicator === "both");
    head.classList.toggle("ts-head--show-bubble", headIndicator === "bubble" || headIndicator === "both");

    if (speaking) {
      head.classList.add("ts-speaking");
      // Viseme swap — guarded by the current frame key so we never reassign the
      // same image every poll.
      if (doVisemes) {
        const img = head.querySelector(".ts-head-img");
        if (img && img.dataset.curViseme !== state.viseme) {
          const images = TalkingHeads._headImages.get(userId);
          const src = images?.[state.viseme] ?? images?.closed ?? img.dataset.originalSrc;
          if (src) { img.src = src; img.dataset.curViseme = state.viseme; }
        }
      }
    } else {
      head.classList.remove("ts-speaking");
    }

    TalkingHeads._ensureRunning();
  }

  // ── Viseme image discovery (URL-based, no PIXI) ──────────────────

  static async _discoverHeadImages(userId, imgPath) {
    if (TalkingHeads._imagesPending.has(userId)) return;
    if (TalkingHeads._headImages.has(userId)) return;
    TalkingHeads._imagesPending.add(userId);

    const lastSlash = imgPath.lastIndexOf("/");
    const folder    = lastSlash >= 0 ? imgPath.slice(0, lastSlash) : "";
    const filename  = lastSlash >= 0 ? imgPath.slice(lastSlash + 1) : imgPath;
    const lastDot   = filename.lastIndexOf(".");
    const base      = lastDot >= 0 ? filename.slice(0, lastDot) : filename;
    const ext       = lastDot >= 0 ? filename.slice(lastDot) : "";

    let images = null;

    try {
      // GM path: directory listing, avoids 404 noise
      const result = await foundry.applications.apps.FilePicker.implementation.browse("data", folder || "/");
      const files = result.files ?? [];

      const sheetRe = new RegExp(`^${_escRegex(base)}[-_]sheet\\.[^.]+$`, "i");
      const sheetFile = files.find(f => sheetRe.test(f.includes("/") ? f.slice(f.lastIndexOf("/") + 1) : f));
      if (sheetFile) {
        images = await TalkingHeads._loadFlipbookURLs(sheetFile);
      } else {
        images = {};
        for (const viseme of ["closed", "oo", "ah", "ee"]) {
          const re = new RegExp(`^${_escRegex(base)}[ \\-_]${viseme}\\.[^.]+$`, "i");
          const match = files.find(f => re.test(f.includes("/") ? f.slice(f.lastIndexOf("/") + 1) : f));
          if (match) images[viseme] = match.startsWith("/") || match.includes("://") ? match : `/${match}`;
        }
      }
    } catch {
      // Player fallback: HEAD probes (causes 404 console noise for misses)
      const prefix = folder ? `${folder}/${base}` : base;

      for (const sep of ["-", "_"]) {
        const sheetPath = `${prefix}${sep}sheet${ext}`;
        const url = sheetPath.startsWith("/") || sheetPath.includes("://") ? sheetPath : `/${sheetPath}`;
        try {
          const res = await fetch(url, { method: "HEAD" });
          if (res.ok) { images = await TalkingHeads._loadFlipbookURLs(sheetPath); break; }
        } catch { /* try next */ }
      }

      if (!images) {
        images = {};
        for (const viseme of ["closed", "oo", "ah", "ee"]) {
          const variants = [viseme.toUpperCase(), viseme, viseme[0].toUpperCase() + viseme.slice(1)];
          let found = false;
          for (const sep of ["-", "_", " "]) {
            if (found) break;
            for (const v of variants) {
              const path = `${prefix}${sep}${v}${ext}`;
              const url  = path.startsWith("/") || path.includes("://") ? path : `/${path}`;
              try {
                const res = await fetch(url, { method: "HEAD" });
                if (res.ok) { images[viseme] = url; found = true; break; }
              } catch { /* try next */ }
            }
          }
        }
      }
    }

    TalkingHeads._headImages.set(userId, images ?? {});
    TalkingHeads._imagesPending.delete(userId);

    const head = TalkingHeads._heads.get(userId);
    // A lone closed frame is not enough for lip-sync — require a real mouth shape.
    const hasVisemes = images && (images.oo || images.ah || images.ee);
    if (head && hasVisemes) {
      head.classList.add("ts-head--has-visemes");
      // Show the dedicated -closed frame as the silent default the moment assets
      // load — a viseme head must NEVER sit on the raw token art. (Priority:
      // closed > avatar > token; avatar heads skip discovery so keep their image.)
      // Skip while mid-speech so we don't stomp the live viseme swap.
      if (!head.classList.contains("ts-speaking")) TalkingHeads._setRestImage(head, userId);
    }
  }

  // Crop a 2×2 flipbook sheet into four data-URL images using Canvas 2D.
  // Layout matches CanvasAnimator: closed=top-left, ah=top-right, ee=bottom-left, oo=bottom-right
  static async _loadFlipbookURLs(sheetPath) {
    const url = sheetPath.startsWith("/") || sheetPath.includes("://") ? sheetPath : `/${sheetPath}`;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = url;
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
    const hw = img.naturalWidth  / 2;
    const hh = img.naturalHeight / 2;
    const layout = { closed: [0, 0], ah: [hw, 0], ee: [0, hh], oo: [hw, hh] };
    const result = {};
    for (const [key, [sx, sy]] of Object.entries(layout)) {
      const cv  = document.createElement("canvas");
      cv.width  = hw;
      cv.height = hh;
      cv.getContext("2d").drawImage(img, sx, sy, hw, hh, 0, 0, hw, hh);
      result[key] = cv.toDataURL();
    }
    return result;
  }

  // ── Position management ──────────────────────────────────────────

  static setPosition(userId, x, y) {
    const head = TalkingHeads._heads.get(userId);
    if (!head) return;
    head.style.left = `${x}px`;
    head.style.top  = `${y}px`;
  }

  static syncScene() {
    TalkingHeads.rebuild();
  }

  // ── Drag (GM only) ───────────────────────────────────────────────

  static _onDragStart(e) {
    if (e.button !== 0) return;
    const head   = e.currentTarget;
    TalkingHeads._dragState = {
      el:       head,
      userId:   head.dataset.userId,
      startX:   e.clientX,
      startY:   e.clientY,
      origLeft: head.offsetLeft,
      origTop:  head.offsetTop,
    };
    document.addEventListener("mousemove", TalkingHeads._onDragMove);
    document.addEventListener("mouseup",   TalkingHeads._onDragEnd);
    e.preventDefault();
  }

  static _onDragMove(e) {
    const d = TalkingHeads._dragState;
    if (!d) return;
    d.el.style.left = `${d.origLeft + e.clientX - d.startX}px`;
    d.el.style.top  = `${d.origTop  + e.clientY - d.startY}px`;
  }

  static async _onDragEnd(e) {
    document.removeEventListener("mousemove", TalkingHeads._onDragMove);
    document.removeEventListener("mouseup",   TalkingHeads._onDragEnd);
    const d = TalkingHeads._dragState;
    TalkingHeads._dragState = null;
    if (!d) return;

    const x = d.origLeft + e.clientX - d.startX;
    const y = d.origTop  + e.clientY - d.startY;

    const positions = foundry.utils.deepClone(
      canvas.scene?.getFlag("token-speaker", "headPositions") ?? {}
    );
    positions[d.userId] = { x, y };
    await canvas.scene?.setFlag("token-speaker", "headPositions", positions);

    game.socket.emit(SOCKET_EVENT, {
      type: "headPosition",
      userId: game.user.id,
      targetUserId: d.userId,
      x, y,
    });
  }
}

function _escRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
