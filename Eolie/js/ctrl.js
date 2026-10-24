'use strict';
/* =====================================================================
   COMANDI OPERATORE · AUTOMAZIONE DI CENTRALE (EMS) · SINCRONIZZATORE
   RIPARAZIONI · GUASTI CASUALI · ALLARMI DI PROCESSO · INIZIALIZZAZIONE
   ===================================================================== */

/* ---------------- comandi gruppi ---------------- */
function islOf(el) { return S.islById[el.isl] || (el.a && (S.islById[el.b.isl] || S.islById[el.a.isl])); }
function comOk(el, by) {
  if (by !== 'OP') return true;
  const I = islOf(el);
  if (I && !I.com) { soe(I.id, 'Comando non inviato: RTU ' + I.nm + ' non raggiungibile', 2, el); S.lastRefuse = { t: S.t, id: el.id, msg: 'RTU non raggiungibile' }; return false; }
  return true;
}
function startGen(G, by) {
  by = by || 'OP';
  if (!comOk(G, by)) return false;
  if (G.blocked) { soe(G.isl, 'Avviamento ' + G.nm + ' rifiutato: gruppo in blocco', 2, G); return false; }
  if (G.st !== 'FERMO') return false;
  G.stopReq = false; G.fref = 50; G.Vref = 1.0; G.ig = 0; G.ia = 0; G.Eq = 0.03; G.d = rnd() * 6.28; G.boost = 0; G.rack = 0;
  setGenSt(G, 'PRELUBRIFICAZIONE');
  if (by === 'OP') G.asyn = false;
  soe(G.isl, 'Avviamento ' + G.nm + ' (' + (by === 'EMS' ? 'EMS' : 'operatore') + ')', 1, G);
  return true;
}
function stopGen(G, by) {
  by = by || 'OP';
  if (!comOk(G, by)) return false;
  G.stopReq = true; G.asyn = false;
  if (G.st === 'IN PARALLELO') { setGenSt(G, 'SCARICO'); G.unloadTgt = G.Pe / G.Pn; soe(G.isl, 'Arresto ' + G.nm + ': scarico in rampa (' + (by === 'EMS' ? 'EMS' : 'operatore') + ')', 1, G); }
  else if (['PRELUBRIFICAZIONE', 'AVVIAMENTO'].indexOf(G.st) >= 0) { setGenSt(G, 'ARRESTO'); }
  else if (['ACCELERAZIONE', 'ECCITAZIONE', 'PRONTO'].indexOf(G.st) >= 0) { setGenSt(G, 'RAFFREDDAMENTO'); soe(G.isl, 'Arresto ' + G.nm, 1, G); }
  return true;
}
function emergencyStop(G, why) {
  if (devClosed(G.brk)) brkCmd(G.brk, 'O', 'arresto di emergenza: ' + why, 'PROT');
  if (G.st !== 'FERMO') { setGenSt(G, 'ARRESTO'); soe(G.isl, 'ARRESTO DI EMERGENZA ' + G.nm + ' (' + why + ')', 3, G); }
  G.asyn = false; G.rack = 0;
}
function genSetMode(G, m) { if (!comOk(G, 'OP')) return; G.mode = m; if (m === 'DROOP' || m === 'BASE') G.Pset = clamp(G.Pe, 0, G.Pn); soe(G.isl, G.nm + ': regolatore in modo ' + MODE_NM[m], 1, G); }
const MODE_NM = { ISO: 'ISOCRONO (ripartizione)', DROOP: 'STATISMO', BASE: 'POTENZA COSTANTE' };
function genRaise(G, what, k) {
  if (!comOk(G, 'OP')) return;
  if (what === 'f') G.fref = clamp(G.fref + k * 0.02, 45, 55);
  else if (what === 'v') G.Vref = clamp(G.Vref + k * 0.005, 0.85, 1.15);
  else if (what === 'p') G.Pset = clamp(G.Pset + k * 0.02 * G.Pn, 0, G.Pn * 1.05);
}
function genAutoSync(G, on) { if (!comOk(G, 'OP')) return; G.asyn = on; G.asT = 0; if (on) soe(G.isl, G.nm + ': sincronizzatore automatico INSERITO', 1, G); }

/* sincronizzatore automatico (passo 10 ms) */
function asynFast(dt) {
  brkSyncFast(dt); laterStep();
  S.gens.forEach(G => {
    if (!G.asyn || G.st !== 'PRONTO' || devClosed(G.brk) || G.brk.st === 'CL') return;
    if (G.bus.lock || G.blocked) { G.asyn = false; soe(G.isl, G.nm + ': sincronizzatore disinserito (consenso alla chiusura assente)', 2, G); return; }
    G.asT = (G.asT || 0) + dt;
    const bus = G.bus;
    if (!bus.live || bus.Vm < 0.1) {
      const r = G.relays.find(r => r.code === '25');
      if (G.asT > 1 && (!r || r.set.dead || !r.en)) { brkCmd(G.brk, 'C', 'sincronizzatore: chiusura su sbarra morta', 'EMS'); G.asyn = false; }
      return;
    }
    const fb = bus.fm, fg = G.w * 50, df = fg - fb, slip = 0.12;
    G.fref += clamp((fb + slip - fg) * 0.9 + (fb + slip - G.fref) * 0.3, -0.6, 0.6) * dt;
    G.Vref += clamp(bus.Vm - G.Eq * G.w, -0.05, 0.05) * dt * 1.5;
    const dphi = wrapPi(G.d - bus.th), dv = G.Eq * G.w - bus.Vm;
    const pred = dphi + 2 * Math.PI * df * G.brk.tClose;
    if (Math.abs(df) < 0.2 && df > 0.01 && Math.abs(dv) < 0.04 && Math.abs(wrapPi(pred)) < 0.06 && dphi < 0) {
      brkCmd(G.brk, 'C', 'sincronizzatore automatico (Δf=' + df.toFixed(3) + ' Hz, Δφ=' + (dphi * 180 / Math.PI).toFixed(1) + '°)', 'EMS');
      G.asyn = false;
    }
    if (G.asT > 90) { G.asyn = false; soe(G.isl, G.nm + ': sincronizzazione FALLITA (tempo scaduto)', 2, G); alarmRaise('syncf.' + G.id, 2, G.nm + ' sincronizzazione fallita', G.isl, G); }
  });
}
/* sincronizzatore per interruttori di linea/congiuntore: agisce sui regolatori isocroni dell'area da agganciare */
function brkAutoSync(b, on) {
  if (!comOk(b.owner, 'OP')) return false;
  b.asyn = on; b.asT = 0;
  if (on) soe(b.isl, b.nm + ': sincronizzatore di parallelo INSERITO', 1, b.owner);
  else restoreFref(b);
  return true;
}
function restoreFref(b) { (b.asGens || []).forEach(g => { if (g.mode === 'ISO') g.fref = 50; }); b.asGens = null; }
function brkSyncFast(dt) {
  S.brks.forEach(b => {
    if (!b.asyn || b.st !== 'O') return;
    b.asT += dt;
    const sd = syncData(b); if (!sd) { b.asyn = false; return; }
    if (!sd.live1 || !sd.live2 || sd.same) { b.asyn = false; restoreFref(b); brkCmd(b, 'C', 'sincronizzatore: consenso (' + (sd.same ? 'magliatura' : 'linea/sbarra morta') + ')', 'EMS'); return; }
    const o = b.owner, me = b === o.brkA ? o.a : o.b, other = b === o.brkA ? o.b : o.a;
    /* si regola l'area senza rete e con minor potenza: frequenza leggermente superiore all'altra */
    const capOf = A => A.grid ? 1e9 : A.gens.reduce((a, g) => a + g.Pn, 0) + A.gfm.reduce((a, x) => a + x.Pn, 0);
    const adj = capOf(me.area) <= capOf(other.area) ? me : other, ref = adj === me ? other : me;
    const gens = adj.area.gens.filter(g => g.mode === 'ISO' && g.st === 'IN PARALLELO');
    b.asGens = gens;
    const fa = adj.fm, fr = ref.grid ? 50 : ref.fm, slip = 0.05;
    gens.forEach(g => { g.fref = clamp(g.fref + clamp(fr + slip - fa, -0.5, 0.5) * dt * 0.6, 49, 51); });
    const df = adj === me ? (fa - fr) : (fr - fa);
    const dphi = wrapPi((adj === me ? me.th - other.th : other.th - me.th));
    const pred = dphi + 2 * Math.PI * (fa - fr) * b.tClose;
    const ang = adj === me ? pred : -pred;
    if (Math.abs(fa - fr) < 0.1 && Math.abs(fa - fr) > 0.005 && Math.abs(sd.dv) < 0.06 && Math.abs(wrapPi(pred)) < 0.06) {
      b.asyn = false;
      brkCmd(b, 'C', 'sincronizzatore di parallelo (Δf=' + (fa - fr).toFixed(3) + ' Hz)', 'EMS');
      setTimeout0(() => restoreFref(b));
    }
    if (b.asT > 120) { b.asyn = false; restoreFref(b); soe(b.isl, b.nm + ': sincronizzazione FALLITA (tempo scaduto)', 2, b.owner); }
  });
}
function setTimeout0(fn) { (S.later = S.later || []).push({ t: S.t + 0.3, fn }); }
function laterStep() { if (!S.later || !S.later.length) return; S.later = S.later.filter(x => { if (S.t >= x.t) { x.fn(); return false; } return true; }); }
/* dopo la chiusura in parallelo: impostazione del regolatore */
function onGenParallel(G) {
  const A = G.bus.area;
  if (G.auto || G.byEms) {
    if (A.grid || A.gfm.length) { G.mode = 'BASE'; G.Pset = 0.1 * G.Pn; }
    else G.mode = 'ISO';
  }
  if (G.mode === 'ISO') G.fref = 50;
  else if (G.mode === 'DROOP') { G.fref = 50 + G.R * 50 * 0.1; G.Pset = 0.1 * G.Pn; }
}

/* ---------------- comandi su interruttori, sezionatori, BESS, carichi ---------------- */
function opBrk(b, cmd) { if (!comOk(b.owner, 'OP')) return false; return brkCmd(b, cmd, 'comando operatore', 'OP'); }
function swCmd(w, closed, by) {
  by = by || 'OP';
  if (!comOk(w, by)) return false;
  if (w.tmr > 0 || w.closed === closed) return false;
  if (!closed) {
    const fl = S.faults.find(f => f.on && f.path.indexOf(w) >= 0);
    if (fl) { soe(w.isl, w.nm + ': manovra RIFIUTATA — l\'IMS non può interrompere la corrente di guasto (' + Math.round(fl.Ifa) + ' A)', 2, w); S.lastRefuse = { t: S.t, id: w.id, msg: 'corrente di guasto in transito' }; return false; }
  }
  w.tgt = closed; w.tmr = 1.5; w.ops++;
  soe(w.isl, w.nm + ': comando ' + (closed ? 'CHIUSURA' : 'APERTURA') + ' (telecomando)', 1, w);
  return true;
}
function bessSet(B, k, v) {
  if (!comOk(B, 'OP')) return;
  if (k === 'mode') {
    if (devClosed(B.brk) && v !== B.mode) { soe(B.isl, B.nm + ': cambio modo ammesso solo con interruttore aperto', 2, B); return; }
    B.mode = v; S.topoDirty = true; soe(B.isl, B.nm + ': modo ' + v, 1, B);
  } else B[k] = v;
}
function motorCmd(N, start, soft) {
  const m = N.motor; if (!m || !comOk(N, 'OP')) return;
  if (start) { if (!N.live) { soe(N.isl, 'Avviamento motori ' + N.nm + ' rifiutato: cabina non alimentata', 2, N); return; } if (m.st === 'MARCIA' || m.st === 'AVVIAMENTO') return; m.st = 'AVVIAMENTO'; m.prog = 0; m.stallT = 0; m.soft = !!soft; soe(N.isl, 'Avviamento motori ' + N.nm + (soft ? ' con soft-starter' : ' DIRETTO (spunto ≈ 6×In)'), 1, N); }
  else { if (m.st === 'FERMO') return; m.st = 'FERMO'; soe(N.isl, 'Arresto motori ' + N.nm, 1, N); }
}
function lvBrkCmd(N, closed) { if (!comOk(N, 'OP')) return; if (closed && N.lvOut > 0 && S.faults.some(f => f.el === N && f.loc === 'lv')) return; N.lvBrk = closed; soe(N.isl, 'Interruttore BT generale cabina ' + N.nm + (closed ? ' CHIUSO' : ' APERTO'), 1, N); }
function fpiReset(I) { I.segs.concat(I.ties).forEach(s => { s.fpi.flag = false; s.fpi.t = 0; }); soe(I.id, 'Reset indicatori di guasto (RGDAT) ' + I.nm, 1, I); }

/* ---------------- fotovoltaico distribuito ---------------- */
function pvLimit(I, k) { if (!comOk(I, 'OP')) return false; I.pv.curt = clamp(k, 0, 1); soe(I.id, 'FV ' + I.nm + ': limite di immissione impostato al ' + Math.round(k * 100) + '% (telecomando agli inverter)', 1, I); return true; }
function pvSwitch(I, on) {
  if (!comOk(I, 'OP')) return false;
  I.pv.opOff = !on;
  if (on) I.pv.groups.forEach(g => { g.rcT = 0; });
  soe(I.id, 'FV ' + I.nm + (on ? ': consenso alla riconnessione degli inverter (rientro dopo 20 s di rete regolare)' : ': DISTACCO di tutti gli inverter (telescatto)'), on ? 1 : 2, I);
  return true;
}
function pvNode(N, on) { if (!comOk(N, 'OP')) return false; N.pvOff = !on; soe(N.isl, 'FV cabina ' + N.nm + (on ? ' riconnesso' : ' distaccato'), 1, N); return true; }

/* stima del carico che si riprende chiudendo: cabine dalla posizione k fino al primo IMS aperto (carico freddo, FV ancora staccato) */
function nodeEst(N) { const [P] = nodeLoad(N, hourNow(), 0); return P / 1000 * (1 + 0.45 * Math.min(1, N.offT / 2700)) / (1 + N.clpA); }
function sectionEst(F, k) { let e = 0; for (let i = k; i < F.nodes.length; i++) { if (i > k) { const sw = F.segs[i].sw; if (sw && (!sw.closed || sw.tmr > 0)) break; } const N = F.nodes[i]; if (!N.live) e += nodeEst(N); } return e; }
/* verifica prima di una chiusura dell'operatore: il carico ripreso è sostenibile? */
function pickupCheck(F) {
  const A = F.bus.area; if (!A || !A.live || A.grid) return null;
  const st = A.st || areaStats(A), est = sectionEst(F, 0);
  const gfm = A.gfm.length ? A.gfm[0] : null;
  const ok = gfm ? est < 0.7 * gfm.Pn : st.res > est * 1.3 && est < 0.4 * st.cap;
  return { est, res: st.res, cap: st.cap, ok };
}

/* ---------------- squadre di manutenzione ---------------- */
function crewNeeded(el) {
  const fl = S.faults.filter(f => f.el === el);
  if (fl.length) return true;
  if (el.el === 'node' && (!el.fuse || el.lvOut > 0)) return true;
  if ((el.el === 'gen' || el.el === 'bess') && (el.blocked || Object.keys(el.fault).some(k => el.fault[k]))) return true;
  if (el.el === 'isl' && !el.com) return true;
  if (el.st !== undefined && el.relays && (el.stuck || el.failClose)) return true;
  return false;
}
function sendCrew(el) {
  S.crews = S.crews || [];
  if (S.crews.some(c => c.el === el)) return false;
  const I = islOf(el);
  /* sicurezza: l'impianto deve essere fuori tensione */
  const live = S.faults.some(f => f.el === el && f.on) || (el.el === 'seg' && (el.dn.live && (el.dn.via === el || (el.sw && el.sw.closed && (el.up ? el.up.live : el.fd.live))))) || (el.el === 'tie' && (el.a.live || (el.b.live && el.sw.closed))) || (el.el === 'node' && el.live && S.faults.some(f => f.el === el && f.loc === 'node')) || (el.el === 'br' && (devClosed(el.brkA) || (el.brkB && devClosed(el.brkB)))) || (el.el === 'bus' && el.live) || (el.el === 'gen' && devClosed(el.brk) && el.fault.shaft) || (el.st !== undefined && el.relays && el.stuck && !el.racked && devClosed(el));
  if (live) { soe(el.isl || (I && I.id), 'Squadra NON inviata su ' + el.nm + ': l\'impianto è ancora in tensione — isolare e mettere in sicurezza prima', 2, el); S.lastRefuse = { t: S.t, id: el.id, msg: 'impianto in tensione: isolare prima dell\'intervento' }; return false; }
  const T = el.el === 'isl' ? 25 : el.el === 'gen' ? S.set.repT * 1.3 : S.set.repT;
  S.crews.push({ el, t: T, T });
  soe(I ? I.id : null, 'Squadra di pronto intervento inviata: ' + el.nm + ' (≈' + Math.round(T) + ' s)', 1, el);
  return true;
}
function crewsStep(dt) {
  (S.crews || []).forEach(c => {
    c.t -= dt;
    if (c.t > 0) return;
    const el = c.el, I = islOf(el);
    S.faults.filter(f => f.el === el).forEach(f => { f.gone = true; f.perm = false; f.repaired = true; });
    if (el.el === 'node') { el.fuse = true; el.lvOut = 0; alarmClear('fuse.' + el.id); alarmClear('lv.' + el.id); }
    if (el.el === 'gen') { el.fault = {}; el.derate = 1; el.blocked = false; alarmClear('shaft.' + el.id); alarmClear('nostart.' + el.id); }
    if (el.el === 'bess') { el.fault = {}; el.blocked = false; }
    if (el.el === 'isl') { el.com = true; alarmClear('com.' + el.id); }
    if (el.el === 'br') { el.th = 0; }
    if (el.st !== undefined && el.relays) { el.stuck = false; el.failClose = false; alarmClear('stuck.' + el.id); alarmClear('fc.' + el.id); }
    soe(I ? I.id : null, 'Intervento completato: ' + el.nm + ' riparato — rimettere in servizio con le manovre', 1, el);
    c.done = true;
  });
  S.crews = (S.crews || []).filter(c => !c.done);
}

/* ---------------- guasti di apparecchiature (non di rete) ---------------- */
function equipFault(el, kind) {
  const I = islOf(el);
  const msg = {
    gtrip: 'trip intempestivo protezioni motore', cool: 'avaria impianto di raffreddamento', fuel: 'intasamento filtri gasolio (potenza max 55%)', govHunt: 'pendolamento del regolatore di velocità',
    govStuck: 'attuatore cremagliera bloccato', lof: 'perdita di eccitazione (diodi rotanti)', avrRun: 'AVR in avaria: eccitazione al massimo', nostart: 'avviatore in avaria (mancato avviamento al prossimo avvio)', oil: 'perdita olio lubrificante', cyl: 'cilindro in avaria (temperatura scarico)',
    btrip: 'scatto BMS', bderate: 'limitazione potenza 50% (temperatura)', bhot: 'guasto condizionamento container',
    stuck: 'interruttore bloccato (mancata apertura)', failClose: 'bobina di chiusura guasta', com: 'perdita comunicazione RTU'
  }[kind];
  if (el.el === 'gen') {
    if (kind === 'gtrip') { emergencyStop(el, 'trip protezioni motore'); return; }
    if (kind === 'fuel') el.fault.fuel = 0.55;
    else if (kind === 'govStuck') { el.fault.govStuck = true; el.stuckRack = el.rack; }
    else el.fault[kind] = true;
  } else if (el.el === 'bess') {
    if (kind === 'btrip') el.fault.trip = true; else if (kind === 'bderate') el.fault.derate = true; else if (kind === 'bhot') el.fault.hot = true;
  } else if (kind === 'stuck') el.stuck = true;
  else if (kind === 'failClose') el.failClose = true;
  else if (kind === 'com') { el.com = false; snapIsland(el); alarmRaise('com.' + el.id, 2, 'Perdita comunicazione RTU ' + el.nm + ': telemisure congelate, comandi non disponibili', el.id, el); }
  soe(I ? I.id : null, 'AVARIA: ' + el.nm + ' — ' + msg, 3, el);
}
function snapIsland(I) { I.snapT = S.t; I.snapClk = S.clk; }

/* ---------------- EMS (automazione di centrale) ---------------- */
function buildCtrl() {
  S.set.repT = 40;
  S.isl.forEach(I => {
    I.ems = { on: true, uc: true, restore: true, pvCurt: true, bess: true, blackstart: true, n1: true, rPct: 0.2, rPv: 0.2, socMin: 25, socMax: 95, ldT: 0.42, rMin: Math.max(0.05, 0.4 * Math.max.apply(null, I.gens.map(g => g.Pn).concat([0]))), socLo: 30, socHi: 85, hotGrid: true, tStart: 0, tStop: 0, tRest: 0, last: '', agc: true };
  });
  S.tot = { E: { load: 0, dsl: 0, pv: 0, bess: 0, ens: 0, fuel: 0, imp: 0 }, cost: 0 };
}
function areaLead(A) { let best = null, cap = -1; A.isl.forEach(id => { const I = S.islById[id], c = I.gens.reduce((a, g) => a + g.Pn, 0) + I.bess.reduce((a, b) => a + b.Pn, 0); if (c > cap) { cap = c; best = I; } }); return best; }
function areaGens(A) { const L = []; A.isl.forEach(id => S.islById[id].gens.forEach(g => L.push(g))); return L; }
function areaBess(A) { const L = []; A.isl.forEach(id => S.islById[id].bess.forEach(b => L.push(b))); return L; }
function areaFeeders(A) { const L = []; A.isl.forEach(id => S.islById[id].feeders.forEach(f => L.push(f))); return L; }
function areaStats(A) {
  const G = areaGens(A), on = G.filter(g => g.st === 'IN PARALLELO' && devClosed(g.brk));
  const cap = on.reduce((a, g) => a + g.Pn * g.derate * (g.fault.fuel || 1), 0), pd = on.reduce((a, g) => a + g.Pe, 0);
  const B = areaBess(A).filter(b => devClosed(b.brk) && b.run);
  const pb = B.reduce((a, b) => a + b.P, 0);
  const bres = B.reduce((a, b) => a + (b.soc > 20 ? Math.max(0, b.Pn - b.P) * 0.5 : 0), 0);
  let load = 0; A.buses.forEach(b => { if (!b.grid && b.live) load += (b.loadP || 0); });
  const imp = A.grid ? (S.grid.P || 0) : 0;
  return { G, on, cap, pd, pb, res: cap - pd + bres, load, B, imp, D: pd + pb + imp };
}
function emsStep(dt) {
  S.areas.forEach(A => {
    if (!A.isl.length) return;
    const I = areaLead(A); if (!I || !I.ems.on) return;
    const E = I.ems, st = areaStats(A);
    A.st = st;
    E.tStart = Math.max(0, E.tStart - dt); E.tRest = Math.max(0, E.tRest - dt);
    const autoG = st.G.filter(g => g.auto);
    const starting = autoG.filter(g => !g.blocked && !g.stopReq && ['PRELUBRIFICAZIONE', 'AVVIAMENTO', 'ACCELERAZIONE', 'ECCITAZIONE', 'PRONTO'].indexOf(g.st) >= 0);
    const avail = autoG.filter(g => g.st === 'FERMO' && !g.blocked && !g.fault.nostartKnown);
    /* le unità avviate dall'EMS vanno in parallelo con il sincronizzatore */
    const locked = A.buses.some(b => b.lock);
    if (locked) { E.last = 'sbarra in blocco 86: attesa reset operatore'; starting.forEach(g => { g.asyn = false; }); return; }
    starting.forEach(g => { if (g.st === 'PRONTO' && g.byEms && !g.asyn && g.brk.st === 'O') genAutoSync(g, true); });
    const gfm = st.B.filter(b => b.mode === 'GFM');
    const startOne = (need, why) => {
      if (E.tStart > 0 || starting.length || !avail.length || !E.uc) return false;
      const c = avail.slice().sort((a, b) => ((a.isl === I.id ? 0 : 100) + a.Pn) - ((b.isl === I.id ? 0 : 100) + b.Pn));
      const loc = c.filter(x => x.isl === I.id), pool = loc.length ? loc : c;
      const g = pool.find(x => x.Pn >= need) || pool[pool.length - 1];
      if (startGen(g, 'EMS')) { g.byEms = true; E.tStart = 6; E.last = 'avvio ' + g.short + ': ' + why; soe(I.id, 'EMS ' + I.nm + ': avvio ' + g.nm + ' — ' + why, 1, g); return true; }
      return false;
    };
    /* area spenta: rimessa in tensione automatica */
    if (!A.live) {
      if (!E.blackstart) return;
      const gfmAv = areaBess(A).filter(b => b.mode === 'GFM' && b.run && !b.blocked && b.soc > 5);
      if (gfmAv.length && !devClosed(gfmAv[0].brk)) { if (E.tStart <= 0) { brkCmd(gfmAv[0].brk, 'C', 'EMS: black start grid-forming', 'EMS'); E.tStart = 5; } return; }
      if (!gfmAv.length) startOne(0, 'rimessa in tensione (black start)');
      return;
    }
    /* modalità di regolazione delle unità in parallelo */
    st.on.forEach(g => { if (g.auto && g.byEms !== false) { const want = (A.grid || gfm.length) ? 'BASE' : 'ISO'; if (g.mode !== want && g.st === 'IN PARALLELO') { g.mode = want; if (want === 'BASE') g.Pset = g.Pe; else g.fref = 50; } } });
    if (A.grid) {
      /* collegata alla RTN: eventuale gruppo in riserva calda al minimo tecnico */
      const hot = E.hotGrid && E.uc;
      if (hot && st.on.length === 0 && !starting.length) startOne(0, 'riserva calda con rete connessa');
      st.on.forEach(g => { if (g.auto && g.mode === 'BASE') { g.Pset += (g.Pn * 0.32 - g.Pset) * Math.min(1, dt / 10); g.Vref = clamp(g.Vref + clamp(0.25 * g.Pe - g.Qe, -0.5, 0.5) / g.Sn * 0.02 * dt, 0.95, 1.08); } });
      if (st.on.length > (hot ? 1 : 0) && E.uc) { const sm = st.on.filter(g => g.auto).sort((a, b) => a.Pn - b.Pn)[0]; if (sm && E.tStart <= 0) { stopGen(sm, 'EMS'); E.tStart = 10; E.last = 'arresto ' + sm.short + ': alimentazione da RTN'; } }
    } else if (gfm.length) {
      /* microrete con accumulo grid-forming: il diesel ricarica la batteria */
      const b = gfm[0];
      const run = st.on.filter(g => g.auto);
      if ((b.soc < E.socLo || b.P > 0.9 * b.Pn) && !run.length) startOne(0, 'SoC ' + b.soc.toFixed(0) + '% / potenza BESS al limite');
      run.forEach(g => { g.mode = 'BASE'; const tgt = clamp(st.load + 0.6 * b.Pn * (b.soc < E.socHi ? 1 : 0), 0.3 * g.Pn, 0.9 * g.Pn); g.Pset += (tgt - g.Pset) * Math.min(1, dt / 8); });
      if (run.length && b.soc > E.socHi && E.tStart <= 0) { stopGen(run[0], 'EMS'); E.tStart = 20; E.last = 'arresto diesel: batteria carica'; }
      /* limitazione FV con batteria piena */
      if (E.pvCurt) { S.isl.filter(x => A.isl.indexOf(x.id) >= 0).forEach(x => { if (b.soc > 96 && b.P < -0.02 * b.Pn) x.pv.curtEms = Math.max(0, x.pv.curtEms - 0.04 * dt); else if (b.soc < 93 || b.P > 0) x.pv.curtEms = Math.min(1, x.pv.curtEms + 0.05 * dt); }); }
    } else {
      /* isola alimentata da gruppi diesel */
      const isls = S.isl.filter(x => A.isl.indexOf(x.id) >= 0), pvA = isls.reduce((a, x) => a + x.pv.P, 0);
      /* riserva: quota del carico + quota della produzione FV (una nube può toglierla in pochi secondi) */
      const need = Math.max(E.rPct * Math.max(st.D, 0) + (E.rPv || 0) * pvA, E.rMin);
      A.need = need;
      const maxPn = st.on.reduce((a, g) => Math.max(a, g.Pn * g.derate), 0);
      const bdis = st.B.reduce((a, b) => a + (b.soc > 25 ? b.Pn * 0.8 : 0), 0);
      /* N-1: la perdita del gruppo più grande dev'essere coperta, e serve comunque una seconda macchina
         sincrona (un accumulo grid-following non tiene in piedi la rete da solo) */
      const n1ok = !E.n1 || st.on.length === 0 || ((st.cap - maxPn + bdis) >= 0.95 * st.D && (st.on.length >= 2 || !avail.length && !starting.length));
      A.n1ok = n1ok;
      if (st.res < need || !n1ok) { E.tLow = (E.tLow || 0) + dt; if (E.tLow > 2) startOne(Math.max(need - st.res, 0.95 * st.D - (st.cap - maxPn + bdis)), st.res < need ? 'riserva ' + (st.res * 1000).toFixed(0) + ' kW < ' + (need * 1000).toFixed(0) + ' kW' : 'criterio N-1 non soddisfatto'); }
      else E.tLow = 0;
      /* arresto per eccesso di riserva */
      const autoOn = st.on.filter(g => g.auto).sort((a, b) => a.Pn - b.Pn);
      if (autoOn.length && st.on.length > 1 && E.uc && !starting.length) {
        const sm = autoOn[0], resAfter = st.res - sm.Pn * sm.derate + sm.Pe * 0;
        const load = st.pd, capAfter = st.cap - sm.Pn * sm.derate;
        const rest = st.on.filter(g => g !== sm), maxAfter = rest.reduce((a, g) => Math.max(a, g.Pn * g.derate), 0);
        const bdis = st.B.reduce((a, b) => a + (b.soc > 25 ? b.Pn * 0.8 : 0), 0);
        const n1After = !E.n1 || ((capAfter - maxAfter + bdis) >= 1.05 * st.D && rest.length >= 2);
        const pendingRestore = E.restore && areaFeeders(A).some(F => (!devClosed(F.brk) && ['UFLS', '27', 'EMS', 'BUS'].indexOf(F.shedBy) >= 0) || F.segs.some(sg => sg.sw && sg.sw.emsOpen && !sg.sw.closed));
        if (resAfter > need * 1.25 && load < capAfter * 0.8 && n1After && !pendingRestore) { E.tHigh = (E.tHigh || 0) + dt; if (E.tHigh > 25) { stopGen(sm, 'EMS'); E.tHigh = 0; E.tStart = 15; E.last = 'arresto ' + sm.short + ': riserva in eccesso'; soe(I.id, 'EMS ' + I.nm + ': arresto ' + sm.nm + ' (riserva in eccesso)', 1, sm); } }
        else E.tHigh = 0;
      }
      /* gestione accumulo grid-following:
         - di giorno assorbe il surplus FV tenendo i diesel intorno al carico obiettivo (ldT)
         - la sera e la notte restituisce l'energia, ripartita sulle ore fino all'alba
         - in emergenza (diesel quasi al limite) sostiene la rete */
      const ld = st.cap > 0 ? st.pd / st.cap : 1, gross = Math.max(0, st.load) + pvA;
      const [ri] = sunTimes(), hh = hourNow(), toDawn = hh < ri ? ri - hh : 24 - hh + ri;
      const sunUp = pvA > 0.15 * gross && pvA > 0.002;
      if (E.bess) st.B.forEach(b => {
        if (b.mode !== 'GFL' || !b.auto) return;
        const Pmax = b.Pn * (b.fault.derate ? 0.5 : 1);
        let tgt, tau = 15;
        if (ld > 0.92 && b.soc > 15) tgt = 0.8 * Pmax;
        else if (sunUp) {
          if (b.soc < (E.socMax || 95)) { const kk = ld < 0.32 ? 0.6 : 0.25; tgt = Math.min(0, b.Pset + kk * (ld - (E.ldT || 0.5)) * st.cap); if (ld < 0.32) tau = 4; }
          else tgt = Math.max(0, b.Pset);
        } else {
          const Eav = Math.max(0, (b.soc - (E.socMin || 25)) / 100 * b.En * 0.95);
          tgt = Math.min(0.9 * Pmax, Eav / Math.max(1, toDawn));
          /* non portare i diesel sotto il minimo tecnico */
          tgt = Math.max(0, Math.min(tgt, b.Pset + (ld - 0.38) * st.cap));
        }
        tgt = clamp(tgt, -Pmax, Pmax);
        b.Pset += (tgt - b.Pset) * Math.min(1, dt / tau);
      });
      /* limitazione FV per minimo tecnico dei diesel, solo se gli accumuli non possono assorbire altro */
      if (E.pvCurt) {
        const room = E.bess && st.B.some(b => b.mode === 'GFL' && b.auto && b.soc < (E.socMax || 95) - 1 && b.Pset > -0.95 * b.Pn * (b.fault.derate ? 0.5 : 1));
        isls.forEach(x => { if (ld < 0.22 || (ld < 0.28 && !room)) x.pv.curtEms = Math.max(0, x.pv.curtEms - 0.04 * dt); else if (ld > 0.36 || (room && ld > 0.3)) x.pv.curtEms = Math.min(1, x.pv.curtEms + 0.03 * dt); });
        isls.forEach(x => { if (x.pv.curtEms < 0.98 && !x._curtLog) { x._curtLog = true; soe(x.id, 'EMS ' + x.nm + ': limitazione del FV per tenere i diesel sopra il minimo tecnico', 1, x); } else if (x.pv.curtEms >= 0.999) x._curtLog = false; });
      }
    }
    /* rientro automatico degli accumuli grid-following */
    areaBess(A).forEach(b => { if (b.auto && (b.mode === 'GFL' || (b.mode === 'GFM' && st.on.length)) && b.run && !b.blocked && !devClosed(b.brk) && !b.brk.racked && b.bus.live && !b.bus.lock && Math.abs(b.bus.fm - 50) < 0.2) { b.rcT = (b.rcT || 0) + dt; if (b.rcT > 10) { b.rcT = 0; b.Pset = 0; b.P = 0; brkCmd(b.brk, 'C', 'EMS: rientro automatico BESS', 'EMS'); } } else b.rcT = 0; });
    /* rialimentazione automatica dei carichi distaccati da UFLS / mancanza tensione (anche per tronchi) */
    if (E.restore && E.tRest <= 0 && !starting.length) {
      const f = A.buses.find(b => !b.grid).fm;
      const fits = (est, F) => { const k = F ? (F.rk || 1) : 1; return A.grid || (gfm.length ? est * k < 0.7 * gfm[0].Pn : st.res > est * 1.3 * k && est * k < 0.4 * st.cap); };
      /* 1) prosegue le rialimentazioni per tronchi già avviate */
      const pend = areaFeeders(A).find(F => devClosed(F.brk) && F.live && F.segs.some(sg => sg.sw && sg.sw.emsOpen && !sg.sw.closed));
      if (pend && (A.grid || f > 49.85)) {
        const sg = pend.segs.find(sg => sg.sw && sg.sw.emsOpen && !sg.sw.closed && sg.sw.tmr <= 0 && sg.up.live && !S.faults.some(x => x.el === sg || x.el === sg.dn));
        if (sg) {
          const est = Math.max(0.01, sectionEst(pend, sg.dn.idx));
          if (fits(est, pend)) { swCmd(sg.sw, true, 'EMS'); pend.rT = S.t; sg.sw.emsOpen = false; E.tRest = 6; E.last = 'rialimentazione ' + pend.short + ' → ' + sg.dn.nm; soe(I.id, 'EMS ' + I.nm + ': rialimentazione per tronchi, chiusura IMS verso ' + sg.dn.nm + ' (stima ' + Math.round(est * 1000) + ' kW)', 1, sg); }
          else if (avail.length) startOne(Math.max(est * 1.3 * (pend.rk || 1) - st.res, est * (pend.rk || 1) / 0.4 - st.cap), 'riserva per rialimentare ' + sg.dn.nm);
          else E.last = 'attesa riserva per ' + sg.dn.nm;
          return;
        }
      }
      const F = areaFeeders(A).filter(F => !devClosed(F.brk) && !F.brk.racked && F.brk.st !== 'CL' && (F.shedBy === 'UFLS' || F.shedBy === '27' || F.shedBy === 'EMS' || F.shedBy === 'BUS') && S.t - (F.shedAt || 0) > 10 && F.bus.live && !F.bus.lock).sort((a, b) => a.ufls === b.ufls ? 0 : (b.ufls || 9) - (a.ufls || 9))[0];
      if (F && (A.grid || f > 49.85)) {
        /* stima del carico alla rimessa in tensione: carico freddo + FV non ancora riconnesso */
        let est = 0; F.nodes.forEach(N => { est += nodeEst(N); });
        est = Math.max(est, 0.02);
        const ok = fits(est, F);
        const first = nodeEst(F.nodes[0]);
        if (ok) { F.rT = S.t; brkCmd(F.brk, 'C', 'EMS: rialimentazione automatica (stima ' + Math.round(est * 1000) + ' kW)', 'EMS'); F.shedBy = ''; E.tRest = 8; E.last = 'rialimentazione ' + F.short; }
        else if (F.nodes.length > 1 && fits(first, F)) {
          /* troppo carico per un solo gradino: si sezionano i tronchi e si rialimenta una cabina alla volta */
          const toOpen = F.segs.filter(sg => sg.sw && sg.sw.closed && sg.sw.tmr <= 0);
          if (toOpen.length) { toOpen.forEach(sg => { if (swCmd(sg.sw, false, 'EMS')) sg.sw.emsOpen = true; }); E.tRest = 2.5; E.last = 'sezionamento di ' + F.short + ' per rialimentazione a gradini'; soe(I.id, 'EMS ' + I.nm + ': ' + F.nm + ' troppo carica per un solo gradino (' + Math.round(est * 1000) + ' kW): sezionamento per tronchi', 1, F); }
          else if (F.segs.every(sg => !sg.sw || sg.sw.tmr <= 0)) { F.rT = S.t; brkCmd(F.brk, 'C', 'EMS: rialimentazione del primo tronco (stima ' + Math.round(first * 1000) + ' kW)', 'EMS'); F.shedBy = ''; E.tRest = 6; E.last = 'rialimentazione primo tronco ' + F.short; }
        }
        else if (avail.length && !starting.length) startOne(Math.max(first * 1.3 * (F.rk || 1) - st.res, first * (F.rk || 1) / 0.4 - st.cap), 'riserva per rialimentare ' + F.nm + ' (' + Math.round(est * 1000) + ' kW)');
        else E.last = 'attesa riserva per ' + F.short;
      }
    }
  });
}

/* ---------------- allarmi di processo ---------------- */
function processAlarms() {
  S.isl.forEach(I => {
    const b = I.buses[0], A = b.area;
    alarmCond('blk.' + I.id, !b.live, 3, 'DISSERVIZIO: isola di ' + I.nm + ' non alimentata', I.id, I);
    if (b.live && !A.grid) {
      const df = b.fm - 50;
      alarmCond('fa.' + I.id, Math.abs(df) > 0.5, 3, I.nm + ': frequenza ' + b.fm.toFixed(2) + ' Hz fuori banda (±0.5 Hz)', I.id, I);
      alarmCond('fw.' + I.id, Math.abs(df) > 0.2 && Math.abs(df) <= 0.5, 2, I.nm + ': frequenza ' + b.fm.toFixed(2) + ' Hz (±0.2 Hz)', I.id, I);
    } else { alarmClear('fa.' + I.id); alarmClear('fw.' + I.id); }
    I.buses.forEach(B => { alarmCond('v.' + B.id, B.live && (B.Vm < 0.92 || B.Vm > 1.08), 2, B.nm + ' (' + I.nm + '): tensione ' + (B.Vm * 20).toFixed(2) + ' kV', I.id, B); });
    alarmCond('v0.' + I.id, I.V0 > 0.15, 2, I.nm + ': guasto a terra in rete MT (V0 = ' + (I.V0 * 100).toFixed(0) + '%, Ig = ' + I.Ig.toFixed(1) + ' A)', I.id, I);
    const fp = I.segs.concat(I.ties).filter(s => s.fpi.flag);
    alarmCond('fpi.' + I.id, fp.length > 0, 1, I.nm + ': ' + fp.length + ' indicatori di guasto (RGDAT) attivati', I.id, I);
    const sh = I.feeders.filter(F => F.shedBy === 'UFLS');
    alarmCond('ufls.' + I.id, sh.length > 0, 2, I.nm + ': ' + sh.length + ' linee distaccate da alleggerimento carico (UFLS)', I.id, I);
    const pvOff = I.pv.groups.filter(g => !g.on && I.pv.Pav > 0.002);
    alarmCond('pv.' + I.id, pvOff.length > 0 && b.live, 1, I.nm + ': FV distribuito distaccato (' + pvOff.map(g => g.why).join(', ') + ')', I.id, I);
    if (A && A.st && !A.grid && b.live && A.need && !A.gfm.length) alarmCond('res.' + I.id, A.st.res < A.need * 0.6 && areaLead(A) === I, 2, I.nm + ': riserva rotante insufficiente (' + (A.st.res * 1000).toFixed(0) + ' kW)', I.id, I);
    I.gens.forEach(G => {
      alarmCond('tc.' + G.id, G.Tc > 92, 2, G.nm + ': temperatura acqua ' + G.Tc.toFixed(0) + ' °C', I.id, G);
      alarmCond('ol.' + G.id, G.st === 'IN PARALLELO' && G.Pe > 1.02 * G.Pn, 2, G.nm + ': sovraccarico ' + (G.Pe / G.Pn * 100).toFixed(0) + '%', I.id, G);
      alarmCond('ll.' + G.id, G.st === 'IN PARALLELO' && G.Pe < G.pmin * G.Pn && G.stT > 20, 1, G.nm + ': funzionamento sotto il minimo tecnico (' + (G.Pe / G.Pn * 100).toFixed(0) + '%)', I.id, G);
      alarmCond('q.' + G.id, G.st === 'IN PARALLELO' && Math.abs(G.Qe) > 0.75 * G.Sn, 2, G.nm + ': limite di potenza reattiva', I.id, G);
      alarmCond('tx.' + G.id, G.fault.cyl && genRunning(G), 2, G.nm + ': temperatura scarico anomala ' + G.Tex.toFixed(0) + ' °C', I.id, G);
      alarmCond('blk.' + G.id, G.blocked, 2, G.nm + ': gruppo in blocco', I.id, G);
    });
    I.bess.forEach(B => {
      alarmCond('soc.' + B.id, B.soc < 15, B.soc < 5 ? 3 : 2, B.nm + ': SoC ' + B.soc.toFixed(0) + '%', I.id, B);
      alarmCond('tb.' + B.id, B.Tcell > 40, 2, B.nm + ': temperatura celle ' + B.Tcell.toFixed(0) + ' °C', I.id, B);
    });
    I.feeders.forEach(F => {
      const ld = F.Iamp / F.Inom;
      alarmCond('fl.' + F.id, ld > 0.9 && !S.faults.some(f => f.on && f.fd === F), ld > 1 ? 3 : 2, F.nm + ' (' + I.nm + '): carico ' + Math.round(ld * 100) + '% della portata', I.id, F);
    });
    I.nodes.forEach(N => {
      alarmCond('nv.' + N.id, N.live && N.Vm < 0.92, 1, 'Cabina ' + N.nm + ': tensione bassa ' + (N.Vm * 100).toFixed(0) + '%', I.id, N);
      alarmCond('nt.' + N.id, N.live && N.load > 1.0, 2, 'Cabina ' + N.nm + ': trasformatore MT/BT al ' + Math.round(N.load * 100) + '%', I.id, N);
    });
  });
  S.br.forEach(br => { if (br.kind === 'cab') alarmCond('bl.' + br.id, br.load > 0.9, br.load > 1 ? 3 : 2, br.nm + ': carico ' + Math.round(br.load * 100) + '%', br.b.isl, br); });
}

/* ---------------- totali energetici ---------------- */
function totalsStep(dt) {
  const T = S.tot, h = dt * S.clkSpeed / 3600;
  let load = 0, dsl = 0, pv = 0, bess = 0, ens = 0, fuel = 0;
  S.isl.forEach(I => {
    I.nodes.forEach(N => { if (N.live) load += N.Pl; else { const [P] = nodeLoad(N, hourNow(), 0); ens += P / 1000; } });
    I.gens.forEach(G => { if (G.st === 'IN PARALLELO') dsl += Math.max(0, G.Pe); fuel += G.fuel; });
    pv += I.pv.P; I.bess.forEach(B => bess += B.P);
  });
  const imp = S.grid.bus.area && S.grid.bus.area.isl.length ? (S.grid.P || 0) : 0;
  T.now = { load, dsl, pv, bess, ens, fuel, imp };
  T.E.load += load * h; T.E.dsl += dsl * h; T.E.pv += pv * h; T.E.bess += bess * h; T.E.ens += ens * h; T.E.fuel += fuel * h; T.E.imp += Math.max(0, imp) * h;
}

/* ---------------- guasti casuali ---------------- */
function randomFaults(dt) {
  const r = S.set.randF; if (!r) return;
  const rate = [0, 0.4, 1.2, 3][r] / 60 * (S.storm > 0 ? 4 : 1);
  if (rnd() > rate * dt) return;
  const pick = a => a[Math.floor(rnd() * a.length)];
  const k = rnd();
  if (k < 0.55) {
    const L = S.segs.filter(s => s.t === 'a70' && s.dn.live);
    if (L.length) injectFault({ el: pick(L), loc: 'seg', kind: rnd() < 0.6 ? 'LG' : rnd() < 0.5 ? 'LL' : 'LLL', perm: rnd() < 0.3, rf: rnd() < 0.5 ? 0 : 10 });
  } else if (k < 0.7) { const L = S.segs.filter(s => s.dn.live); if (L.length) injectFault({ el: pick(L), loc: 'seg', kind: 'LLL', perm: rnd() < 0.4 }); }
  else if (k < 0.78) { const L = S.nodes.filter(n => n.live); if (L.length) injectFault({ el: pick(L), loc: rnd() < 0.5 ? 'lv' : 'trq', kind: 'LLL', perm: true }); }
  else if (k < 0.9) { const L = S.gens.filter(g => g.st === 'IN PARALLELO'); if (L.length) equipFault(pick(L), pick(['gtrip', 'cool', 'fuel', 'cyl'])); }
  else { const I = pick(S.isl); I.cvT = 30 + rnd() * 40; I.cvD = 0.85; soe(I.id, 'Meteo: nube temporalesca su ' + I.nm, 1, I); }
}

/* ---------------- passo di controllo (0.2 s) ---------------- */
function ctrlStep(dt) {
  if (S.settling) return;
  S.emsAcc = (S.emsAcc || 0) + dt;
  if (S.emsAcc >= 1) { S.emsAcc = 0; emsStep(1); }
  processAlarms();
  totalsStep(dt);
  crewsStep(dt);
  randomFaults(dt);
  if (S.storm > 0) S.storm -= dt;
  /* registrazione del carico prima di un distacco (per la rialimentazione) */
  S.feeders.forEach(F => { if (devClosed(F.brk) && F.live) F.lastP = Math.max(0, F.P); });
  /* gruppo appena entrato in parallelo */
  S.gens.forEach(G => { if (G.st === 'IN PARALLELO' && !G.parDone) { G.parDone = true; onGenParallel(G); } if (G.st !== 'IN PARALLELO') G.parDone = false; if (G.st === 'FERMO') G.byEms = false; });
  if (typeof trendSlow === 'function') trendSlow(dt);
}

/* ---------------- inizializzazione: stato di esercizio coerente ---------------- */
/* impegno delle unità di un'area coerente con il carico attuale.
   re = false: avvio della simulazione; re = true: riallineamento dopo un salto dell'orologio */
function dispatchArea(A, re) {
  if (!A.isl.length) return;
  if (re && (!A.live || A.buses.some(b => b.lock))) return;
  const gens = areaGens(A), bessA = areaBess(A), gfm = bessA.filter(b => b.mode === 'GFM' && (!re || devClosed(b.brk)));
  let D = 0; A.buses.forEach(b => { if (!b.grid) { const L = busLoad(b); D += L.P - L.Ppv; } });
  if (!re) bessA.forEach(b => { b.brk.st = 'C'; b.run = true; b.E = 1; b.Esoft = 1; b.w = 1; b.d = 0; b.Pset = 0; b.Pref = 0; });
  else bessA.forEach(b => { if (b.mode === 'GFL') { b.Pset = 0; b.P = 0; } });
  if (gfm.length) { gfm[0].Pref = D; gfm[0].P = D; return; }
  if (A.grid) return;
  const I = areaLead(A);
  let PV = 0; A.isl.forEach(id => { PV += S.islById[id].pv.P; });
  const need = Math.max(I.ems.rPct * Math.max(D, 0) + I.ems.rPv * PV, I.ems.rMin);
  const run = []; let cap = 0;
  /* la sezione B di Lipari alimenta Vulcano: i gruppi di Vulcano restano di riserva */
  const ok = g => !g.blocked && !Object.keys(g.fault).some(k => g.fault[k]) && !g.brk.racked && !g.brk.stuck && !g.brk.failClose;
  const cand = (A.isl.length > 1 ? gens.filter(g => g.isl !== 'VUL') : gens).filter(ok);
  const sorted = cand.slice().sort((a, b) => b.Pn - a.Pn);
  const bd = bessA.filter(b => b.run && (!re || devClosed(b.brk))).reduce((a, b) => a + b.Pn * 0.8, 0);
  for (const g of sorted) {
    const mx = run.reduce((a, x) => Math.max(a, x.Pn), 0);
    if (run.length >= (I.ems.n1 && sorted.length > 1 ? 2 : 1) && cap >= D / 0.8 && cap - D >= need && cap - mx + bd >= 1.08 * D) break;
    run.push(g); cap += g.Pn;
  }
  if (!run.length) return;
  /* con molto FV: l'accumulo assorbe il surplus e, se non basta, si limita il FV, così i diesel restano sopra il minimo tecnico */
  let Dd = D;
  const gfl = bessA.filter(b => b.mode === 'GFL' && b.run && (!re || devClosed(b.brk)));
  const chMax = gfl.reduce((a, b) => a + b.Pn * 0.9 * (b.soc < 95 ? 1 : 0), 0);
  if (Dd < 0.5 * cap && chMax > 0) {
    const ch = Math.min(0.5 * cap - Dd, chMax);
    gfl.forEach(b => { if (b.soc < 95) b.Pset = b.P = -ch * b.Pn * 0.9 / chMax; });
    Dd += ch;
  }
  if (Dd < 0.35 * cap && PV > 0) { const exc = 0.35 * cap - Dd; A.isl.forEach(id => { S.islById[id].pv.curtEms = clamp(1 - exc / PV, 0, 1); }); Dd = 0.35 * cap; }
  if (re) gens.forEach(g => { if (run.indexOf(g) < 0 && g.st !== 'FERMO') { g.st = 'FERMO'; g.stT = 0; g.brk.st = 'O'; g.w = 0; g.Eq = 0; g.Pe = 0; g.Qe = 0; g.rack = 0; g.boost = 0; g.asyn = false; g.stopReq = false; S.topoDirty = true; } });
  run.sort((a, b) => a.Pn - b.Pn);
  run.forEach(g => {
    const was = g.st === 'IN PARALLELO';
    g.st = 'IN PARALLELO'; g.brk.st = 'C'; g.mode = 'ISO'; g.fref = 50; g.Vref = 1.0; g.parDone = true; g.byEms = true; g.stopReq = false; g.asyn = false;
    if (!was) { g.w = re ? (g.bus.fm || 50) / 50 : 1; g.Eq = 1.08; g.d = (re ? g.bus.th : 0) + 0.05; g.ia = 2.0; g.Efd = 2.0; g.oil = 4.8; S.topoDirty = true; }
    const p = Dd / cap; g.rack = p + 0.04; g.boost = g.rack; g.ig = g.rack; g.Tc = Math.max(g.Tc, 70 + 15 * p); g.Tex = 260 + 210 * p; g.Pe = p * g.Pn; g.pef = p;
  });
}
/* salto dell'orologio (scenari, impostazioni): nuovo profilo di carico e sole, parco di produzione riallineato */
function retime(clk, doy) {
  S.clk = ((clk % 86400) + 86400) % 86400; if (doy) S.doy = doy;
  const wasSettling = S.settling;
  S.settling = true;
  S.isl.forEach(I => { I.pv.curtEms = 1; I.pv.groups.forEach(g => { g.lfsmK = 1; }); islandFeederSolve(I); islandFeederSolve(I); });
  S.areas.forEach(A => dispatchArea(A, true));
  topology();
  for (let k = 0; k < 2500; k++) fastStep(DT);
  S.settling = wasSettling;
}
function initSim(seed) {
  buildSim(netVariant(NET, NET_CFG.net), seed);
  buildProt(); buildCtrl();
  S.isl.forEach(I => { I.pvEl = { id: I.id + '.PV', el: 'pv', isl: I.id, nm: 'Fotovoltaico ' + I.nm, I }; S.byId[I.pvEl.id] = I.pvEl; });
  S.islById.GIN.pv.groups[1].frac = 0; S.islById.GIN.pv.groups[0].frac = 1;
  S.islById.GIN.ems.rPct = 0;
  S.settling = true;
  topology();
  S.isl.forEach(I => I.buses.forEach(b => { b.V = cx(1, 0); b.Vm = 1; b.live = true; b.f = 50; b.fm = 50; }));
  S.isl.forEach(I => { islandFeederSolve(I); islandFeederSolve(I); });
  /* impegno iniziale delle unità per area */
  S.areas.forEach(A => dispatchArea(A, false));
  topology();
  /* nubi iniziali */
  for (let k = 0; k < 10; k++) addCloud(240 + rnd() * 100, -185 + rnd() * 80, 1.2 + rnd() * 3.5, 0.35 + rnd() * 0.4);
  S.clouds.forEach(c => { c.grow = 1; });
  for (let k = 0; k < 6000; k++) { fastStep(DT); if (initSim.cb) initSim.cb(k); }
  S.settling = false;
  S.soe = []; S.alarms = {}; S.almNew = 0;
  S.faults = [];
  S.relays.forEach(r => { r.led = false; r.op = false; r.pk = false; r.acc = 0; r.tAcc = 0; });
  S.feeders.forEach(F => { F.rec.st = 'IDLE'; });
  S.t0 = S.t;
  soe(null, 'SCADA Eolie avviato · ' + S.isl.length + ' reti isolane, ' + S.gens.length + ' gruppi diesel, ' + S.feeders.length + ' linee MT, ' + S.nodes.length + ' cabine secondarie', 1);
  if (typeof recReset === 'function') recReset();
  return S;
}
