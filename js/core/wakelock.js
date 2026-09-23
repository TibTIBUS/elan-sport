export class WakeLock {
  constructor(onChange = () => {}) { this.onChange = onChange; this.wanted = false; this.lock = null; this.pending = false; }
  async set(wanted) {
    this.wanted = wanted;
    if (!wanted) { const old = this.lock; this.lock = null; await old?.release().catch(() => {}); this.onChange('off'); return; }
    if (this.lock || this.pending || document.hidden) return;
    if (!navigator.wakeLock) { this.onChange('unavailable'); return; }
    this.pending = true;
    try {
      const lock = await navigator.wakeLock.request('screen');
      if (!this.wanted || document.hidden) { await lock.release(); return; }
      this.lock = lock; this.onChange('active');
      lock.addEventListener('release', () => { if (this.lock === lock) { this.lock = null; this.onChange(this.wanted ? 'released' : 'off'); } });
    } catch { this.onChange('unavailable'); }
    finally { this.pending = false; }
  }
}
