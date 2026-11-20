export const WIDTH = 640;
export const HEIGHT = 400;

const POINTS = {
  yellow: 50,
  orange: 100,
  red: 150,
  white: 450,
};

function computePoints(base, combo) {
  return Math.round(base * (1 + combo * 0.1));
}

export function newGame() {
  return {
    mode: 'solo',
    angle: 0,
    targetCenter: -Math.PI * 0.75,

    targetWidth: 0.96,
    yellowWidth: 0.32,
    orangeWidth: 0.32,
    redWidth: 0.32,

    speed: Math.PI * 0.7,
    speedMode: 'gradual',
    randomMinSpeed: Math.PI * 1.25,
    randomMaxSpeed: Math.PI * 2.20,

    score: 0,
    combo: 0,
    maxCombo: 0,
    yellowHits: 0,
    orangeHits: 0,
    redHits: 0,
    whiteHits: 0,

    lives: 3,

    lastHit: null,
    hitPressed: false,

    feedbackColor: null,
    feedbackRemaining: 0,
    badgeExpandRemaining: 0,
    hitOverlayColor: null,
    hitOverlayUntil: 0,

    zoneTransitionPending: false,
    zoneTransitionUntil: 0,
    pendingTargetCenter: null,
    missMarkerAngle: null,
    redStreak: 0,
    orangeStreak: 0,
    zoneMode: 'colors',
    whiteLocked: true,
    whiteWidth: 0.15,
    zoneMoveLoop: -1,
    completedLoops: 0,
    zoneMovedThisLoop: false,
    validHitThisLoop: false,
    status: 'playing',
  };
}

function moveZoneGroup(previousCenter, indicatorAngle, random = Math.random) {
  const fullTurn = Math.PI * 2;
  const indicator = indicatorAngle % fullTurn;
  const safetyMargin = Math.PI / 3;
  const groupWidth = 0.96;
  // -Math.PI * 1.35 (~4h30 en bas à droite) -> -Math.PI (6h) -> -groupWidth (12h)
  const safeMin = -Math.PI * 1.35;
  const safeMax = -groupWidth;
  let next = safeMin + random() * (safeMax - safeMin);

  for (let attempt = 0; attempt < 16; attempt++) {
    const signedDistance = ((next - indicator + Math.PI) % fullTurn + fullTurn) % fullTurn - Math.PI;
    if (Math.abs(signedDistance) >= safetyMargin) {
      if (Math.abs(next - previousCenter) >= 0.25) return next;
      next = safeMin + (((attempt + 1) / 16) * (safeMax - safeMin));
    } else {
      next = safeMin + (((attempt + 1) / 16) * (safeMax - safeMin));
    }
  }

  return -Math.PI * 0.75;
}

function forwardZoneDistance(angle, targetCenter) {
  const fullTurn = Math.PI * 2;
  return (angle - targetCenter + fullTurn) % fullTurn;
}

function scheduleZoneTransition(state, nextTargetCenter) {
  if (state.zoneTransitionPending) return;
  state.zoneTransitionPending = true;
  state.pendingTargetCenter = nextTargetCenter;
  state.zoneTransitionUntil = 100;
}

export function applySuccessSpeed(state, random = Math.random) {
  if (state.speedMode === 'random') {
    return state.randomMinSpeed + random() * (state.randomMaxSpeed - state.randomMinSpeed);
  }
  return state.speed * 1.04;
}

// Pure function: the same state, input and dt produce the same next state.
export function advance(previous, input, seconds, random = Math.random, options = {}) {
  const {penalizeMissAndSkip = true} = options;
  const dt = Math.max(0, Math.min(seconds, 0.05));
  const state = {
    ...previous,
    feedbackRemaining: previous.feedbackColor === 'yellow'
      ? Math.max(0, (previous.feedbackRemaining || 0) - dt)
      : 0,
    badgeExpandRemaining: Math.max(0, (previous.badgeExpandRemaining || 0) - dt),
  };
  if (previous.feedbackColor === 'yellow' && state.feedbackRemaining === 0) {
    state.feedbackColor = null;
  }

  if (previous.status !== 'playing') return previous;

  const nextAngle = previous.angle + previous.speed * dt;
  const previousLoop = Math.floor(previous.angle / (Math.PI * 2));
  const nextLoop = Math.floor(nextAngle / (Math.PI * 2));
  const crossedLoop = nextLoop > previousLoop;
  const previousLoopHadValidHit = previous.validHitThisLoop;

  if (crossedLoop) {
    state.completedLoops += nextLoop - previousLoop;
    state.zoneMovedThisLoop = false;
    state.validHitThisLoop = false;
    state.whiteLocked = true;
    state.missMarkerAngle = null;

    if (penalizeMissAndSkip && !previousLoopHadValidHit) {
      state.combo = 0;
      state.redStreak = 0;
      state.orangeStreak = 0;
    }

    // En solo comme en 1v1 : si un tour passe sans toucher la zone blanche, elle disparaît
    if (state.zoneMode === 'white' && !previousLoopHadValidHit) {
      state.zoneMode = 'colors';
      state.redStreak = 0;
      state.orangeStreak = 0;
      state.targetCenter = moveZoneGroup(previous.targetCenter, state.angle, random);
      state.zoneMovedThisLoop = true;
    }
  }
  state.angle = nextAngle;
  let zoneMoved = false;

  if (!input.hit) {
    state.hitPressed = false;
  } else if (!previous.hitPressed) {
    state.hitPressed = true;
    state.missMarkerAngle = null;
    const zoneAngle = forwardZoneDistance(state.angle % (Math.PI * 2), state.targetCenter);

    if (state.zoneMode === 'white') {
      if (zoneAngle <= state.whiteWidth) {
        state.lastHit = 'white';
        state.feedbackColor = 'white';
        state.feedbackRemaining = 0.5;
        state.badgeExpandRemaining = 1.0;
        state.hitOverlayColor = 'white';
        state.hitOverlayUntil = 50;
        state.whiteHits += 1;
        state.score += computePoints(POINTS.white, state.combo);
        state.combo += 1;
        state.maxCombo = Math.max(state.maxCombo || 0, state.combo);
        state.zoneMode = 'colors';
        state.redStreak = 0;
        state.orangeStreak = 0;
        state.speed = applySuccessSpeed(state, random);
        state.validHitThisLoop = true;
        if (!state.zoneMovedThisLoop) {
          scheduleZoneTransition(state, moveZoneGroup(previous.targetCenter, state.angle, random));
          state.zoneMovedThisLoop = true;
        }
      } else {
        // Raté sur la zone blanche : elle disparaît immédiatement (solo et 1v1)
        state.lastHit = 'miss';
        state.feedbackColor = null;
        state.badgeExpandRemaining = 0;
        state.zoneMode = 'colors';
        state.whiteLocked = true;
        state.redStreak = 0;
        state.orangeStreak = 0;
        state.missMarkerAngle = state.angle % (Math.PI * 2);
        state.validHitThisLoop = false;
        state.hitOverlayColor = null;
        state.hitOverlayUntil = 0;
        if (penalizeMissAndSkip) {
          state.combo = 0;
          state.lives -= 1;
          if (state.lives === 0) state.status = 'lost';
        }
      }
    } else {
      if (zoneAngle <= state.redWidth) {
        state.lastHit = 'red';
        state.feedbackColor = 'red';
        state.feedbackRemaining = 0;
        state.badgeExpandRemaining = 1.0;
        state.hitOverlayColor = 'white';
        state.hitOverlayUntil = 50;
        state.redStreak = Math.min(3, state.redStreak + 1);
        state.orangeStreak = 0;
        if (state.redStreak === 3) {
          state.zoneMode = 'white';
          state.whiteLocked = false;
        }
        state.redHits += 1;
        state.score += computePoints(POINTS.red, state.combo);
        state.combo += 1;
        state.maxCombo = Math.max(state.maxCombo || 0, state.combo);
        state.speed = applySuccessSpeed(state, random);
        state.validHitThisLoop = true;
        if (!zoneMoved && !state.zoneMovedThisLoop) {
          zoneMoved = true;
          scheduleZoneTransition(state, moveZoneGroup(previous.targetCenter, nextAngle, random));
          state.zoneMoveLoop = previousLoop;
          state.zoneMovedThisLoop = true;
        }
      } else if (zoneAngle <= state.redWidth + state.orangeWidth) {
        state.lastHit = 'orange';
        state.feedbackColor = 'orange';
        state.feedbackRemaining = 0;
        state.badgeExpandRemaining = 1.0;
        state.hitOverlayColor = 'white';
        state.hitOverlayUntil = 50;
        state.orangeStreak = Math.min(5, state.orangeStreak + 1);
        state.redStreak = 0;
        if (state.orangeStreak === 5) {
          state.zoneMode = 'white';
          state.whiteLocked = false;
        }
        state.orangeHits += 1;
        state.score += computePoints(POINTS.orange, state.combo);
        state.combo += 1;
        state.maxCombo = Math.max(state.maxCombo || 0, state.combo);
        state.speed = applySuccessSpeed(state, random);
        state.validHitThisLoop = true;
        if (!zoneMoved && !state.zoneMovedThisLoop) {
          zoneMoved = true;
          scheduleZoneTransition(state, moveZoneGroup(previous.targetCenter, state.angle, random));
          state.zoneMoveLoop = previousLoop;
          state.zoneMovedThisLoop = true;
        }
      } else if (zoneAngle <= state.targetWidth) {
        state.lastHit = 'yellow';
        state.feedbackColor = 'yellow';
        state.feedbackRemaining = 1.0;
        state.badgeExpandRemaining = 1.0;
        state.hitOverlayColor = 'white';
        state.hitOverlayUntil = 50;
        state.redStreak = 0;
        state.orangeStreak = 0;
        state.yellowHits += 1;
        state.score += computePoints(POINTS.yellow, state.combo);
        state.combo += 1;
        state.maxCombo = Math.max(state.maxCombo || 0, state.combo);
        state.speed = applySuccessSpeed(state, random);
        state.validHitThisLoop = true;
        if (!zoneMoved && !state.zoneMovedThisLoop) {
          zoneMoved = true;
          scheduleZoneTransition(state, moveZoneGroup(previous.targetCenter, state.angle, random));
          state.zoneMoveLoop = previousLoop;
          state.zoneMovedThisLoop = true;
        }
      } else {
        state.lastHit = 'miss';
        state.feedbackColor = null;
        state.badgeExpandRemaining = 0;
        state.missMarkerAngle = state.angle % (Math.PI * 2);
        state.validHitThisLoop = false;
        state.hitOverlayColor = null;
        state.hitOverlayUntil = 0;
        if (penalizeMissAndSkip) {
          state.combo = 0;
          state.redStreak = 0;
          state.orangeStreak = 0;
          state.lives -= 1;
          if (state.lives === 0) state.status = 'lost';
        }
      }
    }
  }

  if (crossedLoop && state.zoneMode !== 'white' && !previousLoopHadValidHit && !state.validHitThisLoop && !state.zoneMovedThisLoop) {
    scheduleZoneTransition(state, moveZoneGroup(previous.targetCenter, state.angle, random));
    state.zoneMovedThisLoop = true;
  }

  return state;
}

//=========================================
//=============== Duel mode ===============
//=========================================

export const DUEL_WIDTH = 960;
export const DUEL_HEIGHT = 420;
export const MAX_BALANCE = 100;

// Poussée sur la barre commune en 1v1 (sur 100)
const DUEL_PUSH = {
  yellow: 2,
  orange: 4,
  red: 7,
  white: 25,
};

function createDuelPlayer() {
  const base = newGame();
  return {
    ...base,
    speedMode: 'random',
    speed: base.randomMinSpeed,
    lives: 999, // En 1v1, la victoire dépend uniquement de la barre commune
  };
}

export function newDuelGame() {
  return {
    mode: '1v1',
    speedMode: 'random',
    balance: 0, // -100 = bord gauche (J1), 0 = centre, +100 = bord droit (J2)
    maxBalance: MAX_BALANCE,
    left: createDuelPlayer(),
    right: createDuelPlayer(),
    status: 'playing', // 'playing' | 'finished'
    winner: null,      // 'left' | 'right' | 'draw'
  };
}

export function advanceDuel(previous, inputs, seconds, random = Math.random) {
  if (previous.status !== 'playing') return previous;

  const prevLeft = previous.left;
  const prevRight = previous.right;

  // Aucune pénalité de raté (miss) ni de tour passé (skip) en 1v1
  const nextLeft = advance(prevLeft, {hit: Boolean(inputs.leftHit)}, seconds, random, {
    penalizeMissAndSkip: false,
  });
  const nextRight = advance(prevRight, {hit: Boolean(inputs.rightHit)}, seconds, random, {
    penalizeMissAndSkip: false,
  });

  let balance = previous.balance ?? 0;

  // 1. Joueur 1 (gauche) -> pousse l'objet vers Joueur 2 (+balance)
  const leftJustActed = !prevLeft.hitPressed && nextLeft.hitPressed;
  if (leftJustActed && DUEL_PUSH[nextLeft.lastHit]) {
    const comboBonus = nextLeft.combo > 0 && nextLeft.combo % 3 === 0 ? 3 : 0;
    balance += DUEL_PUSH[nextLeft.lastHit] + comboBonus;
  }

  // 2. Joueur 2 (droite) -> pousse l'objet vers Joueur 1 (-balance)
  const rightJustActed = !prevRight.hitPressed && nextRight.hitPressed;
  if (rightJustActed && DUEL_PUSH[nextRight.lastHit]) {
    const comboBonus = nextRight.combo > 0 && nextRight.combo % 3 === 0 ? 3 : 0;
    balance -= DUEL_PUSH[nextRight.lastHit] + comboBonus;
  }

  balance = Math.max(-MAX_BALANCE, Math.min(MAX_BALANCE, balance));

  let status = 'playing';
  let winner = null;
  if (balance >= MAX_BALANCE) {
    status = 'finished';
    winner = 'left';
  } else if (balance <= -MAX_BALANCE) {
    status = 'finished';
    winner = 'right';
  }

  return {
    ...previous,
    balance,
    status,
    winner,
    left: {
      ...nextLeft,
      status: status === 'playing' ? 'playing' : 'finished',
    },
    right: {
      ...nextRight,
      status: status === 'playing' ? 'playing' : 'finished',
    },
  };
}