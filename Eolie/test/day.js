/* giornata simulata: quota rinnovabile, gasolio, accumuli, stabilità */
const A = require('./load');
A.NET_CFG.net = process.argv[2] || 'rinnovabile';
const hours = +(process.argv[3] || 24);
A.initSim();
const S = A.S; S.clkSpeed = 120;
const t0 = Date.now(); let lastH = -1, fmin = {}, fmax = {};
const secs = hours * 3600 / S.clkSpeed;
A.run(secs, () => {
  S.isl.forEach(I => { const b = I.buses[0]; if (b.live) { fmin[I.id] = Math.min(fmin[I.id] || 99, b.fm); fmax[I.id] = Math.max(fmax[I.id] || 0, b.fm); } });
  const h = Math.floor(S.clk / 3600);
  if (h !== lastH) {
    lastH = h;
    const n = S.tot.now; if (!n) return;
    const line = S.isl.map(I => { const on = I.gens.filter(g => g.st === 'IN PARALLELO').length; const B = I.bess[0]; return I.id + ' ' + on + 'G ' + (B ? B.soc.toFixed(0) + '%' + (B.P >= 0 ? '+' : '') + (B.P * 1000).toFixed(0) : '') + (I.pv.curtEms < 0.98 ? ' c' + (I.pv.curtEms * 100).toFixed(0) : '') + (I.buses[0].live ? '' : ' BUIO'); }).join(' | ');
    console.log(String(h).padStart(2) + 'h load ' + n.load.toFixed(1) + ' pv ' + n.pv.toFixed(1) + ' dsl ' + n.dsl.toFixed(1) + ' bess ' + n.bess.toFixed(1) + ' fuel ' + n.fuel.toFixed(0) + 'l/h ens ' + (n.ens * 1000).toFixed(0) + 'kW :: ' + line);
  }
});
const E = S.tot.E;
console.log('CPU', ((Date.now() - t0) / 1000).toFixed(0), 's');
console.log('ENERGIA MWh: carico', E.load.toFixed(1), 'FV', E.pv.toFixed(1), 'diesel', E.dsl.toFixed(1), 'BESS netto', E.bess.toFixed(1), 'non fornita', E.ens.toFixed(2), 'gasolio m3', (E.fuel / 1000).toFixed(1));
console.log('QUOTA RINNOVABILE', (E.pv / (E.pv + E.dsl) * 100).toFixed(1) + '%');
console.log('f min/max', Object.keys(fmin).map(k => k + ' ' + fmin[k].toFixed(2) + '/' + fmax[k].toFixed(2)).join(', '));
const imp = S.soe.filter(e => e.prio >= 3).map(e => (e.clk / 3600).toFixed(2) + 'h ' + e.text);
console.log('eventi gravi:', imp.length); console.log(imp.slice(0, 30).join('\n'));
