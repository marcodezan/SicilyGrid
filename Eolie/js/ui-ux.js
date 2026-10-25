'use strict';
/* =====================================================================
   ESPERIENZA D'USO: velocità, menu rapido (mappa e schema), scheda componente,
   ricerca globale, benvenuto, tour guidato, notifiche
   ===================================================================== */

/* ---------------- tempo ---------------- */
function segUpd() { document.querySelectorAll('#segClk button').forEach(b => b.classList.toggle('on', +b.dataset.v === S.clkSpeed)); }
document.querySelectorAll('#segClk button').forEach(b => b.onclick = () => { S.clkSpeed = +b.dataset.v; segUpd(); });
const SLOWS = [1, 0.2, 0.05];
function setSlow(v) { UI.slow = v; const b = $('bSlow'); b.classList.toggle('on', v < 1); b.innerHTML = '<i></i>Moviola ' + (v < 1 ? '(dinamica ' + (v === 0.2 ? '5' : '20') + ' volte più lenta)' : '(rallenta i transitori elettrici)'); }
$('bSlow').onclick = () => { const v = SLOWS[(SLOWS.indexOf(UI.slow) + 1) % SLOWS.length]; setSlow(v); toast(v < 1 ? 'Moviola: dinamica elettrica rallentata ' + (v === 0.2 ? '5' : '20') + ' volte (ideale per l\'oscilloscopio)' : 'Dinamica in tempo reale', true); };
ACT.home = () => { showCtab('dash'); UI.dash = 'ALL'; buildDash(); };

/* ---------------- esecuzione di un comando con esito ---------------- */
function runCmd(fn) {
  const before = S.lastRefuse && S.lastRefuse.t;
  const ok = fn();
  if (S.lastRefuse && S.lastRefuse.t !== before && S.lastRefuse.t >= S.t - 0.01) toast('Comando rifiutato: ' + S.lastRefuse.msg);
  else if (ok === false) toast('Comando non eseguito: vedi il registro eventi');
}
function openRight() { if (!UI.lay.right || UI.lay.max === 'center' || UI.lay.max === 'bottom') { UI.lay.right = true; UI.lay.max = null; applyLayout(); } }
function openTab(el, tab) { openRight(); UI.fpTab = tab; selectEl(el); }

/* ---------------- menu rapido (contestuale) ---------------- */
const CTX = { items: [], el: null, ask: null };
function iconOf(el) { return { pv: 'sun', gen: 'gen', bess: 'battery', fdr: 'line', node: 'cabin', seg: 'segment', tie: 'switch', bus: 'bus', br: 'cable', isl: 'island' }[el.el] || 'info'; }
function stateOf(el) {
  switch (el.el) {
    case 'gen': return el.blocked ? ['IN BLOCCO', 'al'] : [el.st, el.st === 'IN PARALLELO' ? 'ok' : el.st === 'FERMO' ? '' : 'wa'];
    case 'bess': return [el.run && el.mode !== 'OFF' ? (devClosed(el.brk) ? 'IN SERVIZIO · ' + el.mode : 'PRONTO · ' + el.mode) : 'SPENTO', devClosed(el.brk) ? 'ok' : ''];
    case 'fdr': return devClosed(el.brk) ? (el.bus.live ? ['IN SERVIZIO', 'ok'] : ['SENZA TENSIONE', 'al']) : ['APERTA', 'wa'];
    case 'node': return el.live ? ['ALIMENTATA', 'ok'] : ['AL BUIO', 'al'];
    case 'seg': case 'tie': { const f = S.faults.some(x => x.el === el); return f ? ['GUASTO', 'al'] : el.fpi.flag ? ['INDICATORE GUASTO', 'wa'] : el.sw && !el.sw.closed ? ['SEZIONATO', 'wa'] : el.dn && el.dn.live || el.el === 'tie' && el.a.live ? ['IN TENSIONE', 'ok'] : ['FUORI TENSIONE', '']; }
    case 'bus': return el.lock ? ['BLOCCO 86', 'al'] : el.live ? ['IN TENSIONE', 'ok'] : ['FUORI TENSIONE', 'al'];
    case 'br': return brClosed(el) ? ['IN SERVIZIO', 'ok'] : ['APERTO', 'wa'];
    case 'pv': return el.I.pv.opOff ? ['DISTACCATO', 'al'] : el.I.pv.groups.some(g => g.frac > 0 && !g.on) ? ['PARZIALE', 'wa'] : el.I.pv.P > 0.001 ? ['IN PRODUZIONE', 'ok'] : ['NOTTE / NUVOLE', ''];
    case 'isl': return islStatus(el)[1] === COL.ok ? [islStatus(el)[0], 'ok'] : [islStatus(el)[0], islStatus(el)[1] === COL.al ? 'al' : 'wa'];
  }
  return ['', ''];
}
function ctxItems(el) {
  const L = [], it = (ic, lab, fn, ask, cls) => L.push({ ic, lab, fn, ask, cls }), sep = () => L.push('-');
  const panel = () => it('☰', 'Apri il pannello comandi', () => openTab(el, 'cmd'));
  const fault = (lab) => it('⚠', lab || 'Simula un guasto…', () => openTab(el, 'flt'), null, 'wa');
  const crew = () => { if (crewNeeded(el) && !(S.crews || []).some(c => c.el === el)) it('🔧', 'Invia la squadra di pronto intervento', () => runCmd(() => sendCrew(el)), 'Inviare la squadra su ' + el.nm + '?'); };
  const brk = (b, lab) => { if (b.racked) return; if (devClosed(b)) it('□', 'Apri ' + (lab || 'interruttore'), () => runCmd(() => opBrk(b, 'O')), 'APERTURA ' + b.nm + '?', 'go'); else it('■', 'Chiudi ' + (lab || 'interruttore'), () => runCmd(() => opBrk(b, 'C')), 'CHIUSURA ' + b.nm + '?' + pickupWarn(b), 'dg'); };
  switch (el.el) {
    case 'gen': {
      const G = el;
      if (G.st === 'FERMO' && !G.blocked) it('▶', 'Avvia il gruppo', () => runCmd(() => startGen(G, 'OP')), 'AVVIAMENTO ' + G.nm + '?', 'go');
      if (G.st === 'PRONTO') it('⟳', G.asyn ? 'Disinserisci il sincronizzatore' : 'Metti in parallelo (sincronizzatore)', () => genAutoSync(G, !G.asyn));
      if (G.st !== 'FERMO' && G.st !== 'ARRESTO') it('■', 'Arresta (scarico in rampa)', () => runCmd(() => stopGen(G, 'OP')), 'ARRESTO ' + G.nm + '?');
      if (G.st !== 'FERMO') it('⏻', 'Arresto di emergenza', () => runCmd(() => { if (!comOk(G, 'OP')) return false; emergencyStop(G, 'pulsante operatore'); }), 'ARRESTO DI EMERGENZA ' + G.nm + '?', 'dg');
      if (relFlags(G).length || G.blocked) it('↺', 'Reset blocchi e segnalazioni', () => relReset(G));
      it(G.auto ? '✋' : '🤖', G.auto ? 'Passa a gestione manuale' : 'Affida all\'automazione (EMS)', () => ACT.gauto(G.id));
      sep(); it('〜', 'Tensioni e corrente all\'oscilloscopio', () => { scopePreset(G.st === 'PRONTO' ? 'sync' : 'gen', G); showBtab('scope'); });
      fault('Simula un\'avaria…'); crew(); panel(); break;
    }
    case 'bess': {
      const B = el;
      it('⏻', B.run ? 'Spegni il convertitore' : 'Accendi il convertitore', () => ACT.brun(B.id), B.run ? 'Spegnere il convertitore ' + B.nm + '?' : null);
      brk(B.brk); sep(); it('〜', 'Corrente all\'oscilloscopio', () => { scopePreset('line', B); showBtab('scope'); }); fault('Simula un\'avaria…'); crew(); panel(); break;
    }
    case 'fdr': {
      const F = el; brk(F.brk, 'interruttore di linea');
      if (relFlags(F).length || F.rec.st === 'DEFINITIVO') it('↺', 'Reset segnalazioni e scatto definitivo', () => relReset(F));
      sep(); it('〜', 'Correnti di linea all\'oscilloscopio', () => { scopePreset('line', F); showBtab('scope'); }); fault('Simula un guasto sul primo tratto…'); panel(); break;
    }
    case 'node': {
      const N = el;
      if (N.lvBrk) it('□', 'Apri l\'interruttore BT (distacca la cabina)', () => runCmd(() => lvBrkCmd(N, false)), 'Distaccare le utenze della cabina ' + N.nm + '?', 'go');
      else it('■', 'Richiudi l\'interruttore BT', () => runCmd(() => lvBrkCmd(N, true)), 'Rialimentare le utenze della cabina ' + N.nm + '?', 'dg');
      if (N.motor) { if (N.motor.st === 'MARCIA' || N.motor.st === 'AVVIAMENTO') it('■', 'Arresta le pompe', () => motorCmd(N, false), 'Arrestare i motori di ' + N.nm + '?'); else { it('▶', 'Avvia le pompe con soft-starter', () => motorCmd(N, true, true), 'Avvio con soft-starter?', 'go'); it('▶', 'Avvia le pompe in diretta', () => motorCmd(N, true, false), 'Avviamento DIRETTO (spunto ≈ 6 In)?', 'dg'); } }
      if (N.pv > 0) { if (N.pvOff) it('☀', 'Riconnetti il FV della cabina (' + N.pv + ' kWp)', () => runCmd(() => pvNode(N, true)), null, 'go'); else it('☀', 'Distacca il FV della cabina (' + N.pv + ' kWp)', () => runCmd(() => pvNode(N, false)), 'Distaccare il FV della cabina ' + N.nm + '?'); it('☀', 'FV dell\'isola…', () => openTab(S.islById[N.isl].pvEl, 'cmd')); }
      sep(); it('〰', 'Linea ' + (N.sup ? N.sup.short : N.fd.short), () => openTab(N.sup || N.fd, 'cmd')); fault('Simula un guasto in cabina…'); crew(); panel(); break;
    }
    case 'seg': case 'tie': {
      const w = el.sw;
      if (w) { if (w.closed) it('◇', 'Apri l\'IMS' + (el.el === 'tie' ? ' di contro-alimentazione' : ' a monte del tratto'), () => runCmd(() => swCmd(w, false)), 'APERTURA ' + w.nm + '?', 'go'); else it('◆', 'Chiudi l\'IMS' + (el.el === 'tie' ? ' (contro-alimenta)' : ''), () => runCmd(() => swCmd(w, true)), 'CHIUSURA ' + w.nm + '?', 'dg'); }
      if (el.fpi.flag) it('↺', 'Reset indicatori di guasto dell\'isola', () => fpiReset(S.islById[el.isl]));
      sep(); fault('Simula un guasto sul tratto…'); crew(); panel(); break;
    }
    case 'bus': { const B = el; if (B.lock || relFlags(B).length) it('↺', 'Reset blocco 86 e segnalazioni', () => relReset(B), 'Resettare il blocco della sbarra ' + B.nm + '?', 'wa'); it('〜', 'Tensioni di sbarra all\'oscilloscopio', () => { selectIsl(B.isl); scopePreset('bus'); showBtab('scope'); }); fault('Simula un guasto di sbarra…'); crew(); panel(); break; }
    case 'br': { brk(el.brkA, 'lato ' + (el.a.grid ? 'RTN' : S.islById[el.a.isl].nm)); if (el.brkB) brk(el.brkB, 'lato ' + S.islById[el.b.isl].nm); if (el.kind !== 'cpl') [el.brkA, el.brkB].forEach(b => { if (b && !devClosed(b)) it('⟳', 'Chiudi ' + (b === el.brkA ? 'lato A' : 'lato B') + ' con sincronizzatore', () => brkAutoSync(b, true), 'Inserire il sincronizzatore su ' + b.nm + '?'); }); sep(); fault('Simula un guasto sul cavo…'); crew(); panel(); break; }
    case 'pv': { const I = el.I; [1, 0.5, 0].forEach(k => { if (Math.abs(I.pv.curt - k) > 0.01) it('☀', 'Limita l\'immissione al ' + Math.round(k * 100) + '%', () => runCmd(() => pvLimit(I, k)), k === 0 ? 'Azzerare l\'immissione FV di ' + I.nm + '?' : null); });
      it('hand', I.pv.man ? 'Gestione FV: torna automatica' : 'Gestione FV: passa a manuale', () => ACT.pvMan(el.id + ':' + (I.pv.man ? 0 : 1)));
      if (I.pv.groups.some(g => g.frac > 0 && !g.on)) it('▶', 'Riconnetti ora gli inverter distaccati', () => runCmd(() => pvReconnectNow(I)), null, 'go');
      if (I.pv.opOff) it('▶', 'Consenti la riconnessione degli inverter', () => runCmd(() => pvSwitch(I, true)), null, 'go'); else it('⏻', 'Telescatto di tutti gli inverter', () => runCmd(() => pvSwitch(I, false)), 'TELESCATTO degli inverter FV di ' + I.nm + '?', 'dg');
      sep(); panel(); break; }
    case 'isl': { it('▦', 'Dashboard dell\'isola', () => { UI.dash = el.id; selectIsl(el.id); showCtab('dash'); }); it('⎍', 'Schema unifilare', () => { selectIsl(el.id); showCtab('sld'); }); it('⌖', 'Centra sulla mappa', () => { selectIsl(el.id); showCtab('map'); flyTo(el.id); }); sep(); it('⚡', 'Imprevisti su quest\'isola', () => scenMenu(el.id)); panel(); break; }
  }
  return L;
}
function ctxOpen(el, x, y) {
  CTX.el = el; CTX.items = ctxItems(el); CTX.ask = null;
  ctxRender();
  const m = $('ctx'); m.style.display = 'block';
  m.style.left = '0px'; m.style.top = '0px';
  const z = UI.zf || 1, rc = m.getBoundingClientRect(), w = rc.width, h = rc.height;
  m.style.left = Math.max(4, Math.min(x + 6, window.innerWidth - w - 8)) / z + 'px';
  m.style.top = Math.max(4, Math.min(y + 6, window.innerHeight - h - 8)) / z + 'px';
}
function ctxRender() {
  const el = CTX.el, st = stateOf(el), m = $('ctx');
  let h = `<div class="ch"><span class="ic">${ICO(iconOf(el))}</span><div><b>${esc(el.nm || el.id)}</b><small>${esc(KIND_NM[el.el] || '')}${elIsl(el) && el.el !== 'isl' ? ' · ' + esc(S.islById[elIsl(el)].nm) : ''}</small></div><span class="state st-${st[1] || 'off'}">${esc(st[0])}</span></div>`;
  if (CTX.ask) h += `<div class="ask"><p>${esc(CTX.ask.ask)}</p><div class="row"><button class="btn go" data-ci="yes">Esegui</button><button class="btn" data-ci="no">Annulla</button></div></div>`;
  else h += CTX.items.map((i, k) => i === '-' ? '<hr>' : `<button class="ci ${i.cls || ''}" data-ci="${k}"><span>${ICO(i.ic)}</span>${esc(i.lab)}</button>`).join('');
  m.innerHTML = h;
}
function ctxClose() { $('ctx').style.display = 'none'; CTX.el = null; }
$('ctx').addEventListener('click', e => {
  const b = e.target.closest('[data-ci]'); if (!b) return;
  e.stopPropagation();
  const k = b.dataset.ci;
  if (k === 'no') { CTX.ask = null; ctxRender(); return; }
  if (k === 'yes') { const f = CTX.ask.fn; ctxClose(); f(); return; }
  const it = CTX.items[+k]; if (!it) return;
  if (it.ask) { CTX.ask = it; ctxRender(); return; }
  ctxClose(); it.fn();
});
document.addEventListener('mousedown', e => { if (CTX.el && !e.target.closest('#ctx')) ctxClose(); });
window.addEventListener('keydown', e => { if (e.key === 'Escape') { ctxClose(); palClose(); } });
$('cv').addEventListener('contextmenu', e => {
  e.preventDefault();
  const r = $('cv').getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
  const h = UI.ctab === 'sld' ? sldHit(mx, my) : UI.ctab === 'map' ? mapHit(mx, my) : null;
  if (h) { selectEl(h.el); ctxOpen(h.el, e.clientX, e.clientY); }
});

/* ---------------- scheda componente (in testa al pannello) ---------------- */
function heroKpis(el) {
  switch (el.el) {
    case 'gen': return [['Potenza', () => fP(el.Pe)], ['Frequenza', () => el.w > 0.05 ? (el.w * 50).toFixed(2) + ' Hz' : '—'], ['Acqua', () => el.Tc.toFixed(0) + ' °C']];
    case 'bess': return [['Potenza', () => fP(el.P)], ['Carica', () => el.soc.toFixed(0) + ' %'], ['Celle', () => el.Tcell.toFixed(0) + ' °C']];
    case 'fdr': return [['Corrente', () => fI(el.Iamp)], ['Potenza', () => fP(el.P)], ['Cabine', () => el.nodes.filter(N => N.live).length + '/' + el.nodes.length]];
    case 'node': return [['Carico', () => fP(el.Pl)], ['Tensione', () => el.live ? (el.Vm * 100).toFixed(1) + ' %' : '—'], ['FV', () => (el.Ppv * 1000).toFixed(0) + ' kW']];
    case 'seg': case 'tie': return [['Corrente', () => fI(el.I)], ['Lunghezza', () => el.km.toFixed(1) + ' km'], ['Tipo', () => el.t === 'a70' ? 'aereo' : 'cavo']];
    case 'bus': return [['Tensione', () => el.live ? fV(el.Vm) : '—'], ['Frequenza', () => fF(el.fm, 2)], ['df/dt', () => el.rocof.toFixed(2) + ' Hz/s']];
    case 'br': return [['Potenza', () => fP(Math.abs(el.Sa.r))], ['Corrente', () => fI(el.I)], ['Carico', () => fPct(el.load)]];
    case 'pv': return [['Immessa', () => fP(el.I.pv.P)], ['Disponibile', () => fP(el.I.pv.Pav)], ['Sole', () => el.I.pv.irr.toFixed(0) + ' W/m²']];
    case 'isl': return [['Frequenza', () => fF(el.buses[0].fm, 2)], ['Carico', () => fP(islLoad(el))], ['Al buio', () => fP(islLost(el))]];
  }
  return [];
}
function heroHtml(el) {
  const k = heroKpis(el);
  const acts = ctxItems(el).filter(i => i !== '-' && !/pannello comandi|Simula/.test(i.lab)).slice(0, 3);
  UI.heroActs = acts;
  return `<div class="hero"><div class="hh"><span class="ic">${ICO(iconOf(el))}</span><div class="ht"><b>${esc(el.nm || el.id)}</b><small>${esc(KIND_NM[el.el] || '')}</small></div>${DYN(() => { const s = stateOf(el); return { html: `<span class="state st-${s[1] || 'off'}">${esc(s[0])}</span>` }; })}</div>
    <div class="hk">${k.map(x => `<div><small>${x[0]}</small>${DYN(x[1])}</div>`).join('')}</div>
    ${acts.length ? `<div class="ha">${acts.map((a, i) => `<button class="btn ${a.cls || ''}" data-a="heroAct" data-p="${i}" title="${esc(a.lab)}">${ICO(a.ic)} ${esc(a.lab)}</button>`).join('')}</div>` : ''}</div>`;
}
ACT.heroAct = p => { const a = UI.heroActs[+p]; if (!a) return; if (a.ask) confirmAsk('hero', a.ask, () => { runCmd(a.fn); }); else a.fn(); };

/* ---------------- ricerca globale ---------------- */
const PAL = { items: [], sel: 0 };
function palAll() {
  const L = [], add = (ic, t, sub, fn, key) => L.push({ ic, t, sub, fn, key: (t + ' ' + sub + ' ' + (key || '')).toLowerCase() });
  const goEl = (el) => () => { openRight(); selectEl(el); if (UI.ctab === 'dash') showCtab('sld'); if (UI.ctab === 'map') flyToEl(el); };
  S.isl.forEach(I => add('🏝', I.nm, 'dashboard dell\'isola', () => { UI.dash = I.id; selectIsl(I.id); showCtab('dash'); }, 'isola rete'));
  add('▦', 'Panoramica dell\'arcipelago', 'dashboard generale', () => ACT.home(), 'home');
  S.gens.forEach(G => add('⚙', G.nm, 'gruppo diesel ' + (G.Pn * 1000).toFixed(0) + ' kW', goEl(G), 'ge generatore motore'));
  S.isl.forEach(I => add('☀', I.pvEl.nm, 'fotovoltaico distribuito ' + (I.pv.kwp / 1000).toFixed(2) + ' MWp', goEl(I.pvEl), 'fv solare pannelli'));
  S.bess.forEach(B => add('🔋', B.nm, 'accumulo ' + (B.Pn * 1000).toFixed(0) + ' kW', goEl(B), 'batteria'));
  S.feeders.forEach(F => add('〰', F.short + ' ' + F.nm.replace('Linea ', ''), 'linea MT · ' + S.islById[F.isl].nm, goEl(F), 'linea feeder'));
  S.nodes.forEach(N => add('🏠', N.nm, 'cabina · ' + S.islById[N.isl].nm, goEl(N), 'cabina carico'));
  S.ties.forEach(T => add('◇', T.nm, 'punto di apertura · ' + S.islById[T.isl].nm, goEl(T), 'na'));
  S.buses.filter(b => !b.grid).forEach(B => add('▬', B.nm, 'sbarra · ' + S.islById[B.isl].nm, goEl(B), 'sbarra'));
  S.br.forEach(br => add('🔌', br.nm, 'collegamento', goEl(br), 'cavo'));
  SCEN.forEach(s => add('⚡', s.nm, 'imprevisto · ' + S.islById[s.isl].nm, () => ACT.scenRun(s.id), 'scenario'));
  [['⏯', 'Pausa / riprendi', () => togglePause()], ['▦', 'Vista: dashboard', () => showCtab('dash')], ['⎍', 'Vista: schema unifilare', () => showCtab('sld')], ['🗺', 'Vista: mappa', () => showCtab('map')],
   ['〜', 'Apri l\'oscilloscopio', () => showBtab('scope')], ['📈', 'Apri i trend', () => showBtab('trend')], ['🔔', 'Apri gli allarmi', () => showBtab('alm')], ['📜', 'Apri il registro eventi', () => showBtab('soe')],
   ['✓', 'Riconosci tutti gli allarmi', () => $('bAck').click()], ['🎓', 'Tour guidato', () => tourStart()], ['⚙', 'Impostazioni', () => settings()], ['🧑‍🔧', UI.expert ? 'Passa a modalità BASE' : 'Passa a modalità ESPERTO', () => ACT.mode()]
  ].forEach(c => add(c[0], c[1], 'comando', c[2], 'azione'));
  return L;
}
function palOpen() { PAL.all = palAll(); $('pal').classList.remove('hidden'); $('palQ').value = ''; palFilter(); setTimeout(() => $('palQ').focus(), 10); }
function palClose() { $('pal').classList.add('hidden'); }
function palFilter() {
  const q = $('palQ').value.toLowerCase().trim().split(/\s+/).filter(Boolean);
  PAL.items = PAL.all.filter(i => q.every(w => i.key.includes(w))).slice(0, 40); PAL.sel = 0; palRender();
}
function palRender() {
  $('palL').innerHTML = PAL.items.length ? PAL.items.map((i, k) => `<div class="pi ${k === PAL.sel ? 'on' : ''}" data-pi="${k}"><span class="ic">${ICO(i.ic)}</span><b>${esc(i.t)}</b><small>${esc(i.sub)}</small></div>`).join('') : '<p class="note" style="padding:10px">Nessun risultato</p>';
  const on = $('palL').querySelector('.on'); if (on) on.scrollIntoView({ block: 'nearest' });
}
function palGo(k) { const i = PAL.items[k]; if (!i) return; palClose(); i.fn(); }
$('palQ').addEventListener('input', palFilter);
$('palQ').addEventListener('keydown', e => {
  if (e.key === 'ArrowDown') { PAL.sel = Math.min(PAL.items.length - 1, PAL.sel + 1); palRender(); e.preventDefault(); }
  else if (e.key === 'ArrowUp') { PAL.sel = Math.max(0, PAL.sel - 1); palRender(); e.preventDefault(); }
  else if (e.key === 'Enter') palGo(PAL.sel);
});
$('palL').addEventListener('click', e => { const p = e.target.closest('[data-pi]'); if (p) palGo(+p.dataset.pi); });
$('pal').addEventListener('mousedown', e => { if (e.target.id === 'pal') palClose(); });
$('bSearch').onclick = () => palOpen();
window.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); palOpen(); } else if (e.key === '/' && !/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) { e.preventDefault(); palOpen(); } });

/* ---------------- tour guidato ---------------- */
const TOUR = [
  ['#top .timebox', 'Il tempo', 'Orologio della simulazione. Il pulsante di pausa ferma tutto (anche con la barra spaziatrice); 1×…120× accelera la giornata (carichi, sole, consumi).'],
  ['#left', 'Le isole', 'Ogni rete con il suo stato a colpo d\'occhio: verde regolare, giallo disturbata, rosso al buio. Clic per selezionarla.'],
  ['#ctabs', 'Tre viste', 'Dashboard per i numeri, Schema unifilare per gli interruttori, Mappa per vedere la rete sul territorio. Tutte interattive.'],
  ['#cvWrap', 'Interagisci', 'Clic su un componente per aprirne i comandi. Sulla mappa il clic apre subito le azioni rapide; sullo schema usa il tasto destro.'],
  ['#right', 'Pannello comandi', 'In alto la scheda del componente con le azioni principali. Ogni manovra chiede conferma (ESEGUI), come in una vera sala controllo.'],
  ['#bMenu', 'Menu', 'Qui apri e chiudi i pannelli (anche gli strumenti: oscilloscopio con le sinusoidi, trend, eventi), la moviola, la modalità esperto e le impostazioni.'],
  ['#bScen', 'Imprevisti', 'Guasti, blackout, avarie e tempeste: ognuno ha un obiettivo. Risolvilo in fretta per fare punti.'],
  ['#score', 'Punti e voto', 'Il voto A–E dice come sta andando il servizio adesso; l\'energia non fornita fa perdere punti.'],
  ['#bSearch', 'Trova tutto', 'Premi Ctrl+K (o /) e scrivi: un\'isola, un gruppo, una cabina, un imprevisto o un comando.']
];
let tourK = 0;
function tourStart() { closeModal(); UI.lay = { left: true, right: true, bottom: false, max: null }; applyLayout(); tourK = 0; $('tour').classList.remove('hidden'); setTimeout(tourShow, 80); }
function tourShow() {
  const [sel, t, txt2] = TOUR[tourK], e = document.querySelector(sel);
  if (!e) { tourNext(); return; }
  const r = e.getBoundingClientRect(), hole = $('tourHole'), card = $('tourCard');
  Object.assign(hole.style, { left: r.left - 4 + 'px', top: r.top - 4 + 'px', width: r.width + 8 + 'px', height: r.height + 8 + 'px' });
  card.innerHTML = `<small>${tourK + 1} / ${TOUR.length}</small><b>${esc(t)}</b><p>${esc(txt2)}</p><div class="row"><button class="btn" data-a="tourEnd">Chiudi</button>${tourK ? '<button class="btn" data-a="tourPrev">← Indietro</button>' : ''}<button class="btn go" data-a="tourNext">${tourK === TOUR.length - 1 ? 'Fine' : 'Avanti →'}</button></div>`;
  const cw = 340, ch = card.offsetHeight || 160;
  let x = r.right + 14, y = r.top;
  if (x + cw > window.innerWidth) x = r.left - cw - 14;
  if (x < 8) { x = Math.min(Math.max(8, r.left), window.innerWidth - cw - 8); y = r.bottom + 14; if (y + ch > window.innerHeight) y = r.top - ch - 14; }
  y = clamp(y, 8, window.innerHeight - ch - 8);
  Object.assign(card.style, { left: x + 'px', top: y + 'px', width: cw + 'px' });
}
function tourNext() { tourK++; if (tourK >= TOUR.length) return ACT.tourEnd(); tourShow(); }
ACT.tourNext = () => tourNext();
ACT.tourPrev = () => { tourK = Math.max(0, tourK - 1); tourShow(); };
ACT.tourEnd = () => { $('tour').classList.add('hidden'); try { localStorage.setItem('eolie.seen', '1'); } catch (e) { } };
window.addEventListener('resize', () => { if (!$('tour').classList.contains('hidden')) tourShow(); });

/* ---------------- benvenuto e guida ---------------- */
function welcome() {
  modal('Benvenuto in Eolie Grid', `<div class="welcome">
    <p class="lead">Sei l'operatore del centro di controllo che tiene accese le otto reti elettriche delle isole Eolie: centrali diesel, fotovoltaico, batterie, linee a 20 kV e cabine, simulate con la fisica di una rete reale.</p>
    <div class="wcards">
      <button class="wcard" data-a="wGo" data-p="tour"><span>${ICO('school')}</span><b>Tour guidato</b><small>Due minuti per scoprire l'interfaccia</small></button>
      <button class="wcard" data-a="wGo" data-p="play"><span>${ICO('bolt')}</span><b>Gestisci un imprevisto</b><small>Guasti, blackout e tempeste con obiettivo e punti</small></button>
      <button class="wcard" data-a="wGo" data-p="free"><span>${ICO('map')}</span><b>Esplora liberamente</b><small>Mappa interattiva, schema, oscilloscopio</small></button>
      <button class="wcard" data-a="wGo" data-p="eco"><span>${ICO('euro')}</span><b>Modalità gestione</b><small>Budget, gasolio, cantieri: costruisci FV, accumuli e cavi</small></button>
    </div>
    <p class="note">Tasto destro sullo schema (o clic sulla mappa) per le azioni rapide · Ctrl+K per cercare · barra spaziatrice per la pausa.</p></div>`);
}
ACT.wGo = p => { try { localStorage.setItem('eolie.seen', '1'); } catch (e) { } closeModal(); if (p === 'tour') tourStart(); else if (p === 'play') scenMenu(); else if (p === 'eco') ACT.gameMode(); else { showCtab('map'); } };
$('bHelp').onclick = () => modal('Aiuto', `<div class="wcards">
  <button class="wcard" data-a="wGo" data-p="tour"><span>${ICO('school')}</span><b>Tour guidato</b><small>Le parti dell'interfaccia</small></button>
  <button class="wcard" data-a="helpFull"><span>${ICO('book')}</span><b>Guida completa</b><small>Simulazione, procedure, convenzioni</small></button>
  <button class="wcard" data-a="keys"><span>${ICO('keyboard')}</span><b>Scorciatoie</b><small>Tastiera e mouse</small></button></div>`);
ACT.helpFull = () => help();
ACT.keys = () => modal('Scorciatoie', `<table class="dt">${[['Barra spaziatrice', 'Pausa / riprendi'], ['Ctrl+K oppure /', 'Cerca isole, componenti, imprevisti, comandi'], ['Esc', 'Chiudi menu, finestre, annulla un comando'], ['Clic sulla mappa', 'Seleziona e apre le azioni rapide'], ['Doppio clic sulla mappa', 'Vola sull\'isola'], ['Tasto destro sullo schema', 'Azioni rapide del componente'], ['Rotella', 'Zoom di schema e mappa'], ['Trascina', 'Sposta la vista'], ['Clic su una notifica', 'Va al componente interessato']].map(r => `<tr><td><b>${r[0]}</b></td><td>${r[1]}</td></tr>`).join('')}</table>`);

/* ---------------- notifiche cliccabili ---------------- */
$('toast').addEventListener('click', e => { const d = e.target.closest('[data-el]'); if (!d) return; const el = S.byId[d.dataset.el] || S.islById[d.dataset.el]; if (el) { openRight(); selectEl(el); } d.remove(); });

/* ---------------- fine obiettivo ---------------- */
function goalModal(s, pts, el) {
  modal('Obiettivo raggiunto', `<div class="win"><div class="big">${ICO('check')}</div><b>${esc(s.nm)}</b><div class="tiles" style="margin-top:12px"><div class="tile ok"><small>Tempo</small><b>${fmtDur(el)}</b></div><div class="tile ok"><small>Punti</small><b>+${pts}</b></div><div class="tile"><small>Totale</small><b>${Math.round(GAME.pts)}</b></div><div class="tile"><small>Qualità del servizio</small><b>${GAME.grade}</b></div></div>
  <div class="row" style="justify-content:center;margin-top:10px"><button class="btn hi" data-a="nextScen">Prossimo imprevisto</button><button class="btn" data-a="closeM">Continua a esplorare</button></div></div>`);
}
ACT.nextScen = () => scenMenu();
ACT.closeM = () => closeModal();

/* ---------------- automazione su tutte le isole ---------------- */
function emsLabel() {
  const b = $('bEms'); if (!b) return;
  const on = S.isl.filter(I => I.ems.on).length, all = on === S.isl.length;
  b.innerHTML = '<i></i>Automazione (EMS) su tutte le isole' + (on && !all ? ' <small style="color:var(--wa)">· ' + on + '/' + S.isl.length + ' inserite</small>' : '');
  b.classList.toggle('on', all);
  b.title = 'Inserisce o disinserisce in un colpo solo l\'automazione di centrale di tutte le isole (avvio/arresto gruppi, sincronizzazione, rialimentazione, gestione FV e accumuli)';
}
ACT.emsAll = () => {
  const all = S.isl.every(I => I.ems.on), on = !all;
  S.isl.forEach(I => { I.ems.on = on; });
  if (!on) S.gens.forEach(G => { G.asyn = false; });
  soe(null, on ? 'Automazione di centrale INSERITA su tutte le isole' : 'Automazione di centrale DISINSERITA su tutte le isole: gestione completamente manuale', 2);
  toast(on ? 'Automazione inserita su tutte le isole' : 'Automazione disinserita ovunque: ora avvii, sincronizzi e rialimenti tu. Le protezioni restano attive.', true);
  emsLabel(); refreshIslList(true); buildFace();
};

/* ---------------- menu ☰ ---------------- */
ACT.menu = () => { emsLabel(); $('menuBox').classList.toggle('hidden'); };
document.addEventListener('mousedown', e => { if (!e.target.closest('.hmenu')) $('menuBox').classList.add('hidden'); });
$('menuBox').addEventListener('click', e => { if (e.target.closest('#bSet,#bHelp')) $('menuBox').classList.add('hidden'); });

/* ---------------- controlli di zoom ---------------- */
function zoomBar() {
  const d = document.createElement('div'); d.id = 'zoomBar';
  d.innerHTML = '<button data-a="zoom" data-p="in" title="Ingrandisci (+)">＋</button><button data-a="zoom" data-p="out" title="Riduci (−)">－</button><button data-a="zoom" data-p="fit" title="Adatta alla finestra (0)">⊡</button><button data-a="zoom" data-p="sel" title="Centra sull\'elemento selezionato">◎</button>';
  $('cvWrap').appendChild(d);
}
function zoomBy(f) {
  const map = UI.ctab === 'map', key = map ? 'map:' + UI.isl : UI.isl, v = UI.view[key]; if (!v) return;
  const z = clamp(v.z * f, map ? 3 : 0.2, map ? 3000 : 3.5), cx = SLD.w / 2, cy = SLD.h / 2;
  const to = { z, ox: cx - (cx - v.ox) * z / v.z, oy: cy - (cy - v.oy) * z / v.z };
  if (map) startAnim(key, to); else UI.view[key] = to;
}
ACT.zoom = p => {
  ctxClose();
  if (p === 'in') zoomBy(1.6); else if (p === 'out') zoomBy(1 / 1.6);
  else if (p === 'fit') { if (UI.ctab === 'map') flyTo(UI.isl); else sldFit(S.islById[UI.isl]); }
  else if (p === 'sel' && UI.sel) { if (UI.ctab === 'map') flyToEl(UI.sel); else toast('Seleziona sulla mappa per centrare un elemento', true); }
};
window.addEventListener('keydown', e => {
  if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName) || UI.ctab === 'dash') return;
  if (e.key === '+' || e.key === '=') ACT.zoom('in'); else if (e.key === '-') ACT.zoom('out'); else if (e.key === '0') ACT.zoom('fit');
});

/* ---------------- avvio ---------------- */
zoomBar();
setSlow(1);
mapBar();
wxUpd();
emsLabel();
segUpd();
if (window.innerWidth < 1150) { UI.lay.left = false; applyLayout(); }
setTimeout(() => { const sp = $('splash'); if (sp) { sp.classList.add('out'); setTimeout(() => sp.remove(), 600); } let seen = null; try { seen = localStorage.getItem('eolie.seen'); } catch (e) { } if (!seen) welcome(); }, 350);
