const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class SpeakerWidget extends HandlebarsApplicationMixin(ApplicationV2) {
  static pinnedTokenId = null;
  static _instance = null;

  static DEFAULT_OPTIONS = {
    id: "token-speaker-widget",
    window: { title: "Token Speaker", resizable: false },
    position: { width: 320, height: "auto" },
    actions: {
      selectToken: SpeakerWidget._onSelectToken,
      clearPin: SpeakerWidget._onClearPin,
    },
  };

  static PARTS = {
    picker: { template: "modules/token-speaker/templates/speaker-widget.hbs" },
  };

  static toggle() {
    if (SpeakerWidget._instance?.rendered) {
      SpeakerWidget._instance.close();
    } else {
      SpeakerWidget._instance = new SpeakerWidget();
      SpeakerWidget._instance.render({ force: true });
    }
  }

  static clearPin() {
    SpeakerWidget.pinnedTokenId = null;
    SpeakerWidget._instance?.render({ force: true });
  }

  async _prepareContext(_options) {
    const playerCharIds = new Set(
      game.users.contents.filter(u => u.character).map(u => u.character.id)
    );

    const tokens = canvas.ready
      ? canvas.tokens.placeables
          .filter(t => !playerCharIds.has(t.document.actorId))
          .map(t => ({
            id: t.id,
            name: t.name,
            img: t.document.texture.src,
            pinned: t.id === SpeakerWidget.pinnedTokenId,
          }))
      : [];

    return { tokens, hasPinned: SpeakerWidget.pinnedTokenId !== null };
  }

  static _onSelectToken(_event, target) {
    const id = target.dataset.tokenId;
    // clicking the already-pinned token toggles it off
    SpeakerWidget.pinnedTokenId = SpeakerWidget.pinnedTokenId === id ? null : id;
    SpeakerWidget._instance?.render({ force: true });
  }

  static _onClearPin(_event, _target) {
    SpeakerWidget.clearPin();
  }
}
