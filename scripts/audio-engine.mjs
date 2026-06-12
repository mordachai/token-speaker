export class AudioEngine {
  static _context = null;
  static _analyser = null;
  static _buffer = null;
  static _tdBuffer = null;   // time-domain waveform buffer, read per-frame by the animator
  static _intervalId = null;
  static _onState = null;
  static _visemeLatch = "closed";
  static _visemeHold = 0;
  static _VISEME_HOLD_FRAMES = 3;
  static _CLOSED_BRIDGE_FRAMES = 2;

  static async init(onState) {
    AudioEngine._onState = onState;

    const stream = await AudioEngine._acquireStream();
    if (!stream) return;

    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.4;

    ctx.createMediaStreamSource(stream).connect(analyser);

    AudioEngine._context = ctx;
    AudioEngine._analyser = analyser;
    AudioEngine._buffer   = new Uint8Array(analyser.frequencyBinCount);
    AudioEngine._tdBuffer = new Uint8Array(analyser.fftSize);

    AudioEngine._intervalId = setInterval(() => AudioEngine._poll(), 1000 / 30);
  }

  static async _acquireStream() {
    const foundryStream = game.webrtc?.client?.localStream ?? null;
    if (foundryStream) {
      ui.notifications.info("Token Speaker: Using Foundry A/V microphone stream.");
      return foundryStream;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      ui.notifications.info("Token Speaker: Microphone access granted.");
      return stream;
    } catch (err) {
      ui.notifications.warn("Token Speaker: Could not access microphone. Check browser permissions.");
      console.error("Token Speaker |", err);
      return null;
    }
  }

  static _poll() {
    if (!AudioEngine._analyser || !AudioEngine._onState) return;

    const buffer = AudioEngine._buffer;
    AudioEngine._analyser.getByteFrequencyData(buffer);

    const mode = game.settings.get("token-speaker", "advancedMode") ? "advanced" : "simple";
    const sensitivity = game.settings.get("token-speaker", "sensitivity") / 100;

    // RMS volume, normalized 0-1
    let sumSq = 0;
    for (let i = 0; i < buffer.length; i++) sumSq += (buffer[i] / 255) ** 2;
    const rms = Math.sqrt(sumSq / buffer.length);

    // Noise gate: lower sensitivity = higher gate threshold
    const noiseGate = (1 - sensitivity) * 0.15;
    const volume = Math.min(1, Math.max(0, (rms - noiseGate) / (1 - noiseGate)));

    const state = { mode, volume };

    if (mode === "advanced") {
      const classified = volume < 0.01 ? "closed" : AudioEngine._classifyViseme(buffer);
      if (AudioEngine._visemeHold > 0) {
        AudioEngine._visemeHold--;
      } else if (classified !== AudioEngine._visemeLatch) {
        const fromOpen = AudioEngine._visemeLatch !== "closed";
        const toOpen   = classified !== "closed";
        if (fromOpen && toOpen) {
          // Bridge through closed so the mouth doesn't jump between shapes
          AudioEngine._visemeLatch = "closed";
          AudioEngine._visemeHold = AudioEngine._CLOSED_BRIDGE_FRAMES - 1;
        } else {
          AudioEngine._visemeLatch = classified;
          AudioEngine._visemeHold = AudioEngine._VISEME_HOLD_FRAMES - 1;
        }
      }
      state.viseme = AudioEngine._visemeLatch;
    }

    AudioEngine._onState(state);
  }

  // Called every PIXI frame by the animator. Returns the signed peak waveform sample
  // in the current buffer window (-1 = trough, +1 = peak, 0 = silence / no mic).
  static getWaveformSample() {
    if (!AudioEngine._analyser || !AudioEngine._tdBuffer) return 0;
    AudioEngine._analyser.getByteTimeDomainData(AudioEngine._tdBuffer);
    let peak = 0;
    for (let i = 0; i < AudioEngine._tdBuffer.length; i++) {
      const v = (AudioEngine._tdBuffer[i] - 128) / 128;
      if (Math.abs(v) > Math.abs(peak)) peak = v;
    }
    return peak;
  }

  static _classifyViseme(buffer) {
    // 44100 Hz, 256 FFT → ~172 Hz/bin; bin 0 is DC, skipped
    // Bins 1-3   → ~172–516 Hz   → "oo" (uu/oo: tight rounded low energy)
    // Bins 4-12  → ~688–2064 Hz  → "ah" (ah/eh/open vowels: broad mid energy)
    // Bins 13-20 → ~2236–3440 Hz → "ee" (ee/i: strong high F2 peak)
    let low = 0, mid = 0, high = 0;
    for (let i = 1; i < 4;  i++) low  += buffer[i];
    for (let i = 4; i < 13; i++) mid  += buffer[i];
    for (let i = 13; i < 21; i++) high += buffer[i];

    low  /= 3;
    mid  /= 9;
    high /= 8;

    // EE/IH: F2 peak in high range — F1 lives in "low" so we only compare to mid
    if (high * 1.4 >= mid) return "ee";
    // OO: requires low to clearly dominate — a tie goes to AH
    if (low > mid * 1.3) return "oo";
    return "ah";
  }

  static destroy() {
    if (AudioEngine._intervalId !== null) {
      clearInterval(AudioEngine._intervalId);
      AudioEngine._intervalId = null;
    }
    AudioEngine._context?.close();
    AudioEngine._context = null;
    AudioEngine._analyser = null;
    AudioEngine._buffer = null;
    AudioEngine._tdBuffer = null;
  }
}
