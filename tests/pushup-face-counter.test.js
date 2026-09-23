import test from 'node:test';
import assert from 'node:assert/strict';
import { PushupFaceCounter, faceSignal, faceConfidence } from '../js/core/pushup-face-counter.js';

const calibrated = () => {
  const c = new PushupFaceCounter({ fps: 10 });
  c.calibrate([0.20, 0.201, 0.199], [0.40, 0.402, 0.398]);
  return c;
};
const feed = (c, values, start = 0, step = 100) => values.forEach((v, i) => c.feed(v, start + i * step, 0.9));

test('calibration utilise une médiane robuste', () => {
  const c = new PushupFaceCounter();
  const r = c.calibrate([0.20, 0.21, 0.90], [0.39, 0.40, 0.41]);
  assert.equal(r.top, 0.21);
  assert.equal(r.bottom, 0.40);
});

test('refuse une calibration sans amplitude suffisante', () => {
  const c = new PushupFaceCounter();
  assert.throws(() => c.calibrate([0.30], [0.31]), /Amplitude/);
});

test('compte seulement haut bas haut', () => {
  const c = calibrated();
  feed(c, [0.20, 0.20, 0.20, 0.20, 0.36, 0.39, 0.40, 0.24, 0.21, 0.20]);
  assert.equal(c.reps, 1);
  assert.equal(c.state, 'up');
});

test('ne compte pas un demi-mouvement', () => {
  const c = calibrated();
  feed(c, [0.20, 0.20, 0.20, 0.39, 0.40]);
  assert.equal(c.reps, 0);
  assert.equal(c.state, 'down');
});

test('annule un cycle si le visage est perdu en bas', () => {
  const c = calibrated();
  feed(c, [0.20, 0.20, 0.20, 0.39]);
  c.feed(null, 400, 0);
  feed(c, [0.20, 0.20, 0.20], 500);
  assert.equal(c.reps, 0);
  assert.equal(c.invalidatedCycles, 1);
});

test('annule un cycle après une interruption vidéo', () => {
  const c = calibrated();
  feed(c, [0.20, 0.20, 0.20, 0.39]);
  c.feed(0.20, 1500, 0.9);
  assert.equal(c.reps, 0);
  assert.equal(c.invalidatedCycles, 1);
});

test('ignore une détection sous le seuil de confiance', () => {
  const c = calibrated();
  c.feed(0.20, 0, 0.2);
  assert.equal(c.lost, true);
  assert.equal(c.state, 'waiting');
});

test('extrait le signal et la confiance du FaceDetector', () => {
  const d = { boundingBox: { height: 120 }, categories: [{ score: 0.87 }] };
  assert.equal(faceSignal(d, 480), 0.25);
  assert.equal(faceConfidence(d), 0.87);
});
