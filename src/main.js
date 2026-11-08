/**
 * Controlador principal en Vanilla JS con módulos ES (sin React ni frameworks).
 * Suscripción única a Firestore por partida que nunca se recrea entre rondas.
 */

import './index.css';
import confetti from 'canvas-confetti';
import {
  BAR_CYCLE_SECONDS,
  DIRECTION_RANGE,
  TIME_LIMIT_SEC,
} from './config.js';
import {
  auth,
  createMatch,
  getCurrentUser,
  joinMatch,
  loginAsGuest,
  loginWithGoogle,
  logout,
  markMatchFinished,
  onAuth,
  pushMatchEvent,
  subscribeToMatchSession,
} from './firebase.js';
import { clampToGoal, pixelToNormalized, resolveShot } from './math.js';
import { checkMatchStatus, getRolesForRound } from './reducer.js';
import { GameRenderer } from './render.js';
import { ReplayController } from './replay.js';
import { sounds } from './sound.js';

// Elementos del DOM en index.html
const gameContainer = document.getElementById('game-container');
const canvas = document.getElementById('game-canvas');
const scoreboard = document.getElementById('scoreboard');
const scoreboardCode = document.getElementById('scoreboard-code');
const btnCopyCode = document.getElementById('btn-copy-code');
const btnShareMatch = document.getElementById('btn-share-code');
const hostNameLabel = document.getElementById('host-name-label');
const hostYouBadge = document.getElementById('host-you-badge');
const hostDots = document.getElementById('host-dots');
const hostScoreVal = document.getElementById('score-host');
const guestNameLabel = document.getElementById('guest-name-label');
const guestYouBadge = document.getElementById('guest-you-badge');
const guestDots = document.getElementById('guest-dots');
const guestScoreVal = document.getElementById('score-guest');
const roundIndicator = document.getElementById('round-indicator');
const roleBadge = document.getElementById('role-badge');
const btnOpenReplay = document.getElementById('btn-open-replay');
const btnToggleMute = document.getElementById('btn-toggle-sound');

const timerContainer = document.getElementById('timer-container');
const timerBadge = document.getElementById('timer-badge');
const timerVal = document.getElementById('timer-text');
const timerBar = document.getElementById('timer-bar');

const keeperGoalOverlay = document.getElementById('keeper-click-overlay');
const keeperPanel = document.getElementById('keeper-panel');
const keeperPanelText = document.getElementById('keeper-info-text');
const btnConfirmKeeper = document.getElementById('btn-confirm-keeper');

const strikerControls = document.getElementById('striker-panel');
const strikerStepTitle = document.getElementById('striker-step-label');
const barRowX = document.getElementById('bar-x-wrapper');
const barStatusX = document.getElementById('bar-x-status');
const barMarkerX = document.getElementById('bar-x-cursor');
const barRowY = document.getElementById('bar-y-wrapper');
const barStatusY = document.getElementById('bar-y-status');
const barMarkerY = document.getElementById('bar-y-cursor');
const barRowPower = document.getElementById('bar-power-wrapper');
const barStatusPower = document.getElementById('bar-power-status');
const barFillPower = document.getElementById('bar-power-fill');
const btnStrikerAction = document.getElementById('btn-striker-action');
const btnStrikerActionText = document.getElementById('btn-striker-text');

const statusBanner = document.getElementById('status-banner');
const statusBannerText = document.getElementById('status-text');

const lobbyOverlay = document.getElementById('lobby-screen');
const lobbyError = document.getElementById('lobby-error');
const lobbyErrorText = document.getElementById('lobby-error-text');
const btnErrorGoogleFallback = document.getElementById('btn-error-google-fallback');
const lobbyMainView = document.getElementById('lobby-menu-main');
const lobbyJoinView = document.getElementById('lobby-menu-join');
const lobbyWaitingView = document.getElementById('lobby-menu-waiting');
const btnCreateMatch = document.getElementById('btn-create-match');
const btnGoToJoin = document.getElementById('btn-goto-join');
const btnBackToMain = document.getElementById('btn-back-to-main');
const authStatusRow = document.getElementById('auth-status-container');
const authUserLabel = document.getElementById('auth-user-label');
const btnLogout = document.getElementById('btn-logout');
const inputJoinCode = document.getElementById('join-code-input');
const inputGuestNickname = document.getElementById('guest-nickname-input');
const btnJoinAsGuest = document.getElementById('btn-join-anonymous');
const btnJoinWithGoogle = document.getElementById('btn-join-google');
const createdCodeDisplay = document.getElementById('created-code-display');
const btnCopyWaitingLink = document.getElementById('btn-copy-share-link');
const btnShareWaitingLink = document.getElementById('btn-native-share');

const gameOverModal = document.getElementById('game-over-modal');
const gameOverTitle = document.getElementById('game-over-title');
const gameOverSubtitle = document.getElementById('game-over-subtitle');
const finalHostName = document.getElementById('final-host-name');
const finalHostScore = document.getElementById('final-host-score');
const finalGuestName = document.getElementById('final-guest-name');
const finalGuestScore = document.getElementById('final-guest-score');
const finalHistoryList = document.getElementById('game-over-history');
const btnGameOverReplay = document.getElementById('btn-gameover-replay');
const btnNewGame = document.getElementById('btn-gameover-newgame');

const replayModal = document.getElementById('replay-modal');
const replayRoundsContainer = document.getElementById('replay-rounds-list');
const btnCloseReplay = document.getElementById('btn-close-replay');
const btnReplayCloseBottom = document.getElementById('btn-replay-exit');
const replayInfoText = document.getElementById('replay-info-text');
const replayResultBadge = document.getElementById('replay-result-tag');
const btnReplayPlayPause = document.getElementById('btn-replay-playpause');
const btnReplayRestart = document.getElementById('btn-replay-restart');
const speedButtons = document.querySelectorAll('.btn-replay-spd');

// Instancia de renderizado en Canvas
const renderer = new GameRenderer(canvas);
let currentUser = null;
let activeMatchCode = null;
let activeUnsubscribeSession = null; // Suscripción única a Firestore
let currentGameState = null;
let currentAllEvents = [];

// Estados del turno del delantero (ejecutado en su propia máquina)
let strikerStep = 'x'; // 'x' | 'y' | 'power' | 'completed'
let strikerLocalX = null;
let strikerLocalY = null;
let strikerLocalPower = null;
let strikerCursorX = 0.5;
let strikerCursorY = 0.5;
let strikerCursorPower = 0.5;
let strikerBarStartTs = Date.now();
let strikerRafId = null;
let strikerLastActionTs = 0;

// Estados del turno del portero
let keeperSelectedPoint = null;
let keeperConfirmed = false;

// Estado del temporizador
let timerInterval = null;
let isTimeExpired = false;
let currentRoundActive = false;
let lastAnimatedRound = 0;
let isHostResolving = false;

// Controlador de repeticiones
let activeReplayController = null;

// Inicialización de la aplicación
async function initApp() {
  // Pre-cargar SVGs y arrancar bucle de animación de Canvas
  try {
    await renderer.preloadAssets();
  } catch (err) {
    console.error('Error preloading canvas sprites:', err);
  }

  function renderLoop(time) {
    renderer.render(time);
    requestAnimationFrame(renderLoop);
  }
  requestAnimationFrame(renderLoop);

  // Escuchar estado de autenticación
  onAuth((user) => {
    currentUser = user;
    updateAuthUI();
  });

  // Detectar código en URL (?code=ABC123)
  const params = new URLSearchParams(window.location.search);
  const codeParam = params.get('code');
  if (codeParam) {
    inputJoinCode.value = codeParam.toUpperCase();
    showLobbyView('join');
  }

  // Cargar apodo guardado
  const savedNick = localStorage.getItem('duel_guest_nickname');
  if (savedNick) {
    inputGuestNickname.value = savedNick;
  }

  setupEventListeners();
}

// ----------------------------------------------------
// GESTIÓN DEL LOBBY Y AUTENTICACIÓN
// ----------------------------------------------------

function updateAuthUI() {
  if (currentUser && !currentUser.isAnonymous) {
    authStatusRow.classList.remove('hidden');
    authUserLabel.textContent = `Conectado como ${currentUser.displayName || 'Google'}`;
  } else {
    authStatusRow.classList.add('hidden');
  }
}

function showLobbyView(viewName) {
  lobbyMainView.classList.add('hidden');
  lobbyJoinView.classList.add('hidden');
  lobbyWaitingView.classList.add('hidden');
  hideLobbyError();

  if (viewName === 'main') {
    lobbyMainView.classList.remove('hidden');
  } else if (viewName === 'join') {
    lobbyJoinView.classList.remove('hidden');
  } else if (viewName === 'waiting') {
    lobbyWaitingView.classList.remove('hidden');
  }
}

function showLobbyError(msg, allowGoogleFallback = false) {
  lobbyErrorText.textContent = msg;
  lobbyError.classList.remove('hidden');
  lobbyError.classList.add('flex');
  if (allowGoogleFallback) {
    btnErrorGoogleFallback.classList.remove('hidden');
  } else {
    btnErrorGoogleFallback.classList.add('hidden');
  }
}

function hideLobbyError() {
  lobbyError.classList.add('hidden');
  lobbyError.classList.remove('flex');
}

function setupEventListeners() {
  btnCreateMatch.addEventListener('click', async () => {
    hideLobbyError();
    sounds.playLockTick();
    btnCreateMatch.disabled = true;
    try {
      let user = currentUser;
      if (!user || user.isAnonymous) {
        user = await loginWithGoogle();
      }
      const code = await createMatch(user);
      createdCodeDisplay.textContent = code;
      showLobbyView('waiting');
      enterMatchSession(code);
    } catch (err) {
      console.error(err);
      showLobbyError(err.message || 'Error al crear la partida.');
    } finally {
      btnCreateMatch.disabled = false;
    }
  });

  btnGoToJoin.addEventListener('click', () => {
    showLobbyView('join');
  });

  btnBackToMain.addEventListener('click', () => {
    showLobbyView('main');
  });

  btnJoinAsGuest.addEventListener('click', async () => {
    hideLobbyError();
    const code = inputJoinCode.value.trim().toUpperCase();
    const nickname = inputGuestNickname.value.trim();

    if (!code || code.length !== 6) {
      showLobbyError('Introduce un código de 6 caracteres válido.');
      return;
    }
    if (!nickname) {
      showLobbyError('Por favor, escribe tu apodo de jugador.');
      return;
    }

    sounds.playLockTick();
    btnJoinAsGuest.disabled = true;
    try {
      const user = await loginAsGuest(nickname);
      await joinMatch(code, user, true, nickname);
      enterMatchSession(code);
    } catch (err) {
      console.error(err);
      const isAuthError = err.message && err.message.includes('Google');
      showLobbyError(err.message || 'Error al unirse a la partida.', isAuthError);
    } finally {
      btnJoinAsGuest.disabled = false;
    }
  });

  btnJoinWithGoogle.addEventListener('click', async () => {
    hideLobbyError();
    const code = inputJoinCode.value.trim().toUpperCase();
    if (!code || code.length !== 6) {
      showLobbyError('Introduce un código de 6 caracteres válido.');
      return;
    }

    sounds.playLockTick();
    btnJoinWithGoogle.disabled = true;
    try {
      let user = currentUser;
      if (!user || user.isAnonymous) {
        user = await loginWithGoogle();
      }
      await joinMatch(code, user, false, user.displayName || 'Invitado Google');
      enterMatchSession(code);
    } catch (err) {
      console.error(err);
      showLobbyError(err.message || 'Error al unirse con Google.');
    } finally {
      btnJoinWithGoogle.disabled = false;
    }
  });

  btnErrorGoogleFallback.addEventListener('click', () => {
    btnJoinWithGoogle.click();
  });

  btnLogout.addEventListener('click', async () => {
    await logout();
  });

  // Copiar y compartir código
  btnCopyCode.addEventListener('click', () => {
    if (activeMatchCode) copyText(activeMatchCode, '¡Código copiado!');
  });
  btnCopyWaitingLink.addEventListener('click', () => {
    if (activeMatchCode) copyText(getShareUrl(activeMatchCode), '¡Enlace copiado!');
  });
  btnShareMatch.addEventListener('click', () => {
    if (activeMatchCode) shareLink(activeMatchCode);
  });
  btnShareWaitingLink.addEventListener('click', () => {
    if (activeMatchCode) shareLink(activeMatchCode);
  });

  btnToggleMute.addEventListener('click', () => {
    const isMuted = sounds.toggleMute();
    btnToggleMute.textContent = isMuted ? '🔇' : '🔊';
  });

  // Acciones del delantero (barra espaciadora o botón)
  btnStrikerAction.addEventListener('click', handleStrikerAction);
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.key === ' ') {
      if (currentRoundActive && !isTimeExpired && isCurrentStriker() && strikerStep !== 'completed') {
        e.preventDefault();
        handleStrikerAction();
      } else if (currentRoundActive && !isTimeExpired && isCurrentKeeper() && keeperSelectedPoint && !keeperConfirmed) {
        e.preventDefault();
        handleConfirmKeeper();
      }
    } else if (e.code === 'Enter' || e.key === 'Enter') {
      if (currentRoundActive && !isTimeExpired && isCurrentKeeper() && keeperSelectedPoint && !keeperConfirmed) {
        e.preventDefault();
        handleConfirmKeeper();
      }
    }
  });

  // Acciones del portero
  keeperGoalOverlay.addEventListener('mousemove', handleKeeperMouseMove);
  keeperGoalOverlay.addEventListener('click', handleKeeperClick);
  btnConfirmKeeper.addEventListener('click', handleConfirmKeeper);

  // Fin de partida y repetición
  btnGameOverReplay.addEventListener('click', () => {
    gameOverModal.classList.add('hidden');
    openReplayModal();
  });
  btnOpenReplay.addEventListener('click', openReplayModal);
  btnNewGame.addEventListener('click', exitMatchSession);
  btnCloseReplay.addEventListener('click', closeReplayModal);
  btnReplayCloseBottom.addEventListener('click', closeReplayModal);
}

function getShareUrl(code) {
  const origin = window.location.origin + window.location.pathname;
  return `${origin}?code=${code}`;
}

function copyText(text, successMsg) {
  navigator.clipboard.writeText(text);
  showToast(successMsg);
}

async function shareLink(code) {
  const url = getShareUrl(code);
  if (navigator.share) {
    try {
      await navigator.share({
        title: 'Duelo de Penaltis 1v1',
        text: `¡Te reto a un duelo de penaltis! Código ${code}:`,
        url,
      });
      return;
    } catch (e) {
      // fallback
    }
  }
  copyText(url, '¡Enlace copiado!');
}

function showToast(msg) {
  const toast = document.createElement('div');
  toast.className =
    'fixed bottom-8 right-8 z-50 bg-emerald-600 text-white font-bold px-4 py-2 rounded-xl shadow-2xl text-xs uppercase tracking-wider transition-opacity duration-300';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

// ----------------------------------------------------
// SUSCRIPCIÓN ÚNICA DE SESIÓN (REQUISITO FUNDAMENTAL)
// Se crea una sola vez al entrar en la partida y se cancela solo al salir;
// NUNCA se recrea entre rondas.
// ----------------------------------------------------

function enterMatchSession(code) {
  activeMatchCode = code;
  window.history.replaceState({}, '', `${window.location.pathname}?code=${code}`);

  // Si ya existía una suscripción activa previa, cancelarla
  if (activeUnsubscribeSession) {
    activeUnsubscribeSession();
    activeUnsubscribeSession = null;
  }

  // SUSCRIPCIÓN ÚNICA: se registra una sola vez al entrar a la partida
  activeUnsubscribeSession = subscribeToMatchSession(code, {
    onMatchMeta: (meta) => {
      if (meta.status === 'playing') {
        lobbyOverlay.classList.add('hidden');
        gameContainer.classList.remove('hidden');
        scoreboard.classList.remove('hidden');
      }
    },

    onStateUpdate: (state, events) => {
      currentGameState = state;
      currentAllEvents = events;
      syncGameStateToUI(state);

      // Si somos el anfitrión y la partida está en marcha, iniciar ronda 1 si no está creada
      if (isHostUser() && state.status === 'playing' && state.guest?.uid) {
        const hasRoundStarted = events.some(
          (e) => e.type === 'ROUND_STARTED' && e.round === state.currentRound
        );
        if (!hasRoundStarted) {
          const roles = getRolesForRound(state.currentRound, state.host.uid, state.guest.uid);
          pushMatchEvent(code, {
            type: 'ROUND_STARTED',
            playerId: currentUser.uid,
            round: state.currentRound,
            payload: {
              strikerUid: roles.strikerUid,
              keeperUid: roles.keeperUid,
              startedAt: Date.now(),
            },
            clientTs: Date.now(),
          }).then(() => sounds.playWhistle());
        }
      }
    },

    // Notificación centralizada: ambos jugadores han enviado su acción (Chut + Parada)
    onTurnDecisionsReady: ({ round, shot, keeper, state }) => {
      // El anfitrión calcula la resolución de forma autoritativa y emite ROUND_RESOLVED
      if (isHostUser() && !isHostResolving) {
        isHostResolving = true;
        const resolution = resolveShot(shot, keeper);
        const resolvedPayload = {
          result: resolution.result,
          shot,
          keeper,
          radius: resolution.radius_m,
          distance_m: resolution.distance_m,
        };

        pushMatchEvent(code, {
          type: 'ROUND_RESOLVED',
          playerId: currentUser.uid,
          round,
          payload: resolvedPayload,
          clientTs: Date.now(),
        }).then(() => {
          // Programar siguiente ronda tras finalizar la animación de 3 segundos
          setTimeout(async () => {
            isHostResolving = false;
            const updatedEvents = [
              ...currentAllEvents,
              {
                seq: 9999,
                type: 'ROUND_RESOLVED',
                playerId: currentUser.uid,
                round,
                payload: resolvedPayload,
                clientTs: Date.now(),
              },
            ];
            const updatedState = currentGameState;
            const statusCheck = checkMatchStatus(updatedState);

            if (statusCheck.finished) {
              await markMatchFinished(code, statusCheck.winnerUid);
            } else {
              const nextRound = round + 1;
              const roles = getRolesForRound(
                nextRound,
                currentGameState.host.uid,
                currentGameState.guest.uid
              );

              await pushMatchEvent(code, {
                type: 'ROUND_STARTED',
                playerId: currentUser.uid,
                round: nextRound,
                payload: {
                  strikerUid: roles.strikerUid,
                  keeperUid: roles.keeperUid,
                  startedAt: Date.now(),
                },
                clientTs: Date.now(),
              });
              sounds.playWhistle();
            }
          }, 4200);
        });
      }
    },

    // Notificación de resolución recibida en ambas máquinas: reproduce la animación simultánea
    onRoundResolved: (resolvedPayload, round, state) => {
      if (lastAnimatedRound === round) return;
      lastAnimatedRound = round;

      // Ocultar paneles inmediatamente
      hideAllActionControls();
      showStatusBanner('¡Ejecutando jugada...!');

      // Ejecutar animación en Canvas
      sounds.playKick();
      renderer.triggerShotAnimation({
        x: resolvedPayload.shot.x,
        y: resolvedPayload.shot.y,
        power: resolvedPayload.shot.power,
        keeperX: resolvedPayload.keeper.x,
        keeperY: resolvedPayload.keeper.y,
        result: resolvedPayload.result,
        radius_m: resolvedPayload.radius,
        radius_px: resolvedPayload.radius * 82,
      });

      const flightDuration = 900 - resolvedPayload.shot.power * 550 + 200;
      setTimeout(() => {
        if (resolvedPayload.result === 'GOL') sounds.playGoal();
        else if (resolvedPayload.result === 'PARADA') sounds.playSave();
        else sounds.playMiss();
      }, flightDuration);
    },
  });
}

function exitMatchSession() {
  if (activeUnsubscribeSession) {
    activeUnsubscribeSession();
    activeUnsubscribeSession = null;
  }
  activeMatchCode = null;
  currentGameState = null;
  currentAllEvents = [];
  lastAnimatedRound = 0;
  isHostResolving = false;
  if (timerInterval) clearInterval(timerInterval);

  window.history.replaceState({}, '', window.location.pathname);
  gameOverModal.classList.add('hidden');
  scoreboard.classList.add('hidden');
  gameContainer.classList.add('hidden');
  hideAllActionControls();
  renderer.resetToIdle();
  showLobbyView('main');
  lobbyOverlay.classList.remove('hidden');
}

// ----------------------------------------------------
// SINCRONIZACIÓN DEL ESTADO DE JUEGO CON LA UI
// ----------------------------------------------------

function isHostUser() {
  return currentUser && currentGameState && currentUser.uid === currentGameState.host.uid;
}

function isCurrentStriker() {
  return (
    currentUser &&
    currentGameState &&
    currentUser.uid === currentGameState.currentStrikerUid
  );
}

function isCurrentKeeper() {
  return (
    currentUser &&
    currentGameState &&
    currentUser.uid === currentGameState.currentKeeperUid
  );
}

function syncGameStateToUI(state) {
  if (!state) return;

  if (state.status === 'playing') {
    lobbyOverlay.classList.add('hidden');
    gameContainer.classList.remove('hidden');
    scoreboard.classList.remove('hidden');
  }

  scoreboardCode.textContent = state.code || '------';
  hostNameLabel.textContent = state.host.name;
  guestNameLabel.textContent = state.guest ? state.guest.name : 'Esperando...';

  if (currentUser) {
    if (currentUser.uid === state.host.uid) hostYouBadge.classList.remove('hidden');
    else hostYouBadge.classList.add('hidden');

    if (state.guest && currentUser.uid === state.guest.uid) guestYouBadge.classList.remove('hidden');
    else guestYouBadge.classList.add('hidden');
  }

  const hostUid = state.host.uid;
  const guestUid = state.guest ? state.guest.uid : null;

  hostScoreVal.textContent = state.scores[hostUid] || 0;
  guestScoreVal.textContent = guestUid ? state.scores[guestUid] || 0 : 0;

  // Actualizar puntos de penaltis
  renderPenaltyDots(hostDots, state.roundHistoryByPlayer[hostUid] || []);
  renderPenaltyDots(guestDots, guestUid ? state.roundHistoryByPlayer[guestUid] || [] : []);

  if (state.isSuddenDeath) {
    roundIndicator.innerHTML = '<span class="text-rose-400 font-bold uppercase animate-pulse">¡Muerte Súbita!</span>';
  } else {
    roundIndicator.textContent = `Ronda ${state.currentRound} de 5`;
  }

  // Identificar rol del usuario
  if (isCurrentStriker()) {
    roleBadge.textContent = 'Eres Delantero';
    roleBadge.className = 'text-xs font-bold text-amber-300';
  } else if (isCurrentKeeper()) {
    roleBadge.textContent = 'Eres Portero';
    roleBadge.className = 'text-xs font-bold text-sky-400';
  } else {
    roleBadge.textContent = 'Observador';
  }

  if (state.history.length > 0) {
    btnOpenReplay.classList.remove('hidden');
  }

  // Verificar si la ronda actual ya está resuelta
  const hasResolved = currentAllEvents.some(
    (e) => e.type === 'ROUND_RESOLVED' && e.round === state.currentRound
  );

  currentRoundActive = state.status === 'playing' && !hasResolved;

  if (state.status === 'finished') {
    currentRoundActive = false;
    hideAllActionControls();
    showGameOverModal(state);
    return;
  }

  if (currentRoundActive) {
    // Comprobar si el usuario actual ya envió su acción
    const myCommittedShot = currentAllEvents.some(
      (e) =>
        (e.type === 'SHOT_COMMITTED' || e.type === 'SHOT_POWER_LOCKED') &&
        e.round === state.currentRound &&
        e.playerId === currentUser.uid
    );
    const myKeeperTargetSet = currentAllEvents.some(
      (e) =>
        e.type === 'KEEPER_TARGET_SET' &&
        e.round === state.currentRound &&
        e.playerId === currentUser.uid
    );

    // Iniciar temporizador de 10 segundos
    startTimer(state.roundStartedTs, () => handleTurnTimeout(state.currentRound));

    // REQUISITO: Al pasar al siguiente penalti deben repintarse los sprites de selección del portero
    if (isCurrentKeeper()) {
      if (!myKeeperTargetSet && !isTimeExpired) {
        setupKeeperTurn();
      } else {
        hideKeeperControls();
        showStatusBanner('¡Posición fijada! Esperando al delantero...');
      }
    } else if (isCurrentStriker()) {
      hideKeeperControls();
      if (!myCommittedShot && !isTimeExpired) {
        setupStrikerTurn();
      } else {
        hideStrikerControls();
        showStatusBanner('¡Chut enviado! Esperando al portero...');
      }
    } else {
      hideAllActionControls();
      showStatusBanner('Turno en curso...');
    }
  } else {
    hideAllActionControls();
  }
}

function renderPenaltyDots(container, history) {
  container.innerHTML = '';
  const totalDots = Math.max(5, history.length);
  for (let i = 0; i < totalDots; i++) {
    const res = history[i];
    const dot = document.createElement('span');
    dot.className =
      'w-2.5 h-2.5 rounded-full border ' +
      (res === 'GOL'
        ? 'bg-emerald-500 border-emerald-400 shadow-sm shadow-emerald-500/50'
        : res === 'PARADA' || res === 'FUERA'
        ? 'bg-rose-500 border-rose-400'
        : 'bg-slate-700/80 border-slate-600');
    container.appendChild(dot);
  }
}

// ----------------------------------------------------
// GESTIÓN DEL TEMPORIZADOR DE 10 SEGUNDOS
// REQUISITO: Al terminarse el tiempo, debe ocultar el panel de selección de movimiento
// ----------------------------------------------------

function startTimer(startedAt, onTimeout) {
  if (timerInterval) clearInterval(timerInterval);
  isTimeExpired = false;

  timerContainer.classList.remove('hidden');
  timerContainer.classList.add('flex');

  function tick() {
    const elapsedSec = (Date.now() - startedAt) / 1000;
    const remaining = Math.max(0, TIME_LIMIT_SEC - elapsedSec);

    timerVal.textContent = `${remaining.toFixed(1)}s`;
    const pct = Math.max(0, Math.min(100, (remaining / TIME_LIMIT_SEC) * 100));
    timerBar.style.width = `${pct}%`;

    if (remaining <= 3.0) {
      timerBadge.className =
        'px-3.5 py-1 rounded-full text-xs font-black tracking-wider uppercase border shadow-lg flex items-center gap-2 bg-rose-950/90 text-rose-300 border-rose-500/80 animate-pulse';
      timerBar.className = 'h-full bg-rose-500 transition-all duration-75 rounded-full';
    } else {
      timerBadge.className =
        'px-3.5 py-1 rounded-full text-xs font-black tracking-wider uppercase border shadow-lg flex items-center gap-2 bg-slate-900/85 text-amber-300 border-amber-500/50';
      timerBar.className = 'h-full bg-emerald-400 transition-all duration-75 rounded-full';
    }

    if (remaining <= 0) {
      clearInterval(timerInterval);
      isTimeExpired = true;
      timerContainer.classList.add('hidden');
      timerContainer.classList.remove('flex');
      // OCULTAR INMEDIATAMENTE LOS PANELES DE MOVIMIENTO
      hideAllActionControls();
      showStatusBanner('¡Tiempo agotado! Procesando turno...');
      if (onTimeout) onTimeout();
    }
  }

  tick();
  timerInterval = setInterval(tick, 80);
}

function handleTurnTimeout(round) {
  if (isCurrentStriker()) {
    const hasShot = currentAllEvents.some(
      (e) => (e.type === 'SHOT_COMMITTED' || e.type === 'SHOT_POWER_LOCKED') && e.round === round
    );
    if (!hasShot) {
      // Enviar paquete único automático
      const randX = 0.15 + Math.random() * 0.7;
      const randY = 0.15 + Math.random() * 0.7;
      const randPower = 0.4 + Math.random() * 0.5;

      pushMatchEvent(activeMatchCode, {
        type: 'SHOT_COMMITTED',
        playerId: currentUser.uid,
        round,
        payload: {
          x: randX,
          y: randY,
          power: randPower,
          auto: true,
          barStartTs: Date.now(),
        },
        clientTs: Date.now(),
      });
    }
  } else if (isCurrentKeeper()) {
    const hasKeeper = currentAllEvents.some(
      (e) => e.type === 'KEEPER_TARGET_SET' && e.round === round
    );
    if (!hasKeeper) {
      const randX = 0.15 + Math.random() * 0.7;
      const randY = 0.15 + Math.random() * 0.7;

      pushMatchEvent(activeMatchCode, {
        type: 'KEEPER_TARGET_SET',
        playerId: currentUser.uid,
        round,
        payload: { x: randX, y: randY, auto: true },
        clientTs: Date.now(),
      });
    }
  }
}

// ----------------------------------------------------
// MECÁNICA DEL PORTERO: RESTABLECIMIENTO DE SPRITES EN CADA PENALTI
// ----------------------------------------------------

function setupKeeperTurn() {
  // Limpiar selecciones del penalti anterior
  keeperSelectedPoint = null;
  keeperConfirmed = false;
  btnConfirmKeeper.disabled = true;
  btnConfirmKeeper.className =
    'w-full py-3 font-black text-sm uppercase tracking-wider rounded-xl shadow-lg transition flex items-center justify-center gap-2 bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed';
  keeperPanelText.textContent = 'Haz clic dentro de la portería para definir el centro de tu parada.';

  // Mostrar el área interactiva y el panel inferior
  keeperGoalOverlay.classList.remove('hidden');
  keeperPanel.classList.remove('hidden');
  statusBanner.classList.add('hidden');

  // Repintar el retículo de selección limpio en el centro inicial
  renderer.setKeeperAim({
    x: 0.5,
    y: 0.3,
    visible: true,
    confirmed: false,
  });
}

function handleKeeperMouseMove(e) {
  if (!currentRoundActive || isTimeExpired || keeperConfirmed) return;

  const rect = keeperGoalOverlay.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const clickY = e.clientY - rect.top;

  const scaleX = 1600 / rect.width;
  const scaleY = 900 / rect.height;

  const norm = pixelToNormalized(clickX * scaleX, clickY * scaleY);
  const clamped = clampToGoal(norm.x, norm.y);

  renderer.setKeeperAim({
    x: keeperSelectedPoint ? keeperSelectedPoint.x : clamped.x,
    y: keeperSelectedPoint ? keeperSelectedPoint.y : clamped.y,
    visible: true,
    confirmed: !!keeperSelectedPoint,
  });
}

function handleKeeperClick(e) {
  if (!currentRoundActive || isTimeExpired || keeperConfirmed) return;

  const rect = keeperGoalOverlay.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const clickY = e.clientY - rect.top;

  const scaleX = 1600 / rect.width;
  const scaleY = 900 / rect.height;

  const norm = pixelToNormalized(clickX * scaleX, clickY * scaleY);
  const clamped = clampToGoal(norm.x, norm.y);

  sounds.playLockTick();
  keeperSelectedPoint = clamped;

  renderer.setKeeperAim({
    x: clamped.x,
    y: clamped.y,
    visible: true,
    confirmed: false,
  });

  btnConfirmKeeper.disabled = false;
  btnConfirmKeeper.className =
    'w-full py-3 font-black text-sm uppercase tracking-wider rounded-xl shadow-lg transition flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white border border-emerald-400/50 shadow-emerald-900/40 cursor-pointer active:scale-[0.99]';
  keeperPanelText.textContent = `Posición elegida: (${Math.round(clamped.x * 100)}% horizontal, ${Math.round(clamped.y * 100)}% altura). Pulsa Confirmar o cambia de posición.`;
}

function handleConfirmKeeper() {
  if (!currentRoundActive || isTimeExpired || keeperConfirmed || !keeperSelectedPoint) return;

  sounds.playLockTick();
  keeperConfirmed = true;

  // Ocultar panel de selección inmediatamente
  hideKeeperControls();
  showStatusBanner('¡Posición fijada! Esperando al delantero...');

  // Enviar el paquete único a Firestore
  pushMatchEvent(activeMatchCode, {
    type: 'KEEPER_TARGET_SET',
    playerId: currentUser.uid,
    round: currentGameState.currentRound,
    payload: {
      x: keeperSelectedPoint.x,
      y: keeperSelectedPoint.y,
      auto: false,
    },
    clientTs: Date.now(),
  });
}

function hideKeeperControls() {
  keeperGoalOverlay.classList.add('hidden');
  keeperPanel.classList.add('hidden');
  renderer.setKeeperAim(null);
}

// ----------------------------------------------------
// MECÁNICA DEL DELANTERO: BARRAS OSCILANTES LOCALES Y PAQUETE ÚNICO
// ----------------------------------------------------

function setupStrikerTurn() {
  strikerStep = 'x';
  strikerLocalX = null;
  strikerLocalY = null;
  strikerLocalPower = null;
  strikerBarStartTs = Date.now();

  strikerControls.classList.remove('hidden');
  statusBanner.classList.add('hidden');

  updateStrikerUI();
  startStrikerBarLoop();
}

function startStrikerBarLoop() {
  if (strikerRafId) cancelAnimationFrame(strikerRafId);

  function loop() {
    if (!currentRoundActive || isTimeExpired || strikerStep === 'completed') return;

    const now = Date.now();
    const elapsed = (now - strikerBarStartTs) / 1000;

    if (strikerStep === 'x') {
      const cycle = BAR_CYCLE_SECONDS.directionX;
      const norm = (elapsed % cycle) / cycle;
      const pingPong = norm < 0.5 ? norm * 2 : (1 - norm) * 2;
      strikerCursorX = DIRECTION_RANGE.min + pingPong * (DIRECTION_RANGE.max - DIRECTION_RANGE.min);
      const pct = toBarPercent(strikerCursorX);
      barMarkerX.style.left = `${pct}%`;
    } else if (strikerStep === 'y') {
      const cycle = BAR_CYCLE_SECONDS.directionY;
      const norm = (elapsed % cycle) / cycle;
      const pingPong = norm < 0.5 ? norm * 2 : (1 - norm) * 2;
      strikerCursorY = DIRECTION_RANGE.min + pingPong * (DIRECTION_RANGE.max - DIRECTION_RANGE.min);
      const pct = toBarPercent(strikerCursorY);
      barMarkerY.style.left = `${pct}%`;
    } else if (strikerStep === 'power') {
      const cycle = BAR_CYCLE_SECONDS.power;
      const norm = (elapsed % cycle) / cycle;
      const pingPong = norm < 0.5 ? norm * 2 : (1 - norm) * 2;
      strikerCursorPower = pingPong;
      barFillPower.style.width = `${pingPong * 100}%`;
    }

    strikerRafId = requestAnimationFrame(loop);
  }

  strikerRafId = requestAnimationFrame(loop);
}

function handleStrikerAction() {
  if (!currentRoundActive || isTimeExpired || strikerStep === 'completed') return;

  const now = Date.now();
  if (now - strikerLastActionTs < 100) return;
  strikerLastActionTs = now;

  sounds.playLockTick();

  if (strikerStep === 'x') {
    strikerLocalX = strikerCursorX;
    strikerStep = 'y';
    strikerBarStartTs = now;
    updateStrikerUI();
  } else if (strikerStep === 'y') {
    strikerLocalY = strikerCursorY;
    strikerStep = 'power';
    strikerBarStartTs = now;
    updateStrikerUI();
  } else if (strikerStep === 'power') {
    strikerLocalPower = strikerCursorPower;
    strikerStep = 'completed';
    updateStrikerUI();

    // OCULTAR PANEL INMEDIATAMENTE
    hideStrikerControls();
    showStatusBanner('¡Chut preparado! Esperando al portero...');

    // ENVIAR TODO EN UN SOLO PAQUETE AL SERVIDOR
    pushMatchEvent(activeMatchCode, {
      type: 'SHOT_COMMITTED',
      playerId: currentUser.uid,
      round: currentGameState.currentRound,
      payload: {
        x: strikerLocalX,
        y: strikerLocalY,
        power: strikerLocalPower,
        auto: false,
        barStartTs: now,
      },
      clientTs: Date.now(),
    });
  }
}

function updateStrikerUI() {
  if (strikerStep === 'x') {
    strikerStepTitle.innerHTML = '<span class="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span><span>Paso 1 de 3: Dirección Horizontal (X)</span>';
    btnStrikerActionText.textContent = 'Fijar Dirección Horizontal';
    barRowX.className = 'flex flex-col gap-1 opacity-100';
    barRowY.className = 'flex flex-col gap-1 opacity-40';
    barRowPower.className = 'flex flex-col gap-1 opacity-40';
    barStatusX.textContent = 'Moviéndose';
    barStatusY.textContent = 'Pendiente';
    barStatusPower.textContent = 'Pendiente';
  } else if (strikerStep === 'y') {
    strikerStepTitle.innerHTML = '<span class="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span><span>Paso 2 de 3: Altura del Tiro (Y)</span>';
    btnStrikerActionText.textContent = 'Fijar Altura';
    barRowX.className = 'flex flex-col gap-1 opacity-80';
    barRowY.className = 'flex flex-col gap-1 opacity-100';
    barRowPower.className = 'flex flex-col gap-1 opacity-40';
    barStatusX.textContent = `Fijado: ${strikerLocalX < 0 || strikerLocalX > 1 ? '¡Fuera!' : 'Dentro'}`;
    barStatusX.className = 'text-emerald-400 font-bold';
    barStatusY.textContent = 'Moviéndose';
  } else if (strikerStep === 'power') {
    strikerStepTitle.innerHTML = '<span class="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span><span>Paso 3 de 3: Potencia del Chut</span>';
    btnStrikerActionText.textContent = 'Fijar Potencia y Disparar';
    barRowX.className = 'flex flex-col gap-1 opacity-60';
    barRowY.className = 'flex flex-col gap-1 opacity-80';
    barRowPower.className = 'flex flex-col gap-1 opacity-100';
    barStatusY.textContent = `Fijado: ${strikerLocalY < 0 || strikerLocalY > 1 ? '¡Fuera!' : 'Dentro'}`;
    barStatusY.className = 'text-emerald-400 font-bold';
    barStatusPower.textContent = 'Moviéndose';
  }
}

function toBarPercent(val) {
  const p = ((val - DIRECTION_RANGE.min) / (DIRECTION_RANGE.max - DIRECTION_RANGE.min)) * 100;
  return Math.max(0, Math.min(100, p));
}

function hideStrikerControls() {
  strikerControls.classList.add('hidden');
  if (strikerRafId) cancelAnimationFrame(strikerRafId);
}

function hideAllActionControls() {
  hideStrikerControls();
  hideKeeperControls();
}

function showStatusBanner(text) {
  statusBannerText.textContent = text;
  statusBanner.classList.remove('hidden');
}

// ----------------------------------------------------
// PANTALLA FINAL Y REPETICIONES
// ----------------------------------------------------

function showGameOverModal(state) {
  const hostUid = state.host.uid;
  const guestUid = state.guest ? state.guest.uid : '';
  const winnerUid = state.winnerUid;

  const isWinner = currentUser && winnerUid === currentUser.uid;
  const isDraw = !winnerUid;

  const winnerName =
    winnerUid === hostUid
      ? state.host.name
      : winnerUid === guestUid
      ? state.guest?.name
      : 'Empate';

  gameOverTitle.textContent = isWinner
    ? '¡Victoria Incontestable!'
    : isDraw
    ? '¡Fin del Partido!'
    : '¡Fin de la Tanda!';

  gameOverSubtitle.textContent = isWinner
    ? '¡Has ganado el duelo de penaltis!'
    : `El ganador ha sido ${winnerName}`;

  finalHostName.textContent = state.host.name;
  finalHostScore.textContent = state.scores[hostUid] || 0;
  finalGuestName.textContent = state.guest ? state.guest.name : 'Invitado';
  finalGuestScore.textContent = guestUid ? state.scores[guestUid] || 0 : 0;

  finalHistoryList.innerHTML = '';
  state.history.forEach((h) => {
    const row = document.createElement('div');
    row.className = 'flex items-center justify-between text-xs px-2.5 py-1 rounded-lg bg-slate-900/60';
    const striker = h.strikerUid === hostUid ? state.host.name : state.guest?.name || 'Invitado';
    row.innerHTML = `
      <span class="font-semibold text-slate-400">Ronda ${h.round}</span>
      <span class="text-slate-300">Chuta ${striker}</span>
      <span class="font-bold ${h.result === 'GOL' ? 'text-emerald-400' : 'text-rose-400'}">${h.result}</span>
    `;
    finalHistoryList.appendChild(row);
  });

  gameOverModal.classList.remove('hidden');

  if (winnerUid) {
    confetti({ particleCount: 80, spread: 80, origin: { y: 0.6 } });
  }
}

function openReplayModal() {
  if (!currentGameState || currentGameState.history.length === 0) return;

  replayModal.classList.remove('hidden');
  replayRoundsContainer.innerHTML = '';

  const history = currentGameState.history;
  const lastRound = history[history.length - 1];

  history.forEach((rec) => {
    const btn = document.createElement('button');
    btn.className =
      'px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ' +
      (rec.round === lastRound.round
        ? 'bg-amber-400 text-slate-950 shadow-md shadow-amber-400/40'
        : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white');
    btn.innerHTML = `<span>R${rec.round}</span> <span>${rec.result === 'GOL' ? '✓' : '✗'}</span>`;
    btn.addEventListener('click', () => {
      document.querySelectorAll('#replayRoundsContainer button').forEach((b) => {
        b.className = 'px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white';
      });
      btn.className = 'px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer bg-amber-400 text-slate-950 shadow-md shadow-amber-400/40';
      startReplayRecord(rec);
    });
    replayRoundsContainer.appendChild(btn);
  });

  startReplayRecord(lastRound);
}

function startReplayRecord(record) {
  if (activeReplayController) activeReplayController.stop();

  replayInfoText.textContent = `Ronda ${record.round}: ${record.result}`;
  replayResultBadge.textContent = record.result;
  replayResultBadge.className =
    'font-black uppercase tracking-wider text-xs px-2 py-0.5 rounded ' +
    (record.result === 'GOL'
      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
      : 'bg-rose-500/20 text-rose-300 border border-rose-500/40');

  activeReplayController = new ReplayController(
    record,
    renderer,
    (state) => {
      btnReplayPlayPause.textContent = state.isPlaying ? '⏸' : '▶';
    },
    () => {
      btnReplayPlayPause.textContent = '▶';
    }
  );

  btnReplayPlayPause.onclick = () => {
    if (activeReplayController.isPlaying) activeReplayController.pause();
    else activeReplayController.resume();
  };

  btnReplayRestart.onclick = () => {
    activeReplayController.start();
  };

  speedButtons.forEach((btn) => {
    btn.onclick = () => {
      speedButtons.forEach((b) => (b.className = 'btn-replay-spd px-2.5 py-1 rounded-lg text-xs font-bold text-slate-400 hover:text-white cursor-pointer'));
      btn.className = 'btn-replay-spd px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-400 text-slate-950 cursor-pointer';
      activeReplayController.setSpeed(parseFloat(btn.dataset.speed || '1'));
    };
  });

  activeReplayController.start();
}

function closeReplayModal() {
  if (activeReplayController) {
    activeReplayController.stop();
    activeReplayController = null;
  }
  replayModal.classList.add('hidden');
  renderer.resetToIdle();
}

// Arrancar la aplicación
initApp();
