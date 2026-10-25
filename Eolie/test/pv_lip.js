/* FV di Lipari nelle ore di picco: quota erogata rispetto alla disponibile */
const fs = require('fs'), path = require('path');
const A = require('./load');
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'ctrl.js'), 'utf8');
if (!/function pvWhy/.test(src)) throw new Error('pvWhy mancante');
if (process.argv[2]) A.NET_CFG.net = process.argv[2];
A.initSim(); A.retime(11.5 * 3600);
const S = A.S; S.clkSpeed = 60;
const I = A.isl('LIP'); let fmin = 99, rmin = 9, n0 = S.soe.length;
A.run(4 * 3600 / S.clkSpeed, t => {
  const b = I.buses[0]; fmin = Math.min(fmin, b.fm);
  if (t > 30 && I.pv.P > 0.5) { const av = I.pv.Pav; if (av > 0.5) rmin = Math.min(rmin, I.pv.P / av); }
});
const trips = S.soe.slice(n0).filter(e => e.isl === 'LIP' && /SPI|inverter.*(distacc|scatt)/i.test(e.text)).length;
console.log('net', A.NET_CFG.net, 'fmin', fmin.toFixed(3), 'rapporto FV min', rmin === 9 ? 'n/d' : rmin.toFixed(2), 'distacchi FV', trips);
console.log(A.sum('LIP'));
