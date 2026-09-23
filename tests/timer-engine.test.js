import test from 'node:test';
import assert from 'node:assert/strict';
import { TimerEngine, buildPhases, normalizeConfig } from '../js/core/timer-engine.js';
function setup(config = {}) {
  let mono = 10000, wall = 1800000000000;
  const clock = { mono: () => mono, wall: () => wall };
  const engine = new TimerEngine(clock), events = [];
  engine.subscribe(e => events.push(e));
  engine.start({ mode: 'countdown', durationSec: 600, precountSec: 0, ...config });
  return { engine, events, clock, advance: (ms, wallMs = ms) => { mono += ms; wall += wallMs; } };
}
test('10 minutes without a single tick: no accumulated drift and finish exactly once', () => {
  const { engine, advance, events } = setup(); advance(599950);
  assert.equal(engine.tick().remainingMs, 50); advance(50); assert.equal(engine.tick().status, 'finished');
  engine.tick(); assert.equal(events.filter(e => e.type === 'run:finished').length, 1);
});
test('Tabata skips final rest by default, optionally includes it', () => {
  const a = buildPhases({ mode: 'intervals', precountSec: 0 });
  assert.equal(a.length, 15); assert.equal(a.at(-1).type, 'work'); assert.equal(a.at(-1).endMs, 230000);
  assert.equal(buildPhases({ mode: 'intervals', precountSec: 0, finalRest: true }).at(-1).endMs, 240000);
});
test('zero rest gives consecutive work phases with a single boundary cue', () => {
  const { engine, advance } = setup({ mode: 'intervals', workSec: 2, restSec: 0, rounds: 2 }); advance(1500);
  assert.equal(engine.schedule().signals.filter(s => s.kind === 'start').length, 1);
  advance(500); assert.equal(engine.tick().phase.round, 2);
});
test('EMOM starts at zero and each minute, never at final deadline', () => {
  const { engine, advance } = setup({ mode: 'emom', minutes: 2 });
  assert.equal(engine.schedule().signals.filter(s => s.kind === 'start').length, 1);
  advance(59000); assert.equal(engine.schedule().signals.find(s => s.kind === 'start').dueMonoMs, 70000);
  advance(60000); const final = engine.schedule().signals;
  assert.equal(final.filter(s => s.kind === 'start').length, 0); assert.equal(final.filter(s => s.kind === 'finish').length, 1);
});
test('precount happens once, pause shifts all future deadlines', () => {
  const { engine, advance } = setup({ precountSec: 5 }); advance(2000); engine.pause();
  advance(300000); assert.equal(engine.snapshot().remainingMs, 3000);
  engine.resume(); advance(3000); assert.equal(engine.tick().phase.type, 'work'); assert.equal(engine.snapshot().remainingMs, 600000);
});
test('sleep with frozen monotonic clock reconstructs current phase, no past signals', () => {
  const { engine, advance } = setup({ mode: 'emom', minutes: 10 }); advance(10000); engine.hide();
  advance(0, 185000); const s = engine.show(); assert.equal(s.phase.round, 4); assert.equal(s.remainingMs, 45000);
  assert.ok(engine.schedule().signals.every(e => e.dueMonoMs >= 20000 - 80));
});
test('sleep with progressing monotonic clock is not counted twice', () => {
  const { engine, advance } = setup(); advance(1000); engine.hide(); advance(164000); engine.show();
  assert.equal(engine.snapshot().elapsedMs, 165000);
});
test('long normal wall-clock sleep is accepted even if mono freezes', () => {
  const { engine, advance } = setup({ mode: 'chrono' }); engine.hide(); advance(0, 7200000);
  assert.equal(engine.show().workElapsedMs, 7200000); assert.equal(engine.anomaly, null);
});
test('explicitly paused session never advances in background', () => {
  const { engine, advance } = setup(); advance(1234); engine.pause(); engine.hide(); advance(400000); engine.show();
  assert.equal(engine.snapshot().elapsedMs, 1234); assert.equal(engine.status, 'paused');
});
test('clock moving backwards results in a visible paused anomaly', () => {
  const { engine, advance } = setup(); engine.hide(); advance(0, -10000); engine.show();
  assert.equal(engine.status, 'paused'); assert.ok(engine.anomaly);
});
test('crossing several phases while hidden emits only the current phase, not missed ones', () => {
  const { engine, advance, events } = setup({ mode: 'intervals', workSec: 20, restSec: 10, rounds: 8 });
  engine.hide(); advance(95000); engine.show();
  assert.equal(engine.snapshot().phase.round, 4);
  assert.equal(events.filter(e => e.type === 'phase:start').length, 2);
});
test('hidden session completed while absent finishes once and has empty schedule', () => {
  const { engine, advance, events } = setup(); engine.hide(); advance(700000); engine.show(); engine.show();
  assert.equal(engine.status, 'finished'); assert.deepEqual(engine.schedule().signals, []);
  assert.equal(events.filter(e => e.type === 'run:finished').length, 1);
});
test('AMRAP count ignores preparation, pauses, completed runs, and clamps at zero', () => {
  const { engine, advance } = setup({ mode: 'amrap', durationSec: 10, precountSec: 3 });
  engine.changeReps(1); assert.equal(engine.reps, 0); advance(3000); engine.changeReps(1);
  engine.pause(); engine.changeReps(1); assert.equal(engine.reps, 1);
  engine.resume(); engine.changeReps(-1, 'correction'); engine.changeReps(-1); assert.equal(engine.reps, 0);
  advance(10000); engine.changeReps(1); assert.equal(engine.reps, 0);
});
test('chrono laps exclude precount and voluntary pauses', () => {
  const { engine, advance } = setup({ mode: 'chrono', precountSec: 3 }); advance(5000); engine.lap();
  engine.pause(); advance(60000); engine.resume(); advance(1000); engine.lap(); engine.stop();
  assert.deepEqual(engine.laps.map(l => l.durationMs), [2000, 1000]); assert.equal(engine.status, 'finished');
});
test('running checkpoint restored after reload reconstructs then waits for user', () => {
  const { engine, advance, clock } = setup(); advance(10000); const data = engine.checkpoint(); advance(50000);
  const next = new TimerEngine(clock); const s = next.restore(data);
  assert.equal(s.status, 'paused'); assert.equal(s.remainingMs, 540000);
});
test('paused checkpoint stays paused across reload', () => {
  const { engine, advance, clock } = setup(); advance(10000); engine.pause(); const data = engine.checkpoint(); advance(900000);
  assert.equal(new TimerEngine(clock).restore(data).remainingMs, 590000);
});
test('expired checkpoint finishes after reload', () => {
  const { engine, advance, clock } = setup(); const data = engine.checkpoint(); advance(700000);
  assert.equal(new TimerEngine(clock).restore(data).status, 'finished');
});
test('warning and periodic beep on same second do not double', () => {
  const { engine, advance } = setup({ durationSec: 10, intervalSec: 1 }); advance(7000);
  const cues = engine.schedule(3000).signals;
  assert.equal(new Set(cues.map(c => c.dueMonoMs)).size, cues.length);
});
test('invalid inputs are rejected before creating a run', () => {
  for (const v of [NaN, Infinity, 0, -1, 0.1, 100000]) assert.throws(() => normalizeConfig({ mode: 'countdown', durationSec: v }));
  assert.throws(() => normalizeConfig({ mode: 'unknown' }));
});
test('a second start cannot overwrite an active session', () => {
  const { engine } = setup(); assert.throws(() => engine.start({ mode: 'chrono' }));
});
