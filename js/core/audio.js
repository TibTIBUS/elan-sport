/** One shared Web Audio context. No speechSynthesis, no remote TTS, no background retry loop. */
export class AudioEngine {
  constructor(onState = () => {}) {
    this.ctx = null; this.onState = onState; this.nodes = new Set(); this.seen = new Map();
    this.buffers = new Map(); this.revision = -1; this.pending = null; this.loadPromise = null;
    this.settings = { sound: true, voice: true, volume: 0.55, gym: false };
  }
  configure(settings) { this.settings = { ...this.settings, ...settings }; if (this.master) this.master.gain.value = this.settings.volume; }
  async ensure() {
    if (!this.settings.sound) return false;
    if (!this.ctx || this.ctx.state === 'closed') {
      try {
        if ('audioSession' in navigator) navigator.audioSession.type = 'ambient';
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.master = this.ctx.createGain(); this.master.gain.value = this.settings.volume; this.master.connect(this.ctx.destination);
        this.ctx.onstatechange = () => {
          if (this.ctx.state !== 'running') this.cancel();
          this.onState(this.ctx.state);
        };
      } catch { this.onState('unavailable'); return false; }
    }
    if (this.ctx.state === 'running') { this.onState('running'); return true; }
    if (this.pending) return this.pending;
    let timeout;
    this.pending = Promise.race([
      this.ctx.resume().then(() => this.ctx.state === 'running').catch(() => false),
      new Promise(resolve => { timeout = setTimeout(() => resolve(false), 1500); }),
    ]).then(ok => { this.onState(ok ? 'running' : 'interrupted'); return ok; }).finally(() => { clearTimeout(timeout); this.pending = null; });
    return this.pending;
  }
  async loadClips() {
    if (!this.ctx) return;
    if (this.loadPromise) return this.loadPromise;
    const context = this.ctx;
    this.loadPromise = Promise.allSettled(['n1', 'n2', 'n3', 'partez', 'repos', 'fin'].map(async id => {
      const res = await fetch(new URL(`../../audio/clips/${id}.mp3`, import.meta.url), { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error('Clip indisponible');
      this.buffers.set(id, await context.decodeAudioData(await res.arrayBuffer()));
    }));
    return this.loadPromise;
  }
  track(source, gain) {
    const item = { source, gain }; this.nodes.add(item);
    source.onended = () => { source.disconnect(); gain?.disconnect(); this.nodes.delete(item); };
    return source;
  }
  beep(when, kind = 'interval') {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    const duration = kind === 'finish' ? 0.3 : 0.08;
    o.frequency.value = kind === 'finish' ? 1046 : kind === 'warning' ? 660 : 880;
    g.gain.setValueAtTime(0.0001, when); g.gain.exponentialRampToValueAtTime(this.settings.gym ? 0.12 : 0.35, when + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    o.connect(g).connect(this.master); this.track(o, g); o.start(when); o.stop(when + duration + 0.01);
  }
  clip(id, when) {
    const buffer = this.buffers.get(id);
    if (!buffer || !this.settings.voice || this.settings.gym) return;
    const s = this.ctx.createBufferSource(); s.buffer = buffer; s.connect(this.master); this.track(s); s.start(when);
  }
  schedule(packet, monoNow) {
    if (!this.settings.sound || this.ctx?.state !== 'running') return;
    if (this.revision !== packet.revision) { this.cancel(); this.revision = packet.revision; }
    for (const [id, due] of this.seen) if (due < monoNow - 5000) this.seen.delete(id);
    for (const cue of packet.signals) {
      if (this.seen.has(cue.id) || cue.dueMonoMs < monoNow - 80) continue;
      this.seen.set(cue.id, cue.dueMonoMs);
      const when = this.ctx.currentTime + Math.max(0.005, (cue.dueMonoMs - monoNow) / 1000);
      this.beep(when, cue.kind);
      // Short fixed clips fit inside their slots; the bip has the first 100 ms.
      const id = { start: 'partez', rest: 'repos', finish: 'fin', precount: `n${cue.number}` }[cue.kind];
      if (id) this.clip(id, when + (cue.kind === 'finish' ? 0.32 : 0.1));
    }
  }
  cancel() {
    for (const { source } of this.nodes) { try { source.stop(); } catch { /* Already ended. */ } }
    this.nodes.clear(); this.seen.clear();
  }
  async test() {
    if (!await this.ensure()) return false;
    await this.loadClips(); this.cancel();
    if (this.ctx.state !== 'running') return false;
    this.beep(this.ctx.currentTime + 0.05); this.clip('partez', this.ctx.currentTime + 0.3); return true;
  }
}
