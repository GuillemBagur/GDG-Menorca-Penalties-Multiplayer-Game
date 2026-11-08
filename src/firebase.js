/**
 * Servicio de Firebase en Vanilla JS con suscripción onSnapshot única por partida
 */

import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  getAuth,
  linkWithPopup,
  onAuthStateChanged,
  signInAnonymously,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { CODE_CHARSET, DEFAULT_TOTAL_PENALTIES, TIME_LIMIT_SEC } from './config.js';
import { resolveShot } from './math.js';
import { checkMatchStatus, getRolesForRound, reduceMatchState } from './reducer.js';

// Inicialización de Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// Test de conectividad
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error && error.message && error.message.includes('the client is offline')) {
      console.warn('Firebase: verificar conectividad offline/online.');
    }
  }
}
testConnection();

export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}

export const onAuth = onAuthChange;

export function getCurrentUser() {
  return auth.currentUser;
}

export function subscribeToMatchSession(code, callbacks) {
  return startMatchSession(code, auth.currentUser, callbacks);
}

export async function loginWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const cred = await signInWithPopup(auth, provider);
  const user = cred.user;

  try {
    await setDoc(
      doc(db, 'users', user.uid),
      {
        displayName: user.displayName || 'Jugador',
        photoURL: user.photoURL || '',
        createdAt: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (err) {
    console.warn('Error al actualizar perfil de usuario:', err);
  }

  return user;
}

export async function loginAsGuest(nickname) {
  try {
    let user = auth.currentUser;
    if (!user) {
      const cred = await signInAnonymously(auth);
      user = cred.user;
    }
    localStorage.setItem('duel_guest_nickname', nickname);
    return user;
  } catch (error) {
    console.error('Error al iniciar sesión como invitado:', error);
    if (
      error &&
      (error.code === 'auth/admin-restricted-operation' ||
        (error.message && error.message.includes('admin-restricted-operation')))
    ) {
      throw new Error(
        'El acceso anónimo no está activado en tu consola de Firebase. Entra con tu cuenta de Google o activa "Anónimo" en Firebase Console > Authentication > Sign-in method.'
      );
    }
    throw error;
  }
}

export async function linkAnonymousGuestWithGoogle() {
  if (!auth.currentUser) return loginWithGoogle();
  if (!auth.currentUser.isAnonymous) return auth.currentUser;

  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const cred = await linkWithPopup(auth.currentUser, provider);
  return cred.user;
}

export async function logout() {
  await signOut(auth);
}

export function generateMatchCode() {
  let code = '';
  for (let i = 0; i < 6; i++) {
    const idx = Math.floor(Math.random() * CODE_CHARSET.length);
    code += CODE_CHARSET[idx];
  }
  return code;
}

export async function createMatch(
  hostUser,
  config = { totalPenalties: DEFAULT_TOTAL_PENALTIES, timeLimitSec: TIME_LIMIT_SEC }
) {
  let attempts = 0;
  while (attempts < 5) {
    attempts++;
    const code = generateMatchCode();
    const matchRef = doc(db, 'matches', code);

    const existing = await getDoc(matchRef);
    if (existing.exists()) continue;

    const matchData = {
      code,
      hostUid: hostUser.uid,
      hostName: hostUser.displayName || 'Anfitrión',
      guestUid: null,
      guestName: null,
      guestIsAnonymous: false,
      status: 'waiting',
      createdAt: new Date().toISOString(),
      config,
    };

    await setDoc(matchRef, matchData);

    // Evento inicial MATCH_CREATED
    const firstEventRef = doc(db, 'matches', code, 'events', '000001');
    await setDoc(firstEventRef, {
      seq: 1,
      type: 'MATCH_CREATED',
      playerId: hostUser.uid,
      round: 1,
      payload: {
        code,
        hostUid: hostUser.uid,
        hostName: hostUser.displayName || 'Anfitrión',
      },
      clientTs: Date.now(),
      serverTs: serverTimestamp(),
    });

    return code;
  }
  throw new Error('No se pudo generar un código único.');
}

export async function joinMatch(code, guestUser, isAnonymous, guestName) {
  const matchRef = doc(db, 'matches', code);
  let updatedMatch = null;

  await runTransaction(db, async (transaction) => {
    const matchSnap = await transaction.get(matchRef);
    if (!matchSnap.exists()) {
      throw new Error('Código de partida inexistente. Comprueba el código.');
    }

    const data = matchSnap.data();
    if (data.status === 'finished') {
      throw new Error('Esta partida ya ha terminado.');
    }

    if (data.guestUid === guestUser.uid || data.hostUid === guestUser.uid) {
      updatedMatch = data;
      return;
    }

    if (data.guestUid && data.guestUid !== guestUser.uid) {
      throw new Error('La partida ya está completa (dos jugadores).');
    }

    const displayName = guestName || guestUser.displayName || 'Invitado';
    transaction.update(matchRef, {
      guestUid: guestUser.uid,
      guestName: displayName,
      guestIsAnonymous: isAnonymous,
      status: 'playing',
    });

    updatedMatch = {
      ...data,
      guestUid: guestUser.uid,
      guestName: displayName,
      guestIsAnonymous: isAnonymous,
      status: 'playing',
    };
  });

  if (updatedMatch && updatedMatch.guestUid === guestUser.uid) {
    try {
      await pushMatchEvent(code, {
        type: 'PLAYER_JOINED',
        playerId: guestUser.uid,
        round: 1,
        payload: {
          name: updatedMatch.guestName,
          isAnonymous,
        },
        clientTs: Date.now(),
      });
    } catch (e) {
      console.warn('Error al emitir PLAYER_JOINED:', e);
    }
  }

  return updatedMatch;
}

export async function pushMatchEvent(code, event) {
  for (let i = 0; i < 5; i++) {
    try {
      let candidate = 1;
      let foundSlot = false;

      while (!foundSlot && candidate < 500) {
        const docId = String(candidate).padStart(6, '0');
        const candidateRef = doc(db, 'matches', code, 'events', docId);
        const candidateSnap = await getDoc(candidateRef);

        if (!candidateSnap.exists()) {
          await setDoc(candidateRef, {
            ...event,
            seq: candidate,
            serverTs: serverTimestamp(),
          });
          foundSlot = true;
          return candidate;
        }
        candidate++;
      }
    } catch (err) {
      if (i === 4) throw err;
      await new Promise((r) => setTimeout(r, 60 * (i + 1)));
    }
  }
}

export async function markMatchFinished(code, winnerUid) {
  const matchRef = doc(db, 'matches', code);
  try {
    await runTransaction(db, async (t) => {
      const snap = await t.get(matchRef);
      if (snap.exists() && snap.data().status !== 'finished') {
        t.update(matchRef, { status: 'finished' });
      }
    });

    await pushMatchEvent(code, {
      type: 'MATCH_ENDED',
      playerId: auth.currentUser ? auth.currentUser.uid : 'system',
      round: 99,
      payload: { winnerUid },
      clientTs: Date.now(),
    });
  } catch (err) {
    console.error('Error al finalizar partida:', err);
  }
}

/**
 * SUSCRIPCIÓN ÚNICA DE PARTIDA (onSnapshot registrado una sola vez al entrar)
 * Se cancela únicamente al salir de la partida.
 * Espera a recibir el par (evento de chut + evento de parada) para resolver.
 */
export function startMatchSession(code, currentUser, callbacks) {
  let isResolving = false;
  let lastResolvedRound = 0;
  let currentEvents = [];
  let matchMetadata = null;

  const matchRef = doc(db, 'matches', code);
  const eventsCol = collection(db, 'matches', code, 'events');
  const eventsQuery = query(eventsCol, orderBy('seq', 'asc'));

  // 1. Listener único de metadatos de partida
  const unsubMatch = onSnapshot(
    matchRef,
    (snap) => {
      if (snap.exists()) {
        matchMetadata = snap.data();
        const state = reduceMatchState(currentEvents, matchMetadata);
        if (callbacks.onStateUpdate) {
          callbacks.onStateUpdate(state, currentEvents);
        }
      }
    },
    (err) => {
      if (callbacks.onError) callbacks.onError(err);
    }
  );

  // 2. Listener único de eventos: se registra UNA SOLA VEZ y nunca se recrea entre rondas
  const unsubEvents = onSnapshot(
    eventsQuery,
    (snap) => {
      const events = [];
      snap.forEach((docSnap) => {
        events.push(docSnap.data());
      });
      currentEvents = events;

      const state = reduceMatchState(events, matchMetadata || { code });
      const currentRound = state.currentRound;
      const isHost = currentUser && currentUser.uid === state.host.uid;

      if (callbacks.onStateUpdate) {
        callbacks.onStateUpdate(state, events);
      }

      // Si la partida está jugando, el anfitrión se asegura de iniciar la ronda 1
      if (isHost && state.status === 'playing' && state.guest && state.guest.uid) {
        const hasRoundStarted = events.some(
          (e) => e.type === 'ROUND_STARTED' && e.round === currentRound
        );
        if (!hasRoundStarted) {
          const roles = getRolesForRound(currentRound, state.host.uid, state.guest.uid);
          pushMatchEvent(code, {
            type: 'ROUND_STARTED',
            playerId: currentUser.uid,
            round: currentRound,
            payload: {
              strikerUid: roles.strikerUid,
              keeperUid: roles.keeperUid,
              startedAt: Date.now(),
            },
            clientTs: Date.now(),
          });
        }
      }

      // Comprobar si ya existe ROUND_RESOLVED para esta ronda
      const resolvedEvt = events.find(
        (e) => e.type === 'ROUND_RESOLVED' && e.round === currentRound
      );

      // Si ha llegado ROUND_RESOLVED y aún no se ha ejecutado en este cliente
      if (resolvedEvt && lastResolvedRound !== currentRound) {
        lastResolvedRound = currentRound;
        if (callbacks.onRoundResolved) {
          callbacks.onRoundResolved(resolvedEvt.payload, currentRound);
        }
      }

      // LÓGICA DE ESPERA DEL PAR (CHUT + PARADA):
      // El anfitrión espera a recibir un evento de chut y uno de parada para resolver
      if (isHost && state.status === 'playing' && !resolvedEvt && !isResolving) {
        const shotEvt = events.find(
          (e) =>
            (e.type === 'SHOT_COMMITTED' || e.type === 'SHOT_POWER_LOCKED') &&
            e.round === currentRound
        );
        const keeperEvt = events.find(
          (e) => e.type === 'KEEPER_TARGET_SET' && e.round === currentRound
        );

        // Si ambos ya han decidido, se ejecuta la resolución
        if (shotEvt && keeperEvt) {
          isResolving = true;

          const shot = {
            x: shotEvt.payload.x,
            y: shotEvt.payload.y,
            power: shotEvt.payload.power,
            auto: shotEvt.payload.auto,
          };
          const keeper = {
            x: keeperEvt.payload.x,
            y: keeperEvt.payload.y,
            auto: keeperEvt.payload.auto,
          };

          const resolution = resolveShot(shot, keeper);
          const resolvedPayload = {
            result: resolution.result,
            shot,
            keeper,
            radius: resolution.radius_m,
            distance_m: resolution.distance_m,
          };

          // Emitir ROUND_RESOLVED
          pushMatchEvent(code, {
            type: 'ROUND_RESOLVED',
            playerId: currentUser.uid,
            round: currentRound,
            payload: resolvedPayload,
            clientTs: Date.now(),
          }).then(() => {
            // Dar tiempo a la animación (duración tiro + 3s hold)
            setTimeout(async () => {
              isResolving = false;

              const updatedState = reduceMatchState(
                [
                  ...currentEvents,
                  {
                    seq: 9999,
                    type: 'ROUND_RESOLVED',
                    playerId: currentUser.uid,
                    round: currentRound,
                    payload: resolvedPayload,
                    clientTs: Date.now(),
                  },
                ],
                matchMetadata || { code }
              );

              const statusCheck = checkMatchStatus(updatedState);
              if (statusCheck.finished) {
                await markMatchFinished(code, statusCheck.winnerUid);
              } else {
                const nextRound = currentRound + 1;
                const roles = getRolesForRound(
                  nextRound,
                  state.host.uid,
                  state.guest.uid
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
              }
            }, 4200);
          });
        }
      }
    },
    (err) => {
      if (callbacks.onError) callbacks.onError(err);
    }
  );

  // Red de seguridad de tiempo para el Anfitrión (si han pasado más de 11.5s y falta alguien por decidir)
  const hostTimeoutInterval = setInterval(() => {
    if (!currentUser || !matchMetadata) return;
    const state = reduceMatchState(currentEvents, matchMetadata);
    const isHost = currentUser.uid === state.host.uid;

    if (!isHost || state.status !== 'playing' || !state.roundStartedTs) return;

    const round = state.currentRound;
    const elapsed = (Date.now() - state.roundStartedTs) / 1000;

    if (elapsed > 11.5 && !isResolving) {
      const hasResolved = currentEvents.some(
        (e) => e.type === 'ROUND_RESOLVED' && e.round === round
      );
      if (hasResolved) return;

      const hasShot = currentEvents.some(
        (e) =>
          (e.type === 'SHOT_COMMITTED' || e.type === 'SHOT_POWER_LOCKED') &&
          e.round === round
      );
      const hasKeeper = currentEvents.some(
        (e) => e.type === 'KEEPER_TARGET_SET' && e.round === round
      );

      if (!hasShot && state.currentStrikerUid) {
        pushMatchEvent(code, {
          type: 'SHOT_COMMITTED',
          playerId: state.currentStrikerUid,
          round,
          payload: {
            x: 0.2 + Math.random() * 0.6,
            y: 0.2 + Math.random() * 0.6,
            power: 0.5 + Math.random() * 0.3,
            auto: true,
          },
          clientTs: Date.now(),
        });
      }

      if (!hasKeeper && state.currentKeeperUid) {
        pushMatchEvent(code, {
          type: 'KEEPER_TARGET_SET',
          playerId: state.currentKeeperUid,
          round,
          payload: {
            x: 0.2 + Math.random() * 0.6,
            y: 0.2 + Math.random() * 0.6,
            auto: true,
          },
          clientTs: Date.now(),
        });
      }
    }
  }, 1000);

  // Función de cancelación única: solo se ejecuta al salir de la partida
  return function stopSession() {
    clearInterval(hostTimeoutInterval);
    unsubMatch();
    unsubEvents();
  };
}
