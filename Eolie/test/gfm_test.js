/* accumulo di Salina passato in grid-forming: la rete regge dal pomeriggio alla notte */
const A = require('./load');
A.initSim(); const S = A.S, I = S.islById.SAL, B = S.byId['SAL.BESS'];
B.auto = false; A.opBrk(B.brk, 'O'); A.run(1); A.bessSet(B, 'mode', 'GFM'); A.run(0.5); A.opBrk(B.brk, 'C'); B.auto = true; A.run(5);
console.log('GFM in servizio:', B.brk.st, B.mode, 'f', I.buses[0].fm.toFixed(3));
S.clkSpeed = 120; let fmin = 99, dark = 0, last = -1;
A.run(13 * 3600 / 120, () => { const b = I.buses[0]; if (b.live) fmin = Math.min(fmin, b.fm); else dark++; const h = Math.floor(S.clk / 3600); if (h !== last) { last = h; console.log(h + 'h SoC ' + B.soc.toFixed(0) + '% P ' + (B.P * 1000).toFixed(0) + ' kW · diesel ' + I.gens.filter(g => g.st === 'IN PARALLELO').map(g => g.short + ':' + (g.Pe * 1000).toFixed(0)).join(',') + ' · carico ' + (I.nodes.reduce((a, N) => a + (N.live ? N.Pl : 0), 0) * 1000).toFixed(0) + ' FV ' + (I.pv.P * 1000).toFixed(0)); } });
console.log('f min', fmin.toFixed(2), 'campioni al buio', dark, 'cabine al buio', I.nodes.filter(N => !N.live).length);
console.log(S.soe.filter(e => e.prio >= 3 && e.isl === 'SAL').map(e => e.text).slice(0, 10).join('\n'));
