'use strict';
/* =====================================================================
   MODALITÀ GESTIONE — economia del servizio elettrico
   - ricavi: energia servita × tariffa × qualità del servizio (frequenza, tensione)
   - costi: gasolio, manutenzione dei diesel (per MWh e per avviamento),
     degrado degli accumuli, squadre di intervento, energia dalla RTN,
     penale per l'energia non fornita
   - cantiere: nuovi impianti FV, accumuli, gruppi diesel, cavi tra le isole,
     collegamento con la Sicilia; ogni opera ha un costo e un tempo di costruzione
   - piano degli accumuli: automatico (EMS), manuale o a fasce orarie
   I costi d'investimento sono la quota a carico del gestore, al netto dei
   contributi pubblici per le isole minori (valori di gioco, non di mercato).
   ===================================================================== */
const ECO = { on: false, want: false };
const PRICE = {
  tariff: 0.30,   /* €/kWh servito con qualità piena */
  fuel: 1.25,     /* €/l di gasolio */
  omDsl: 6,       /* €/MWh prodotto dai diesel (manutenzione) */
  start: 25,      /* € per ogni avviamento di un gruppo */
  bessWear: 15,   /* €/MWh scambiato dagli accumuli (degrado delle celle) */
  ens: 1.5,       /* €/kWh di energia non fornita (penale dell'Autorità) */
  imp: 0.14,      /* €/kWh acquistato dalla rete siciliana */
  exp: 0.10,      /* €/kWh ceduto alla rete siciliana (ritiro dell'eccedenza) */
  crew: 800       /* € per ogni intervento di una squadra */
};
const BUILD = {
  pvKwp: 20,      /* €/kWp */           pvH: 2,
  bessKw: 15,     /* €/kW di convertitore */ bessKwh: 8, /* €/kWh di batterie */ bessH: 3,
  dslKw: 25,      /* €/kW */            dslH: 6, dslRefund: 0.2,
  cableKm: 2500,  /* €/km di cavo sottomarino 20 kV */ cableFix: 15000, /* € terminali e quadri */ cableH: 10,
  rtn: 400000,    rtnH: 36
};
const ECO_START_CASH = 60000, ECO_BANKRUPT = -30000;
const LED_KEYS = ['ric', 'exp', 'con', 'gas', 'om', 'bess', 'sq', 'imp', 'pen', 'int', 'inv', 'ven'];
const LED_NM = { ric: 'Ricavi dal servizio', exp: 'Vendita alla rete nazionale', con: 'Contributi pubblici', gas: 'Gasolio', om: 'Manutenzione diesel', bess: 'Degrado accumuli', sq: 'Squadre di intervento', imp: 'Energia dalla Sicilia', pen: 'Penali energia non fornita', int: 'Interessi e commissioni', inv: 'Investimenti', ven: 'Dismissioni (recupero)' };
const LED_POS = { ric: 1, exp: 1, con: 1, ven: 1 };
/* risultato della giornata (esclusi gli investimenti) */
const ledNet = d => d.ric + (d.exp || 0) + d.ven + (d.con || 0) - d.gas - d.om - d.bess - d.sq - d.imp - d.pen - (d.int || 0);
const ledZero = () => { const o = {}; LED_KEYS.forEach(k => { o[k] = 0; }); o.kwh = 0; o.ens = 0; o.fuelL = 0; o.pv = 0; o.dsl = 0; o.q = 0; o.qn = 0; return o; };

/* configurazione scelta dall'utente (rete e modalità), letta prima dell'avvio */
(function ecoBoot() {
  try {
    const c = JSON.parse(localStorage.getItem('eolie.cfg') || 'null');
    if (c) { if (c.net === 'storico' || c.net === 'rinnovabile') NET_CFG.net = c.net; ECO.want = c.mode === 'gestione'; }
  } catch (e) { }
})();

function ecoStart(save) {
  Object.assign(ECO, { on: true, cash: ECO_START_CASH, led: ledZero(), day: ledZero(), days: [], proj: [], done: [], plan: {}, rate: ledZero(), hist: [], over: false, pN: 0, crewN0: S.crewN || 0, starts: {}, doy: S.doy, tc0: S.tc || 0, fin: finInit(), adm: { speed: 1 } });
  S.gens.forEach(G => { ECO.starts[G.id] = G.starts || 0; });
  if (S.byId.CRT) S.byId.CRT.notBuilt = true;
  S.set.randF = 1;
  if (save) ecoRestore(save);
  soe(null, 'Modalità GESTIONE: capitale disponibile ' + eur(ECO.cash) + '. Ricavi dal servizio (in proporzione alla qualità), costi di gasolio, manutenzione e penali.', 2);
}
const eur = v => (v < 0 ? '−' : '') + '€ ' + Math.round(Math.abs(v)).toLocaleString('it-IT');

/* qualità del servizio di un'isola (0..1): frequenza e tensione di sbarra */
function islQuality(I) {
  const b = I.buses[0];
  if (!b.live) return 0;
  const df = Math.abs(b.fm - 50);
  let q = df <= 0.2 ? 1 : df <= 0.5 ? 0.85 : 0.6;
  if (b.Vm < 0.92 || b.Vm > 1.08) q *= 0.9;
  return q;
}

/* ---------------- passo economico (dal passo di controllo, 0,2 s di simulazione) ---------------- */
function ecoStep(dt) {
  if (ECO.over) return;
  const h = dt * S.clkSpeed / 3600, R = ledZero(); /* R: tassi in €/h */
  let kw = 0, ens = 0, pv = 0, dsl = 0, fuelLh = 0;
  S.isl.forEach(I => {
    const q = islQuality(I); I.q = q;
    let ric = 0;
    I.nodes.forEach(N => {
      if (N.live) { const p = N.Pl * 1000; kw += p; ric += p * PRICE.tariff * q * (N.Vm < 0.92 ? 0.85 : 1); }
      else ens += nodeLoad(N, hourNow(), 0)[0];
    });
    I.ric = ric; R.ric += ric;
    let fl = 0, om = 0;
    I.gens.forEach(G => { fl += G.fuel; if (G.st === 'IN PARALLELO') { om += Math.max(0, G.Pe) * PRICE.omDsl; dsl += Math.max(0, G.Pe); } });
    I.gas = fl * PRICE.fuel; R.gas += I.gas; R.om += om; fuelLh += fl;
    I.bess.forEach(B => { R.bess += Math.abs(B.P) * PRICE.bessWear; });
    pv += I.pv.P;
  });
  R.pen = ens * PRICE.ens;
  /* scambio con la RTN: S.grid.P > 0 import dalla Sicilia, < 0 cessione dell'eccedenza */
  const gP = S.grid.bus.area && S.grid.bus.area.isl.length ? (S.grid.P || 0) : 0;
  R.imp = Math.max(0, gP) * 1000 * PRICE.imp;
  R.exp = Math.max(0, -gP) * 1000 * PRICE.exp;
  ECO.rate = R;
  /* importi una tantum: avviamenti e squadre */
  let once = 0;
  S.gens.forEach(G => { const n = G.starts || 0, o = ECO.starts[G.id] || 0; if (n > o) { once += (n - o) * PRICE.start; ECO.starts[G.id] = n; } });
  const cr = (S.crewN || 0) - ECO.crewN0; ECO.crewN0 = S.crewN || 0;
  const add = (k, v) => { ECO.led[k] += v; ECO.day[k] += v; };
  add('ric', R.ric * h); add('exp', R.exp * h); add('gas', R.gas * h); add('om', R.om * h + once); add('bess', R.bess * h); add('imp', R.imp * h); add('pen', R.pen * h);
  if (cr > 0) add('sq', cr * PRICE.crew);
  const qAvg = S.isl.reduce((a, I) => a + (I.q || 0), 0) / S.isl.length;
  [ECO.led, ECO.day].forEach(L => { L.kwhExp = (L.kwhExp || 0) + Math.max(0, -gP) * 1000 * h; L.kwh += kw * h; L.ens += ens * h; L.fuelL += fuelLh * h; L.pv += pv * h; L.dsl += dsl * h; L.q += qAvg * h; L.qn += h; });
  ECO.cash += (R.ric + R.exp - R.gas - R.om - R.bess - R.imp - R.pen) * h - once - (cr > 0 ? cr * PRICE.crew : 0);
  /* andamento della cassa (un punto ogni 15 minuti di orologio) */
  ECO.hAcc = (ECO.hAcc || 0) + h;
  if (ECO.hAcc >= 0.25) { ECO.hAcc = 0; ECO.hist.push([S.tc || 0, ECO.cash]); if (ECO.hist.length > 400) ECO.hist.shift(); }
  /* chiusura della giornata */
  if (S.doy !== ECO.doy) { ecoCloseDay(); ECO.doy = S.doy; }
  /* anticipo di emergenza: si restituisce trattenendo una quota dei ricavi */
  const F = ECO.fin;
  if (F.adv && R.ric > 0) { const k = Math.min(F.adv.bal, R.ric * h * FIN.advKeep); F.adv.bal -= k; ECO.cash -= k; if (F.adv.bal < 0.5) { F.adv = null; soe(null, 'FONDI: anticipo di emergenza interamente restituito', 1); } }
  ecoPlans(dt);
  ecoProjects();
  finStep();
  if (ECO.cash < ECO_BANKRUPT && !ECO.over) { ECO.over = true; soe(null, 'GESTIONE: FALLIMENTO — la cassa è scesa sotto ' + eur(ECO_BANKRUPT), 3); }
}
function ecoCloseDay() {
  finDaily();
  const d = ECO.day, net = ledNet(d);
  const rec = Object.assign({}, d, { doy: ECO.doy, net, utile: net - d.inv, re: d.pv / Math.max(1e-6, d.pv + d.dsl), qm: d.qn > 0 ? d.q / d.qn : 0 });
  ECO.days.push(rec); if (ECO.days.length > 60) ECO.days.shift();
  ECO.day = ledZero();
  soe(null, 'GESTIONE: chiusura della giornata — ricavi ' + eur(d.ric) + ', gasolio ' + eur(d.gas) + ', margine operativo ' + eur(net) + ', quota rinnovabile ' + (rec.re * 100).toFixed(0) + '%', 2);
  S.hint = { t: S.t, el: null, msg: 'Giornata chiusa: margine operativo ' + eur(net) + ' · quota rinnovabile ' + (rec.re * 100).toFixed(0) + '% · cassa ' + eur(ECO.cash) };
  ECO.lastDay = rec;
}

/* ---------------- piano degli accumuli ---------------- */
const PLAN_DEF = { mode: 'auto', p: 0, ch: [9, 16], dis: [18, 24], pch: 0.8, pdis: 0.7 };
function bessPlan(B) { return ECO.plan[B.id] || (ECO.plan[B.id] = Object.assign({}, PLAN_DEF, { ch: PLAN_DEF.ch.slice(), dis: PLAN_DEF.dis.slice() })); }
const inWin = (h, w) => w[0] <= w[1] ? h >= w[0] && h < w[1] : h >= w[0] || h < w[1];
function ecoPlans(dt) {
  const h = hourNow();
  S.bess.forEach(B => {
    const P = ECO.plan[B.id]; if (!P) return;
    if (P.mode === 'auto') { if (P._was !== 'auto') { B.auto = true; P._was = 'auto'; } return; }
    P._was = P.mode; B.auto = false;
    let tgt = 0;
    if (P.mode === 'man') tgt = P.p * B.Pn;
    else if (P.mode === 'orari') {
      if (inWin(h, P.ch)) tgt = B.soc < 97 ? -P.pch * B.Pn : 0;
      else if (inWin(h, P.dis)) tgt = B.soc > 8 ? P.pdis * B.Pn : 0;
    }
    B.Pset += (clamp(tgt, -B.Pn, B.Pn) - B.Pset) * Math.min(1, dt / 3);
  });
}

/* ---------------- cantiere ---------------- */
function plantKm(a, b) {
  const pa = projKm(a.grid ? S.grid.bus.ll : S.islById[a.isl].plant), pb = projKm(b.grid ? S.grid.bus.ll : S.islById[b.isl].plant);
  return Math.round(Math.hypot(pa[0] - pb[0], pa[1] - pb[1]) * 1.2 * 10) / 10; /* percorso del cavo ≈ 1,2 × distanza in linea d'aria */
}
function genFree(I) { let n = 0; I.gens.forEach(G => { const m = +(G.id.split('.G')[1] || 0); if (m > n) n = m; }); return n + 1; }
function ecoQuote(sp) {
  const I = sp.isl ? S.islById[sp.isl] : null;
  switch (sp.k) {
    case 'pv': return { cost: sp.kwp * BUILD.pvKwp, h: BUILD.pvH, label: 'Fotovoltaico +' + sp.kwp + ' kWp · ' + I.nm };
    case 'bess': return { cost: sp.Pn * 1000 * BUILD.bessKw + sp.En * 1000 * BUILD.bessKwh, h: BUILD.bessH, label: 'Nuovo accumulo ' + fmtMW(sp.Pn) + ' / ' + sp.En.toFixed(1) + ' MWh · ' + I.nm };
    case 'bessX': { const B = S.byId[sp.id]; return { cost: (sp.dPn || 0) * 1000 * BUILD.bessKw + (sp.dEn || 0) * 1000 * BUILD.bessKwh, h: BUILD.bessH * 0.6, label: 'Ampliamento ' + (B ? B.nm : sp.id) + (sp.dPn ? ' +' + fmtMW(sp.dPn) : '') + (sp.dEn ? ' +' + sp.dEn.toFixed(1) + ' MWh' : '') }; }
    case 'dsl': return { cost: sp.Pn * 1000 * BUILD.dslKw, h: BUILD.dslH, label: 'Nuovo gruppo diesel ' + fmtMW(sp.Pn) + ' · ' + I.nm };
    case 'dslUp': { const G = S.byId[sp.id]; return { cost: Math.max(0, sp.Pn - G.Pn) * 1000 * BUILD.dslKw, h: BUILD.dslH * 0.7, label: 'Potenziamento ' + G.nm + ' a ' + fmtMW(sp.Pn) }; }
    case 'cable': { const a = S.busById[sp.a], b = S.busById[sp.b], km = plantKm(a, b); return { cost: Math.round(BUILD.cableFix + km * BUILD.cableKm), h: BUILD.cableH, km, label: 'Cavo 20 kV ' + S.islById[a.isl].nm + '–' + S.islById[b.isl].nm + ' (' + km.toFixed(1) + ' km)' }; }
    case 'rtn': return { cost: BUILD.rtn, h: BUILD.rtnH, label: 'Collegamento 150 kV Sicilia–Lipari' };
  }
  return null;
}
const fmtMW = mw => mw < 1 ? Math.round(mw * 1000) + ' kW' : mw.toFixed(mw % 1 ? 2 : 0) + ' MW';
/* verifica di fattibilità; restituisce '' se l'opera si può avviare */
function ecoCheck(sp) {
  if (ECO.over) return 'gestione fallita';
  const q = ecoQuote(sp); if (!q) return 'opera sconosciuta';
  if (ECO.cash < q.cost) return 'fondi insufficienti (servono ' + eur(q.cost) + '): puoi chiederli da «Fondi»';
  if (ECO.proj.length >= 6) return 'troppi cantieri aperti contemporaneamente (massimo 6)';
  if (sp.k === 'dslUp') { const G = S.byId[sp.id]; if (!G || G.st !== 'FERMO' || devClosed(G.brk)) return 'il gruppo deve essere fermo e separato dalla rete'; if (sp.Pn <= G.Pn) return 'la nuova potenza deve essere maggiore'; }
  if (sp.k === 'cable') {
    const a = S.busById[sp.a], b = S.busById[sp.b];
    if (!a || !b || a.isl === b.isl) return 'scegli due isole diverse';
    if (S.br.some(br => br.kind === 'cab' && ((br.a.isl === a.isl && br.b.isl === b.isl) || (br.a.isl === b.isl && br.b.isl === a.isl))) && !sp.parallel) return 'esiste già un cavo tra queste isole';
    if (ECO.proj.some(p => p.sp.k === 'cable' && ((p.sp.a === sp.a && p.sp.b === sp.b) || (p.sp.a === sp.b && p.sp.b === sp.a)))) return 'cavo già in costruzione';
  }
  if (sp.k === 'rtn' && (!S.byId.CRT || !S.byId.CRT.notBuilt || ECO.proj.some(p => p.sp.k === 'rtn'))) return 'collegamento già realizzato o in costruzione';
  return '';
}
function ecoBuy(sp) {
  const why = ecoCheck(sp); if (why) return why;
  const q = ecoQuote(sp);
  ECO.cash -= q.cost; ECO.led.inv += q.cost; ECO.day.inv += q.cost;
  const sp0 = ECO.adm.speed, hh = sp0 ? q.h / sp0 : 0;
  const p = { id: ++ECO.pN, sp, label: q.label, cost: q.cost, t0: S.tc || 0, tEnd: (S.tc || 0) + hh * 3600 };
  ECO.proj.push(p);
  const GR = ECO.fin.grant;
  if (GR && GR.vinc > 0 && GREEN.indexOf(sp.k) >= 0) { GR.vinc = Math.max(0, GR.vinc - q.cost); if (GR.vinc <= 0) soe(null, 'FONDI: contributo pubblico interamente impiegato in opere per la transizione', 1); }
  if (sp.k === 'dslUp') { const G = S.byId[sp.id]; G.blocked = true; G.lastTrip = 'cantiere: potenziamento in corso'; }
  soe(sp.isl || null, 'CANTIERE avviato: ' + q.label + ' · ' + eur(q.cost) + (hh ? ' · fine lavori tra ' + (Math.round(hh * 10) / 10) + ' h di orologio' : ' · lavori istantanei'), 2);
  return '';
}
function ecoProjects() {
  const now = S.tc || 0;
  ECO.proj = ECO.proj.filter(p => {
    if (now < p.tEnd) return true;
    const el = ecoApply(p.sp);
    ECO.done.push(p.sp);
    soe(p.sp.isl || null, 'CANTIERE COMPLETATO: ' + p.label + (p.sp.k === 'cable' || p.sp.k === 'dsl' || p.sp.k === 'bess' || p.sp.k === 'rtn' ? ' — da mettere in servizio con le manovre' : ''), 2, el || null);
    S.hint = { t: S.t, el: el ? el.id : null, msg: 'Cantiere completato: ' + p.label };
    return false;
  });
}
/* esecuzione di un'opera sulla rete (al termine dei lavori, o al caricamento di una partita) */
function ecoApply(sp) {
  let el = null;
  if (sp.k === 'pv') el = netAddPV(S.islById[sp.isl], sp.kwp);
  else if (sp.k === 'bess') el = netAddBess(S.islById[sp.isl], sp.Pn, sp.En, sp.mode || 'GFL');
  else if (sp.k === 'bessX') { const B = S.byId[sp.id]; if (B) { B.Pn += sp.dPn || 0; B.Sn = B.Pn * 1.1; B.En += sp.dEn || 0; el = B; } }
  else if (sp.k === 'dsl') el = netAddGen(S.islById[sp.isl], sp.Pn);
  else if (sp.k === 'dslUp') { const G = S.byId[sp.id]; if (G) { netRepower(G, sp.Pn); G.blocked = false; G.lastTrip = ''; el = G; } }
  else if (sp.k === 'dslDel') { const G = S.byId[sp.id]; if (G) netDelGen(G); }
  else if (sp.k === 'cable') el = netAddCable(S.busById[sp.a], S.busById[sp.b]);
  else if (sp.k === 'rtn') { el = S.byId.CRT; if (el) el.notBuilt = false; }
  S.topoDirty = true;
  if (typeof sldInvalidate === 'function') sldInvalidate();
  return el;
}
/* dismissione di un gruppo (immediata, con recupero parziale del valore) */
function ecoScrap(G) {
  if (G.st !== 'FERMO' || devClosed(G.brk)) return 'il gruppo deve essere fermo e separato dalla rete';
  const I = S.islById[G.isl];
  if (I.gens.length <= 1) return 'deve restare almeno un gruppo sull\'isola';
  const v = Math.round(G.Pn * 1000 * BUILD.dslKw * BUILD.dslRefund);
  netDelGen(G); ECO.done.push({ k: 'dslDel', id: G.id, isl: G.isl });
  ECO.cash += v; ECO.led.ven += v; ECO.day.ven += v;
  soe(G.isl, 'Dismissione ' + G.nm + ': recupero ' + eur(v), 2);
  if (typeof sldInvalidate === 'function') sldInvalidate();
  return '';
}

/* ---------------- fondi: prestiti bancari, contributi pubblici, anticipo di emergenza ----------------
   Valori di gioco: il tempo è compresso (una giornata simulata dura pochi minuti),
   quindi interessi e scadenze sono espressi per giornata simulata. */
const FIN = {
  loanAmts: [25000, 50000, 100000, 200000], loanDays: [3, 7, 15],
  rate: { A: 0.003, B: 0.005, C: 0.009 },  /* interesse per giornata sul debito residuo */
  mult: { A: 8, B: 5, C: 3 },              /* fido: multipli del risultato giornaliero medio */
  fee: 0.01, payoff: 0.01, bankH: 1, maxLoans: 3,
  grantAmts: [50000, 100000, 200000], grantH: 12, grantDays: 3, grantCool: 2, grantQ: [0.97, 0.9],
  advAmt: 40000, advFee: 0.02, advKeep: 0.25, advCash: 10000
};
const GREEN = ['pv', 'bess', 'bessX', 'cable', 'rtn'];
function finInit() { return { loans: [], req: [], grant: null, adv: null, nextGrant: 0, n: 0 }; }
/* risultato giornaliero medio degli ultimi 3 giorni, senza contributi (stima prudente se non ci sono bilanci) */
function finMargin() { const D = ECO.days.slice(-3); return D.length ? D.reduce((a, d) => a + ledNet(d) - (d.con || 0), 0) / D.length : 12000; }
function finQuality() { const d = ECO.day; if (d.qn > 0.5) return d.q / d.qn; const L = ECO.days[ECO.days.length - 1]; return L ? L.qm : 1; }
function finDebt() { const F = ECO.fin; return F.loans.reduce((a, l) => a + l.bal, 0) + (F.adv ? F.adv.bal : 0); }
function finRating() {
  const q = finQuality(), m = finMargin(), debt = finDebt();
  const pq = clamp((q - 0.95) * 500, -25, 25), pm = clamp(m / 1000, -25, 25), pd = clamp(debt / 20000, 0, 30), pc = ECO.cash < 0 ? 10 : 0;
  const sc = Math.round(clamp(40 + pq + pm - pd - pc, 0, 100));
  const g = sc >= 70 ? 'A' : sc >= 50 ? 'B' : sc >= 35 ? 'C' : 'D';
  const lim = g === 'D' ? 0 : Math.max(0, Math.round(Math.max(30000, FIN.mult[g] * m) / 1000) * 1000 - debt);
  return { sc, g, q, m, debt, lim, rate: FIN.rate[g] || 0, pq, pm, pd, pc };
}
function loanQuote(amt, days) {
  const R = finRating(), r = R.rate * (1 + (days - 3) * 0.03); /* durata più lunga, tasso un po' più alto */
  return { amt, days, r, R, fee: Math.round(amt * FIN.fee), int: Math.round(amt * r * (days + 1) / 2), first: Math.round(amt / days + amt * r) };
}
function loanCheck(amt, days) {
  if (!ECO.on || ECO.over) return 'gestione non attiva';
  const R = finRating(), F = ECO.fin;
  if (FIN.loanDays.indexOf(days) < 0 || !(amt > 0)) return 'importo o durata non validi';
  if (R.g === 'D') return 'la banca rifiuta: merito di credito insufficiente (' + R.sc + '/100)';
  if (F.req.some(x => x.k === 'loan')) return 'c\'è già una richiesta di prestito in istruttoria';
  if (F.loans.length >= FIN.maxLoans) return 'massimo ' + FIN.maxLoans + ' prestiti contemporanei';
  if (amt > R.lim) return 'oltre il fido disponibile (' + eur(R.lim) + ')';
  return '';
}
function loanAsk(amt, days) {
  const why = loanCheck(amt, days); if (why) return why;
  const q = loanQuote(amt, days), now = S.tc || 0;
  ECO.fin.req.push({ id: ++ECO.fin.n, k: 'loan', amt, days, r: q.r, fee: q.fee, t0: now, tReady: now + FIN.bankH * 3600 });
  soe(null, 'FONDI: richiesta di prestito di ' + eur(amt) + ' in ' + days + ' rate giornaliere (merito ' + q.R.g + ', interesse ' + (q.r * 100).toFixed(2) + '% al giorno): risposta tra ' + FIN.bankH + ' h', 2);
  return '';
}
function loanPayoff(id) {
  const F = ECO.fin, l = F.loans.find(x => x.id === id); if (!l) return 'prestito inesistente';
  const pen = Math.round(l.bal * FIN.payoff), tot = l.bal + pen;
  if (ECO.cash < tot) return 'cassa insufficiente (servono ' + eur(tot) + ')';
  ECO.cash -= tot; ECO.led.int += pen; ECO.day.int += pen;
  F.loans = F.loans.filter(x => x !== l);
  soe(null, 'FONDI: prestito #' + id + ' estinto in anticipo · ' + eur(tot) + ' (penale ' + eur(pen) + ')', 2);
  return '';
}
function grantCheck(amt) {
  if (!ECO.on || ECO.over) return 'gestione non attiva';
  const F = ECO.fin, now = S.tc || 0;
  if (FIN.grantAmts.indexOf(amt) < 0) return 'importo non previsto dal bando';
  if (F.req.some(x => x.k === 'grant')) return 'domanda già in valutazione';
  if (F.grant && F.grant.vinc > 0) return 'prima impiega il contributo già ricevuto';
  if (now < F.nextGrant) return 'il prossimo bando apre tra ' + Math.ceil((F.nextGrant - now) / 3600) + ' h di orologio';
  return '';
}
function grantAsk(amt) {
  const why = grantCheck(amt); if (why) return why;
  const now = S.tc || 0;
  ECO.fin.req.push({ id: ++ECO.fin.n, k: 'grant', amt, t0: now, tReady: now + FIN.grantH * 3600 });
  soe(null, 'FONDI: domanda di contributo per la transizione energetica (' + eur(amt) + ') presentata: esito tra ' + FIN.grantH + ' h', 2);
  return '';
}
function grantDecide(rq) {
  const F = ECO.fin, now = S.tc || 0, q = finQuality();
  const share = q >= FIN.grantQ[0] ? 1 : q >= FIN.grantQ[1] ? 0.6 : 0;
  if (!share) { F.nextGrant = now + 86400; soe(null, 'FONDI: domanda di contributo RESPINTA — qualità del servizio ' + (q * 100).toFixed(1) + '% (minimo ' + FIN.grantQ[1] * 100 + '%). Nuovo bando tra 24 h', 3); S.hint = { t: S.t, el: null, msg: 'Contributo respinto: qualità del servizio troppo bassa' }; return; }
  const a = Math.round(rq.amt * share / 1000) * 1000;
  ECO.cash += a; ECO.led.con += a; ECO.day.con += a;
  F.grant = { amt: a, vinc: a, tEnd: now + FIN.grantDays * 86400 };
  F.nextGrant = now + (FIN.grantDays + FIN.grantCool) * 86400;
  soe(null, 'FONDI: contributo APPROVATO ' + eur(a) + (share < 1 ? ' (60% del richiesto: qualità del servizio ' + (q * 100).toFixed(1) + '%)' : '') + ' — da impiegare in FV, accumuli o cavi entro ' + FIN.grantDays + ' giorni', 2);
  S.hint = { t: S.t, el: null, msg: 'Contributo approvato: ' + eur(a) + ' da investire in rinnovabili entro ' + FIN.grantDays + ' giorni' };
}
function advCheck() {
  if (!ECO.on || ECO.over) return 'gestione non attiva';
  if (ECO.fin.adv) return 'anticipo già in corso (restano ' + eur(ECO.fin.adv.bal) + ')';
  if (ECO.cash >= FIN.advCash) return 'concesso solo con cassa sotto ' + eur(FIN.advCash);
  return '';
}
function advAsk() {
  const why = advCheck(); if (why) return why;
  const fee = Math.round(FIN.advAmt * FIN.advFee);
  ECO.cash += FIN.advAmt - fee; ECO.led.int += fee; ECO.day.int += fee;
  ECO.fin.adv = { amt: FIN.advAmt, bal: FIN.advAmt };
  soe(null, 'FONDI: anticipo di emergenza ' + eur(FIN.advAmt) + ' (commissione ' + eur(fee) + '), restituito con il ' + FIN.advKeep * 100 + '% dei ricavi', 2);
  return '';
}
/* esiti delle richieste e scadenza dei vincoli (a ogni passo economico) */
function finStep() {
  const F = ECO.fin, now = S.tc || 0;
  if (F.req.length) F.req = F.req.filter(rq => {
    if (now < rq.tReady) return true;
    if (rq.k === 'loan') {
      const R = finRating();
      if (R.g === 'D') { soe(null, 'FONDI: la banca ha RESPINTO il prestito: merito di credito sceso a ' + R.sc + '/100', 3); S.hint = { t: S.t, el: null, msg: 'Prestito respinto dalla banca' }; return false; }
      ECO.cash += rq.amt - rq.fee; ECO.led.int += rq.fee; ECO.day.int += rq.fee;
      F.loans.push({ id: rq.id, amt: rq.amt, bal: rq.amt, r: rq.r, days: rq.days, left: rq.days });
      soe(null, 'FONDI: prestito EROGATO ' + eur(rq.amt) + ' (commissione ' + eur(rq.fee) + ') · ' + rq.days + ' rate a mezzanotte', 2);
      S.hint = { t: S.t, el: null, msg: 'Prestito erogato: ' + eur(rq.amt) };
    } else if (rq.k === 'grant') grantDecide(rq);
    return false;
  });
  const G = F.grant;
  if (G && now >= G.tEnd) {
    if (G.vinc > 0) { ECO.cash -= G.vinc; ECO.led.con -= G.vinc; ECO.day.con -= G.vinc; soe(null, 'FONDI: vincolo scaduto — restituiti ' + eur(G.vinc) + ' di contributo non impiegato', 3); }
    F.grant = null;
  }
}
/* rate dei prestiti, alla chiusura della giornata */
function finDaily() {
  const F = ECO.fin; let pay = 0, int = 0;
  F.loans = F.loans.filter(l => {
    const i = l.bal * l.r, p = Math.min(l.bal, l.amt / l.days);
    l.bal -= p; l.left--; int += i; pay += p + i;
    if (l.bal < 1 || l.left <= 0) { pay += Math.max(0, l.bal); l.bal = 0; soe(null, 'FONDI: prestito #' + l.id + ' rimborsato per intero', 1); return false; }
    return true;
  });
  if (pay > 0) { ECO.cash -= pay; ECO.led.int += int; ECO.day.int += int; soe(null, 'FONDI: addebitata la rata dei prestiti ' + eur(pay) + ' (di cui interessi ' + eur(int) + ')', 2); }
}
/* ---------------- amministrazione (sbloccata con password dalle Impostazioni) ---------------- */
const ADM_H = 1457261338; /* impronta FNV-1a della password */
function admHash(s) { let h = 0x811c9dc5; for (const c of String(s).trim().replace(',', '.')) { h ^= c.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; } return h; }
const admOk = pw => admHash(pw) === ADM_H;
/* velocità dei cantieri: 1 = normale, 2/5/10 = più rapidi, 0 = istantanei; ricalcola anche quelli aperti */
function admSpeed(v) {
  if (!ECO.on) return 'nessuna partita di gestione in corso';
  v = +v; if (!(v === 0 || v >= 1)) return 'velocità non valida';
  const old = ECO.adm.speed, now = S.tc || 0;
  ECO.proj.forEach(p => { const left = Math.max(0, p.tEnd - now); p.tEnd = now + (v === 0 ? 0 : old === 0 ? 0 : left * old / v); });
  ECO.adm.speed = v;
  soe(null, 'AMMINISTRAZIONE: tempi di costruzione ' + (v === 0 ? 'azzerati' : v === 1 ? 'normali' : 'ridotti a 1/' + v), 2);
  return '';
}
function admFinishAll() {
  if (!ECO.on) return 'nessuna partita di gestione in corso';
  if (!ECO.proj.length) return 'nessun cantiere aperto';
  const now = S.tc || 0; ECO.proj.forEach(p => { p.tEnd = now; });
  ecoProjects();
  return '';
}
/* fondi: 'add' aggiunge (anche negativo), 'set' imposta la cassa */
function admCash(v, mode) {
  if (!ECO.on) return 'nessuna partita di gestione in corso';
  v = +v; if (!Number.isFinite(v)) return 'importo non valido';
  const c0 = ECO.cash; ECO.cash = mode === 'set' ? v : ECO.cash + v;
  if (ECO.cash >= ECO_BANKRUPT && ECO.over) { ECO.over = false; ECO.overShown = false; }
  soe(null, 'AMMINISTRAZIONE: cassa ' + eur(c0) + ' → ' + eur(ECO.cash), 2);
  return '';
}
const finNextPay = () => ECO.fin.loans.reduce((a, l) => a + (l.left <= 1 ? l.bal : Math.min(l.bal, l.amt / l.days)) + l.bal * l.r, 0);

/* ---------------- modifiche della rete a simulazione in corso ---------------- */
function netAddPV(I, kwp) {
  const nodes = I.nodes.filter(N => !N.motor);
  const w = nodes.map(N => Object.values(N.loads).reduce((a, v) => a + v, 0)), wt = w.reduce((a, v) => a + v, 0) || 1;
  const leg = I.pv.groups[1].frac * I.pv.kwp;
  nodes.forEach((N, k) => { N.pv += Math.round(kwp * w[k] / wt); });
  I.pv.kwp = I.nodes.reduce((a, N) => a + N.pv, 0);
  /* i nuovi inverter rispettano la CEI 0-21: cala la quota con tarature storiche */
  I.pv.groups[1].frac = I.pv.kwp > 0 ? leg / I.pv.kwp : 0; I.pv.groups[0].frac = 1 - I.pv.groups[1].frac;
  return I.pvEl;
}
function netAddBess(I, Pn, En, mode) {
  let n = I.bess.length + 1, id = I.id + '.BESS' + (n > 1 ? n : '');
  while (S.byId[id]) id = I.id + '.BESS' + (++n);
  const bus = I.buses.slice().sort((a, b) => a.bess.length - b.bess.length)[0];
  const B = mkBess(I, { id, bus: bus.id, Pn, En, mode, soc: 50, cyc: 0 });
  protBess(B); bus87Add(bus, B.brk); recAddEl(B);
  S.topoDirty = true;
  return B;
}
function netAddGen(I, Pn) {
  const k = genFree(I), id = I.id + '.G' + k;
  const bus = I.buses.slice().sort((a, b) => a.gens.reduce((s, g) => s + g.Pn, 0) - b.gens.reduce((s, g) => s + g.Pn, 0))[0];
  const G = mkGen(I, { id, bus: bus.id, Pn, hours: 0 }, k - 1);
  protGen(G); bus87Add(bus, G.brk); recAddEl(G);
  if (ECO.starts) ECO.starts[G.id] = 0;
  I.ems.rMin = Math.max(0.05, 0.4 * Math.max.apply(null, I.gens.map(g => g.Pn)));
  S.topoDirty = true;
  return G;
}
function netRepower(G, Pn) {
  const d = genDefaults(Pn);
  G.Pn = Pn; G.Sn = d.Sn; G.H = d.H; G.rpm = d.rpm; G.Td0p = d.Td0p; G.tTurbo = d.tTurbo; G.tStart = d.tStart; G.In = G.Sn * IB;
  const I = S.islById[G.isl]; I.ems.rMin = Math.max(0.05, 0.4 * Math.max.apply(null, I.gens.map(g => g.Pn)));
}
function netDelGen(G) {
  const I = S.islById[G.isl];
  S.gens = S.gens.filter(x => x !== G); I.gens = I.gens.filter(x => x !== G); G.bus.gens = G.bus.gens.filter(x => x !== G);
  S.faults = S.faults.filter(f => f.el !== G); S.crews = (S.crews || []).filter(c => c.el !== G);
  relRemoveEl(G); brkRemove(G.brk); recRemoveEl(G);
  delete S.byId[G.id];
  Object.keys(S.alarms || {}).forEach(k => { if (S.alarms[k].el === G.id) delete S.alarms[k]; });
  S.topoDirty = true;
}
function netAddCable(a, b) {
  let n = 1; while (S.byId['CX' + n]) n++;
  const km = plantKm(a, b), nm = 'Cavo 20 kV ' + S.islById[a.isl].nm + '–' + S.islById[b.isl].nm;
  const br = mkCable({ id: 'CX' + n, nm, a: a.id, b: b.id, km, t: 'sub', mva: 5.5, on: false });
  br.planned = false; br.built = true;
  protBr(br); bus87Add(a, br.brkA); bus87Add(b, br.brkB); recAddEl(br);
  S.topoDirty = true;
  return br;
}

/* ---------------- salvataggio della partita ---------------- */
function ecoSave() {
  return { v: 1, net: NET_CFG.net, cash: ECO.cash, led: ECO.led, day: ECO.day, days: ECO.days, done: ECO.done, plan: ECO.plan, hist: ECO.hist,
    proj: ECO.proj.map(p => ({ sp: p.sp, label: p.label, cost: p.cost, left: p.tEnd - (S.tc || 0), dur: p.tEnd - p.t0 })),
    clk: S.clk, doy: S.doy, tc: S.tc || 0, fin: ECO.fin, adm: ECO.adm,
    ems: S.isl.map(I => [I.id, { on: I.ems.on, uc: I.ems.uc, n1: I.ems.n1, rPct: I.ems.rPct, rPv: I.ems.rPv }]),
    soc: S.bess.map(B => [B.id, B.soc, B.mode]) };
}
function ecoRestore(sv) {
  S.tc = sv.tc || 0;
  (sv.done || []).forEach(sp => { ecoApply(sp); ECO.done.push(sp); });
  Object.assign(ECO, { cash: sv.cash, led: Object.assign(ledZero(), sv.led), day: Object.assign(ledZero(), sv.day), days: sv.days || [], plan: sv.plan || {}, hist: sv.hist || [], fin: Object.assign(finInit(), sv.fin || {}), adm: Object.assign({ speed: 1 }, sv.adm || {}) });
  ECO.proj = (sv.proj || []).map(p => ({ id: ++ECO.pN, sp: p.sp, label: p.label, cost: p.cost, t0: S.tc - (p.dur - p.left), tEnd: S.tc + p.left }));
  ECO.proj.forEach(p => { if (p.sp.k === 'dslUp' && S.byId[p.sp.id]) { S.byId[p.sp.id].blocked = true; S.byId[p.sp.id].lastTrip = 'cantiere: potenziamento in corso'; } });
  (sv.ems || []).forEach(([id, e]) => { const I = S.islById[id]; if (I) Object.assign(I.ems, e); });
  const soc = {}; (sv.soc || []).forEach(([id, s, m]) => { soc[id] = [s, m]; });
  S.bess.forEach(B => { if (soc[B.id]) { B.soc = soc[B.id][0]; } });
  S.gens.forEach(G => { ECO.starts[G.id] = G.starts || 0; });
  ECO.doy = sv.doy || S.doy;
  if (sv.clk !== undefined) retime(sv.clk, sv.doy);
  ECO.doy = S.doy;
}
