'use strict';
/* =====================================================================
   INTERFACCIA DELLA MODALITÀ GESTIONE: cassa, conto economico, cantiere,
   piano degli accumuli, strategia di esercizio, giornate, salvataggio
   ===================================================================== */
/* campi dinamici: un registro per il pannello e uno per la finestra aperta */
let EG = [], EGM = [], EGT = EG;
const E_ = fn => { const i = EGT.length; EGT.push(fn); return `<span data-e="${i}"></span>`; };
const ECV = (fn, h) => { const i = EGT.length; EGT.push(fn); return `<canvas data-ec="${i}" style="height:${h}px"></canvas>`; };
const eurK = v => (v < 0 ? '−' : '') + '€ ' + (Math.abs(v) >= 10000 ? (Math.abs(v) / 1000).toFixed(0) + 'k' : Math.round(Math.abs(v)).toLocaleString('it-IT'));
const ecoMargin = () => { const R = ECO.rate || {}; return (R.ric || 0) + (R.exp || 0) - (R.gas || 0) - (R.om || 0) - (R.bess || 0) - (R.imp || 0) - (R.pen || 0); };
const dayNet = ledNet;
function updE(root, arr) {
  if (!root) return;
  const EG = arr;
  root.querySelectorAll('[data-e]').forEach(n => {
    const fn = EG[+n.dataset.e]; if (!fn) return;
    let r; try { r = fn(); } catch (e) { r = '—'; }
    if (Array.isArray(r)) { if (n.textContent !== r[0]) n.textContent = r[0]; n.className = r[1] || ''; }
    else if (r && typeof r === 'object') { if (n._h !== r.html) { n.innerHTML = r.html; n._h = r.html; } }
    else if (n.textContent !== String(r)) n.textContent = r;
  });
  root.querySelectorAll('canvas[data-ec]').forEach(c => { try { EG[+c.dataset.ec](c); } catch (e) { } });
}
function cfgSet(c) { try { const o = JSON.parse(localStorage.getItem('eolie.cfg') || '{}'); localStorage.setItem('eolie.cfg', JSON.stringify(Object.assign(o, c))); } catch (e) { } }
function cfgGet() { try { return JSON.parse(localStorage.getItem('eolie.cfg') || '{}'); } catch (e) { return {}; } }
function saveGet() { try { return JSON.parse(localStorage.getItem('eolie.save') || 'null'); } catch (e) { return null; } }
function ecoAutosave() { if (!ECO.on || ECO.over) return; try { localStorage.setItem('eolie.save', JSON.stringify(ecoSave())); } catch (e) { } }

/* picco di domanda dell'isola nel giorno simulato (per proporre taglie sensate) */
const PEAKC = {};
function islPeak(I) {
  const k = I.id + S.doy; if (PEAKC[k]) return PEAKC[k];
  let pk = 0; for (let h = 0; h < 24; h += 0.5) { let L = 0; I.nodes.forEach(N => { for (const t in N.loads) L += N.loads[t] * profile(t, h); }); pk = Math.max(pk, L); }
  return (PEAKC[k] = pk / 1000);
}

/* ---------------- intestazione ---------------- */
function ecoHeader() {
  if (!ECO.on) { $('bGame').innerHTML = ICO('euro') + ' Modalità gestione (budget e cantieri)'; return; }
  $('score').style.display = 'none'; $('cash').style.display = ''; $('tabEco').style.display = '';
  $('bGame').innerHTML = ICO('euro') + ' Gestione: salva, esci o ricomincia';
  updCash();
}
function updCash() {
  const m = ecoMargin(), v = $('cashV'), r = $('cashR');
  v.textContent = eurK(ECO.cash); v.style.color = ECO.cash < 0 ? COL.al : ECO.cash < 10000 ? COL.wa : '';
  r.textContent = (m >= 0 ? '▲ ' : '▼ ') + eurK(m) + '/h'; r.style.color = m >= 0 ? COL.ok : COL.al;
}
$('cash').onclick = () => showCtab('eco');

/* ---------------- pannello «Gestione» ---------------- */
function buildEco() {
  EG = []; EGT = EG;
  if (!ECO.on) {
    $('eco').innerHTML = `<div class="ecoIn"><div class="dbox"><h5>Modalità gestione</h5><p>Gestisci le reti delle Eolie come un'azienda: incassi per l'energia fornita (in proporzione alla qualità del servizio), paghi gasolio, manutenzione e penali, e con il margine costruisci impianti FV, accumuli, nuovi gruppi e cavi tra le isole.</p><div class="row"><button class="btn hi" data-a="gameMode">${ICO('euro')} Inizia o continua una partita</button></div></div></div>`;
    return;
  }
  const L = ECO.led, D = () => ECO.day;
  const tile = (lab, fn, sub, cls) => `<div class="tile ${cls || ''}"><small>${lab}</small><b>${E_(fn)}</b><span>${sub ? E_(sub) : ''}</span></div>`;
  let h = `<div class="ecoIn">
  <div class="ehead">
    <div class="ecash"><small>Cassa</small><b>${E_(() => [eur(ECO.cash), ECO.cash < 0 ? 'al' : ECO.cash < 10000 ? 'wa' : ''])}</b><span>${E_(() => { const m = ecoMargin(); return [(m >= 0 ? '▲ ' : '▼ ') + eur(m) + ' all\'ora in questo momento', m >= 0 ? 'ok' : 'al']; })}</span></div>
    <div class="eacts">
      <button class="btn hi" data-a="ecoBuild">${ICO('build')} Cantiere</button>
      <button class="btn" data-a="ecoFunds">${ICO('euro')} Fondi</button>
      <button class="btn" data-a="pvPanel">${ICO('sun')} Fotovoltaico</button>
      <button class="btn" data-a="ecoPlan">${ICO('battery')} Piano accumuli</button>
      <button class="btn" data-a="ecoEms">${ICO('gear')} Strategia di esercizio</button>
      <button class="btn" data-a="ecoDays">${ICO('list')} Giornate</button>
      <button class="btn" data-a="ecoSaveNow">Salva</button>
    </div>
  </div>
  <div class="tiles">` +
    tile('Ricavi oggi', () => eur(D().ric), () => 'tariffa ' + PRICE.tariff.toFixed(2) + ' €/kWh × qualità') +
    tile('Gasolio oggi', () => eur(D().gas), () => Math.round(D().fuelL).toLocaleString('it-IT') + ' litri · ' + PRICE.fuel.toFixed(2) + ' €/l') +
    tile('Margine oggi', () => { const n = dayNet(D()); return [eur(n), n >= 0 ? 'ok' : 'al']; }, () => 'investimenti oggi ' + eur(D().inv)) +
    tile('Quota rinnovabile', () => (D().pv / Math.max(1e-6, D().pv + D().dsl) * 100).toFixed(1) + ' %', () => 'oggi · ora ' + (S.tot.now ? (S.tot.now.pv / Math.max(1e-6, S.tot.now.pv + S.tot.now.dsl) * 100).toFixed(0) : 0) + ' %') +
    tile('Qualità del servizio', () => (D().qn > 0 ? D().q / D().qn * 100 : 100).toFixed(1) + ' %', () => 'ora ' + (S.isl.reduce((a, I) => a + (I.q === undefined ? 1 : I.q), 0) / S.isl.length * 100).toFixed(0) + ' %') +
    tile('Scambio con la Sicilia', () => { const g = rtnFlow(); return g === null ? ['non collegata', ''] : g < -0.001 ? ['vendi ' + fP(-g), 'ok'] : g > 0.001 ? ['compri ' + fP(g), 'wa'] : ['in equilibrio', '']; }, () => 'oggi venduti ' + Math.round(D().kwhExp || 0).toLocaleString('it-IT') + ' kWh · ' + eur(D().exp || 0)) +
    tile('Energia non fornita', () => [Math.round(D().ens) + ' kWh', D().ens > 1 ? 'al' : ''], () => 'penale ' + PRICE.ens.toFixed(2) + ' €/kWh') +
    `</div>
  <div class="panelgrid">
    <div class="dbox"><h5>Conto economico</h5>${E_(() => ({ html: '<table class="dt"><tr><td></td><td class="n" style="color:var(--dim)">oggi</td><td class="n" style="color:var(--dim)">dall\'inizio</td></tr>' + LED_KEYS.map(k => { const pos = !!LED_POS[k], f = v => Math.round(v) === 0 ? '0' : (pos ? '' : '−') + Math.round(v).toLocaleString('it-IT'); return `<tr><td>${LED_NM[k]}</td><td class="n ${pos ? 'ok' : ''}">${f(ECO.day[k])}</td><td class="n">${f(L[k])}</td></tr>`; }).join('') + `<tr class="tot"><td><b>Margine operativo</b></td><td class="n"><b>${eur(dayNet(ECO.day))}</b></td><td class="n"><b>${eur(dayNet(L))}</b></td></tr></table>` }))}</div>
    <div class="dbox"><h5>Andamento della cassa</h5>${ECV(cashChart, 150)}<p class="note">Un punto ogni 15 minuti di orologio. Le cadute verticali sono gli investimenti.</p></div>
    <div class="dbox wide"><h5>Isole</h5>${islTable()}</div>
    <div class="dbox"><h5>Cantieri in corso</h5>${E_(() => ({ html: projList() }))}</div>
    <div class="dbox"><h5>Finanziamenti</h5>${E_(() => ({ html: finSummary() }))}<div class="row" style="margin-top:6px"><button class="btn sm" data-a="ecoFunds">Chiedi fondi</button></div></div>
    <div class="dbox"><h5>Consigli</h5>${E_(() => ({ html: ecoTips().map(t => `<div class="tip">${esc(t)}</div>`).join('') || '<p class="note">Tutto in ordine: il servizio è regolare e il parco è sfruttato bene.</p>' }))}</div>
    <div class="dbox"><h5>Come si guadagna</h5><ul class="elist">
      <li><b>Ricavi</b>: ${PRICE.tariff.toFixed(2)} €/kWh fornito, ridotti se la frequenza esce da ±0,2 Hz (−15%) o da ±0,5 Hz (−40%), se la tensione di sbarra esce da ±8% (−10%) o se la cabina è a bassa tensione.</li>
      <li><b>Rete nazionale</b>: con il collegamento 150 kV chiuso compri dalla Sicilia a ${PRICE.imp.toFixed(2)} €/kWh e le vendi l'eccedenza (per esempio il FV di mezzogiorno) a ${PRICE.exp.toFixed(2)} €/kWh.</li>
      <li><b>Gasolio</b>: ${PRICE.fuel.toFixed(2)} €/l. Un gruppo poco carico consuma di più per ogni kWh: meglio pochi gruppi ben caricati, senza rinunciare alla riserva.</li>
      <li><b>Manutenzione</b>: ${PRICE.omDsl} €/MWh dai diesel e ${PRICE.start} € per avviamento; accumuli ${PRICE.bessWear} €/MWh scambiato; squadra ${PRICE.crew} € a intervento.</li>
      <li><b>Penale</b>: ${PRICE.ens.toFixed(2)} €/kWh di energia non fornita, oltre al mancato incasso. Sotto ${eur(ECO_BANKRUPT)} di cassa la gestione fallisce.</li>
      <li><b>Investimenti</b>: quota a carico del gestore al netto dei contributi pubblici. FV ${BUILD.pvKwp} €/kWp, accumuli ${BUILD.bessKw} €/kW + ${BUILD.bessKwh} €/kWh, diesel ${BUILD.dslKw} €/kW, cavi ${eur(BUILD.cableFix)} + ${eur(BUILD.cableKm)}/km.</li>
      <li><b>Fondi</b>: prestiti bancari secondo il merito di credito (rate a mezzanotte), contributi pubblici da impiegare in rinnovabili entro ${FIN.grantDays} giorni, anticipo di emergenza con cassa sotto ${eur(FIN.advCash)}.</li></ul></div>
  </div></div>`;
  $('eco').innerHTML = h;
  updE($('eco'), EG);
}
function updEco() { if (ECO.on && UI.ctab === 'eco') updE($('eco'), EG); }
/* potenza scambiata con la RTN (MW, > 0 import), null se il collegamento non è in servizio */
function rtnFlow() { return S.grid.bus.area && S.grid.bus.area.isl.length ? (S.grid.P || 0) : null; }
function islTable() {
  const ld = I => { const on = I.gens.filter(G => G.st === 'IN PARALLELO'); return [on.length, on.length ? on.reduce((a, G) => a + G.Pe, 0) / on.reduce((a, G) => a + G.Pn, 0) : 0]; };
  return '<table class="dt"><tr style="color:var(--dim)"><td>isola</td><td>qualità</td><td class="n">ricavi €/h</td><td class="n">gasolio €/h</td><td class="n">FV ora</td><td>diesel</td><td>accumulo</td><td></td></tr>' + S.isl.map(I =>
    `<tr data-a="ecoIsl" data-p="${I.id}"><td><b>${esc(I.nm)}</b></td><td>${E_(() => { const q = I.q === undefined ? 1 : I.q; return [(q * 100).toFixed(0) + '%', q < 0.99 ? (q < 0.7 ? 'al' : 'wa') : 'ok']; })}</td><td class="n">${E_(() => Math.round(I.ric || 0))}</td><td class="n">${E_(() => Math.round(I.gas || 0))}</td>` +
    `<td class="n">${E_(() => { const L = I.nodes.reduce((a, N) => a + (N.live ? N.Pl : 0), 0), lim = I.pv.Pav > 0.01 ? 1 - I.pv.P / I.pv.Pav : 0; return { html: (L > 0 ? Math.round(I.pv.P / L * 100) : 0) + '%' + (lim > 0.05 ? ' <small class="wa">(limitato ' + Math.round(lim * 100) + '%)</small>' : '') }; })}</td>` +
    `<td>${E_(() => { const [n, l] = ld(I); return n + '/' + I.gens.length + (n ? ' · ' + Math.round(l * 100) + '%' : ''); })}</td><td>${E_(() => I.bess.map(B => B.soc.toFixed(0) + '%').join(' ') || '—')}</td><td><button class="btn sm" data-a="ecoBuildIsl" data-p="${I.id}" title="Cantiere per ${esc(I.nm)}">${ICO('build')}</button></td></tr>`).join('') +
    '</table><p class="note">Diesel: gruppi in servizio e carico medio. Clic su una riga per i comandi dell\'isola, sul pulsante per il cantiere.</p>';
}
function projList() {
  if (!ECO.proj.length) return '<p class="note">Nessun cantiere aperto. Apri il Cantiere per investire il margine.</p>';
  const now = S.tc || 0;
  return ECO.proj.map(p => { const k = clamp((now - p.t0) / Math.max(1, p.tEnd - p.t0), 0, 1), left = Math.max(0, p.tEnd - now) / 3600; return `<div class="proj"><div><b>${esc(p.label)}</b><small>${eur(p.cost)} · mancano ${left >= 1 ? left.toFixed(1) + ' h' : Math.ceil(left * 60) + ' min'} di orologio</small></div><span class="lb"><i style="width:${k * 100}%"></i></span></div>`; }).join('');
}
function cashChart(cv) {
  const dpr = (window.devicePixelRatio || 1) * (UI.zf || 1), w = cv.clientWidth, hh = cv.clientHeight;
  if (!w) return;
  if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(hh * dpr); }
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = '#05080a'; g.fillRect(0, 0, w, hh);
  const H = ECO.hist.concat([[S.tc || 0, ECO.cash]]);
  if (H.length < 2) { txt(g, 'Il grafico si riempie con il passare delle ore simulate', w / 2, hh / 2, COL.dim, '11px ' + FONTS, 'center'); return; }
  let mn = Math.min(0, ...H.map(p => p[1])), mx = Math.max(...H.map(p => p[1])); if (mx - mn < 1000) mx = mn + 1000;
  const t0 = H[0][0], t1 = H[H.length - 1][0] || t0 + 1, X = t => 46 + (w - 54) * (t - t0) / Math.max(1, t1 - t0), Y = v => hh - 16 - (hh - 28) * (v - mn) / (mx - mn);
  g.strokeStyle = '#1a262e'; g.beginPath(); g.moveTo(46, Y(0)); g.lineTo(w - 8, Y(0)); g.stroke();
  g.strokeStyle = COL.ok; g.lineWidth = 1.6; g.beginPath(); H.forEach((p, i) => i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1]))); g.stroke();
  for (let q = 0; q <= 3; q++) { const v = mn + (mx - mn) * q / 3; txt(g, eurK(v).replace('€ ', ''), 42, Y(v) + 3, COL.dim, '9px ' + FONTM, 'right'); }
  txt(g, '← ' + ((t1 - t0) / 3600).toFixed(0) + ' h di orologio', w - 8, hh - 3, COL.dim, '9px ' + FONTM, 'right');
}
function ecoTips() {
  const T = [];
  S.isl.forEach(I => {
    const b = I.buses[0];
    if (!b.live) { T.push(I.nm + ' è al buio: non incassi nulla e paghi la penale. Rimetti in tensione l\'isola (gruppi o accumulo grid-forming).'); return; }
    if (I.nodes.some(N => !N.live)) T.push('Su ' + I.nm + ' ci sono cabine al buio: ogni kWh non fornito costa ' + PRICE.ens.toFixed(2) + ' € di penale.');
    if ((I.q === undefined ? 1 : I.q) < 0.99) T.push(I.nm + ': frequenza o tensione fuori banda, i ricavi dell\'isola sono ridotti del ' + Math.round((1 - I.q) * 100) + '%.');
    if (I.pv.Pav > 0.05 && I.pv.P < 0.8 * I.pv.Pav && !I.pv.opOff) T.push('Su ' + I.nm + ' il FV è limitato del ' + Math.round((1 - I.pv.P / I.pv.Pav) * 100) + '%: un accumulo più capiente, oppure un cavo verso un\'isola vicina, permetterebbe di usarlo al posto del gasolio.');
    const on = I.gens.filter(G => G.st === 'IN PARALLELO'), ld = on.length ? on.reduce((a, G) => a + G.Pe, 0) / on.reduce((a, G) => a + G.Pn, 0) : 1;
    if (on.length >= 2 && ld < 0.33) T.push('A ' + I.nm + ' ' + on.length + ' gruppi lavorano al ' + Math.round(ld * 100) + '% della potenza: a basso carico consumano di più per kWh. Valuta di ridurre la riserva (Strategia di esercizio) o di fermare a mano un gruppo.');
    I.bess.forEach(B => { if (B.soc > 96 && I.pv.P < 0.9 * I.pv.Pav) T.push(B.nm + ' è carico: il surplus FV si spreca. Un accumulo più capiente (Cantiere) o una scarica anticipata (Piano accumuli) aiutano.'); });
  });
  if (ECO.cash < 10000 && ECO.cash > ECO_BANKRUPT) T.push('Cassa bassa: rimanda gli investimenti e risparmia gasolio finché il margine non torna positivo, oppure chiedi fondi (prestito o anticipo di emergenza).');
  const GR = ECO.fin && ECO.fin.grant; if (GR && GR.vinc > 0) T.push('Hai ' + eur(GR.vinc) + ' di contributo da impiegare in FV, accumuli o cavi entro ' + Math.max(0, (GR.tEnd - (S.tc || 0)) / 3600).toFixed(0) + ' h, altrimenti va restituito.');
  return T.slice(0, 5);
}
ACT.ecoIsl = p => { selectEl(S.islById[p]); openRight(); };
ACT.ecoSaveNow = () => { ecoAutosave(); toast('Partita salvata nel browser', true); };

/* ---------------- cantiere ---------------- */
UI.ecoTab = 'pv'; UI.ecoIsl = null;
const BT = [['pv', 'Fotovoltaico'], ['bess', 'Accumuli'], ['dsl', 'Centrali diesel'], ['cab', 'Collegamenti']];
ACT.ecoBuild = () => { UI.ecoIsl = null; ecoBuildModal(); };
ACT.ecoBuildIsl = p => { UI.ecoIsl = p; ecoBuildModal(); };
ACT.ecoTab = p => { UI.ecoTab = p; ecoBuildModal(); };
function buyBtn(sp, lab) {
  const q = ecoQuote(sp), why = ecoCheck(sp);
  return `<button class="btn sm ${why ? '' : 'go'}" data-a="ecoBuy" data-p="${esc(JSON.stringify(sp))}" ${why && why.indexOf('fondi') < 0 ? 'disabled' : ''} title="${esc(why || q.label + ' · ' + q.h + ' h di lavori')}">${lab} · ${eurK(q.cost)}</button>`;
}
function ecoBuildModal() {
  EGM = []; EGT = EGM;
  const isls = UI.ecoIsl ? [S.islById[UI.ecoIsl]] : S.isl;
  let h = `<div class="ebuild"><div class="ecashm">Cassa disponibile: <b>${E_(() => eur(ECO.cash))}</b> · cantieri aperti ${E_(() => ECO.proj.length)}/6${ECO.adm.speed !== 1 ? ' · <span class="wa">tempi ' + (ECO.adm.speed ? '÷' + ECO.adm.speed : 'istantanei') + '</span>' : ''}${E_(() => { const G = ECO.fin && ECO.fin.grant; return { html: G && G.vinc > 0 ? ' · <span class="wa">contributo da impiegare in rinnovabili ' + eur(G.vinc) + '</span>' : '' }; })} · <button class="btn sm" data-a="ecoFunds">Fondi</button>${UI.ecoIsl ? ` · <button class="btn sm" data-a="ecoBuild">tutte le isole</button>` : ''}</div>
    <div class="dsel">${BT.map(t => `<button data-a="ecoTab" data-p="${t[0]}" class="${UI.ecoTab === t[0] ? 'on' : ''}">${t[1]}</button>`).join('')}</div>`;
  if (UI.ecoTab === 'pv') {
    h += '<p class="note">Il nuovo FV si distribuisce sulle cabine dell\'isola in proporzione ai carichi, con inverter conformi alla CEI 0-21. Lavori: ' + BUILD.pvH + ' h. Più FV è utile solo se la rete riesce ad assorbirlo: guarda la colonna «limitato».</p><table class="dt"><tr style="color:var(--dim)"><td>isola</td><td class="n">installato</td><td class="n">picco domanda</td><td class="n">FV ora / disp.</td><td class="n">limitato</td><td>aggiungi</td></tr>' +
      isls.map(I => `<tr><td><b>${esc(I.nm)}</b></td><td class="n">${E_(() => (I.pv.kwp / 1000).toFixed(2) + ' MWp')}</td><td class="n">${fmtMW(islPeak(I))}</td><td class="n">${E_(() => fP(I.pv.P) + ' / ' + fP(I.pv.Pav))}</td><td class="n">${E_(() => I.pv.Pav > 0.01 ? Math.round((1 - I.pv.P / I.pv.Pav) * 100) + '%' : '—')}</td><td class="row">${[100, 250, 500, 1000].map(k => buyBtn({ k: 'pv', isl: I.id, kwp: k }, '+' + k + ' kWp')).join('')}</td></tr>`).join('') + '</table>';
  } else if (UI.ecoTab === 'bess') {
    h += '<p class="note">Un accumulo assorbe il FV di mezzogiorno e lo restituisce la sera, riduce i gruppi in servizio e sostiene la frequenza. Nasce in modo <b>grid-following</b>; dal suo pannello puoi passarlo in <b>grid-forming</b> (forma la rete da solo e permette di spegnere i diesel). Lavori: ' + BUILD.bessH + ' h.</p>';
    isls.forEach(I => {
      const pk = islPeak(I), sizes = [0.1, 0.25, 0.5, 1, 2, 4].filter(p => p <= Math.max(0.25, pk * 1.2)).slice(-4);
      h += `<div class="sec"><h5><span>${esc(I.nm)} · picco ${fmtMW(pk)}</span></h5><div class="bd">` +
        (I.bess.length ? '<table class="dt">' + I.bess.map(B => `<tr><td>${esc(B.nm)}</td><td>${E_(() => fmtMW(B.Pn) + ' / ' + B.En.toFixed(1) + ' MWh · ' + B.mode + ' · SoC ' + B.soc.toFixed(0) + '%')}</td><td class="row">${buyBtn({ k: 'bessX', id: B.id, isl: I.id, dPn: Math.max(0.05, Math.round(B.Pn * 0.25 * 20) / 20) }, '+25% potenza')}${buyBtn({ k: 'bessX', id: B.id, isl: I.id, dEn: Math.round(B.Pn * 10) / 10 || 0.1 }, '+1 h di autonomia')}</td></tr>`).join('') + '</table>' : '<p class="note">Nessun accumulo.</p>') +
        `<div class="row" style="margin-top:6px"><span class="note">Nuovo accumulo (3 h):</span>${sizes.map(p => buyBtn({ k: 'bess', isl: I.id, Pn: p, En: Math.round(p * 3 * 10) / 10, mode: 'GFL' }, fmtMW(p))).join('')}</div></div></div>`;
    });
  } else if (UI.ecoTab === 'dsl') {
    h += '<p class="note">Un gruppo si può potenziare o dismettere solo se è fermo e con l\'interruttore aperto. I nuovi gruppi arrivano fermi: li avvii tu o l\'EMS. Lavori: ' + BUILD.dslH + ' h (potenziamento ' + (BUILD.dslH * 0.7).toFixed(0) + ' h). Dismissione: recupero del ' + Math.round(BUILD.dslRefund * 100) + '% del valore.</p>';
    isls.forEach(I => {
      const pk = islPeak(I), sizes = [0.12, 0.25, 0.5, 1, 2, 3.2].filter(p => p <= Math.max(0.25, pk * 1.1)).slice(-4);
      h += `<div class="sec"><h5><span>${esc(I.nm)} · picco ${fmtMW(pk)} · installati ${fmtMW(I.gens.reduce((a, G) => a + G.Pn, 0))}</span></h5><div class="bd"><table class="dt">` +
        I.gens.map(G => { const up = Math.round(G.Pn * 1.5 * 20) / 20, free = G.st === 'FERMO' && !devClosed(G.brk); return `<tr><td>${G.short} · ${fmtMW(G.Pn)}</td><td>${E_(() => [G.blocked ? 'BLOCCO' + (G.lastTrip ? ' (' + G.lastTrip + ')' : '') : G.st, G.st === 'IN PARALLELO' ? 'ok' : ''])}</td><td class="n">${Math.round(G.hours)} h</td><td class="row">${free ? buyBtn({ k: 'dslUp', id: G.id, isl: I.id, Pn: up }, 'Potenzia a ' + fmtMW(up)) + `<button class="btn sm wa" data-a="ecoScrap" data-p="${G.id}">Dismetti · +${eurK(G.Pn * 1000 * BUILD.dslKw * BUILD.dslRefund)}</button>` : '<span class="note">fermalo per modificarlo</span>'}</td></tr>`; }).join('') +
        `</table><div class="row" style="margin-top:6px"><span class="note">Nuovo gruppo:</span>${sizes.map(p => buyBtn({ k: 'dsl', isl: I.id, Pn: p }, fmtMW(p))).join('')}</div></div></div>`;
    });
  } else {
    const a = UI.cabA || 'PAN', b = UI.cabB || 'STR';
    h += `<p class="note">Un cavo sottomarino a 20 kV (5,5 MVA) collega le sbarre di due isole: chiuso il primo interruttore, il secondo si chiude con il sincronizzatore. Isole collegate condividono riserva e surplus FV, e servono meno gruppi in servizio. Lavori: ${BUILD.cableH} h.</p>
      <div class="sec"><h5><span>Nuovo cavo</span></h5><div class="bd"><div class="row">da <select id="cabA">${S.isl.map(I => `<option value="${I.id}" ${I.id === a ? 'selected' : ''}>${esc(I.nm)}</option>`).join('')}</select> a <select id="cabB">${S.isl.map(I => `<option value="${I.id}" ${I.id === b ? 'selected' : ''}>${esc(I.nm)}</option>`).join('')}</select> <span id="cabQ"></span></div></div></div>
      <div class="sec"><h5><span>Collegamenti esistenti</span></h5><div class="bd"><table class="dt">${S.br.filter(x => x.kind !== 'cpl').map(x => `<tr data-a="goEl" data-p="${x.id}"><td>${esc(x.nm)}</td><td class="n">${(x.km || 0).toFixed(1)} km</td><td>${E_(() => x.notBuilt ? ['DA COSTRUIRE', 'wa'] : brClosed(x) ? ['in servizio · ' + fP(Math.abs(x.Sa.r)), 'ok'] : ['aperto', ''])}</td></tr>`).join('')}</table></div></div>` +
      (S.byId.CRT ? `<div class="sec"><h5><span>Collegamento con la Sicilia (150 kV)</span></h5><div class="bd"><p class="note">Porta a Lipari (e alle isole collegate) l'energia della rete nazionale a ${PRICE.imp.toFixed(2)} €/kWh, molto meno del gasolio, e ti permette di vendere l'eccedenza (per esempio il FV di mezzogiorno) a ${PRICE.exp.toFixed(2)} €/kWh invece di limitarla. Lavori: ${BUILD.rtnH} h di orologio.</p><div class="row">${S.byId.CRT.notBuilt ? buyBtn({ k: 'rtn' }, 'Realizza il collegamento') : '<b class="ok">realizzato</b>'}</div></div></div>` : '');
  }
  h += '</div>';
  modal('Cantiere', h);
  updE($('mBody'), EGM);
  UI.ecoModal = 'build';
  const upq = () => {
    const A = $('cabA'), B = $('cabB'); if (!A) return;
    UI.cabA = A.value; UI.cabB = B.value;
    const IA = S.islById[A.value], IB2 = S.islById[B.value];
    const sp = { k: 'cable', a: IA.buses[IA.buses.length - 1].id, b: IB2.buses[IB2.buses.length - 1].id };
    if (IA === IB2) { $('cabQ').innerHTML = '<span class="note">scegli due isole diverse</span>'; return; }
    const q = ecoQuote(sp);
    $('cabQ').innerHTML = `<span class="note">${q.km.toFixed(1)} km · </span>` + buyBtn(sp, 'Posa il cavo');
  };
  if ($('cabA')) { $('cabA').onchange = upq; $('cabB').onchange = upq; upq(); }
}
ACT.ecoBuy = (p, btn) => {
  const sp = JSON.parse(p);
  if (!btn.dataset.armed) {
    const why = ecoCheck(sp); if (why) { toast('Non si può: ' + why); return; }
    btn.dataset.armed = '1'; btn._lab = btn.innerHTML; btn.classList.add('armed'); btn.textContent = 'Confermi? ' + eur(ecoQuote(sp).cost);
    setTimeout(() => { if (btn.isConnected && btn.dataset.armed) { delete btn.dataset.armed; btn.innerHTML = btn._lab; btn.classList.remove('armed'); } }, 4000);
    return;
  }
  const why = ecoBuy(sp);
  if (why) toast('Non si può: ' + why); else { toast('Cantiere avviato: ' + ecoQuote(sp).label, true); ecoAutosave(); }
  if (UI.ecoModal === 'build') ecoBuildModal();
};
ACT.ecoScrap = (p, btn) => {
  const G = S.byId[p]; if (!G) return;
  if (!btn.dataset.armed) { btn.dataset.armed = '1'; btn.classList.add('armed'); btn.textContent = 'Confermi la dismissione?'; setTimeout(() => { if (btn.isConnected) ecoBuildModal(); }, 4000); return; }
  if (UI.sel === G) UI.sel = S.islById[G.isl];
  const why = ecoScrap(G);
  if (why) toast('Non si può: ' + why); else { toast(G.nm + ' dismesso', true); buildFace(); refreshIslList(true); ecoAutosave(); }
  ecoBuildModal();
};

/* ---------------- fondi: prestiti, contributi, anticipo ---------------- */
UI.finAmt = 50000; UI.finDays = 7; UI.grAmt = 100000;
const hLeft = t => { const s = Math.max(0, t - (S.tc || 0)); return s >= 3600 ? (s / 3600).toFixed(1) + ' h' : Math.ceil(s / 60) + ' min'; };
const gCls = g => g === 'A' ? 'ok' : g === 'D' ? 'al' : 'wa';
function finSummary() {
  if (!ECO.fin) return '';
  const F = ECO.fin, R = finRating(), L = [];
  L.push(`<tr><td>Merito di credito</td><td class="n ${gCls(R.g)}"><b>${R.g}</b> · ${R.sc}/100</td></tr>`);
  L.push(`<tr><td>Debito residuo</td><td class="n">${eur(finDebt())}</td></tr>`);
  if (F.loans.length) L.push(`<tr><td>Prossima rata (mezzanotte)</td><td class="n">${eur(finNextPay())}</td></tr>`);
  L.push(`<tr><td>Fido disponibile</td><td class="n">${eur(R.lim)}</td></tr>`);
  F.req.forEach(r => L.push(`<tr><td>${r.k === 'loan' ? 'Prestito in istruttoria' : 'Contributo in valutazione'} · ${eur(r.amt)}</td><td class="n wa">esito tra ${hLeft(r.tReady)}</td></tr>`));
  if (F.grant && F.grant.vinc > 0) L.push(`<tr><td>Contributo da impiegare</td><td class="n wa">${eur(F.grant.vinc)} · ${hLeft(F.grant.tEnd)}</td></tr>`);
  if (F.adv) L.push(`<tr><td>Anticipo da restituire</td><td class="n">${eur(F.adv.bal)}</td></tr>`);
  return '<table class="dt">' + L.join('') + '</table>';
}
function ratingHtml() {
  const R = finRating(), sg = v => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(0);
  return `<table class="dt"><tr><td>Base</td><td class="n">40</td></tr>
    <tr><td>Qualità del servizio ${(R.q * 100).toFixed(1)}%</td><td class="n ${R.pq >= 0 ? 'ok' : 'al'}">${sg(R.pq)}</td></tr>
    <tr><td>Risultato medio giornaliero ${eur(R.m)}${ECO.days.length ? ' (ultimi ' + Math.min(3, ECO.days.length) + ' giorni)' : ' (stima, nessun bilancio chiuso)'}</td><td class="n ${R.pm >= 0 ? 'ok' : 'al'}">${sg(R.pm)}</td></tr>
    <tr><td>Debito residuo ${eur(R.debt)}</td><td class="n ${R.pd > 0 ? 'al' : ''}">${sg(-R.pd)}</td></tr>
    ${R.pc ? `<tr><td>Cassa negativa</td><td class="n al">−${R.pc}</td></tr>` : ''}
    <tr class="tot"><td><b>Punteggio</b></td><td class="n"><b class="${gCls(R.g)}">${R.sc}/100 · classe ${R.g}</b></td></tr></table>
    <p class="note">Classe A da 70, B da 50, C da 35; sotto 35 la banca non presta. Fido: ${FIN.mult.A}× / ${FIN.mult.B}× / ${FIN.mult.C}× il risultato medio giornaliero (minimo ${eur(30000)}), meno il debito già in essere.</p>`;
}
function ecoFundsModal() {
  EGM = []; EGT = EGM;
  const F = ECO.fin;
  const pick = (act, vals, cur, fmt) => vals.map(v => `<button class="btn sm ${v === cur ? 'on' : ''}" data-a="${act}" data-p="${v}">${fmt(v)}</button>`).join('');
  let h = `<div class="ebuild"><div class="ecashm">Cassa: <b>${E_(() => eur(ECO.cash))}</b> · debito residuo <b>${E_(() => eur(finDebt()))}</b> · merito di credito <b>${E_(() => { const R = finRating(); return [R.g + ' (' + R.sc + '/100)', gCls(R.g)]; })}</b></div>`;
  /* prestito bancario */
  h += `<div class="sec"><h5><span>Prestito bancario</span><span>${E_(() => 'fido disponibile ' + eur(finRating().lim))}</span></h5><div class="bd">
    <p class="note">Ricevi il capitale dopo ${FIN.bankH} h di istruttoria (commissione ${FIN.fee * 100}%). Lo restituisci in rate giornaliere a mezzanotte: quota di capitale più interessi sul debito residuo. Il tasso dipende dal merito di credito.</p>
    <div class="row"><span class="note">Importo</span>${pick('finAmt', FIN.loanAmts, UI.finAmt, eurK)}</div>
    <div class="row"><span class="note">Durata</span>${pick('finDays', FIN.loanDays, UI.finDays, d => d + ' giorni')}</div>
    <div class="row">${E_(() => { const q = loanQuote(UI.finAmt, UI.finDays); return { html: `<span class="note">Interesse ${(q.r * 100).toFixed(2)}% al giorno · prima rata ≈ <b>${eur(q.first)}</b> · interessi totali ≈ ${eur(q.int)} · commissione ${eur(q.fee)}</span>` }; })}</div>
    <div class="row"><button class="btn go" data-a="finLoan">Richiedi il prestito</button>${E_(() => { const w = loanCheck(UI.finAmt, UI.finDays); return [w ? 'Non disponibile: ' + w : '', 'note wa']; })}</div>
    ${E_(() => ({ html: F.loans.length ? '<table class="dt" style="margin-top:6px"><tr style="color:var(--dim)"><td>prestito</td><td class="n">residuo</td><td class="n">rate</td><td class="n">tasso</td><td></td></tr>' + F.loans.map(l => `<tr><td>#${l.id} · ${eur(l.amt)}</td><td class="n">${eur(l.bal)}</td><td class="n">${l.left} di ${l.days}</td><td class="n">${(l.r * 100).toFixed(2)}%/g</td><td><button class="btn sm" data-a="finPayoff" data-p="${l.id}" title="Estinzione anticipata con penale dell'${FIN.payoff * 100}%">Estingui · ${eurK(l.bal * (1 + FIN.payoff))}</button></td></tr>`).join('') + '</table>' : '' }))}
  </div></div>`;
  /* contributo pubblico */
  h += `<div class="sec"><h5><span>Contributo pubblico per la transizione energetica delle isole minori</span></h5><div class="bd">
    <p class="note">Contributo a fondo perduto, valutato in ${FIN.grantH} h di orologio. Approvato per intero se la qualità del servizio è almeno ${FIN.grantQ[0] * 100}%, al 60% se è almeno ${FIN.grantQ[1] * 100}%, respinto sotto. Va impiegato in fotovoltaico, accumuli, cavi o collegamento con la Sicilia entro ${FIN.grantDays} giorni: la parte non spesa si restituisce. Un bando ogni ${FIN.grantDays + FIN.grantCool} giorni.</p>
    <div class="row"><span class="note">Importo</span>${pick('grAmt', FIN.grantAmts, UI.grAmt, eurK)}</div>
    <div class="row"><button class="btn go" data-a="finGrant">Presenta la domanda</button>${E_(() => { const w = grantCheck(UI.grAmt); return [w ? 'Non disponibile: ' + w : 'qualità del servizio attuale ' + (finQuality() * 100).toFixed(1) + '%', w ? 'note wa' : 'note']; })}</div>
    ${E_(() => ({ html: F.grant && F.grant.vinc > 0 ? `<p class="note">Contributo ricevuto ${eur(F.grant.amt)}: restano <b class="wa">${eur(F.grant.vinc)}</b> da impiegare entro ${hLeft(F.grant.tEnd)} di orologio. Apri il <a data-a="ecoBuild">Cantiere</a>.</p>` : '' }))}
  </div></div>`;
  /* anticipo di emergenza */
  h += `<div class="sec"><h5><span>Anticipo di emergenza sull'integrazione tariffaria</span></h5><div class="bd">
    <p class="note">Solo con cassa sotto ${eur(FIN.advCash)}. Ricevi subito ${eur(FIN.advAmt)} (commissione ${FIN.advFee * 100}%) e lo restituisci senza interessi: viene trattenuto il ${FIN.advKeep * 100}% dei ricavi finché non è saldato. Pesa sul merito di credito come un debito.</p>
    <div class="row"><button class="btn wa" data-a="finAdv">Chiedi l'anticipo</button>${E_(() => { const w = advCheck(); return [w ? 'Non disponibile: ' + w : '', 'note']; })}</div>
  </div></div>`;
  h += `<div class="sec"><h5><span>Come la banca valuta il gestore</span></h5><div class="bd">${E_(() => ({ html: ratingHtml() }))}</div></div></div>`;
  modal('Richiesta fondi', h);
  updE($('mBody'), EGM);
  UI.ecoModal = 'funds';
}
function finArm(btn, txt) {
  if (btn.dataset.armed) return true;
  btn.dataset.armed = '1'; btn._lab = btn.innerHTML; btn.classList.add('armed'); btn.textContent = txt;
  setTimeout(() => { if (btn.isConnected && btn.dataset.armed) { delete btn.dataset.armed; btn.innerHTML = btn._lab; btn.classList.remove('armed'); } }, 4000);
  return false;
}
ACT.ecoFunds = () => ecoFundsModal();
ACT.finAmt = p => { UI.finAmt = +p; ecoFundsModal(); };
ACT.finDays = p => { UI.finDays = +p; ecoFundsModal(); };
ACT.grAmt = p => { UI.grAmt = +p; ecoFundsModal(); };
ACT.finLoan = (p, btn) => {
  const w = loanCheck(UI.finAmt, UI.finDays); if (w) { toast('Non si può: ' + w); return; }
  if (!finArm(btn, 'Confermi il prestito di ' + eur(UI.finAmt) + ' in ' + UI.finDays + ' giorni?')) return;
  const why = loanAsk(UI.finAmt, UI.finDays);
  if (why) toast('Non si può: ' + why); else { toast('Richiesta inviata alla banca: risposta tra ' + FIN.bankH + ' h di orologio', true); ecoAutosave(); }
  ecoFundsModal();
};
ACT.finPayoff = (p, btn) => {
  if (!finArm(btn, 'Confermi l\'estinzione?')) return;
  const why = loanPayoff(+p);
  if (why) toast('Non si può: ' + why); else { toast('Prestito estinto', true); ecoAutosave(); }
  ecoFundsModal();
};
ACT.finGrant = (p, btn) => {
  const w = grantCheck(UI.grAmt); if (w) { toast('Non si può: ' + w); return; }
  if (!finArm(btn, 'Confermi la domanda di ' + eur(UI.grAmt) + '?')) return;
  const why = grantAsk(UI.grAmt);
  if (why) toast('Non si può: ' + why); else { toast('Domanda presentata: esito tra ' + FIN.grantH + ' h di orologio', true); ecoAutosave(); }
  ecoFundsModal();
};
ACT.finAdv = (p, btn) => {
  const w = advCheck(); if (w) { toast('Non si può: ' + w); return; }
  if (!finArm(btn, 'Confermi l\'anticipo di ' + eur(FIN.advAmt) + '?')) return;
  const why = advAsk();
  if (why) toast('Non si può: ' + why); else { toast('Anticipo accreditato: ' + eur(FIN.advAmt - FIN.advAmt * FIN.advFee), true); ecoAutosave(); }
  ecoFundsModal();
};

/* ---------------- piano degli accumuli ---------------- */
ACT.ecoPlan = () => ecoPlanModal();
function ecoPlanModal() {
  EGM = []; EGT = EGM;
  let h = `<p class="note"><b>Automatico</b>: decide l'EMS (assorbe il surplus FV e lo restituisce la sera). <b>Manuale</b>: imposti tu la potenza (negativa = carica). <b>Fasce orarie</b>: carica e scarica in orari fissi. Gli inverter rispettano comunque i limiti di carica e la regolazione rapida di frequenza. La modalità grid-following / grid-forming si cambia dal pannello dell'accumulo, a interruttore aperto.</p>`;
  S.bess.forEach(B => {
    const P = bessPlan(B), I = S.islById[B.isl];
    h += `<div class="sec plan"><h5><span>${esc(B.nm)} · ${fmtMW(B.Pn)} / ${B.En.toFixed(1)} MWh</span><span>${E_(() => B.mode + ' · SoC ' + B.soc.toFixed(0) + '% · ' + (B.P >= 0 ? 'scarica ' : 'carica ') + fP(Math.abs(B.P)))}</span></h5><div class="bd">
      <div class="row">${[['auto', 'Automatico (EMS)'], ['man', 'Manuale'], ['orari', 'Fasce orarie']].map(m => `<button class="btn sm ${P.mode === m[0] ? 'on' : ''}" data-a="planMode" data-p="${B.id}:${m[0]}">${m[1]}</button>`).join('')}<button class="btn sm" data-a="goEl" data-p="${B.id}">pannello</button></div>` +
      (P.mode === 'man' ? `<div class="row"><span class="note">carica</span><input type="range" min="-100" max="100" step="5" value="${Math.round(P.p * 100)}" data-plan="${B.id}|p" style="flex:1"><span class="note">scarica</span> <b>${E_(() => (P.p >= 0 ? 'scarica ' : 'carica ') + Math.abs(Math.round(P.p * 100)) + '% = ' + fP(Math.abs(P.p * B.Pn)))}</b></div>` : '') +
      (P.mode === 'orari' ? `<div class="pset"><label>Carica dalle</label><span><input type="number" min="0" max="24" step="1" value="${P.ch[0]}" data-plan="${B.id}|ch0"> alle <input type="number" min="0" max="24" step="1" value="${P.ch[1]}" data-plan="${B.id}|ch1"> a <input type="number" min="5" max="100" step="5" value="${Math.round(P.pch * 100)}" data-plan="${B.id}|pch"> %</span>
        <label>Scarica dalle</label><span><input type="number" min="0" max="24" step="1" value="${P.dis[0]}" data-plan="${B.id}|dis0"> alle <input type="number" min="0" max="24" step="1" value="${P.dis[1]}" data-plan="${B.id}|dis1"> a <input type="number" min="5" max="100" step="5" value="${Math.round(P.pdis * 100)}" data-plan="${B.id}|pdis"> %</span></div>` : '') +
      `</div></div>`;
  });
  modal('Piano degli accumuli', h);
  updE($('mBody'), EGM);
  UI.ecoModal = 'plan';
}
ACT.planMode = p => { const [id, m] = p.split(':'), B = S.byId[id]; const P = bessPlan(B); P.mode = m; if (m === 'man') P.p = clamp(B.Pset / B.Pn, -1, 1); soe(B.isl, B.nm + ': piano ' + ({ auto: 'AUTOMATICO (EMS)', man: 'MANUALE', orari: 'A FASCE ORARIE' }[m]), 1, B); ecoPlanModal(); };
document.addEventListener('input', e => {
  const n = e.target; if (!n.dataset || !n.dataset.plan) return;
  const [id, f] = n.dataset.plan.split('|'), P = ECO.plan[id]; if (!P) return;
  const v = +n.value;
  if (f === 'p') P.p = clamp(v / 100, -1, 1);
  else if (f === 'ch0') P.ch[0] = clamp(v, 0, 24); else if (f === 'ch1') P.ch[1] = clamp(v, 0, 24);
  else if (f === 'dis0') P.dis[0] = clamp(v, 0, 24); else if (f === 'dis1') P.dis[1] = clamp(v, 0, 24);
  else if (f === 'pch') P.pch = clamp(v / 100, 0.05, 1); else if (f === 'pdis') P.pdis = clamp(v / 100, 0.05, 1);
});

/* ---------------- strategia di esercizio (EMS) ---------------- */
ACT.ecoEms = () => {
  EGM = []; EGT = EGM;
  let h = `<p class="note">Meno riserva = meno gruppi accesi e meno gasolio, ma più rischio: se una nube copre il FV o scatta un gruppo, la frequenza scende e puoi perdere carico (e ricavi). Il criterio N-1 tiene sempre almeno due macchine sincrone in servizio. Con l'EMS disinserito avvii e fermi tu i gruppi.</p><table class="dt ems"><tr style="color:var(--dim)"><td>isola</td><td>EMS</td><td>avvio/arresto gruppi</td><td>N-1</td><td>riserva % carico</td><td>riserva % FV</td><td>carico diesel col sole</td><td>SoC avvio / arresto diesel (grid-forming)</td><td class="n">gasolio €/h</td><td class="n">riserva</td></tr>` +
    S.isl.map(I => `<tr><td><b>${esc(I.nm)}</b></td><td><input type="checkbox" data-pk="${I.id}|ems|on"></td><td><input type="checkbox" data-pk="${I.id}|ems|uc"></td><td><input type="checkbox" data-pk="${I.id}|ems|n1"></td><td><input type="number" step="0.05" min="0" max="1" data-pk="${I.id}|ems|rPct"></td><td><input type="number" step="0.05" min="0" max="1" data-pk="${I.id}|ems|rPv"></td><td><input type="number" step="0.05" min="0.3" max="0.9" data-pk="${I.id}|ems|ldT"></td><td><input type="number" step="5" min="5" max="95" data-pk="${I.id}|ems|socLo"> / <input type="number" step="5" min="10" max="100" data-pk="${I.id}|ems|socHi"></td><td class="n">${E_(() => Math.round(I.gas || 0))}</td><td class="n">${E_(() => I.area && I.area.st ? fP(I.area.st.res) : '—')}</td></tr>`).join('') + '</table><p class="note">«Carico diesel col sole»: la potenza (in frazione della nominale) a cui l\'EMS tiene i gruppi quando l\'accumulo assorbe il surplus FV. Più basso = più FV usato, ma i gruppi lavorano meno efficienti. Le soglie di SoC valgono per le isole con accumulo grid-forming: sotto la prima si avviano i diesel per ricaricare, sopra la seconda si fermano.</p>';
  modal('Strategia di esercizio', h);
  document.querySelectorAll('#mBody input[data-pk]').forEach(n => { const v = getPK(n.dataset.pk); if (n.type === 'checkbox') n.checked = !!v; else n.value = v; });
  updE($('mBody'), EGM);
  UI.ecoModal = 'ems';
};

/* ---------------- giornate ---------------- */
ACT.ecoDays = () => {
  const L = ECO.days.slice().reverse();
  modal('Giornate di gestione', L.length ? '<table class="dt"><tr style="color:var(--dim)"><td>giorno</td><td class="n">ricavi</td><td class="n">gasolio</td><td class="n">altri costi</td><td class="n">investimenti</td><td class="n">margine</td><td class="n">rinnovabile</td><td class="n">qualità</td><td class="n">non fornita</td></tr>' +
    L.map(d => `<tr><td>${dateStr(d.doy)}</td><td class="n">${eur(d.ric + (d.exp || 0))}</td><td class="n">${eur(d.gas)}</td><td class="n">${eur(d.om + d.bess + d.sq + d.imp + d.pen + (d.int || 0) - (d.con || 0))}</td><td class="n">${eur(d.inv)}</td><td class="n ${d.net >= 0 ? 'ok' : 'al'}"><b>${eur(d.net)}</b></td><td class="n">${(d.re * 100).toFixed(0)}%</td><td class="n">${(d.qm * 100).toFixed(1)}%</td><td class="n">${Math.round(d.ens)} kWh</td></tr>`).join('') + '</table>' : '<p class="note">Nessuna giornata ancora chiusa: il riepilogo compare a mezzanotte (orologio della simulazione). Puoi accelerare il tempo con i pulsanti 60× e 120× in alto.</p>');
  UI.ecoModal = null;
};

/* ---------------- scelta della modalità ---------------- */
ACT.gameMode = () => {
  $('menuBox').classList.add('hidden');
  const sv = saveGet(), net = NET_CFG.net;
  const netSel = `<div class="pset"><label>Rete di partenza</label><span><select id="gmNet"><option value="rinnovabile" ${net === 'rinnovabile' ? 'selected' : ''}>Rinnovabile — FV che copre il picco, accumulo su ogni isola</option><option value="storico" ${net === 'storico' ? 'selected' : ''}>Storica — poco FV e pochi accumuli: costruisci tu la transizione</option></select></span></div>`;
  let h = `<div class="welcome"><p class="lead">Nella <b>modalità gestione</b> sei il gestore delle reti delle Eolie: incassi per ogni kWh fornito, in proporzione alla qualità del servizio, e paghi gasolio, manutenzione e penali. Con il margine, e con i fondi che riesci a ottenere da banche ed enti pubblici, apri cantieri: impianti fotovoltaici, accumuli, nuovi gruppi diesel, cavi tra le isole e perfino il collegamento con la Sicilia. Decidi tu come usare gli accumuli e quanta riserva tenere accesa.</p>`;
  if (!ECO.on) {
    h += netSel + `<div class="wcards"><button class="wcard" data-a="gmNew"><span>${ICO('euro')}</span><b>Nuova partita</b><small>Capitale iniziale ${eur(ECO_START_CASH)}</small></button>` +
      (sv ? `<button class="wcard" data-a="gmResume"><span>${ICO('play')}</span><b>Continua la partita</b><small>Cassa ${eur(sv.cash)} · ${dateStr(sv.doy)} · rete ${sv.net}</small></button>` : '') + '</div>';
  } else {
    h += `<div class="wcards"><button class="wcard" data-a="gmSave"><span>${ICO('check')}</span><b>Salva</b><small>La partita resta nel browser</small></button><button class="wcard" data-a="gmExit"><span>${ICO('map')}</span><b>Torna alla simulazione libera</b><small>La partita viene salvata</small></button><button class="wcard" data-a="gmRestart"><span>${ICO('reset')}</span><b>Ricomincia da capo</b><small>Cancella la partita salvata</small></button></div>` + netSel.replace('Rete di partenza', 'Rete per una nuova partita');
  }
  modal('Modalità gestione', h + '</div>');
  UI.ecoModal = null;
};
const gmNet = () => { const n = $('gmNet'); return n ? n.value : NET_CFG.net; };
ACT.gmNew = () => { cfgSet({ mode: 'gestione', net: gmNet(), resume: false }); try { localStorage.removeItem('eolie.save'); localStorage.setItem('eolie.seen', '1'); } catch (e) { } location.reload(); };
ACT.gmResume = () => { const sv = saveGet(); cfgSet({ mode: 'gestione', net: sv ? sv.net : NET_CFG.net, resume: true }); location.reload(); };
ACT.gmSave = () => { ecoAutosave(); closeModal(); toast('Partita salvata', true); };
ACT.gmExit = () => { ecoAutosave(); cfgSet({ mode: 'libero', resume: true }); location.reload(); };
ACT.gmRestart = () => { cfgSet({ mode: 'gestione', net: gmNet(), resume: false }); try { localStorage.removeItem('eolie.save'); } catch (e) { } location.reload(); };

/* ---------------- aggiornamento periodico (0,2 s) ---------------- */
let ecoSaveT = 0;
function ecoTick(dt) {
  if (!ECO.on) return;
  updCash();
  ecoSaveT += dt; if (ecoSaveT > 20) { ecoSaveT = 0; ecoAutosave(); }
  if (UI.ecoModal && !$('modal').classList.contains('hidden')) updE($('mBody'), EGM); else UI.ecoModal = null;
  if (ECO.over && !ECO.overShown) {
    ECO.overShown = true; try { localStorage.removeItem('eolie.save'); } catch (e) { }
    const L = ECO.led;
    modal('Gestione fallita', `<div class="win"><div class="big" style="color:var(--al)">${ICO('warning')}</div><b>La cassa è scesa sotto ${eur(ECO_BANKRUPT)}</b><div class="tiles" style="margin-top:12px"><div class="tile"><small>Ricavi</small><b>${eurK(L.ric)}</b></div><div class="tile"><small>Gasolio</small><b>${eurK(L.gas)}</b></div><div class="tile"><small>Investimenti</small><b>${eurK(L.inv)}</b></div><div class="tile"><small>Penali</small><b>${eurK(L.pen)}</b></div></div>
      <p class="note">Consiglio: controlla quanti gruppi restano accesi e a che carico, e investi prima nel FV e negli accumuli delle isole dove il gasolio pesa di più.</p><div class="row" style="justify-content:center"><button class="btn hi" data-a="gmRestart">Ricomincia</button><button class="btn" data-a="gmExit">Torna alla simulazione libera</button></div></div>`);
  }
}
window.addEventListener('beforeunload', () => { ecoAutosave(); });

/* ---------------- avvio ---------------- */
ecoHeader();
if (ECO.on) {
  cfgSet({ resume: true });
  ecoAutosave();
  showCtab('eco');
}
