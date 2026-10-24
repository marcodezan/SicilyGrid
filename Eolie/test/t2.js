const A = require('./load');
const which = process.argv[2];
const T = {};
const f3 = x => x.toFixed(3);
function fmin(id, sec) { let m = 99, M = 0; A.run(sec, () => { const b = A.S.islById[id].buses[0]; if (b.live) { m = Math.min(m, b.fm); M = Math.max(M, b.fm); } }); return [m, M]; }

T.feederLLL = () => {
  A.initSim(); const t0 = A.S.t;
  A.injectFault({ el: 'LIP.L2.s2', loc: 'seg', kind: 'LLL', perm: true });
  const [m] = fmin('LIP', 25);
  console.log(A.soe(t0)); console.log('fmin', f3(m)); console.log(A.sum('LIP'));
  const S = A.S;
  console.log('FPI', S.segs.filter(s => s.fpi.flag).map(s => s.id).join(','));
  // isolamento e rialimentazione
  A.swCmd(S.byId['LIP.L2.s2.IMS'], false); A.swCmd(S.byId['LIP.L2.s3.IMS'], false); A.run(2);
  A.relReset(S.byId['LIP.L2']);
  A.opBrk(S.byId['LIP.L2.Q'], 'C'); A.run(1);
  A.swCmd(S.byId['LIP.NA1.IMS'], true); A.run(3);
  console.log(A.soe(t0 + 25));
  S.byId['LIP.L2'].nodes.forEach(n => console.log(n.nm, n.live, f3(n.Vm)));
  console.log('sendCrew', A.sendCrew(S.byId['LIP.L2.s2'])); A.run(45);
  console.log(A.soe(t0 + 31));
};
T.LGsal = () => {
  A.initSim(); const t0 = A.S.t;
  A.injectFault({ el: 'SAL.S2.s2', loc: 'seg', kind: 'LG', perm: false });
  A.run(3); console.log('V0', f3(A.S.islById.SAL.V0), 'Ig', A.S.islById.SAL.Ig.toFixed(1));
  A.run(10); console.log(A.soe(t0)); console.log(A.sum('SAL'));
};
T.LGlip = () => {
  A.initSim(); const t0 = A.S.t;
  A.injectFault({ el: 'LIP.L3.s2', loc: 'seg', kind: 'LG', perm: true, rf: 0 });
  A.run(0.1); console.log('V0', f3(A.S.islById.LIP.V0), 'Ig', A.S.islById.LIP.Ig.toFixed(1), 'L3 I0', (A.cabs(A.S.byId['LIP.L3'].I0f) * 3 * 28.87).toFixed(1), 'L1 I0', (A.cabs(A.S.byId['LIP.L1'].I0f) * 3 * 28.87).toFixed(1));
  A.run(30); console.log(A.soe(t0));
};
T.genTrip = () => {
  A.initSim(); const t0 = A.S.t;
  A.equipFault(A.S.byId['LIP.G1'], 'gtrip');
  const [m, M] = fmin('LIP', 40); console.log(A.soe(t0)); console.log('f min', f3(m), 'max', f3(M)); console.log(A.sum('LIP'));
};
T.vulcano = () => {
  A.initSim(); const t0 = A.S.t;
  A.injectFault({ el: 'CV1', loc: 'cab', kind: 'LLL', perm: true });
  A.run(0.5); A.opBrk(A.S.byId['CV2.QA'], 'O'); A.opBrk(A.S.byId['CV2.QB'], 'O');
  A.run(60); console.log(A.soe(t0)); console.log(A.sum('VUL')); console.log(A.sum('LIP'));
};
T.diss = () => {
  A.initSim(); const t0 = A.S.t; const N = A.S.byId['LIP.L5.1'];
  A.motorCmd(N, false); A.run(5);
  let vmin = 9; A.motorCmd(N, true, false);
  A.run(12, () => { vmin = Math.min(vmin, A.S.busById['LIP.B'].Vm); });
  console.log(A.soe(t0)); console.log('Vmin', f3(vmin));
};
T.busPan = () => {
  A.initSim(); const t0 = A.S.t;
  A.injectFault({ el: 'PAN.B', loc: 'bus', kind: 'LLL', perm: true });
  A.run(5); console.log(A.soe(t0)); console.log(A.sum('PAN'));
  A.sendCrew(A.S.busById['PAN.B']); A.run(45); A.relReset(A.S.busById['PAN.B']); A.run(60);
  console.log(A.soe(t0 + 5)); console.log(A.sum('PAN'));
};
T.stuck = () => {
  A.initSim(); const t0 = A.S.t;
  A.equipFault(A.S.byId['STR.R1.Q'], 'stuck');
  A.injectFault({ el: 'STR.R1.s2', loc: 'seg', kind: 'LLL', perm: true });
  A.run(5); console.log(A.soe(t0)); console.log(A.sum('STR'));
  const t1 = A.S.t; const b = A.S.byId['STR.R1.Q'];
  console.log('rack', A.brkRack(b, true)); A.relReset(A.S.busById['STR.B']); A.run(40);
  console.log(A.soe(t1)); console.log(A.sum('STR'));
};
T.outPhase = () => {
  A.initSim(); const t0 = A.S.t; const G = A.S.byId['SAL.G3']; G.auto = false;
  A.startGen(G); A.run(25); console.log(G.st, f3(G.w * 50), f3(G.Eq * G.w));
  const r25 = G.relays.find(r => r.code === '25'); r25.byp = true;
  // attendi fase opposta
  let k = 0; while (Math.abs(A.wrapPi(G.d - G.bus.th)) < 2.6 && k++ < 30000) A.fastStep(A.DT);
  A.opBrk(G.brk, 'C'); A.run(3); console.log(A.soe(t0)); console.log(A.sum('SAL'));
};
T.syncManual = () => {
  A.initSim(); const t0 = A.S.t; const G = A.S.byId['SAL.G3']; G.auto = false;
  A.startGen(G); A.run(25);
  console.log('try close', A.opBrk(G.brk, 'C'), A.S.lastRefuse && A.S.lastRefuse.msg);
  A.genAutoSync(G, true); A.run(20);
  console.log(A.soe(t0)); console.log(A.sum('SAL'));
};
T.ginNight = () => {
  A.initSim(); const t0 = A.S.t; A.S.clk = 18.5 * 3600; A.S.clkSpeed = 60; A.S.byId['GIN.BESS'].soc = 35;
  for (let k = 0; k < 6; k++) { A.run(30); console.log(A.sum('GIN')); } console.log(A.soe(t0).split(String.fromCharCode(10)).filter(l => l.includes('[GIN]')).join(String.fromCharCode(10)));
};
T.grid = () => {
  A.initSim(); const t0 = A.S.t; const S = A.S;
  A.opBrk(S.byId['CRT.QA'], 'C'); A.run(1);
  console.log('close B', A.opBrk(S.byId['CRT.QB'], 'C'), S.lastRefuse && S.lastRefuse.msg);
  A.brkAutoSync(S.byId['CRT.QB'], true);
  A.run(60); console.log(A.soe(t0)); console.log(A.sum('LIP'), 'grid P', (S.grid.P * 1000).toFixed(0));
};
T.lof = () => { A.initSim(); const t0 = A.S.t; A.equipFault(A.S.byId['PAN.G1'], 'lof'); A.run(15); console.log(A.soe(t0)); console.log(A.sum('PAN')); };
T.hunt = () => { A.initSim(); const t0 = A.S.t; A.equipFault(A.S.byId['SAL.G1'], 'govHunt'); const [m, M] = fmin('SAL', 20); console.log(A.soe(t0)); console.log('f', f3(m), f3(M)); };
T.cool = () => { A.initSim(); const t0 = A.S.t; A.equipFault(A.S.byId['FIL.G1'], 'cool'); A.run(120); console.log(A.soe(t0)); console.log(A.sum('FIL')); };
T.lv = () => { A.initSim(); const t0 = A.S.t; A.injectFault({ el: 'PAN.P1.1', loc: 'lv', kind: 'LLL', perm: true }); A.injectFault({ el: 'PAN.P2.1', loc: 'trq', kind: 'LLL', perm: true }); A.run(3); console.log(A.soe(t0)); };
T.ali = () => { A.initSim(); const t0 = A.S.t; A.S.gens.filter(g => g.isl === 'ALI' && g.st === 'IN PARALLELO').forEach(g => A.equipFault(g, 'gtrip')); A.run(60); console.log(A.soe(t0)); console.log(A.sum('ALI')); };
T.LL = () => { A.initSim(); const t0 = A.S.t; A.injectFault({ el: 'FIL.F1.s2', loc: 'seg', kind: 'LL', perm: false }); A.run(3); console.log(A.soe(t0)); console.log(A.sum('FIL')); };
T.legacy = () => {
  A.initSim(); const t0 = A.S.t; const S = A.S; S.set.weather = 'sereno'; S.isl.forEach(I => { I.cloud.ev = []; I.cloud.base = 1; }); A.run(5);
  A.opBrk(S.byId['LIP.L1.Q'], 'O'); const [m, M] = fmin('LIP', 30); console.log(A.soe(t0)); console.log('f', f3(m), f3(M)); console.log(A.sum('LIP'));
};
(which ? [which] : Object.keys(T)).forEach(k => { console.log('\n======== ' + k); T[k](); });
