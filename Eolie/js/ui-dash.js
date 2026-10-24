'use strict';
/* =====================================================================
   PANNELLI (apri / chiudi / ingrandisci) · DASHBOARD · GIOCO (obiettivi e punteggio)
   ===================================================================== */

/* ---------------- disposizione dei pannelli ---------------- */
UI.lay = { left: true, right: true, bottom: false, max: null };
UI.expert = false;
UI.secClosed = {};
try { const s = JSON.parse(localStorage.getItem('eolie.ui2') || 'null'); if (s) { Object.assign(UI.lay, s.lay || {}); UI.expert = !!s.expert; UI.secClosed = s.sec || {}; } } catch (e) { }
function saveUi() { try { localStorage.setItem('eolie.ui2', JSON.stringify({ lay: UI.lay, expert: UI.expert, sec: UI.secClosed })); } catch (e) { } }
function uiScale() {
  UI.zf = clamp(Math.min(window.innerWidth / 1600, window.innerHeight / 880), 0.85, 1.6);
  document.documentElement.style.setProperty('--z', UI.zf.toFixed(3)); $('app').style.setProperty('--z', UI.zf.toFixed(3));
}
function applyLayout() {
  uiScale();
  const a = $('app'), L = UI.lay, m = L.max;
  a.classList.toggle('hideL', !L.left || m === 'center');
  a.classList.toggle('hideR', !L.right || m === 'center');
  a.classList.toggle('hideB', !L.bottom || m === 'center');
  a.classList.toggle('maxB', m === 'bottom');
  a.style.setProperty('--rw', m === 'right' ? 'min(calc(680px * var(--z)), 48vw)' : 'calc(360px * var(--z))');
  ['left', 'right', 'bottom'].forEach(p => { const b = $('dk-' + p); if (b) b.classList.toggle('on', L[p] && m !== 'center'); });
  modeLabel();
  saveUi();
  setTimeout(() => { if (typeof resize === 'function') resize(); UI.view = {}; }, 30);
}
ACT.pmin = p => { UI.lay[p] = false; UI.lay.max = null; applyLayout(); };
ACT.pmax = p => { UI.lay.max = UI.lay.max === p ? null : p; if (p !== 'center') UI.lay[p] = true; applyLayout(); };
ACT.ptog = p => { UI.lay[p] = !UI.lay[p]; UI.lay.max = null; applyLayout(); };
function modeLabel() { const b = $('bMode'); if (b) { b.innerHTML = '<i></i>Modalità esperto (tarature e parametri)'; b.classList.toggle('on', UI.expert); } }
ACT.mode = () => { UI.expert = !UI.expert; modeLabel(); saveUi(); buildFace(); buildScopeCtl(); toast(UI.expert ? 'Modalità ESPERTO: tarature delle protezioni, parametri di modello e regolatori visibili.' : 'Modalità BASE: solo i comandi essenziali.', true); };
/* sezioni a scomparsa nei pannelli */
document.addEventListener('click', e => {
  const h = e.target.closest('.sec > h5'); if (!h || e.target.closest('button,input,select')) return;
  const sec = h.parentElement, k = h.textContent.trim();
  sec.classList.toggle('closed'); UI.secClosed[k] = sec.classList.contains('closed'); saveUi();
});
function applySecState(root) { root.querySelectorAll('.sec > h5').forEach(h => { if (UI.secClosed[h.textContent.trim()]) h.parentElement.classList.add('closed'); }); }

/* ---------------- dashboard ---------------- */
UI.dash = 'ALL';
let DG = [], DC = [], dashKey = '';
const D = (fn) => { const i = DG.length; DG.push(fn); return `<span data-d="${i}"></span>`; };
const DCV = (fn, h) => { const i = DC.length; DC.push(fn); return `<canvas data-c="${i}" style="height:${h}px"></canvas>`; };
function islStatus(I) {
  const b = I.buses[0], A = I.area;
  if (!I.com) return ['RTU N.D.', '#7d8a95'];
  if (!b.live) return ['FUORI TENSIONE', COL.al];
  const ens = I.nodes.some(N => !N.live);
  const df = Math.abs(b.fm - 50);
  if (df > 0.5) return ['FREQUENZA FUORI BANDA', COL.al];
  if (ens) return ['UTENZE DISALIMENTATE', COL.wa];
  if (df > 0.2) return ['FREQUENZA DISTURBATA', COL.wa];
  if (A.grid) return ['CONNESSA ALLA RTN', COL.ok];
  return ['REGOLARE', COL.ok];
}
function islLoad(I) { return I.nodes.reduce((a, N) => a + (N.live ? N.Pl : 0), 0); }
function islLost(I) { let p = 0; I.nodes.forEach(N => { if (!N.live) p += nodeLoad(N, hourNow(), 0)[0] / 1000; }); return p; }
function islDiesel(I) { return I.gens.reduce((a, G) => a + (G.st === 'IN PARALLELO' ? Math.max(0, G.Pe) : 0), 0); }
function mixBar(parts) {
  const tot = parts.reduce((a, p) => a + Math.max(0, p[1]), 0) || 1;
  return `<div class="mbar">${parts.map(p => `<i style="width:${Math.max(0, p[1]) / tot * 100}%;background:${p[2]}" title="${p[0]} ${fP(p[1])}"></i>`).join('')}</div><div style="display:flex;gap:10px;flex-wrap:wrap;font-size:11px">${parts.map(p => `<span><i style="display:inline-block;width:8px;height:8px;background:${p[2]};margin-right:4px"></i>${p[0]} ${fP(p[1])}</span>`).join('')}</div>`;
}
function gauge(cv, v, mn, mx, bands, label, fmt) {
  const dpr = (window.devicePixelRatio || 1) * (UI.zf || 1), w = cv.clientWidth, h = cv.clientHeight;
  if (!w) return;
  if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  const cx0 = w / 2, cy0 = h - 14, R = Math.min(w / 2 - 6, h - 22), a0 = Math.PI, a1 = 2 * Math.PI;
  const A = x => a0 + (clamp(x, mn, mx) - mn) / (mx - mn) * (a1 - a0);
  bands.forEach(b => { g.strokeStyle = b[2]; g.lineWidth = 9; g.beginPath(); g.arc(cx0, cy0, R, A(b[0]), A(b[1])); g.stroke(); });
  if (isFinite(v) && v > mn - (mx - mn)) { const a = A(v); g.strokeStyle = '#fff'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(cx0, cy0); g.lineTo(cx0 + Math.cos(a) * (R - 4), cy0 + Math.sin(a) * (R - 4)); g.stroke(); g.fillStyle = '#ccd'; g.beginPath(); g.arc(cx0, cy0, 4, 0, 7); g.fill(); }
  txt(g, fmt(v), cx0, cy0 - R * 0.35, COL.hi, '600 14px ' + FONTM, 'center');
  txt(g, label, cx0, cy0 + 12, COL.dim, '10px ' + FONTS, 'center');
  txt(g, String(mn), cx0 - R, cy0 + 12, COL.dim, '9px ' + FONTM, 'center'); txt(g, String(mx), cx0 + R, cy0 + 12, COL.dim, '9px ' + FONTM, 'center');
}
const FB_ = [[49, 49.5, '#7d2222'], [49.5, 49.8, '#8a6a12'], [49.8, 50.2, '#1f7a45'], [50.2, 50.5, '#8a6a12'], [50.5, 51, '#7d2222']];
const VB_ = [[18, 18.6, '#7d2222'], [18.6, 19.4, '#8a6a12'], [19.4, 20.6, '#1f7a45'], [20.6, 21.4, '#8a6a12'], [21.4, 22, '#7d2222']];
function spark(cv, keyArr, cols, secs, fixed) {
  const dpr = (window.devicePixelRatio || 1) * (UI.zf || 1), w = cv.clientWidth, h = cv.clientHeight;
  if (!w) return;
  if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = '#05080a'; g.fillRect(0, 0, w, h);
  const T = S.tf, n = Math.min(T.n, Math.round(secs / 0.01)); if (n < 2) return;
  const idx = k => (T.idx - n + k + TF_N) % TF_N;
  let mn = Infinity, mx = -Infinity;
  keyArr.forEach(k => { const a = T.ser[k]; for (let i = 0; i < n; i += 5) { const v = a[idx(i)]; if (v > 0.5 || !fixed) { mn = Math.min(mn, v); mx = Math.max(mx, v); } } });
  if (fixed) { mn = Math.min(mn, fixed[0]); mx = Math.max(mx, fixed[1]); }
  if (!isFinite(mn)) { mn = 0; mx = 1; } if (mx - mn < 1e-6) mx = mn + 1;
  keyArr.forEach((k, s) => { const a = T.ser[k]; g.strokeStyle = cols[s]; g.lineWidth = 1.4; g.beginPath(); for (let i = 0; i < n; i += 3) { const v = a[idx(i)], x = w * i / (n - 1), y = 4 + (h - 8) * (mx - v) / (mx - mn); i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); });
  txt(g, mx.toFixed(2), 3, 10, COL.dim, '9px ' + FONTM); txt(g, mn.toFixed(2), 3, h - 3, COL.dim, '9px ' + FONTM);
}
function dayChart(cv) {
  const dpr = (window.devicePixelRatio || 1) * (UI.zf || 1), w = cv.clientWidth, h = cv.clientHeight;
  if (!w) return;
  if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = '#05080a'; g.fillRect(0, 0, w, h);
  const T = S.ts, n = T.n;
  if (n < 2) { txt(g, 'Il grafico si riempie con il passare delle ore simulate (un punto per minuto di orologio)', w / 2, h / 2, COL.dim, '11px ' + FONTS, 'center'); return; }
  const idx = k => (T.idx - n + k + TS_N) % TS_N, sum = key => { const o = new Float32Array(n); S.isl.forEach(I => { const a = T.ser[I.id + '.' + key]; for (let k = 0; k < n; k++) o[k] += a[idx(k)]; }); return o; };
  const L = sum('L'), Dd = sum('D'), P = sum('PV');
  let mx = 0; for (let k = 0; k < n; k++) mx = Math.max(mx, L[k], Dd[k] + P[k]); mx *= 1.1;
  const X = k => 40 + (w - 50) * k / (n - 1), Y = v => h - 18 - (h - 30) * v / mx;
  g.fillStyle = 'rgba(255,169,77,.35)'; g.beginPath(); g.moveTo(X(0), Y(0)); for (let k = 0; k < n; k++) g.lineTo(X(k), Y(Dd[k])); g.lineTo(X(n - 1), Y(0)); g.fill();
  g.fillStyle = 'rgba(255,225,77,.45)'; g.beginPath(); for (let k = 0; k < n; k++) g.lineTo(X(k), Y(Dd[k] + P[k])); for (let k = n - 1; k >= 0; k--) g.lineTo(X(k), Y(Dd[k])); g.fill();
  g.strokeStyle = '#e2edf3'; g.lineWidth = 1.5; g.beginPath(); for (let k = 0; k < n; k++) k ? g.lineTo(X(k), Y(L[k])) : g.moveTo(X(k), Y(L[k])); g.stroke();
  for (let q = 0; q <= 4; q++) { const v = mx * q / 4; txt(g, v.toFixed(1), 36, Y(v) + 3, COL.dim, '9px ' + FONTM, 'right'); }
  txt(g, 'MW · ■ diesel  ■ FV  — carico servito', 44, 12, COL.tx, '10px ' + FONTS);
  const c0 = T.clk[idx(0)], c1 = T.clk[idx(n - 1)];
  txt(g, clkStr(c0 % 86400), 40, h - 4, COL.dim, '9px ' + FONTM); txt(g, clkStr(c1 % 86400), w - 10, h - 4, COL.dim, '9px ' + FONTM, 'right');
}
function buildDash() {
  DG = []; DC = [];
  const sel = `<div class="dsel"><button data-a="dash" data-p="ALL" class="${UI.dash === 'ALL' ? 'on' : ''}">${ICO('dashboard')} Arcipelago</button>${S.isl.map(I => `<button data-a="dash" data-p="${I.id}" class="${UI.dash === I.id ? 'on' : ''}"><i style="background:${islStatus(I)[1]}"></i>${esc(I.nm)}</button>`).join('')}</div>`;
  let h = sel;
  if (UI.dash === 'ALL') {
    const tile = (lab, fn, sub) => `<div class="tile" data-tile="${DG.length}">${'<small>' + lab + '</small>'}<b>${D(fn)}</b><span>${sub ? D(sub) : ''}</span></div>`;
    h += `<div class="tiles">` +
      tile('Carico servito', () => fP(S.tot.now.load), () => 'domanda totale ' + fP(S.tot.now.load + S.tot.now.ens)) +
      tile('Utenze disalimentate', () => fP(S.tot.now.ens), () => S.isl.reduce((a, I) => a + I.nodes.filter(N => !N.live).length, 0) + ' cabine al buio') +
      tile('Isole regolari', () => S.isl.filter(I => islStatus(I)[1] === COL.ok).length + ' / ' + S.isl.length, () => S.isl.filter(I => !I.buses[0].live).length + ' fuori tensione') +
      tile('Quota rinnovabile', () => (S.tot.now.pv / Math.max(1e-6, S.tot.now.pv + S.tot.now.dsl + Math.max(0, S.tot.now.imp)) * 100).toFixed(1) + ' %', () => 'FV ' + fP(S.tot.now.pv)) +
      tile('Gasolio', () => S.tot.now.fuel.toFixed(0) + ' l/h', () => '≈ ' + (S.tot.now.fuel * 1.25).toFixed(0) + ' €/h · ' + (S.tot.now.fuel * 2.65).toFixed(0) + ' kg CO₂/h') +
      tile('Gruppi in servizio', () => S.gens.filter(G => G.st === 'IN PARALLELO').length + ' / ' + S.gens.length, () => S.gens.filter(G => G.blocked).length + ' in blocco') +
      tile('Allarmi attivi', () => Object.values(S.alarms).filter(a => a.active).length, () => Object.values(S.alarms).filter(a => !a.acked).length + ' da riconoscere') +
      tile('Energia non fornita', () => (S.tot.E.ens * 1000).toFixed(0) + ' kWh', () => 'dall\'avvio') +
      `</div>`;
    h += `<div class="dgrid">` + S.isl.map(I => `<div class="card" data-a="dash" data-p="${I.id}" data-card="${I.id}"><h4><span>${esc(I.nm)}</span><small>${D(() => { const s = islStatus(I); return { html: `<span style="color:${s[1]}">● ${s[0]}</span>` }; })}</small></h4>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px">${DCV(cv => gauge(cv, I.buses[0].live ? I.buses[0].fm : NaN, 49, 51, FB_, 'frequenza', v => isFinite(v) ? v.toFixed(2) + ' Hz' : '—'), 72)}${DCV(cv => gauge(cv, I.buses[0].live ? I.buses[0].Vm * 20 : NaN, 18, 22, VB_, 'tensione', v => isFinite(v) ? v.toFixed(2) + ' kV' : '—'), 72)}</div>
      <div class="kv">${K2('Carico', () => fP(islLoad(I)))}${K2('Disalimentato', () => { const p = islLost(I); return [fP(p), p > 0.001 ? 'al' : '']; })}${K2('Gruppi', () => I.gens.filter(G => G.st === 'IN PARALLELO').length + ' / ' + I.gens.length + (I.gens.some(G => G.blocked) ? ' (blocco)' : ''))}${K2('FV', () => fP(I.pv.P))}${I.bess.length ? K2('Accumulo', () => I.bess[0].soc.toFixed(0) + '% · ' + fP(I.bess[0].P)) : ''}</div>
      ${DCV(cv => spark(cv, [I.id + '.f'], ['#ffe14d'], 60, [49.9, 50.1]), 28)}</div>`).join('') + `</div>`;
    h += `<div class="drow"><div class="dbox"><h5>Produzione in questo momento</h5>${D(() => ({ html: mixBar([['Diesel', S.tot.now.dsl, '#ffa94d'], ['FV', S.tot.now.pv, '#ffe14d'], ['Accumuli', Math.max(0, S.tot.now.bess), '#c9a2ff'], ['RTN', Math.max(0, S.tot.now.imp), '#36b9ff']]) }))}<p class="note">Clic su un'isola per la sua dashboard di dettaglio.</p></div><div class="dbox"><h5>Andamento della giornata (tutte le isole)</h5>${DCV(cv => dayChart(cv), 118)}</div></div>`;
  } else {
    const I = S.islById[UI.dash], A = () => I.area;
    const tile = (lab, fn, sub) => `<div class="tile"><small>${lab}</small><b>${D(fn)}</b><span>${sub ? D(sub) : ''}</span></div>`;
    h += `<div class="row" style="margin-bottom:8px"><button class="btn" data-a="dGo" data-p="sld">Apri lo schema unifilare</button><button class="btn" data-a="dGo" data-p="map">Apri la mappa</button><button class="btn" data-a="dGo" data-p="isl">Comandi dell'isola</button></div>`;
    h += `<div class="tiles">` +
      tile('Stato', () => { const s = islStatus(I); return { html: `<span style="color:${s[1]};font-size:14px">${s[0]}</span>` }; }, () => !I.buses[0].live ? '' : A().grid ? 'collegata alla Sicilia' : A().isl.length > 1 ? 'in parallelo con ' + A().isl.filter(x => x !== I.id).map(x => S.islById[x].nm).join(', ') : 'esercizio isolato') +
      tile('Carico servito', () => fP(islLoad(I)), () => 'disalimentato ' + fP(islLost(I))) +
      tile('Riserva rotante', () => A().st ? fP(A().st.res) : '—', () => A().n1ok === undefined ? '' : A().n1ok ? 'criterio N-1 rispettato' : 'N-1 NON rispettato') +
      tile('Fotovoltaico', () => fP(I.pv.P), () => 'irraggiamento ' + I.pv.irr.toFixed(0) + ' W/m²') +
      (I.bess.length ? tile('Accumulo', () => I.bess[0].soc.toFixed(0) + ' %', () => I.bess[0].mode + ' · ' + fP(I.bess[0].P)) : '') +
      tile('Gasolio', () => I.gens.reduce((a, G) => a + G.fuel, 0).toFixed(0) + ' l/h', () => 'EMS ' + (I.ems.on ? 'inserito' : 'DISINSERITO')) + `</div>`;
    h += `<div class="panelgrid">
      <div class="dbox"><h5>Frequenza e tensione</h5><div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">${DCV(cv => gauge(cv, I.buses[0].live ? I.buses[0].fm : NaN, 49, 51, FB_, 'frequenza', v => isFinite(v) ? v.toFixed(3) + ' Hz' : '—'), 110)}${DCV(cv => gauge(cv, I.buses[0].live ? I.buses[0].Vm * 20 : NaN, 18, 22, VB_, 'tensione', v => isFinite(v) ? v.toFixed(2) + ' kV' : '—'), 110)}</div>${DCV(cv => spark(cv, [I.id + '.f'], ['#ffe14d'], 60, [49.9, 50.1]), 60)}<p class="note">Frequenza negli ultimi 60 secondi.</p></div>
      <div class="dbox"><h5>Bilancio di potenza</h5>${D(() => ({ html: mixBar(I.gens.filter(G => G.st === 'IN PARALLELO').map((G, k) => [G.short, G.Pe, ['#ffa94d', '#ff6a3d', '#ffd23d', '#e88a2e', '#ffb86a', '#d9662b'][k % 6]]).concat([['FV', I.pv.P, '#ffe14d']]).concat(I.bess.map(b => ['BESS', Math.max(0, b.P), '#c9a2ff']))) }))}${DCV(cv => spark(cv, I.gens.map(G => G.id + '.P'), ['#ffa94d', '#ff6a3d', '#ffd23d', '#8dff6a', '#4dd2ff', '#ff6ad5'], 60), 70)}<p class="note">Potenza dei gruppi negli ultimi 60 secondi.</p></div>
      <div class="dbox"><h5>Gruppi diesel</h5><table class="dt">${I.gens.map(G => `<tr data-a="goEl" data-p="${G.id}"><td>${G.short} · ${(G.Pn * 1000).toFixed(0)} kW</td><td>${D(() => [G.blocked ? 'BLOCCO' : G.st, ''])}</td><td>${D(() => ({ html: `<span class="lb"><i style="width:${clamp(G.Pe / G.Pn, 0, 1) * 100}%;background:${G.Pe / G.Pn > 0.95 ? COL.al : COL.ok}"></i></span>` }))}</td><td class="n">${D(() => fP(G.Pe))}</td><td class="n">${D(() => G.Tc.toFixed(0) + '°C')}</td></tr>`).join('')}</table><p class="note">Clic su una riga per aprire i comandi del gruppo.</p></div>
      <div class="dbox"><h5>Linee MT</h5><table class="dt">${I.feeders.map(F => `<tr data-a="goEl" data-p="${F.id}"><td>${F.short} ${esc(F.nm.replace('Linea ', ''))}</td><td>${D(() => devClosed(F.brk) ? ['in servizio', ''] : ['APERTA', 'al'])}</td><td>${D(() => ({ html: `<span class="lb"><i style="width:${clamp(F.Iamp / F.Inom, 0, 1) * 100}%;background:${F.Iamp / F.Inom > 0.9 ? COL.wa : COL.mv}"></i></span>` }))}</td><td class="n">${D(() => fI(F.Iamp))}</td><td class="n">${D(() => F.nodes.filter(N => N.live).length + '/' + F.nodes.length + ' cab.')}</td></tr>`).join('')}</table></div>
      <div class="dbox"><h5>Allarmi dell'isola</h5>${D(() => { const L = Object.values(S.alarms).filter(a => a.isl === I.id && a.active).sort((a, b) => b.prio - a.prio).slice(0, 8); return { html: L.length ? L.map(a => `<div style="color:${a.prio >= 3 ? '#ff8585' : a.prio >= 2 ? '#ffd76b' : '#9fd8ff'};font-size:12px;margin:2px 0">● ${esc(a.text)}</div>`).join('') : '<p class="note">Nessun allarme attivo.</p>' }; })}</div>
      <div class="dbox"><h5>Ultimi eventi</h5>${D(() => { const L = S.soe.filter(e => e.isl === I.id).slice(-8).reverse(); return { html: L.map(e => `<div style="font:11px ${FONTM};color:${e.prio >= 3 ? '#ff8a8a' : e.prio >= 2 ? '#ffd98a' : '#a9bcc7'};margin:2px 0">${clkStr(e.clk)} ${esc(e.text)}</div>`).join('') || '<p class="note">—</p>' }; })}</div>
    </div>`;
  }
  $('dash').innerHTML = '<div id="dashIn">' + h + '</div>';
  dashKey = UI.dash;
  updDash();
}
function K2(label, fn) { return `<span>${label}</span><b>${D(fn)}</b>`; }
function updDash() {
  const root = $('dash');
  root.querySelectorAll('[data-d]').forEach(n => {
    const fn = DG[+n.dataset.d]; if (!fn) return;
    let r; try { r = fn(); } catch (e) { r = '—'; }
    if (Array.isArray(r)) { if (n.textContent !== r[0]) n.textContent = r[0]; n.className = r[1] || ''; }
    else if (r && typeof r === 'object') { if (n._h !== r.html) { n.innerHTML = r.html; n._h = r.html; } }
    else if (n.textContent !== String(r)) n.textContent = r;
  });
  root.querySelectorAll('canvas[data-c]').forEach(c => { try { DC[+c.dataset.c](c); } catch (e) { } });
  root.querySelectorAll('[data-card]').forEach(c => { const I = S.islById[c.dataset.card]; c.classList.toggle('bad', islStatus(I)[1] === COL.al); });
  root.querySelectorAll('.dsel button i').forEach((n, k) => { const I = S.isl[k]; if (I) n.style.background = islStatus(I)[1]; });
}
ACT.dash = p => { UI.dash = p; if (p !== 'ALL') selectIsl(p); buildDash(); };
ACT.dGo = p => { if (p === 'isl') { selectEl(S.islById[UI.dash]); if (!UI.lay.right) { UI.lay.right = true; applyLayout(); } return; } showCtab(p); };

/* ---------------- gioco: obiettivi, punteggio, voto ---------------- */
const GAME = { pts: 0, ensKwh: 0, log: [], grade: 'A' };
function allLive(id) { return S.islById[id].nodes.every(N => N.live) && S.islById[id].buses[0].live; }
const GOALS = {
  'lip-perm': ['Rialimenta Canneto e Acquacalda lasciando fuori servizio solo il tronco guasto', () => S.byId['LIP.L2.1'].live && S.byId['LIP.L2.3'].live],
  'sal-lg': ['Verifica che la linea Malfa – Pollara torni in servizio', () => allLive('SAL')],
  'lip-pet': ['Mantieni tutta Lipari alimentata', () => allLive('LIP') && !S.faults.some(f => f.isl === 'LIP')],
  'lip-trip': ['Riporta Lipari al criterio N-1 con tutte le utenze alimentate', () => allLive('LIP') && allLive('VUL') && S.islById.LIP.area.n1ok === true],
  'vul-cab': ['Rialimenta tutta Vulcano', () => allLive('VUL')],
  'diss': ['Porta il dissalatore in marcia', () => S.byId['LIP.L5.1'].motor.st === 'MARCIA'],
  'legacy': ['Richiudi Lipari Centro e riporta in servizio tutto il FV', () => allLive('LIP') && S.islById.LIP.pv.groups.every(g => g.on && g.ramp >= 1)],
  'hunt': ['Elimina l\'oscillazione mantenendo Salina alimentata', () => allLive('SAL') && !(S.byId['SAL.G1'].fault.govHunt && S.byId['SAL.G1'].st === 'IN PARALLELO')],
  'lof': ['Panarea tutta alimentata dopo la perdita del gruppo', () => allLive('PAN')],
  'pan-bus': ['Rimetti in tensione Panarea e rialimenta tutte le cabine', () => allLive('PAN')],
  'str-bf': ['Rialimenta tutta Stromboli', () => allLive('STR')],
  'gin': ['Tieni Ginostra alimentata fino alle 22:00', () => S.clk > 22 * 3600 && allLive('GIN')],
  'ferr': ['Nessuna cabina al buio in tutto l\'arcipelago', () => S.isl.every(I => allLive(I.id))],
  'cool': ['Ferma il GE1 di Filicudi prima che scatti la protezione, senza disalimentare', () => S.byId['FIL.G1'].st === 'FERMO' && !/26/.test(S.byId['FIL.G1'].lastTrip) && allLive('FIL')],
  'com': ['Ripristina la comunicazione con Alicudi', () => S.islById.ALI.com],
  'storm': ['A temporale finito, tutte le isole alimentate', () => !S.storm && S.set.randF === 0 && S.isl.every(I => allLive(I.id))],
  'parox': ['Rialimenta le cabine di Stromboli raggiungibili', () => S.islById.STR.nodes.filter(N => !N.live).length <= 1 && S.islById.STR.buses[0].live],
  'sync': ['Metti in parallelo il GE3 senza danni', () => S.byId['SAL.G3'].st === 'IN PARALLELO' && !S.byId['SAL.G3'].fault.shaft],
  'rtn': ['Chiudi in parallelo Lipari con la rete siciliana', () => brClosed(S.byId.CRT)],
  'cs1': ['Metti in parallelo Lipari e Salina sul cavo CS1', () => brClosed(S.byId.CS1)],
  'ali-man': ['Rimetti in tensione Alicudi a mano', () => allLive('ALI')]
};
function goalStart(s) { const g = GOALS[s.id]; if (!g) return; s.goal = { txt: g[0], ok: g[1], t0: S.t, armed: false, okT: 0, done: false, failT: 0 }; }
function gameStep(dt) {
  /* penalità: energia non fornita (1 punto per kWh) e danni */
  const kwh = S.tot.now ? S.tot.now.ens * 1000 * dt * S.clkSpeed / 3600 : 0;
  GAME.ensKwh += kwh; GAME.pts -= kwh;
  S.gens.forEach(G => { if (G.fault.shaft && !G._pen) { G._pen = true; GAME.pts -= 250; toast('Penalità −250: danno meccanico a ' + G.nm + ' (parallelo fuori fase)'); } if (!G.fault.shaft) G._pen = false; });
  /* obiettivo dello scenario */
  const s = SCN_ACTIVE;
  if (s && s.goal && !s.goal.done) {
    const g = s.goal, el = S.t - g.t0;
    let ok = false; try { ok = g.ok(); } catch (e) { }
    if (!ok) g.armed = true;
    if (el > 4 && (g.armed || el > 20) && ok) { g.okT += dt; if (g.okT > 4) { g.done = true; const pts = Math.max(100, Math.round(600 - el * 2)); GAME.pts += pts; g.pts = pts; g.el = el; toast('✔ Obiettivo raggiunto in ' + fmtDur(el) + ': +' + pts + ' punti', true); beep(1); GAME.log.push({ nm: s.nm, pts, el }); goalModal(s, pts, el); } }
    else g.okT = 0;
  }
  /* voto istantaneo della qualità del servizio */
  const blk = S.isl.some(I => !I.buses[0].live), ens = S.tot.now ? S.tot.now.ens / Math.max(0.1, S.tot.now.load + S.tot.now.ens) : 0;
  const fbad = S.isl.some(I => I.buses[0].live && Math.abs(I.buses[0].fm - 50) > 0.5), fwa = S.isl.some(I => I.buses[0].live && Math.abs(I.buses[0].fm - 50) > 0.2);
  GAME.grade = blk ? 'E' : ens > 0.05 ? 'D' : fbad || ens > 0.005 ? 'C' : fwa || Object.values(S.alarms).some(a => a.active && a.prio >= 3) ? 'B' : 'A';
}
function fmtDur(s) { s = Math.round(s); return Math.floor(s / 60) + ':' + pad(s % 60); }
function updScore() {
  $('scPts').textContent = Math.round(GAME.pts);
  const gi = $('scGrade'); gi.textContent = GAME.grade;
  const c = { A: ['#0f3a22', COL.ok], B: ['#16300f', '#a8ff6a'], C: ['#3a300a', COL.wa], D: ['#3a1a08', COL.or], E: ['#3a0b0b', COL.al] }[GAME.grade];
  gi.style.background = c[0]; gi.style.color = c[1];
  const s = SCN_ACTIVE, gb = $('goalBox');
  if (gb && s && s.goal) { const g = s.goal; gb.className = 'goal' + (g.done ? ' done' : ''); gb.innerHTML = g.done ? `${ICO('check')} Obiettivo raggiunto in ${fmtDur(g.el)} · +${g.pts} punti` : `${ICO('target')} ${esc(g.txt)} <span style="float:right">${ICO('clock')} ${fmtDur(S.t - g.t0)}</span>`; }
}
$('score').onclick = () => modal('Punteggio dell\'operatore', `<div class="tiles"><div class="tile"><small>Punti</small><b>${Math.round(GAME.pts)}</b></div><div class="tile"><small>Qualità del servizio</small><b>${GAME.grade}</b></div><div class="tile"><small>Energia non fornita</small><b>${GAME.ensKwh.toFixed(0)} kWh</b><span>−1 punto per kWh</span></div><div class="tile"><small>Obiettivi raggiunti</small><b>${GAME.log.length}</b></div></div>` +
  (GAME.log.length ? '<table class="dt">' + GAME.log.map(l => `<tr><td>${esc(l.nm)}</td><td class="n">${fmtDur(l.el)}</td><td class="n">+${l.pts}</td></tr>`).join('') + '</table>' : '<p class="note">Avvia un imprevisto dal menu ⚡: ogni scenario ha un obiettivo. Più rapido sei, più punti ottieni (da 600 a 100). L\'energia non fornita toglie punti, un parallelo fuori fase ne toglie 250.</p>') +
  '<p class="note">Voto: A regolare · B frequenza disturbata o allarmi gravi · C frequenza fuori banda o poche utenze al buio · D molte utenze al buio · E un\'isola fuori tensione.</p>');
