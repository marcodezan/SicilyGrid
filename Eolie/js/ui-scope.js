'use strict';
/* =====================================================================
   OSCILLOSCOPIO A 4 CANALI · DIAGRAMMA FASORIALE · SPETTRO ARMONICO · TREND
   Le forme d'onda sono ricostruite dai fasori di sequenza registrati a 1 kHz:
   v(t) = √2·Re{(V0 + α^k·V1 + α^-k·V2)·e^{jωt}} + armoniche + componente
   unidirezionale (continuità della corrente negli induttori) + rumore.
   ===================================================================== */
const SCC = ['#ffe14d', '#3ae6ff', '#ff6ad5', '#6dff8a'];
const SC = {
  ch: [{ on: true, src: '', q: 'a', div: 0 }, { on: true, src: '', q: 'b', div: 0 }, { on: true, src: '', q: 'c', div: 0 }, { on: false, src: '', q: '0', div: 0 }],
  tb: 10, run: true, trig: { mode: 'AUTO', ch: 0, lvl: 0, edge: 1 }, rec: 0, pos: 0, fft: false, frozen: null, lastWin: null, tau: 0.035, noise: true, autoIsl: true
};
const QV = [['a', 'L1-N'], ['b', 'L2-N'], ['c', 'L3-N'], ['ab', 'L1-L2'], ['bc', 'L2-L3'], ['ca', 'L3-L1'], ['0', '3V0 (residua)']];
const QI = [['a', 'I L1'], ['b', 'I L2'], ['c', 'I L3'], ['0', '3I0 (residua)']];
const TBS = [1, 2, 5, 10, 20, 50, 100, 200];
const DIVS = [0, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];

/* ---------- impostazioni rapide ---------- */
function scopePreset(kind, el) {
  const I = S.islById[UI.isl], bus = I.buses[0].id + '.V';
  const set = (i, src, q, on) => { SC.ch[i].src = src; SC.ch[i].q = q; SC.ch[i].on = on !== false; SC.ch[i].div = 0; };
  if (kind === 'bus') { set(0, bus, 'a'); set(1, bus, 'b'); set(2, bus, 'c'); set(3, bus, '0', false); SC.trig.ch = 0; SC.trig.lvl = 0; }
  else if (kind === 'lg') { set(0, bus, 'a'); set(1, bus, 'b'); set(2, bus, 'c'); set(3, bus, '0'); SC.tb = 20; }
  else if (kind === 'line' && el) { const s = el.id + '.I'; set(0, s, 'a'); set(1, s, 'b'); set(2, s, 'c'); set(3, s, '0'); SC.trig.ch = 0; SC.trig.lvl = 0; }
  else if (kind === 'sync' && el) { set(0, el.bus.id + '.V', 'a'); set(1, el.id + '.VM', 'a'); set(2, el.id + '.I', 'a'); set(3, bus, '0', false); SC.tb = 20; }
  else if (kind === 'gen' && el) { set(0, el.bus.id + '.V', 'a'); set(1, el.id + '.I', 'a'); set(2, el.id + '.I', 'b'); set(3, el.id + '.I', 'c'); }
  SC.frozen = null; SC.run = true;
  buildScopeCtl();
}
function scopeIslandChanged() {
  if (!SC.autoIsl) return;
  const keep = SC.ch.every(c => !c.src || (S.rec.byId[c.src] && S.rec.byId[c.src].isl === UI.isl));
  if (!keep || !SC.ch[0].src) scopePreset('bus');
}
function sigOptions(sel) {
  const R = S.rec; let h = '';
  const groups = {};
  R.sigs.forEach(s => { (groups[s.isl] = groups[s.isl] || []).push(s); });
  S.isl.forEach(I => { const L = groups[I.id] || []; if (!L.length) return; h += `<optgroup label="${esc(I.nm)}">` + L.map(s => `<option value="${s.id}" ${s.id === sel ? 'selected' : ''}>${esc(s.nm)}</option>`).join('') + '</optgroup>'; });
  return h;
}
function buildScopeCtl() {
  const R = S.rec;
  let h = '';
  SC.ch.forEach((c, i) => {
    const sg = R.byId[c.src], Q = sg && sg.kind === 'I' ? QI : QV;
    if (sg && !Q.find(q => q[0] === c.q)) c.q = 'a';
    h += `<div class="ch"><div class="sw" style="border-color:${SCC[i]};color:${c.on ? '#000' : SCC[i]};background:${c.on ? SCC[i] : 'transparent'}" data-a="scCh" data-p="${i}">${i + 1}</div>
      <select data-sc="src" data-i="${i}">${sigOptions(c.src)}</select>
      <span></span><div class="sub"><select data-sc="q" data-i="${i}">${Q.map(q => `<option value="${q[0]}" ${q[0] === c.q ? 'selected' : ''}>${q[1]}</option>`).join('')}</select>
      ${UI.expert ? `<select data-sc="div" data-i="${i}">${DIVS.map(d => `<option value="${d}" ${d === c.div ? 'selected' : ''}>${d ? d + (sg && sg.kind === 'I' ? ' A' : ' kV') + '/div' : 'auto'}</option>`).join('')}</select>` : ''}</div></div>`;
  });
  h += `<div class="sc-row"><label>Base tempi</label><select data-sc="tb">${TBS.map(t => `<option value="${t}" ${t === SC.tb ? 'selected' : ''}>${t} ms/div</option>`).join('')}</select>
    <button class="btn sm ${SC.run ? 'on' : ''}" data-a="scRun">${SC.run ? '■ STOP' : '▶ RUN'}</button><button class="btn sm ${SC.fft ? 'on' : ''}" data-a="scFft">Spettro</button></div>
    <div class="sc-row"><label>Trigger</label><select data-sc="tmode">${['AUTO', 'NORMALE', 'SINGOLO'].map(m => `<option ${m === SC.trig.mode ? 'selected' : ''}>${m}</option>`).join('')}</select>
    ${UI.expert ? `<select data-sc="tch">${[0, 1, 2, 3].map(i => `<option value="${i}" ${i === SC.trig.ch ? 'selected' : ''}>CH${i + 1}</option>`).join('')}</select>
    <select data-sc="tedge"><option value="1" ${SC.trig.edge > 0 ? 'selected' : ''}>↗ salita</option><option value="-1" ${SC.trig.edge < 0 ? 'selected' : ''}>↘ discesa</option></select>
    <label>livello</label><input type="number" data-sc="tlvl" value="${SC.trig.lvl}" step="any" style="width:64px">` : ''}</div>
    <div class="sc-row"><label>Sorgente</label><select data-sc="rec"><option value="0">● dal vivo</option>${R.recs.map(r => `<option value="${r.id}" ${r.id === SC.rec ? 'selected' : ''}>#${r.id} ${clkStr(r.clk)} ${esc(S.islById[r.isl] ? S.islById[r.isl].nm : '')} — ${esc(r.label.slice(0, 48))}</option>`).join('')}</select></div>
    ${SC.rec ? `<div class="sc-row"><label>Posizione</label><input type="range" min="0" max="100" value="${SC.pos}" data-sc="pos" style="flex:1"></div>` : ''}
    <div class="sc-row"><label>Preimpostazioni</label><button class="btn sm" data-a="scPre" data-p="bus">Tensioni sbarra</button><button class="btn sm" data-a="scPre" data-p="lg">Guasto a terra</button><button class="btn sm" data-a="scPre" data-p="sel">Elemento selezionato</button></div>
    ${UI.expert ? `<div class="sc-row"><label><input type="checkbox" data-sc="noise" ${SC.noise ? 'checked' : ''}> rumore di misura</label><label><input type="checkbox" data-sc="autoIsl" ${SC.autoIsl ? 'checked' : ''}> segui l'isola selezionata</label></div>` : ''}
    <p class="note">Trigger SINGOLO: imposta un livello superiore alla corrente normale per catturare il guasto. Le registrazioni dell'oscilloperturbografo partono da sole a ogni guasto/scatto (0,45 s pre-evento).</p>`;
  $('scopeCtl').innerHTML = h;
}
document.addEventListener('change', e => {
  const n = e.target, k = n.dataset && n.dataset.sc; if (!k) return;
  const i = +n.dataset.i;
  if (k === 'src') { SC.ch[i].src = n.value; SC.ch[i].div = 0; buildScopeCtl(); }
  else if (k === 'q') SC.ch[i].q = n.value;
  else if (k === 'div') SC.ch[i].div = +n.value;
  else if (k === 'tb') SC.tb = +n.value;
  else if (k === 'tmode') { SC.trig.mode = n.value; SC.run = true; SC.frozen = null; buildScopeCtl(); }
  else if (k === 'tch') SC.trig.ch = +n.value;
  else if (k === 'tedge') SC.trig.edge = +n.value;
  else if (k === 'tlvl') SC.trig.lvl = +n.value;
  else if (k === 'rec') { SC.rec = +n.value; SC.pos = 25; SC.frozen = null; if (SC.rec) { SC.tb = Math.max(SC.tb, 20); const r = S.rec.recs.find(x => x.id === SC.rec); if (r && r.isl !== UI.isl) { SC.autoIsl = false; } } buildScopeCtl(); }
  else if (k === 'noise') SC.noise = n.checked;
  else if (k === 'autoIsl') SC.autoIsl = n.checked;
});
document.addEventListener('input', e => { const n = e.target; if (n.dataset && n.dataset.sc === 'pos') SC.pos = +n.value; });
ACT.scCh = p => { SC.ch[+p].on = !SC.ch[+p].on; buildScopeCtl(); };
ACT.scRun = () => { SC.run = !SC.run; if (SC.run) SC.frozen = null; buildScopeCtl(); };
ACT.scFft = () => { SC.fft = !SC.fft; buildScopeCtl(); };
ACT.scPre = p => {
  if (p !== 'sel') return scopePreset(p);
  const el = UI.sel;
  if (!el) return;
  if (el.el === 'gen') scopePreset(el.st === 'PRONTO' ? 'sync' : 'gen', el);
  else if (el.el === 'fdr' || el.el === 'br') scopePreset('line', el);
  else if (el.el === 'bess') scopePreset('line', el);
  else if (el.el === 'node' || el.el === 'seg' || el.el === 'tie') scopePreset('line', el.fd || el.a.fd);
  else scopePreset('bus');
};

/* ---------- sintesi delle forme d'onda ---------- */
const AR = Math.cos(2 * Math.PI / 3), AI = Math.sin(2 * Math.PI / 3);
/* fasore della grandezza q a partire dalle sequenze (r1,i1,r2,i2,r0,i0) */
function qPhasor(src, k, q) {
  const r1 = src.get(k, 0), i1 = src.get(k, 1), r2 = src.get(k, 2), i2 = src.get(k, 3), r0 = src.get(k, 4), i0 = src.get(k, 5);
  /* α = e^{j120°}, α² = e^{-j120°} */
  const ph = (s1, s2) => { /* V0 + rot(V1,s1) + rot(V2,s2), s = 0 / +1 (α) / -1 (α²) */
    const rot = (r, i, s) => s === 0 ? [r, i] : [r * AR - s * i * AI, s * r * AI + i * AR];
    const a = rot(r1, i1, s1), b = rot(r2, i2, s2); return [r0 + a[0] + b[0], i0 + a[1] + b[1]];
  };
  switch (q) {
    case 'a': return ph(0, 0);
    case 'b': return ph(-1, 1);
    case 'c': return ph(1, -1);
    case 'ab': { const a = ph(0, 0), b = ph(-1, 1); return [a[0] - b[0], a[1] - b[1]]; }
    case 'bc': { const a = ph(-1, 1), b = ph(1, -1); return [a[0] - b[0], a[1] - b[1]]; }
    case 'ca': { const a = ph(1, -1), b = ph(0, 0); return [a[0] - b[0], a[1] - b[1]]; }
    case '0': return [3 * r0, 3 * i0];
  }
  return [0, 0];
}
const SQ2 = Math.SQRT2;
function inst(re, im, t) { const w = WB * t; return SQ2 * (re * Math.cos(w) - im * Math.sin(w)); }
/* prepara il canale sulla finestra di campioni [k0, k1]: fasore efficace, componente continua */
function prepChannel(c, src, k0, k1) {
  const pre = Math.min(k0, 250), ks = k0 - pre, n = k1 - ks + 1;
  const er = new Float64Array(n), ei = new Float64Array(n), dc = new Float64Array(n), tt = new Float64Array(n);
  const isI = src.kind === 'I';
  let hold = null, pr = 0, pi = 0, d = 0;
  const dec = Math.exp(-DT / SC.tau);
  for (let j = 0; j < n; j++) {
    const k = ks + j, t = src.t0 + k * DT;
    let [r, i] = qPhasor(src, k, c.q);
    tt[j] = t;
    if (isI && j > 0) {
      const mOld = Math.hypot(pr, pi), mNew = Math.hypot(r, i);
      if (hold) { /* interruzione al passaggio per lo zero della corrente */
        const v0 = inst(hold[0], hold[1], t - DT) + d, v1 = inst(hold[0], hold[1], t) + d * dec;
        if (v0 * v1 <= 0 || Math.abs(v1) < 0.02 * mOld) hold = null; else { r = hold[0]; i = hold[1]; }
      } else if (mOld > 0.5 && mNew < 0.45 * mOld) { hold = [pr, pi]; r = pr; i = pi; }
      d = d * dec + (inst(pr, pi, t) - inst(r, i, t));
      if (Math.abs(d) < 1e-6) d = 0;
    }
    er[j] = r; ei[j] = i; dc[j] = d; pr = r; pi = i;
  }
  return { er, ei, dc, tt, off: pre, isI, h: src.h };
}
function evalCh(P, j, t) {
  const j2 = Math.min(j + 1, P.er.length - 1), f = clamp((t - P.tt[j]) / DT, 0, 1);
  const r = P.er[j] + (P.er[j2] - P.er[j]) * f, i = P.ei[j] + (P.ei[j2] - P.ei[j]) * f;
  let v = inst(r, i, t);
  const m = Math.hypot(r, i);
  if (m > 1e-6 && P.h) { const ph = WB * t + Math.atan2(i, r); v += SQ2 * m * (P.h[0] * Math.cos(5 * ph + 0.4) + P.h[1] * Math.cos(7 * ph + 1.2)); }
  if (P.isI) v += P.dc[j] * Math.exp(-(t - P.tt[j]) / SC.tau);
  return v;
}
function niceDiv(peak) {
  const v = Math.max(peak / 3.6, 1e-3), e = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 5, 10]) if (m * e >= v) return m * e;
  return 10 * e;
}

/* ---------- disegno ---------- */
function scopeDraw() {
  const cv = $('scope'), dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
  if (!W || !H) return;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = '#020604'; g.fillRect(0, 0, W, H);
  const NX = 10, NY = 8, gx = W / NX, gy = H / NY;
  /* reticolo */
  g.strokeStyle = 'rgba(80,140,110,.22)'; g.lineWidth = 1; g.beginPath();
  for (let i = 1; i < NX; i++) { g.moveTo(i * gx + 0.5, 0); g.lineTo(i * gx + 0.5, H); }
  for (let i = 1; i < NY; i++) { g.moveTo(0, i * gy + 0.5); g.lineTo(W, i * gy + 0.5); }
  g.stroke();
  g.strokeStyle = 'rgba(120,200,160,.35)'; g.beginPath(); g.moveTo(W / 2, 0); g.lineTo(W / 2, H); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke();
  g.beginPath(); for (let i = 0; i < NX * 5; i++) { g.moveTo(i * gx / 5, H / 2 - 3); g.lineTo(i * gx / 5, H / 2 + 3); } for (let i = 0; i < NY * 5; i++) { g.moveTo(W / 2 - 3, i * gy / 5); g.lineTo(W / 2 + 3, i * gy / 5); } g.stroke();

  const Tw = SC.tb / 1000 * NX;
  /* sorgenti */
  const srcs = SC.ch.map(c => c.on && c.src ? recSrc(c.src, SC.rec) : null);
  const s0 = srcs.find(s => s);
  const rd = $('scopeRd');
  if (!s0 || s0.n < 50) { txt(g, 'Nessun segnale', W / 2, H / 2 - 10, '#4a7a62', '14px ' + FONTS, 'center'); rd.innerHTML = ''; return; }
  /* finestra temporale */
  let tEnd, tTrig = null;
  const tLast = s0.t0 + (s0.n - 1) * DT;
  if (SC.rec) {
    const rec = S.rec.recs.find(r => r.id === SC.rec), span = (s0.n - 1) * DT;
    const t0w = s0.t0 + Math.max(0, span - Tw) * SC.pos / 100;
    tEnd = Math.min(tLast, t0w + Tw); tTrig = rec ? rec.tTrig : null;
  } else if (!SC.run && SC.frozen) { tEnd = SC.frozen.tEnd; tTrig = SC.frozen.tTrig; }
  else {
    tEnd = tLast - 0.002;
    if (SC.tb <= 20 && srcs[SC.trig.ch]) {
      /* ricerca del trigger: attraversamento del livello nel canale scelto */
      const st = srcs[SC.trig.ch], c = SC.ch[SC.trig.ch];
      const kL = st.n - 3 - Math.ceil(Tw / 2 / DT), kMin = Math.max(5, kL - Math.ceil(0.12 / DT));
      const P = prepChannel(c, st, Math.max(0, kMin - 2), st.n - 1);
      let found = null;
      for (let k = kL; k > kMin; k--) {
        const j = k - (Math.max(0, kMin - 2) - P.off);
        if (j < 1 || j >= P.er.length) continue;
        const ta = P.tt[j - 1], tb = P.tt[j];
        const va = evalCh(P, j - 1, ta) - SC.trig.lvl, vb = evalCh(P, j, tb) - SC.trig.lvl;
        if (SC.trig.edge > 0 ? (va < 0 && vb >= 0) : (va > 0 && vb <= 0)) { found = ta + (tb - ta) * (-va / ((vb - va) || 1e-9)); break; }
      }
      if (found) { tTrig = found; tEnd = found + Tw / 2; if (SC.trig.mode === 'SINGOLO') { SC.run = false; SC.frozen = { tEnd, tTrig }; buildScopeCtl(); } }
      else if (SC.trig.mode !== 'AUTO' && SC.lastWin) { tEnd = SC.lastWin.tEnd; tTrig = SC.lastWin.tTrig; }
      if (SC.trig.mode === 'NORMALE' && SC.lastWin && tLast - SC.lastWin.tEnd > 4) { /* oltre il buffer */ }
    }
    SC.lastWin = { tEnd, tTrig };
  }
  const tStart = tEnd - Tw;
  if (SC.fft) return fftDraw(g, W, H, srcs, tEnd);
  /* canali */
  const reads = [];
  SC.ch.forEach((c, i) => {
    const src = srcs[i]; if (!src) return;
    const k0 = Math.max(0, Math.floor((tStart - src.t0) / DT) - 1), k1 = Math.min(src.n - 1, Math.ceil((tEnd - src.t0) / DT) + 1);
    if (k1 <= k0) return;
    const P = prepChannel(c, src, k0, k1);
    const step = Math.max(1, Math.round(W / 900));
    const pts = []; let pk = 0;
    for (let x = 0; x <= W; x += step) {
      const t = tStart + x / W * Tw, j = clamp(Math.floor((t - src.t0) / DT) - (k0 - P.off), 0, P.er.length - 1);
      let v = evalCh(P, j, t);
      if (SC.noise) v += (Math.sin(x * 12.9898 + i * 78.233 + S.n * 0.37) * 43758.5453 % 1) * 0.004 * (pk || 1);
      pts.push(v); pk = Math.max(pk, Math.abs(v));
    }
    const div = c.div || niceDiv(pk);
    c.curDiv = div;
    g.strokeStyle = SCC[i]; g.lineWidth = 1.4; g.beginPath();
    pts.forEach((v, n) => { const x = n * step, y = H / 2 - v / div * gy; n ? g.lineTo(x, clamp(y, -10, H + 10)) : g.moveTo(x, clamp(y, -10, H + 10)); });
    g.stroke(); g.shadowBlur = 0;
    /* marcatore di canale */
    g.fillStyle = SCC[i]; g.beginPath(); g.moveTo(0, H / 2 - 6 + i * 0); g.lineTo(8, H / 2); g.lineTo(0, H / 2 + 6); g.fill();
    /* letture */
    const jE = P.er.length - 1, rms = Math.hypot(P.er[jE], P.ei[jE]);
    const jA = Math.max(0, jE - Math.round(0.04 / DT)), a0 = Math.atan2(P.ei[jA], P.er[jA]), a1 = Math.atan2(P.ei[jE], P.er[jE]);
    const fr = rms > 1e-3 ? 50 + wrapPi(a1 - a0) / (2 * Math.PI * (P.tt[jE] - P.tt[jA])) : 0;
    reads.push({ i, rms, ang: a1, f: fr, div, unit: src.kind === 'I' ? 'A' : 'kV', thd: src.h ? Math.hypot(src.h[0], src.h[1]) * 100 : 0, nm: src.nm, q: (src.kind === 'I' ? QI : QV).find(x => x[0] === c.q)[1] });
  });
  /* trigger */
  if (tTrig && tTrig >= tStart && tTrig <= tEnd) { const x = (tTrig - tStart) / Tw * W; g.strokeStyle = 'rgba(255,160,60,.6)'; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); g.setLineDash([]); txt(g, 'T', x + 3, 12, '#ffa03c', '700 11px ' + FONTM); }
  const ref = reads[0] ? reads[0].ang : 0;
  rd.innerHTML = reads.map(r => `<span style="color:${SCC[r.i]}">CH${r.i + 1} ${esc(r.q)} · ${esc(r.nm)} · ${r.div} ${r.unit}/div · ${r.unit === 'kV' ? r.rms.toFixed(2) : r.rms.toFixed(1)} ${r.unit} eff · ${r.f > 1 ? r.f.toFixed(2) + ' Hz' : '—'} · ${r.i ? ((wrapPi(r.ang - ref) * 180 / Math.PI).toFixed(1) + '°') : '0°'}${r.thd ? ' · THD ' + r.thd.toFixed(1) + '%' : ''}</span>`).join('') +
    `<span style="color:#7f98a6">${SC.tb} ms/div · ${SC.rec ? 'registrazione #' + SC.rec : SC.run ? 'RUN ' + SC.trig.mode : 'STOP'}${S.paused ? ' · PAUSA' : ''}</span>`;
  txt(g, (SC.rec ? 'REC #' + SC.rec : SC.run ? (tTrig ? "TRIG'D" : 'AUTO') : 'STOP'), W - 8, 14, SC.run ? '#6dff8a' : '#ff8a8a', '700 11px ' + FONTM, 'right');
  phasorDraw(reads, srcs);
}
function phasorDraw(reads, srcs) {
  const cv = $('phasor'), dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = '#05080a'; g.fillRect(0, 0, W, H);
  const cx0 = W / 2, cy0 = H / 2 + 6, R = Math.min(W, H) / 2 - 16;
  g.strokeStyle = '#1c2a33'; g.lineWidth = 1; [0.33, 0.66, 1].forEach(f => { g.beginPath(); g.arc(cx0, cy0, R * f, 0, 7); g.stroke(); });
  g.beginPath(); g.moveTo(cx0 - R, cy0); g.lineTo(cx0 + R, cy0); g.moveTo(cx0, cy0 - R); g.lineTo(cx0, cy0 + R); g.stroke();
  txt(g, 'Diagramma fasoriale', 6, 13, COL.dim, '10px ' + FONTS);
  if (!reads.length) return;
  const ref = reads[0].ang;
  const mV = Math.max(1e-6, ...reads.filter(r => r.unit === 'kV').map(r => r.rms)), mI = Math.max(1e-6, ...reads.filter(r => r.unit === 'A').map(r => r.rms));
  reads.forEach(r => {
    const m = r.rms / (r.unit === 'kV' ? mV : mI) * R * (r.unit === 'A' ? 0.8 : 1), a = r.ang - ref;
    const x = cx0 + Math.cos(a) * m, y = cy0 - Math.sin(a) * m;
    g.strokeStyle = SCC[r.i]; g.fillStyle = SCC[r.i]; g.lineWidth = 2; g.setLineDash(r.unit === 'A' ? [5, 3] : []);
    g.beginPath(); g.moveTo(cx0, cy0); g.lineTo(x, y); g.stroke(); g.setLineDash([]);
    const ah = 7, an = Math.atan2(y - cy0, x - cx0);
    if (m > 8) { g.beginPath(); g.moveTo(x, y); g.lineTo(x - ah * Math.cos(an - 0.4), y - ah * Math.sin(an - 0.4)); g.lineTo(x - ah * Math.cos(an + 0.4), y - ah * Math.sin(an + 0.4)); g.fill(); }
    txt(g, 'CH' + (r.i + 1), x + (x > cx0 ? 4 : -28), y + (y > cy0 ? 12 : -4), SCC[r.i], '10px ' + FONTM);
  });
  txt(g, 'continua = tensione · tratteggio = corrente', 6, H - 6, COL.dim, '9px ' + FONTS);
}
function fftDraw(g, W, H, srcs, tEnd) {
  const c = SC.ch[0], src = srcs[0]; if (!src) return;
  const cyc = 10, Tw = cyc / 50, k1 = Math.min(src.n - 1, Math.floor((tEnd - src.t0) / DT)), k0 = Math.max(0, k1 - Math.round(Tw / DT) - 2);
  const P = prepChannel(c, src, k0, k1);
  const N = 2000, t0 = P.tt[P.tt.length - 1] - Tw, amps = [];
  const samp = new Float64Array(N);
  for (let n = 0; n < N; n++) { const t = t0 + n * Tw / N, j = clamp(Math.floor((t - src.t0) / DT) - (k0 - P.off), 0, P.er.length - 1); samp[n] = evalCh(P, j, t); }
  for (let h = 0; h <= 25; h++) {
    let re = 0, im = 0; const f = 50 * h; /* frequenza nominale */
    for (let n = 0; n < N; n++) { const a = 2 * Math.PI * f * n * Tw / N; re += samp[n] * Math.cos(a); im += samp[n] * Math.sin(a); }
    amps.push(Math.hypot(re, im) / N * (h ? 2 : 1) / SQ2);
  }
  const f1 = amps[1] || 1e-9, thd = Math.sqrt(amps.slice(2).reduce((a, v) => a + v * v, 0)) / f1 * 100;
  g.fillStyle = '#020604'; g.fillRect(0, 0, W, H);
  const bw = (W - 60) / 26, base = H - 26;
  txt(g, 'Spettro armonico CH1 (' + (src.kind === 'I' ? 'A' : 'kV') + ' eff, finestra 10 cicli) · THD ' + thd.toFixed(2) + ' %', 10, 16, SCC[0], '11px ' + FONTM);
  amps.forEach((a, h) => {
    const rel = a / f1, hh = h === 1 ? (base - 30) : Math.min(base - 30, rel * 100 / 10 * (base - 30));
    g.fillStyle = h === 1 ? SCC[0] : h === 0 ? '#ff9a2e' : '#3ae6ff'; g.fillRect(40 + h * bw, base - hh, bw * 0.7, hh);
    txt(g, String(h), 40 + h * bw + bw * 0.35, base + 12, COL.dim, '9px ' + FONTM, 'center');
    if (h > 1 && rel > 0.002) txt(g, (rel * 100).toFixed(1) + '%', 40 + h * bw + bw * 0.35, base - hh - 3, COL.tx, '9px ' + FONTM, 'center');
  });
  txt(g, 'fondamentale = 100% (scala armoniche: 10% fondo scala)', W - 10, 16, COL.dim, '10px ' + FONTS, 'right');
  $('scopeRd').innerHTML = `<span style="color:${SCC[0]}">CH1 fondamentale ${amps[1].toFixed(2)} ${src.kind === 'I' ? 'A' : 'kV'} · componente continua ${amps[0].toFixed(2)} · THD ${thd.toFixed(2)}%</span>`;
}

/* ---------- trend ---------- */
const TR = { win: 60, src: 'fast', show: { f: true, P: true, V: true } };
function buildTrendCtl() {
  $('trendCtl').innerHTML = `<div class="pset"><label>Finestra</label><select id="trWin">${[[10, '10 s'], [60, '60 s'], [-6, '6 h (orologio)'], [-24, '24 h (orologio)']].map(o => `<option value="${o[0]}" ${o[0] === TR.win ? 'selected' : ''}>${o[1]}</option>`).join('')}</select></div>
  <p class="note">Trend dell'isola selezionata. Rapido: campionamento 10 ms (oscillazioni elettromeccaniche, risposta dei regolatori). Lento: un punto per minuto di orologio.</p>
  <div id="trLeg"></div>`;
  $('trWin').onchange = e => { TR.win = +e.target.value; };
}
function trendDraw() {
  const cv = $('trend'), dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
  if (!W || !H) return;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = '#05080a'; g.fillRect(0, 0, W, H);
  const I = S.islById[UI.isl], slow = TR.win < 0;
  const T = slow ? S.ts : S.tf, N = slow ? TS_N : TF_N;
  let n = slow ? Math.min(T.n, Math.round(-TR.win * 60)) : Math.min(T.n, Math.round(TR.win / 0.01));
  if (n < 2) { txt(g, 'Dati in raccolta…', W / 2, H / 2, COL.dim, '12px ' + FONTS, 'center'); return; }
  const idx = k => (T.idx - n + k + N) % N;
  const ser = key => { const a = T.ser[key], o = new Float32Array(n); for (let k = 0; k < n; k++) o[k] = a[idx(k)]; return o; };
  const L = 52, R = 10, h1 = H * 0.36, h2 = H * 0.42, h3 = H - h1 - h2;
  const panel = (y0, hh, data, cols, names, unit, fixed) => {
    let mn = Infinity, mx = -Infinity;
    data.forEach(d => d.forEach(v => { if (v > 1) { mn = Math.min(mn, v); mx = Math.max(mx, v); } }));
    if (fixed) { mn = Math.min(mn, fixed[0]); mx = Math.max(mx, fixed[1]); }
    if (!isFinite(mn)) { mn = 0; mx = 1; }
    if (mx - mn < 1e-3) { mx += 0.05; mn -= 0.05; }
    const pad2 = (mx - mn) * 0.08; mn -= pad2; mx += pad2;
    g.strokeStyle = '#1a262e'; g.lineWidth = 1; g.strokeRect(L, y0 + 4, W - L - R, hh - 10);
    for (let q = 0; q <= 4; q++) { const y = y0 + 4 + (hh - 10) * q / 4, v = mx - (mx - mn) * q / 4; g.strokeStyle = '#121c22'; g.beginPath(); g.moveTo(L, y); g.lineTo(W - R, y); g.stroke(); txt(g, v.toFixed(unit === 'Hz' ? 2 : unit === 'kV' ? 2 : 2), L - 4, y + 3, COL.dim, '9px ' + FONTM, 'right'); }
    txt(g, unit, 6, y0 + 14, COL.tx, '10px ' + FONTS);
    data.forEach((d, s) => { g.strokeStyle = cols[s]; g.lineWidth = 1.4; g.beginPath(); let first = true; for (let k = 0; k < n; k++) { const v = d[k]; if (unit === 'Hz' && v < 1) { first = true; continue; } const x = L + (W - L - R) * k / (n - 1), y = y0 + 4 + (hh - 10) * (mx - v) / (mx - mn); first ? g.moveTo(x, y) : g.lineTo(x, y); first = false; } g.stroke(); });
    let lx = L + 6; names.forEach((nm, s) => { txt(g, '■ ' + nm, lx, y0 + 16, cols[s], '10px ' + FONTS); g.font = '10px ' + FONTS; lx += g.measureText('■ ' + nm).width + 12; });
    return [mn, mx];
  };
  const f = ser(I.id + '.f');
  const fr = panel(0, h1, [f], ['#ffe14d'], ['frequenza ' + I.nm], 'Hz', [49.8, 50.2]);
  /* soglie */
  [[49, 'UFLS 1'], [50.3, 'FV storici'], [49.7, '']].forEach(([v, lab]) => { if (v > fr[0] && v < fr[1]) { const y = 4 + (h1 - 10) * (fr[1] - v) / (fr[1] - fr[0]); g.strokeStyle = 'rgba(255,64,64,.35)'; g.setLineDash([3, 4]); g.beginPath(); g.moveTo(L, y); g.lineTo(W - R, y); g.stroke(); g.setLineDash([]); if (lab) txt(g, lab, W - R - 4, y - 2, 'rgba(255,120,120,.7)', '9px ' + FONTS, 'right'); } });
  const pcols = ['#ffa94d', '#ffe14d', '#3ae6ff', '#c9a2ff', '#e2edf3'];
  if (slow) panel(h1, h2, [ser(I.id + '.D'), ser(I.id + '.PV'), ser(I.id + '.B'), ser(I.id + '.L')].map(a => a.map(v => v * 1000)), pcols.slice(0, 2).concat(['#c9a2ff', '#e2edf3']), ['diesel', 'FV', 'BESS', 'carico'], 'kW');
  else {
    const gens = I.gens.filter(G => G.st !== 'FERMO' || T.ser[G.id + '.P'][idx(n - 1)] !== 0);
    const gc = ['#ffa94d', '#ff6a3d', '#ffd23d', '#8dff6a', '#4dd2ff', '#ff6ad5'];
    panel(h1, h2, gens.map(G => ser(G.id + '.P').map(v => v * 1000)).concat([ser(I.id + '.PV').map(v => v * 1000), ser(I.id + '.B').map(v => v * 1000)]), gens.map((G, k) => gc[k % gc.length]).concat(['#ffe14d', '#c9a2ff']), gens.map(G => G.short).concat(['FV', 'BESS']), 'kW');
  }
  panel(h1 + h2, h3, [ser(I.id + '.V').map(v => v * 20)], ['#6dff8a'], ['tensione sbarra'], 'kV', [19.6, 20.4]);
  const span = slow ? n + ' min' : (n * 0.01).toFixed(0) + ' s';
  txt(g, '← ' + span, W - R, H - 2, COL.dim, '9px ' + FONTM, 'right');
}
