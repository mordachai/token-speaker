const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class TalkingHeadsConfig extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "token-speaker-heads-config",
    window: { title: "Talking Heads — Animation (GM)", resizable: true },
    position: { width: 460, height: 600 },
    actions: {
      save:       TalkingHeadsConfig._onSave,
      browseMask: TalkingHeadsConfig._onBrowseMask,
      clearMask:  TalkingHeadsConfig._onClearMask,
    },
  };

  static PARTS = {
    form: { template: "modules/token-speaker/templates/talking-heads-config.hbs" },
  };

  async _prepareContext(_options) {
    const get = k => game.settings.get("token-speaker", k);
    const headMode  = get("headMode");
    const scaleAxis = get("headScaleAxis");
    const mirrorMap = get("headMirrorMap");

    // Per-player mirror toggles — all active users
    const players = [];
    for (const user of game.users) {
      if (!user.active) continue;
      const name = user.isGM
        ? `${user.name} (GM)`
        : (user.character?.name ?? user.name);
      players.push({ userId: user.id, name, mirrored: mirrorMap[user.id] === true });
    }

    const headIndicator = get("headIndicatorStyle");

    return {
      headWidth:      get("headWidth"),
      headAspectRatio: get("headAspectRatio"),
      showHeadName:   get("showHeadName"),
      indicatorOptions: [
        { value: "none",   label: "None",              selected: headIndicator === "none"   },
        { value: "ring",   label: "Ring Only",          selected: headIndicator === "ring"   },
        { value: "bubble", label: "Bubble Only",        selected: headIndicator === "bubble" },
        { value: "both",   label: "Ring + Bubble",      selected: headIndicator === "both"   },
      ],
      headMask: get("headMask"),
      modeOptions: [
        { value: "none",     label: "None (Disabled)",           selected: headMode === "none"     },
        { value: "simple",   label: "Simple (Bounce)",           selected: headMode === "simple"   },
        { value: "advanced", label: "Advanced (Visemes)",        selected: headMode === "advanced" },
        { value: "hybrid",   label: "Hybrid (Visemes or Bounce)",selected: headMode === "hybrid"   },
        { value: "both",     label: "Both (Visemes + Bounce)",   selected: headMode === "both"     },
      ],
      bounceMax:    get("headBounceMax"),
      angleMax:     get("headAngleMax"),
      intensity:    get("headIntensity"),
      scaleAxisOptions: [
        { value: "xy", label: "XY (both)", selected: scaleAxis === "xy" },
        { value: "x",  label: "X only",    selected: scaleAxis === "x"  },
        { value: "y",  label: "Y only",    selected: scaleAxis === "y"  },
      ],
      scaleLow:     get("headScaleLow"),
      scaleHigh:    get("headScaleHigh"),
      scaleDamping: get("headScaleDamping"),
      players,
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

  static _onClearMask(_event, target) {
    const input = target.closest(".form-fields").querySelector("input[name='headMask']");
    if (input) input.value = "";
  }

  static _onBrowseMask(_event, target) {
    const input = target.closest(".form-fields").querySelector("input[name='headMask']");
    new foundry.applications.apps.FilePicker.implementation({
      type: "image",
      current: input?.value ?? "",
      callback: path => { if (input) input.value = path; },
    }).render(true);
  }

  static async _onSave(_event, target) {
    const form = target.closest("form");
    const fd = Object.fromEntries(new FormData(form));
    const set = (k, v) => game.settings.set("token-speaker", k, v);

    // Collect mirror state per player (unchecked checkboxes absent from FormData)
    const mirrorMap = {};
    for (const hidden of form.querySelectorAll('input[name="mirrorUserId"]')) {
      const userId = hidden.value;
      mirrorMap[userId] = form.querySelector(`input[name="mirror-${userId}"]`)?.checked ?? false;
    }

    await set("headIndicatorStyle", fd.headIndicatorStyle ?? "ring");
    await set("headWidth",       Number(fd.headWidth));
    await set("headAspectRatio", form.querySelector("input[name='headAspectRatio']")?.checked ?? false);
    await set("showHeadName",    form.querySelector("input[name='showHeadName']")?.checked ?? false);
    await set("headMode",        fd.headMode);
    await set("headMask",        fd.headMask ?? "");
    await set("headBounceMax",    Number(fd.bounceMax));
    await set("headAngleMax",     Number(fd.angleMax));
    await set("headIntensity",    Number(fd.intensity));
    await set("headScaleAxis",    fd.scaleAxis);
    await set("headScaleLow",     Number(fd.scaleLow));
    await set("headScaleHigh",    Number(fd.scaleHigh));
    await set("headScaleDamping", Number(fd.scaleDamping));
    await set("headMirrorMap",    mirrorMap);
    this.close();
  }
}
