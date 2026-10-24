'use strict';
/* =====================================================================
   AVVIO, CICLO PRINCIPALE, INTESTAZIONE, ELENCO ISOLE, ALLARMI, EVENTI
   ===================================================================== */
initSim();
UI.sel = S.islById[UI.isl];

/* ---------- dimensionamento ---------- */
function resize() {
  const w = $('cvWrap'), cv = $('cv'), dpr = window.devicePixelRatio || 1;
  SLD.w = w.clientWidth; SLD.h = w.clientHeight; SLD.dpr = dpr;
  cv.width = Math.round(SLD.w * dpr); cv.height = Math.round(SLD.h * dpr);
}
SLD.cv = $('cv'); SLD.g = SLD.cv.getContext('2d');
window.addEventListener('resize', () => { uiScale(); resize(); UI.view = {}; if (UI.ctab === 'dash') buildDash(); });
resize(); sldEvents();

/* ---------- schede ---------- */
function showCtab(t) {
  UI.ctab = t; document.querySelectorAll('#ctabs [data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === t)); $('tip').style.display = 'none';
  $('dash').classList.toggle('on', t === 'dash'); $('bFit').style.display = t === 'dash' ? 'none' : ''; if ($('mapBar')) $('mapBar').style.display = t === 'map' ? 'flex' : 'none'; if ($('zoomBar')) $('zoomBar').style.display = t === 'dash' ? 'none' : 'flex'; if (typeof ctxClose === 'function') ctxClose();
  if (t === 'dash') { $('banner').style.display = 'none'; buildDash(); }
}
function showBtab(t) { if (!UI.lay.bottom || UI.lay.max === 'center') { UI.lay.bottom = true; UI.lay.max = null; applyLayout(); } UI.btab = t; document.querySelectorAll('#btabs [data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === t)); document.querySelectorAll('.bp').forEach(p => p.classList.toggle('on', p.id === 'bp-' + t)); if (t === 'alm') renderAlarms(true); if (t === 'soe') renderSoe(true); }
document.querySelectorAll('#ctabs [data-tab]').forEach(b => b.onclick = () => showCtab(b.dataset.tab));
document.querySelectorAll('#btabs [data-tab]').forEach(b => b.onclick = () => showBtab(b.dataset.tab));
$('bFit').onclick = () => { if (UI.ctab === 'sld') sldFit(S.islById[UI.isl]); else mapFit(UI.isl); };


/* ---------- intestazione ---------- */
$('bPause').onclick = () => togglePause();
function togglePause() { UI.paused = !UI.paused; S.paused = UI.paused; $('bPause').innerHTML = ICO(UI.paused ? 'play' : 'pause'); $('bPause').classList.toggle('on', UI.paused); }
function sndLabel() { $('bSnd').innerHTML = '<i></i>Suono degli allarmi'; $('bSnd').classList.toggle('on', UI.snd); }
sndLabel();
$('bSnd').onclick = () => { UI.snd = !UI.snd; sndLabel(); if (UI.snd) beep(1); };
$('bAlm').onclick = () => showBtab('alm');
$('bAck').onclick = () => { Object.keys(S.alarms).forEach(k => alarmAck(k)); renderAlarms(true); };
$('bScen').onclick = () => scenMenu();
$('bSet').onclick = () => settings();
$('mClose').onclick = () => closeModal();
$('modal').onclick = e => { if (e.target.id === 'modal') closeModal(); };
window.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (e.code === 'Space') { e.preventDefault(); togglePause(); }
  if (e.key === 'Escape') { closeModal(); confirmNo(); }
});
const KPI = [['Carico servito', () => fP(S.tot.now.load)], ['Rinnovabile', () => (S.tot.now.pv / Math.max(1e-6, S.tot.now.pv + S.tot.now.dsl + Math.max(0, S.tot.now.imp)) * 100).toFixed(0) + ' %'], ['Gasolio', () => S.tot.now.fuel.toFixed(0) + ' l/h'], ['Disalimentato', () => fP(S.tot.now.ens)]];
$('kpis').innerHTML = KPI.map((k, i) => `<div class="kpi"><small>${k[0]}</small><b id="kp${i}">—</b></div>`).join('');
function updHeader() {
  $('hClock').textContent = clkStr(S.clk); $('hDate').textContent = dateStr(S.doy) + (UI.paused ? ' · IN PAUSA' : '');
  if (S.tot.now) KPI.forEach((k, i) => { const n = $('kp' + i), v = k[1](); if (n.textContent !== v) n.textContent = v; });
  if (S.tot.now) $('kp3').style.color = S.tot.now.ens > 0.001 ? COL.al : '';
  const un = Object.values(S.alarms).filter(a => !a.acked), n = un.length;
  $('almN').textContent = n; $('almN2').textContent = n ? '(' + n + ')' : '';
  $('bAlm').classList.toggle('blink', un.some(a => a.prio >= 2));
  const eon = S.isl.filter(I => I.ems.on).length, eb = $('emsBadge');
  if (eb) { eb.style.display = eon === S.isl.length ? 'none' : ''; eb.innerHTML = ICO('hand') + (eon === 0 ? ' MANUALE' : ' EMS ' + eon + '/' + S.isl.length); }
}

/* ---------- elenco isole ---------- */
function refreshIslList(force) {
  const box = $('islList');
  if (force || !box.children.length) {
    box.innerHTML = S.isl.map(I => `<div class="isl" data-a="isl" data-p="${I.id}" id="il_${I.id}"><i class="lamp" id="ill_${I.id}"></i><b>${esc(I.nm)}</b><span class="f" id="ilf_${I.id}"></span><small><span id="ila_${I.id}"></span><span id="ilb_${I.id}"></span></small></div>`).join('');
  }
  S.isl.forEach(I => {
    const b = I.buses[0], A = I.area, live = b.live;
    const lvl = Object.values(S.alarms).filter(a => a.active && a.isl === I.id).reduce((m, a) => Math.max(m, a.prio), 0);
    const c = !I.com ? '#7d8a95' : !live ? COL.al : lvl >= 3 ? COL.al : lvl >= 2 ? COL.wa : COL.ok;
    $('ill_' + I.id).style.background = c; $('ill_' + I.id).style.boxShadow = '0 0 6px ' + c;
    $('il_' + I.id).classList.toggle('sel', UI.isl === I.id);
    $('ilf_' + I.id).textContent = !I.com ? 'N.D.' : live ? (A.grid ? '50.000' : b.fm.toFixed(3)) + ' Hz' : 'BUIO';
    $('ilf_' + I.id).style.color = !live ? COL.al : Math.abs(b.fm - 50) > 0.2 ? COL.wa : '';
    const L = I.nodes.reduce((a, N) => a + (N.live ? N.Pl : 0), 0), on = I.gens.filter(g => g.st === 'IN PARALLELO').length;
    $('ila_' + I.id).textContent = fP(L) + ' · ' + on + '/' + I.gens.length + ' GE' + (I.bess.length ? ' · SoC ' + I.bess[0].soc.toFixed(0) + '%' : '');
    $('ilb_' + I.id).textContent = !I.com ? 'RTU N.D.' : !live ? 'FUORI TENSIONE' : A.grid ? 'RTN' : A.isl.length > 1 ? 'parallelo' : I.ems.on ? 'EMS' : 'MANUALE';
  });
}
ACT.isl = p => { selectIsl(p); if (UI.ctab === 'dash') { UI.dash = p; buildDash(); } };
$('mini').addEventListener('click', e => {
  const r = $('mini').getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
  let best = null, bd = 30; MINI.hits.forEach(h => { const d = Math.hypot(h.x - mx, h.y - my); if (d < bd) { bd = d; best = h; } });
  if (best) selectIsl(best.id);
});

/* ---------- allarmi ---------- */
let almSig = '';
function renderAlarms(force) {
  const L = Object.values(S.alarms).sort((a, b) => (a.acked - b.acked) || (b.active - a.active) || (b.prio - a.prio) || (b.n - a.n));
  const sig = L.map(a => a.key + a.acked + a.active + a.text).join('|');
  if (!force && sig === almSig) return; almSig = sig;
  $('almT').innerHTML = '<tr><td style="color:#5d717d">ora</td><td style="color:#5d717d">isola</td><td style="color:#5d717d">pr.</td><td class="tx" style="color:#5d717d">descrizione</td><td style="color:#5d717d">stato</td><td></td></tr>' +
    (L.length ? L.map(a => `<tr class="p${a.prio} ${a.acked ? '' : 'un'} ${a.active ? '' : 'in'}"><td>${clkStr(a.clk)}</td><td>${a.isl ? esc(S.islById[a.isl] ? S.islById[a.isl].nm : a.isl) : '—'}</td><td>${['', 'BASSA', 'MEDIA', 'ALTA'][a.prio]}</td><td class="tx">${esc(a.text)}</td><td>${a.active ? 'ATTIVO' : 'RIENTRATO'}${a.acked ? ' · riconosciuto' : ''}</td><td>${a.acked ? '' : `<button class="btn sm" data-a="ack" data-p="${esc(a.key)}">Riconosci</button>`}${a.el ? ` <button class="btn sm" data-a="goEl" data-p="${esc(a.el)}">vai</button>` : ''}</td></tr>`).join('') : '<tr><td colspan="6" style="color:#5d717d;padding:10px">Nessun allarme</td></tr>');
}
ACT.ack = p => { alarmAck(p); renderAlarms(true); };
ACT.goEl = p => { const el = S.byId[p] || S.islById[p]; if (!el) return; selectEl(el); if (!UI.lay.right || UI.lay.max === 'center') { UI.lay.right = true; UI.lay.max = null; applyLayout(); } };

/* ---------- registro eventi ---------- */
let soeSig = '';
function renderSoe(force) {
  const isl = $('soeIsl').value, q = $('soeQ').value.toLowerCase(), imp = $('soeImp').checked;
  const last = S.soe.length ? S.soe[S.soe.length - 1].n : 0, sig = last + isl + q + imp;
  if (!force && sig === soeSig) return; soeSig = sig;
  const L = [];
  for (let i = S.soe.length - 1; i >= 0 && L.length < 500; i--) { const e = S.soe[i]; if (isl && e.isl !== isl) continue; if (imp && e.prio < 2) continue; if (q && e.text.toLowerCase().indexOf(q) < 0) continue; L.push(e); }
  $('soeT').innerHTML = L.map(e => `<tr class="p${e.prio}"><td class="t">${clkStr(e.clk)}</td><td class="t">t=${e.t.toFixed(3)} s</td><td>${e.isl ? esc(S.islById[e.isl] ? S.islById[e.isl].nm : e.isl) : '—'}</td><td class="tx">${esc(e.text)}</td></tr>`).join('');
}
$('soeIsl').innerHTML = '<option value="">tutte le isole</option>' + S.isl.map(I => `<option value="${I.id}">${esc(I.nm)}</option>`).join('');
['soeIsl', 'soeQ', 'soeImp'].forEach(id => $(id).addEventListener('input', () => renderSoe(true)));

/* notifiche per eventi rilevanti */
let lastSoeN = 0;
function soeNotify() {
  const L = S.soe.filter(e => e.n > lastSoeN);
  if (S.soe.length) lastSoeN = S.soe[S.soe.length - 1].n;
  const hi = L.filter(e => e.prio >= 3);
  hi.slice(-3).forEach(e => toast((e.isl && S.islById[e.isl] ? S.islById[e.isl].nm + ': ' : '') + e.text, false, e.el));
  if (hi.length) beep(3); else if (L.some(e => e.prio >= 2)) beep(2);
  if (S.hint && S.hint.t !== UI.hintT) { UI.hintT = S.hint.t; toast('💡 ' + S.hint.msg, true, S.hint.el); }
}

/* ---------- impostazioni ---------- */
function settings() {
  const hh = Math.floor(S.clk / 3600), mm = Math.floor(S.clk / 60) % 60;
  const d = new Date(2026, 0, S.doy), ds = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  modal('Impostazioni della simulazione', `<div class="grid2"><div>
    ${SEC('Orologio', PSET(`<label>Ora</label><span><input id="stTime" type="time" value="${pad(hh)}:${pad(mm)}"></span>`, `<label>Data</label><span><input id="stDate" type="date" value="${ds}"></span>`) + ROW('<button class="btn" data-a="setTime">Applica ora e data</button>') + '<p class="note">La stagione modifica profili di carico (turismo estivo), alba/tramonto e irraggiamento. La dinamica elettrica è sempre in tempo reale (o rallentata): l\'orologio accelerato agisce solo su profili, energia e stato di carica.</p>')}
    ${SEC('Domanda e meteo', PSET(PIN('S.set|demand', 'Fattore di domanda', '× 1', 0.05), PSEL('S.set|weather', 'Meteo', [['sereno', 'Sereno'], ['variabile', 'Variabile'], ['coperto', 'Coperto'], ['temporale', 'Temporale']])))}
    </div><div>
    ${SEC('Imprevisti casuali', PSET(PSEL('S.set|randF', 'Frequenza guasti casuali', [[0, 'nessuno'], [1, 'rari'], [2, 'frequenti'], [3, 'molto frequenti']]), PIN('S.set|repT', 'Durata interventi squadra', 's', 5), PCK('S.set|prot', 'Protezioni elettriche attive')))}
    ${SEC('Simulazione', ROW('<button class="btn dg" data-a="restart">Riavvia da capo</button>') + '<p class="note">Il riavvio ricostruisce rete e stato iniziale (ore 11:30 del 10 agosto).</p>')}
    </div></div>`);
  document.querySelectorAll('#mBody input[data-pk], #mBody select[data-pk]').forEach(n => { const v = getPK(n.dataset.pk); if (n.type === 'checkbox') n.checked = !!v; else n.value = v; });
}
ACT.setTime = () => {
  const t = $('stTime').value.split(':'), d = new Date($('stDate').value);
  S.clk = (+t[0]) * 3600 + (+t[1]) * 60;
  if (!isNaN(d)) { const start = new Date(d.getFullYear(), 0, 0); S.doy = Math.round((d - start) / 86400000); }
  soe(null, 'Orologio impostato: ' + clkStr(S.clk) + ' del ' + dateStr(S.doy), 1);
  closeModal();
};
ACT.restart = () => { location.reload(); };

/* ---------- guida ---------- */
function help() {
  modal('Guida rapida', `<div class="help">
  <h4>Che cosa è simulato</h4>
  <p>Otto reti isolane delle Eolie a 20 kV (Lipari e Vulcano collegate da due cavi, Salina, Panarea, Stromboli, la microrete di Ginostra, Filicudi, Alicudi). Ogni gruppo diesel è una macchina sincrona con inerzia, flusso di campo, regolatore di velocità (con limitatore del turbocompressore) e regolatore di tensione. Le reti sono risolte in corrente alternata ogni millisecondo; i guasti trifase, bifase e monofase a terra sono calcolati con le componenti di sequenza (neutro isolato o compensato con bobina di Petersen). Dati di rete indicativi, non ufficiali.</p>
  <h4>Come è organizzato</h4>
  <ul><li><b>Dashboard</b>: panoramica dell'arcipelago (clic su una scheda per la dashboard della singola isola), poi schema unifilare e mappa.</li>
  <li><b>Pannelli</b>: ogni pannello si chiude con «–», si ingrandisce con «⤢» e si riapre dai pulsanti Isole / Comandi / Strumenti in alto. Le sezioni dei pannelli si chiudono cliccando sul titolo.</li>
  <li><b>BASE / ESPERTO</b>: in BASE vedi solo i comandi essenziali; ESPERTO mostra tarature delle protezioni, parametri di modello e regolatori.</li>
  <li><b>Gioco</b>: ogni imprevisto ha un obiettivo; più sei rapido più punti ottieni. L'energia non fornita toglie punti. Il voto A–E riassume la qualità del servizio in questo momento (clic sul punteggio per il dettaglio).</li></ul>
  <h4>Schema unifilare</h4>
  <ul><li>Interruttori: <b style="color:#e03b3b">■ chiuso</b>, <b style="color:#33e07a">□ aperto</b>, giallo in manovra, «E» estratto. IMS e punti di apertura sono rombi.</li>
  <li>Linee azzurre in tensione, grigie fuori tensione, magenta con guasto a terra presente in rete. Le bandierine rosse sono le protezioni intervenute (da resettare).</li>
  <li>I triangoli sui tratti sono gli indicatori di passaggio del guasto (RGDAT): il guasto è a valle dell'ultimo indicatore acceso.</li>
  <li>Rotella: zoom · trascina: sposta · doppio clic su un cavo: apre l'isola collegata.</li></ul>
  <h4>Comandi (selezione-esecuzione)</h4>
  <p>Clic su un componente → pannello a destra. I comandi di manovra chiedono conferma (ESEGUI). Ogni componente ha le schede Comandi, Misure, Protezioni (tutte le tarature modificabili), Parametri (dati di modello modificabili) e Guasti.</p>
  <h4>Oscilloscopio</h4>
  <p>Quattro canali scelti tra tensioni di sbarra (di fase, concatenate, residua), tensione lato macchina dei gruppi e correnti di gruppi, linee, accumuli e cavi. Trigger AUTO/NORMALE/SINGOLO, spettro armonico, diagramma fasoriale. Per vedere bene i transitori rallenta la dinamica (menu «Dinamica»). Ogni guasto e ogni scatto produce una registrazione dell'oscilloperturbografo, selezionabile in «Sorgente».</p>
  <h4>Procedure tipiche</h4>
  <ul><li><b>Parallelo di un gruppo:</b> avvio → PRONTO → sincronoscopio (f±, V±) → chiusura quando l'indice è vicino alle 12, oppure sincronizzatore automatico.</li>
  <li><b>Guasto permanente su linea:</b> scatto definitivo → indicatori RGDAT → apertura degli IMS ai lati del tronco guasto → richiusura della linea → chiusura del punto di apertura → squadra.</li>
  <li><b>Blackout:</b> verificare le linee aperte (27) → avvio di un gruppo → chiusura su sbarra morta → altri gruppi in parallelo → rialimentazione a gradini (attenzione al carico freddo).</li></ul>
  <p class="note">Barra spaziatrice: pausa · Esc: annulla comando/chiudi finestra.</p></div>`);
}

/* ---------- ciclo principale ---------- */
let last = performance.now(), acc = 0, tDom = 0, tCv = 0, tMini = 0, tScope = 0, simLoad = 0;
function frame(now) {
  const dtr = Math.min(0.1, (now - last) / 1000); last = now;
  if (!UI.paused) {
    acc += dtr * UI.slow;
    let n = Math.floor(acc / DT); acc -= n * DT;
    if (n > 110) { n = 110; acc = 0; }
    const t0 = performance.now();
    for (let i = 0; i < n; i++) { fastStep(DT); if ((i & 15) === 15 && performance.now() - t0 > 28) { acc = 0; break; } }
    simLoad = simLoad * 0.95 + (performance.now() - t0) * 0.05;
  }
  SLD.t += dtr;
  tCv += dtr; tDom += dtr; tMini += dtr; tScope += dtr;
  if (tCv > 1 / 30) { tCv = 0; if (UI.ctab === 'sld') sldDraw(); else if (UI.ctab === 'map') mapDraw(); }
  if (tScope > 1 / 25) { tScope = 0; if (UI.btab === 'scope') scopeDraw(); else if (UI.btab === 'trend') trendDraw(); }
  if (tMini > 0.25) { tMini = 0; miniDraw(); }
  if (tDom > 0.2) {
    tDom = 0; updHeader(); refreshIslList(); updFace(); soeNotify(); gameStep(0.2); updScore();
    if (UI.ctab === 'dash') { if (dashKey !== UI.dash) buildDash(); else updDash(); }
    if (UI.btab === 'alm') renderAlarms(); if (UI.btab === 'soe') renderSoe();
    if (S.rec.recs.length !== UI.nRecs) { UI.nRecs = S.rec.recs.length; if (UI.btab === 'scope' && !document.activeElement.closest('#scopeCtl')) buildScopeCtl(); }
  }
  requestAnimationFrame(frame);
}
scopePreset('bus'); buildTrendCtl(); refreshIslList(true); buildFace();
modeLabel();
applyLayout(); showCtab('dash');
requestAnimationFrame(frame);

