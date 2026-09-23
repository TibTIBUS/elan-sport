const median = values => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

export class PushupFaceCounter {
  constructor({ fps = 15, minConfidence = 0.55, minRepMs = 400, stableMs = 300, lostMs = 450 } = {}) {
    this.fps = fps;
    this.minConfidence = minConfidence;
    this.minRepMs = minRepMs;
    this.stableFrames = Math.max(3, Math.ceil(fps * stableMs / 1000));
    this.lostMs = Math.max(lostMs, 3000 / fps);
    this.reset();
  }

  reset({ keepCalibration = false } = {}) {
    if (!keepCalibration) { this.top = null; this.bottom = null; }
    this.state = 'waiting';
    this.reps = 0;
    this.stable = 0;
    this.lastFrameAt = null;
    this.lastRepAt = -Infinity;
    this.invalidatedCycles = 0;
    this.lost = false;
  }

  get calibrated() {
    return Number.isFinite(this.top) && Number.isFinite(this.bottom) && this.bottom > this.top * 1.08;
  }

  calibrate(topSamples, bottomSamples) {
    const clean = xs => xs.filter(Number.isFinite);
    const top = median(clean(topSamples));
    const bottom = median(clean(bottomSamples));
    if (!Number.isFinite(top) || !Number.isFinite(bottom)) throw new Error('Calibration incomplète');
    if (bottom <= top * 1.08) throw new Error('Amplitude de calibration insuffisante');
    this.top = top;
    this.bottom = bottom;
    this.state = 'waiting';
    this.stable = 0;
    return { top, bottom, amplitude: bottom - top };
  }

  invalidate() {
    if (this.state === 'down') this.invalidatedCycles++;
    this.state = 'waiting';
    this.stable = 0;
  }

  feed(signal, timeMs, confidence = 1) {
    if (!Number.isFinite(timeMs)) throw new TypeError('timeMs doit être un nombre');
    const gap = this.lastFrameAt == null ? 0 : timeMs - this.lastFrameAt;
    this.lastFrameAt = timeMs;
    if (gap > this.lostMs) this.invalidate();

    if (!Number.isFinite(signal) || confidence < this.minConfidence) {
      this.lost = true;
      this.invalidate();
      return this.snapshot();
    }

    this.lost = false;
    this.stable++;
    if (!this.calibrated) return this.snapshot();

    const progress = (signal - this.top) / (this.bottom - this.top);
    if (this.state === 'waiting') {
      if (this.stable >= this.stableFrames && progress < 0.3) this.state = 'up';
    } else if (this.state === 'up') {
      if (progress > 0.7) this.state = 'down';
    } else if (this.state === 'down' && progress < 0.3) {
      if (timeMs - this.lastRepAt >= this.minRepMs) {
        this.reps++;
        this.lastRepAt = timeMs;
      }
      this.state = 'up';
    }
    return this.snapshot(progress);
  }

  snapshot(progress = null) {
    return {
      reps: this.reps,
      state: this.state,
      calibrated: this.calibrated,
      lost: this.lost,
      progress,
      invalidatedCycles: this.invalidatedCycles,
      top: this.top,
      bottom: this.bottom,
    };
  }
}

export function faceSignal(detection, videoHeight) {
  const box = detection?.boundingBox;
  if (!box || !Number.isFinite(box.height) || !Number.isFinite(videoHeight) || videoHeight <= 0) return null;
  return box.height / videoHeight;
}

export function faceConfidence(detection) {
  const score = detection?.categories?.[0]?.score;
  return Number.isFinite(score) ? score : 0;
}
