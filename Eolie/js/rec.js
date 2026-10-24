'use strict';
/* =====================================================================
   REGISTRATORE: fasori di sequenza a 1 kHz (per oscilloscopio),
   oscilloperturbografo (registrazioni su evento), trend rapidi e lenti
   ===================================================================== */
const REC_N = 4096;
/* ogni segnale scrive 6 valori: Re/Im delle sequenze diretta, inversa, omopolare (kV o A efficaci di fase) */
function W3(b, o, a, c, z, k) {
  b[o] = a.r * k; b[o + 1] = a.i * k;
  if (c) { b[o + 2] = c.r * k; b[o + 3] = c.i * k; } else { b[o + 2] = 0; b[o + 3] = 0; }
  if (z) { b[o + 4] = z.r * k; b[o + 5] = z.i * k; } else { b[o + 4] = 0; b[o + 5] = 0; }
}
function W0(b, o) { b[o] = 0; b[o + 1] = 0; b[o + 2] = 0; b[o + 3] = 0; b[o + 4] = 0; b[o + 5] = 0; }
function sigBus(I, bs) { return [{ id: bs.id + '.V', nm: 'Tensione ' + bs.nm, isl: I.id, kind: 'V', el: bs, h: [0.012, 0.008], w: (b, o) => W3(b, o, bs.V, bs.V2, bs.V0, VPH) }]; }
function sigGen(I, G) {
  return [{ id: G.id + '.VM', nm: G.short + ' tensione lato macchina', isl: I.id, kind: 'V', el: G, h: [0.006, 0.004], w: (b, o) => {
    if (devClosed(G.brk) && G.bus.live) W3(b, o, G.bus.V, G.bus.V2, null, VPH);
    else { const m = G.Eq * G.w * VPH; b[o] = m * Math.cos(G.d); b[o + 1] = m * Math.sin(G.d); b[o + 2] = 0; b[o + 3] = 0; b[o + 4] = 0; b[o + 5] = 0; }
  } }, { id: G.id + '.I', nm: G.short + ' corrente', isl: I.id, kind: 'I', el: G, h: [0.015, 0.01], w: (b, o) => {
    if (!(devClosed(G.brk) && G.bus.live)) return W0(b, o);
    const v2 = G.bus.V2, k = G.Sn / (G.x2 + G.xt) * IB;
    b[o] = G.I.r * IB; b[o + 1] = G.I.i * IB;
    /* i2 = -V2 / (j X2) = j V2 / X2 */
    b[o + 2] = v2 ? -v2.i * k : 0; b[o + 3] = v2 ? v2.r * k : 0; b[o + 4] = 0; b[o + 5] = 0;
  } }];
}
function sigBess(I, B) { return [{ id: B.id + '.I', nm: B.short + ' corrente', isl: I.id, kind: 'I', el: B, h: [0.025, 0.015], w: (b, o) => { if (devClosed(B.brk) && B.bus.live && B.I) W3(b, o, B.I, null, null, IB); else W0(b, o); } }]; }
function sigFdr(I, F) { return [{ id: F.id + '.I', nm: F.short + ' ' + F.nm.replace('Linea ', '') + ' corrente', isl: I.id, kind: 'I', el: F, h: [0.06, 0.035], w: (b, o) => W3(b, o, F.I1, F.I2, F.I0, IB) }]; }
function sigBr(br) { return [{ id: br.id + '.I', nm: br.nm + ' corrente', isl: br.kind === 'hv' ? br.b.isl : br.a.isl || br.b.isl, kind: 'I', el: br, h: [0.02, 0.01], w: (b, o) => { if (brClosed(br) && br.Iph) W3(b, o, br.Iph, null, null, IB); else W0(b, o); } }]; }
function recSignals() {
  const L = [];
  S.isl.forEach(I => {
    I.buses.forEach(bs => L.push(...sigBus(I, bs)));
    I.gens.forEach(G => L.push(...sigGen(I, G)));
    I.bess.forEach(B => L.push(...sigBess(I, B)));
    I.feeders.forEach(F => L.push(...sigFdr(I, F)));
  });
  S.br.forEach(br => L.push(...sigBr(br)));
  return L;
}
/* componenti aggiunti o dismessi durante la partita (modalità Gestione) */
function recAddEl(el) {
  const R = S.rec; if (!R) return;
  const I = S.islById[el.isl];
  const L = el.el === 'gen' ? sigGen(I, el) : el.el === 'bess' ? sigBess(I, el) : el.el === 'br' ? sigBr(el) : [];
  L.forEach(sg => { sg.buf = new Float32Array(REC_N * 6); R.sigs.push(sg); R.byId[sg.id] = sg; });
  if (el.el === 'gen' && S.tf) ['P', 'Q', 'w'].forEach(k => { S.tf.ser[el.id + '.' + k] = new Float32Array(TF_N); });
}
function recRemoveEl(el) {
  const R = S.rec; if (!R) return;
  R.sigs = R.sigs.filter(sg => { if (sg.el === el) { delete R.byId[sg.id]; return false; } return true; });
}
function recReset() {
  S.rec = { idx: 0, n: 0, t: new Float64Array(REC_N), sigs: recSignals(), pend: [], recs: [], recN: 0 };
  S.rec.sigs.forEach(s => { s.buf = new Float32Array(REC_N * 6); });
  S.rec.byId = {}; S.rec.sigs.forEach(s => S.rec.byId[s.id] = s);
  trendReset();
}
function recStep() {
  const R = S.rec; if (!R) return;
  const i = R.idx;
  R.t[i] = S.t;
  const o = i * 6;
  for (const s of R.sigs) s.w(s.buf, o);
  R.idx = (i + 1) % REC_N; R.n = Math.min(REC_N, R.n + 1);
  /* chiusura delle registrazioni pendenti */
  if (R.pend.length && S.t >= R.pend[0].tEnd) { const p = R.pend.shift(); recCapture(p); }
}
function triggerRec(isl, label) {
  const R = S.rec; if (!R || S.settling) return;
  if (isl && isl.id) isl = isl.id;
  const last = R.pend.find(p => p.isl === isl);
  if (last) { if (last.labels.indexOf(label) < 0 && last.labels.length < 4) last.labels.push(label); return; }
  R.pend.push({ isl, labels: [label], tTrig: S.t, tEnd: S.t + 1.4, clk: S.clk });
  R.pend.sort((a, b) => a.tEnd - b.tEnd);
}
function recCapture(p) {
  const R = S.rec, pre = 0.45, n = Math.min(R.n, Math.round((p.tEnd - p.tTrig + pre) / DT));
  const I = S.islById[p.isl];
  const areaIsl = I && I.area ? I.area.isl : [p.isl];
  const sigs = R.sigs.filter(s => areaIsl.indexOf(s.isl) >= 0 || s.isl === p.isl);
  const end = (R.idx - 1 + REC_N) % REC_N;
  const rec = { id: ++R.recN, isl: p.isl, label: p.labels.join(' · '), clk: p.clk, tTrig: p.tTrig, t0: R.t[(end - n + 1 + REC_N) % REC_N], n, sigs: [] };
  sigs.forEach(s => {
    const d = new Float32Array(n * 6);
    for (let k = 0; k < n; k++) { const j = ((end - n + 1 + k) % REC_N + REC_N) % REC_N; for (let c = 0; c < 6; c++) d[k * 6 + c] = s.buf[j * 6 + c]; }
    rec.sigs.push({ id: s.id, nm: s.nm, kind: s.kind, h: s.h, isl: s.isl, data: d });
  });
  R.recs.unshift(rec); if (R.recs.length > 12) R.recs.pop();
  soe(p.isl, 'Oscilloperturbografo: registrazione #' + rec.id + ' acquisita (' + rec.label + ')', 1, null);
}
/* lettura di un campione dal buffer circolare (o da una registrazione) */
function recSrc(sigId, recId) {
  const R = S.rec;
  if (recId) {
    const rec = R.recs.find(r => r.id === recId); if (!rec) return null;
    const s = rec.sigs.find(x => x.id === sigId); if (!s) return null;
    return { kind: s.kind, h: s.h, n: rec.n, t0: rec.t0, get: (k, c) => s.data[k * 6 + c], nm: s.nm };
  }
  const s = R.byId[sigId]; if (!s) return null;
  const n = R.n, start = (R.idx - n + REC_N) % REC_N, t0 = R.t[start];
  return { kind: s.kind, h: s.h, n, t0, get: (k, c) => s.buf[((start + k) % REC_N) * 6 + c], nm: s.nm };
}

/* ---------------- trend ---------------- */
const TF_N = 6000, TS_N = 1440;
function trendReset() {
  S.tf = { idx: 0, n: 0, t: new Float64Array(TF_N), ser: {} };
  S.ts = { idx: 0, n: 0, clk: new Float64Array(TS_N), ser: {}, acc: 0 };
  const add = (o, k, N) => { o.ser[k] = new Float32Array(N); };
  S.isl.forEach(I => {
    ['f', 'V', 'L', 'D', 'PV', 'B', 'SOC'].forEach(k => { add(S.tf, I.id + '.' + k, TF_N); add(S.ts, I.id + '.' + k, TS_N); });
    I.gens.forEach(G => { add(S.tf, G.id + '.P', TF_N); add(S.tf, G.id + '.Q', TF_N); add(S.tf, G.id + '.w', TF_N); });
  });
}
function islSample(I) {
  const b = I.buses[0];
  let D = 0; I.gens.forEach(G => { if (G.st === 'IN PARALLELO') D += G.Pe; });
  let B = 0, soc = 0; I.bess.forEach(x => { B += x.P; soc = x.soc; });
  let L = 0; I.nodes.forEach(N => { if (N.live) L += N.Pl; });
  return { f: b.live ? b.fm : 0, V: b.Vm, L, D, PV: I.pv.P, B, SOC: soc };
}
function trendFast() {
  const T = S.tf; if (!T) return;
  const i = T.idx; T.t[i] = S.t;
  S.isl.forEach(I => {
    const s = islSample(I);
    for (const k in s) T.ser[I.id + '.' + k][i] = s[k];
    I.gens.forEach(G => { T.ser[G.id + '.P'][i] = G.Pe; T.ser[G.id + '.Q'][i] = G.Qe; T.ser[G.id + '.w'][i] = G.w * 50; });
  });
  T.idx = (i + 1) % TF_N; T.n = Math.min(TF_N, T.n + 1);
}
function trendSlow(dt) {
  const T = S.ts; if (!T) return;
  T.acc += dt * S.clkSpeed;
  if (T.acc < 60) return;
  T.acc = 0;
  const i = T.idx; T.clk[i] = S.clk + (S.doy - 1) * 86400;
  S.isl.forEach(I => { const s = islSample(I); for (const k in s) T.ser[I.id + '.' + k][i] = s[k]; });
  T.idx = (i + 1) % TS_N; T.n = Math.min(TS_N, T.n + 1);
}
