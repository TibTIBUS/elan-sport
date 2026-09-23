const PREFIX = 'elan:v1:';
let warning = '';
export function read(key, fallback = null) {
  try { const raw = localStorage.getItem(PREFIX + key); return raw ? JSON.parse(raw) : fallback; }
  catch { warning = 'Les données locales ne sont pas accessibles.'; return fallback; }
}
export function write(key, value) {
  try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); return true; }
  catch { warning = 'Sauvegarde impossible. Garde cette page ouverte pour conserver ta séance.'; return false; }
}
export function remove(key) { try { localStorage.removeItem(PREFIX + key); } catch { /* Keep the UI usable. */ } }
export function storageWarning() { return warning; }
