import { CanvasAnimator } from "./canvas-animator.mjs";
import { TalkingHeads } from "./talking-heads.mjs";

const SOCKET_EVENT = "module.token-speaker";
const THROTTLE_MS = 1000 / 15;

export class SocketHandler {
  static _lastBroadcast = 0;

  static init() {
    game.socket.on(SOCKET_EVENT, (data) => {
      if (data.userId === game.user.id) return;

      if (data.type === "animState") {
        if (data.tokenId) CanvasAnimator.applyRemoteState(data.tokenId, data.state);
        TalkingHeads.update(data.userId, data.state);
      } else if (data.type === "headPosition") {
        TalkingHeads.setPosition(data.targetUserId, data.x, data.y);
      } else if (data.type === "gmHead") {
        // GM broadcast: show/hide GM's talking head on all player clients
        TalkingHeads.setGMAutoToken(data.tokenId);
      }
    });
  }

  static broadcast(state, tokenId) {
    const now = Date.now();
    if (now - SocketHandler._lastBroadcast < THROTTLE_MS) return;
    SocketHandler._lastBroadcast = now;
    game.socket.emit(SOCKET_EVENT, {
      type: "animState",
      userId: game.user.id,
      tokenId,
      state,
    });
  }
}
