import {
  ANIMATION,
  GOAL_LINE_Y,
  GOAL_MOUTH,
  PENALTY_SPOT,
  SPRITES,
} from './config.js';
import { normalizedToPixel } from './math.js';

export class GameRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas ? canvas.getContext('2d') : null;

    this.imgFondo = null;
    this.imgPortero = null;
    this.imgDelantero = null;
    this.imgPelota = null;

    this.isLoaded = false;

    this.state = {
      phase: 'idle', // 'idle' | 'striker_run' | 'shot_flying' | 'result_hold'
      phaseStartTime: 0,
      shotData: null,
      keeperAim: null, // { x, y, visible, confirmed }
    };

    this.particles = [];
  }

  async preloadAssets() {
    const loadImg = (url) => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Failed to load sprite: ${url}`));
        img.src = url;
      });
    };

    try {
      const [fondo, portero, delantero, pelota] = await Promise.all([
        loadImg(SPRITES.fondo.url),
        loadImg(SPRITES.portero.url),
        loadImg(SPRITES.delantero.url),
        loadImg(SPRITES.pelota.url),
      ]);

      this.imgFondo = fondo;
      this.imgPortero = portero;
      this.imgDelantero = delantero;
      this.imgPelota = pelota;
      this.isLoaded = true;
    } catch (err) {
      console.error('Error preloading sprites:', err);
      throw err;
    }
  }

  setKeeperAim(aim) {
    this.state.keeperAim = aim;
  }

  triggerShotAnimation(data, onFinished) {
    this.state.shotData = data;
    this.state.phase = 'striker_run';
    this.state.phaseStartTime = performance.now();
    this.state.keeperAim = null; // Ocultar mirilla al comenzar el chut

    const shotDuration =
      ANIMATION.shotDuration0Ms -
      data.power * (ANIMATION.shotDuration0Ms - ANIMATION.shotDuration100Ms);

    setTimeout(() => {
      this.state.phase = 'shot_flying';
      this.state.phaseStartTime = performance.now();

      this.spawnImpactParticles(SPRITES.pelota.initialCenterX, SPRITES.pelota.initialCenterY, '#ffffff', 14);

      setTimeout(() => {
        this.state.phase = 'result_hold';
        this.state.phaseStartTime = performance.now();

        const target = normalizedToPixel(data.x, data.y);
        if (data.result === 'GOL') {
          this.spawnImpactParticles(target.px, target.py, '#10b981', 35);
        } else if (data.result === 'PARADA') {
          this.spawnImpactParticles(target.px, target.py, '#f59e0b', 30);
        }

        setTimeout(() => {
          this.resetToIdle();
          if (onFinished) onFinished();
        }, ANIMATION.resultDisplayMs);
      }, shotDuration);
    }, ANIMATION.strikerSlideMs);
  }

  resetToIdle() {
    this.state.phase = 'idle';
    this.state.shotData = null;
    this.state.keeperAim = null;
    this.particles = [];
  }

  spawnImpactParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 8;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1.5,
        color,
        size: 3 + Math.random() * 5,
        alpha: 1,
      });
    }
  }

  render(now = performance.now()) {
    if (!this.isLoaded || !this.ctx) return;
    const ctx = this.ctx;

    ctx.clearRect(0, 0, 1600, 900);

    // 1. Fondo completo 1600x900
    if (this.imgFondo) {
      ctx.drawImage(this.imgFondo, 0, 0, 1600, 900);
    }

    this.updateAndDrawParticles(ctx);

    // 2. Calcular posiciones animadas centradas
    const animData = this.calculateAnimatedEntities(now);

    // 3. Círculo del portero en resolución
    this.drawKeeperArea(ctx);

    // 4. Portero
    this.drawKeeper(ctx, animData.keeper);

    // 5. Pelota
    this.drawBall(ctx, animData.ball);

    // 6. Delantero
    this.drawStriker(ctx, animData.striker);

    // 7. Mirilla interactiva del portero
    this.drawKeeperAimReticle(ctx);

    // 8. Rótulo de resultado
    if (this.state.phase === 'result_hold' && this.state.shotData) {
      this.drawResultBanner(ctx, this.state.shotData.result, now);
    }
  }

  calculateAnimatedEntities(now) {
    const phase = this.state.phase;
    const elapsed = now - this.state.phaseStartTime;
    const shot = this.state.shotData;

    let strikerPos = {
      x: SPRITES.delantero.initialCenterX,
      y: SPRITES.delantero.initialCenterY,
      scale: SPRITES.delantero.scale,
      rotation: 0,
    };

    let keeperPos = {
      x: SPRITES.portero.initialCenterX,
      y: SPRITES.portero.initialCenterY,
      scale: SPRITES.portero.scale,
      rotation: 0,
    };

    let ballPos = {
      x: SPRITES.pelota.initialCenterX,
      y: SPRITES.pelota.initialCenterY,
      diameter: SPRITES.pelota.initialDiameter,
      shadowAlpha: 0.3,
      rotation: 0,
    };

    if (phase === 'striker_run') {
      const t = Math.min(1, elapsed / ANIMATION.strikerSlideMs);
      const easeT = t * (2 - t);
      strikerPos.x = SPRITES.delantero.initialCenterX + 40 * easeT;
      strikerPos.y = SPRITES.delantero.initialCenterY - 5 * easeT;
    } else if (phase === 'shot_flying' && shot) {
      strikerPos.x = SPRITES.delantero.initialCenterX + 40;
      strikerPos.y = SPRITES.delantero.initialCenterY - 5;

      const duration =
        ANIMATION.shotDuration0Ms -
        shot.power * (ANIMATION.shotDuration0Ms - ANIMATION.shotDuration100Ms);
      const t = Math.min(1, elapsed / duration);

      let target = normalizedToPixel(shot.x, shot.y);
      if (shot.result === 'FUERA') {
        const dx = target.px - SPRITES.pelota.initialCenterX;
        const dy = target.py - SPRITES.pelota.initialCenterY;
        target.px += dx * 0.15;
        target.py += dy * 0.15;
      }

      const arcHeight = 45 * (1 - shot.power * 0.4);
      const arcOffset = -Math.sin(t * Math.PI) * arcHeight;

      ballPos.x = SPRITES.pelota.initialCenterX + (target.px - SPRITES.pelota.initialCenterX) * t;
      ballPos.y = SPRITES.pelota.initialCenterY + (target.py - SPRITES.pelota.initialCenterY) * t + arcOffset;

      ballPos.diameter =
        SPRITES.pelota.initialDiameter -
        t * (SPRITES.pelota.initialDiameter - SPRITES.pelota.finalDiameter);
      ballPos.shadowAlpha = Math.max(0, 0.3 * (1 - t * 1.5));
      ballPos.rotation = t * 12;

      const keeperTarget = normalizedToPixel(shot.keeperX, shot.keeperY);
      const keeperEase = t * (2 - t);

      keeperPos.x =
        SPRITES.portero.initialCenterX +
        (keeperTarget.px - SPRITES.portero.initialCenterX) * keeperEase;
      keeperPos.y =
        SPRITES.portero.initialCenterY +
        (keeperTarget.py - SPRITES.portero.initialCenterY) * keeperEase;

      const offsetFromCenter = (shot.keeperX - 0.5) * 2;
      const maxAngleRad = Math.PI / 3;
      keeperPos.rotation = offsetFromCenter * maxAngleRad * keeperEase;
    } else if (phase === 'result_hold' && shot) {
      strikerPos.x = SPRITES.delantero.initialCenterX + 40;
      strikerPos.y = SPRITES.delantero.initialCenterY - 5;

      const keeperTarget = normalizedToPixel(shot.keeperX, shot.keeperY);
      keeperPos.x = keeperTarget.px;
      keeperPos.y = keeperTarget.py;
      const offsetFromCenter = (shot.keeperX - 0.5) * 2;
      keeperPos.rotation = offsetFromCenter * (Math.PI / 3);

      const target = normalizedToPixel(shot.x, shot.y);
      if (shot.result === 'GOL') {
        ballPos.x = target.px;
        ballPos.y = target.py + 4;
        ballPos.diameter = SPRITES.pelota.finalDiameter;
        ballPos.shadowAlpha = 0;
      } else if (shot.result === 'PARADA') {
        const bounceDir = shot.keeperX < 0.5 ? 1 : -1;
        const holdProgress = Math.min(1, elapsed / 1000);
        ballPos.x = target.px + bounceDir * 50 * holdProgress;
        ballPos.y = Math.min(GOAL_LINE_Y + 40, target.py + 80 * holdProgress);
        ballPos.diameter = SPRITES.pelota.finalDiameter + 4;
        ballPos.shadowAlpha = 0.2 * holdProgress;
      } else {
        const dx = target.px - SPRITES.pelota.initialCenterX;
        const dy = target.py - SPRITES.pelota.initialCenterY;
        ballPos.x = target.px + dx * 0.2;
        ballPos.y = target.py + dy * 0.2;
        ballPos.diameter = SPRITES.pelota.finalDiameter - 3;
        ballPos.shadowAlpha = 0;
      }
    }

    return { striker: strikerPos, keeper: keeperPos, ball: ballPos };
  }

  drawKeeper(ctx, keeper) {
    if (!this.imgPortero) return;
    ctx.save();
    ctx.translate(keeper.x, keeper.y);
    ctx.rotate(keeper.rotation);
    ctx.scale(keeper.scale, keeper.scale);
    ctx.drawImage(
      this.imgPortero,
      -SPRITES.portero.centerX,
      -SPRITES.portero.centerY,
      SPRITES.portero.viewBoxWidth,
      SPRITES.portero.viewBoxHeight
    );
    ctx.restore();
  }

  drawStriker(ctx, striker) {
    if (!this.imgDelantero) return;
    ctx.save();
    ctx.translate(striker.x, striker.y);
    ctx.rotate(striker.rotation);
    ctx.scale(striker.scale, striker.scale);
    ctx.drawImage(
      this.imgDelantero,
      -SPRITES.delantero.centerX,
      -SPRITES.delantero.centerY,
      SPRITES.delantero.viewBoxWidth,
      SPRITES.delantero.viewBoxHeight
    );
    ctx.restore();
  }

  drawBall(ctx, ball) {
    if (!this.imgPelota) return;

    if (ball.shadowAlpha > 0.01) {
      ctx.save();
      ctx.fillStyle = `rgba(0, 0, 0, ${ball.shadowAlpha})`;
      ctx.beginPath();
      const shadowScale = ball.diameter / SPRITES.pelota.initialDiameter;
      ctx.ellipse(
        ball.x,
        SPRITES.pelota.shadowY,
        SPRITES.pelota.shadowRx * shadowScale,
        SPRITES.pelota.shadowRy * shadowScale,
        0,
        0,
        Math.PI * 2
      );
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    ctx.translate(ball.x, ball.y);
    ctx.rotate(ball.rotation);

    const scale = ball.diameter / 92;
    ctx.scale(scale, scale);
    ctx.drawImage(
      this.imgPelota,
      -SPRITES.pelota.centerX,
      -SPRITES.pelota.centerY,
      SPRITES.pelota.viewBoxWidth,
      SPRITES.pelota.viewBoxHeight
    );
    ctx.restore();
  }

  drawKeeperArea(ctx) {
    if (this.state.phase === 'result_hold' && this.state.shotData) {
      const shot = this.state.shotData;
      const keeperTarget = normalizedToPixel(shot.keeperX, shot.keeperY);
      const radiusPx = shot.radius_px;

      ctx.save();
      ctx.beginPath();
      ctx.arc(keeperTarget.px, keeperTarget.py, radiusPx, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(59, 130, 246, 0.22)';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(96, 165, 250, 0.8)';
      ctx.setLineDash([8, 6]);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(keeperTarget.px, keeperTarget.py, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#2563eb';
      ctx.fill();

      const shotTarget = normalizedToPixel(shot.x, shot.y);
      ctx.beginPath();
      ctx.arc(shotTarget.px, shotTarget.py, 7, 0, Math.PI * 2);
      ctx.fillStyle = shot.result === 'GOL' ? '#10b981' : shot.result === 'PARADA' ? '#f59e0b' : '#ef4444';
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#ffffff';
      ctx.setLineDash([]);
      ctx.stroke();
      ctx.restore();
    }
  }

  drawKeeperAimReticle(ctx) {
    const aim = this.state.keeperAim;
    if (!aim || !aim.visible) return;

    const px = GOAL_MOUTH.x + aim.x * GOAL_MOUTH.width;
    const py = GOAL_LINE_Y - aim.y * GOAL_MOUTH.height;

    ctx.save();
    const color = aim.confirmed ? '#10b981' : '#f59e0b';
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;

    ctx.beginPath();
    ctx.arc(px, py, 22, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(px - 30, py);
    ctx.lineTo(px + 30, py);
    ctx.moveTo(px, py - 30);
    ctx.lineTo(px, py + 30);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(px, py, 4, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    ctx.font = 'bold 15px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#000000';
    ctx.shadowBlur = 4;
    ctx.textAlign = 'center';
    ctx.fillText(aim.confirmed ? '¡Zona Confirmada!' : 'Haz clic para posicionar', px, py - 36);
    ctx.restore();
  }

  drawResultBanner(ctx, result, now) {
    const elapsed = now - this.state.phaseStartTime;
    const alpha = Math.min(1, elapsed / 250);

    ctx.save();
    ctx.globalAlpha = alpha;

    const cx = 800;
    const cy = 260;

    let text = '¡GOL!';
    let bgColor = 'rgba(16, 185, 129, 0.95)';
    let textColor = '#ffffff';
    let borderColor = '#34d399';

    if (result === 'PARADA') {
      text = '¡PARADA!';
      bgColor = 'rgba(245, 158, 11, 0.95)';
      borderColor = '#fbbf24';
    } else if (result === 'FUERA') {
      text = '¡FUERA!';
      bgColor = 'rgba(239, 68, 68, 0.95)';
      borderColor = '#f87171';
    }

    const scale = Math.min(1, 0.7 + (elapsed / 250) * 0.3);
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);

    const bw = 420;
    const bh = 110;
    ctx.fillStyle = bgColor;
    ctx.beginPath();
    ctx.roundRect(-bw / 2, -bh / 2, bw, bh, 20);
    ctx.fill();

    ctx.lineWidth = 5;
    ctx.strokeStyle = borderColor;
    ctx.stroke();

    ctx.font = '900 68px Arial Black, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fillText(text, 0, 4);

    ctx.fillStyle = textColor;
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  updateAndDrawParticles(ctx) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.25;
      p.alpha -= 0.02;

      if (p.alpha <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}
