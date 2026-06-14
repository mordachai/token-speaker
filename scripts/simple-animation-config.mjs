import { TOKEN_BOUNCE_PRESETS, BOUNCE_PRESET_OPTIONS } from "./animation-presets.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class SimpleAnimationConfig extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "token-speaker-simple-config",
    window: { title: "Token Animation Config (GM)", resizable: true },
    position: { width: 420, height: "auto" },
    actions: {
      save: SimpleAnimationConfig._onSave,
    },
  };

  static PARTS = {
    form: { template: "modules/token-speaker/templates/simple-animation-config.hbs" },
  };

  async _prepareContext(_options) {
    const get = k => game.settings.get("token-speaker", k);
    const mode      = get("mode");
    const scaleAxis = get("scaleAxis");
    const indicator = get("indicatorStyle");
    const preset    = get("bouncePreset");
    return {
      debug: get("debugMode"),
      showBounce: ["simple", "hybrid", "both"].includes(mode),
      indicatorOptions: [
        { value: "none",   label: "None",         selected: indicator === "none"   },
        { value: "ring",   label: "Ring Only",     selected: indicator === "ring"   },
        { value: "bubble", label: "Bubble Only",   selected: indicator === "bubble" },
        { value: "both",   label: "Ring + Bubble", selected: indicator === "both"   },
      ],
      modeOptions: [
        { value: "none",     label: "None (Disabled)",            selected: mode === "none"     },
        { value: "simple",   label: "Simple (Bounce)",            selected: mode === "simple"   },
        { value: "advanced", label: "Advanced (Visemes)",         selected: mode === "advanced" },
        { value: "hybrid",   label: "Hybrid (Visemes or Bounce)", selected: mode === "hybrid"   },
        { value: "both",     label: "Both (Visemes + Bounce)",    selected: mode === "both"     },
      ],
      presetOptions: BOUNCE_PRESET_OPTIONS.map(o => ({ ...o, selected: preset === o.value })),
      intensity:    get("intensity"),
      bounceMax:    get("bounceMax"),
      angleMax:     get("angleMax"),
      scaleAxisOptions: [
        { value: "xy", label: "XY (both)", selected: scaleAxis === "xy" },
        { value: "x",  label: "X only",    selected: scaleAxis === "x"  },
        { value: "y",  label: "Y only",    selected: scaleAxis === "y"  },
      ],
      scaleLow:     get("scaleLow"),
      scaleHigh:    get("scaleHigh"),
      scaleDamping: get("scaleDamping"),
    };
  }

  _onRender(_context, _options) {
    // Live range value readouts
    for (const input of this.element.querySelectorAll("input[type='range']")) {
      const display = input.nextElementSibling;
      if (display?.classList.contains("range-value")) {
        input.addEventListener("input", () => {
          display.textContent = Number(input.value).toFixed(
            input.step.includes(".") ? input.step.split(".")[1].length : 0
          );
        });
      }
    }
    // Debug toggle reveals/hides the raw sliders without a re-render
    const debugBox = this.element.querySelector("input[name='debugMode']");
    const form     = this.element.querySelector("form");
    debugBox?.addEventListener("change", () => {
      form.classList.toggle("ts-debug-on", debugBox.checked);
    });
    // Bounce config only relevant for bounce-driven modes
    const modeSel = this.element.querySelector("select[name='mode']");
    modeSel?.addEventListener("change", () => {
      form.classList.toggle("ts-bounce-on", ["simple", "hybrid", "both"].includes(modeSel.value));
    });
  }

  static async _onSave(_event, target) {
    const form = target.closest("form");
    const fd = Object.fromEntries(new FormData(form));
    const set = (k, v) => game.settings.set("token-speaker", k, v);
    const debug = form.querySelector("input[name='debugMode']")?.checked ?? false;

    await set("debugMode",     debug);
    await set("indicatorStyle", fd.indicatorStyle ?? "ring");
    await set("mode",          fd.mode);
    await set("bouncePreset",  fd.bouncePreset);

    if (debug) {
      // Raw slider values are the source of truth in debug mode
      await set("intensity",    Number(fd.intensity));
      await set("bounceMax",    Number(fd.bounceMax));
      await set("angleMax",     Number(fd.angleMax));
      await set("scaleAxis",    fd.scaleAxis);
      await set("scaleLow",     Number(fd.scaleLow));
      await set("scaleHigh",    Number(fd.scaleHigh));
      await set("scaleDamping", Number(fd.scaleDamping));
    } else {
      // Copy the chosen preset into the hidden settings the animator reads
      const p = TOKEN_BOUNCE_PRESETS[fd.bouncePreset] ?? TOKEN_BOUNCE_PRESETS.bouncy;
      for (const [k, v] of Object.entries(p)) await set(k, v);
    }
    this.close();
  }
}
