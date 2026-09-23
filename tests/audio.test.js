import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioEngine } from '../js/core/audio.js';
function fixture() {
  const sources = [];
  const gain = () => ({ gain: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} });
  const ctx = { currentTime: 1, state: 'running', createGain: gain, createOscillator() {
    const node = { frequency: {}, stopped: false, connect() { return { connect() {} }; }, disconnect() {}, start(t) { this.when = t; }, stop(t) { if (t === undefined) this.stopped = true; } };
    sources.push(node); return node;
  } };
  const audio = new AudioEngine(); audio.ctx = ctx; audio.master = gain();
  const cue = (id, dueMonoMs) => ({ id, dueMonoMs, kind: 'interval', phaseId: 'p' });
  return { audio, ctx, sources, cue };
}
test('audio schedules each signal once and maps mono to audio time', () => {
  const { audio, sources, cue } = fixture(); const packet = { revision: 1, signals: [cue('a', 2000)] };
  audio.schedule(packet, 1000); audio.schedule(packet, 1100);
  assert.equal(sources.length, 1); assert.equal(sources[0].when, 2);
});
test('pause cancellation stops sources already scheduled, revision reschedules fresh', () => {
  const { audio, sources, cue } = fixture(); audio.schedule({ revision: 1, signals: [cue('a', 2000)] }, 1000);
  audio.cancel(); assert.equal(sources[0].stopped, true);
  audio.schedule({ revision: 2, signals: [cue('a', 4000)] }, 3000); assert.equal(sources.length, 2);
});
test('interrupted audio and expired signals are not played', () => {
  const { audio, ctx, sources, cue } = fixture();
  ctx.state = 'interrupted'; audio.schedule({ revision: 1, signals: [cue('a', 2000)] }, 1000); assert.equal(sources.length, 0);
  ctx.state = 'running'; audio.schedule({ revision: 2, signals: [cue('a', 2000)] }, 5000); assert.equal(sources.length, 0);
});
test('closing settings while test clips load prevents deferred playback', async () => {
  const { audio, sources } = fixture();
  audio.ensure = async () => true;
  let finishLoading;
  audio.loadClips = () => new Promise(resolve => { finishLoading = resolve; });
  const pendingTest = audio.test();
  await Promise.resolve();
  audio.cancel(); finishLoading();
  assert.equal(await pendingTest, false);
  assert.equal(sources.length, 0);
});
test('audio test starts only after loading and aborts if context was suspended', async () => {
  const { audio, ctx, sources } = fixture();
  audio.ensure = async () => true;
  let finishLoading;
  audio.loadClips = () => new Promise(resolve => { finishLoading = resolve; });
  const pendingTest = audio.test(); await Promise.resolve();
  assert.equal(sources.length, 0);
  ctx.state = 'suspended'; finishLoading();
  assert.equal(await pendingTest, false); assert.equal(sources.length, 0);
});
test('gym start is a high double pulse, rest a low pulse, and pause cancels all', () => {
  const { audio, sources } = fixture(); audio.configure({ gym: true });
  audio.beep(2, 'start'); audio.beep(4, 'rest');
  assert.deepEqual(sources.map(s => s.frequency.value), [1320, 1320, 440]);
  assert.deepEqual(sources.map(s => s.when), [2, 2.12, 4]);
  audio.cancel(); assert.ok(sources.every(s => s.stopped));
});
