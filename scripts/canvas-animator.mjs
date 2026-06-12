import { AudioEngine } from "./audio-engine.mjs";
import { SpeakerWidget } from "./speaker-widget.mjs";

const LERP = 0.2;

export class CanvasAnimator {
  static _targets        = new Map(); // tokenId → { mode, volume, viseme }
  static _lerped         = new Map(); // tokenId → lerp state
  static _tokenTextures  = new Map(); // tokenId → { closed?, oo, ah, ee } (PIXI.Texture or null)
  static _texturePending = new Set(); // tokenIds currently being discovered
  static _originalTextures = new Map(); // tokenId → original PIXI.Texture before swap
  static _maskTextures   = new Map(); // tokenId → PIXI.Texture (pending application)
  static _maskSprites    = new Map(); // tokenId → PIXI.Sprite (applied mask)
  static _overlays       = new Map(); // tokenId → { ring, bubble, dotsText }
  static _localTokenId   = null;      // tokenId of the token we are currently driving locally
  static _enabled        = true;

  static init() {
    PIXI.Ticker.shared.add(CanvasAnimator._tick, CanvasAnimator);
  }

  static _hasVisemes(tokenId) {
    const t = CanvasAnimator._tokenTextures.get(tokenId);
    return t != null && (t.oo?.valid || t.ah?.valid || t.ee?.valid);
  }

  // Discover and cache viseme textures (and optional mask) for a token.
  static async _loadTokenTextures(tokenId, imgPath) {
    CanvasAnimator._texturePending.add(tokenId);

    const textures = await CanvasAnimator._discoverVisemes(imgPath);
    CanvasAnimator._tokenTextures.set(tokenId, textures);

    const maskPath = await CanvasAnimator._findMaskPath(imgPath);
    if (maskPath) {
      try {
        const maskTex = await CanvasAnimator._loadMask(maskPath);
        CanvasAnimator._maskTextures.set(tokenId, maskTex);
      } catch { /* mask load failed — skip silently */ }
    }

    CanvasAnimator._texturePending.delete(tokenId);
  }

  static async _discoverVisemes(imgPath) {
    const lastSlash = imgPath.lastIndexOf("/");
    const folder    = lastSlash >= 0 ? imgPath.slice(0, lastSlash) : "";
    const filename  = lastSlash >= 0 ? imgPath.slice(lastSlash + 1) : imgPath;
    const lastDot   = filename.lastIndexOf(".");
    const base      = lastDot >= 0 ? filename.slice(0, lastDot) : filename;
    const ext       = lastDot >= 0 ? filename.slice(lastDot) : "";

    // Preferred path: directory listing — finds files regardless of case/separator,
    // no failed HTTP probes. Requires FILES_BROWSE permission (GM/assistant).
    try {
      const result = await foundry.applications.apps.FilePicker.implementation.browse("data", folder || "/");
      const files = result.files ?? [];

      // Check for flipbook sheet first ({base}-sheet.ext or {base}_sheet.ext)
      const sheetRe = new RegExp(`^${_escapeRegex(base)}[-_]sheet\\.[^.]+$`, "i");
      const sheetFile = files.find(f => sheetRe.test(f.includes("/") ? f.slice(f.lastIndexOf("/") + 1) : f));
      if (sheetFile) return await CanvasAnimator._loadFlipbook(sheetFile);

      // Individual viseme files
      const textures = {};
      for (const viseme of ["oo", "ah", "ee"]) {
        const re = new RegExp(`^${_escapeRegex(base)}[ \\-_]${viseme}\\.[^.]+$`, "i");
        const match = files.find(f => re.test(f.includes("/") ? f.slice(f.lastIndexOf("/") + 1) : f));
        if (match) {
          try { textures[viseme] = await foundry.canvas.loadTexture(match); }
          catch { textures[viseme] = null; }
        }
      }
      return textures;
    } catch { /* no FILES_BROWSE permission — fall through */ }

    // Fallback for players: probe with HEAD requests.
    // Causes 404 console noise for misses, but players cannot browse directories.
    const prefix = folder ? `${folder}/${base}` : base;

    // Check for flipbook sheet first
    for (const sep of ["-", "_"]) {
      const sheetPath = `${prefix}${sep}sheet${ext}`;
      const url = sheetPath.startsWith("/") || sheetPath.includes("://") ? sheetPath : `/${sheetPath}`;
      try {
        const res = await fetch(url, { method: "HEAD" });
        if (res.ok) return await CanvasAnimator._loadFlipbook(sheetPath);
      } catch { /* try next */ }
    }

    // Individual viseme files via HEAD probes
    const textures = {};
    for (const viseme of ["oo", "ah", "ee"]) {
      const variants = [viseme.toUpperCase(), viseme, viseme[0].toUpperCase() + viseme.slice(1)];
      let found = false;
      for (const sep of ["-", "_", " "]) {
        if (found) break;
        for (const v of variants) {
          const path = `${prefix}${sep}${v}${ext}`;
          const url  = path.startsWith("/") || path.includes("://") ? path : `/${path}`;
          try {
            const res = await fetch(url, { method: "HEAD" });
            if (res.ok) {
              try { textures[viseme] = await foundry.canvas.loadTexture(path); }
              catch { textures[viseme] = null; }
              found = true;
              break;
            }
          } catch { /* try next */ }
        }
      }
    }
    return textures;
  }

  // Build four cropped PIXI.Textures from a 2×2 sprite sheet.
  // Layout: closed=top-left, ah=top-right, ee=bottom-left, oo=bottom-right
  static async _loadFlipbook(sheetPath) {
    const full = await foundry.canvas.loadTexture(sheetPath);
    const hw = full.width  / 2;
    const hh = full.height / 2;
    const bt = full.baseTexture;
    return {
      closed: new PIXI.Texture(bt, new PIXI.Rectangle(0,  0,  hw, hh)),
      ah:     new PIXI.Texture(bt, new PIXI.Rectangle(hw, 0,  hw, hh)),
      ee:     new PIXI.Texture(bt, new PIXI.Rectangle(0,  hh, hw, hh)),
      oo:     new PIXI.Texture(bt, new PIXI.Rectangle(hw, hh, hw, hh)),
    };
  }

  // Find the mask sibling file ({base}-mask.ext or {base}_mask.ext).
  // Returns the path string or null.
  static async _findMaskPath(imgPath) {
    const lastSlash = imgPath.lastIndexOf("/");
    const folder    = lastSlash >= 0 ? imgPath.slice(0, lastSlash) : "";
    const filename  = lastSlash >= 0 ? imgPath.slice(lastSlash + 1) : imgPath;
    const lastDot   = filename.lastIndexOf(".");
    const base      = lastDot >= 0 ? filename.slice(0, lastDot) : filename;
    const ext       = lastDot >= 0 ? filename.slice(lastDot) : "";

    try {
      const result = await foundry.applications.apps.FilePicker.implementation.browse("data", folder || "/");
      const files = result.files ?? [];
      const re = new RegExp(`^${_escapeRegex(base)}[-_]mask\\.[^.]+$`, "i");
      const match = files.find(f => re.test(f.includes("/") ? f.slice(f.lastIndexOf("/") + 1) : f));
      return match ?? null;
    } catch { /* fall through */ }

    const prefix = folder ? `${folder}/${base}` : base;
    for (const sep of ["-", "_"]) {
      const maskPath = `${prefix}${sep}mask${ext}`;
      const url = maskPath.startsWith("/") || maskPath.includes("://") ? maskPath : `/${maskPath}`;
      try {
        const res = await fetch(url, { method: "HEAD" });
        if (res.ok) return maskPath;
      } catch { /* try next */ }
    }
    return null;
  }

  // Load a grayscale mask image and convert luminance → alpha, returning a PIXI.Texture.
  static async _loadMask(path) {
    const url = path.startsWith("/") || path.includes("://") ? path : `/${path}`;
    const img = new Image();
    img.src = url;
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
    const cv  = document.createElement("canvas");
    cv.width  = img.naturalWidth;
    cv.height = img.naturalHeight;
    const ctx = cv.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const px = ctx.getImageData(0, 0, cv.width, cv.height);
    for (let i = 0; i < px.data.length; i += 4) {
      const luma = 0.299 * px.data[i] + 0.587 * px.data[i + 1] + 0.114 * px.data[i + 2];
      px.data[i] = px.data[i + 1] = px.data[i + 2] = 255;
      px.data[i + 3] = Math.round(luma);
    }
    ctx.putImageData(px, 0, 0);
    return PIXI.Texture.from(cv);
  }

  // Restore a token's mesh to neutral and remove it from all tracking maps.
  static cleanupToken(tokenId) {
    const s = CanvasAnimator._lerped.get(tokenId);
    if (s) {
      const token = canvas?.tokens?.placeables?.find(t => t.id === tokenId);
      if (token?.mesh) {
        token.mesh.scale.x    = s.baseScaleX;
        token.mesh.scale.y    = s.baseScaleY;
        token.mesh.position.y = s.baseY;
        token.mesh.angle      = 0;
        token.mesh.mask       = null;
      }
      if (token) _restoreTexture(tokenId, token, CanvasAnimator._originalTextures);
      CanvasAnimator._lerped.delete(tokenId);
    }
    // Clean up mask sprite
    const ms = CanvasAnimator._maskSprites.get(tokenId);
    if (ms) {
      ms.parent?.removeChild(ms);
      ms.destroy();
      CanvasAnimator._maskSprites.delete(tokenId);
    }
    CanvasAnimator._maskTextures.delete(tokenId);

    const ov = CanvasAnimator._overlays.get(tokenId);
    if (ov) {
      ov.ring?.destroy();
      ov.bubble?.destroy();
      CanvasAnimator._overlays.delete(tokenId);
    }

    CanvasAnimator._targets.delete(tokenId);
    if (CanvasAnimator._localTokenId === tokenId) CanvasAnimator._localTokenId = null;
  }

  // Clear all animation state — call when the canvas is rebuilt (meshes are already gone).
  static reset() {
    CanvasAnimator._targets.clear();
    CanvasAnimator._lerped.clear();
    CanvasAnimator._originalTextures.clear();
    CanvasAnimator._tokenTextures.clear();
    CanvasAnimator._texturePending.clear();
    CanvasAnimator._maskTextures.clear();
    CanvasAnimator._maskSprites.forEach(ms => { ms.parent?.removeChild(ms); ms.destroy(); });
    CanvasAnimator._maskSprites.clear();
    CanvasAnimator._overlays.forEach(ov => { ov.ring?.destroy(); ov.bubble?.destroy(); });
    CanvasAnimator._overlays.clear();
    CanvasAnimator._localTokenId = null;
  }

  // Returns the token that was targeted so the caller can include its id in the broadcast.
  static applyLocalState(state) {
    const token = _getLocalToken();

    if (!token) {
      if (CanvasAnimator._localTokenId) CanvasAnimator.cleanupToken(CanvasAnimator._localTokenId);
      return null;
    }

    if (CanvasAnimator._localTokenId && CanvasAnimator._localTokenId !== token.id) {
      CanvasAnimator.cleanupToken(CanvasAnimator._localTokenId);
    }

    CanvasAnimator._localTokenId = token.id;
    CanvasAnimator._targets.set(token.id, state);
    _ensureTokenTextures(token);
    return token;
  }

  // tokenId is the canvas placeable id sent in the socket packet — no user→character lookup needed.
  static applyRemoteState(tokenId, state) {
    if (!canvas.ready) return;
    const token = canvas.tokens.placeables.find(t => t.id === tokenId);
    if (!token) return;
    CanvasAnimator._targets.set(token.id, state);
    _ensureTokenTextures(token);
  }

  static _tick() {
    if (!canvas.ready) return;

    if (!CanvasAnimator._enabled) {
      if (CanvasAnimator._targets.size || CanvasAnimator._lerped.size) CanvasAnimator.reset();
      return;
    }

    const get = k => game.settings.get("token-speaker", k);
    const bounceMax      = get("bounceMax");
    const angleMax       = get("angleMax");
    const scaleAxis      = get("scaleAxis");
    const scaleLow       = get("scaleLow");
    const scaleHigh      = get("scaleHigh");
    const intensity      = get("intensity");
    const scaleDamping   = get("scaleDamping");
    const indicatorStyle = get("indicatorStyle");
    const lerpScale      = 1.0 - scaleDamping;
    const now            = Date.now();
    const delta          = PIXI.Ticker.shared.deltaMS;

    for (const [tokenId, target] of CanvasAnimator._targets) {
      const token = canvas.tokens.placeables.find(t => t.id === tokenId);
      if (!token?.mesh) continue;

      // Apply pending mask texture (created async, applied here on the render thread)
      if (CanvasAnimator._maskTextures.has(tokenId) && !CanvasAnimator._maskSprites.has(tokenId)) {
        const maskTex = CanvasAnimator._maskTextures.get(tokenId);
        const ms = new PIXI.Sprite(maskTex);
        ms.anchor.set(0.5, 0.5);
        token.mesh.parent?.addChild(ms);
        token.mesh.mask = ms;
        CanvasAnimator._maskSprites.set(tokenId, ms);
        CanvasAnimator._maskTextures.delete(tokenId);
      }

      let s = CanvasAnimator._lerped.get(tokenId);
      if (!s) {
        const bsx = token.mesh.scale.x;
        const bsy = token.mesh.scale.y;
        s = {
          scaleX: bsx, scaleY: bsy, baseScaleX: bsx, baseScaleY: bsy,
          offsetY: 0, angle: 0,
          // Captured once; only recalculated when the document position changes
          // to avoid the compounding-read-what-we-wrote drift.
          baseY: token.mesh.position.y,
          docY:  token.document.y,
          // Overlay animation state
          ringAlpha: 0, ringScale: 1.0, ringColorUsed: "",
          bubbleAlpha: 0, bubbleHoldMs: 0,
        };
        CanvasAnimator._lerped.set(tokenId, s);
      } else if (s.docY !== token.document.y) {
        s.baseY = token.mesh.position.y - s.offsetY;
        s.docY  = token.document.y;
      }

      const vol = target.volume;
      const effectiveVol = Math.min(vol * intensity, 1.0);

      // Resolve effective mode per token.
      // hybrid → advanced if visemes ready, else simple.
      // both   → visemes + bounce if visemes ready, else simple.
      let effectiveMode = target.mode;
      if (target.mode === "hybrid") {
        effectiveMode = CanvasAnimator._hasVisemes(tokenId) ? "advanced" : "simple";
      } else if (target.mode === "both") {
        effectiveMode = CanvasAnimator._hasVisemes(tokenId) ? "both" : "simple";
      }

      const doBounce  = effectiveMode === "simple" || effectiveMode === "both";
      const doVisemes = effectiveMode === "advanced" || effectiveMode === "both";

      if (!doVisemes) _restoreTexture(tokenId, token, CanvasAnimator._originalTextures);

      if (doBounce) {
        const rawSample = AudioEngine.getWaveformSample();
        if (vol > 0.02) {
          const s0 = Math.max(-1, Math.min(1, rawSample * intensity));
          const sf = s0 >= 0
            ? 1.0 + s0 * (scaleHigh - 1.0)
            : 1.0 + s0 * (1.0 - scaleLow);
          const tSX = scaleAxis !== "y" ? s.baseScaleX * sf : s.baseScaleX;
          const tSY = scaleAxis !== "x" ? s.baseScaleY * sf : s.baseScaleY;
          s.scaleX += (tSX - s.scaleX) * lerpScale;
          s.scaleY += (tSY - s.scaleY) * lerpScale;
        } else {
          s.scaleX += (s.baseScaleX - s.scaleX) * LERP;
          s.scaleY += (s.baseScaleY - s.scaleY) * LERP;
        }
        const tOY  = -bounceMax * effectiveVol;
        const tAng = (angleMax > 0 && effectiveVol > 0.02)
          ? Math.sin(now * 0.01) * effectiveVol * angleMax
          : 0;
        s.offsetY += (tOY  - s.offsetY) * LERP;
        s.angle   += (tAng - s.angle)   * LERP;
      } else {
        // Pure advanced: lerp everything back to neutral
        s.scaleX  += (s.baseScaleX - s.scaleX)  * LERP;
        s.scaleY  += (s.baseScaleY - s.scaleY)  * LERP;
        s.offsetY += (0            - s.offsetY) * LERP;
        s.angle   += (0            - s.angle)   * LERP;
      }

      if (doVisemes) {
        const viseme   = target.viseme ?? "closed";
        const textures = CanvasAnimator._tokenTextures.get(tokenId) ?? {};
        const tex      = textures[viseme];
        if (tex?.valid) {
          if (!CanvasAnimator._originalTextures.has(tokenId)) {
            CanvasAnimator._originalTextures.set(tokenId, token.mesh.texture);
          }
          token.mesh.texture = tex;
        } else if (viseme === "closed") {
          _restoreTexture(tokenId, token, CanvasAnimator._originalTextures);
        }
      }

      token.mesh.scale.x    = s.scaleX;
      token.mesh.scale.y    = s.scaleY;
      token.mesh.position.y = s.baseY + s.offsetY;
      token.mesh.angle      = s.angle;

      // Keep mask sprite aligned to the (now-updated) mesh position
      const ms = CanvasAnimator._maskSprites.get(tokenId);
      if (ms) {
        ms.position.set(token.mesh.position.x, token.mesh.position.y);
        ms.width  = token.mesh.width;
        ms.height = token.mesh.height;
      }

      // ── Speaking Indicators ──────────────────────────────────────
      const isSpeaking = vol > 0.02;
      const cx = token.w / 2;
      const cy = token.h / 2;

      _ensureOverlays(token, tokenId);
      const ov = CanvasAnimator._overlays.get(tokenId);

      if (ov) {
        const showRing   = indicatorStyle === "ring"   || indicatorStyle === "both";
        const showBubble = indicatorStyle === "bubble" || indicatorStyle === "both";

        // Ring — use the player color of whoever owns this token as their character
        if (ov.ring) {
          ov.ring.visible = showRing;
          if (showRing) {
            const owner = game.users.find(u => u.character?.id === token.document.actorId) ?? game.user;
            const ringColorHex = owner.color?.css ?? "#ff6400";
            if (s.ringColorUsed !== ringColorHex) {
              const c = parseInt(ringColorHex.replace("#", ""), 16);
              ov.ring.clear();
              ov.ring.lineStyle(3, c, 1);
              ov.ring.drawCircle(cx, cy, cx + 6);
              s.ringColorUsed = ringColorHex;
            }
            const tA = isSpeaking ? Math.max(0.35, effectiveVol) * 0.85 : 0;
            const tS = isSpeaking ? 1.0 + 0.08 * effectiveVol : 1.0;
            s.ringAlpha += (tA - s.ringAlpha) * 0.15;
            s.ringScale += (tS - s.ringScale) * 0.15;
            ov.ring.alpha = s.ringAlpha;
            ov.ring.scale.set(s.ringScale);
          }
        }

        // Bubble — fade in on speech, hold 0.8 s after silence, then fade out
        if (ov.bubble) {
          ov.bubble.visible = showBubble;
          if (showBubble) {
            if (isSpeaking) {
              s.bubbleHoldMs = 800;
              s.bubbleAlpha += (1.0 - s.bubbleAlpha) * 0.2;
              if (ov.dotsText) {
                const tick = Math.floor(Date.now() / 280) % 4;
                ov.dotsText.text = ".".repeat(tick);
              }
            } else if (s.bubbleHoldMs > 0) {
              s.bubbleHoldMs -= delta;
            } else {
              s.bubbleAlpha += (0 - s.bubbleAlpha) * 0.1;
            }
            ov.bubble.alpha = s.bubbleAlpha;
          }
        }

      }
    }
  }

}

function _ensureTokenTextures(token) {
  const id = token.id;
  if (CanvasAnimator._tokenTextures.has(id) || CanvasAnimator._texturePending.has(id)) return;
  const imgPath = token.document.texture.src;
  if (imgPath) CanvasAnimator._loadTokenTextures(id, imgPath);
}

function _escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function _restoreTexture(tokenId, token, map) {
  if (!map.has(tokenId)) return;
  const orig = map.get(tokenId);
  if (orig?.valid) token.mesh.texture = orig;
  map.delete(tokenId);
}

function _ensureOverlays(token, tokenId) {
  if (CanvasAnimator._overlays.has(tokenId)) return;

  const cx = token.w / 2;
  const cy = token.h / 2;

  // Ring — drawn on first tick when color is known; just create the container here
  const ring = new PIXI.Graphics();
  ring.alpha = 0;
  token.addChild(ring);

  // Speech bubble — body + tail drawn once, dots animated via text
  const bW = 36, bH = 18, bR = 4;
  const bubble = new PIXI.Graphics();
  bubble.beginFill(0xffffff, 0.92);
  bubble.lineStyle(1, 0x999999, 0.5);
  bubble.drawRoundedRect(-bW / 2, -bH / 2, bW, bH, bR);
  bubble.endFill();
  bubble.beginFill(0xffffff, 0.92);
  bubble.lineStyle(0);
  bubble.drawPolygon([-4, bH / 2, 4, bH / 2, 0, bH / 2 + 7]);
  bubble.endFill();
  bubble.position.set(cx, -20);
  bubble.alpha = 0;
  token.addChild(bubble);

  const dotsText = new PIXI.Text("···", {
    fontSize: 10,
    fill: 0x444444,
    fontFamily: "sans-serif",
    fontWeight: "bold",
  });
  dotsText.anchor.set(0.5, 0.5);
  dotsText.position.set(0, 1);
  bubble.addChild(dotsText);

  CanvasAnimator._overlays.set(tokenId, { ring, bubble, dotsText });
}

function _getLocalToken() {
  if (!canvas.ready) return null;

  const charId = game.user.character?.id;
  if (charId) return canvas.tokens.placeables.find(t => t.document.actorId === charId) ?? null;

  const pinned = SpeakerWidget.pinnedTokenId;
  if (pinned) {
    const token = canvas.tokens.placeables.find(t => t.id === pinned);
    if (token) return token;
  }

  const controlled = canvas.tokens.controlled;
  if (controlled.length === 1) return controlled[0];

  return null;
}
