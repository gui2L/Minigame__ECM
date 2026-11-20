import {
  advance,
  advanceDuel,
  newGame,
  newDuelGame,
  WIDTH,
  HEIGHT,
  DUEL_WIDTH,
  DUEL_HEIGHT,
} from './game.js';
import blueSideSrc from './assets/blueside.png';
import redSideSrc from './assets/redside.png';

function loadSprite(src) {
  if (typeof Image === 'undefined') return null;
  const img = new Image();
  img.src = src;
  return img;
}

const blueSideImg = loadSprite(blueSideSrc);
const redSideImg = loadSprite(redSideSrc);

function drawCircleBoard(context, state, centerX, centerY, radius, options = {}) {
  const {showDuelHud = false, keyHint = ''} = options;

  context.save();
  context.translate(centerX, centerY);
  context.rotate(-Math.PI / 2);

  context.lineWidth = 10;
  context.lineCap = 'butt';

  // Contour noir (bordure extérieure + intérieure de 2 px)
  context.strokeStyle = '#000000';
  context.lineWidth = 14;
  context.beginPath();
  context.arc(0, 0, radius, 0, Math.PI * 2);
  context.stroke();

  // Cercle de fond
  context.strokeStyle = '#475569';
  context.lineWidth = 10;
  context.beginPath();
  context.arc(0, 0, radius, 0, Math.PI * 2);
  context.stroke();

  // Zones cibles
  if (state.zoneMode === 'white') {
    context.strokeStyle = '#ffffff';
    context.lineWidth = 8;
    context.beginPath();
    context.arc(0, 0, radius, state.targetCenter, state.targetCenter + state.whiteWidth);
    context.stroke();
  } else {
    context.strokeStyle = '#facc15';
    context.beginPath();
    context.arc(0, 0, radius, 0.64 + state.targetCenter, 0.96 + state.targetCenter);
    context.stroke();

    context.strokeStyle = '#f97316';
    context.beginPath();
    context.arc(0, 0, radius, 0.32 + state.targetCenter, 0.64 + state.targetCenter);
    context.stroke();

    context.strokeStyle = '#ef4444';
    context.beginPath();
    context.arc(0, 0, radius, state.targetCenter, 0.32 + state.targetCenter);
    context.stroke();
  }

  // Flash blanc de touche réussie
  if (state.hitOverlayColor === 'white') {
    let overlayStart = state.targetCenter;
    let overlayEnd = state.targetCenter + state.redWidth;
    if (state.lastHit === 'orange') {
      overlayStart = state.targetCenter + state.redWidth;
      overlayEnd = state.targetCenter + state.redWidth + state.orangeWidth;
    } else if (state.lastHit === 'yellow') {
      overlayStart = state.targetCenter + state.redWidth + state.orangeWidth;
      overlayEnd = state.targetCenter + state.targetWidth;
    } else if (state.lastHit === 'white') {
      overlayStart = state.targetCenter;
      overlayEnd = state.targetCenter + state.whiteWidth;
    }
    context.strokeStyle = '#ffffff';
    context.lineWidth = 12;
    context.beginPath();
    context.arc(0, 0, radius, overlayStart, overlayEnd);
    context.stroke();
  }

  // Aiguille
  context.save();
  context.rotate(state.angle % (Math.PI * 2));
  context.strokeStyle = '#f8fafc';
  context.lineWidth = 4;
  context.lineCap = 'round';
  context.beginPath();
  context.moveTo(0, 0);
  context.lineTo(radius - 3, 0);
  context.stroke();
  context.restore();

  context.restore();

  // Marqueur d'échec
  if (state.missMarkerAngle !== null && state.missMarkerAngle !== undefined) {
    context.save();
    context.translate(centerX, centerY);
    context.rotate(-Math.PI / 2);
    context.rotate(state.missMarkerAngle);
    context.strokeStyle = '#ef4444';
    context.lineWidth = 2;
    context.lineCap = 'round';
    context.beginPath();
    context.moveTo(radius - 7, 0);
    context.lineTo(radius + 7, 0);
    context.stroke();
    context.restore();
  }

  // HUD spécifique au 1v1 sur fond sombre
  if (showDuelHud) {
    context.fillStyle = '#cbd5e1';
    context.font = '14px Arial';
    context.textAlign = 'center';
    context.fillText(`Combo x${state.combo} · ${keyHint}`, centerX, DUEL_HEIGHT - 18);
    context.textAlign = 'left';
  }
}

function drawHorizontalStripes(context, x, y, width, height, colors, stripeHeight = 4, flash = 0) {
  if (width <= 0 || height <= 0) return;

  context.save();
  context.beginPath();
  context.rect(x, y, width, height);
  context.clip();

  // Rayures de base (bleu ou rouge)
  for (let offsetY = 0, index = 0; offsetY < height; offsetY += stripeHeight, index++) {
    context.fillStyle = colors[index % colors.length];
    context.fillRect(x, y + offsetY, width, stripeHeight);
  }

  // Flash des rayures intérieures en blanc / gris clair lors d'une touche réussie
  if (flash > 0) {
    const flashColors = ['#ffffff', '#cbd5e1'];
    context.globalAlpha = Math.min(1, flash);
    for (let offsetY = 0, index = 0; offsetY < height; offsetY += stripeHeight, index++) {
      context.fillStyle = flashColors[index % flashColors.length];
      context.fillRect(x, y + offsetY, width, stripeHeight);
    }
  }

  context.restore();
}

function drawSharedTugBar(
  context,
  balance = 0,
  maxBalance = 100,
  impactPulse = 0,
  leftFlash = 0,
  rightFlash = 0,
) {
  const barWidth = 420;
  const barHeight = 20;
  const barX = (DUEL_WIDTH - barWidth) / 2;
  const barY = 42;
  const centerX = DUEL_WIDTH / 2;
  const barCenterY = barY + barHeight / 2;

  const spriteHeight = 54;
  const spriteWidth = 92;
  const spriteGap = 6;

  context.save();
  context.imageSmoothingEnabled = false;

  // Indicateur J1 à gauche
  if (blueSideImg && blueSideImg.complete && blueSideImg.naturalWidth > 0) {
    context.drawImage(
      blueSideImg,
      barX - spriteWidth - spriteGap,
      barCenterY - spriteHeight / 2,
      spriteWidth,
      spriteHeight,
    );
  } else {
    context.fillStyle = '#2563eb';
    context.font = 'bold 14px Arial';
    context.textAlign = 'right';
    context.fillText('J1', barX - 12, barY + 15);
  }

  // Indicateur J2 à droite (effet miroir)
  if (redSideImg && redSideImg.complete && redSideImg.naturalWidth > 0) {
    context.save();
    context.translate(barX + barWidth + spriteGap + spriteWidth, barCenterY - spriteHeight / 2);
    context.scale(-1, 1);
    context.drawImage(redSideImg, 0, 0, spriteWidth, spriteHeight);
    context.restore();
  } else {
    context.fillStyle = '#dc2626';
    context.font = 'bold 14px Arial';
    context.textAlign = 'left';
    context.fillText('J2', barX + barWidth + 12, barY + 15);
  }

  context.restore();

  // Point de rencontre entre le bleu (gauche) et le rouge (droite)
  const ratio = Math.max(-1, Math.min(1, balance / maxBalance));
  const clashX = centerX + ratio * (barWidth / 2);
  const barRight = barX + barWidth;

  // Rayures horizontales bleues + flash blanc/gris (Joueur 1)
  if (clashX > barX) {
    drawHorizontalStripes(
      context,
      barX,
      barY,
      clashX - barX,
      barHeight,
      ['#1d4ed8', '#60a5fa'],
      4,
      leftFlash,
    );
  }

  // Rayures horizontales rouges + flash blanc/gris (Joueur 2)
  if (clashX < barRight) {
    drawHorizontalStripes(
      context,
      clashX,
      barY,
      barRight - clashX,
      barHeight,
      ['#dc2626', '#f87171'],
      4,
      rightFlash,
    );
  }

  // Graduations internes (25 %, 50 % centre, 75 %)
  [0.25, 0.5, 0.75].forEach(step => {
    const tickX = barX + barWidth * step;
    const isCenter = step === 0.5;
    context.strokeStyle = isCenter ? 'rgba(15, 23, 42, 0.65)' : 'rgba(255, 255, 255, 0.45)';
    context.lineWidth = isCenter ? 2 : 1;
    context.beginPath();
    context.moveTo(tickX, isCenter ? barY - 3 : barY + 3);
    context.lineTo(tickX, isCenter ? barY + barHeight + 3 : barY + barHeight - 3);
    context.stroke();
  });

  // Contour extérieur de la barre
  context.strokeStyle = '#334155';
  context.lineWidth = 1.5;
  context.strokeRect(barX, barY, barWidth, barHeight);

  // Onde d'énergie à la frontière bleu / rouge (clashX)
  const glowRadius = 12 + impactPulse * 12;
  const clashGlow = context.createRadialGradient(clashX, barCenterY, 1, clashX, barCenterY, glowRadius);
  clashGlow.addColorStop(0, '#ffffff');
  clashGlow.addColorStop(0.5, 'rgba(250, 204, 21, 0.85)');
  clashGlow.addColorStop(1, 'rgba(250, 204, 21, 0)');
  context.fillStyle = clashGlow;
  context.beginPath();
  context.arc(clashX, barCenterY, glowRadius, 0, Math.PI * 2);
  context.fill();

  // Trait blanc net de collision entre les deux rayons
  context.strokeStyle = '#ffffff';
  context.lineWidth = 3 + impactPulse * 2;
  context.beginPath();
  context.moveTo(clashX, barY - 4 - impactPulse * 3);
  context.lineTo(clashX, barY + barHeight + 4 + impactPulse * 3);
  context.stroke();

  // Indicateur chiffré discret sous la barre
  const roundedBalance = Math.round(balance);
  context.fillStyle = '#334155';
  context.font = 'bold 12px Arial';
  context.textAlign = 'center';
  const statusText = roundedBalance > 0
    ? `Avantage Bleu : +${roundedBalance}%`
    : roundedBalance < 0
      ? `Avantage Rouge : +${Math.abs(roundedBalance)}%`
      : '50/50';
  context.fillText(statusText, centerX, barY + barHeight + 18);

  context.textAlign = 'left';
}

export function draw(context, state) {
  if (state.mode === '1v1') {
    const topBannerHeight = 104;

    // 1. Fond sombre pour la zone des cercles
    context.fillStyle = '#111827';
    context.fillRect(0, 0, DUEL_WIDTH, DUEL_HEIGHT);

    // 2. Bande supérieure blanche pour la barre commune et les sprites
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, DUEL_WIDTH, topBannerHeight);

    // Ligne de séparation entre la bande blanche et la zone sombre
    context.strokeStyle = '#334155';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(0, topBannerHeight);
    context.lineTo(DUEL_WIDTH, topBannerHeight);
    context.stroke();

    // Séparateur central entre les deux joueurs dans la zone sombre
    context.beginPath();
    context.moveTo(DUEL_WIDTH / 2, topBannerHeight + 14);
    context.lineTo(DUEL_WIDTH / 2, DUEL_HEIGHT - 20);
    context.stroke();

    // Barre commune + images sur le fond blanc
    const displayedBalance = state.visualBalance !== undefined ? state.visualBalance : state.balance;
    drawSharedTugBar(
      context,
      displayedBalance,
      state.maxBalance,
      state.impactPulse || 0,
      state.leftFlash || 0,
      state.rightFlash || 0,
    );

    // Cercles des deux joueurs sur le fond sombre
    drawCircleBoard(context, state.left, DUEL_WIDTH * 0.25, 262, 102, {
      showDuelHud: true,
      keyHint: 'Touche ESPACE',
    });

    drawCircleBoard(context, state.right, DUEL_WIDTH * 0.75, 262, 102, {
      showDuelHud: true,
      keyHint: 'Touche ENTRÉE',
    });

    if (state.status !== 'playing') {
      context.fillStyle = '#111827eb';
      context.fillRect(0, 170, DUEL_WIDTH, 120);
      context.fillStyle = '#ffffff';
      context.textAlign = 'center';
      context.font = 'bold 30px Arial';
      const leftLabel = state.leftName || 'Joueur 1';
      const rightLabel = state.rightName || 'Joueur 2';
      const title = state.winner === 'left'
        ? `Victoire de ${leftLabel} !`
        : state.winner === 'right'
          ? `Victoire de ${rightLabel} !`
          : 'Égalité !';
      context.fillText(title, DUEL_WIDTH / 2, 218);
      context.font = '18px Arial';
      context.fillText('Cliquez sur Rejouer pour lancer une nouvelle manche', DUEL_WIDTH / 2, 256);
      context.textAlign = 'left';
    }
    return;
  }

  // Mode Solo (fond sombre d'origine)
  context.fillStyle = '#111827';
  context.fillRect(0, 0, WIDTH, HEIGHT);
  drawCircleBoard(context, state, WIDTH / 2, HEIGHT / 2 - 8, 112);

  if (state.feedbackColor) {
    const feedbackColors = {
      white: '#ffffff',
      yellow: '#facc15',
      orange: '#f97316',
      red: '#ef4444',
    };
    const streakCount = state.feedbackColor === 'red'
      ? state.redStreak
      : state.feedbackColor === 'orange'
        ? state.orangeStreak
        : 0;
    const expandProgress = state.badgeExpandRemaining > 0
      ? 1 - state.badgeExpandRemaining
      : 1;
    const expandScale = 1 + 0.45 * Math.sin(expandProgress * Math.PI);

    if (streakCount > 0) {
      const pastilles = state.feedbackColor === 'red'
        ? Math.min(3, streakCount)
        : Math.min(5, streakCount);
      for (let i = 0; i < pastilles; i++) {
        const radiusBadge = i === pastilles - 1 ? 14 * expandScale : 14;
        context.fillStyle = feedbackColors[state.feedbackColor];
        context.lineWidth = 2;
        context.beginPath();
        context.arc(WIDTH - 36 - i * 32, 58, radiusBadge, 0, Math.PI * 2);
        context.fill();
        context.stroke();
      }
    } else {
      context.fillStyle = feedbackColors[state.feedbackColor];
      context.lineWidth = 2;
      context.beginPath();
      context.arc(WIDTH - 36, 58, 14 * expandScale, 0, Math.PI * 2);
      context.fill();
      context.stroke();
    }
  }

  context.fillStyle = '#ffffff';
  context.font = 'bold 20px Arial';
  context.textAlign = 'left';
  context.fillText(`Score ${state.score}`, 24, 34);
  context.fillText(`Combo x${state.combo}`, 24, 62);
  context.fillText(`Vies ${state.lives}`, WIDTH - 100, 34);
  context.textAlign = 'center';
  context.fillStyle = '#cbd5e1';
  context.font = '14px Arial';
  context.fillText('Appuie sur ESPACE dans la zone', WIDTH / 2, HEIGHT - 24);

  if (state.status !== 'playing') {
    context.fillStyle = '#111827e8';
    context.fillRect(0, 145, WIDTH, 110);
    context.fillStyle = '#ffffff';
    context.textAlign = 'center';
    context.font = 'bold 30px Arial';
    context.fillText('Partie terminée', WIDTH / 2, 183);
    context.font = '18px Arial';
    context.fillText(`${state.score} points · Rejouer pour recommencer`, WIDTH / 2, 220);
    context.textAlign = 'left';
  }
}

function createPlayerTimers() {
  return {zoneDeadline: null, overlayDeadline: null};
}

function applyPlayerTimers(playerState, timers, wallNow) {
  let next = playerState;
  let changed = false;

  if (next.zoneTransitionPending && timers.zoneDeadline === null) {
    timers.zoneDeadline = wallNow + 100;
  }
  if (timers.zoneDeadline !== null && wallNow >= timers.zoneDeadline) {
    next = {
      ...next,
      targetCenter: next.pendingTargetCenter,
      zoneTransitionPending: false,
      zoneTransitionUntil: 0,
      pendingTargetCenter: null,
    };
    timers.zoneDeadline = null;
    changed = true;
  }

  if (next.hitOverlayColor && timers.overlayDeadline === null) {
    timers.overlayDeadline = wallNow + 50;
  }
  if (timers.overlayDeadline !== null && wallNow >= timers.overlayDeadline) {
    next = {...next, hitOverlayColor: null, hitOverlayUntil: 0};
    timers.overlayDeadline = null;
    changed = true;
  }

  return {state: next, changed};
}

export function mountGame(canvas, onState = () => {}, render = null) {
  const context = render ? null : canvas.getContext('2d');
  let gameMode = 'solo';
  let speedMode = 'gradual';
  let state = newGame();
  let previous = null;
  let frameId;
  let paused = false;
  let lastSnapshot = '';
  let pausedAt = null;

  let soloTimers = createPlayerTimers();
  let leftTimers = createPlayerTimers();
  let rightTimers = createPlayerTimers();

  let leftName = 'Joueur 1';
  let rightName = 'Joueur 2';
  let visualBalance = 0;
  let impactPulse = 0;
  let leftFlash = 0;
  let rightFlash = 0;

  const input = {hit: false, leftHit: false, rightHit: false};
  const queued = {hit: false, leftHit: false, rightHit: false};
  const keyboard = {space: false, enter: false};
  const paint = render || (s => draw(context, s));

  function syncCanvasSize() {
    if (!canvas) return;
    canvas.width = gameMode === '1v1' ? DUEL_WIDTH : WIDTH;
    canvas.height = gameMode === '1v1' ? DUEL_HEIGHT : HEIGHT;
  }

  function clearInput() {
    input.hit = false;
    input.leftHit = false;
    input.rightHit = false;
    queued.hit = false;
    queued.leftHit = false;
    queued.rightHit = false;
    keyboard.space = false;
    keyboard.enter = false;
  }

  function keydown(event) {
    if (event.key === ' ') {
      event.preventDefault();
      keyboard.space = true;
      queued.hit = true;
      queued.leftHit = true;
    } else if (event.key === 'Enter' && gameMode === '1v1') {
      event.preventDefault();
      keyboard.enter = true;
      queued.rightHit = true;
    }
  }

  function keyup(event) {
    if (event.key === ' ') {
      event.preventDefault();
      keyboard.space = false;
    } else if (event.key === 'Enter') {
      event.preventDefault();
      keyboard.enter = false;
    }
  }

  function blur() {
    clearInput();
    paused = true;
    previous = null;
  }

  function frame(now) {
    const dt = previous === null ? 0 : Math.max(0, Math.min((now - previous) / 1000, 0.05));
    previous = now;

    if (!paused) {
      const wallNow = performance.now();

      if (state.mode === '1v1') {
        state = advanceDuel(
          state,
          {
            leftHit: input.leftHit || keyboard.space || queued.leftHit,
            rightHit: input.rightHit || keyboard.enter || queued.rightHit,
          },
          dt,
        );
        queued.leftHit = false;
        queued.rightHit = false;

        const leftRes = applyPlayerTimers(state.left, leftTimers, wallNow);
        const rightRes = applyPlayerTimers(state.right, rightTimers, wallNow);
        if (leftRes.changed || rightRes.changed) {
          state = {...state, left: leftRes.state, right: rightRes.state};
          onState({...state});
        }

        const targetBalance = state.balance ?? 0;
        const diff = targetBalance - visualBalance;
        if (Math.abs(diff) > 0.5) {
          impactPulse = Math.min(1, Math.max(impactPulse, Math.abs(diff) / 25));
        }
        visualBalance += diff * Math.min(1, dt * 14);
        if (Math.abs(targetBalance - visualBalance) < 0.05) {
          visualBalance = targetBalance;
        }
        impactPulse = Math.max(0, impactPulse - dt * 2.5);

        if (state.left.hitOverlayColor === 'white') {
          leftFlash = 1;
        } else {
          leftFlash = Math.max(0, leftFlash - dt * 7);
        }

        if (state.right.hitOverlayColor === 'white') {
          rightFlash = 1;
        } else {
          rightFlash = Math.max(0, rightFlash - dt * 7);
        }

        state = {
          ...state,
          visualBalance,
          impactPulse,
          leftFlash,
          rightFlash,
          leftName,
          rightName,
        };
      } else {
        state = advance(state, {hit: input.hit || keyboard.space || queued.hit}, dt);
        queued.hit = false;

        const soloRes = applyPlayerTimers(state, soloTimers, wallNow);
        if (soloRes.changed) {
          state = soloRes.state;
          onState({...state});
        }
      }
    }

    paint(state);

    const snapshot = state.mode === '1v1'
      ? `1v1|${state.status}|${state.winner}|${state.balance}|${state.left.combo}|${state.right.combo}`
      : `solo|${state.status}|${state.score}|${state.combo}|${state.lives}|${state.lastHit}`;

    if (snapshot !== lastSnapshot) {
      lastSnapshot = snapshot;
      onState({...state});
    }

    frameId = requestAnimationFrame(frame);
  }

  syncCanvasSize();
  canvas.addEventListener('keydown', keydown);
  canvas.addEventListener('keyup', keyup);
  canvas.addEventListener('blur', clearInput);
  window.addEventListener('blur', blur);
  frameId = requestAnimationFrame(frame);

  return {
    setGameMode(mode) {
      if (mode !== 'solo' && mode !== '1v1') return;
      gameMode = mode;
      if (mode === '1v1') {
        speedMode = 'random';
      }
      syncCanvasSize();
      this.restart();
    },
    setSpeedMode(mode) {
      if (mode !== 'gradual' && mode !== 'random') return;
      const effectiveMode = gameMode === '1v1' ? 'random' : mode;
      speedMode = effectiveMode;
      if (state.mode === '1v1') {
        const updatePlayer = p => ({
          ...p,
          speedMode: 'random',
          speed: Math.max(p.speed, p.randomMinSpeed),
        });
        state = {
          ...state,
          speedMode: 'random',
          visualBalance,
          impactPulse,
          leftFlash,
          rightFlash,
          leftName,
          rightName,
          left: updatePlayer(state.left),
          right: updatePlayer(state.right),
        };
      } else {
        const speed = effectiveMode === 'random'
          ? Math.max(state.speed, state.randomMinSpeed)
          : state.score === 0 ? Math.PI * 0.7 : state.speed;
        state = {...state, speedMode: effectiveMode, speed};
      }
      paint(state);
      onState({...state});
    },
    setInput(key, value) {
      if (key === 'hit' || key === 'leftHit' || key === 'rightHit') {
        input[key] = value;
        if (value) queued[key] = true;
      }
    },
    setPlayerNames(p1, p2) {
      leftName = (p1 || '').trim() || 'Joueur 1';
      rightName = (p2 || '').trim() || 'Joueur 2';
      if (state.mode === '1v1') {
        state = {...state, leftName, rightName};
        paint(state);
      }
    },
    pause() {
      paused = true;
      pausedAt = performance.now();
      clearInput();
    },
    resume() {
      paused = false;
      previous = null;
      if (pausedAt !== null) {
        const d = performance.now() - pausedAt;
        [soloTimers, leftTimers, rightTimers].forEach(t => {
          if (t.zoneDeadline !== null) t.zoneDeadline += d;
          if (t.overlayDeadline !== null) t.overlayDeadline += d;
        });
        pausedAt = null;
      }
      canvas.focus();
    },
    restart() {
      state = gameMode === '1v1' ? newDuelGame() : newGame();
      lastSnapshot = '';
      soloTimers = createPlayerTimers();
      leftTimers = createPlayerTimers();
      rightTimers = createPlayerTimers();
      visualBalance = 0;
      impactPulse = 0;
      leftFlash = 0;
      rightFlash = 0;
      pausedAt = null;
      clearInput();
      paused = false;
      previous = null;
      this.setSpeedMode(gameMode === '1v1' ? 'random' : speedMode);
      canvas.focus();
    },
    destroy() {
      cancelAnimationFrame(frameId);
      canvas.removeEventListener('keydown', keydown);
      canvas.removeEventListener('keyup', keyup);
      canvas.removeEventListener('blur', clearInput);
      window.removeEventListener('blur', blur);
    },
  };
}