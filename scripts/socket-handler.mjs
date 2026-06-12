import { CanvasAnimator } from "./canvas-animator.mjs";

const SOCKET_EVENT = "module.token-speaker";
const THROTTLE_MS = 1000 / 15;

export class SocketHandler {
  static _lastBroadcast = 0;

  static init() {
    game.socket.on(SOCKET_EVENT, (data) => {
      if (data.type !== "animState") return;
      if (data.userId === game.user.id) return;
      CanvasAnimator.applyRemoteState(data.tokenId, data.state);
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
