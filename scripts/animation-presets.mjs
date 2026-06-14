// ─────────────────────────────────────────────────────────────────────────────
// Bounce presets — tune these freely.
//
// Each preset is a full snapshot of the 7 "simple animation" params the
// renderers read. Selecting a preset in the config UI copies these values into
// the hidden world-scoped settings (bounceMax, angleMax, scaleAxis, scaleLow,
// scaleHigh, intensity, scaleDamping). Debug mode bypasses presets and lets you
// edit those raw values directly.
//
// Tokens and Talking Heads have independent preset tables.
//   - Token bounceMax  = pixels of upward offset.
//   - Head  bounceMax  = % of portrait height.
//   - scaleAxis: "xy" (both), "x", or "y".
//   - scaleLow < 1.0 squishes; scaleHigh > 1.0 stretches.
//   - scaleDamping: 0 = raw waveform (jittery), higher = smoother.
//   - intensity: gain on mic volume.
// ─────────────────────────────────────────────────────────────────────────────

export const TOKEN_BOUNCE_PRESETS = {
  pulse:    { bounceMax: 0,  angleMax: 0,  scaleAxis: "xy", scaleLow: 1.0,  scaleHigh: 1.12, intensity: 1.0, scaleDamping: 0.6 },
  bouncy:   { bounceMax: 14, angleMax: 3,  scaleAxis: "xy", scaleLow: 1.0,  scaleHigh: 1.10, intensity: 1.2, scaleDamping: 0.7 },
  wobbly:   { bounceMax: 8,  angleMax: 15, scaleAxis: "xy", scaleLow: 0.95, scaleHigh: 1.10, intensity: 1.2, scaleDamping: 0.6 },
  stretchy: { bounceMax: 6,  angleMax: 0,  scaleAxis: "y",  scaleLow: 0.85, scaleHigh: 1.30, intensity: 1.3, scaleDamping: 0.3 },
  toon:     { bounceMax: 20, angleMax: 12, scaleAxis: "xy", scaleLow: 0.80, scaleHigh: 1.40, intensity: 1.6, scaleDamping: 0.2 },
  toonWobble: { bounceMax: 22, angleMax: 20, scaleAxis: "xy", scaleLow: 0.78, scaleHigh: 1.45, intensity: 1.7, scaleDamping: 0.2 },
};

export const HEAD_BOUNCE_PRESETS = {
  // Pulse — gentle heartbeat. Pure scale pulse, no bounce/rotation, very smooth.
  pulse:      { bounceMax: 2,  angleMax: 0,  scaleAxis: "xy", scaleLow: 1.0,  scaleHigh: 1.1, intensity: 2.0, scaleDamping: 0.92 },
  // Bouncy — happy, light wobble, still smooth.
  bouncy:     { bounceMax: 8, angleMax: 2,  scaleAxis: "xy", scaleLow: 1.0,  scaleHigh: 1.10, intensity: 2.0, scaleDamping: 0.88 },
  // Wobbly — more rotation, less bounce.
  wobbly:     { bounceMax: 3,  angleMax: 10, scaleAxis: "xy", scaleLow: 0.96, scaleHigh: 1.15, intensity: 3.0, scaleDamping: 0.85 },
  // Stretchy — elongates in Y.
  stretchy:   { bounceMax: 5,  angleMax: 0,  scaleAxis: "y",  scaleLow: 1.0,  scaleHigh: 1.80, intensity: 2.5, scaleDamping: 0.85 },
  // Toon — bounce + rotation + stretch, smoothed.
  toon:       { bounceMax: 5, angleMax: 12, scaleAxis: "y", scaleLow: 1.0, scaleHigh: 1.4, intensity: 3.4, scaleDamping: 0.88 },
  // Toon Wobble — like Toon but more rotation and a touch snappier.
  toonWobble: { bounceMax: 10, angleMax: 15, scaleAxis: "y", scaleLow: 1.0, scaleHigh: 1.3, intensity: 5.0, scaleDamping: 0.85 },
};

export const BOUNCE_PRESET_OPTIONS = [
  { value: "pulse",    label: "Pulse" },
  { value: "bouncy",   label: "Bouncy" },
  { value: "wobbly",   label: "Wobbly" },
  { value: "stretchy", label: "Stretchy" },
  { value: "toon",     label: "Toon" },
  { value: "toonWobble", label: "Toon Wobble" },
];
