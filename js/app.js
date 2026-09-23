import { TimerEngine } from './core/timer-engine.js';
import { AudioEngine } from './core/audio.js';
import { WakeLock } from './core/wakelock.js';
import { read, write, remove, storageWarning } from './core/storage.js';
import { APP_VERSION } from './version.js';

const $ = selector => document.querySelector(selector);
const modes = {
  chrono: { name: 'Chronomètre', short: 'Chrono', symbol: '↗', desc: 'Prends ton temps. Marque un tour quand tu veux.' },
  countdown: { name: 'Compte à rebours', short: 'Décompte', symbol: '◷', desc: 'Une durée, un objectif. Concentre-toi sur ton effort.' },
  intervals: { name: 'Intervalles', short: 'Intervalles', symbol: '⇄', desc: 'Alterner l’effort et le repos, tour après tour.' },
  emom: { name: 'EMOM', short: 'EMOM', symbol: '◴', desc: 'Une nouvelle série chaque minute. Le temps restant sert à récupérer.' },
  amrap: { name: 'AMRAP', short: 'AMRAP', symbol: '+', desc: 'Un temps fixé. Compte tes répétitions avec le bouton +1.' },
};
const defaults = { precountSec: 5, sound: true, voice: true, warning3: true, intervalSec: 0, volume: 0.55, gym: false };
let settings = { ...defaults, ...read('settings', {}) };
// Only retain supported settings; malformed local preferences must not break launch.
settings.precountSec = [0, 3, 5, 10].includes(settings.precountSec) ? settings.precountSec : 5;
settings.volume = Number.isFinite(settings.volume) ? Math.min(1, Math.max(0, settings.volume)) : 0.55;
settings.intervalSec = Number.isInteger(settings.intervalSec) && settings.intervalSec >= 0 && settings.intervalSec <= 3600 ? settings.intervalSec : 0;
let selected = read('selected', 'countdown'); if (!modes[selected]) selected = 'countdown';
let lastConfig = null, view = 'home', toastTimer, flashTimer, lastLapCount = -1, savedAt = 0, starting = false;
let savedDraft = read('active');
const engine = new TimerEngine();
const audio = new AudioEngine(state => {
  $('#audio-alert').hidden = !settings.sound || state === 'running' || view !== 'session';
});
audio.configure(settings);
const wake = new WakeLock(state => {
  $('#wake-status').textContent = state === 'active' ? 'Écran maintenu allumé' : state === 'off' ? '' : 'Écran allumé non garanti · garde l’app au premier plan';
});
const text = (selector, value) => { const el = $(selector); if (el.textContent !== String(value)) el.textContent = value; };
function toast(message) { text('#toast', message); $('#toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').hidden = true, 4000); }
function duration(ms, roundUp = false) {
  const sec = Math.max(0, roundUp ? Math.ceil(ms / 1000) : Math.floor(ms / 1000));
  const h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, s = sec % 60;
  return `${h ? h + ':' : ''}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
function show(which) {
  view = which;
  for (const name of ['home', 'session', 'summary']) $('#' + name).hidden = name !== which;
  document.body.classList.toggle('in-session', which === 'session');
  $('#settings-open').disabled = which === 'session';
  if (which !== 'session') document.body.classList.remove('resting');
  window.scrollTo({ top: 0, behavior: 'instant' });
}
function settingsMeta() {
  text('#precount-label', settings.precountSec ? `${settings.precountSec} secondes pour te préparer` : 'Départ immédiat');
  text('#sound-label', settings.sound ? (settings.gym ? 'Mode salle' : 'Sons activés') : 'Sans son');
}
function field(name, label, value, min, max) {
  return `<label>${label}<input name="${name}" type="number" min="${min}" max="${max}" step="1" inputmode="numeric" value="${value}" required></label>`;
}
function renderSetup() {
  const m = modes[selected];
  $('#modes').innerHTML = Object.entries(modes).map(([id, data]) => `<button class="mode-card" data-mode="${id}" aria-pressed="${id === selected}"><span class="symbol" aria-hidden="true">${data.symbol}</span>${data.short}</button>`).join('');
  text('#setup-title', m.name); text('#setup-symbol', m.symbol); text('#setup-desc', m.desc);
  const previous = read('config:' + selected, {});
  const val = (k, fallback, min, max) => Number.isInteger(previous[k]) && previous[k] >= min && previous[k] <= max ? previous[k] : fallback;
  let html = '';
  if (selected === 'countdown' || selected === 'amrap') {
    const d = val('durationSec', selected === 'amrap' ? 600 : 60, 1, 86400);
    html = `<div class="fields-grid">${field('min', 'Minutes', Math.floor(d / 60), 0, 1440)}${field('sec', 'Secondes', d % 60, 0, 59)}</div><div class="presets" aria-label="Durées rapides">${[30, 60, 120, 300].map(s => `<button type="button" data-duration="${s}">${s < 60 ? s + ' s' : s / 60 + ' min'}</button>`).join('')}</div>`;
  }
  if (selected === 'intervals') html = `<div class="fields-grid">${field('workSec', 'Effort · secondes', val('workSec', 20, 1, 3600), 1, 3600)}${field('restSec', 'Repos · secondes', val('restSec', 10, 0, 3600), 0, 3600)}${field('rounds', 'Nombre de tours', val('rounds', 8, 1, 200), 1, 200)}</div><label class="switch-row">Repos après le dernier tour<input type="checkbox" name="finalRest" ${previous.finalRest ? 'checked' : ''}></label><div class="presets"><button type="button" data-tabata>Tabata · 20 / 10 × 8</button></div>`;
  if (selected === 'emom') html = field('minutes', 'Durée · minutes', val('minutes', 10, 1, 180), 1, 180);
  if (selected === 'chrono') html = '<p class="chrono-note">Sans limite de durée. Tes tours et ton meilleur temps apparaîtront pendant la séance.</p>';
  $('#setup-fields').innerHTML = html; settingsMeta();
}
$('#modes').addEventListener('click', e => { const button = e.target.closest('[data-mode]'); if (!button) return; selected = button.dataset.mode; write('selected', selected); renderSetup(); });
$('#setup-fields').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  const f = $('#setup').elements;
  if (b.dataset.duration) { f.min.value = Math.floor(+b.dataset.duration / 60); f.sec.value = +b.dataset.duration % 60; }
  if (b.hasAttribute('data-tabata')) { f.workSec.value = 20; f.restSec.value = 10; f.rounds.value = 8; f.finalRest.checked = false; }
});
function configFromForm() {
  const form = $('#setup').elements, num = key => form[key] ? Number(form[key].value) : undefined;
  return { mode: selected, durationSec: form.min ? num('min') * 60 + num('sec') : undefined,
    workSec: num('workSec'), restSec: num('restSec'), rounds: num('rounds'), minutes: num('minutes'), finalRest: form.finalRest?.checked,
    precountSec: settings.precountSec, intervalSec: settings.intervalSec, warning3: settings.warning3 };
}
async function launch(config) {
  if (starting) return; starting = true; $('#start').disabled = true; $('#again').disabled = true;
  try {
    audio.cancel(); audio.configure(settings);
    let soundReady = settings.sound ? await audio.ensure() : false;
    if (soundReady && settings.voice && !settings.gym) {
      text('#start', 'Préparation du son…');
      await audio.loadClips();
      soundReady = audio.ctx?.state === 'running';
    }
    if (document.hidden) { toast('Reviens dans l’application puis relance la séance.'); return; }
    engine.start(config); lastConfig = { ...engine.config }; lastLapCount = -1;
    savedDraft = null; remove('active'); $('#recovery').hidden = true; write('config:' + config.mode, lastConfig);
    show('session'); $('#audio-alert').hidden = !settings.sound || soundReady; renderSession();
    audio.schedule(engine.schedule(2000), performance.now());
    await wake.set(true); saveDraft();
    if (settings.sound && !soundReady) toast('Le minuteur fonctionne. Touche « Réactiver le son » pour les alertes.');
  } catch (e) { toast(e.message); }
  finally { starting = false; $('#start').disabled = false; $('#again').disabled = false; text('#start', 'C’est parti ↗'); }
}
$('#setup').addEventListener('submit', e => { e.preventDefault(); if (savedDraft && !confirm('Remplacer la séance sauvegardée ?')) return; void launch(configFromForm()); });
$('#again').addEventListener('click', () => { if (lastConfig) void launch({ ...lastConfig, ...{ precountSec: settings.precountSec, intervalSec: settings.intervalSec, warning3: settings.warning3 } }); });
$('#home-button').addEventListener('click', () => { audio.cancel(); show('home'); renderSetup(); });
$('.brand').addEventListener('click', e => { if (view === 'session') { e.preventDefault(); toast('Termine ou mets en pause ta séance avec les boutons ci-dessous.'); } });

function renderLaps(target, laps) {
  const best = laps.length ? Math.min(...laps.map(l => l.durationMs)) : null;
  const worst = laps.length ? Math.max(...laps.map(l => l.durationMs)) : null;
  $(target).innerHTML = [...laps].reverse().map(l => {
    const tag = laps.length > 1 && l.durationMs === best ? ' · meilleur' : laps.length > 1 && l.durationMs === worst && worst !== best ? ' · plus long' : '';
    return `<li class="${tag.includes('meilleur') ? 'best' : tag ? 'worst' : ''}"><span>Tour ${l.index}${tag}</span><strong>${duration(l.durationMs)}.${String(Math.floor(l.durationMs % 1000 / 10)).padStart(2, '0')}</strong></li>`;
  }).join('');
}
function renderSession() {
  const s = engine.snapshot(); if (!s.phase) return;
  const p = s.phase, precount = p.type === 'precount', paused = s.status === 'paused';
  text('#session-mode', modes[s.config.mode].name);
  text('#session-title', paused ? 'Prends ton souffle.' : p.label);
  text('#session-hint', paused ? 'Le temps est suspendu. Reprends quand tu veux.' : precount ? 'Installe-toi confortablement.' : s.config.mode === 'emom' ? 'Fais ta série, puis récupère jusqu’à la minute suivante.' : p.type === 'rest' ? 'Relâche les épaules. Respire.' : 'Un mouvement après l’autre.');
  text('#round-label', !precount && ['emom', 'intervals'].includes(s.config.mode) ? `${p.round} / ${p.rounds}` : precount ? 'Préparation' : 'À ton rythme');
  text('#clock', precount ? Math.ceil(s.remainingMs / 1000) : duration(s.remainingMs ?? s.workElapsedMs, s.remainingMs !== null));
  text('#fraction', s.config.mode === 'chrono' && !precount ? '.' + String(Math.floor(s.workElapsedMs % 1000 / 10)).padStart(2, '0') : '');
  $('#clock').setAttribute('aria-label', s.remainingMs === null ? 'Temps écoulé' : 'Temps restant');
  $('#progress').style.width = p.durationMs ? Math.min(100, s.phaseElapsedMs / p.durationMs * 100) + '%' : '0%';
  text('#next', s.nextPhase ? `Ensuite : ${s.nextPhase.label.toLowerCase()} · ${duration(s.nextPhase.durationMs ?? 0)}` : s.config.mode === 'chrono' ? 'Marque un tour pour comparer tes temps.' : 'Jusqu’au dernier instant.');
  text('#pause', paused ? 'Reprendre' : 'Pause');
  $('#lap').hidden = s.config.mode !== 'chrono'; $('#lap').disabled = paused || precount;
  $('#rep-panel').hidden = s.config.mode !== 'amrap' || precount;
  text('#rep-count', s.reps); $('#plus').disabled = paused || precount; $('#minus').disabled = paused || precount || s.reps === 0;
  $('#clock-alert').hidden = !s.anomaly; text('#clock-alert', s.anomaly ?? '');
  document.body.classList.toggle('resting', p.type === 'rest');
  if (lastLapCount !== s.laps.length) { lastLapCount = s.laps.length; renderLaps('#laps', s.laps); }
}
function saveDraft() {
  if (['running', 'paused'].includes(engine.status)) write('active', engine.checkpoint());
  const warning = storageWarning(); $('#storage-alert').hidden = !warning; text('#storage-alert', warning);
}
function finish(s) {
  void wake.set(false); remove('active'); savedDraft = null; $('#recovery').hidden = true;
  const completed = s.status === 'finished';
  text('#summary-title', completed ? 'Bien joué.' : 'Chaque effort compte.');
  text('#summary-message', completed ? 'Ta séance est terminée. Prends le temps de récupérer.' : 'Séance interrompue. Tu pourras repartir quand tu veux.');
  const stats = [{ label: 'Temps hors pré-décompte', value: duration(s.workElapsedMs) }];
  if (s.config.mode === 'amrap') stats.push({ label: 'Répétitions', value: s.reps });
  else if (s.config.mode === 'chrono') stats.push({ label: 'Tours marqués', value: s.laps.length });
  else stats.push({ label: 'État', value: completed ? 'Terminée' : 'Interrompue' });
  $('#summary-stats').innerHTML = stats.map(v => `<div class="stat"><strong>${v.value}</strong><span>${v.label}</span></div>`).join('');
  renderLaps('#summary-laps', s.laps); show('summary');
}
engine.subscribe(e => {
  if (e.type === 'schedule:invalidated' && e.reason !== 'finished') audio.cancel();
  if (e.type === 'run:finished' || e.type === 'run:interrupted') finish(e.snapshot);
  if (e.type === 'phase:start' && settings.gym && !document.hidden) {
    document.body.classList.add('flash'); clearTimeout(flashTimer); flashTimer = setTimeout(() => document.body.classList.remove('flash'), 220);
  }
});
$('#pause').addEventListener('click', async () => {
  if (engine.status === 'running') { engine.pause(); void wake.set(false); }
  else if (engine.status === 'paused') {
    $('#pause').disabled = true;
    await audio.ensure();
    if (!document.hidden && engine.status === 'paused') { engine.resume(); void wake.set(true); }
    $('#pause').disabled = false;
  }
  saveDraft(); renderSession();
});
$('#plus').addEventListener('click', () => { engine.changeReps(1); renderSession(); saveDraft(); });
$('#minus').addEventListener('click', () => { engine.changeReps(-1, 'correction'); renderSession(); saveDraft(); });
$('#lap').addEventListener('click', () => { engine.lap(); renderSession(); saveDraft(); });
$('#stop').addEventListener('click', () => {
  if (engine.config.mode === 'chrono') { engine.stop(); return; }
  if (engine.status === 'running') engine.pause(); renderSession(); saveDraft(); $('#stop-dialog').showModal();
});
$('#stop-cancel').addEventListener('click', () => { $('#stop-dialog').close(); toast('La séance reste en pause. Touche Reprendre.'); });
$('#stop-confirm').addEventListener('click', () => { $('#stop-dialog').close(); engine.stop(); });
$('#audio-resume').addEventListener('click', async () => { if (await audio.ensure()) { audio.cancel(); void audio.loadClips(); toast('Moteur audio réactivé.'); } else toast('Son indisponible. Le minuteur reste utilisable.'); });

const form = $('#settings-form');
function fillSettings() { for (const [key, value] of Object.entries(settings)) { const el = form.elements[key]; if (el) { if (el.type === 'checkbox') el.checked = Boolean(value); else el.value = value; } } }
function readSettingsForm() { return { precountSec: +form.elements.precountSec.value, intervalSec: +form.elements.intervalSec.value, sound: form.elements.sound.checked, voice: form.elements.voice.checked, warning3: form.elements.warning3.checked, volume: +form.elements.volume.value, gym: form.elements.gym.checked }; }
$('#settings-open').addEventListener('click', () => { fillSettings(); text('#audio-test-status', ''); $('#settings').showModal(); });
$('#settings-close').addEventListener('click', () => $('#settings').close());
$('#settings').addEventListener('close', () => { audio.cancel(); audio.configure(settings); });
form.addEventListener('submit', e => { e.preventDefault(); settings = readSettingsForm(); write('settings', { schemaVersion: 1, ...settings }); audio.configure(settings); settingsMeta(); $('#settings').close(); });
$('#test-audio').addEventListener('click', async () => {
  $('#test-audio').disabled = true; audio.configure({ ...readSettingsForm(), sound: true }); text('#audio-test-status', 'Préparation du son…');
  const ok = await audio.test(); text('#audio-test-status', ok ? 'As-tu entendu le bip et l’annonce ? Vérifie le volume et le mode silencieux si besoin.' : 'Son indisponible. Réessaie en touchant ce bouton.'); $('#test-audio').disabled = false;
});
$('#discard').addEventListener('click', () => { savedDraft = null; remove('active'); $('#recovery').hidden = true; });
$('#recover').addEventListener('click', () => {
  if (!savedDraft) return;
  try {
    const s = engine.restore(savedDraft); lastConfig = { ...engine.config }; selected = s.config.mode;
    savedDraft = null; $('#recovery').hidden = true;
    if (s.status === 'finished') finish(s);
    else { show('session'); renderSession(); toast('Séance retrouvée. Touche Reprendre quand tu es prêt.'); saveDraft(); }
  } catch { toast('Cette sauvegarde ne peut pas être restaurée. Tu peux l’effacer et démarrer une séance.'); }
});
function hide() { engine.hide(); audio.cancel(); saveDraft(); void wake.set(false); }
async function foreground() {
  engine.show();
  if (engine.status === 'running') { void wake.set(true); if (settings.sound) await audio.ensure(); }
  if (view === 'session') renderSession();
}
document.addEventListener('visibilitychange', () => { if (document.hidden) hide(); else void foreground(); });
window.addEventListener('pagehide', hide);
window.addEventListener('pageshow', e => { if (e.persisted) void foreground(); });
setInterval(() => {
  if (document.hidden || view !== 'session') return;
  engine.tick();
  if (engine.status === 'running') audio.schedule(engine.schedule(2000), performance.now());
  if (view === 'session') renderSession();
  if (performance.now() - savedAt > 1000) { savedAt = performance.now(); saveDraft(); }
}, 50);
text('#version', APP_VERSION);
text('#today', new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()).toUpperCase());
$('#recovery').hidden = !savedDraft || !['running', 'paused'].includes(savedDraft.status);
renderSetup();
