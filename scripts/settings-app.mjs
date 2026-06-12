import { CanvasAnimator } from "./canvas-animator.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class TokenSpeakerSettings extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "token-speaker-settings",
    window: {
      title: "Token Speaker Settings",
      resizable: false,
    },
    position: { width: 480 },
    form: {
      handler: TokenSpeakerSettings.#onSubmit,
      closeOnSubmit: true,
    },
  };

  static PARTS = {
    form: {
      template: "modules/token-speaker/templates/settings.hbs",
    },
  };

  async _prepareContext(options) {
    const get = (key) => game.settings.get("token-speaker", key);
    const mode = get("mode");
    return {
      mode,
      modeSimple: mode === "simple",
      modeAdvanced: mode === "advanced",
      sensitivity: get("sensitivity"),
      intensity: get("intensity"),
      speakerWidget: get("speakerWidget"),
      spriteClosed: get("spriteClosed"),
      spriteOO: get("spriteOO"),
      spriteAH: get("spriteAH"),
      spriteEE: get("spriteEE"),
    };
  }

  static async #onSubmit(event, form, formData) {
    const d = formData.object;
    const set = (key, val) => game.settings.set("token-speaker", key, val);
    await set("mode", d.mode);
    await set("sensitivity", Number(d.sensitivity));
    await set("intensity", Number(d.intensity));
    await set("speakerWidget", Boolean(d.speakerWidget));
    await set("spriteClosed", d.spriteClosed ?? "");
    await set("spriteOO", d.spriteOO ?? "");
    await set("spriteAH", d.spriteAH ?? "");
    await set("spriteEE", d.spriteEE ?? "");
    await CanvasAnimator.reloadTextures();
    ui.controls.initialize();
  }
}
