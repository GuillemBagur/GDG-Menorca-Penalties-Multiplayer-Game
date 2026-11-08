/**
 * Gestor de interfaz DOM en Vanilla JS (ES modules)
 */

import confetti from 'canvas-confetti';
import {
  BAR_CYCLE_SECONDS,
  DEFAULT_TOTAL_PENALTIES,
  DIRECTION_RANGE,
  TIME_LIMIT_SEC,
} from './config.js';
import { clampToGoal, pixelToNormalized } from './math.js';
import { ReplayController } from './replay.js';
import { sounds } from './sound.js';

export class UIManager {
  constructor(renderer) {
    this.renderer = renderer;

    // Cache de elementos DOM
    this.el = {
      app: document.getElementById('app'),
      gameContainer: document.getElementById('game-container'),
      canvas: document.getElementById('game-canvas'),

      // Scoreboard
      scoreboard: document.getElementById('scoreboard'),
      codeLabel: document.getElementById('scoreboard-code'),
      btnCopyCode: document.getElementById('btn-copy-code'),
      btnShareCode: document.getElementById('btn-share-code'),
      hostNameLabel: document.getElementById('host-name-label'),
      guestNameLabel: document.getElementById('guest-name-label'),
      hostYouBadge: document.getElementById('host-you-badge'),
      guestYouBadge: document.getElementById('guest-you-badge'),
      hostDots: document.getElementById('host-dots'),
      guestDots: document.getElementById('guest-dots'),
      scoreHost: document.getElementById('score-host'),
      scoreGuest: document.getElementById('score-guest'),
      roundIndicator: document.getElementById('round-indicator'),
      roleBadge: document.getElementById('role-badge'),
      btnOpenReplay: document.getElementById('btn-open-replay'),
      btnToggleSound: document.getElementById('btn-toggle-sound'),

      // Timer
      timerContainer: document.getElementById('timer-container'),
      timerBadge: document.getElementById('timer-badge'),
      timerText: document.getElementById('timer-text'),
      timerBar: document.getElementById('timer-bar'),

      // Striker
      strikerPanel: document.getElementById('striker-panel'),
      strikerStepLabel: document.getElementById('striker-step-label'),
      barXWrapper: document.getElementById('bar-x-wrapper'),
      barYWrapper: document.getElementById('bar-y-wrapper'),
      barPowerWrapper: document.getElementById('bar-power-wrapper'),
      barXStatus: document.getElementById('bar-x-status'),
      barYStatus: document.getElementById('bar-y-status'),
      barPowerStatus: document.getElementById('bar-power-status'),
      barXCursor: document.getElementById('bar-x-cursor'),
      barYCursor: document.getElementById('bar-y-cursor'),
      barPowerFill: document.getElementById('bar-power-fill'),
      btnStrikerAction: document.getElementById('btn-striker-action'),
      btnStrikerText: document.getElementById('btn-striker-text'),

      // Keeper
      keeperClickOverlay: document.getElementById('keeper-click-overlay'),
      keeperPanel: document.getElementById('keeper-panel'),
      keeperInfoText: document.getElementById('keeper-info-text'),
      btnConfirmKeeper: document.getElementById('btn-confirm-keeper'),

      // Status banner
      statusBanner: document.getElementById('status-banner'),
      statusText: document.getElementById('status-text'),

      // Lobby
      lobbyScreen: document.getElementById('lobby-screen'),
      lobbyError: document.getElementById('lobby-error'),
      lobbyErrorText: document.getElementById('lobby-error-text'),
      btnErrorGoogleFallback: document.getElementById('btn-error-google-fallback'),
      lobbyMenuMain: document.getElementById('lobby-menu-main'),
      lobbyMenuJoin: document.getElementById('lobby-menu-join'),
      lobbyMenuWaiting: document.getElementById('lobby-menu-waiting'),
      btnCreateMatch: document.getElementById('btn-create-match'),
      btnGotoJoin: document.getElementById('btn-goto-join'),
      authStatusContainer: document.getElementById('auth-status-container'),
      authUserLabel: document.getElementById('auth-user-label'),
      btnLogout: document.getElementById('btn-logout'),
      joinTitle: document.getElementById('join-title'),
      joinCodeInput: document.getElementById('join-code-input'),
      guestNicknameInput: document.getElementById('guest-nickname-input'),
      btnJoinAnonymous: document.getElementById('btn-join-anonymous'),
      btnJoinGoogle: document.getElementById('btn-join-google'),
      btnBackToMain: document.getElementById('btn-back-to-main'),
      createdCodeDisplay: document.getElementById('created-code-display'),
      btnCopyShareLink: document.getElementById('btn-copy-share-link'),
      btnNativeShare: document.getElementById('btn-native-share'),

      // Game Over Modal
      gameOverModal: document.getElementById('game-over-modal'),
      gameOverTitle: document.getElementById('game-over-title'),
      gameOverSubtitle: document.getElementById('game-over-subtitle'),
      finalHostName: document.getElementById('final-host-name'),
      finalGuestName: document.getElementById('final-guest-name'),
      finalHostScore: document.getElementById('final-host-score'),
      finalGuestScore: document.getElementById('final-guest-score'),
      gameOverHistory: document.getElementById('game-over-history'),
      btnGameoverReplay: document.getElementById('btn-gameover-replay'),
      btnGameoverNewgame: document.getElementById('btn-gameover-newgame'),

      // Replay Modal
      replayModal: document.getElementById('replay-modal'),
      replayRoundsList: document.getElementById('replay-rounds-list'),
      btnCloseReplay: document.getElementById('btn-close-replay'),
      replayInfoText: document.getElementById('replay-info-text'),
      replayResultTag: document.getElementById('replay-result-tag'),
      btnReplayPlaypause: document.getElementById('btn-replay-playpause'),
      btnReplayRestart: document.getElementById('btn-replay-restart'),
      btnReplayExit: document.getElementById('btn-replay-exit'),
    };

    // Estados internos
    this.timerInterval = null;
    this.strikerRaf = null;
    this.strikerState = null;
    this.keeperState = null;
    this.activeReplayCtrl = null;
  }

  showLobby(menu = 'main', data = {}) {
    this.el.gameContainer.classList.add('hidden');
    this.el.lobbyScreen.classList.remove('hidden');
    this.el.gameOverModal.classList.add('hidden');
    this.el.replayModal.classList.add('hidden');

    this.el.lobbyMenuMain.classList.add('hidden');
    this.el.lobbyMenuJoin.classList.add('hidden');
    this.el.lobbyMenuWaiting.classList.add('hidden');
    this.hideLobbyError();

    if (menu === 'main') {
      this.el.lobbyMenuMain.classList.remove('hidden');
    } else if (menu === 'join') {
      this.el.lobbyMenuJoin.classList.remove('hidden');
      if (data.code) {
        this.el.joinCodeInput.value = data.code.toUpperCase();
        this.el.joinTitle.textContent = `Unirse a la partida ${data.code.toUpperCase()}`;
      }
    } else if (menu === 'waiting') {
      this.el.lobbyMenuWaiting.classList.remove('hidden');
      if (data.code) {
        this.el.createdCodeDisplay.textContent = data.code;
      }
    }
  }

  showLobbyError(msg, showGoogle = false) {
    this.el.lobbyErrorText.textContent = msg;
    this.el.lobbyError.classList.remove('hidden');
    this.el.lobbyError.classList.add('flex');
    if (showGoogle) {
      this.el.btnErrorGoogleFallback.classList.remove('hidden');
    } else {
      this.el.btnErrorGoogleFallback.classList.add('hidden');
    }
  }

  hideLobbyError() {
    this.el.lobbyError.classList.add('hidden');
    this.el.lobbyError.classList.remove('flex');
  }

  showGame() {
    this.el.lobbyScreen.classList.add('hidden');
    this.el.gameContainer.classList.remove('hidden');
    this.el.gameOverModal.classList.add('hidden');
    this.el.replayModal.classList.add('hidden');
  }

  updateAuthUser(user) {
    if (user && !user.isAnonymous) {
      this.el.authUserLabel.textContent = `Conectado como ${user.displayName || 'Google'}`;
      this.el.authStatusContainer.classList.remove('hidden');
    } else {
      this.el.authStatusContainer.classList.add('hidden');
    }
  }

  updateScoreboard(gameState, currentUserId) {
    const hostUid = gameState.host.uid;
    const guestUid = gameState.guest ? gameState.guest.uid : null;

    this.el.codeLabel.textContent = gameState.code || '------';
    this.el.hostNameLabel.textContent = gameState.host.name;
    this.el.guestNameLabel.textContent = gameState.guest ? gameState.guest.name : 'Esperando...';

    if (currentUserId === hostUid) {
      this.el.hostYouBadge.classList.remove('hidden');
      this.el.guestYouBadge.classList.add('hidden');
    } else if (currentUserId === guestUid) {
      this.el.hostYouBadge.classList.add('hidden');
      this.el.guestYouBadge.classList.remove('hidden');
    } else {
      this.el.hostYouBadge.classList.add('hidden');
      this.el.guestYouBadge.classList.add('hidden');
    }

    this.el.scoreHost.textContent = gameState.scores[hostUid] || 0;
    this.el.scoreGuest.textContent = guestUid ? gameState.scores[guestUid] || 0 : 0;

    const hostHist = gameState.roundHistoryByPlayer[hostUid] || [];
    const guestHist = guestUid ? gameState.roundHistoryByPlayer[guestUid] || [] : [];
    const totalDots = Math.max(DEFAULT_TOTAL_PENALTIES, hostHist.length, guestHist.length);

    this.renderDots(this.el.hostDots, hostHist, totalDots);
    this.renderDots(this.el.guestDots, guestHist, totalDots);

    if (gameState.isSuddenDeath) {
      this.el.roundIndicator.innerHTML =
        '<span class="text-rose-400 font-bold uppercase animate-pulse">¡Muerte Súbita!</span>';
    } else {
      this.el.roundIndicator.textContent = `Ronda ${gameState.currentRound}`;
    }

    const isStriker = currentUserId === gameState.currentStrikerUid;
    const isKeeper = currentUserId === gameState.currentKeeperUid;

    if (isStriker) {
      this.el.roleBadge.textContent = 'Eres Delantero';
      this.el.roleBadge.className = 'text-xs font-bold text-emerald-400';
    } else if (isKeeper) {
      this.el.roleBadge.textContent = 'Eres Portero';
      this.el.roleBadge.className = 'text-xs font-bold text-amber-300';
    } else {
      this.el.roleBadge.textContent = 'Observando';
      this.el.roleBadge.className = 'text-xs font-bold text-slate-400';
    }

    if (gameState.history.length > 0) {
      this.el.btnOpenReplay.classList.remove('hidden');
    } else {
      this.el.btnOpenReplay.classList.add('hidden');
    }
  }

  renderDots(container, history, count) {
    container.innerHTML = '';
    for (let i = 0; i < count; i++) {
      const res = history[i];
      const dot = document.createElement('span');
      dot.className = `w-2.5 h-2.5 rounded-full border ${
        res === 'GOL'
          ? 'bg-emerald-500 border-emerald-400 shadow-sm shadow-emerald-500/50'
          : res === 'PARADA' || res === 'FUERA'
          ? 'bg-rose-500 border-rose-400'
          : 'bg-slate-700/80 border-slate-600'
      }`;
      container.appendChild(dot);
    }
  }

  startTimer(startedAt, onExpired) {
    this.stopTimer();

    this.el.timerContainer.classList.remove('hidden');
    this.el.timerContainer.classList.add('flex');

    const totalDuration = TIME_LIMIT_SEC;

    this.timerInterval = setInterval(() => {
      const elapsedSec = (Date.now() - startedAt) / 1000;
      const remaining = Math.max(0, totalDuration - elapsedSec);

      this.el.timerText.textContent = `${remaining.toFixed(1)}s`;
      const progress = (remaining / totalDuration) * 100;
      this.el.timerBar.style.width = `${progress}%`;

      if (remaining <= 3.0) {
        this.el.timerBadge.className =
          'px-3.5 py-1 rounded-full text-xs font-black tracking-wider uppercase border shadow-lg flex items-center gap-2 bg-rose-950/90 text-rose-300 border-rose-500/80 animate-pulse';
        this.el.timerBar.className = 'h-full bg-rose-500 transition-all duration-75 rounded-full';
        if (remaining <= 3.05 && remaining >= 0.1 && Math.floor(remaining) !== Math.floor(remaining + 0.1)) {
          sounds.playCountdownTick(true);
        }
      } else {
        this.el.timerBadge.className =
          'px-3.5 py-1 rounded-full text-xs font-black tracking-wider uppercase border shadow-lg flex items-center gap-2 bg-slate-900/85 text-amber-300 border-amber-500/50';
        this.el.timerBar.className = 'h-full bg-emerald-400 transition-all duration-75 rounded-full';
      }

      if (remaining <= 0) {
        this.stopTimer();
        this.hideTurnPanels();
        if (onExpired) onExpired();
      }
    }, 60);
  }

  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    this.el.timerContainer.classList.add('hidden');
    this.el.timerContainer.classList.remove('flex');
  }

  startStrikerBars(onCommitShot) {
    this.hideTurnPanels();
    this.stopStrikerBars();

    this.el.strikerPanel.classList.remove('hidden');

    this.strikerState = {
      step: 'x',
      lockedX: null,
      lockedY: null,
      lockedPower: null,
      cursorX: 0.5,
      cursorY: 0.5,
      cursorPower: 0.5,
      barStartTs: Date.now(),
      lastActionTs: 0,
      onCommit: onCommitShot,
    };

    this.updateStrikerUI();

    const loop = () => {
      if (!this.strikerState || this.strikerState.step === 'completed') return;

      const now = Date.now();
      const elapsed = (now - this.strikerState.barStartTs) / 1000;

      if (this.strikerState.step === 'x') {
        const cycle = BAR_CYCLE_SECONDS.directionX;
        const norm = (elapsed % cycle) / cycle;
        const pingPong = norm < 0.5 ? norm * 2 : (1 - norm) * 2;
        this.strikerState.cursorX =
          DIRECTION_RANGE.min + pingPong * (DIRECTION_RANGE.max - DIRECTION_RANGE.min);
        const pct = this.toRangePercent(this.strikerState.cursorX);
        this.el.barXCursor.style.left = `${pct}%`;
      } else if (this.strikerState.step === 'y') {
        const cycle = BAR_CYCLE_SECONDS.directionY;
        const norm = (elapsed % cycle) / cycle;
        const pingPong = norm < 0.5 ? norm * 2 : (1 - norm) * 2;
        this.strikerState.cursorY =
          DIRECTION_RANGE.min + pingPong * (DIRECTION_RANGE.max - DIRECTION_RANGE.min);
        const pct = this.toRangePercent(this.strikerState.cursorY);
        this.el.barYCursor.style.left = `${pct}%`;
      } else if (this.strikerState.step === 'power') {
        const cycle = BAR_CYCLE_SECONDS.power;
        const norm = (elapsed % cycle) / cycle;
        const pingPong = norm < 0.5 ? norm * 2 : (1 - norm) * 2;
        this.strikerState.cursorPower = pingPong;
        this.el.barPowerFill.style.width = `${pingPong * 100}%`;
      }

      this.strikerRaf = requestAnimationFrame(loop);
    };

    this.strikerRaf = requestAnimationFrame(loop);
  }

  handleStrikerAction() {
    if (!this.strikerState || this.strikerState.step === 'completed') return;

    const now = Date.now();
    if (now - this.strikerState.lastActionTs < 100) return;
    this.strikerState.lastActionTs = now;

    sounds.playLockTick();

    if (this.strikerState.step === 'x') {
      this.strikerState.lockedX = this.strikerState.cursorX;
      this.strikerState.step = 'y';
      this.strikerState.barStartTs = now;
      this.updateStrikerUI();
    } else if (this.strikerState.step === 'y') {
      this.strikerState.lockedY = this.strikerState.cursorY;
      this.strikerState.step = 'power';
      this.strikerState.barStartTs = now;
      this.updateStrikerUI();
    } else if (this.strikerState.step === 'power') {
      this.strikerState.lockedPower = this.strikerState.cursorPower;
      this.strikerState.step = 'completed';
      this.stopStrikerBars();
      this.hideTurnPanels();
      this.showStatus('¡Chut enviado! Esperando al portero...');

      if (this.strikerState.onCommit) {
        this.strikerState.onCommit({
          x: this.strikerState.lockedX,
          y: this.strikerState.lockedY,
          power: this.strikerState.lockedPower,
          auto: false,
          barStartTs: now,
        });
      }
    }
  }

  updateStrikerUI() {
    if (!this.strikerState) return;
    const step = this.strikerState.step;

    if (step === 'x') {
      this.el.strikerStepLabel.innerHTML =
        '<span class="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span><span>Paso 1 de 3: Dirección Horizontal (X)</span>';
      this.el.btnStrikerText.textContent = 'Fijar Dirección Horizontal';
      this.el.barXWrapper.className = 'flex flex-col gap-1 opacity-100';
      this.el.barYWrapper.className = 'flex flex-col gap-1 opacity-40';
      this.el.barPowerWrapper.className = 'flex flex-col gap-1 opacity-40';
      this.el.barXStatus.textContent = 'Moviéndose';
      this.el.barYStatus.textContent = 'En espera';
      this.el.barPowerStatus.textContent = 'En espera';
    } else if (step === 'y') {
      this.el.strikerStepLabel.innerHTML =
        '<span class="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span><span>Paso 2 de 3: Altura del Tiro (Y)</span>';
      this.el.btnStrikerText.textContent = 'Fijar Altura';
      this.el.barXWrapper.className = 'flex flex-col gap-1 opacity-100';
      this.el.barYWrapper.className = 'flex flex-col gap-1 opacity-100';
      this.el.barPowerWrapper.className = 'flex flex-col gap-1 opacity-40';
      this.el.barXStatus.textContent = 'Fijado';
      this.el.barXStatus.className = 'text-emerald-400 font-bold';
      this.el.barYStatus.textContent = 'Moviéndose';
      this.el.barPowerStatus.textContent = 'En espera';
    } else if (step === 'power') {
      this.el.strikerStepLabel.innerHTML =
        '<span class="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span><span>Paso 3 de 3: Potencia del Chut</span>';
      this.el.btnStrikerText.textContent = 'Fijar Potencia y Disparar';
      this.el.barXWrapper.className = 'flex flex-col gap-1 opacity-100';
      this.el.barYWrapper.className = 'flex flex-col gap-1 opacity-100';
      this.el.barPowerWrapper.className = 'flex flex-col gap-1 opacity-100';
      this.el.barYStatus.textContent = 'Fijado';
      this.el.barYStatus.className = 'text-emerald-400 font-bold';
      this.el.barPowerStatus.textContent = 'Moviéndose';
    }
  }

  toRangePercent(val) {
    const p = ((val - DIRECTION_RANGE.min) / (DIRECTION_RANGE.max - DIRECTION_RANGE.min)) * 100;
    return Math.max(0, Math.min(100, p));
  }

  stopStrikerBars() {
    if (this.strikerRaf) {
      cancelAnimationFrame(this.strikerRaf);
      this.strikerRaf = null;
    }
  }

  startKeeperSelection(onConfirmTarget) {
    this.hideTurnPanels();

    this.keeperState = {
      selectedPoint: null,
      confirmed: false,
      onConfirm: onConfirmTarget,
    };

    this.el.keeperClickOverlay.classList.remove('hidden');
    this.el.keeperPanel.classList.remove('hidden');
    this.el.btnConfirmKeeper.disabled = true;
    this.el.btnConfirmKeeper.className =
      'w-full py-3 bg-slate-800 text-slate-500 border border-slate-700 font-black text-sm uppercase tracking-wider rounded-xl transition cursor-not-allowed flex items-center justify-center gap-2';
    this.el.keeperInfoText.textContent =
      'Haz clic dentro de la portería para definir el centro de tu parada.';

    // REPINTAR SPRITES DE SELECCIÓN DEL PORTERO EN CADA PENALTI
    this.renderer.setKeeperAim({
      x: 0.5,
      y: 0.3,
      visible: true,
      confirmed: false,
    });
  }

  handleKeeperGoalClick(e) {
    if (!this.keeperState || this.keeperState.confirmed) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const scaleX = 1600 / rect.width;
    const scaleY = 900 / rect.height;

    const canvasPx = clickX * scaleX;
    const canvasPy = clickY * scaleY;

    const norm = pixelToNormalized(canvasPx, canvasPy);
    const clamped = clampToGoal(norm.x, norm.y);

    sounds.playLockTick();
    this.keeperState.selectedPoint = clamped;

    this.el.btnConfirmKeeper.disabled = false;
    this.el.btnConfirmKeeper.className =
      'w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white border border-emerald-400/50 shadow-emerald-900/40 font-black text-sm uppercase tracking-wider rounded-xl transition cursor-pointer flex items-center justify-center gap-2 active:scale-[0.99]';
    this.el.keeperInfoText.textContent = `Zona seleccionada: ${(clamped.x * 100).toFixed(0)}% horiz, ${(clamped.y * 100).toFixed(0)}% altura. Haz clic de nuevo o confirma.`;

    this.renderer.setKeeperAim({
      x: clamped.x,
      y: clamped.y,
      visible: true,
      confirmed: false,
    });
  }

  handleKeeperMouseMove(e) {
    if (!this.keeperState || this.keeperState.confirmed) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const scaleX = 1600 / rect.width;
    const scaleY = 900 / rect.height;

    const canvasPx = mouseX * scaleX;
    const canvasPy = mouseY * scaleY;

    const norm = pixelToNormalized(canvasPx, canvasPy);
    const clamped = clampToGoal(norm.x, norm.y);

    this.renderer.setKeeperAim({
      x: this.keeperState.selectedPoint ? this.keeperState.selectedPoint.x : clamped.x,
      y: this.keeperState.selectedPoint ? this.keeperState.selectedPoint.y : clamped.y,
      visible: true,
      confirmed: !!this.keeperState.selectedPoint,
    });
  }

  handleConfirmKeeper() {
    if (!this.keeperState || this.keeperState.confirmed) return;
    const pt = this.keeperState.selectedPoint || { x: 0.5, y: 0.3 };

    sounds.playLockTick();
    this.keeperState.confirmed = true;

    this.hideTurnPanels();
    this.renderer.setKeeperAim(null);
    this.showStatus('¡Posición fijada! Esperando al delantero...');

    if (this.keeperState.onConfirm) {
      this.keeperState.onConfirm(pt.x, pt.y, false);
    }
  }

  hideTurnPanels() {
    this.el.strikerPanel.classList.add('hidden');
    this.el.keeperPanel.classList.add('hidden');
    this.el.keeperClickOverlay.classList.add('hidden');
    this.stopStrikerBars();
    this.renderer.setKeeperAim(null);
  }

  showStatus(msg) {
    this.el.statusText.textContent = msg;
    this.el.statusBanner.classList.remove('hidden');
  }

  hideStatus() {
    this.el.statusBanner.classList.add('hidden');
  }

  showGameOver(gameState, currentUserId, onReplay, onNewGame) {
    const hostUid = gameState.host.uid;
    const guestUid = gameState.guest ? gameState.guest.uid : null;
    const winnerUid = gameState.winnerUid;
    const isWinner = winnerUid === currentUserId;

    if (winnerUid) {
      confetti({ particleCount: 90, spread: 80, origin: { y: 0.6 } });
    }

    this.el.gameOverTitle.textContent = isWinner
      ? '¡Victoria Incontestable!'
      : winnerUid
      ? '¡Fin de la Tanda!'
      : '¡Empate!';

    this.el.gameOverSubtitle.textContent = isWinner
      ? '¡Has ganado el duelo de penaltis!'
      : winnerUid === hostUid
      ? `Ganador: ${gameState.host.name}`
      : winnerUid === guestUid
      ? `Ganador: ${gameState.guest.name}`
      : 'Tanda finalizada en tablas';

    this.el.finalHostName.textContent = gameState.host.name;
    this.el.finalGuestName.textContent = gameState.guest ? gameState.guest.name : 'Invitado';
    this.el.finalHostScore.textContent = gameState.scores[hostUid] || 0;
    this.el.finalGuestScore.textContent = guestUid ? gameState.scores[guestUid] || 0 : 0;

    this.el.gameOverHistory.innerHTML = '';
    gameState.history.forEach((h) => {
      const striker =
        h.strikerUid === hostUid ? gameState.host.name : gameState.guest ? gameState.guest.name : 'Invitado';
      const row = document.createElement('div');
      row.className = 'flex items-center justify-between text-xs px-2.5 py-1 rounded-lg bg-slate-900/60';
      row.innerHTML = `
        <span class="font-semibold text-slate-400">Ronda ${h.round}</span>
        <span class="text-slate-300">Chuta ${striker}</span>
        <span class="font-bold ${h.result === 'GOL' ? 'text-emerald-400' : 'text-rose-400'}">${h.result}</span>
      `;
      this.el.gameOverHistory.appendChild(row);
    });

    this.el.btnGameoverReplay.onclick = onReplay;
    this.el.btnGameoverNewgame.onclick = onNewGame;

    this.el.gameOverModal.classList.remove('hidden');
  }

  showReplayModal(gameState, onClose) {
    if (!gameState.history || gameState.history.length === 0) return;

    this.el.replayModal.classList.remove('hidden');
    let activeRound = gameState.history[gameState.history.length - 1].round;

    const renderRoundsButtons = () => {
      this.el.replayRoundsList.innerHTML = '';
      gameState.history.forEach((rec) => {
        const btn = document.createElement('button');
        btn.className = `px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
          rec.round === activeRound ? 'bg-amber-400 text-slate-950' : 'bg-slate-800 text-slate-300'
        }`;
        btn.innerHTML = `<span>R${rec.round}</span><span>${rec.result === 'GOL' ? '✓' : '✗'}</span>`;
        btn.onclick = () => {
          activeRound = rec.round;
          renderRoundsButtons();
          playSelectedRound();
        };
        this.el.replayRoundsList.appendChild(btn);
      });
    };

    const playSelectedRound = () => {
      if (this.activeReplayCtrl) {
        this.activeReplayCtrl.stop();
      }

      const record = gameState.history.find((r) => r.round === activeRound);
      if (!record) return;

      const strikerName =
        record.strikerUid === gameState.host.uid
          ? gameState.host.name
          : gameState.guest ? gameState.guest.name : 'Invitado';
      const keeperName =
        record.keeperUid === gameState.host.uid
          ? gameState.host.name
          : gameState.guest ? gameState.guest.name : 'Invitado';

      this.el.replayInfoText.textContent = `Ronda ${record.round}: ${strikerName} chuta vs ${keeperName}`;
      this.el.replayResultTag.textContent = record.result;
      this.el.replayResultTag.className = `font-black uppercase tracking-wider text-xs px-2 py-0.5 rounded ${
        record.result === 'GOL'
          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
          : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
      }`;

      this.activeReplayCtrl = new ReplayController(
        record,
        this.renderer,
        (state) => {
          this.el.btnReplayPlaypause.textContent = state.isPlaying ? '❚❚' : '▶';
        },
        () => {
          this.el.btnReplayPlaypause.textContent = '▶';
        }
      );
      this.activeReplayCtrl.start();
    };

    this.el.btnReplayPlaypause.onclick = () => {
      if (!this.activeReplayCtrl) return;
      if (this.activeReplayCtrl.isPlaying) {
        this.activeReplayCtrl.pause();
      } else {
        this.activeReplayCtrl.resume();
      }
    };

    this.el.btnReplayRestart.onclick = () => {
      if (this.activeReplayCtrl) {
        this.activeReplayCtrl.start();
      }
    };

    document.querySelectorAll('.btn-replay-spd').forEach((btn) => {
      btn.onclick = () => {
        const spd = parseFloat(btn.getAttribute('data-speed'));
        document.querySelectorAll('.btn-replay-spd').forEach((b) => {
          b.className = 'btn-replay-spd px-2.5 py-1 rounded-lg text-xs font-bold text-slate-400 hover:text-white cursor-pointer';
        });
        btn.className = 'btn-replay-spd px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-400 text-slate-950 cursor-pointer';
        if (this.activeReplayCtrl) this.activeReplayCtrl.setSpeed(spd);
      };
    });

    const closeHandler = () => {
      if (this.activeReplayCtrl) {
        this.activeReplayCtrl.stop();
        this.activeReplayCtrl = null;
      }
      this.el.replayModal.classList.add('hidden');
      this.renderer.resetToIdle();
      if (onClose) onClose();
    };

    this.el.btnCloseReplay.onclick = closeHandler;
    this.el.btnReplayExit.onclick = closeHandler;

    renderRoundsButtons();
    playSelectedRound();
  }
}
