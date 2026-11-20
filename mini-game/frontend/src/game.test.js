import assert from 'node:assert/strict';
import test from 'node:test';
import {advance, newGame} from './game.js';

test('new game starts with zones between minus pi half and minus pi', () => {
  const state = newGame();
  assert.ok(state.targetCenter >= -Math.PI);
  assert.ok(state.targetCenter <= -Math.PI / 2);
});

/*test('new game starts in a single small white zone mode', () => {
  const state = newGame();
  assert.equal(state.zoneMode, 'white');
  assert.equal(state.whiteWidth, 0.3);
  assert.ok(state.whiteWidth > 0);
  assert.ok(state.whiteWidth < state.redWidth);
});*/

test('three consecutive red hits activate white zone mode', () => {
  let state = newGame();
  state = {...state, zoneMode: 'colors', redStreak: 2, targetCenter: 1};
  state = {...state, angle: state.targetCenter};

  state = advance(state, {hit: true}, 0.016, () => 0.25);

  assert.equal(state.lastHit, 'red');
  assert.equal(state.zoneMode, 'white');
});

test('five consecutive orange hits activate white zone mode', () => {
  let state = newGame();
  state = {...state, zoneMode: 'colors', orangeStreak: 4, targetCenter: 1};
  state = {...state, angle: state.targetCenter + 0.48};

  state = advance(state, {hit: true}, 0.016, () => 0.25);

  assert.equal(state.lastHit, 'orange');
  assert.equal(state.zoneMode, 'white');
});

test('white hit awards 450 base points with combo multiplier and restores color zones', () => {
  let state = newGame();
  state.status = 'playing';
  state.zoneMode = 'white';
  state.whiteLocked = false;
  state.combo = 2;
  state.angle = state.targetCenter + state.whiteWidth - 0.05;

  state = advance(state, {hit: true}, 0.016, () => 0.25);

  assert.equal(state.lastHit, 'white');
  assert.equal(state.feedbackColor, 'white');
  assert.equal(state.score, 540);
  assert.equal(state.zoneMode, 'colors');
});

test('miss on white zone forbids white reappearance until a new trigger', () => {
  let state = newGame();
  state.status = 'playing';
  state.angle = state.targetCenter + state.whiteWidth + 0.001;

  state = advance(state, {hit: true}, 0.016);
  assert.equal(state.zoneMode, 'colors');
  assert.equal(state.whiteLocked, true);

  state = advance(state, {hit: false}, 0.016);
  assert.equal(state.zoneMode, 'colors');
});

test('complete loop does not activate white zone', () => {
  let state = newGame();
  state = {...state, zoneMode: 'colors', combo: 9, targetCenter: 1};
  state.angle = Math.PI * 2 - 0.01;
  state.speed = 1;

  state = advance(state, {}, 0.05);

  assert.equal(state.zoneMode, 'colors');
  assert.equal(state.whiteLocked, true);
});

test('zone position stays unchanged between explicit moves', () => {
  let state = newGame();
  state = {...state, zoneMode: 'colors', targetCenter: 1.25};
  const targetCenter = state.targetCenter;

  for (let i = 0; i < 60; i++) {
    state = advance(state, {}, 0.016);
  }

  assert.equal(state.targetCenter, targetCenter);
});

test('white hit keeps the indicator angle and moves the zone group', () => {
  let state = newGame();
  state.status = 'playing';
  state.angle = state.targetCenter + 0.10;
  const previousCenter = state.targetCenter;
  const previousAngle = state.angle;

  state = advance(state, {hit: true}, 0.016, () => 0.25);

  assert.equal(state.zoneMode, 'colors');
  assert.equal(state.targetCenter, previousCenter);
  assert.notEqual(state.pendingTargetCenter, previousCenter);
  assert.ok(Math.abs(state.angle - (previousAngle + state.speed * 0.016)) < 0.03);
});

test('white hit moves zones once and not again at the same loop return', () => {
  let state = newGame();
  state.status = 'playing';
  state.angle = state.targetCenter + 0.10;
  const before = state.targetCenter;

  state = advance(state, {hit: true}, 0.016, () => 0.25);
  const afterWhiteHit = state.targetCenter;
  assert.equal(afterWhiteHit, before);
  assert.notEqual(state.pendingTargetCenter, before);

  state.angle = Math.PI * 2 - 0.01;
  state.speed = 1;
  state = advance(state, {hit: false}, 0.05);
  assert.equal(state.targetCenter, afterWhiteHit);
});

test('a combo of ten alone does not activate the white zone', () => {
  let state = newGame();
  state = {...state, zoneMode: 'colors', combo: 9, targetCenter: 1};
  state = {...state, angle: state.targetCenter};

  state = advance(state, {hit: true}, 0.016, () => 0.25);

  assert.equal(state.combo, 10);
  assert.equal(state.zoneMode, 'colors');
});

test('completing a loop without hitting white exits white and repositions zones', () => {
  let state = newGame();
  state = {...state, zoneMode: 'white', angle: Math.PI * 2 - 0.01, speed: 1};
  const before = state.targetCenter;

  state = advance(state, {hit: false}, 0.05);

  assert.equal(state.zoneMode, 'colors');
  assert.equal(state.whiteLocked, true);
  assert.notEqual(state.targetCenter, before);
});

test('speed starts in gradual mode', () => {
  const state = newGame();
  assert.equal(state.speedMode, 'gradual');
});

test('gradual success increases speed by four percent', () => {
  let state = newGame();
  state.status = 'playing';
  state.zoneMode = 'colors';
  state.angle = state.targetCenter;
  const before = state.speed;

  state = advance(state, {hit: true}, 0.016);

  assert.ok(Math.abs(state.speed - before * 1.04) < 0.00001);
});

test('random success chooses a speed inside the configured range', () => {
  let state = newGame();
  state.status = 'playing';
  state.zoneMode = 'colors';
  state.speedMode = 'random';
  state.angle = state.targetCenter;

  state = advance(state, {hit: true}, 0.016, () => 0.5);

  assert.ok(state.speed >= state.randomMinSpeed);
  assert.ok(state.speed <= state.randomMaxSpeed);
});

test('miss does not change the indicator speed', () => {
  let state = newGame();
  state.status = 'playing';
  state.zoneMode = 'colors';
  state.speedMode = 'random';
  state.angle = state.targetCenter + Math.PI;
  const before = state.speed;

  state = advance(state, {hit: true}, 0.016);

  assert.equal(state.speed, before);
});

test('angle rotation is frame-rate independent and capped by dt', () => {
  const run = frames => {
    let state = {...newGame(), status: 'playing'};
    for (let i = 0; i < frames; i++) state = advance(state, {}, 0.5 / frames);
    return state.angle;
  };

  assert.ok(Math.abs(run(30) - run(60)) < 0.00001);
  assert.ok(Math.abs(run(30) - newGame().speed * 0.5) < 0.00001);
  const capped = advance({...newGame(), status: 'playing'}, {}, 10);
  assert.ok(Math.abs(capped.angle - newGame().speed * 0.05) < 0.00001);
});

test('pressing in the normal zone scores 50 and starts a combo', () => {
  let state = newGame();
  state.status = 'playing';
  state.zoneMode = 'colors';
  state.angle = state.targetCenter + 0.80;

  state = advance(state, {hit: true}, 0.016);

  assert.equal(state.lastHit, 'yellow');
  assert.equal(state.feedbackColor, 'yellow');
  assert.equal(state.score, 50);
  assert.equal(state.combo, 1);
  assert.equal(state.lives, 3);
});

test('pressing in the orange zone scores 100 plus combo bonus', () => {
  let state = newGame();
  state.status = 'playing';
  state.zoneMode = 'colors';
  state.angle = state.targetCenter + 0.48;
  state.combo = 2;

  state = advance(state, {hit: true}, 0.016);

  assert.equal(state.lastHit, 'orange');
  assert.equal(state.feedbackColor, 'orange');
  assert.equal(state.score, 120);
  assert.equal(state.combo, 3);
});

test('pressing in the red zone scores 150 plus combo bonus', () => {
  let state = newGame();
  state.status = 'playing';
  state.zoneMode = 'colors';
  state.angle = state.targetCenter;
  state.combo = 2;

  state = advance(state, {hit: true}, 0.016);

  assert.equal(state.lastHit, 'red');
  assert.equal(state.feedbackColor, 'red');
  assert.equal(state.score, 180);
  assert.equal(state.combo, 3);
});

test('miss outside the target costs one life and resets the combo', () => {
  let state = newGame();
  state.status = 'playing';
  state.zoneMode = 'colors';
  state.combo = 4;
  state.angle = state.targetCenter + Math.PI;

  state = advance(state, {hit: true}, 0.016);

  assert.equal(state.lastHit, 'miss');
  assert.equal(state.lives, 2);
  assert.equal(state.combo, 0);
});

test('zone outside all three target zones is a miss and never a valid hit', () => {
  let state = newGame();
  state.status = 'playing';
  state.zoneMode = 'colors';
  state.combo = 3;
  state.angle = state.targetCenter + state.targetWidth + 0.001;

  state = advance(state, {hit: true}, 0.016);

  assert.equal(state.lastHit, 'miss');
  assert.equal(state.feedbackColor, null);
  assert.equal(state.score, 0);
  assert.equal(state.combo, 0);
  assert.equal(state.lives, 2);
});

test('miss leaves a red marker at the exact indicator angle', () => {
  let state = newGame();
  state.status = 'playing';
  state.zoneMode = 'colors';
  state.angle = state.targetCenter + Math.PI;

  state = advance(state, {hit: true}, 0.016);

  assert.equal(state.lastHit, 'miss');
  assert.equal(state.missMarkerAngle, state.angle % (Math.PI * 2));
});

test('next click removes the red miss marker', () => {
  let state = newGame();
  state.status = 'playing';
  state.zoneMode = 'colors';
  state.missMarkerAngle = 1.25;
  state.angle = state.targetCenter;

  state = advance(state, {hit: true}, 0.016);

  assert.equal(state.missMarkerAngle, null);
});

test('complete loop removes the red miss marker', () => {
  let state = newGame();
  state.status = 'playing';
  state.missMarkerAngle = 1.25;
  state.angle = Math.PI * 2 - 0.01;
  state.speed = 1;

  state = advance(state, {}, 0.05);

  assert.equal(state.missMarkerAngle, null);
});

test('three misses end the solo game', () => {
  let state = newGame();
  state.status = 'playing';

  for (let i = 0; i < 3; i++) {
    state = {...state, angle: state.targetCenter + Math.PI};
    state = advance(state, {hit: true}, 0.016);
    state = advance(state, {}, 0.016);
  }

  assert.equal(state.lives, 0);
  assert.equal(state.status, 'lost');
  assert.deepEqual(advance(state, {hit: true}, 0.05), state);
});

test('each success increases rotation speed by 4 percent', () => {
  const initial = newGame();
  let state = {...initial, status: 'playing', angle: initial.targetCenter};

  state = advance(state, {hit: true}, 0.016);

  assert.ok(Math.abs(state.speed - initial.speed * 1.04) < 0.00001);
});

test('a held hit is counted only once during one press', () => {
  let state = newGame();
  state.status = 'playing';
  state.angle = state.targetCenter;

  state = advance(state, {hit: true}, 0.016);
  const afterFirstHit = state;
  for (let i = 0; i < 10; i++) state = advance(state, {hit: true}, 0.016);

  assert.equal(state.score, afterFirstHit.score);
  assert.equal(state.combo, afterFirstHit.combo);
});

test('a held miss removes only one life during one press', () => {
  let state = newGame();
  state.status = 'playing';
  state.angle = state.targetCenter + Math.PI;

  state = advance(state, {hit: true}, 0.016);
  for (let i = 0; i < 10; i++) state = advance(state, {hit: true}, 0.016);

  assert.equal(state.lives, 2);
});

test('restart clears hit feedback and restores Solo state', () => {
  const state = newGame();
  let restarted = {...state, status: 'lost', score: 500, combo: 4, lives: 0};
  restarted = newGame();
  assert.equal(restarted.status, 'playing');
  assert.equal(restarted.score, 0);
  assert.equal(restarted.combo, 0);
  assert.equal(restarted.lives, 3);
  assert.equal(restarted.feedbackColor, null);
});

test('a valid hit moves the whole zone group to a different random position', () => {
  let state = newGame();
  state.status = 'playing';
  state.angle = state.targetCenter;
  const before = state.targetCenter;

  state = advance(state, {hit: true}, 0.016, () => 0.25);

  assert.equal(state.targetCenter, before);
  assert.notEqual(state.pendingTargetCenter, before);
});

test('a miss does not move the zone group', () => {
  let state = newGame();
  state.status = 'playing';
  state.angle = state.targetCenter + Math.PI;
  const before = state.targetCenter;

  state = advance(state, {hit: true}, 0.016, () => 0.25);

  assert.equal(state.targetCenter, before);
});

test('one complete loop without a hit resets the zone group', () => {
  let state = newGame();
  state.status = 'playing';
  state.zoneMode = 'colors';
  state.angle = Math.PI * 2 - 0.01;
  state.speed = 1;
  const before = state.targetCenter;

  state = advance(state, {}, 0.05, () => 0.25);

  assert.equal(state.targetCenter, before);
  assert.notEqual(state.pendingTargetCenter, before);
});

test('a loop completed without a valid hit resets the zone position once', () => {
  let state = newGame();
  state.status = 'playing';
  state.zoneMode = 'colors';
  state.angle = Math.PI * 2 - 0.01;
  state.speed = 1;
  const before = state.targetCenter;

  state = advance(state, {hit: false}, 0.05, () => 0.25);

  assert.equal(state.targetCenter, before);
  assert.notEqual(state.pendingTargetCenter, before);
});

test('a loop with a valid hit does not reset zones again', () => {
  let state = newGame();
  state.status = 'playing';
  state.zoneMode = 'colors';
  state.angle = state.targetCenter;

  state = advance(state, {hit: true}, 0.016, () => 0.25);
  const afterHit = state.targetCenter;
  state = {...state, angle: Math.PI * 2 - 0.01};
  const afterLoop = advance(state, {hit: false}, 0.05, () => 0.75);

  assert.equal(afterLoop.targetCenter, afterHit);
});

test('the indicator angle keeps increasing across complete loops', () => {
  let state = newGame();
  state.status = 'playing';
  state.angle = Math.PI * 2 - 0.01;
  state.speed = 1;

  state = advance(state, {}, 0.05, () => 0.25);

  assert.ok(state.angle >= Math.PI * 2);
  assert.ok(state.angle < Math.PI * 2 + 1);
});

test('a hit and a loop crossing in the same frame move zones only once', () => {
  let state = newGame();
  state.status = 'playing';
  state.zoneMode = 'colors';
  state.angle = Math.PI * 2 - 0.01;
  state.speed = 1;
  state.targetCenter = 0.02;

  state = advance(state, {hit: true}, 0.05, () => 0.25);

  assert.equal(state.lastHit, 'red');
  assert.equal(state.zoneTransitionPending, true);
  assert.notEqual(state.pendingTargetCenter, 0.02);
});

test('the next complete loop does not move zones after a hit', () => {
  let state = newGame();
  state.status = 'playing';
  state.angle = 0;
  state.targetCenter = 0;
  state.speed = 1;

  state = advance(state, {hit: true}, 0.01, () => 0.25);
  const afterHit = state.targetCenter;
  state = advance(state, {}, 0.05, () => 0.75);
  state.angle = Math.PI * 4 - 0.01;
  state = advance(state, {}, 0.05, () => 0.75);

  assert.equal(state.targetCenter, afterHit);
});

test('zone movement stays safely away from the indicator', () => {
  for (let i = 0; i < 20; i++) {
    let state = newGame();
    state.zoneMode = 'colors';
    state.angle = i * 0.37;
    state.targetCenter = state.angle;
    state = advance(state, {hit: true}, 0.016, () => i / 20);
    if (state.lastHit !== 'miss') {
      assert.ok(state.pendingTargetCenter >= -Math.PI * 1.35);
      assert.ok(state.pendingTargetCenter <= -state.targetWidth);
    }
  }
});

test('moved zones stay outside the indicator forward sector', () => {
  for (let i = 0; i < 20; i++) {
    let state = newGame();
    state.status = 'playing';
    state.zoneMode = 'colors';
    state.angle = i * 0.37;
    state.targetCenter = 0;

    state = advance(state, {hit: true}, 0.016, () => i / 20);
    if (state.lastHit !== 'miss') {
      assert.ok(state.pendingTargetCenter >= -Math.PI * 1.35);
      assert.ok(state.pendingTargetCenter <= -state.targetWidth);
    }
  }
});

test('absolute target position stays aligned with the drawn zones', () => {
  let state = newGame();
  state.status = 'playing';
  state.zoneMode = 'colors';
  state.targetCenter = 1.5;
  state.angle = 1.5;

  state = advance(state, {hit: true}, 0.016, () => 0.25);
  assert.equal(state.lastHit, 'red');
});

test('red streak stores up to three pastilles and orange streak stores up to five', () => {
  let state = newGame();
  state.status = 'playing';
  state.zoneMode = 'colors';

  for (let i = 0; i < 3; i++) {
    state = {...state, angle: state.targetCenter, hitPressed: false};
    state = advance(state, {hit: true}, 0.016, () => 0.25);
    state = advance(state, {hit: false}, 0.016);
  }
  assert.equal(state.redStreak, 3);
  assert.equal(state.orangeStreak, 0);

  state = {...state, zoneMode: 'colors', redStreak: 0, orangeStreak: 0, angle: state.targetCenter + 0.48};
  for (let i = 0; i < 5; i++) {
    state = {...state, angle: state.targetCenter + 0.48, hitPressed: false};
    state = advance(state, {hit: true}, 0.016, () => 0.25);
    state = advance(state, {hit: false}, 0.016);
  }
  assert.equal(state.orangeStreak, 5);
  assert.equal(state.redStreak, 0);
});

test('red and orange feedback colors persist across frames', () => {
  let state = newGame();
  state.status = 'playing';
  state.zoneMode = 'colors';
  state.angle = state.targetCenter;
  state = advance(state, {hit: true}, 0.016);
  state = advance(state, {}, 1);
  assert.equal(state.feedbackColor, 'red');
  assert.equal(state.redStreak, 1);

  state = {...state, angle: state.targetCenter + 0.48, hitPressed: false};
  state = advance(state, {hit: true}, 0.016);
  state = advance(state, {}, 1);
  assert.equal(state.feedbackColor, 'orange');
  assert.equal(state.orangeStreak, 1);
  assert.equal(state.redStreak, 0);
});

test('valid hit schedules a 50 ms white overlay and keeps zones for 100 ms', () => {
  let state = newGame();
  state.status = 'playing';
  state.zoneMode = 'colors';
  state.angle = state.targetCenter;

  state = advance(state, {hit: true}, 0.016, () => 0.25);

  assert.equal(state.hitOverlayColor, 'white');
  assert.equal(state.hitOverlayUntil, 50);
  assert.equal(state.zoneTransitionPending, true);
  assert.equal(state.zoneTransitionUntil, 100);
  assert.equal(state.pendingTargetCenter !== state.targetCenter, true);
});

test('miss does not schedule zone or white overlay transitions', () => {
  let state = newGame();
  state.status = 'playing';
  state.zoneMode = 'colors';
  state.angle = state.targetCenter + Math.PI;

  state = advance(state, {hit: true}, 0.016);

  assert.equal(state.hitOverlayColor, null);
  assert.equal(state.zoneTransitionPending, false);
  assert.equal(state.pendingTargetCenter, null);
});

