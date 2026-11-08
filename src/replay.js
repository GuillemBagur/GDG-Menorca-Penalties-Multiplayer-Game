/**
 * Motor de repeticiones para reproducir cualquier penalti pasado (Vanilla JS ES Module).
 */

export class ReplayController {
  constructor(record, renderer, onStateChange, onFinished) {
    this.record = record;
    this.renderer = renderer;
    this.onStateChange = onStateChange;
    this.onFinished = onFinished;

    this.isPlaying = false;
    this.speed = 1.0;
    this.currentTimeMs = 0;
    this.animFrameId = null;
    this.lastRafTime = 0;

    this.xLockTime = 1200;
    this.yLockTime = 2400;
    this.powerLockTime = 3600;
    this.keeperLockTime = 2200;
    this.shotStartTime = 4200;
    this.shotTriggered = false;
  }

  start() {
    this.isPlaying = true;
    this.currentTimeMs = 0;
    this.shotTriggered = false;
    this.lastRafTime = performance.now();
    this.renderer.resetToIdle();
    this.tick(performance.now());
  }

  pause() {
    this.isPlaying = false;
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    this.emitState();
  }

  resume() {
    if (this.isPlaying) return;
    this.isPlaying = true;
    this.lastRafTime = performance.now();
    this.tick(performance.now());
  }

  setSpeed(speed) {
    this.speed = speed;
    this.emitState();
  }

  stop() {
    this.pause();
    this.renderer.resetToIdle();
    this.renderer.setKeeperAim(null);
  }

  tick(now) {
    if (!this.isPlaying) return;

    const dt = Math.min((now - this.lastRafTime) * this.speed, 100);
    this.lastRafTime = now;
    this.currentTimeMs += dt;

    this.updateReplayLogic();
    this.renderer.render(now);

    this.animFrameId = requestAnimationFrame((t) => this.tick(t));
  }

  updateReplayLogic() {
    const t = this.currentTimeMs;

    let barPhase = 'x';
    let currentX = 0.5;
    let currentY = 0.5;
    let currentPower = 0.5;
    let lockedX = false;
    let lockedY = false;
    let lockedPower = false;
    let keeperConfirmed = false;

    if (t < this.xLockTime) {
      barPhase = 'x';
      const progress = (t / 1200) * 3;
      currentX = 0.5 + Math.sin(progress * Math.PI) * 0.45;
    } else {
      lockedX = true;
      currentX = this.record.shotX;
    }

    if (t >= this.xLockTime && t < this.yLockTime) {
      barPhase = 'y';
      const progress = ((t - this.xLockTime) / 1200) * 3;
      currentY = 0.5 + Math.sin(progress * Math.PI) * 0.45;
    } else if (t >= this.yLockTime) {
      lockedY = true;
      currentY = this.record.shotY;
    }

    if (t >= this.yLockTime && t < this.powerLockTime) {
      barPhase = 'power';
      const progress = ((t - this.yLockTime) / 1200) * 2;
      currentPower = 0.5 + Math.sin(progress * Math.PI) * 0.45;
    } else if (t >= this.powerLockTime) {
      lockedPower = true;
      currentPower = this.record.shotPower;
      barPhase = 'ready';
    }

    let keeperTarget = null;
    if (t >= 800) {
      const keeperT = Math.min(1, (t - 800) / (this.keeperLockTime - 800));
      keeperTarget = {
        x: 0.5 + (this.record.keeperX - 0.5) * keeperT,
        y: 0.5 + (this.record.keeperY - 0.5) * keeperT,
      };
      if (t >= this.keeperLockTime) {
        keeperConfirmed = true;
        keeperTarget = { x: this.record.keeperX, y: this.record.keeperY };
      }
      this.renderer.setKeeperAim({
        x: keeperTarget.x,
        y: keeperTarget.y,
        visible: true,
        confirmed: keeperConfirmed,
      });
    }

    if (t >= this.shotStartTime && !this.shotTriggered) {
      this.shotTriggered = true;
      barPhase = 'shot';
      this.renderer.setKeeperAim(null);

      this.renderer.triggerShotAnimation(
        {
          x: this.record.shotX,
          y: this.record.shotY,
          power: this.record.shotPower,
          keeperX: this.record.keeperX,
          keeperY: this.record.keeperY,
          result: this.record.result,
          radius_m: this.record.keeperRadius_m,
          radius_px: this.record.keeperRadius_m * 82,
        },
        () => {
          this.isPlaying = false;
          if (this.onFinished) this.onFinished();
        }
      );
    }

    this.emitState({
      timeMs: this.currentTimeMs,
      barPhase,
      currentX,
      currentY,
      currentPower,
      lockedX,
      lockedY,
      lockedPower,
      keeperTarget,
      keeperConfirmed,
      isPlaying: this.isPlaying,
      speed: this.speed,
    });
  }

  emitState(extra = {}) {
    if (this.onStateChange) {
      this.onStateChange({
        timeMs: this.currentTimeMs,
        speed: this.speed,
        isPlaying: this.isPlaying,
        ...extra,
      });
    }
  }
}
