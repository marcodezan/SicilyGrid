'use strict';
/* =====================================================================
   INTERFACCIA — utilità comuni, stato, formattazione, notifiche
   ===================================================================== */
const UI = { isl: 'LIP', sel: null, ctab: 'sld', btab: 'scope', fpTab: 'cmd', snd: false, big: false, paused: false, slow: 1, soeSeen: 0, almSeen: 0, view: {}, hov: null, conf: null, fpKey: '' };
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const COL = { mv: '#5a9fcf', dead: '#4a545e', ok: '#4aad6f', wa: '#d6a73c', al: '#df4a4f', mag: '#c06cb3', or: '#d98a3d', hi: '#e3e8ec', tx: '#a5b0ba', dim: '#6c7884', brkC: '#d64545', brkO: '#4aad6f' };

/* ---------- icone ---------- */
const EMO = { '⚙': 'gear', '🔋': 'battery', '〰': 'line', '🏠': 'cabin', '╱': 'segment', '◇': 'switch', '▬': 'bus', '🔌': 'cable', '🏝': 'island', '☀': 'sun', '▶': 'play', '⟳': 'sync', '■': 'stop', '⏻': 'power', '↺': 'reset', '✋': 'hand', '🤖': 'auto', '〜': 'wave', '⚠': 'warning', '🔧': 'wrench', '☰': 'list', '□': 'stop', '◆': 'switch', '⎍': 'schema', '⌖': 'target', '⚡': 'bolt', '▦': 'dashboard', '⏯': 'play', '🗺': 'map', '📈': 'trend', '🔔': 'bell', '📜': 'list', '✓': 'check', '🎓': 'school', '🧑‍🔧': 'tools', '📖': 'book', '⌨': 'keyboard', '☁': 'cloud', '⛅': 'partly', '⛈': 'storm', '🌬': 'wind', '✕': 'x', '⌂': 'home', '🎯': 'target', '⏱': 'clock', '✔': 'check', '💡': 'info' };
function ICO(k) { const n = EMO[k] || k; return /^[a-zA-Z]+$/.test(n) ? `<i class="ico ico-${n}"></i>` : esc(k); }
const EMORX = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{1F900}-\u{1F9FF}\u{FE0F}\u{200D}⏱⏸⏯⏻⌨⌂⌖⎍]/gu;
const noEmo = s => String(s).replace(EMORX, '').replace(/\s{2,}/g, ' ').trim();

/* ---------- formattazione ---------- */
function fP(mw) { if (!isFinite(mw)) return '—'; const a = Math.abs(mw); return a < 0.9995 ? (mw * 1000).toFixed(0) + ' kW' : mw.toFixed(2) + ' MW'; }
function fQ(mv) { if (!isFinite(mv)) return '—'; const a = Math.abs(mv); return a < 0.9995 ? (mv * 1000).toFixed(0) + ' kvar' : mv.toFixed(2) + ' Mvar'; }
function fI(a) { return !isFinite(a) ? '—' : a < 10 ? a.toFixed(1) + ' A' : a.toFixed(0) + ' A'; }
function fV(pu) { return (pu * 20).toFixed(2) + ' kV'; }
function fF(f, n) { return f > 1 ? f.toFixed(n === undefined ? 3 : n) + ' Hz' : '— Hz'; }
function fPct(x) { return (x * 100).toFixed(0) + '%'; }
const pad = (v, n) => String(v).padStart(n || 2, '0');
function clkStr(clk, ms) { const t = Math.floor(clk), s = pad(Math.floor(t / 3600) % 24) + ':' + pad(Math.floor(t / 60) % 60) + ':' + pad(t % 60); return ms ? s + '.' + pad(Math.floor((clk - t) * 1000), 3) : s; }
function dateStr(doy) { const d = new Date(2026, 0, doy); return d.toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: 'long' }); }
/* orologio di un evento: orologio di sistema all'istante + millisecondi della dinamica */
function evClk(e) { return clkStr(e.clk + (e.t % 1) - (e.t % 1) + ((e.t * 1000) % 1000) / 1000 * 0, false) + '.' + pad(Math.floor((e.t * 1000) % 1000), 3); }

/* ---------- elementi ---------- */
function elIsl(el) { if (!el) return null; if (el.el === 'isl') return el.id; if (el.isl) return el.isl; if (el.a) return el.b.isl || el.a.isl; if (el.owner) return elIsl(el.owner); return null; }
const KIND_NM = { gen: 'Gruppo elettrogeno diesel', bess: 'Sistema di accumulo (BESS)', fdr: 'Linea MT 20 kV', node: 'Cabina secondaria MT/BT', seg: 'Tratto di linea MT', tie: 'Punto di apertura (contro-alimentazione)', bus: 'Sbarra MT 20 kV', br: 'Collegamento', isl: 'Rete isolana', sw: 'Interruttore di manovra-sezionatore (IMS)', pv: 'Fotovoltaico distribuito', coil: 'Messa a terra del neutro' };
function brOther(br, I) { const o = br.a.isl === I.id ? br.b : br.a; return o; }
function genStCls(G) { if (G.blocked) return 'st-al'; if (G.st === 'IN PARALLELO') return 'st-ok'; if (G.st === 'FERMO') return 'st-off'; return 'st-wa'; }
function brkState(b) { if (b.racked) return ['ESTRATTO', 'st-off']; return { C: ['CHIUSO', 'st-al'], O: ['APERTO', 'st-ok'], OP: ['IN APERTURA', 'st-wa'], CL: ['IN CHIUSURA', 'st-wa'] }[b.st]; }

/* ---------- notifiche ---------- */
function toast(msg, info, elId) {
  const d = document.createElement('div'); d.textContent = noEmo(msg); if (info) d.className = 'i';
  if (elId) { d.dataset.el = elId; d.classList.add('go'); d.title = 'Clic per aprire il componente'; }
  $('toast').appendChild(d); setTimeout(() => d.remove(), 6200);
  while ($('toast').children.length > 5) $('toast').firstChild.remove();
}
let AC = null;
function beep(prio) {
  if (!UI.snd) return;
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = 'square'; o.frequency.value = prio >= 3 ? 880 : 620;
    g.gain.setValueAtTime(0.0001, AC.currentTime); g.gain.exponentialRampToValueAtTime(0.06, AC.currentTime + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + (prio >= 3 ? 0.5 : 0.18));
    o.connect(g); g.connect(AC.destination); o.start(); o.stop(AC.currentTime + 0.55);
  } catch (e) { }
}
function modal(title, html) { $('mTitle').textContent = title; $('mBody').innerHTML = html; $('modal').classList.remove('hidden'); }
function closeModal() { $('modal').classList.add('hidden'); $('mBody').innerHTML = ''; }

/* ---------- comandi con selezione-esecuzione ---------- */
const ACT = {};
function confirmAsk(key, text, fn) {
  UI.conf = { key, text, fn, t: performance.now() };
  const c = document.querySelector('#fp .confirm');
  if (c) { c.querySelector('p').textContent = text; c.classList.add('on'); }
}
function confirmDo() {
  const c = UI.conf; UI.conf = null;
  const box = document.querySelector('#fp .confirm'); if (box) box.classList.remove('on');
  if (!c) return;
  const before = S.lastRefuse && S.lastRefuse.t;
  const ok = c.fn();
  if (S.lastRefuse && S.lastRefuse.t !== before && S.lastRefuse.t >= S.t - 0.01) toast('Comando rifiutato: ' + S.lastRefuse.msg);
  else if (ok === false) toast('Comando non eseguito (vedi registro eventi)');
}
function confirmNo() { UI.conf = null; const box = document.querySelector('#fp .confirm'); if (box) box.classList.remove('on'); }
document.addEventListener('click', e => {
  const t = e.target.closest('[data-a]'); if (!t) return;
  const a = t.dataset.a;
  if (ACT[a]) { e.preventDefault(); ACT[a](t.dataset.p, t); }
});
ACT.yes = () => confirmDo();
ACT.no = () => confirmNo();

/* ---------- selezione ---------- */
function selectIsl(id) {
  if (UI.isl === id) return;
  UI.isl = id; UI.hov = null;
  if (UI.sel && elIsl(UI.sel) !== id) UI.sel = S.islById[id];
  if (!UI.sel) UI.sel = S.islById[id];
  if (typeof sldInvalidate === 'function') sldInvalidate();
  if (typeof scopeIslandChanged === 'function') scopeIslandChanged();
  buildFace();
  refreshIslList(true);
}
function selectEl(el) {
  if (!el) return;
  const id = elIsl(el);
  if (id && id !== UI.isl) { UI.isl = id; if (typeof sldInvalidate === 'function') sldInvalidate(); if (typeof scopeIslandChanged === 'function') scopeIslandChanged(); refreshIslList(true); }
  UI.sel = el; UI.conf = null;
  buildFace();
}
