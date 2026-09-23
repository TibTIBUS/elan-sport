// Simulation d'intégration : vrai TimerEngine + vraie AudioEngine, boucle de 50 ms comme js/app.js.
// Faux AudioContext dont l'horloge suit l'horloge monotone ; elle peut se figer pendant un verrouillage (iPhone).
import test from 'node:test';
import assert from 'node:assert/strict';
import { TimerEngine } from '../js/core/timer-engine.js';
import { AudioEngine } from '../js/core/audio.js';

function rig(config, { audioFrozenWhileHidden = true } = {}) {
  let mono = 1000, wall = 1.8e12, audioT = 0, hidden = false;
  const played = [];
  const node = (kind) => ({ kind, frequency: {}, connect() { return { connect() {} }; }, disconnect() {},
    start(t) { this.t = t; played.push(this); }, stop(t) { if (t === undefined) this.cancelled = true; } });
  const gain = () => ({ gain: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} });
  const ctx = { get currentTime() { return audioT; }, state: 'running', createGain: gain,
    createOscillator: () => node('tone'), createBufferSource: () => node('clip') };
  const clock = { mono: () => mono, wall: () => wall };
  const engine = new TimerEngine(clock), audio = new AudioEngine();
  audio.ctx = ctx; audio.master = gain(); audio.configure({ sound: true, voice: true, volume: 1, gym: false });
  for (const id of ['n1', 'n2', 'n3', 'partez', 'repos', 'fin']) audio.buffers.set(id, { duration: 0.5 });
  // Même câblage que js/app.js
  engine.subscribe((e) => { if (e.type === 'schedule:invalidated' && e.reason !== 'finished') audio.cancel(); });
  engine.start(config);
  const step = (ms) => {
    for (let t = 0; t < ms; t += 50) {
      mono += 50; wall += 50; if (!(hidden && audioFrozenWhileHidden)) audioT += 0.05;
      if (hidden) continue;
      engine.tick(); if (engine.status === 'running') audio.schedule(engine.schedule(2000), mono);
    }
  };
  const lock = (ms) => { engine.hide(); audio.cancel(); hidden = true; step(ms); hidden = false; engine.show(); };
  const live = (from = 0) => played.slice(from).filter((n) => !n.cancelled);
  return { engine, step, lock, played, live, audioT: () => audioT };
}
const tones = (nodes) => nodes.filter((n) => n.kind === 'tone');
const clips = (nodes) => nodes.filter((n) => n.kind === 'clip');

test('compte à rebours 10 s + pré-décompte 5 : chaque signal une seule fois', () => {
  const r = rig({ mode: 'countdown', durationSec: 10, precountSec: 5, warning3: true, intervalSec: 0 });
  r.step(16000);
  assert.equal(r.engine.status, 'finished');
  // 3 nombres + départ (2 impulsions) + 3 avertissements + fin
  assert.equal(tones(r.played).length, 3 + 2 + 3 + 1);
  assert.equal(clips(r.played).length, 3 + 1 + 1, 'trois, deux, un, partez, fin');
  const times = tones(r.played).map((b) => b.t.toFixed(3));
  assert.equal(new Set(times).size, times.length, 'aucune impulsion en double');
});

test('pause pendant le pré-décompte : sons futurs annulés, rien pendant la pause, reprise sans rattrapage', () => {
  const r = rig({ mode: 'countdown', durationSec: 5, precountSec: 5, warning3: false, intervalSec: 0 });
  r.step(1500); r.engine.pause();
  assert.equal(r.live().filter((n) => n.t > r.audioT()).length, 0);
  const before = r.played.length;
  r.step(60000); assert.equal(r.played.length, before);
  r.engine.resume(); r.step(9000);
  assert.equal(clips(r.live(before)).length, 3 + 1 + 1, 'trois, deux, un, partez, fin, sans doublon');
});

test('verrouillage à travers 3 phases de Tabata, horloge audio figée : aucun son ancien, bonne phase', () => {
  const r = rig({ mode: 'intervals', workSec: 20, restSec: 10, rounds: 8, precountSec: 0, warning3: true, intervalSec: 0 });
  r.step(15000); const n = r.played.length;
  r.lock(47000);
  const s = r.engine.snapshot();
  assert.equal(s.phase.round, 3); assert.equal(s.phase.type, 'work');
  r.step(100);
  assert.equal(r.live(n).filter((x) => x.t < r.audioT() - 0.1).length, 0);
  r.step(20000); assert.equal(r.engine.snapshot().phase.type, 'rest');
});

test('verrouillage en EMOM, horloge audio non figée : même garantie', () => {
  const r = rig({ mode: 'emom', minutes: 5, precountSec: 0, warning3: true, intervalSec: 0 }, { audioFrozenWhileHidden: false });
  r.step(50000); const n = r.played.length;
  r.lock(100000); r.step(100);
  assert.equal(r.live(n).filter((x) => x.t < r.audioT() - 0.1).length, 0);
  assert.equal(r.engine.snapshot().phase.round, 3);
});

test('EMOM + bip régulier 10 s + avertissements : jamais deux impulsions au même instant', () => {
  const r = rig({ mode: 'emom', minutes: 2, precountSec: 0, warning3: true, intervalSec: 10 });
  r.step(125000);
  const times = tones(r.live()).map((b) => b.t.toFixed(2));
  assert.equal(new Set(times).size, times.length);
  assert.equal(r.engine.status, 'finished');
});

test('fin naturelle : le clip « fin » déjà programmé n’est pas annulé', () => {
  const r = rig({ mode: 'countdown', durationSec: 3, precountSec: 0, warning3: false, intervalSec: 0 });
  r.step(3200);
  const fin = clips(r.played).at(-1);
  assert.equal(r.engine.status, 'finished'); assert.ok(fin && !fin.cancelled);
});

test('Tabata : départ = double impulsion 1320 Hz, repos = 440 Hz, clip après la seconde impulsion', () => {
  const r = rig({ mode: 'intervals', workSec: 2, restSec: 2, rounds: 2, precountSec: 0, warning3: false, intervalSec: 0 });
  r.step(6500);
  const f = tones(r.live()).map((t) => t.frequency.value);
  assert.deepEqual(f.filter((v) => v === 1320).length, 4, 'deux départs × deux impulsions');
  assert.deepEqual(f.filter((v) => v === 440).length, 1, 'un repos (pas de repos final)');
  const [p1, p2] = tones(r.live()).filter((t) => t.frequency.value === 1320);
  const partez = clips(r.live())[0];
  assert.ok(partez.t > p2.t + 0.06, 'le clip « partez » commence après la fin de la seconde impulsion');
  assert.ok(p2.t - p1.t > 0.1);
});
