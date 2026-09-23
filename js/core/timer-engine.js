export const MODES = ['chrono', 'countdown', 'intervals', 'emom', 'amrap'];
const integer = (value, min, max, label) => {
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${label} : valeur attendue entre ${min} et ${max}.`);
  return value;
};

export function normalizeConfig(input) {
  if (!MODES.includes(input.mode)) throw new Error('Mode inconnu.');
  return {
    mode: input.mode,
    durationSec: integer(input.durationSec ?? 300, 1, 86400, 'Durée'),
    workSec: integer(input.workSec ?? 20, 1, 3600, 'Travail'),
    restSec: integer(input.restSec ?? 10, 0, 3600, 'Repos'),
    rounds: integer(input.rounds ?? 8, 1, 200, 'Tours'),
    minutes: integer(input.minutes ?? 10, 1, 180, 'Minutes'),
    precountSec: integer(input.precountSec ?? 5, 0, 10, 'Pré-décompte'),
    finalRest: Boolean(input.finalRest),
    intervalSec: integer(input.intervalSec ?? 0, 0, 3600, 'Bip périodique'),
    warning3: input.warning3 !== false,
  };
}

export function buildPhases(config) {
  const c = normalizeConfig(config), phases = [];
  let startMs = 0;
  const add = (type, label, durationMs, round = 1, rounds = 1) => {
    const p = { id: `phase-${phases.length}`, index: phases.length, type, label, startMs, durationMs, endMs: durationMs === null ? Infinity : startMs + durationMs, round, rounds };
    phases.push(p); startMs = p.endMs;
  };
  if (c.precountSec) add('precount', 'Prépare-toi', c.precountSec * 1000);
  if (c.mode === 'intervals') {
    for (let i = 1; i <= c.rounds; i++) {
      add('work', 'Travail', c.workSec * 1000, i, c.rounds);
      if (c.restSec && (i < c.rounds || c.finalRest)) add('rest', 'Repos', c.restSec * 1000, i, c.rounds);
    }
  } else if (c.mode === 'emom') {
    for (let i = 1; i <= c.minutes; i++) add('work', 'Nouvelle série', 60000, i, c.minutes);
  } else add('work', c.mode === 'amrap' ? 'À ton rythme' : 'C’est parti', c.mode === 'chrono' ? null : c.durationSec * 1000);
  return phases;
}

/** Pure state machine: injected clocks, no DOM, audio, timers or storage. */
export class TimerEngine {
  constructor(clock = { mono: () => performance.now(), wall: () => Date.now() }) {
    this.clock = clock; this.listeners = new Set(); this.status = 'idle'; this.revision = 0;
    this.sequence = 0; this.config = null; this.phases = []; this.reps = 0; this.laps = [];
    this.corrections = []; this.hidden = null; this.anomaly = null;
  }
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(type, payload = {}) {
    const e = { type, runId: this.runId, eventId: `${this.runId}:${++this.sequence}`, revision: this.revision, atMonoMs: this.clock.mono(), ...payload };
    for (const fn of this.listeners) fn(e);
  }
  invalidate(reason) { this.revision++; this.emit('schedule:invalidated', { reason }); }
  start(input) {
    if (['running', 'paused'].includes(this.status)) throw new Error('Une activité est déjà en cours.');
    this.config = normalizeConfig(input); this.phases = buildPhases(this.config);
    this.runId = `${this.clock.wall()}-${Math.random().toString(36).slice(2, 10)}`;
    this.startedAt = this.clock.wall(); this.endedAt = null; this.status = 'running';
    this.baseMs = 0; this.anchorMono = this.clock.mono(); this.anchorWall = this.clock.wall();
    this.reps = 0; this.laps = []; this.corrections = []; this.hidden = null; this.anomaly = null;
    this.phaseId = this.phases[0].id; this.invalidate('start');
    this.emit('run:start', { config: { ...this.config } });
    this.emit('phase:start', { phase: this.phases[0] });
    return this.snapshot();
  }
  elapsed() { return (this.baseMs ?? 0) + (this.status === 'running' ? Math.max(0, this.clock.mono() - this.anchorMono) : 0); }
  get totalMs() { return this.phases.at(-1)?.endMs ?? 0; }
  tick() {
    if (this.status !== 'running') return this.snapshot();
    const elapsed = this.elapsed();
    if (elapsed >= this.totalMs) {
      this.baseMs = this.totalMs; this.status = 'finished'; this.endedAt = this.clock.wall();
      this.emit('phase:end', { phaseId: this.phaseId }); this.invalidate('finished');
      this.emit('run:finished', { snapshot: this.snapshot() });
    } else {
      const phase = this.phases.find(p => elapsed < p.endMs);
      if (phase.id !== this.phaseId) {
        this.emit('phase:end', { phaseId: this.phaseId }); this.phaseId = phase.id;
        this.emit('phase:start', { phase });
      }
    }
    return this.snapshot();
  }
  pause() {
    this.tick(); if (this.status !== 'running') return;
    this.baseMs = this.elapsed(); this.status = 'paused'; this.invalidate('pause'); this.emit('run:paused');
  }
  resume() {
    if (this.status !== 'paused') return;
    this.anchorMono = this.clock.mono(); this.anchorWall = this.clock.wall(); this.hidden = null;
    this.status = 'running'; this.anomaly = null; this.invalidate('resume'); this.emit('run:resumed');
  }
  stop() {
    this.tick(); if (!['running', 'paused'].includes(this.status)) return;
    this.baseMs = this.elapsed(); this.status = this.config.mode === 'chrono' ? 'finished' : 'interrupted';
    this.endedAt = this.clock.wall(); this.invalidate('stop');
    this.emit(this.status === 'finished' ? 'run:finished' : 'run:interrupted', { snapshot: this.snapshot() });
  }
  changeReps(delta, origin = 'manual') {
    this.tick(); const s = this.snapshot();
    if (s.status !== 'running' || s.phase?.type !== 'work' || this.config.mode !== 'amrap') return;
    if (!Number.isInteger(delta) || Math.abs(delta) !== 1) return;
    const before = this.reps; this.reps = Math.max(0, before + delta);
    if (before === this.reps) return;
    this.corrections.push({ atMs: s.elapsedMs, delta: this.reps - before, origin });
    this.emit('rep:changed', { count: this.reps, delta: this.reps - before, origin });
  }
  lap() {
    this.tick(); const s = this.snapshot();
    if (this.config?.mode !== 'chrono' || s.status !== 'running' || s.phase?.type !== 'work') return;
    const previous = this.laps.at(-1)?.atMs ?? 0, atMs = s.workElapsedMs;
    if (atMs <= previous) return;
    this.laps.push({ index: this.laps.length + 1, atMs, durationMs: atMs - previous });
    this.emit('lap', { lap: this.laps.at(-1) });
  }
  hide() {
    if (!['running', 'paused'].includes(this.status) || this.hidden) return;
    this.tick();
    this.hidden = { mono: this.clock.mono(), wall: this.clock.wall(), elapsed: this.elapsed(), status: this.status };
    this.invalidate('hidden');
  }
  reconcile(elapsed, wallDelta, monoDelta = 0) {
    // An ordinary long sleep is NOT an anomaly. Forward wall changes during sleep cannot be distinguished.
    if (wallDelta < 0 || wallDelta + 2000 < monoDelta) {
      this.baseMs = elapsed; this.status = 'paused'; this.anomaly = 'Horloge modifiée : vérifie le temps avant de reprendre.';
    } else {
      this.baseMs = elapsed + wallDelta; this.anchorMono = this.clock.mono(); this.anchorWall = this.clock.wall();
    }
  }
  show() {
    if (!this.hidden) return this.snapshot();
    const h = this.hidden; this.hidden = null;
    if (h.status === 'running' && this.status === 'running') this.reconcile(h.elapsed, this.clock.wall() - h.wall, this.clock.mono() - h.mono);
    this.invalidate('foreground'); this.tick(); this.emit('run:snapshot', { snapshot: this.snapshot(), recovered: true });
    return this.snapshot();
  }
  snapshot() {
    const elapsedMs = Math.min(this.elapsed(), this.totalMs);
    const phase = this.phases.find(p => elapsedMs < p.endMs) ?? this.phases.at(-1) ?? null;
    return {
      runId: this.runId, revision: this.revision, status: this.status, config: this.config,
      elapsedMs, workElapsedMs: Math.max(0, elapsedMs - (this.config?.precountSec ?? 0) * 1000),
      phase, phaseElapsedMs: phase ? Math.max(0, elapsedMs - phase.startMs) : 0,
      remainingMs: phase && phase.durationMs !== null ? Math.max(0, phase.endMs - elapsedMs) : null,
      totalRemainingMs: Number.isFinite(this.totalMs) ? Math.max(0, this.totalMs - elapsedMs) : null,
      nextPhase: phase ? this.phases[phase.index + 1] ?? null : null,
      reps: this.reps, laps: this.laps.map(l => ({ ...l })), anomaly: this.anomaly,
    };
  }
  /** Upcoming deterministic cues, in monotonic milliseconds. Never replays missed cues. */
  schedule(horizonMs = 2000) {
    const signals = [];
    if (this.status !== 'running' || this.hidden) return { revision: this.revision, signals };
    const elapsed = this.elapsed(), mono = this.clock.mono(), until = elapsed + horizonMs;
    const add = (at, kind, phase, extra = {}) => {
      if (at < elapsed - 80 || at > until) return;
      signals.push({ id: `${this.runId}:${phase.id}:${kind}:${at}`, kind, phaseId: phase.id, dueMonoMs: mono + at - elapsed, ...extra });
    };
    for (const p of this.phases) {
      if (p.startMs > until || p.endMs < elapsed - 80) continue;
      if (p.type === 'precount') {
        for (let n = Math.min(3, this.config.precountSec); n >= 1; n--) add(p.endMs - n * 1000, 'precount', p, { number: n });
        continue;
      }
      add(p.startMs, p.type === 'rest' ? 'rest' : 'start', p);
      if (this.config.warning3 && Number.isFinite(p.endMs)) {
        for (let n = 3; n >= 1; n--) if (p.endMs - n * 1000 > p.startMs) add(p.endMs - n * 1000, 'warning', p);
      }
      const step = this.config.intervalSec * 1000;
      if (step) {
        let at = p.startMs + Math.max(1, Math.ceil((elapsed - p.startMs) / step)) * step;
        for (; at < p.endMs && at <= until; at += step) {
          const overlapsWarning = this.config.warning3 && Number.isFinite(p.endMs) && [1000, 2000, 3000].includes(p.endMs - at);
          if (!overlapsWarning) add(at, 'interval', p);
        }
      }
      if (p.endMs === this.totalMs && Number.isFinite(p.endMs)) add(p.endMs, 'finish', p);
    }
    return { revision: this.revision, signals: signals.sort((a, b) => a.dueMonoMs - b.dueMonoMs) };
  }
  checkpoint() {
    return { schemaVersion: 1, runId: this.runId, config: this.config, status: this.status, savedAt: this.clock.wall(),
      elapsedMs: this.elapsed(), startedAt: this.startedAt, reps: this.reps, laps: this.laps, corrections: this.corrections };
  }
  restore(data) {
    if (data?.schemaVersion !== 1 || !['running', 'paused'].includes(data.status) || !Number.isFinite(data.elapsedMs) || data.elapsedMs < 0 || !Number.isFinite(data.savedAt)) throw new Error('Séance sauvegardée invalide.');
    this.start(data.config); this.runId = data.runId; this.startedAt = data.startedAt;
    this.reps = Number.isInteger(data.reps) && data.reps >= 0 ? data.reps : 0;
    this.laps = Array.isArray(data.laps) ? data.laps.filter(l => Number.isFinite(l.atMs) && Number.isFinite(l.durationMs) && l.durationMs >= 0) : [];
    this.corrections = Array.isArray(data.corrections) ? data.corrections : [];
    this.baseMs = data.elapsedMs; this.status = data.status;
    if (data.status === 'running') this.reconcile(data.elapsedMs, this.clock.wall() - data.savedAt);
    this.tick();
    // Explicit user action is required to resume an unfinished recovered activity.
    if (this.status === 'running') this.pause();
    this.invalidate('restored'); return this.snapshot();
  }
}
