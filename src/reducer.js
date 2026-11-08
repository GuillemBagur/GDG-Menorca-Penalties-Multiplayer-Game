import { DEFAULT_TOTAL_PENALTIES } from './config.js';

export const INITIAL_STATE = {
  code: '',
  status: 'waiting',
  host: { uid: '', name: 'Anfitrión' },
  guest: null,
  currentRound: 1,
  currentStrikerUid: null,
  currentKeeperUid: null,
  roundStartedTs: 0,
  currentShotX: null,
  currentShotY: null,
  currentShotPower: null,
  shotIsAuto: false,
  currentKeeperTarget: null,
  keeperIsAuto: false,
  scores: {},
  attempts: {},
  history: [],
  roundHistoryByPlayer: {},
  currentResolution: null,
  winnerUid: null,
  isSuddenDeath: false,
};

/**
 * Reducer puro que reconstruye el estado del partido a partir de la lista de eventos.
 */
export function reduceMatchState(events = [], matchMeta = {}) {
  let state = {
    ...INITIAL_STATE,
    code: matchMeta.code || '',
    host: {
      uid: matchMeta.hostUid || '',
      name: matchMeta.hostName || 'Anfitrión',
    },
    guest: matchMeta.guestUid
      ? {
          uid: matchMeta.guestUid,
          name: matchMeta.guestName || 'Invitado',
          isAnonymous: !!matchMeta.guestIsAnonymous,
        }
      : null,
    status: matchMeta.status || 'waiting',
    scores: {
      [matchMeta.hostUid || 'host']: 0,
      ...(matchMeta.guestUid ? { [matchMeta.guestUid]: 0 } : {}),
    },
    attempts: {
      [matchMeta.hostUid || 'host']: 0,
      ...(matchMeta.guestUid ? { [matchMeta.guestUid]: 0 } : {}),
    },
    roundHistoryByPlayer: {
      [matchMeta.hostUid || 'host']: [],
      ...(matchMeta.guestUid ? { [matchMeta.guestUid]: [] } : {}),
    },
  };

  const sortedEvents = [...events].sort((a, b) => a.seq - b.seq);
  for (const event of sortedEvents) {
    state = applyEvent(state, event);
  }

  return state;
}

function applyEvent(state, event) {
  switch (event.type) {
    case 'MATCH_CREATED': {
      const { code, hostUid, hostName } = event.payload || {};
      return {
        ...state,
        code: code || state.code,
        status: 'waiting',
        host: {
          uid: hostUid || event.playerId,
          name: hostName || state.host.name || 'Anfitrión',
        },
        scores: { ...state.scores, [event.playerId]: 0 },
        attempts: { ...state.attempts, [event.playerId]: 0 },
        roundHistoryByPlayer: { ...state.roundHistoryByPlayer, [event.playerId]: [] },
      };
    }

    case 'PLAYER_JOINED': {
      const { name, isAnonymous } = event.payload || {};
      const guestUid = event.playerId;
      const hostUid = state.host.uid;

      return {
        ...state,
        status: 'playing',
        guest: {
          uid: guestUid,
          name: name || 'Invitado',
          isAnonymous: !!isAnonymous,
        },
        currentRound: 1,
        currentStrikerUid: hostUid,
        currentKeeperUid: guestUid,
        roundStartedTs: event.clientTs || Date.now(),
        scores: {
          ...state.scores,
          [hostUid]: state.scores[hostUid] || 0,
          [guestUid]: 0,
        },
        attempts: {
          ...state.attempts,
          [hostUid]: state.attempts[hostUid] || 0,
          [guestUid]: 0,
        },
        roundHistoryByPlayer: {
          ...state.roundHistoryByPlayer,
          [hostUid]: state.roundHistoryByPlayer[hostUid] || [],
          [guestUid]: [],
        },
      };
    }

    case 'ROUND_STARTED': {
      const { strikerUid, keeperUid, startedAt } = event.payload || {};
      return {
        ...state,
        currentRound: event.round,
        currentStrikerUid: strikerUid || state.currentStrikerUid,
        currentKeeperUid: keeperUid || state.currentKeeperUid,
        roundStartedTs: startedAt || event.clientTs || Date.now(),
        currentShotX: null,
        currentShotY: null,
        currentShotPower: null,
        shotIsAuto: false,
        currentKeeperTarget: null,
        keeperIsAuto: false,
        currentResolution: null,
      };
    }

    case 'SHOT_COMMITTED': {
      if (event.round !== state.currentRound) return state;
      return {
        ...state,
        currentShotX: event.payload.x,
        currentShotY: event.payload.y,
        currentShotPower: event.payload.power,
        shotIsAuto: !!event.payload.auto,
      };
    }

    case 'SHOT_POWER_LOCKED': {
      if (event.round !== state.currentRound) return state;
      return {
        ...state,
        currentShotPower: event.payload.power,
        shotIsAuto: !!event.payload.auto,
      };
    }

    case 'KEEPER_TARGET_SET': {
      if (event.round !== state.currentRound) return state;
      return {
        ...state,
        currentKeeperTarget: {
          x: event.payload.x,
          y: event.payload.y,
        },
        keeperIsAuto: !!event.payload.auto,
      };
    }

    case 'ROUND_RESOLVED': {
      const res = event.payload;
      const strikerUid = state.currentStrikerUid || state.host.uid;
      const keeperUid = state.currentKeeperUid || (state.guest ? state.guest.uid : '');

      const isGoal = res.result === 'GOL';
      const newScores = {
        ...state.scores,
        [strikerUid]: (state.scores[strikerUid] || 0) + (isGoal ? 1 : 0),
      };
      const newAttempts = {
        ...state.attempts,
        [strikerUid]: (state.attempts[strikerUid] || 0) + 1,
      };
      const newPlayerHistory = {
        ...state.roundHistoryByPlayer,
        [strikerUid]: [...(state.roundHistoryByPlayer[strikerUid] || []), res.result],
      };

      const newRecord = {
        round: event.round,
        strikerUid,
        keeperUid,
        shotX: res.shot.x,
        shotY: res.shot.y,
        shotPower: res.shot.power,
        shotAuto: !!res.shot.auto,
        keeperX: res.keeper.x,
        keeperY: res.keeper.y,
        keeperAuto: !!res.keeper.auto,
        result: res.result,
        keeperRadius_m: res.radius,
        resolvedAt: event.clientTs || Date.now(),
      };

      const suddenDeath = event.round > DEFAULT_TOTAL_PENALTIES * 2;

      return {
        ...state,
        currentResolution: res,
        currentShotX: res.shot.x,
        currentShotY: res.shot.y,
        currentShotPower: res.shot.power,
        shotIsAuto: !!res.shot.auto,
        currentKeeperTarget: { x: res.keeper.x, y: res.keeper.y },
        keeperIsAuto: !!res.keeper.auto,
        scores: newScores,
        attempts: newAttempts,
        roundHistoryByPlayer: newPlayerHistory,
        history: [...state.history, newRecord],
        isSuddenDeath: suddenDeath,
      };
    }

    case 'MATCH_ENDED': {
      const { winnerUid } = event.payload || {};
      return {
        ...state,
        status: 'finished',
        winnerUid: winnerUid || null,
      };
    }

    default:
      return state;
  }
}

/**
 * Comprueba si el partido ha finalizado o debe continuar (incluyendo muerte súbita)
 */
export function checkMatchStatus(state, totalPenalties = DEFAULT_TOTAL_PENALTIES) {
  const hostUid = state.host.uid;
  const guestUid = state.guest ? state.guest.uid : null;

  if (!hostUid || !guestUid) {
    return { finished: false, winnerUid: null, suddenDeath: false };
  }

  const hostScore = state.scores[hostUid] || 0;
  const guestScore = state.scores[guestUid] || 0;
  const hostAttempts = state.attempts[hostUid] || 0;
  const guestAttempts = state.attempts[guestUid] || 0;

  // Fase regular
  if (hostAttempts <= totalPenalties && guestAttempts <= totalPenalties) {
    const hostRemaining = totalPenalties - hostAttempts;
    const guestRemaining = totalPenalties - guestAttempts;

    if (hostScore > guestScore + guestRemaining) {
      return { finished: true, winnerUid: hostUid, suddenDeath: false };
    }
    if (guestScore > hostScore + hostRemaining) {
      return { finished: true, winnerUid: guestUid, suddenDeath: false };
    }

    if (hostAttempts === totalPenalties && guestAttempts === totalPenalties) {
      if (hostScore > guestScore) {
        return { finished: true, winnerUid: hostUid, suddenDeath: false };
      }
      if (guestScore > hostScore) {
        return { finished: true, winnerUid: guestUid, suddenDeath: false };
      }
      return { finished: false, winnerUid: null, suddenDeath: true };
    }

    return { finished: false, winnerUid: null, suddenDeath: false };
  }

  // Muerte súbita
  if (hostAttempts === guestAttempts && hostAttempts > totalPenalties) {
    if (hostScore > guestScore) {
      return { finished: true, winnerUid: hostUid, suddenDeath: true };
    }
    if (guestScore > hostScore) {
      return { finished: true, winnerUid: guestUid, suddenDeath: true };
    }
  }

  return { finished: false, winnerUid: null, suddenDeath: true };
}

/**
 * Alterna roles: impar chuta Anfitrión, par chuta Invitado
 */
export function getRolesForRound(round, hostUid, guestUid) {
  if (round % 2 === 1) {
    return { strikerUid: hostUid, keeperUid: guestUid };
  } else {
    return { strikerUid: guestUid, keeperUid: hostUid };
  }
}
