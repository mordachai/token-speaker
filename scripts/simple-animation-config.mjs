const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class SimpleAnimationConfig extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "token-speaker-simple-config",
    window: { title: "Simple Animation — Limits", resizable: false },
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
    const scaleAxis = get("scaleAxis");
    return {
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
  }

  static async _onSave(_event, target) {
    const form = target.closest("form");
    const fd = Object.fromEntries(new FormData(form));
    const set = (k, v) => game.settings.set("token-speaker", k, v);
    await set("bounceMax",    Number(fd.bounceMax));
    await set("angleMax",     Number(fd.angleMax));
    await set("scaleAxis",    fd.scaleAxis);
    await set("scaleLow",     Number(fd.scaleLow));
    await set("scaleHigh",    Number(fd.scaleHigh));
    await set("scaleDamping", Number(fd.scaleDamping));
    this.close();
  }
}
