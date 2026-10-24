// esegue scenari deterministici e stampa una firma (eventi + grandezze)
const A = require(process.argv[2] ? process.argv[2] + '/load' : './load');
const out = [];
const f3 = x => x.toFixed(3);
function track(id, sec) { let m = 99, M = 0; A.run(sec, () => { const b = A.S.islById[id].buses[0]; if (b.live) { m = Math.min(m, b.fm); M = Math.max(M, b.fm); } }); return f3(m) + '/' + f3(M); }
const sc = {
  base: () => { A.initSim(); return track('LIP', 10); },
  feeder: () => { A.initSim(); A.injectFault({ el: 'LIP.L2.s2', loc: 'seg', kind: 'LLL', perm: true }); return track('LIP', 25); },
  lg: () => { A.initSim(); A.injectFault({ el: 'SAL.S2.s2', loc: 'seg', kind: 'LG', perm: false }); return track('SAL', 8); },
  trip: () => { A.initSim(); A.equipFault(A.S.byId['LIP.G1'], 'gtrip'); return track('LIP', 30); },
  vul: () => { A.initSim(); A.injectFault({ el: 'CV1', loc: 'cab', kind: 'LLL', perm: true }); A.run(0.4); A.injectFault({ el: 'CV2', loc: 'cab', kind: 'LG', perm: true }); return track('VUL', 60); },
  bus: () => { A.initSim(); A.injectFault({ el: 'PAN.B', loc: 'bus', kind: 'LLL', perm: true }); return track('PAN', 10); },
  gin: () => { A.initSim(); A.S.byId['GIN.BESS'].soc = 33; if (A.retime) A.retime(19.6 * 3600); else A.S.clk = 19.6 * 3600; return track('GIN', 30); },
  ferr: () => { A.initSim(); A.S.set.demand = 1.25; A.S.byId['PAN.G4'].blocked = true; A.S.bess.forEach(b => { if (b.mode === 'GFL') b.soc = 6; }); if (A.retime) A.retime(20.9 * 3600); else A.S.clk = 20.9 * 3600; A.run(25); const G = A.S.islById.PAN.gens.filter(g => g.st === 'IN PARALLELO').sort((a, b) => b.Pe - a.Pe)[0]; if (G) A.equipFault(G, 'gtrip'); return track('PAN', 60); },
  legacy: () => { A.initSim(); A.S.set.weather = 'sereno'; A.S.isl.forEach(I => { I.cloud.ev = []; I.cloud.base = 1; }); const B = A.S.byId['LIP.BESS']; if (B) { B.auto = false; B.Pset = 0; B.brk.st = 'O'; A.S.topoDirty = true; } if (A.retime) A.retime(12.5 * 3600); else A.S.clk = 12.5 * 3600; A.run(3); A.brkCmd(A.S.byId['LIP.L5.Q'], 'O', 'scenario', 'OP'); return track('LIP', 30); },
};
const only = process.argv[3];
for (const k in sc) {
  if (only && k !== only) continue;
  const t = Date.now(); const r = sc[k]();
  const S = A.S, sum = S.isl.map(I => I.id + ':' + (I.buses[0].live ? I.buses[0].fm.toFixed(2) : 'X') + ':' + I.gens.filter(g => g.st === 'IN PARALLELO').length + ':' + (I.nodes.filter(N => N.live).length)).join(' ');
  console.log('### ' + k + ' ' + r + ' (' + (Date.now() - t) + ' ms)\n' + sum);
  if (process.argv[4]) console.log(S.soe.map(e => e.t.toFixed(2) + ' ' + e.text).join('\n'));
}
