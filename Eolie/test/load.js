/* carica i sorgenti del simulatore in Node (senza interfaccia): concatena i file in un modulo */
const fs = require('fs'), path = require('path');
const files = ['data.js', 'engine.js', 'prot.js', 'ctrl.js', 'rec.js'];
const src = files.map(f => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8')).join('\n;\n') +
  '\nmodule.exports={get S(){return S},initSim,fastStep,injectFault,brkCmd,opBrk,startGen,stopGen,swCmd,equipFault,sendCrew,motorCmd,genAutoSync,genRaise,genSetMode,bessSet,relReset,fpiReset,DT,cabs,devClosed,isClosed,wrapPi,recSrc,nodeLoad,hourNow,topology,lvBrkCmd,alarmAck,brkRack,brkAutoSync,pvLimit,pvSwitch,pvNode,addCloud,nodeShade};';
const tmp = path.join(__dirname, '.bundle.js');
fs.writeFileSync(tmp, src);
const A = require(tmp);
A.run = (sec, cb) => { const n = Math.round(sec / A.DT); for (let k = 0; k < n; k++) { A.fastStep(A.DT); if (cb && k % 100 === 0) cb(k * A.DT); } };
A.isl = id => A.S.islById[id];
A.sum = id => {
  const S = A.S, I = S.islById[id], b = I.buses[0];
  const gens = I.gens.map(g => `${g.short}:${g.st.slice(0, 5)} ${(g.Pe * 1000).toFixed(0)}kW/${(g.Qe * 1000).toFixed(0)}kvar`).join(' | ');
  return `${id} f=${b.fm.toFixed(3)} V=${b.Vm.toFixed(3)} load=${(I.nodes.reduce((a, n) => a + (n.live ? n.Pl : 0), 0) * 1000).toFixed(0)}kW pv=${(I.pv.P * 1000).toFixed(0)} bess=${I.bess.map(x => (x.P * 1000).toFixed(0) + '/' + x.soc.toFixed(1) + '%').join(',')} :: ${gens}`;
};
A.soe = (from) => A.S.soe.filter(e => e.t >= (from || 0)).map(e => `${e.t.toFixed(3)} [${e.isl}] ${e.text}`).join('\n');
module.exports = A;
