import assert from 'node:assert/strict';
import test from 'node:test';
import {mountGame} from './canvas.js';

function environment(t) {
  const previous = Object.fromEntries(['window', 'requestAnimationFrame', 'cancelAnimationFrame'].map(key => [key, globalThis[key]]));
  const canvas = new EventTarget();
  canvas.focus = () => {};
  let frame;
  let state;
  globalThis.window = new EventTarget();
  globalThis.requestAnimationFrame = callback => { frame = callback; return 1; };
  globalThis.cancelAnimationFrame = () => {};
  const game = mountGame(canvas, () => {}, next => { state = next; });
  t.after(() => {
    game.destroy();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  });
  return {canvas, game, tick: now => frame(now), state: () => state};
}

test('space queues one timing hit for the next frame', t => {
  const {canvas, tick, state} = environment(t);
  tick(0);
  canvas.dispatchEvent(Object.assign(new Event('keydown'), {key: ' '}));
  canvas.dispatchEvent(Object.assign(new Event('keyup'), {key: ' '}));
  tick(16);
  assert.equal(state().hitPressed, true);
});

test('a suspended frame is capped at 50 ms', t => {
  const {tick, state} = environment(t);
  tick(0);
  tick(10000);
  assert.ok(Math.abs(state().angle - state().speed * 0.05) < 0.00001);
});

test('pause freezes angle and resume restarts the clock', t => {
  const {game, tick, state} = environment(t);
  tick(0);
  game.pause();
  const pausedAngle = state().angle;
  tick(3200);
  assert.equal(state().angle, pausedAngle);
  game.resume();
  tick(3216);
  tick(3232);
  assert.notEqual(state().angle, pausedAngle);
});

test('restart restores a fresh Solo state', t => {
  const {game, tick, state} = environment(t);
  tick(0);
  game.setInput('hit', true);
  tick(16);
  game.restart();
  assert.equal(state().score, 0);
  assert.equal(state().lives, 3);
  assert.equal(state().combo, 0);
  assert.equal(state().status, 'playing');
});

test('mountGame clears white overlay after 50 ms and moves zones after 100 ms', t => {
  let wallNow = 1000;
  const originalNow = performance.now.bind(performance);
  performance.now = () => wallNow;
  t.after(() => { performance.now = originalNow; });

  const {game, tick, state} = environment(t);
  tick(0);

  const initialTargetCenter = state().targetCenter;
  const hitAngle = (Math.PI * 2 + initialTargetCenter + 0.05) % (Math.PI * 2);
  let frameTime = 0;
  while (state().angle < hitAngle) {
    frameTime += 50;
    wallNow += 50;
    tick(frameTime);
  }

  const hitWallNow = wallNow;
  game.setInput('hit', true);
  frameTime += 16;
  wallNow = hitWallNow + 16;
  tick(frameTime);
  game.setInput('hit', false);

  assert.equal(state().lastHit, 'red');
  assert.equal(state().hitOverlayColor, 'white');
  assert.equal(state().zoneTransitionPending, true);
  assert.equal(state().targetCenter, initialTargetCenter);

  const scheduledAt = wallNow;
  wallNow = scheduledAt + 49;
  tick(frameTime + 49);
  assert.equal(state().hitOverlayColor, 'white');
  assert.equal(state().targetCenter, initialTargetCenter);

  wallNow = scheduledAt + 50;
  tick(frameTime + 50);
  assert.equal(state().hitOverlayColor, null);
  assert.equal(state().targetCenter, initialTargetCenter);

  wallNow = scheduledAt + 99;
  tick(frameTime + 99);
  assert.equal(state().zoneTransitionPending, true);
  assert.equal(state().targetCenter, initialTargetCenter);

  wallNow = scheduledAt + 100;
  tick(frameTime + 100);
  assert.equal(state().zoneTransitionPending, false);
  assert.notEqual(state().targetCenter, initialTargetCenter);
});
