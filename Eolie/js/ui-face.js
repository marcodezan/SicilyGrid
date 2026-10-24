'use strict';
/* =====================================================================
   PANNELLI DI COMANDO (faceplate) — comandi, misure, protezioni, parametri, guasti
   ===================================================================== */
let FG = [], FB = [];
function K(label, fn) { const i = FG.length; FG.push(fn); return `<span>${label}</span><b data-k="${i}"></b>`; }
function KV(...rows) { return `<div class="kv">${rows.join('')}</div>`; }
function SEC(title, body, right) { return `<div class="sec"><h5><span>${title}</span>${right || ''}</h5><div class="bd">${body}</div></div>`; }
function BTN(label, act, p, cls, dynFn) { const i = FB.length; FB.push(dynFn || null); return `<button class="btn ${cls || ''}" data-a="${act}" data-p="${esc(p === undefined ? '' : p)}" data-b="${i}">${label}</button>`; }
function ROW(...b) { return `<div class="row">${b.join('')}</div>`; }
function DYN(fn) { const i = FG.length; FG.push(fn); return `<span data-k="${i}"></span>`; }
const CONFIRM = '<div class="confirm"><p></p><div class="row"><button class="btn go" data-a="yes">Esegui</button><button class="btn" data-a="no">Annulla</button></div></div>';
const ADV = h => UI.expert ? h : '';
const FP_TABS = [['cmd', 'Comandi'], ['mis', 'Misure'], ['prot', 'Protezioni'], ['par', 'Parametri'], ['flt', 'Guasti']];

function buildFace() {
  const el = UI.sel || S.islById[UI.isl];
  FG = []; FB = [];
  const I = S.islById[elIsl(el)] || S.islById[UI.isl];
  $('fpTitle').innerHTML = esc((KIND_NM[el.el] || '') + ' · ' + (el.el === 'isl' ? el.nm : el.nm || el.id));
  const tabs = FP_TABS.filter(t => !(t[0] === 'prot' && !(el.relays && el.relays.length) && el.el !== 'br' && el.el !== 'isl' && el.el !== 'pv') && (UI.expert || (t[0] === 'cmd' || t[0] === 'flt')));
  if (!tabs.find(t => t[0] === UI.fpTab)) UI.fpTab = 'cmd';
  let h = (typeof heroHtml === 'function' ? heroHtml(el) : '') + `<div class="fpTabs">${tabs.map(t => `<button data-a="fpTab" data-p="${t[0]}" class="${UI.fpTab === t[0] ? 'on' : ''}">${t[1]}</button>`).join('')}</div>`;
  if (I && !I.com) h += `<div class="warn">RTU ${esc(I.nm)} non raggiungibile: misure non valide, telecomandi inibiti. Inviare una squadra per il ripristino della comunicazione.</div>`;
  const f = FACE[el.el] || FACE.isl;
  h += f[UI.fpTab] ? f[UI.fpTab](el, I) : '<p class="note">—</p>';
  h += CONFIRM;
  $('fp').innerHTML = h;
  applySecState($('fp'));
  UI.fpKey = el.id + ':' + UI.fpTab;
  UI.fpStruct = faceStruct(el);
  updFace();
}
ACT.fpTab = p => { UI.fpTab = p; buildFace(); };
function faceStruct(el) { return el && el.el === 'gen' ? el.st + (el.asyn ? 1 : 0) + (el.blocked ? 'b' : '') : el && el.el === 'bess' ? el.mode : ''; }
function updFace() {
  const root = $('fp');
  if (UI.sel && faceStruct(UI.sel) !== UI.fpStruct && !root.contains(document.activeElement) && !UI.conf) { buildFace(); return; }
  root.querySelectorAll('[data-k]').forEach(n => {
    const fn = FG[+n.dataset.k]; if (!fn) return;
    let r; try { r = fn(); } catch (e) { r = '—'; }
    if (Array.isArray(r)) { if (n.textContent !== r[0]) n.textContent = r[0]; n.className = r[1] || ''; }
    else if (typeof r === 'object' && r && r.html !== undefined) { if (n._h !== r.html) { n.innerHTML = r.html; n._h = r.html; } }
    else if (n.textContent !== String(r)) n.textContent = r;
  });
  root.querySelectorAll('[data-b]').forEach(n => {
    const fn = FB[+n.dataset.b]; if (!fn) return;
    const r = fn(); if (!r) return;
    if (r.dis !== undefined) n.disabled = r.dis;
    if (r.on !== undefined) n.classList.toggle('on', r.on);
    if (r.label !== undefined && n.textContent !== r.label) n.textContent = r.label;
  });
  root.querySelectorAll('input[data-pk]').forEach(n => { if (document.activeElement === n) return; const v = getPK(n.dataset.pk); if (n.type === 'checkbox') n.checked = !!v; else if (+n.value !== +v) n.value = fmtIn(v); });
  root.querySelectorAll('select[data-pk]').forEach(n => { if (document.activeElement === n) return; const v = getPK(n.dataset.pk); if (n.value !== String(v)) n.value = String(v); });
  const sc = $('syncCv'); if (sc && typeof drawSync === 'function') drawSync(sc, UI.sel);
  if (UI.conf && performance.now() - UI.conf.t > 12000) confirmNo();
}
const fmtIn = v => typeof v === 'number' ? +v.toFixed(5) : v;

/* ---------- parametri modificabili (percorso: id|chiave|chiave2) ---------- */
function pkObj(pk) { const a = pk.split('|'); let o = a[0] === 'S.set' ? S.set : S.byId[a[0]] || S.islById[a[0]]; for (let i = 1; i < a.length - 1; i++) o = o[a[i]]; return [o, a[a.length - 1]]; }
function getPK(pk) { const [o, k] = pkObj(pk); return o ? o[k] : ''; }
function setPK(pk, v) {
  const [o, k] = pkObj(pk); if (!o) return;
  const old = o[k];
  o[k] = typeof old === 'number' ? +v : typeof old === 'boolean' ? !!v : v;
  /* effetti collaterali */
  const id = pk.split('|')[0], el = S.byId[id];
  if (el && el.el === 'gen' && k === 'Pn') { el.Sn = el.Pn / 0.8; el.In = el.Sn * IB; }
  if (el && (el.el === 'seg' || el.el === 'tie') && (k === 'km' || k === 't')) { const c = NET.cond[el.t]; el.z = cx(c[1] * el.km / ZB, c[2] * el.km / ZB); el.bsh = WB * c[3] * 1e-6 * el.km * ZB; el.Imax = c[4]; recomputeC0(S.islById[el.isl]); }
  if (el && el.el === 'node' && (k === 'kva')) el.zt = 0.05;
  if (el && el.el === 'bess' && k === 'Pn') el.Sn = el.Pn * 1.1;
  if (el && el.el === 'br' && (k === 'km')) { const c = NET.cond[el.kind === 'cab' ? 'sub' : 'sub']; if (el.kind === 'cab') { el.z = cx(c[1] * el.km / ZB, c[2] * el.km / ZB); el.bsh = WB * c[3] * 1e-6 * el.km * ZB; } }
  if (el && el.el === 'br' && k === 'mva') { el.Imax = el.kind === 'cab' ? NET.cond.sub[4] * el.mva / 5.5 : el.mva * IB; }
  soe(elIsl(el) || null, 'Parametro modificato: ' + (el ? el.nm : id) + ' · ' + k + ' = ' + o[k], 1, el);
  sldInvalidate();
}
function recomputeC0(I) { I.C0 = 0; I.segs.concat(I.ties).forEach(s => { I.C0 += NET.cond[s.t][3] * s.km; }); }
document.addEventListener('change', e => {
  const n = e.target; if (!n.dataset || !n.dataset.pk) return;
  setPK(n.dataset.pk, n.type === 'checkbox' ? n.checked : n.value);
  if (n.dataset.rb) buildFace();
});
function PIN(pk, label, unit, step, min, max) { return `<label>${label}</label><span><input type="number" data-pk="${pk}" step="${step || 'any'}" ${min !== undefined ? 'min="' + min + '"' : ''} ${max !== undefined ? 'max="' + max + '"' : ''}><span class="u">${unit || ''}</span></span>`; }
function PCK(pk, label) { return `<label>${label}</label><span><input type="checkbox" data-pk="${pk}"></span>`; }
function PSEL(pk, label, opts, rb) { return `<label>${label}</label><span><select data-pk="${pk}" ${rb ? 'data-rb="1"' : ''}>${opts.map(o => `<option value="${o[0]}">${o[1]}</option>`).join('')}</select></span>`; }
function PSET(...r) { return `<div class="pset">${r.join('')}</div>`; }

/* ---------- tabella protezioni ---------- */
const SETL = { Is: 'Is [A]', t: 't [s]', tms: 'TMS', curve: 'curva', V0: 'V0> [pu]', V: 'V [pu]', k: 'I> [×In]', P: 'P [×Pn]', Q: 'Q [×Sn]', I2: 'I2 [×In]', ang: 'angolo [°]', f: 'f [Hz]', w: 'n> [pu]', T: 'T [°C]', p: 'p [bar]', df: 'Δf [Hz]', dv: 'ΔV [pu]', dphi: 'Δφ [°]', dead: 'chiusura su sbarra morta', t1: 'pausa rapida [s]', t2: 'pausa lenta [s]', rcl: 'tempo di recupero [s]', fmin: 'f< [Hz]', fmax: 'f> [Hz]', vmin: 'V< [pu]', vmax: 'V> [pu]', tf: 't freq. [s]', tv: 't tens. [s]', soc: 'SoC min [%]', tau: 'cost. termica [s]' };
function relTable(rels) {
  if (!rels.length) return '<p class="note">Nessuna protezione</p>';
  let h = '<table class="rel">';
  rels.forEach(r => {
    const id = r.id;
    h += `<tr><td style="width:16px">${DYN(() => ({ html: `<i class="led ${r.led ? 'on' : r.pk ? 'pk' : r.en ? '' : ''}"></i>` }))}</td><td class="c">${r.code}</td><td>${esc(r.nm)}<div class="pset" style="margin-top:3px">`;
    h += `<label>inserita</label><span><input type="checkbox" data-pk="${id}|en"></span>`;
    Object.keys(r.set).forEach(k => {
      const v = r.set[k];
      if (k === 'curve') h += PSEL(id + '|set|curve', SETL.curve, [['SI', 'IEC normalmente inversa'], ['VI', 'IEC molto inversa'], ['EI', 'IEC estremamente inversa'], ['DT', 'tempo definito']]);
      else if (typeof v === 'boolean') h += PCK(id + '|set|' + k, SETL[k] || k);
      else h += PIN(id + '|set|' + k, SETL[k] || k, '', 'any');
    });
    if (r.code === '25') h += PCK(id + '|byp', '<b style="color:#ff8a8a">ESCLUSIONE consenso (bypass)</b>');
    h += `</div>${DYN(() => r.last ? ['ultimo scatto: ' + r.last, 'note'] : ['', ''])}</td></tr>`;
  });
  return h + '</table>';
}
function relsOf(el) { return (el.relays || []).slice(); }

/* ---------- azioni ---------- */
const byId = id => S.byId[id] || S.islById[id];
ACT.brk = p => { const [id, c] = p.split(':'), b = byId(id); confirmAsk('brk', (c === 'C' ? 'CHIUSURA ' : 'APERTURA ') + b.nm + ' ?' + (c === 'C' ? pickupWarn(b) : ''), () => opBrk(b, c)); };
function pickupWarn(b) { if (!b.owner || b.owner.el !== 'fdr') return ''; const k = pickupCheck(b.owner); if (!k || k.ok) return ''; return ' — Attenzione: carico da riprendere ≈ ' + fP(k.est) + ', riserva disponibile ' + fP(k.res) + ' su ' + fP(k.cap) + ' in servizio: la linea probabilmente riscatterà per sottofrequenza. Avvia prima altri gruppi o rialimenta a tronchi.'; }
ACT.rack = p => { const [id, c] = p.split(':'), b = byId(id); confirmAsk('rack', (c === '1' ? 'ESTRAZIONE carrello ' : 'INSERZIONE carrello ') + b.nm + ' ?', () => brkRack(b, c === '1')); };
ACT.bsync = p => { const b = byId(p); if (b.asyn) { brkAutoSync(b, false); return; } confirmAsk('bsync', 'Inserire il sincronizzatore di parallelo su ' + b.nm + '? (agisce sui regolatori dell\'isola)', () => brkAutoSync(b, true)); };
ACT.gstart = p => { const G = byId(p); confirmAsk('g', 'AVVIAMENTO ' + G.nm + ' ?', () => startGen(G, 'OP')); };
ACT.gstop = p => { const G = byId(p); confirmAsk('g', 'ARRESTO (scarico in rampa) ' + G.nm + ' ?', () => stopGen(G, 'OP')); };
ACT.gestop = p => { const G = byId(p); confirmAsk('g', 'ARRESTO DI EMERGENZA ' + G.nm + ' (apertura immediata interruttore e stop motore) ?', () => { if (!comOk(G, 'OP')) return false; emergencyStop(G, 'pulsante operatore'); }); };
ACT.gsync = p => { const G = byId(p); genAutoSync(G, !G.asyn); };
ACT.gmode = p => { const [id, m] = p.split(':'); genSetMode(byId(id), m); };
ACT.graise = p => { const [id, w, k] = p.split(':'); genRaise(byId(id), w, +k); };
ACT.gauto = p => { const G = byId(p); G.auto = !G.auto; G.byEms = G.auto; soe(G.isl, G.nm + ': gestione ' + (G.auto ? 'AUTOMATICA (EMS)' : 'MANUALE operatore'), 1, G); };
ACT.sw = p => { const [id, c] = p.split(':'), el = byId(id), w = el.sw || el; confirmAsk('sw', (c === 'C' ? 'CHIUSURA ' : 'APERTURA ') + w.nm + ' ?', () => swCmd(w, c === 'C')); };
ACT.crew = p => { const el = byId(p); confirmAsk('crew', 'Inviare la squadra su ' + el.nm + '?', () => sendCrew(el)); };
ACT.rreset = p => { relReset(byId(p)); toast('Reset segnalazioni: ' + byId(p).nm, true); };
ACT.fpiReset = p => fpiReset(byId(p));
ACT.motor = p => { const [id, c] = p.split(':'), N = byId(id); confirmAsk('m', c === 'stop' ? 'ARRESTO motori ' + N.nm + '?' : 'AVVIAMENTO motori ' + N.nm + (c === 'soft' ? ' con soft-starter' : ' DIRETTO (spunto ≈ 6 In)') + '?', () => motorCmd(N, c !== 'stop', c === 'soft')); };
ACT.lv = p => { const [id, c] = p.split(':'), N = byId(id); confirmAsk('lv', (c === 'C' ? 'CHIUSURA' : 'APERTURA') + ' interruttore BT generale cabina ' + N.nm + '?', () => lvBrkCmd(N, c === 'C')); };
ACT.brun = p => { const B = byId(p); if (!comOk(B, 'OP')) return; B.run = !B.run; if (!B.run && devClosed(B.brk)) brkCmd(B.brk, 'O', 'arresto convertitore', 'OP'); S.topoDirty = true; soe(B.isl, B.nm + ': convertitore ' + (B.run ? 'ACCESO' : 'SPENTO'), 1, B); };
ACT.bmode = p => { const [id, m] = p.split(':'); bessSet(byId(id), 'mode', m); buildFace(); };
ACT.bauto = p => { const B = byId(p); B.auto = !B.auto; soe(B.isl, B.nm + ': gestione ' + (B.auto ? 'AUTOMATICA (EMS)' : 'MANUALE'), 1, B); };
ACT.bp = p => { const [id, k] = p.split(':'), B = byId(id); if (!comOk(B, 'OP')) return; B.auto = false; B.Pset = clamp(B.Pset + (+k) * 0.05 * B.Pn, -B.Pn, B.Pn); };
ACT.inj = p => {
  const el = byId(p), root = $('fp');
  const loc = root.querySelector('#fLoc').value, kind = root.querySelector('#fKind').value, perm = root.querySelector('#fPerm').value === '1', rf = +root.querySelector('#fRf').value, x = root.querySelector('#fX') ? +root.querySelector('#fX').value / 100 : 0.5;
  const stuck = root.querySelector('#fStuck') && root.querySelector('#fStuck').checked;
  confirmAsk('f', 'Simulare: guasto ' + FKIND[kind] + (perm ? ' permanente' : ' transitorio') + ' su ' + el.nm + '?', () => {
    if (stuck) { const b = el.el === 'fdr' ? el.brk : el.fd ? (el.el === 'node' ? el.fd.brk : el.fd.brk) : null; if (b) equipFault(b, 'stuck'); }
    injectFault({ el, loc, kind, perm, rf, x });
  });
};
ACT.eqf = p => { const [id, k] = p.split(':'), el = byId(id); confirmAsk('eq', 'Simulare avaria su ' + el.nm + '?', () => equipFault(el, k)); };

/* ---------- sincronoscopio ---------- */
function syncSource(el) {
  if (!el) return null;
  if (el.el === 'gen' && el.st === 'PRONTO' && !devClosed(el.brk)) return syncData(el.brk);
  if (el.el === 'br') { for (const b of [el.brkA, el.brkB]) { if (b && !devClosed(b)) { const sd = syncData(b); if (sd && sd.live1 && sd.live2 && !sd.same) return sd; } } }
  return null;
}
function drawSync(cv, el) {
  const dpr = (window.devicePixelRatio || 1) * (UI.zf || 1), w = cv.clientWidth, h = cv.clientHeight;
  if (w < 60 || h < 60) return;
  if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  const sd = syncSource(el), cx0 = 95, cy0 = h / 2, R = Math.min(78, h / 2 - 12);
  g.fillStyle = '#05080a'; g.beginPath(); g.arc(cx0, cy0, R + 8, 0, 7); g.fill();
  g.strokeStyle = '#2c3a46'; g.lineWidth = 2; g.beginPath(); g.arc(cx0, cy0, R, 0, 7); g.stroke();
  /* finestra di consenso */
  const win = ((el.relays || el.brkA && el.brkA.relays || []).find(r => r.code === '25') || { set: { dphi: 12 } }).set.dphi * Math.PI / 180;
  g.strokeStyle = 'rgba(51,224,122,.6)'; g.lineWidth = 8; g.beginPath(); g.arc(cx0, cy0, R - 6, -Math.PI / 2 - win, -Math.PI / 2 + win); g.stroke();
  for (let i = 0; i < 24; i++) { const a = i / 24 * 2 * Math.PI; g.strokeStyle = '#55636e'; g.lineWidth = i % 6 ? 1 : 2; g.beginPath(); g.moveTo(cx0 + Math.sin(a) * (R - 2), cy0 - Math.cos(a) * (R - 2)); g.lineTo(cx0 + Math.sin(a) * (R - (i % 6 ? 8 : 14)), cy0 - Math.cos(a) * (R - (i % 6 ? 8 : 14))); g.stroke(); }
  txt(g, 'LENTO', cx0 - R + 14, cy0 + R - 4, COL.dim, '9px ' + FONTS, 'center'); txt(g, 'VELOCE', cx0 + R - 14, cy0 + R - 4, COL.dim, '9px ' + FONTS, 'center');
  txt(g, '↺', cx0 - R - 2, cy0 - R + 14, COL.dim, '12px ' + FONTS); txt(g, '↻', cx0 + R - 8, cy0 - R + 14, COL.dim, '12px ' + FONTS);
  if (!sd || !sd.live1 || !sd.live2) {
    txt(g, sd && !sd.live2 ? 'SBARRA MORTA' : 'NON ATTIVO', cx0, cy0 + 4, COL.dim, '600 11px ' + FONTS, 'center');
    txt(g, 'Il sincronoscopio si attiva con il gruppo PRONTO', 200, 30, COL.dim, '10px ' + FONTS);
    txt(g, 'e la sbarra in tensione.', 200, 44, COL.dim, '10px ' + FONTS);
    return;
  }
  const a = sd.dphi;
  g.strokeStyle = '#ffffff'; g.lineWidth = 3; g.lineCap = 'round'; g.beginPath(); g.moveTo(cx0 - Math.sin(a) * 14, cy0 + Math.cos(a) * 14); g.lineTo(cx0 + Math.sin(a) * (R - 12), cy0 - Math.cos(a) * (R - 12)); g.stroke(); g.lineCap = 'butt';
  g.fillStyle = '#c7d3da'; g.beginPath(); g.arc(cx0, cy0, 5, 0, 7); g.fill();
  const r25 = (el.relays || el.brkA.relays).find(r => r.code === '25'), p = r25 ? r25.set : { df: 0.15, dv: 0.08, dphi: 12 };
  const okF = Math.abs(sd.df) <= p.df, okV = Math.abs(sd.dv) <= p.dv, okP = Math.abs(a) * 180 / Math.PI <= p.dphi;
  const x = 200; let y = 24;
  const line = (lab, val, ok) => { g.fillStyle = ok ? COL.ok : COL.al; g.beginPath(); g.arc(x, y - 4, 5, 0, 7); g.fill(); txt(g, lab, x + 10, y, COL.tx, '11px ' + FONTS); txt(g, val, w - 8, y, COL.hi, '600 12px ' + FONTM, 'right'); y += 20; };
  line('Δf (scorrimento)', (sd.df >= 0 ? '+' : '') + sd.df.toFixed(3) + ' Hz', okF);
  line('ΔV', (sd.dv >= 0 ? '+' : '') + (sd.dv * 100).toFixed(1) + ' %', okV);
  line('Δφ', (a * 180 / Math.PI).toFixed(1) + ' °', okP);
  y += 4;
  txt(g, 'macchina/arrivo  ' + sd.f1.toFixed(3) + ' Hz  ' + (sd.v1 * 20).toFixed(2) + ' kV', x, y, COL.dim, '10px ' + FONTM); y += 14;
  txt(g, 'sbarra/partenza  ' + sd.f2.toFixed(3) + ' Hz  ' + (sd.v2 * 20).toFixed(2) + ' kV', x, y, COL.dim, '10px ' + FONTM); y += 18;
  const all = okF && okV && okP;
  g.fillStyle = all ? '#0f3a22' : '#2a0d0d'; g.fillRect(x, y - 12, w - x - 8, 20); g.strokeStyle = all ? COL.ok : '#6b1d1d'; g.strokeRect(x, y - 12, w - x - 8, 20);
  txt(g, all ? 'CONSENSO 25: SÌ' : 'CONSENSO 25: NO', x + (w - x - 8) / 2, y + 2, all ? COL.ok : '#ff8a8a', '700 11px ' + FONTS, 'center');
}

/* ---------- pannelli per tipo ---------- */
const GEN_FAULTS = [['gtrip', 'Trip protezioni motore'], ['cool', 'Avaria raffreddamento'], ['fuel', 'Filtri gasolio intasati'], ['govHunt', 'Pendolamento regolatore'], ['govStuck', 'Cremagliera bloccata'], ['lof', 'Perdita di eccitazione'], ['avrRun', 'AVR in avaria (sovraeccitazione)'], ['nostart', 'Mancato avviamento'], ['oil', 'Perdita olio'], ['cyl', 'Cilindro in avaria']];
function brkBlock(b, I, title, extra) {
  return SEC(title || 'Interruttore', KV(K('Stato', () => { const s = brkState(b); return [s[0], s[1].replace('st-', '')]; }), K('Manovre / scatti', () => b.ops + ' / ' + b.trips)) +
    ROW(BTN('Chiudi', 'brk', b.id + ':C', 'dg', () => ({ dis: devClosed(b) || b.racked })), BTN('Apri', 'brk', b.id + ':O', 'go', () => ({ dis: !devClosed(b) }))) + (extra || '') +
    (UI.expert || b.racked || b.stuck ? ROW(BTN('Estrai carrello', 'rack', b.id + ':1', 'sm', () => ({ dis: b.racked })), BTN('Inserisci carrello', 'rack', b.id + ':0', 'sm', () => ({ dis: !b.racked }))) : '') +
    DYN(() => b.stuck ? ['Interruttore bloccato meccanicamente (mancata apertura)', 'warn'] : b.failClose ? ['Bobina di chiusura guasta', 'warn'] : ['', '']));
}
function crewBlock(el) {
  return DYN(() => {
    const c = (S.crews || []).find(x => x.el === el);
    if (c) return { html: `<div class="note">${ICO('wrench')} Squadra al lavoro: ${Math.ceil(c.t)} s</div>` };
    return { html: crewNeeded(el) ? `<button class="btn wa" data-a="crew" data-p="${el.id}" style="width:100%">${ICO('wrench')} Invia squadra di pronto intervento</button>` : '' };
  });
}
function faultForm(el, locs, withX) {
  return `<div class="pset">
    <label>Posizione</label><span><select id="fLoc">${locs.map(l => `<option value="${l[0]}">${l[1]}</option>`).join('')}</select></span>
    <label>Tipo</label><span><select id="fKind"><option value="LLL">Trifase (L1-L2-L3)</option><option value="LL">Bifase (L2-L3)</option><option value="LG">Monofase a terra (L1-T)</option></select></span>
    <label>Natura</label><span><select id="fPerm"><option value="0">Transitorio (arco)</option><option value="1">Permanente</option></select></span>
    <label>Resistenza di guasto</label><span><select id="fRf"><option value="0">0 Ω (franco)</option><option value="2">2 Ω</option><option value="10">10 Ω</option><option value="50">50 Ω</option><option value="400">400 Ω (resistivo)</option></select></span>
    ${withX ? '<label>Distanza dall\'inizio</label><span><input id="fX" type="number" value="50" min="0" max="100" step="5"> %</span>' : ''}
  </div>` + (el.fd || el.el === 'fdr' ? `<label class="note"><input type="checkbox" id="fStuck"> con mancata apertura dell'interruttore di linea (50BF)</label>` : '') +
    ROW(BTN(ICO('warning') + ' Simula guasto', 'inj', el.id, 'wa'));
}
const FACE = {};
FACE.gen = {
  cmd: (G, I) => ADV(SEC('Stato', KV(K('Sequenza', () => [G.blocked ? 'BLOCCO' : G.st, G.blocked ? 'al' : G.st === 'IN PARALLELO' ? 'ok' : G.st === 'FERMO' ? '' : 'wa']), K('Gestione', () => G.auto ? 'AUTOMATICA (EMS)' : 'MANUALE'), K('Regolatore', () => MODE_NM[G.mode]), K('P / Q', () => fP(G.Pe) + ' / ' + fQ(G.Qe)), K('Velocità', () => Math.round(G.w * G.rpm) + ' giri/min · ' + (G.w * 50).toFixed(3) + ' Hz'), K('Ultimo scatto', () => G.lastTrip || '—')) +
    ROW(BTN(ICO('play') + ' Avvia', 'gstart', G.id, 'go', () => ({ dis: G.st !== 'FERMO' || G.blocked })), BTN(ICO('stop') + ' Arresta', 'gstop', G.id, '', () => ({ dis: G.st === 'FERMO' || G.st === 'ARRESTO' })), BTN(ICO('power') + ' Emergenza', 'gestop', G.id, 'dg')) +
    ROW(BTN('', 'gauto', G.id, 'sm', () => ({ on: G.auto, label: G.auto ? 'EMS: AUTOMATICO' : 'EMS: MANUALE' })), BTN('Reset blocchi', 'rreset', G.id, 'sm')))) +
    (UI.expert || G.st === 'PRONTO' || G.asyn ? SEC('Parallelo · sincronoscopio', '<canvas id="syncCv"></canvas>' +
      ROW(BTN('f −', 'graise', G.id + ':f:-1', 'sm'), BTN('f +', 'graise', G.id + ':f:1', 'sm'), BTN('V −', 'graise', G.id + ':v:-1', 'sm'), BTN('V +', 'graise', G.id + ':v:1', 'sm')) +
      ROW(BTN('', 'gsync', G.id, '', () => ({ on: G.asyn, label: G.asyn ? 'SINCRONIZZATORE: INSERITO' : 'Sincronizzatore automatico', dis: G.st !== 'PRONTO' && !G.asyn })))) : '') +
    brkBlock(G.brk, I, 'Interruttore di macchina') +
    ADV(SEC('Regolatore di velocità', KV(K('Riferimento f', () => G.fref.toFixed(2) + ' Hz'), K('Potenza impostata', () => fP(G.Pset)), K('Statismo', () => (G.R * 100).toFixed(1) + ' %'), K('Cremagliera / turbo', () => fPct(G.rack) + ' / ' + fPct(G.boost))) +
      ROW(BTN('ISOCRONO', 'gmode', G.id + ':ISO', 'sm', () => ({ on: G.mode === 'ISO' })), BTN('STATISMO', 'gmode', G.id + ':DROOP', 'sm', () => ({ on: G.mode === 'DROOP' })), BTN('P COSTANTE', 'gmode', G.id + ':BASE', 'sm', () => ({ on: G.mode === 'BASE' }))) +
      ROW(BTN('P −', 'graise', G.id + ':p:-1', 'sm'), BTN('P +', 'graise', G.id + ':p:1', 'sm'), BTN('f −', 'graise', G.id + ':f:-1', 'sm'), BTN('f +', 'graise', G.id + ':f:1', 'sm')) +
      '<p class="note">ISOCRONO: frequenza a 50 Hz con ripartizione del carico tra i gruppi isocroni. STATISMO: P = Pset + (fref − f)/(R·50)·Pn. In MANUALE l\'EMS non interviene sul gruppo.</p>')) +
    ADV(SEC('Regolatore di tensione (AVR)', KV(K('Riferimento', () => fV(G.Vref)), K('Tensione eccitazione Efd', () => G.Efd.toFixed(2) + ' pu'), K('Statismo reattivo', () => (G.kqd * 100).toFixed(1) + ' %')) + ROW(BTN('V −', 'graise', G.id + ':v:-1', 'sm'), BTN('V +', 'graise', G.id + ':v:1', 'sm')))) +
    crewBlock(G),
  mis: G => SEC('Grandezze elettriche', KV(K('Potenza attiva', () => fP(G.Pe)), K('Potenza reattiva', () => fQ(G.Qe)), K('Potenza apparente', () => (Math.hypot(G.Pe, G.Qe) * 1000).toFixed(0) + ' kVA'), K('cos φ', () => { const s = Math.hypot(G.Pe, G.Qe); return s > 0.001 ? (G.Pe / s).toFixed(3) + (G.Qe >= 0 ? ' ind.' : ' cap.') : '—'; }), K('Corrente statore (20 kV)', () => fI(G.Ia)), K('Corrente inversa I2', () => fI(G.I2a || 0)), K('Tensione morsetti', () => fV(devClosed(G.brk) ? G.bus.Vm : G.Eq * G.w)), K('Angolo di carico δ', () => devClosed(G.brk) && G.bus.live ? (wrapPi(G.d - G.bus.th) * 180 / Math.PI).toFixed(1) + ' °' : '—'), K("F.e.m. transitoria E'q", () => G.Eq.toFixed(3) + ' pu'), K('Tensione di eccitazione', () => G.Efd.toFixed(2) + ' pu'), K('Carico', () => fPct(G.Pe / G.Pn)))) +
    SEC('Motore diesel', KV(K('Velocità', () => Math.round(G.w * G.rpm) + ' / ' + G.rpm + ' giri/min'), K('Potenza meccanica', () => fP(G.Pm)), K('Cremagliera combustibile', () => fPct(G.rack)), K('Pressione sovralimentazione', () => (G.boost * 2.4).toFixed(2) + ' bar'), K('Temperatura acqua', () => [G.Tc.toFixed(1) + ' °C', G.Tc > 92 ? 'al' : G.Tc > 88 ? 'wa' : '']), K('Temperatura gas di scarico', () => [G.Tex.toFixed(0) + ' °C', G.Tex > 560 ? 'wa' : '']), K('Pressione olio', () => [G.oil.toFixed(1) + ' bar', G.oil < 2 && genRunning(G) ? 'al' : '']), K('Consumo gasolio', () => G.fuel.toFixed(0) + ' l/h'), K('Consumo specifico', () => G.Pe > 0.01 ? (G.fuel * 840 / (G.Pe * 1000)).toFixed(0) + ' g/kWh' : '—'), K('Ore di moto', () => G.hours.toFixed(0) + ' h'))),
  prot: G => SEC('Protezioni di macchina e motore', relTable(relsOf(G))) + ROW(BTN('Reset segnalazioni / blocco 86G', 'rreset', G.id)),
  par: G => SEC('Dati di targa e modello', PSET(PIN(G.id + '|Pn', 'Potenza nominale', 'MW', 0.05), PIN(G.id + '|H', 'Costante d\'inerzia H', 's', 0.1), PIN(G.id + '|D', 'Smorzamento D', 'pu', 1), PIN(G.id + '|xdp', "Reattanza transitoria X'd", 'pu', 0.01), PIN(G.id + '|xd', 'Reattanza sincrona Xd', 'pu', 0.1), PIN(G.id + '|x2', 'Reattanza inversa X2', 'pu', 0.01), PIN(G.id + '|xt', 'Reattanza trasformatore', 'pu', 0.01), PIN(G.id + '|Td0p', "Costante T'd0", 's', 0.1), PIN(G.id + '|rpm', 'Velocità nominale', 'giri/min', 250), PIN(G.id + '|tStart', 'Tempo di accelerazione', 's', 1), PIN(G.id + '|pmin', 'Minimo tecnico', 'pu', 0.05))) +
    SEC('Regolatore di velocità', PSET(PIN(G.id + '|R', 'Statismo R', 'pu', 0.005), PIN(G.id + '|gkp', 'Guadagno proporzionale', '', 1), PIN(G.id + '|gki', 'Guadagno integrale', '1/s', 0.5), PIN(G.id + '|kls', 'Ripartizione isocrona', '', 0.1), PIN(G.id + '|tAct', 'Costante attuatore', 's', 0.01), PIN(G.id + '|tTurbo', 'Costante turbocompressore', 's', 0.1))) +
    SEC('Regolatore di tensione', PSET(PIN(G.id + '|avkp', 'Guadagno proporzionale', '', 1), PIN(G.id + '|avki', 'Guadagno integrale', '1/s', 1), PIN(G.id + '|kqd', 'Statismo reattivo', 'pu', 0.01), PIN(G.id + '|efdMax', 'Tetto di eccitazione', 'pu', 0.1))) +
    '<p class="note">Le modifiche hanno effetto immediato sulla dinamica (provare ad esempio H piccolo o guadagni elevati per vedere oscillazioni e instabilità).</p>',
  flt: G => SEC('Avarie del gruppo', '<div class="row" style="flex-wrap:wrap">' + GEN_FAULTS.map(f => BTN(f[1], 'eqf', G.id + ':' + f[0], 'sm wa')).join('') + '</div>') +
    SEC('Guasto elettrico ai morsetti', faultForm(G, [['gen', 'Morsetti / avvolgimento statore (87G)']])) +
    SEC('Interruttore di macchina', ROW(BTN('Interruttore bloccato', 'eqf', G.brk.id + ':stuck', 'sm wa'), BTN('Mancata chiusura', 'eqf', G.brk.id + ':failClose', 'sm wa'))) + crewBlock(G)
};
FACE.bess = {
  cmd: (B, I) => SEC('Stato convertitore', KV(K('Modo', () => ({ OFF: 'SPENTO', GFL: 'GRID-FOLLOWING (segue la rete)', GFM: 'GRID-FORMING (forma la rete)' }[B.mode])), K('Convertitore', () => B.run ? ['ACCESO', 'ok'] : ['SPENTO', '']), K('P / Q', () => fP(B.P) + ' / ' + fQ(B.Q)), K('Stato di carica', () => [B.soc.toFixed(1) + ' %', B.soc < 15 ? 'al' : B.soc < 30 ? 'wa' : 'ok']), K('Gestione', () => B.auto ? 'AUTOMATICA (EMS)' : 'MANUALE'))) +
    SEC('Comandi', ROW(BTN('', 'brun', B.id, '', () => ({ label: B.run ? 'Spegni convertitore' : 'Accendi convertitore' })), BTN('', 'bauto', B.id, 'sm', () => ({ on: B.auto, label: B.auto ? 'EMS: AUTO' : 'EMS: MANUALE' }))) +
      ROW(BTN('GFL', 'bmode', B.id + ':GFL', 'sm', () => ({ on: B.mode === 'GFL' })), BTN('GFM', 'bmode', B.id + ':GFM', 'sm', () => ({ on: B.mode === 'GFM' })), BTN('OFF', 'bmode', B.id + ':OFF', 'sm', () => ({ on: B.mode === 'OFF' }))) +
      '<p class="note">Il cambio di modo richiede l\'interruttore aperto. In GRID-FORMING l\'accumulo può rimettere in tensione la rete (black start).</p>' +
      KV(K('Potenza impostata', () => fP(B.Pset) + (B.Pset >= 0 ? ' (scarica)' : ' (carica)'))) + ROW(BTN('carica +', 'bp', B.id + ':-1', 'sm'), BTN('scarica +', 'bp', B.id + ':1', 'sm')) +
      ADV(PSET(PIN(B.id + '|Pset', 'Setpoint P', 'MW', 0.01), PIN(B.id + '|Qset', 'Setpoint Q', 'Mvar', 0.01), PCK(B.id + '|Vctl', 'Regolazione di tensione'), PIN(B.id + '|Vref', 'Riferimento tensione', 'pu', 0.005)))) +
    brkBlock(B.brk, I, 'Interruttore BESS') + crewBlock(B),
  mis: B => SEC('Misure', KV(K('Potenza attiva', () => fP(B.P)), K('Potenza reattiva', () => fQ(B.Q)), K('Corrente (20 kV)', () => fI(B.Ia || 0)), K('Stato di carica', () => B.soc.toFixed(2) + ' %'), K('Energia disponibile', () => (B.soc / 100 * B.En * 1000).toFixed(0) + ' kWh'), K('Cicli equivalenti', () => B.cyc.toFixed(1)), K('Temperatura celle', () => B.Tcell.toFixed(1) + ' °C'), K('Frequenza virtuale (GFM)', () => B.mode === 'GFM' ? (B.w * 50).toFixed(3) + ' Hz' : '—'), K('F.e.m. virtuale (GFM)', () => B.mode === 'GFM' ? B.E.toFixed(3) + ' pu' : '—'), K('Limitazione di corrente', () => B.xvf > 1.05 ? 'ATTIVA (impedenza virtuale ×' + B.xvf.toFixed(1) + ')' : 'no'))),
  prot: B => SEC('Protezioni', relTable(relsOf(B))) + ROW(BTN('Reset segnalazioni', 'rreset', B.id)),
  par: B => SEC('Dati e regolazione', PSET(PIN(B.id + '|Pn', 'Potenza nominale', 'MW', 0.05), PIN(B.id + '|En', 'Energia nominale', 'MWh', 0.1), PIN(B.id + '|soc', 'Stato di carica', '%', 1), PIN(B.id + '|Rf', 'Statismo regolazione rapida (GFL)', 'pu', 0.005), PIN(B.id + '|dbf', 'Banda morta (GFL)', 'Hz', 0.01), PIN(B.id + '|Hsyn', 'Inerzia sintetica (GFL)', 's', 0.5), PIN(B.id + '|Hv', 'Inerzia virtuale (GFM)', 's', 0.5), PIN(B.id + '|Rv', 'Statismo (GFM)', 'pu', 0.005), PIN(B.id + '|Xv', 'Reattanza virtuale (GFM)', 'pu', 0.01), PIN(B.id + '|Imax', 'Limite di corrente (GFM)', 'pu', 0.05), PCK(B.id + '|iso', 'Regolazione secondaria (GFM isocrono)'))),
  flt: B => SEC('Avarie', ROW(BTN('Scatto BMS', 'eqf', B.id + ':btrip', 'sm wa'), BTN('Limitazione 50%', 'eqf', B.id + ':bderate', 'sm wa'), BTN('Guasto condizionamento', 'eqf', B.id + ':bhot', 'sm wa'))) + SEC('Interruttore', ROW(BTN('Interruttore bloccato', 'eqf', B.brk.id + ':stuck', 'sm wa'), BTN('Mancata chiusura', 'eqf', B.brk.id + ':failClose', 'sm wa'))) + crewBlock(B)
};
FACE.fdr = {
  cmd: (F, I) => SEC('Linea', KV(K('Stato', () => devClosed(F.brk) ? (F.bus.live ? ['IN SERVIZIO', 'ok'] : ['SENZA TENSIONE', 'al']) : ['FUORI SERVIZIO', 'wa']), K('Correnti L1/L2/L3', () => F.Iph.map(x => x.toFixed(0)).join(' / ') + ' A'), K('Portata', () => F.Inom + ' A (' + fPct(F.Iamp / F.Inom) + ')'), K('P / Q', () => fP(F.P) + ' / ' + fQ(F.Q)), K('Corrente omopolare 3I0', () => (F.I0f ? cabs(F.I0f) * 3 * IB : 0).toFixed(1) + ' A'), K('Causa apertura', () => ({ '': '—', UFLS: 'alleggerimento (UFLS)', '27': 'mancanza tensione (27)', BUS: 'scatto sbarra', DEF: 'scatto definitivo', OP: 'operatore', EMS: 'EMS' }[F.shedBy] || F.shedBy || '—')), K('Richiusura 79', () => F.rel79.en ? F.rec.st : 'esclusa'))) +
    brkBlock(F.brk, I, 'Interruttore di linea', ROW(BTN('Reset segnalazioni / definitivo', 'rreset', F.id, 'sm'))) +
    ADV(SEC('Alleggerimento del carico', PSET(PSEL(F.id + '|ufls', 'Gradino UFLS', [[0, 'non assegnata'], [1, '1° gradino'], [2, '2° gradino'], [3, '3° gradino'], [4, '4° gradino']]), PCK(F.rel79.id + '|en', 'Richiusura automatica (79)')))) +
    SEC('Cabine', DYN(() => ({ html: F.nodes.map(N => `<div class="kv"><span>${esc(N.nm)}</span><b class="${N.live ? '' : 'al'}">${N.live ? fP(N.Pl) + ' · ' + (N.Vm * 100).toFixed(1) + '%' : 'non alimentata'}</b></div>`).join('') })) + '<p class="note">Clic sulle cabine o sui tratti nello schema per i relativi comandi (IMS, indicatori di guasto).</p>'),
  mis: F => SEC('Misure di testa linea', KV(K('Corrente L1', () => fI(F.Iph[0])), K('Corrente L2', () => fI(F.Iph[1])), K('Corrente L3', () => fI(F.Iph[2])), K('3I0', () => (F.I0f ? cabs(F.I0f) * 3 * IB : 0).toFixed(2) + ' A'), K('Potenza attiva', () => fP(F.P)), K('Potenza reattiva', () => fQ(F.Q)), K('FV sottesa', () => fP(F.Ppv)), K('Corrente di picco stimata', () => fI(F.Ipk)), K('Capacità verso terra', () => (F.B0 / (WB * ZB) * 1e6).toFixed(2) + ' µF'))),
  prot: F => SEC('Protezioni di linea', relTable(relsOf(F))) + ROW(BTN('Reset segnalazioni', 'rreset', F.id)),
  par: F => SEC('Tratti', F.segs.map(sg => PSET(PIN(sg.id + '|km', sg.nm, 'km', 0.1))).join('')) + '<p class="note">Il tipo di conduttore si modifica dal pannello del singolo tratto.</p>',
  flt: F => SEC('Guasto sul primo tratto', faultForm(F.segs[0], [['seg', F.segs[0].nm]], true)) + SEC('Interruttore di linea', ROW(BTN('Interruttore bloccato', 'eqf', F.brk.id + ':stuck', 'sm wa'), BTN('Mancata chiusura', 'eqf', F.brk.id + ':failClose', 'sm wa')))
};
FACE.node = {
  cmd: (N, I) => SEC('Cabina secondaria', KV(K('Alimentazione', () => N.live ? ['da ' + (N.sup ? N.sup.short + ' ' + N.sup.nm.replace('Linea ', '') : '—'), 'ok'] : ['NON ALIMENTATA', 'al']), K('Tensione', () => N.live ? (N.Vm * 100).toFixed(1) + ' % (' + (N.Vm * 20).toFixed(2) + ' kV)' : '—'), K('Carico', () => fP(N.Pl) + ' / ' + fQ(N.Ql)), K('FV (disponibile)', () => (N.Ppv * 1000).toFixed(0) + ' kW (' + (N.Pav * 1000).toFixed(0) + ')'), K('Trasformatore', () => N.kva + ' kVA · ' + fPct(N.load)), K('Carico freddo', () => N.clpA > 0.02 ? '+' + (N.clpA * 100).toFixed(0) + ' %' : '—'), K('Fusibili MT', () => N.fuse ? ['integri', 'ok'] : ['INTERROTTI', 'al']), K('Interruttore BT', () => N.lvBrk ? (N.lvOut > 0 ? ['parziale (linea BT guasta)', 'wa'] : ['chiuso', '']) : ['APERTO', 'wa']))) +
    SEC('Comandi', ROW(BTN('Apri BT', 'lv', N.id + ':O', 'go', () => ({ dis: !N.lvBrk })), BTN('Chiudi BT', 'lv', N.id + ':C', 'dg', () => ({ dis: N.lvBrk })))) +
    (N.motor ? SEC('Motori MT (pompe ad alta pressione)', KV(K('Stato', () => N.motor.st + (N.motor.why && N.motor.st === 'SCATTATO' ? ' — ' + N.motor.why : '')), K('Avanzamento avviamento', () => fPct(N.motor.prog))) + ROW(BTN('Avvio diretto', 'motor', N.id + ':dol', 'dg'), BTN('Avvio soft-starter', 'motor', N.id + ':soft', 'go'), BTN('Arresto', 'motor', N.id + ':stop'))) : '') + crewBlock(N),
  mis: N => SEC('Carichi per tipologia', DYN(() => ({ html: Object.keys(N.loads).map(k => `<div class="kv"><span>${NET.loadTypes[k][0]}</span><b>${(N.loads[k] * profile(k, hourNow()) * S.set.demand).toFixed(0)} / ${N.loads[k]} kW</b></div>`).join('') }))) + SEC('Rete', KV(K('Impedenza dalla sbarra', () => N.live ? (cabs(N.Zp) * ZB).toFixed(2) + ' Ω' : '—'), K('Profondità (tratti)', () => N.live ? N.depth + 1 : '—'))),
  par: N => SEC('Carichi (potenza al picco del profilo)', PSET(...Object.keys(N.loads).map(k => PIN(N.id + '|loads|' + k, NET.loadTypes[k][0], 'kW', 5)), PIN(N.id + '|pv', 'Fotovoltaico installato', 'kWp', 5), PIN(N.id + '|kva', 'Trasformatore MT/BT', 'kVA', 50))),
  flt: N => SEC('Simulazione guasto in cabina', faultForm(N, [['node', 'Sbarra MT della cabina'], ['trq', 'Trasformatore MT/BT (interno)'], ['lv', 'Rete BT a valle']])) + crewBlock(N)
};
function segCmd(sg, I) {
  const w = sg.sw;
  return SEC(sg.el === 'tie' ? 'Punto di apertura' : 'Tratto', KV(K('Lunghezza / tipo', () => sg.km.toFixed(1) + ' km · ' + NET.cond[sg.t][0]), K('Corrente', () => fI(sg.I) + ' / ' + sg.Imax + ' A'), K('Indicatore RGDAT', () => sg.fpi.flag ? [sg.fpi.lg ? 'GUASTO A TERRA RILEVATO' : 'GUASTO POLIFASE RILEVATO', 'al'] : ['a riposo', '']), K('Guasto presente', () => S.faults.some(f => f.el === sg) ? ['SÌ' + (S.faults.some(f => f.el === sg && f.on) ? ' (alimentato)' : ' (isolato)'), 'al'] : ['no', '']))) +
    (w ? SEC(w.kind === 'NA' ? 'IMS di contro-alimentazione (normalmente aperto)' : 'IMS di sezionamento a monte del tratto', KV(K('Stato', () => w.tmr > 0 ? ['IN MANOVRA', 'wa'] : w.closed ? ['CHIUSO', 'al'] : ['APERTO', 'ok']), K('Manovre', () => w.ops)) +
      ROW(BTN('Chiudi', 'sw', sg.id + ':C', 'dg', () => ({ dis: w.closed || w.tmr > 0 })), BTN('Apri', 'sw', sg.id + ':O', 'go', () => ({ dis: !w.closed || w.tmr > 0 }))) + '<p class="note">L\'IMS interrompe la corrente di carico ma non la corrente di guasto: si manovra a linea aperta o senza guasto alimentato.</p>')
      : SEC('Sezionamento', '<p class="note">Il primo tratto è protetto e sezionato dall\'interruttore di linea in centrale.</p>')) +
    ROW(BTN('Reset indicatori RGDAT isola', 'fpiReset', sg.isl, 'sm')) + crewBlock(sg);
}
FACE.seg = {
  cmd: segCmd,
  mis: sg => SEC('Parametri elettrici', KV(K('R', () => (sg.z.r * ZB).toFixed(3) + ' Ω'), K('X', () => (sg.z.i * ZB).toFixed(3) + ' Ω'), K('Capacità', () => (sg.bsh / (WB * ZB) * 1e6).toFixed(3) + ' µF'), K('Corrente di guasto transitata', () => sg.If ? fI(sg.If) : '—'))),
  par: sg => SEC('Tratto', PSET(PIN(sg.id + '|km', 'Lunghezza', 'km', 0.1), PSEL(sg.id + '|t', 'Conduttore', Object.keys(NET.cond).filter(k => k !== 'hv' && k !== 'sub').map(k => [k, NET.cond[k][0]])))),
  flt: sg => SEC('Simulazione guasto sul tratto', faultForm(sg, [[sg.el === 'tie' ? 'tie' : 'seg', sg.nm]], true)) + crewBlock(sg)
};
FACE.tie = FACE.seg;
FACE.bus = {
  cmd: (B, I) => SEC('Sbarra', KV(K('Stato', () => B.live ? ['IN TENSIONE', 'ok'] : ['FUORI TENSIONE', 'al']), K('Tensione', () => fV(B.Vm) + ' (' + (B.Vm * 100).toFixed(1) + '%)'), K('Frequenza', () => fF(B.fm)), K('df/dt', () => B.rocof.toFixed(3) + ' Hz/s'), K('Sequenza inversa V2', () => (cabs(B.V2 || ZERO) * 100).toFixed(1) + ' %'), K('Spostamento del neutro V0', () => (cabs(B.V0 || ZERO) * 100).toFixed(1) + ' %'), K('Blocco 86', () => B.lock ? ['ATTIVO', 'al'] : ['no', '']))) + ROW(BTN('Reset blocco 86 / segnalazioni', 'rreset', B.id, 'wa')) + crewBlock(B),
  mis: B => SEC('Bilancio della sbarra', DYN(() => ({ html: B.gens.map(G => `<div class="kv"><span>${G.short}</span><b>${fP(G.Pe)}</b></div>`).join('') + B.bess.map(x => `<div class="kv"><span>BESS</span><b>${fP(x.P)}</b></div>`).join('') + B.feeders.map(F => `<div class="kv"><span>${F.short} ${esc(F.nm.replace('Linea ', ''))}</span><b>${fP(-F.P)}</b></div>`).join('') }))),
  prot: B => SEC('Protezione di sbarra', relTable(relsOf(B))),
  par: () => '<p class="note">Nessun parametro.</p>',
  flt: B => SEC('Guasto di sbarra', faultForm(B, [['bus', B.nm]]))
};
FACE.br = {
  cmd: (br, I) => {
    const sideNm = b => b === br.brkA ? (br.a.grid ? 'RTN' : br.a.nm + ' (' + S.islById[br.a.isl].nm + ')') : br.b.nm + ' (' + S.islById[br.b.isl].nm + ')';
    return SEC('Collegamento', KV(K('Stato', () => brClosed(br) ? ['IN SERVIZIO', 'ok'] : ['APERTO', 'wa']), K('Potenza (lato A)', () => fP(br.Sa.r) + ' / ' + fQ(br.Sa.i)), K('Corrente', () => fI(br.I) + ' / ' + Math.round(br.Imax) + ' A'), K('Immagine termica', () => fPct(Math.sqrt(br.th || 0))), K('Lunghezza', () => (br.km || 0) + ' km'))) +
      (br.kind !== 'cpl' ? SEC('Sincronoscopio', '<canvas id="syncCv"></canvas>' + '<p class="note">Il parallelo tra due isole richiede frequenze e fasi coincidenti. Il sincronizzatore regola i gruppi isocroni dell\'isola più piccola.</p>') : '') +
      brkBlock(br.brkA, I, 'Interruttore lato ' + sideNm(br.brkA), br.kind === 'cpl' ? '' : ROW(BTN('', 'bsync', br.brkA.id, 'sm', () => ({ on: !!br.brkA.asyn, label: br.brkA.asyn ? 'SINCRONIZZATORE INSERITO' : 'Chiudi con sincronizzatore', dis: devClosed(br.brkA) })))) +
      (br.brkB ? brkBlock(br.brkB, I, 'Interruttore lato ' + sideNm(br.brkB), ROW(BTN('', 'bsync', br.brkB.id, 'sm', () => ({ on: !!br.brkB.asyn, label: br.brkB.asyn ? 'SINCRONIZZATORE INSERITO' : 'Chiudi con sincronizzatore', dis: devClosed(br.brkB) })))) : '') + crewBlock(br);
  },
  mis: br => SEC('Flussi', KV(K('P lato A', () => fP(br.Sa.r)), K('Q lato A', () => fQ(br.Sa.i)), K('P lato B', () => fP(br.Sb.r)), K('Q lato B', () => fQ(br.Sb.i)), K('Perdite', () => ((br.Sa.r + br.Sb.r) * 1000).toFixed(1) + ' kW'), K('Potenza reattiva capacitiva', () => (br.bsh * 1000).toFixed(0) + ' kvar'))),
  prot: br => SEC('Protezioni', relTable(relsOf(br))) + ROW(BTN('Reset segnalazioni', 'rreset', br.id)),
  par: br => SEC('Collegamento', br.kind === 'cab' ? PSET(PIN(br.id + '|km', 'Lunghezza', 'km', 0.1), PIN(br.id + '|Imax', 'Portata', 'A', 10)) : PSET(PIN(br.id + '|Imax', 'Portata', 'A', 10))),
  flt: br => (br.kind === 'cab' ? SEC('Guasto sul cavo', faultForm(br, [['cab', br.nm]], true)) : '') + SEC('Interruttori', ROW(BTN('Lato A bloccato', 'eqf', br.brkA.id + ':stuck', 'sm wa')) + (br.brkB ? ROW(BTN('Lato B bloccato', 'eqf', br.brkB.id + ':stuck', 'sm wa')) : '')) + crewBlock(br)
};
FACE.isl = {
  cmd: (I) => {
    const A = () => I.area, b = I.buses[0];
    return SEC('Rete ' + I.nm, KV(K('Stato', () => !b.live ? ['FUORI TENSIONE', 'al'] : A().grid ? ['CONNESSA ALLA RTN', 'ok'] : A().isl.length > 1 ? ['IN PARALLELO CON ' + A().isl.filter(x => x !== I.id).map(x => S.islById[x].nm).join(', '), 'ok'] : ['ESERCIZIO ISOLATO', 'ok']), K('Frequenza / tensione', () => fF(b.fm) + ' / ' + fV(b.Vm)), K('Carico servito', () => fP(I.nodes.reduce((a, N) => a + (N.live ? N.Pl : 0), 0))), K('Carico non alimentato', () => { let p = 0; I.nodes.forEach(N => { if (!N.live) p += nodeLoad(N, hourNow(), 0)[0] / 1000; }); return [fP(p), p > 0.001 ? 'al' : '']; }), K('Diesel in servizio', () => I.gens.filter(g => g.st === 'IN PARALLELO').length + ' / ' + I.gens.length), K('Riserva rotante', () => A().st ? fP(A().st.res) + (A().need ? ' (richiesta ' + fP(A().need) + ')' : '') : '—'), K('Criterio N-1', () => A().n1ok === undefined ? '—' : A().n1ok ? ['soddisfatto', 'ok'] : ['NON soddisfatto', 'wa']), K('FV distribuito', () => fP(I.pv.P) + ' di ' + fP(I.pv.Pav) + ' disponibili'), K('Irraggiamento', () => I.pv.irr.toFixed(0) + ' W/m²'), K('Ultima azione EMS', () => I.ems.last || '—'))) +
      (UI.expert ? '' : SEC('Automazione di centrale (EMS)', PSET(PCK(I.id + '|ems|on', 'EMS inserito (gestione automatica)'), PCK(I.id + '|ems|uc', 'Avvio/arresto automatico gruppi'), PCK(I.id + '|ems|restore', 'Rialimentazione automatica')) + '<p class="note">Disinserisci l\'EMS per gestire l\'isola completamente a mano.</p>')) +
      ADV(SEC('Automazione di centrale (EMS)', PSET(PCK(I.id + '|ems|on', 'EMS inserito'), PCK(I.id + '|ems|uc', 'Avvio/arresto automatico gruppi'), PCK(I.id + '|ems|n1', 'Criterio di sicurezza N-1'), PIN(I.id + '|ems|rPct', 'Riserva rotante minima', '× carico', 0.05), PIN(I.id + '|ems|rMin', 'Riserva minima assoluta', 'MW', 0.05), PCK(I.id + '|ems|restore', 'Rialimentazione automatica carichi'), PCK(I.id + '|ems|blackstart', 'Rimessa in tensione automatica'), PCK(I.id + '|ems|pvCurt', 'Limitazione FV automatica'), PCK(I.id + '|ems|bess', 'Gestione automatica accumulo'), PCK(I.id + '|ems|hotGrid', 'Riserva calda con RTN connessa'), PIN(I.id + '|ems|socLo', 'Avvio diesel sotto SoC', '%', 5), PIN(I.id + '|ems|socHi', 'Arresto diesel sopra SoC', '%', 5)))) +
      ADV(SEC('Fotovoltaico distribuito', PSET(PIN(I.id + '|pv|curt', 'Limite di immissione (operatore)', '× 1', 0.05, 0, 1)) + KV(K('Limitazione EMS', () => fPct(I.pv.curtEms))) + I.pv.groups.map((g, k) => `<div class="kv" style="margin-top:4px"><span>${esc(g.nm)} · ${fPct(g.frac)}</span><b data-k="${FG.push(() => g.on ? (g.ramp < 1 ? ['rampa ' + fPct(g.ramp), 'wa'] : ['in servizio', 'ok']) : ['distaccato: ' + g.why, 'al']) - 1}"></b></div>` + PSET(PIN(I.id + '|pv|groups|' + k + '|fmin', 'f<', 'Hz', 0.1), PIN(I.id + '|pv|groups|' + k + '|fmax', 'f>', 'Hz', 0.1), PIN(I.id + '|pv|groups|' + k + '|frac', 'quota', '', 0.05))).join(''))) +
      ROW(BTN('Reset indicatori RGDAT', 'fpiReset', I.id, 'sm')) + crewBlock(I);
  },
  mis: I => SEC('Neutro e guasti a terra', KV(K('Gestione del neutro', () => I.coil.on ? 'compensato (bobina di Petersen)' : 'isolato'), K('Capacità verso terra', () => I.C0.toFixed(2) + ' µF'), K('Corrente capacitiva', () => (3 * WB * I.C0 * 1e-6 * VPH * 1000).toFixed(1) + ' A'), K('Spostamento neutro V0', () => [(I.V0 * 100).toFixed(1) + ' %', I.V0 > 0.15 ? 'al' : '']), K('Corrente di guasto a terra', () => I.Ig.toFixed(2) + ' A'))) +
    SEC('Bilancio', DYN(() => ({ html: I.gens.map(G => `<div class="kv"><span>${G.short} · ${G.st}</span><b>${fP(G.Pe)}</b></div>`).join('') + I.bess.map(x => `<div class="kv"><span>BESS (${x.mode})</span><b>${fP(x.P)}</b></div>`).join('') + `<div class="kv"><span>FV</span><b>${fP(I.pv.P)}</b></div>` }))),
  prot: I => SEC('Alleggerimento automatico del carico (UFLS)', PSET(PCK(I.id + '|ufls|en', 'Schema UFLS inserito'), ...I.ufls.stages.map((s, k) => PIN(I.id + '|ufls|stages|' + k + '|f', (k + 1) + '° gradino', 'Hz', 0.1) + PIN(I.id + '|ufls|stages|' + k + '|t', '  ritardo', 's', 0.05)), PCK(I.id + '|ufls|rocof|en', 'Gradino df/dt (gradini 1-2)'), PIN(I.id + '|ufls|rocof|df', 'soglia df/dt', 'Hz/s', 0.1), PIN(I.id + '|ufls|rocof|t', 'ritardo df/dt', 's', 0.05)) + DYN(() => ({ html: '<p class="note">Linee: ' + I.feeders.map(F => F.short + '→' + (F.ufls || '—')).join(', ') + '</p>' }))) +
    SEC('Messa a terra del neutro', PSET(PCK(I.id + '|coil|on', 'Bobina di Petersen inserita'), PIN(I.id + '|coil|over', 'Sovracompensazione', 'pu', 0.05), PIN(I.id + '|coil|loss', 'Perdite bobina', 'pu', 0.01))),
  par: I => SEC('Domanda e clima (globali)', PSET(PIN('S.set|demand', 'Fattore di domanda', '× 1', 0.05), PSEL('S.set|weather', 'Meteo', [['sereno', 'Sereno'], ['variabile', 'Variabile'], ['coperto', 'Coperto'], ['temporale', 'Temporale']]), PIN('S.set|repT', 'Durata interventi squadra', 's', 5), PCK('S.set|prot', 'Protezioni elettriche attive'))),
  flt: I => SEC('Eventi', ROW(BTN('Perdita comunicazione RTU', 'eqf', I.id + ':com', 'sm wa')) + ROW(BTN('Nube sul FV (40 s)', 'cloud', I.id, 'sm')) + ROW(BTN('Ricaduta di cenere sui moduli', 'ash', I.id, 'sm'))) + crewBlock(I)
};
const PVLIM = [1, 0.75, 0.5, 0.25, 0];
ACT.pvLim = p => { const [id, k] = p.split(':'); const I = byId(id).I; runCmdF(() => pvLimit(I, +k)); };
ACT.pvSw = p => { const [id, on] = p.split(':'), I = byId(id).I; confirmAsk('pv', on === '1' ? 'Consentire la riconnessione degli inverter FV di ' + I.nm + '?' : 'TELESCATTO di tutti gli inverter FV di ' + I.nm + '?', () => pvSwitch(I, on === '1')); };
ACT.pvNode = p => { const [id, on] = p.split(':'), N = byId(id); confirmAsk('pv', (on === '1' ? 'Riconnettere' : 'Distaccare') + ' il FV della cabina ' + N.nm + '?', () => pvNode(N, on === '1')); };
function runCmdF(fn) { const b = S.lastRefuse && S.lastRefuse.t; fn(); if (S.lastRefuse && S.lastRefuse.t !== b) toast('Comando rifiutato: ' + S.lastRefuse.msg); }
FACE.pv = {
  cmd: (P) => { const I = P.I;
    return SEC('Produzione', KV(K('Potenza immessa', () => fP(I.pv.P)), K('Potenza disponibile (sole)', () => fP(I.pv.Pav)), K('Irraggiamento', () => I.pv.irr.toFixed(0) + ' W/m²'), K('Potenza installata', () => (I.pv.kwp / 1000).toFixed(2) + ' MWp su ' + I.nodes.filter(N => N.pv > 0).length + ' cabine'), K('Limite operatore', () => fPct(I.pv.curt)), K('Limitazione automatica (EMS)', () => I.pv.curtEms < 0.999 ? ['−' + fPct(1 - I.pv.curtEms), 'wa'] : 'nessuna'))) +
      SEC('Limite di immissione', '<div class="row">' + PVLIM.map(k => BTN(Math.round(k * 100) + '%', 'pvLim', P.id + ':' + k, 'sm', () => ({ on: Math.abs(I.pv.curt - k) < 0.01 }))).join('') + '</div><p class="note">Riduce la potenza degli inverter (tutte le cabine dell\'isola). Utile per tenere i diesel sopra il minimo tecnico.</p>') +
      SEC('Inverter', I.pv.groups.filter(g => g.frac > 0).map(g => `<div class="kv"><span>${esc(g.nm)} · ${fPct(g.frac)}</span><b data-k="${FG.push(() => g.on ? (g.ramp < 1 ? ['in rientro ' + fPct(g.ramp), 'wa'] : ['connessi', 'ok']) : ['distaccati: ' + g.why, 'al']) - 1}"></b></div>`).join('') +
        ROW(BTN('Telescatto inverter', 'pvSw', P.id + ':0', 'dg', () => ({ dis: I.pv.opOff })), BTN('Consenti riconnessione', 'pvSw', P.id + ':1', 'go', () => ({ dis: !I.pv.opOff }))) +
        '<p class="note">In automatico gli inverter si distaccano da soli se frequenza o tensione escono dalle soglie e rientrano dopo 20 s di rete regolare, in rampa. Quelli con tarature storiche (49,7–50,3 Hz) sono i più sensibili.</p>');
  },
  mis: (P) => SEC('FV per cabina', DYN(() => ({ html: '<table class="dt">' + P.I.nodes.filter(N => N.pv > 0).map(N => `<tr data-a="goEl" data-p="${N.id}"><td>${esc(N.nm)}</td><td class="n">${N.pv} kWp</td><td class="n">${N.pvOff ? 'distaccato' : (N.Ppv * 1000).toFixed(0) + ' kW'}</td></tr>`).join('') + '</table>' }))),
  prot: (P) => SEC('Protezione di interfaccia (SPI) degli inverter', P.I.pv.groups.map((g, k) => `<div class="note" style="color:#c9d6de;margin-top:6px">${esc(g.nm)}</div>` + PSET(PIN(P.isl + '|pv|groups|' + k + '|frac', 'quota della potenza', '', 0.05), PIN(P.isl + '|pv|groups|' + k + '|fmin', 'f<', 'Hz', 0.1), PIN(P.isl + '|pv|groups|' + k + '|fmax', 'f>', 'Hz', 0.1), PIN(P.isl + '|pv|groups|' + k + '|vmin', 'V<', 'pu', 0.05), PIN(P.isl + '|pv|groups|' + k + '|vmax', 'V>', 'pu', 0.05), PIN(P.isl + '|pv|groups|' + k + '|tf', 'ritardo f', 's', 0.05), PCK(P.isl + '|pv|groups|' + k + '|lfsm', 'riduzione in sovrafrequenza (LFSM-O)'))).join('')),
  par: (P) => SEC('Impianti', PSET(...P.I.nodes.filter(N => N.pv > 0 || true).map(N => PIN(N.id + '|pv', N.nm, 'kWp', 5)))),
  flt: (P) => SEC('Eventi sul fotovoltaico', ROW(BTN('Nube sul FV (40 s)', 'cloud', P.isl, 'sm')) + ROW(BTN('Ricaduta di cenere sui moduli', 'ash', P.isl, 'sm')) + ROW(BTN('Telescatto inverter', 'pvSw', P.id + ':0', 'sm wa')))
};
ACT.cloud = p => { const I = byId(p); I.cvT = 40; I.cvD = 0.85; soe(I.id, 'Meteo: nube su ' + I.nm, 1, I); };
ACT.ash = p => { const I = byId(p); I.ash = I.ash > 0 ? 0 : 0.6; soe(I.id, I.ash ? 'Ricaduta di cenere vulcanica sui moduli FV di ' + I.nm + ' (−60%)' : 'Moduli FV puliti', 2, I); };
