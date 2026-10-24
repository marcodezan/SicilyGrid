'use strict';
/* =====================================================================
   MOTORE DI SIMULAZIONE ELETTRICA
   - sbarre e macchine risolte a passo 1 ms (rete AC in sequenza diretta,
     macchine sincrone a flusso variabile, regolatori di velocità/tensione,
     inverter grid-forming e grid-following)
   - reti MT (linee, cabine, punti di apertura) risolte a 50 Hz
   - guasti simmetrici e dissimmetrici con componenti di sequenza
   Base: 1 MVA, 20 kV  ->  Zb = 400 Ω, Ib = 28.87 A
   ===================================================================== */
const F0 = 50, WB = 2 * Math.PI * F0, ZB = 400, IB = 1000 / (Math.sqrt(3) * 20), VPH = 20 / Math.sqrt(3);
const DT = 0.001, DT_SLOW = 0.02;
let S = null;

/* ---------------- numeri complessi ---------------- */
const cx = (r, i) => ({ r: r, i: i || 0 });
const cadd = (a, b) => ({ r: a.r + b.r, i: a.i + b.i });
const csub = (a, b) => ({ r: a.r - b.r, i: a.i - b.i });
const cmul = (a, b) => ({ r: a.r * b.r - a.i * b.i, i: a.r * b.i + a.i * b.r });
const cdiv = (a, b) => { const d = b.r * b.r + b.i * b.i || 1e-30; return { r: (a.r * b.r + a.i * b.i) / d, i: (a.i * b.r - a.r * b.i) / d }; };
const cconj = a => ({ r: a.r, i: -a.i });
const cabs = a => Math.hypot(a.r, a.i);
const carg = a => Math.atan2(a.i, a.r);
const cpol = (m, t) => ({ r: m * Math.cos(t), i: m * Math.sin(t) });
const csc = (a, k) => ({ r: a.r * k, i: a.i * k });
const cinv = a => cdiv(cx(1, 0), a);
const AOP = cpol(1, 2 * Math.PI / 3), AOP2 = cpol(1, -2 * Math.PI / 3);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const wrapPi = a => { a = (a + Math.PI) % (2 * Math.PI); if (a < 0) a += 2 * Math.PI; return a - Math.PI; };
const gauss = (h, m, s) => Math.exp(-((h - m) * (h - m)) / (2 * s * s));
const ZERO = cx(0, 0);
const NOFLT = [];

/* sistema lineare complesso (eliminazione di Gauss con pivot) */
function csolve(A, b) {
  const n = b.length;
  if (n === 1) return [cdiv(b[0], A[0][0])];
  const M = A.map(r => r.map(x => ({ r: x.r, i: x.i }))), v = b.map(x => ({ r: x.r, i: x.i }));
  for (let c = 0; c < n; c++) {
    let p = c, pm = M[c][c].r * M[c][c].r + M[c][c].i * M[c][c].i;
    for (let r = c + 1; r < n; r++) { const m = M[r][c].r * M[r][c].r + M[r][c].i * M[r][c].i; if (m > pm) { pm = m; p = r; } }
    if (pm < 1e-24) M[c][c] = cx(1e-9, 0);
    if (p !== c) { const t = M[p]; M[p] = M[c]; M[c] = t; const tv = v[p]; v[p] = v[c]; v[c] = tv; }
    const piv = M[c][c];
    for (let r = c + 1; r < n; r++) {
      if (M[r][c].r === 0 && M[r][c].i === 0) continue;
      const f = cdiv(M[r][c], piv);
      for (let k = c; k < n; k++) M[r][k] = csub(M[r][k], cmul(f, M[c][k]));
      v[r] = csub(v[r], cmul(f, v[c]));
    }
  }
  const x = new Array(n);
  for (let r = n - 1; r >= 0; r--) { let s = v[r]; for (let k = r + 1; k < n; k++) s = csub(s, cmul(M[r][k], x[k])); x[r] = cdiv(s, M[r][r]); }
  return x;
}

/* versione veloce su array piatti (re/im separati): fattorizzazione LU con pivot parziale
   riusabile per più termini noti (stessa sequenza di operazioni di csolve, senza oggetti) */
const LUW = {};
function luBuf(n) {
  let w = LUW[n];
  if (!w) w = LUW[n] = { ar: new Float64Array(n * n), ai: new Float64Array(n * n), br: new Float64Array(n), bi: new Float64Array(n), xr: new Float64Array(n), xi: new Float64Array(n), piv: new Int32Array(n) };
  return w;
}
function luFactor(n, ar, ai, piv) {
  for (let c = 0; c < n; c++) {
    let p = c, cc = c * n + c, pm = ar[cc] * ar[cc] + ai[cc] * ai[cc];
    for (let r = c + 1; r < n; r++) { const q = r * n + c, m = ar[q] * ar[q] + ai[q] * ai[q]; if (m > pm) { pm = m; p = r; } }
    if (pm < 1e-24) { ar[cc] = 1e-9; ai[cc] = 0; }
    piv[c] = p;
    if (p !== c) for (let k = 0; k < n; k++) { const a = c * n + k, b = p * n + k; let t = ar[a]; ar[a] = ar[b]; ar[b] = t; t = ai[a]; ai[a] = ai[b]; ai[b] = t; }
    const pr = ar[cc], pi = ai[cc], d = pr * pr + pi * pi || 1e-30;
    for (let r = c + 1; r < n; r++) {
      const q = r * n + c, mr = ar[q], mi = ai[q];
      if (mr === 0 && mi === 0) continue;
      const fr = (mr * pr + mi * pi) / d, fi = (mi * pr - mr * pi) / d;
      ar[q] = fr; ai[q] = fi; /* moltiplicatore memorizzato al posto dell'elemento eliminato */
      for (let k = c + 1; k < n; k++) { const a = r * n + k, b = c * n + k; ar[a] -= fr * ar[b] - fi * ai[b]; ai[a] -= fr * ai[b] + fi * ar[b]; }
    }
  }
}
function luSolve(n, ar, ai, piv, br, bi, xr, xi) {
  for (let c = 0; c < n; c++) { const p = piv[c]; if (p !== c) { let t = br[c]; br[c] = br[p]; br[p] = t; t = bi[c]; bi[c] = bi[p]; bi[p] = t; } }
  for (let c = 0; c < n; c++) {
    for (let r = c + 1; r < n; r++) { const q = r * n + c, fr = ar[q], fi = ai[q]; if (fr === 0 && fi === 0) continue; br[r] -= fr * br[c] - fi * bi[c]; bi[r] -= fr * bi[c] + fi * br[c]; }
  }
  for (let r = n - 1; r >= 0; r--) {
    let sr = br[r], si = bi[r];
    for (let k = r + 1; k < n; k++) { const a = r * n + k; sr -= ar[a] * xr[k] - ai[a] * xi[k]; si -= ar[a] * xi[k] + ai[a] * xr[k]; }
    const a = r * n + r, dr = ar[a], di = ai[a], d = dr * dr + di * di || 1e-30;
    xr[r] = (sr * dr + si * di) / d; xi[r] = (si * dr - sr * di) / d;
  }
}

/* generatore pseudo-casuale riproducibile */
function rnd() { S.rs = (S.rs * 1664525 + 1013904223) >>> 0; return S.rs / 4294967296; }
function rndn() { let u = 0, v = 0; while (u === 0) u = rnd(); v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

/* ====================== COSTRUZIONE DEL MODELLO ====================== */
function genDefaults(Pn) {
  const big = Pn >= 2, mid = Pn >= 0.6;
  return {
    Sn: Pn / 0.8, rpm: big ? 750 : mid ? 1000 : 1500, H: big ? 1.6 : mid ? 1.2 : 0.9, D: 12,
    xdp: 0.25, xd: 1.8, xt: 0.07, x2: 0.20, Td0p: big ? 4.0 : 2.5,
    R: 0.04, gkp: 12, gki: 6, kls: 0.5, tAct: 0.05, tTurbo: big ? 2.4 : 1.4,
    avkp: 20, avki: 20, kqd: 0.04, efdMax: 3.2, pmin: 0.30, sfc0: 198, tStart: big ? 9 : 6
  };
}
const STD_KVA = [100, 160, 250, 400, 630, 800, 1000, 1250, 1600, 2000];

function mkBrk(id, nm, isl, kind, closed, owner) {
  const b = { id, nm, isl, kind, st: closed ? 'C' : 'O', tmr: 0, stuck: false, failClose: false, lock: false, ops: 0, trips: 0, owner, relays: [], tOpen: 0.06, tClose: 0.08, cause: '', bfT: -1, by: '' };
  S.brks.push(b); S.byId[id] = b; return b;
}
const isClosed = b => b.st === 'C' || b.st === 'OP';

function mkSw(id, nm, isl, closed, kind) {
  const w = { id, nm, isl, kind, closed, tmr: 0, tgt: closed, ops: 0, el: 'sw' };
  S.sws.push(w); S.byId[id] = w; return w;
}

/* ====================== VARIANTI DELLA RETE ======================
   'storico'     : dati originali (poco FV, accumuli solo su alcune isole)
   'rinnovabile' : FV dimensionato perché a mezzogiorno con cielo sereno copra
                   il picco giornaliero di domanda dell'isola; accumulo su ogni isola
                   (potenza ≈ metà del picco, 3 ore di autonomia) per spostare
                   il surplus del mezzogiorno verso la sera */
const NET_CFG = { net: 'rinnovabile' };
function islandPeakKw(d, doy) {
  const keep = S; S = { doy: doy || 222 };
  let pk = 0;
  for (let h = 0; h < 24; h += 0.25) { let L = 0; d.feeders.forEach(f => f.nodes.forEach(n => { for (const k in n.loads) L += n.loads[k] * profile(k, h); })); if (L > pk) pk = L; }
  const sun = sunTimes();
  S = keep;
  return { pk, gmax: sun[2] };
}
function netVariant(base, kind) {
  const net = JSON.parse(JSON.stringify(base));
  if (kind === 'storico') return net;
  net.islands.forEach(d => {
    const { pk, gmax } = islandPeakKw(d, 222);
    /* resa a mezzogiorno con cielo sereno: kWp · G/1000 · 0.86 (perdite) */
    const kwpTarget = pk / (gmax / 1000 * 0.86);
    const nodes = []; d.feeders.forEach(f => f.nodes.forEach(n => { if (!n.motor) nodes.push(n); }));
    const kwpOld = nodes.reduce((a, n) => a + (n.pv || 0), 0);
    if (kwpTarget > kwpOld) {
      const w = nodes.map(n => Object.values(n.loads).reduce((a, v) => a + v, 0)), wt = w.reduce((a, v) => a + v, 0) || 1;
      nodes.forEach((n, k) => { n.pv = Math.max(n.pv || 0, Math.round(kwpTarget * w[k] / wt / 5) * 5); });
    }
    d.pvLegacyKw = kwpOld * 0.28; /* gli impianti nuovi rispettano la CEI 0-21: restano storici solo quelli già esistenti */
    /* accumulo: potenza ≈ 50% del picco, 3 h di autonomia */
    const Pn = Math.max(0.1, Math.round(pk * 0.5 / 50) * 50 / 1000), En = Math.round(Pn * 3 * 10) / 10;
    if (d.bess.length) d.bess.forEach(b => { if (b.Pn < Pn) { b.Pn = Pn; b.En = Math.max(b.En, En); } });
    else d.bess.push({ id: d.id + '.BESS', bus: d.buses[d.buses.length - 1].id, Pn, En, mode: 'GFL' });
  });
  return net;
}

function buildSim(net, seed) {
  S = {
    t: 0, clk: 11.5 * 3600, doy: 222, clkSpeed: 20, slow: 1, paused: false, n: 0, rs: seed || 20250810,
    isl: [], islById: {}, buses: [], busById: {}, br: [], gens: [], bess: [], feeders: [], nodes: [], segs: [], ties: [], brks: [], sws: [], byId: {},
    faults: [], soe: [], areas: [], areaOfBus: {}, settling: false,
    set: { weather: 'variabile', demand: 1.0, randF: 0, sound: false, prot: true, windFrom: 290, windSpd: 40 }, clouds: [], cloudN: 0,
    topoDirty: true, feedDirty: true, slowAcc: 0, secAcc: 0, fastAcc: 0, net
  };
  /* rete nazionale (sorgente ideale) */
  const g = net.grid;
  const rbus = { id: g.id, nm: g.nm, isl: null, grid: true, V: cx(1, 0), Vm: 1, th: 0, f: 50, rocof: 0, live: true, feeders: [], gens: [], bess: [], brs: [], V2: ZERO, V0: ZERO, ll: g.ll };
  S.buses.push(rbus); S.busById[g.id] = rbus; S.byId[g.id] = rbus;
  S.grid = { id: g.id, bus: rbus, E: 1.0, X: 1 / g.scc, nm: g.nm };

  net.islands.forEach(d => {
    const I = {
      id: d.id, nm: d.nm, neutral: d.neutral, micro: !!d.micro, plant: d.plant, buses: [], gens: [], bess: [], feeders: [], nodes: [], segs: [], ties: [],
      com: true, cloud: { k: 1, ev: [], base: 1, tNext: 0 }, ash: 0, el: 'isl'
    };
    S.isl.push(I); S.islById[d.id] = I; S.byId[d.id] = I;
    d.buses.forEach(b => {
      const B = { id: b.id, nm: b.nm, isl: d.id, V: cx(0, 0), Vm: 0, th: 0, thp: 0, f: 0, fm: 0, rocof: 0, live: false, feeders: [], gens: [], bess: [], brs: [], V2: ZERO, V0: ZERO, el: 'bus', lock: false };
      S.buses.push(B); S.busById[b.id] = B; S.byId[b.id] = B; I.buses.push(B);
    });
    (d.couplers || []).forEach(c => {
      const br = { id: c.id, nm: c.nm, kind: 'cpl', a: S.busById[c.a], b: S.busById[c.b], z: cx(1e-5, 2e-4), bsh: 0, mva: c.mva, isl: d.id, el: 'br', I: 0, load: 0, th: 0, Sa: ZERO, Sb: ZERO };
      br.Imax = c.mva * IB; br.brkA = mkBrk(c.id + '.Q', c.nm, d.id, 'cpl', true, br); br.brkB = null;
      S.br.push(br); S.byId[c.id] = br; br.a.brs.push(br); br.b.brs.push(br);
    });
    d.gens.forEach((gd, k) => {
      const p = Object.assign(genDefaults(gd.Pn), gd);
      const G = Object.assign(p, {
        nm: 'GE' + (k + 1) + ' ' + d.nm, short: 'GE' + (k + 1), isl: d.id, bus: S.busById[gd.bus], el: 'gen',
        st: 'FERMO', stT: 0, w: 0, d: 0, Eq: 0.0, Efd: 0, rack: 0, boost: 0, ig: 0, ia: 0, Pe: 0, Qe: 0, Pm: 0, I: ZERO, Ia: 0,
        mode: 'ISO', fref: 50, Pset: 0, Vref: 1.0, auto: true, Tc: 30, Tex: 30, oil: 0, fuel: 0, hours: 2000 + Math.round(rnd() * 30000),
        derate: 1, fault: {}, blocked: false, lastTrip: '', asyn: false, frefTgt: null, pef: 0
      });
      G.brk = mkBrk(G.id + '.Q', 'Interruttore ' + G.short + ' ' + d.nm, d.id, 'gen', false, G);
      S.gens.push(G); S.byId[G.id] = G; I.gens.push(G); G.bus.gens.push(G);
    });
    d.bess.forEach(bd => {
      const B = {
        id: bd.id, nm: 'BESS ' + d.nm, short: 'BESS', isl: d.id, bus: S.busById[bd.bus], el: 'bess', Pn: bd.Pn, En: bd.En, Sn: bd.Pn * 1.1,
        mode: bd.mode, run: true, soc: 70, P: 0, Q: 0, Pset: 0, Qset: 0, Vref: 1.0, Vctl: true,
        Rf: 0.02, dbf: 0.03, Hsyn: 2.0, /* grid-following: droop, banda morta, inerzia sintetica */
        Hv: 2.5, Rv: 0.02, Xv: 0.20, iso: true, ksec: 0.4, /* grid-forming */
        w: 1, d: 0, E: 0, Ev: 0, Pref: 0, xvf: 1, ivi: 0, Esoft: 1, Imax: 1.3, Tcell: 24, cyc: 312, I: ZERO, fault: {}, blocked: false, auto: true, ovT: 0
      };
      B.brk = mkBrk(B.id + '.Q', 'Interruttore BESS ' + d.nm, d.id, 'bess', false, B);
      S.bess.push(B); S.byId[B.id] = B; I.bess.push(B); B.bus.bess.push(B);
    });
    let pvk = 0;
    d.feeders.forEach(fd => {
      const F = {
        id: fd.id, nm: 'Linea ' + fd.nm, short: fd.id.split('.')[1], isl: d.id, bus: S.busById[fd.bus], el: 'fdr', nodes: [], segs: [],
        ufls: fd.ufls, recEn: fd.rec, rec: { st: 'IDLE', t: 0, n: 0 }, Sl: ZERO, Ppv: 0, Vr: 1, I1: ZERO, I2: ZERO, I0: ZERO, Iph: [0, 0, 0], Iamp: 0, P: 0, Q: 0,
        shedBy: '', lastS: 0, I0dir: 0
      };
      F.brk = mkBrk(F.id + '.Q', 'Interruttore ' + F.nm, d.id, 'fdr', true, F);
      S.feeders.push(F); S.byId[F.id] = F; I.feeders.push(F); F.bus.feeders.push(F);
      let up = null, imax = 1e9;
      fd.nodes.forEach((nd, k) => {
        const tot = Object.values(nd.loads).reduce((a, v) => a + v, 0);
        const kva = nd.motor ? 1600 : (STD_KVA.find(v => v >= tot * 1.05) || 2000);
        const N = {
          id: fd.id + '.' + (k + 1), nm: nd.nm, isl: d.id, fd: F, idx: k, ll: nd.ll, xy: projKm(nd.ll), shade: 1, el: 'node', loads: Object.assign({}, nd.loads), pv: nd.pv || 0, kva, zt: 0.05,
          motor: nd.motor ? { st: 'MARCIA', t: 0, soft: false, prog: 1, stallT: 0, Pn: nd.loads.diss } : null,
          V: ZERO, Vm: 0, live: false, Zp: ZERO, path: [], parent: null, sup: null, P: 0, Q: 0, Ppv: 0, Pl: 0, Ql: 0, offT: 0, clpA: 0, x: 1, lvOut: 0, fuse: true, lvBrk: true, Sinr: ZERO
        };
        pvk += N.pv;
        const c = net.cond[nd.t];
        const sg = {
          id: fd.id + '.s' + (k + 1), nm: 'Tratto ' + (up ? up.nm : 'sbarra') + ' – ' + nd.nm, isl: d.id, fd: F, up, dn: N, km: nd.km, t: nd.t, el: 'seg',
          z: cx(c[1] * nd.km / ZB, c[2] * nd.km / ZB), bsh: WB * c[3] * 1e-6 * nd.km * ZB, Imax: c[4], I: 0, If: 0, fpi: { flag: false, lg: false, t: 0, at: 0 }
        };
        sg.sw = k > 0 ? mkSw(sg.id + '.IMS', 'IMS ' + up.nm + ' → ' + nd.nm, d.id, true, 'IMS') : null;
        if (sg.sw) sg.sw.seg = sg;
        N.seg = sg; F.nodes.push(N); F.segs.push(sg); S.nodes.push(N); S.segs.push(sg); I.nodes.push(N); I.segs.push(sg);
        S.byId[N.id] = N; S.byId[sg.id] = sg; up = N; imax = Math.min(imax, c[4]);
      });
      F.Inom = imax;
    });
    (d.ties || []).forEach(t => {
      const c = net.cond[t.t];
      const T = { id: t.id, nm: t.nm, isl: d.id, a: S.byId[t.a], b: S.byId[t.b], km: t.km, t: t.t, z: cx(c[1] * t.km / ZB, c[2] * t.km / ZB), bsh: WB * c[3] * 1e-6 * t.km * ZB, Imax: c[4], I: 0, If: 0, el: 'tie', fpi: { flag: false, lg: false, t: 0, at: 0 } };
      T.sw = mkSw(t.id + '.IMS', 'IMS ' + t.nm, d.id, false, 'NA'); T.sw.tie = T;
      S.ties.push(T); I.ties.push(T); S.byId[T.id] = T;
    });
    /* FV distribuito: gruppi con tarature diverse della protezione di interfaccia */
    const fLeg = d.pvLegacyKw !== undefined && pvk > 0 ? Math.min(0.28, d.pvLegacyKw / pvk) : 0.28;
    I.pv = {
      kwp: pvk, curt: 1, curtEms: 1, irr: 0, P: 0, Pav: 0, Tmod: 25,
      groups: [
        { nm: 'Inverter CEI 0-21 (47.5–51.5 Hz)', frac: 1 - fLeg, fmin: 47.5, fmax: 51.5, vmin: 0.85, vmax: 1.15, tf: 0.1, tv: 0.4, lfsm: true, on: true, rcT: 0, ramp: 1, tripT: 0, why: '' },
        { nm: 'Inverter con tarature storiche (49.7–50.3 Hz)', frac: fLeg, fmin: 49.7, fmax: 50.3, vmin: 0.80, vmax: 1.20, tf: 0.15, tv: 0.2, lfsm: false, on: true, rcT: 0, ramp: 1, tripT: 0, why: '' }
      ]
    };
    /* capacità verso terra della rete MT (per guasti a terra) */
    I.C0 = 0;
    I.segs.concat(I.ties).forEach(s => { const c = net.cond[s.t]; I.C0 += c[3] * s.km; });
    I.coil = { on: d.neutral === 'comp', over: 0.10, loss: 0.04 };
  });
  /* cavi tra isole */
  net.cables.forEach(c => {
    const a = S.busById[c.a], b = S.busById[c.b];
    let z, bsh, Imax;
    if (c.t === 'hv') { z = cx(0.0003, 0.12 / c.mva + 0.0006); bsh = 0; Imax = c.mva * IB; }
    else { const k = net.cond[c.t]; z = cx(k[1] * c.km / ZB, k[2] * c.km / ZB); bsh = WB * k[3] * 1e-6 * c.km * ZB; Imax = k[4]; }
    const br = { id: c.id, nm: c.nm, kind: c.t === 'hv' ? 'hv' : 'cab', a, b, z, bsh, mva: c.mva, Imax, km: c.km, el: 'br', I: 0, load: 0, th: 0, Sa: ZERO, Sb: ZERO, planned: !c.on, isl: b.isl || a.isl };
    br.brkA = mkBrk(c.id + '.QA', c.nm + ' · lato ' + (a.grid ? 'RTN' : a.nm), a.isl || b.isl, 'cab', c.on, br);
    br.brkB = mkBrk(c.id + '.QB', c.nm + ' · lato ' + b.nm, b.isl, 'cab', c.on, br);
    S.br.push(br); S.byId[c.id] = br; a.brs.push(br); b.brs.push(br);
  });
  return S;
}

/* ====================== TOPOLOGIA ELETTRICA (aree sincrone) ====================== */
function brClosed(br) { return isClosed(br.brkA) && (!br.brkB || isClosed(br.brkB)); }
function topology() {
  const par = {}; const find = x => par[x] === x ? x : (par[x] = find(par[x]));
  S.buses.forEach(b => par[b.id] = b.id);
  S.br.forEach(br => { if (brClosed(br)) { const ra = find(br.a.id), rb = find(br.b.id); if (ra !== rb) par[ra] = rb; } });
  const map = {}; const old = S.areas; S.areas = [];
  S.buses.forEach(b => {
    const r = find(b.id);
    if (!map[r]) { map[r] = { buses: [], gens: [], gfm: [], gfl: [], brs: [], grid: false, isl: [], live: false }; S.areas.push(map[r]); }
    const A = map[r]; b.idx = A.buses.length; A.buses.push(b); b.area = A; if (b.grid) A.grid = true;
    if (b.isl && A.isl.indexOf(b.isl) < 0) A.isl.push(b.isl);
  });
  S.br.forEach(br => { if (brClosed(br)) br.a.area.brs.push(br); });
  S.gens.forEach(g => { if (isClosed(g.brk)) g.bus.area.gens.push(g); });
  S.bess.forEach(b => { if (isClosed(b.brk) && b.run && b.mode !== 'OFF') (b.mode === 'GFM' ? b.bus.area.gfm : b.bus.area.gfl).push(b); });
  S.areas.forEach(A => { A.id = A.buses.map(b => b.id).join('+'); const o = old.find(x => x.id === A.id); A.live = o ? o.live : false; A.prevLive = A.live; });
  S.isl.forEach(I => { I.area = I.buses[0].area; });
  S.topoDirty = false; S.feedDirty = true;
}

/* ====================== PROFILI: CARICO, SOLE, NUVOLE ====================== */
function seasonW() { return 0.5 - 0.5 * Math.cos(2 * Math.PI * (S.doy - 15) / 365); }
function sunTimes() { const sw = seasonW(); return [7.25 - 1.35 * sw, 16.95 + 3.3 * sw, 600 + 380 * sw]; }
const hourNow = () => (S.clk / 3600) % 24;
function profile(type, h) {
  const sw = seasonW(), [ri, se] = sunTimes();
  switch (type) {
    case 'res': return (0.40 + 0.22 * gauss(h, 8, 1.6) + 0.13 * gauss(h, 13.5, 1.5) + 0.58 * gauss(h, 21, 2.2) + 0.25 * gauss(h, 24.5, 2) + 0.2 * gauss(h, -2, 2)) * (0.70 + 0.30 * sw);
    case 'tur': return (0.42 + 0.36 * gauss(h, 14.8, 3.2) + 0.55 * gauss(h, 21, 2.6) + 0.2 * gauss(h, 9, 1.5)) * (0.15 + 0.85 * sw);
    case 'com': return Math.min(1.05, 0.15 + 0.62 * gauss(h, 11.5, 2.2) + 0.85 * gauss(h, 19.8, 2.4)) * (0.55 + 0.45 * sw);
    case 'ill': { const k1 = 1 / (1 + Math.exp((h - (ri + 0.3)) * 4)), k2 = 1 / (1 + Math.exp(-(h - (se + 0.3)) * 4)); return Math.min(1, k1 + k2); }
    case 'srv': return (0.72 + 0.22 * gauss(h, 7, 2) + 0.22 * gauss(h, 19, 2.2)) * (0.6 + 0.4 * sw);
    case 'ess': return 0.82 + 0.18 * gauss(h, 11, 3);
    case 'diss': return 1;
  }
  return 1;
}
const WEATHER = {
  sereno: { base: 1.0, rate: 0.004, depth: [0.15, 0.35] },
  variabile: { base: 0.97, rate: 0.05, depth: [0.4, 0.8] },
  coperto: { base: 0.45, rate: 0.06, depth: [0.3, 0.6] },
  temporale: { base: 0.25, rate: 0.12, depth: [0.6, 0.92] }
};
/* ---------------- nuvole mobili (km, proiezione delle mappe) ---------------- */
function projKm(ll) { return [(ll[1] - 11.5) * 88.66971047445352, (37.2 - ll[0]) * 110.57]; }
const CLOUD_BOX = [228, -200, 352, -96];
function addCloud(x, y, r, depth, user) {
  const puffs = [], n = 5 + Math.floor(rnd() * 4);
  for (let i = 0; i < n; i++) { const a = rnd() * 6.283, d = rnd() * 0.55; puffs.push([Math.cos(a) * d, Math.sin(a) * d * 0.7, 0.45 + rnd() * 0.4]); }
  const c = { id: ++S.cloudN, x, y, r: r || 2.5, d: depth === undefined ? 0.75 : depth, user: !!user, puffs, age: 0, grow: user ? 1 : 0 };
  S.clouds.push(c); return c;
}
function cloudAt(x, y) { for (let i = S.clouds.length - 1; i >= 0; i--) { const c = S.clouds[i]; if (Math.hypot(x - c.x, (y - c.y) / 0.75) < c.r) return c; } return null; }
function removeCloud(c) { S.clouds = S.clouds.filter(x => x !== c); }
function windVec() { const to = (S.set.windFrom + 180) * Math.PI / 180; return [Math.sin(to), -Math.cos(to)]; }
function cloudsStep(dt) {
  const W = WEATHER[S.set.weather] || WEATHER.variabile, [ux, uy] = windVec();
  const v = S.set.windSpd / 3600 * dt * S.clkSpeed; /* km percorsi in questo passo (tempo d'orologio) */
  S.clouds.forEach(c => { c.x += ux * v; c.y += uy * v; c.age += dt; if (c.grow < 1) c.grow = Math.min(1, c.grow + dt / 4); });
  S.clouds = S.clouds.filter(c => c.x > CLOUD_BOX[0] - 8 && c.x < CLOUD_BOX[2] + 8 && c.y > CLOUD_BOX[1] - 8 && c.y < CLOUD_BOX[3] + 8);
  /* nuove nubi sopravento, secondo il meteo (frequenza riferita al tempo d'orologio) */
  if (S.clouds.length < 60 && rnd() < W.rate * dt * Math.max(1, S.clkSpeed / 4)) {
    const cx = 290, cy = -150, R = 42, s = (rnd() - 0.5) * 2 * R;
    addCloud(cx - ux * R - uy * s, cy - uy * R + ux * s, 1.2 + rnd() * 3.8, W.depth[0] + rnd() * (W.depth[1] - W.depth[0]));
  }
}
function nodeShade(N) {
  let k = 1;
  for (const c of S.clouds) {
    const dx = (N.xy[0] - c.x) / c.r, dy = (N.xy[1] - c.y) / (c.r * 0.75), d = Math.hypot(dx, dy);
    if (d < 1) { const s = d < 0.55 ? 1 : 1 - (d - 0.55) / 0.45; k *= 1 - c.d * c.grow * s * s * (3 - 2 * s); }
  }
  return k;
}
function cloudStep(I, dt) {
  const W = WEATHER[S.set.weather] || WEATHER.variabile, c = I.cloud;
  let att = 0;
  c.ev = c.ev.filter(e => { e.t += dt; const u = e.t < e.ramp ? e.t / e.ramp : e.t > e.dur - e.ramp ? (e.dur - e.t) / e.ramp : 1; att = Math.max(att, e.d * clamp(u, 0, 1)); return e.t < e.dur; });
  if (I.cvT > 0) { I.cvT -= dt; att = Math.max(att, I.cvD || 0.8); }
  c.base += (W.base - c.base) * dt / 20;
  c.k = clamp(c.base * (1 - att) * (1 - I.ash), 0, 1);
}

/* ====================== RETI MT: energizzazione e load-flow ====================== */
function nodeLoad(N, h, dtc) {
  /* potenza assorbita dalla cabina a 1 pu (kW, kvar) */
  let P = 0, Q = 0;
  const LT = S.net.loadTypes;
  for (const k in N.loads) {
    let kw = N.loads[k] * profile(k, h);
    if (k === 'diss') { const m = N.motor; if (!m || m.st === 'FERMO' || m.st === 'SCATTATO') kw = 0; else if (m.st === 'AVVIAMENTO') kw *= (0.25 + 0.75 * m.prog); }
    const pf = LT[k][1];
    P += kw; Q += kw * Math.tan(Math.acos(pf));
  }
  const m = S.set.demand * N.x * (1 + N.clpA) * (1 - N.lvOut) * (N.fuse && N.lvBrk ? 1 : 0);
  return [P * m, Q * m];
}
function islandFeederSolve(I) {
  const h = hourNow();
  /* 1) energizzazione: visita dai montanti chiusi verso le cabine */
  I.nodes.forEach(N => { N.live2 = false; N.parent = null; N.via = null; N.Zp = ZERO; N.path = []; N.sup = null; N.depth = 0; });
  const q = [];
  I.feeders.forEach(F => {
    F.live = F.bus.live && isClosed(F.brk);
    if (!F.live) return;
    const N = F.nodes[0]; if (N.live2) return;
    N.live2 = true; N.Zp = F.segs[0].z; N.path = [F.brk]; N.sup = F; N.via = F.segs[0]; N.parent = null; N.headBus = F.bus; q.push(N);
  });
  const adj = N => {
    const out = [];
    const F = N.fd, k = N.idx;
    if (k + 1 < F.nodes.length) { const sg = F.segs[k + 1]; out.push([F.nodes[k + 1], sg, sg.sw]); }
    if (k > 0) { const sg = F.segs[k]; out.push([F.nodes[k - 1], sg, sg.sw]); }
    I.ties.forEach(T => { if (T.a === N) out.push([T.b, T, T.sw]); else if (T.b === N) out.push([T.a, T, T.sw]); });
    return out;
  };
  while (q.length) {
    const N = q.shift();
    adj(N).forEach(([M, ed, sw]) => {
      if (M.live2 || (sw && !sw.closed)) return;
      M.live2 = true; M.parent = N; M.via = ed; M.Zp = cadd(N.Zp, ed.z); M.path = N.path.concat(sw ? [sw] : []); M.sup = N.sup; M.headBus = N.headBus; M.depth = N.depth + 1; q.push(M);
    });
  }
  /* 2) carichi, FV, avviamento motori, carico freddo */
  const dtc = DT_SLOW * S.clkSpeed;
  let pvAv = 0, pvP = 0;
  const pvk = pvFactor(I);
  I.nodes.forEach(N => {
    if (!N.live2) { if (N.live) N.offStart = S.t; N.offT += dtc; }
    else if (!N.live) { N.clpA = Math.max(N.clpA, 0.45 * Math.min(1, N.offT / 2700)); N.offT = 0; }
    N.live = N.live2;
    N.clpA *= Math.exp(-dtc / 900);
    N.x += (1 - N.x) * DT_SLOW / 30 + 0.006 * rndn() * Math.sqrt(DT_SLOW);
    N.x = clamp(N.x, 0.85, 1.15);
    const [P, Q] = nodeLoad(N, h, dtc);
    N.Pl = P / 1000; N.Ql = Q / 1000;
    N.shade = nodeShade(N);
    const av = N.pv * pvk.irr * N.shade / 1000 * 0.86 / 1000; /* MW disponibili */
    N.Pav = av; pvAv += av;
    N.Ppv = N.live && N.fuse && N.lvBrk && !N.pvOff ? av * pvk.on * I.pv.curt * Math.min(1, I.pv.curtEms) : 0;
    pvP += N.Ppv;
    /* motore in avviamento: corrente di spunto come impedenza */
    N.Sinr = ZERO;
    const m = N.motor;
    if (m && m.st === 'AVVIAMENTO' && N.live) {
      const kLR = m.soft ? 2.6 : 5.8, prog = m.prog, k = kLR * (1 - Math.pow(prog, 2.5)) + 1 * Math.pow(prog, 2.5);
      const pf = 0.28 + 0.55 * prog, Sm = m.Pn / 1000 / 0.86 * k;
      N.Sinr = cx(Sm * pf - N.Pl * 0, Sm * Math.sin(Math.acos(pf)));
    }
  });
  I.pv.Pav = pvAv; I.pv.P = pvP; I.pv.irr = pvk.irr;
  /* 3) load-flow nodale (tensioni ai nodi) */
  const L = I.nodes.filter(N => N.live);
  const n = L.length;
  I.feeders.forEach(F => { F.SlNew = ZERO; F.PpvNew = 0; F.PpvInjNew = 0; });
  if (n) {
    L.forEach((N, k) => { N.k = k; if (cabs(N.V) < 0.3) N.V = N.headBus.V; });
    const W = luBuf(n), ar = W.ar, ai = W.ai, br0 = W.br, bi0 = W.bi, VR = W.xr, VI = W.xi;
    ar.fill(0); ai.fill(0);
    const IbR = new Float64Array(n), IbI = new Float64Array(n);
    const addE = (a, b, z, bsh) => {
      const d = z.r * z.r + z.i * z.i || 1e-30, yr = z.r / d, yi = -z.i / d, sh = bsh / 2;
      ar[a * n + a] += yr; ai[a * n + a] += yi + sh; ar[b * n + b] += yr; ai[b * n + b] += yi + sh;
      ar[a * n + b] -= yr; ai[a * n + b] -= yi; ar[b * n + a] -= yr; ai[b * n + a] -= yi;
    };
    const heads = [];
    I.feeders.forEach(F => {
      if (!F.live) return;
      const N = F.nodes[0], z = F.segs[0].z, d = z.r * z.r + z.i * z.i || 1e-30, yr = z.r / d, yi = -z.i / d, q = N.k * n + N.k, V0 = F.bus.V;
      ar[q] += yr; ai[q] += yi + F.segs[0].bsh / 2;
      IbR[N.k] += yr * V0.r - yi * V0.i; IbI[N.k] += yr * V0.i + yi * V0.r; heads.push(F);
    });
    I.nodes.forEach(N => { if (!N.live) return; const F = N.fd, k = N.idx; if (k > 0) { const sg = F.segs[k], up = F.nodes[k - 1]; if (sg.sw.closed && up.live) addE(up.k, N.k, sg.z, sg.bsh); } });
    I.ties.forEach(T => { if (T.sw.closed && T.a.live && T.b.live) addE(T.a.k, T.b.k, T.z, T.bsh); });
    /* carico a impedenza costante nella matrice, resto come iniezione */
    L.forEach(N => { const q = N.k * n + N.k; ar[q] += N.Pl + N.Sinr.r; ai[q] += -(N.Ql + N.Sinr.i); });
    luFactor(n, ar, ai, W.piv);
    for (let k = 0; k < n; k++) { VR[k] = L[k].V.r; VI[k] = L[k].V.i; }
    for (let it = 0; it < 3; it++) {
      for (let k = 0; k < n; k++) {
        const N = L[k], vr = VR[k], vi = VI[k], vm = Math.max(Math.hypot(vr, vi), 1e-3), vd = vr * vr + vi * vi || 1e-30;
        let jr = IbR[k], ji = IbI[k];
        if (vm > 0.4) { const Pres = N.Pl * (Math.pow(vm, 1.2) - vm * vm); jr -= Pres * vr / vd; ji -= Pres * vi / vd; }
        if (N.Ppv > 0) { let ir = N.Ppv * vr / vd, ii = N.Ppv * vi / vd; const im = Math.hypot(ir, ii), lim = 1.1 * N.Ppv; if (im > lim) { ir *= lim / im; ii *= lim / im; } jr += ir; ji += ii; }
        br0[k] = jr; bi0[k] = ji;
      }
      luSolve(n, ar, ai, W.piv, br0, bi0, VR, VI);
    }
    L.forEach((N, k) => {
      const vr = VR[k], vi = VI[k], vm = Math.hypot(vr, vi);
      N.V = cx(vr, vi); N.Vm = vm;
      /* potenza FV effettivamente immessa alla tensione calcolata (inverter limitati in corrente a 1,1 In) */
      N.PpvInj = N.Ppv > 0 ? N.Ppv * Math.min(1, 1.1 * vm) : 0;
    });
    /* correnti nei tratti e potenze di testa linea */
    heads.forEach(F => {
      const N = F.nodes[0], sg = F.segs[0];
      const I1 = cadd(cmul(csub(F.bus.V, N.V), cinv(sg.z)), cmul(F.bus.V, cx(0, sg.bsh / 2)));
      const Sh = cmul(F.bus.V, cconj(I1));
      F.SlNew = cadd(Sh, cx(0, 0)); F.Vr = Math.max(F.bus.Vm, 0.05);
    });
  }
  /* quota FV attribuita alla linea che alimenta il nodo (per il modello rapido) */
  I.nodes.forEach(N => { if (N.live && N.sup) { N.sup.PpvNew += N.Ppv; N.sup.PpvInjNew += N.PpvInj || 0; } });
  I.feeders.forEach(F => {
    if (!F.live) { F.Sl = ZERO; F.Ppv = 0; F.P = 0; F.Q = 0; return; }
    /* Sl = assorbimento netto + FV (il FV è trattato a potenza costante nel modello rapido) */
    /* Sl = assorbimento dei carichi alla tensione Vr (testa linea + FV realmente immesso) */
    F.Ppv = F.PpvNew; F.Sl = cadd(F.SlNew, cx(F.PpvInjNew, 0));
  });
  /* correnti nei tratti (per indicatori e sovraccarichi) */
  I.segs.forEach(sg => {
    const a = sg.up ? sg.up : null, b = sg.dn;
    if (!b.live || (sg.sw && !sg.sw.closed) || (a && !a.live)) { sg.I = 0; return; }
    const Va = a ? a.V : (sg.fd.live ? sg.fd.bus.V : ZERO);
    if (!a && !sg.fd.live) { sg.I = 0; return; }
    sg.I = cabs(cmul(csub(Va, b.V), cinv(sg.z))) * IB;
  });
  I.ties.forEach(T => { T.I = T.sw.closed && T.a.live && T.b.live ? cabs(cmul(csub(T.a.V, T.b.V), cinv(T.z))) * IB : 0; });
  I.nodes.forEach(N => { if (!N.live) { N.V = ZERO; N.Vm = 0; } N.load = N.live ? Math.hypot(N.Pl, N.Ql) * 1000 / N.kva : 0; });
  /* FV dell'isola in base ai gruppi di inverter */
}
function pvFactor(I) {
  const [ri, se, gmax] = sunTimes(), h = hourNow();
  const x = (h - ri) / (se - ri);
  const clear = x > 0 && x < 1 ? gmax * Math.pow(Math.sin(Math.PI * x), 1.25) : 0;
  const irr = clear * I.cloud.k;
  let on = 0;
  I.pv.groups.forEach(g => { on += g.frac * (g.on ? g.ramp * (g.lfsmK === undefined ? 1 : g.lfsmK) : 0); });
  return { irr, on };
}

/* ====================== MACCHINE: regolatori e dinamica ====================== */
const RUN_ST = { ACCELERAZIONE: 1, ECCITAZIONE: 1, PRONTO: 1, 'IN PARALLELO': 1, SCARICO: 1, RAFFREDDAMENTO: 1 };
const EXC_ST = { ECCITAZIONE: 1, PRONTO: 1, 'IN PARALLELO': 1, SCARICO: 1 };
function genRunning(G) { return RUN_ST[G.st] === 1; }
/* gruppo fermo, a velocità nulla e separato: solo decadimento del flusso e grandezze termiche
   (stesse equazioni del caso generale, senza regolatori) */
function genStepIdle(G, dt) {
  G.stT += dt;
  const pe = G.Pe / G.Pn;
  G.rack = 0; G.boost *= 0.99; G.Pe = 0; G.Qe = 0; G.I = ZERO; G.Ia = 0;
  G.pef += (pe - G.pef) * dt / 0.4;
  G.boost += (0 - G.boost) * dt / G.tTurbo;
  G.Pm = 0;
  G.d += WB * (G.w - 1) * dt;
  G.Efd = 0; G.Id = 0;
  G.Eq += dt / G.Td0p * (G.Efd - G.Eq);
  if (G.Eq < 0) G.Eq = 0;
  if (S.n % 10) return;
  dt *= 10;
  const tgtT = 30 + (G.fault.cool ? 45 : 0);
  G.Tc += (tgtT - G.Tc) * dt / (G.fault.cool ? 35 : 60);
  G.Tex += (30 - G.Tex) * dt / 8;
  G.oil = Math.max(0, G.oil - dt);
  G.fuel = 0;
}
function genStep(G, dt) {
  if (G.st === 'FERMO' && G.w === 0 && G.brk.st === 'O') return genStepIdle(G, dt);
  const A = G.bus.area, onLine = isClosed(G.brk);
  G.stT += dt;
  const Pn = G.Pn * G.derate;
  const pe = G.Pe / G.Pn;
  /* --- sequenza di avviamento/arresto --- */
  switch (G.st) {
    case 'FERMO': G.w = Math.max(0, G.w - dt / 6); G.rack = 0; G.boost *= 0.99; break;
    case 'PRELUBRIFICAZIONE': G.oil = Math.min(1.5, G.oil + dt); if (G.stT > 3) setGenSt(G, 'AVVIAMENTO'); break;
    case 'AVVIAMENTO':
      G.w = Math.min(0.22, G.w + dt * 0.18);
      if (G.fault.nostart) { if (G.stT > 4) { setGenSt(G, 'FERMO'); G.w = 0; soe(G.isl, G.nm + ': MANCATO AVVIAMENTO (3 tentativi falliti)', 3, G); alarmRaise('nostart.' + G.id, 2, G.nm + ' mancato avviamento', G.isl, G); G.blocked = true; } }
      else if (G.stT > 1.6) { setGenSt(G, 'ACCELERAZIONE'); G.ig = 0.12; G.rack = 0.1; G.frefRamp = 15; }
      break;
    case 'ACCELERAZIONE': G.frefRamp = Math.min(G.fref, (G.frefRamp || 15) + dt * 50 / G.tStart); if (G.w > 0.975 && G.frefRamp >= G.fref - 0.01) setGenSt(G, 'ECCITAZIONE'); break;
    case 'ECCITAZIONE': if (Math.abs(G.Eq * G.w - G.Vref) < 0.02 || G.stT > 6) { setGenSt(G, 'PRONTO'); soe(G.isl, G.nm + ' pronto al parallelo (' + (G.w * 50).toFixed(2) + ' Hz, ' + (G.Eq * G.w * 20).toFixed(2) + ' kV)', 1, G); } break;
    case 'PRONTO': if (onLine) setGenSt(G, 'IN PARALLELO'); break;
    case 'IN PARALLELO': if (!onLine) setGenSt(G, G.stopReq ? 'RAFFREDDAMENTO' : 'PRONTO'); break;
    case 'SCARICO':
      if (!onLine) { setGenSt(G, 'RAFFREDDAMENTO'); break; }
      if (G.Pe < 0.08 * G.Pn || G.stT > 25) { brkCmd(G.brk, 'O', 'arresto programmato (scarico completato)', 'EMS'); }
      break;
    case 'RAFFREDDAMENTO': if (G.stT > 8) setGenSt(G, 'ARRESTO'); break;
    case 'ARRESTO': G.w = Math.max(0, G.w - dt * (0.06 + 0.12 * G.w)); G.rack = 0; if (G.w < 0.01) { G.w = 0; setGenSt(G, 'FERMO'); soe(G.isl, G.nm + ' fermo', 1, G); } break;
  }
  const running = genRunning(G);
  if (!onLine || !G.bus.live) { G.Pe = 0; G.Qe = 0; G.I = ZERO; G.Ia = 0; }
  /* --- regolatore di velocità (PI) con limitatore turbo/fumi --- */
  G.pef += (pe - G.pef) * dt / 0.4; /* potenza elettrica filtrata per ripartizione/statismo */
  if (running) {
    const w = G.w, fr = (G.st === 'ACCELERAZIONE' ? G.frefRamp : G.fref) / 50, pef = G.pef;
    let ep, ei;
    if (G.st === 'RAFFREDDAMENTO') { ep = 1 - w; ei = ep; }
    else if (!onLine || G.st === 'ACCELERAZIONE') { ep = fr - w; ei = ep; }
    else if (G.st === 'SCARICO') { G.unloadTgt = Math.max(0.05, (G.unloadTgt === undefined ? pef : G.unloadTgt) - dt * 0.08); ep = Math.min(0, 1.04 - w) * 5; ei = 0.4 * (G.unloadTgt - pef) + ep; }
    else if (G.mode === 'ISO') { ep = fr - w; ei = (fr - w) + G.kls * ((A.isoShare || 0) - pef); }
    else if (G.mode === 'DROOP') { ep = (fr - w) - G.R * (pef - G.Pset / G.Pn); ei = ep; }
    else { ep = Math.min(0, 1.03 - w) * 6 + Math.max(0, 0.96 - w) * 6; ei = 0.3 * (G.Pset / G.Pn - pef) + ep; }
    if (G.fault.govHunt) ep += 0.07 * Math.sin(2 * Math.PI * 0.55 * S.t);
    const lim = Math.min(1.1 * G.derate * (G.fault.fuel ? G.fault.fuel : 1), 0.45 + 0.7 * G.boost);
    let cmd = G.gkp * ep + G.ig;
    if (G.fault.govStuck) cmd = G.stuckRack;
    const e = ei;
    if (!((cmd >= lim && e > 0) || (cmd <= 0 && e < 0))) G.ig += G.gki * e * dt;
    G.ig = clamp(G.ig, -0.3, 1.2);
    cmd = clamp(cmd, 0, lim);
    G.rack += (cmd - G.rack) * dt / G.tAct;
    G.boost += (G.rack - G.boost) * dt / G.tTurbo;
  } else if (G.st !== 'AVVIAMENTO') { G.rack = 0; G.boost += (0 - G.boost) * dt / G.tTurbo; }
  /* --- dinamica del rotore --- */
  const loss = running ? (0.02 + 0.02 * G.w * G.w) * G.Pn : 0;
  G.Pm = G.rack * G.Pn - loss;
  if (running || G.st === 'ARRESTO') {
    if (G.st !== 'ARRESTO') {
      const wb = onLine && G.bus.live ? (G.bus.fm || 50) / 50 : G.w;
      const Pe = onLine ? G.Pe : 0;
      G.w += dt / (2 * G.H * G.Sn) * (G.Pm - Pe - G.D * G.Sn * (G.w - wb));
    }
  }
  G.d += WB * (G.w - 1) * dt;
  /* --- eccitazione (AVR PI) e decadimento del flusso --- */
  const exc = EXC_ST[G.st] === 1;
  if (exc && !G.fault.lof) {
    const Vt = onLine && G.bus.live ? G.bus.Vm : G.Eq * G.w;
    const e = G.Vref - (onLine ? G.kqd * G.Qe / G.Sn : 0) - Vt;
    let efd = G.avkp * e + G.ia;
    if (!((efd >= G.efdMax && e > 0) || (efd <= 0 && e < 0))) G.ia += G.avki * e * dt;
    G.ia = clamp(G.ia, -1, G.efdMax);
    G.Efd = clamp(efd, 0, G.efdMax);
    if (G.fault.avrRun) G.Efd = G.efdMax;
  } else G.Efd = G.fault.lof && exc ? 0 : 0.03 * G.w;
  const X = G.xdp + G.xt;
  const Id = onLine && G.bus.live ? (G.Eq * G.w - G.bus.Vm * Math.cos(G.d - G.bus.th)) / X : 0;
  G.Id = Id;
  G.Eq += dt / G.Td0p * (G.Efd - G.Eq - (G.xd - G.xdp) * Id);
  G.Eq = Math.max(0.0, G.Eq);
  /* --- grandezze motore (aggiornate ogni 10 ms) --- */
  if (S.n % 10) return;
  dt *= 10;
  const L = clamp(G.Pe / G.Pn, 0, 1.3);
  const tgtT = (G.w > 0.1 ? 68 + 16 * L : 30) + (G.fault.cool ? 45 : 0);
  G.Tc += (tgtT - G.Tc) * dt / (G.fault.cool ? 35 : 60);
  G.Tex += ((G.w > 0.1 ? 260 + 210 * G.rack + (G.fault.cyl ? 60 : 0) : 30) - G.Tex) * dt / 8;
  G.oil = G.w > 0.2 ? (G.fault.oil ? Math.max(0.6, G.oil - dt * 0.3) : 4.2 + 0.6 * G.w) : Math.max(0, G.oil - dt);
  const sfc = G.sfc0 * (0.82 + 0.18 / Math.max(0.12, L));
  G.fuel = G.st === 'FERMO' ? 0 : running && G.Pe > 0 ? G.Pe * 1000 * sfc / 840 : (running ? G.Pn * 1000 * 0.05 * 260 / 840 : 0);
  if (running) G.hours += dt * S.clkSpeed / 3600;
}
function setGenSt(G, st) { G.st = st; G.stT = 0; }

/* inverter di accumulo */
function bessStep(B, dt) {
  const onLine = isClosed(B.brk), bus = B.bus, A = bus.area;
  B.socLimDis = B.soc > 3; B.socLimCh = B.soc < 99;
  const Pmax = B.fault.derate ? B.Pn * 0.5 : B.Pn;
  if (!B.run || B.mode === 'OFF') { B.P = 0; B.Q = 0; B.I = ZERO; }
  if (B.mode === 'GFM' && B.run) {
    /* macchina sincrona virtuale */
    if (onLine && bus.live) {
      const Pref = B.Pref;
      B.w += dt / (2 * B.Hv * B.Sn) * (Pref - B.P - (B.Sn / B.Rv) * (B.w - 1) * 1);
      if (B.iso && A.gens.filter(g => isClosed(g.brk) && g.mode === 'ISO').length === 0 && !A.grid) B.Pref += B.ksec * (1 - B.w) / B.Rv * B.Sn * dt * 2;
      else B.Pref += (B.Pset - B.Pref) * dt / 5;
      B.Pref = clamp(B.Pref, B.socLimCh ? -Pmax : 0, B.socLimDis ? Pmax : 0);
      const ev = B.Vref - 0.03 * B.Q / B.Sn - bus.Vm;
      B.ivi = clamp(B.ivi + 6 * ev * dt, -0.35, 0.35);
      B.Ev = clamp(B.Vref + B.ivi, 0.5, 1.3);
      B.Esoft = Math.min(1, B.Esoft + dt / 1.5);
      B.E = B.Ev * B.Esoft;
    } else { B.w = 1; B.Esoft = onLine ? B.Esoft : 0; B.E = B.Vref; B.d += 0; }
    B.d += WB * (B.w - 1) * dt;
    B.xvf += (1 - B.xvf) * dt / 0.15;
  } else if (B.mode === 'GFL' && B.run && onLine && bus.live) {
    const f = bus.fm || 50, df = f - 50;
    let ffr = 0;
    if (Math.abs(df) > B.dbf) ffr = -(df - Math.sign(df) * B.dbf) / (B.Rf * 50) * B.Pn;
    const inert = -2 * B.Hsyn * (bus.rocof || 0) / 50 * B.Pn;
    let Pc = B.Pset + ffr + clamp(inert, -0.5 * B.Pn, 0.5 * B.Pn);
    Pc = clamp(Pc, B.socLimCh ? -Pmax : 0, B.socLimDis ? Pmax : 0);
    B.P += (Pc - B.P) * dt / 0.12;
    let Qc = B.Qset + (B.Vctl ? clamp(8 * (B.Vref - bus.Vm), -1, 1) * B.Pn * 0.6 : 0);
    const qmax = Math.sqrt(Math.max(0, B.Sn * B.Sn - B.P * B.P));
    B.Q += (clamp(Qc, -qmax, qmax) - B.Q) * dt / 0.1;
  }
  /* energia (scala dei tempi dell'orologio) */
  const dth = dt * S.clkSpeed / 3600;
  if (B.P > 0) B.soc -= B.P / 0.95 * dth / B.En * 100; else B.soc -= B.P * 0.95 * dth / B.En * 100;
  B.soc = clamp(B.soc, 0, 100);
  B.cyc += Math.abs(B.P) * dth / (2 * B.En);
  B.Tcell += ((24 + 14 * Math.abs(B.P) / B.Pn + (B.fault.hot ? 30 : 0)) - B.Tcell) * dt / 45;
}

/* ====================== SOLUZIONE RAPIDA DELLA RETE (per area) ====================== */
function busLoadInto(bus, out) {
  /* somma dei montanti: carico (Sl a Vr) e FV (potenza costante) */
  let P = 0, Q = 0, Ppv = 0, Vr = 1, n = 0;
  for (const F of bus.feeders) if (F.live && isClosed(F.brk)) { P += F.Sl.r; Q += F.Sl.i; Ppv += F.Ppv; Vr = F.Vr; n++; }
  /* servizi ausiliari di centrale */
  let aux = 0; for (const g of bus.gens) if (genRunning(g)) aux += 0.012 * g.Pn;
  bus.auxP = aux;
  out.P = P + aux; out.Q = Q + aux * 0.6; out.Ppv = Ppv; out.Vr = n ? Vr : 1;
  return out;
}
function busLoad(bus) { return busLoadInto(bus, {}); }
function areaSolve(A, dt) {
  const k = A.buses.length;
  let hasSrc = A.grid || A.gfm.length > 0;
  if (!hasSrc) for (const g of A.gens) if (genRunning(g) || g.st === 'ARRESTO' || g.Eq * g.w > 0.01) { hasSrc = true; break; }
  if (!hasSrc) { areaDead(A); return; }
  /* sola rete nazionale (nessuna isola collegata): tensione imposta, nulla da risolvere */
  if (A.grid && k === 1 && !A.gens.length && !A.gfm.length && !A.gfl.length && !S.faults.some(f => f.on && f.bus === A.buses[0])) {
    const b = A.buses[0]; b.V = cx(S.grid.E, 0); b.Vm = S.grid.E; b.th = 0; b.f = 50; b.fm = 50; b.live = true; b.loadP = 0; b.V2 = ZERO; b.V0 = ZERO;
    S.grid.P = 0; S.grid.Q = 0; S.grid.I = ZERO; S.grid.Ia = 0; A.live = true; A.flt = []; A.f = 50; return;
  }
  /* matrice delle ammettenze su array piatti */
  const W = luBuf(k), ar = W.ar, ai = W.ai, br0 = W.br, bi0 = W.bi;
  ar.fill(0); ai.fill(0);
  const IbR = A._ibr && A._ibr.length === k ? A._ibr : (A._ibr = new Float64Array(k)), IbI = A._ibi && A._ibi.length === k ? A._ibi : (A._ibi = new Float64Array(k));
  IbR.fill(0); IbI.fill(0);
  for (const br of A.brs) {
    const a = br.a.idx, b = br.b.idx, zr = br.z.r, zi = br.z.i, zd = zr * zr + zi * zi, yr = zr / zd, yi = -zi / zd, sh = br.bsh / 2;
    ar[a * k + a] += yr; ai[a * k + a] += yi + sh; ar[b * k + b] += yr; ai[b * k + b] += yi + sh;
    ar[a * k + b] -= yr; ai[a * k + b] -= yi; ar[b * k + a] -= yr; ai[b * k + a] -= yi;
  }
  /* sorgenti di tensione: macchine, rete, inverter grid-forming (ammettenza puramente reattiva y = -j/X) */
  const src = [];
  const addSrc = (m, i, X, Em, Ea) => {
    const yi = -1 / X, Er = Em * Math.cos(Ea), Ei = Em * Math.sin(Ea);
    ai[i * k + i] += yi; IbR[i] += -Ei * yi; IbI[i] += Er * yi;
    src.push([m, cx(0, yi), cx(Er, Ei)]);
  };
  for (const g of A.gens) addSrc(g, g.bus.idx, (g.xdp + g.xt) / g.Sn, g.Eq * Math.max(g.w, 0), g.d);
  if (A.grid) addSrc(S.grid, S.grid.bus.idx, S.grid.X, S.grid.E, 0);
  for (const b of A.gfm) addSrc(b, b.bus.idx, b.Xv * b.xvf / b.Sn, b.E, b.d);
  /* guasti alimentati */
  A.flt = S.faults.length ? S.faults.filter(f => f.on && f.bus && f.bus.area === A) : NOFLT;
  for (const f of A.flt) { f.y = faultAdm(f, A); if (f.y) { const i = f.bus.idx; ar[i * k + i] += f.y.r; ai[i * k + i] += f.y.i; } }
  /* carichi */
  const LD = A._ld && A._ld.length === k ? A._ld : (A._ld = A.buses.map(() => ({ P: 0, Q: 0, Ppv: 0, Vr: 1 })));
  for (let i = 0; i < k; i++) {
    const bus = A.buses[i], L = LD[i];
    if (bus.grid) { L.P = 0; L.Q = 0; L.Ppv = 0; L.Vr = 1; }
    else busLoadInto(bus, L);
    const v2 = L.Vr * L.Vr; ar[i * k + i] += L.P / v2; ai[i * k + i] += -L.Q / v2;
  }
  luFactor(k, ar, ai, W.piv);
  const VR = A._vr && A._vr.length === k ? A._vr : (A._vr = new Float64Array(k)), VI = A._vi && A._vi.length === k ? A._vi : (A._vi = new Float64Array(k));
  if (!A.live) { const s0 = src[0]; const m = s0 ? Math.max(0.05, cabs(s0[2])) : 1, an = s0 ? carg(s0[2]) : 0; for (let i = 0; i < k; i++) { VR[i] = m * Math.cos(an); VI[i] = m * Math.sin(an); } }
  else for (let i = 0; i < k; i++) { const b = A.buses[i], v = b.V; if (cabs(v) > 0.2) { VR[i] = v.r; VI[i] = v.i; } else { const th = b.th || 0; VR[i] = Math.cos(th); VI[i] = Math.sin(th); } }
  for (let it = 0; it < 3; it++) {
    for (let i = 0; i < k; i++) {
      const L = LD[i], vr = VR[i], vi = VI[i], vm = Math.max(Math.hypot(vr, vi), 1e-4), vd = vr * vr + vi * vi || 1e-30, bus = A.buses[i];
      let jr = IbR[i], ji = IbI[i];
      if (L.P > 0 && vm > 0.3) {
        const fr = 1 + 1.6 * ((bus.fm || 50) - 50) / 50, u = vm / L.Vr;
        const Pres = L.P * (Math.pow(u, 1.2) * fr - u * u);
        /* conj(Pres / v) = Pres * v / |v|^2 */
        jr -= Pres * vr / vd; ji -= Pres * vi / vd;
      }
      if (L.Ppv > 0 && vm > 0.05) {
        let ir = L.Ppv * vr / vd, ii = L.Ppv * vi / vd; const m = Math.hypot(ir, ii), lim = 1.1 * L.Ppv;
        if (m > lim) { ir *= lim / m; ii *= lim / m; }
        jr += ir; ji += ii;
      }
      if (vm >= 0.05) for (const b of bus.bess) {
        if (b.mode !== 'GFL' || !b.run || !isClosed(b.brk)) continue;
        /* conj((P + jQ) / v) */
        let ir = (b.P * vr + b.Q * vi) / vd, ii = (b.P * vi - b.Q * vr) / vd; const m = Math.hypot(ir, ii), lim = 1.2 * b.Sn;
        if (m > lim) { ir *= lim / m; ii *= lim / m; }
        jr += ir; ji += ii;
      }
      br0[i] = jr; bi0[i] = ji;
    }
    luSolve(k, ar, ai, W.piv, br0, bi0, VR, VI);
  }
  const V = new Array(k); for (let i = 0; i < k; i++) V[i] = cx(VR[i], VI[i]);
  /* uscite */
  /* l'area è in tensione se almeno una sorgente ha forza elettromotrice (anche con tensione collassata da un guasto) */
  const emf = Math.max.apply(null, src.map(s => cabs(s[2])));
  A.live = emf > 0.12;
  if (!A.live) { areaDead(A); return; }
  A.buses.forEach((b, i) => {
    const v = V[i]; b.V = v; b.Vm = cabs(v);
    const th = carg(v);
    if (!b.live) { b.thp = th; b.f = srcFreq(A); b.fm = b.f; b.live = true; }
    else if (b.Vm < 0.15) { b.thp = th; /* misura di frequenza bloccata a bassa tensione */ }
    else {
      const dth = wrapPi(th - b.thp); b.thp = th;
      const fi = 50 + dth / (2 * Math.PI * dt);
      b.f += (clamp(fi, 40, 60) - b.f) * dt / 0.02;
      b.fm += (b.f - b.fm) * dt / 0.06;
    }
    if (b.grid) { b.f = 50; b.fm = 50; }
    /* frequenza per le protezioni di interfaccia (finestra di misura ≈ 150 ms, insensibile ai salti di fase) */
    b.fs = b.fs > 1 ? b.fs + (b.fm - b.fs) * dt / 0.15 : b.fm;
    b.th = th; b.live = true;
    b.loadP = LD[i].P - LD[i].Ppv;
  });
  /* correnti di macchina: I = (E - V)·y con y = j·yi; S = V·conj(I) */
  for (let q = 0; q < src.length; q++) {
    const m = src[q][0], yi = src[q][1].i, E = src[q][2], V = m.bus.V;
    const dr = E.r - V.r, di = E.i - V.i, Ir = -di * yi, Ii = dr * yi;
    const I = cx(Ir, Ii), P = V.r * Ir + V.i * Ii, Q = V.i * Ir - V.r * Ii, Im = Math.hypot(Ir, Ii);
    m.I = I; m.Ia = Im * IB;
    if (m === S.grid) { m.P = P; m.Q = Q; continue; }
    if (m.el === 'gen') { m.Pe = P; m.Qe = Q; }
    else { m.P = P; m.Q = Q; const Ipu = Im / m.Sn; if (Ipu > m.Imax) m.xvf = Math.min(20, m.xvf * (1 + 4 * (Ipu / m.Imax - 1) * 0.02 + 0.01)); }
  }
  for (const b of A.gfl) { const ib = cconj(cdiv(cx(b.P, b.Q), b.bus.Vm > 0.05 ? b.bus.V : cx(1, 0))); b.I = ib; b.Ia = cabs(ib) * IB; }
  /* rami */
  for (const br of A.brs) {
    const zr = br.z.r, zi = br.z.i, zd = zr * zr + zi * zi, yr = zr / zd, yi = -zi / zd, sh = br.bsh / 2, Va = br.a.V, Vb = br.b.V;
    const dr = Va.r - Vb.r, di = Va.i - Vb.i;
    const iar = dr * yr - di * yi - Va.i * sh, iai = dr * yi + di * yr + Va.r * sh;
    const ibr = -dr * yr + di * yi - Vb.i * sh, ibi = -dr * yi - di * yr + Vb.r * sh;
    br.Iph = cx(iar, iai); br.I = Math.hypot(iar, iai) * IB;
    br.Sa = cx(Va.r * iar + Va.i * iai, Va.i * iar - Va.r * iai); br.Sb = cx(Vb.r * ibr + Vb.i * ibi, Vb.i * ibr - Vb.r * ibi);
    br.load = br.I / br.Imax;
  }
  /* correnti di guasto e sequenze */
  for (const b of A.buses) { b.V2 = ZERO; b.V0 = ZERO; }
  for (const f of A.flt) faultCurrents(f, A);
  /* frequenza media d'area */
  A.f = A.buses.reduce((a, b) => a + b.fm, 0) / k;
}
function srcFreq(A) { if (A.grid) return 50; const g = A.gens.find(x => genRunning(x)); if (g) return g.w * 50; const b = A.gfm[0]; return b ? b.w * 50 : 50; }
function areaDead(A) {
  A.live = false; A.flt = [];
  A.buses.forEach(b => { if (b.grid) return; b.V = ZERO; b.Vm = 0; b.f = 0; b.fm = 0; b.fs = 0; b.rocof = 0; b.live = false; b.V2 = ZERO; b.V0 = ZERO; });
  A.gens.forEach(g => { g.Pe = 0; g.Qe = 0; g.I = ZERO; g.Ia = 0; });
  A.gfm.concat(A.gfl).forEach(b => { b.P = 0; b.Q = 0; b.I = ZERO; b.Ia = 0; });
  A.brs.forEach(br => { br.I = 0; br.Sa = ZERO; br.Sb = ZERO; br.load = 0; br.Iph = ZERO; });
}
/* impedenza di sequenza inversa vista dalla sbarra (macchine rotanti) */
function z2th(A) {
  let y = cx(0, 0);
  A.gens.forEach(g => { if (genRunning(g)) y = cadd(y, cx(0, -g.Sn / (g.x2 + g.xt))); });
  if (A.grid) y = cadd(y, cx(0, -1 / S.grid.X));
  if (y.r === 0 && y.i === 0) return null;
  return cinv(y);
}

/* ====================== PASSO DI SIMULAZIONE ====================== */
function fastStep(dt) {
  S.t += dt; S.n++;
  if (S.topoDirty) topology();
  for (const g of S.gens) genStep(g, dt);
  for (const b of S.bess) bessStep(b, dt);
  /* quote di ripartizione isocrona per area */
  for (const A of S.areas) {
    let p = 0, pn = 0; for (const g of A.gens) if (g.mode === 'ISO' && g.st === 'IN PARALLELO') { p += g.pef * g.Pn; pn += g.Pn; }
    A.isoShare = pn > 0 ? p / pn : 0;
  }
  faultsEnergize();
  for (const A of S.areas) areaSolve(A, dt);
  /* rocof (finestra 100 ms) */
  if (S.n % 20 === 0) S.buses.forEach(b => { const fp = b.fPrev === undefined ? b.fm : b.fPrev; b.rocof += (((b.fm - fp) / 0.02) - b.rocof) * 0.2; b.fPrev = b.fm; });
  feederFast();
  if (typeof protStep === 'function') protStep(dt);
  brkStep(dt);
  if (typeof recStep === 'function') recStep();
  if (S.n % 10 === 0) { if (typeof asynFast === 'function') asynFast(0.01); if (typeof trendFast === 'function') trendFast(); }
  S.slowAcc += dt; if (S.slowAcc >= DT_SLOW - 1e-9) { S.slowAcc = 0; slowStep(DT_SLOW); }
  S.secAcc += dt; if (S.secAcc >= 0.2 - 1e-9) { S.secAcc = 0; if (typeof ctrlStep === 'function') ctrlStep(0.2); }
}
/* correnti di testa linea nel passo rapido (carico + guasti a valle) */
function feederFast() {
  const fl = S.faults;
  for (const F of S.feeders) {
    const b = F.bus;
    if (!isClosed(F.brk) || !b.live) { if (F.Iamp !== 0 || F.P !== 0) { F.I1 = ZERO; F.I2 = ZERO; F.I0 = ZERO; F.Iph = [0, 0, 0]; F.Iamp = 0; F.P = 0; F.Q = 0; } else F.I0 = ZERO; continue; }
    const u = b.Vm / (F.Vr || 1), fr = 1 + 1.6 * ((b.fm || 50) - 50) / 50;
    /* FV a potenza costante ma con corrente limitata a 1,1 In: a tensione bassa la potenza cala */
    const Sr = F.Sl.r * Math.pow(u, 1.2) * fr - F.Ppv * Math.min(1, 1.1 * b.Vm), Si = F.Sl.i * u * u;
    const vr = b.V.r, vi = b.V.i, vd = vr * vr + vi * vi || 1e-30;
    /* I1 = conj(S / V) */
    let i1r = 0, i1i = 0, i2r = 0, i2i = 0;
    if (b.Vm > 0.05) { i1r = (Sr * vr + Si * vi) / vd; i1i = (Sr * vi - Si * vr) / vd; }
    for (let k = 0; k < fl.length; k++) { const f = fl[k]; if (f.on && f.fd === F && f.I1) { i1r += f.I1.r; i1i += f.I1.i; if (f.I2) { i2r += f.I2.r; i2i += f.I2.i; } } }
    /* corrente omopolare: capacitiva propria oppure guasto a terra a valle */
    const I0 = F.I0f || ZERO;
    F.I1 = cx(i1r, i1i); F.I2 = i2r || i2i ? cx(i2r, i2i) : ZERO; F.I0 = I0;
    /* correnti di fase: Ia = I0+I1+I2, Ib = I0+a²I1+aI2, Ic = I0+aI1+a²I2 */
    const ar = AOP.r, ai = AOP.i, br2 = AOP2.r, bi2 = AOP2.i;
    const xa = I0.r + i1r + i2r, ya = I0.i + i1i + i2i;
    const xb = I0.r + (br2 * i1r - bi2 * i1i) + (ar * i2r - ai * i2i), yb = I0.i + (br2 * i1i + bi2 * i1r) + (ar * i2i + ai * i2r);
    const xc = I0.r + (ar * i1r - ai * i1i) + (br2 * i2r - bi2 * i2i), yc = I0.i + (ar * i1i + ai * i1r) + (br2 * i2i + bi2 * i2r);
    const A1 = Math.hypot(xa, ya) * IB, B1 = Math.hypot(xb, yb) * IB, C1 = Math.hypot(xc, yc) * IB;
    const ph = F.Iph; ph[0] = A1; ph[1] = B1; ph[2] = C1;
    F.Iamp = Math.max(A1, B1, C1);
    /* S = V · conj(I1) */
    F.P = vr * i1r + vi * i1i; F.Q = vi * i1r - vr * i1i;
  }
}
function slowStep(dt) {
  if (!S.settling) S.clk += dt * S.clkSpeed;
  if (S.clk >= 86400) { S.clk -= 86400; S.doy = S.doy % 365 + 1; }
  cloudsStep(dt);
  S.isl.forEach(I => { cloudStep(I, dt); pvGroupsStep(I, dt); });
  S.isl.forEach(I => islandFeederSolve(I));
  S.sws.forEach(w => { if (w.tmr > 0) { w.tmr -= dt; if (w.tmr <= 0) { w.tmr = 0; w.closed = w.tgt; S.feedDirty = true; soe(w.isl, w.nm + (w.closed ? ' CHIUSO' : ' APERTO'), 1, w); } } });
  S.nodes.forEach(N => motorStep(N, dt));
  if (typeof faultsSlow === 'function') faultsSlow(dt);
}
/* gruppi FV: protezione di interfaccia (SPI), LFSM-O e riconnessione */
function pvGroupsStep(I, dt) {
  const bus = I.buses[0], f = bus.fs || bus.fm, v = bus.Vm, live = bus.live;
  I.pv.groups.forEach(g => {
    if (I.pv.opOff) { if (g.on) { g.on = false; g.ramp = 0; g.why = 'comando operatore'; } g.rcT = 0; return; }
    if (g.on) {
      let why = '';
      if (!live) why = 'mancanza tensione';
      else if (v > 0.5 && f > g.fmax) why = 'f > ' + g.fmax + ' Hz';
      else if (v > 0.5 && f < g.fmin) why = 'f < ' + g.fmin + ' Hz';
      else if (v < g.vmin) why = 'V < ' + g.vmin + ' pu';
      else if (v > g.vmax) why = 'V > ' + g.vmax + ' pu';
      if (why) { g.tripT += dt; if (g.tripT >= (why.startsWith('V') ? g.tv : g.tf) || !live) { g.on = false; g.ramp = 0; g.rcT = 0; g.why = why; if (I.pv.Pav > 0.002 && !S.settling) soe(I.id, 'SPI FV ' + I.nm + ': distacco ' + g.nm + ' (' + why + ')', 2, I); } }
      else g.tripT = 0;
      if (g.lfsm) { g.lfsmK = f > 50.2 ? clamp(1 - (f - 50.2) / (0.024 * 50), 0, 1) : Math.min(1, (g.lfsmK === undefined ? 1 : g.lfsmK) + dt * 0.1); }
      if (g.on && g.ramp < 1) g.ramp = Math.min(1, g.ramp + dt / 25);
    } else {
      if (live && f > 49.9 && f < 50.1 && v > 0.9 && v < 1.1) { g.rcT += dt; if (g.rcT > 20) { g.on = true; g.ramp = 0; g.tripT = 0; if (I.pv.Pav > 0.002) soe(I.id, 'FV ' + I.nm + ': riconnessione ' + g.nm + ' (rampa)', 1, I); } }
      else g.rcT = 0;
    }
  });
}
/* avviamento motori (dissalatore) */
function motorStep(N, dt) {
  const m = N.motor; if (!m) return;
  if (!N.live && m.st !== 'FERMO' && m.st !== 'SCATTATO') { m.st = 'SCATTATO'; m.why = 'mancanza tensione'; soe(N.isl, 'Motori ' + N.nm + ': arresto per mancanza tensione', 2, N); return; }
  if (m.st === 'AVVIAMENTO') {
    const v = N.Vm;
    const acc = (v * v - 0.3) / (m.soft ? 7 : 2.6);
    if (acc <= 0) { m.stallT += dt; if (m.stallT > 2.5) { m.st = 'SCATTATO'; m.why = 'stallo per bassa tensione'; soe(N.isl, 'Motori ' + N.nm + ': SCATTO protezione 48/51LR (avviamento prolungato, V=' + v.toFixed(2) + ' pu)', 3, N); } }
    else { m.stallT = Math.max(0, m.stallT - dt); m.prog = Math.min(1, m.prog + acc * dt); if (m.prog >= 1) { m.st = 'MARCIA'; soe(N.isl, 'Motori ' + N.nm + ': avviamento completato', 1, N); } }
  }
}
