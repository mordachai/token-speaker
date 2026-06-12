import { AudioEngine } from "./audio-engine.mjs";
import { SpeakerWidget } from "./speaker-widget.mjs";

const LERP = 0.2;

export class CanvasAnimator {
  static _targets = new Map();          // tokenId → { mode, volume, viseme }
  static _lerped = new Map();           // tokenId → lerp state
  static _tokenTextures = new Map();    // tokenId → { oo, ah, ee } (PIXI.Texture or null per viseme)
  static _texturePending = new Set();   // tokenIds currently being discovered
  static _originalTextures = new Map(); // tokenId → original PIXI.Texture before swap
  static _localTokenId = null;          // tokenId of the token we are currently driving locally
  static init() {
    PIXI.Ticker.shared.add(CanvasAnimator._tick, CanvasAnimator);
  }

  // Discover and cache viseme textures for a token by probing sibling files.
  static async _loadTokenTextures(tokenId, imgPath) {
    CanvasAnimator._texturePending.add(tokenId);
    const textures = await CanvasAnimator._discoverVisemes(imgPath);
    CanvasAnimator._tokenTextures.set(tokenId, textures);
    CanvasAnimator._texturePending.delete(tokenId);
  }

  static async _discoverVisemes(imgPath) {
    const lastSlash = imgPath.lastIndexOf("/");
    const folder    = lastSlash >= 0 ? imgPath.slice(0, lastSlash) : "";
    const filename  = lastSlash >= 0 ? imgPath.slice(lastSlash + 1) : imgPath;
    const lastDot   = filename.lastIndexOf(".");
    const base      = lastDot >= 0 ? filename.slice(0, lastDot) : filename;
    const ext       = lastDot >= 0 ? filename.slice(lastDot) : "";
    const prefix    = folder ? `${folder}/${base}` : base;

    const textures = {};
    for (const viseme of ["oo", "ah", "ee"]) {
      for (const sep of ["-", "_", " "]) {
        const path = `${prefix}${sep}${viseme}${ext}`;
        try {
          const res = await fetch(path, { method: "HEAD" });
          if (res.ok) {
            try { textures[viseme] = await foundry.canvas.loadTexture(path); }
            catch { textures[viseme] = null; }
            break;
          }
        } catch { /* file not found, try next separator */ }
      }
    }
    return textures;
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
      }
      if (token) _restoreTexture(tokenId, token, CanvasAnimator._originalTextures);
      CanvasAnimator._lerped.delete(tokenId);
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

    const get = k => game.settings.get("token-speaker", k);
    const bounceMax   = get("bounceMax");
    const angleMax    = get("angleMax");
    const scaleAxis   = get("scaleAxis");
    const scaleLow    = get("scaleLow");
    const scaleHigh   = get("scaleHigh");
    const intensity   = get("intensity");
    const scaleDamping = get("scaleDamping");
    const lerpScale   = 1.0 - scaleDamping; // damping=0 → instant raw, damping=0.95 → very smooth
    const now         = Date.now();

    for (const [tokenId, target] of CanvasAnimator._targets) {
      const token = canvas.tokens.placeables.find(t => t.id === tokenId);
      if (!token?.mesh) continue;

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
        };
        CanvasAnimator._lerped.set(tokenId, s);
      } else if (s.docY !== token.document.y) {
        s.baseY = token.mesh.position.y - s.offsetY;
        s.docY  = token.document.y;
      }

      const vol = target.volume;
      const effectiveVol = Math.min(vol * intensity, 1.0);

      if (target.mode === "simple") {
        _restoreTexture(tokenId, token, CanvasAnimator._originalTextures);

        // Scale: waveform-driven vibration every frame, damped by lerpScale.
        const rawSample = AudioEngine.getWaveformSample(); // -1 to +1
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
        s.scaleX  += (s.baseScaleX - s.scaleX)  * LERP;
        s.scaleY  += (s.baseScaleY - s.scaleY)  * LERP;
        s.offsetY += (0            - s.offsetY) * LERP;
        s.angle   += (0            - s.angle)   * LERP;

        const viseme = target.viseme ?? "closed";
        if (viseme === "closed") {
          _restoreTexture(tokenId, token, CanvasAnimator._originalTextures);
        } else {
          const tex = CanvasAnimator._tokenTextures.get(tokenId)?.[viseme];
          if (tex?.valid) {
            if (!CanvasAnimator._originalTextures.has(tokenId)) {
              CanvasAnimator._originalTextures.set(tokenId, token.mesh.texture);
            }
            token.mesh.texture = tex;
          }
        }
      }

      token.mesh.scale.x    = s.scaleX;
      token.mesh.scale.y    = s.scaleY;
      token.mesh.position.y = s.baseY + s.offsetY;
      token.mesh.angle      = s.angle;
    }
  }

}

function _ensureTokenTextures(token) {
  const id = token.id;
  if (CanvasAnimator._tokenTextures.has(id) || CanvasAnimator._texturePending.has(id)) return;
  const imgPath = token.document.texture.src;
  if (imgPath) CanvasAnimator._loadTokenTextures(id, imgPath);
}

function _restoreTexture(tokenId, token, map) {
  if (!map.has(tokenId)) return;
  const orig = map.get(tokenId);
  if (orig?.valid) token.mesh.texture = orig;
  map.delete(tokenId);
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
