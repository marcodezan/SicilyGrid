const A = require('./load');
const vm=require('vm');
let n=0;
A.initSim.cb = k => { const S=A.S; if (k%50) return; const L=S.busById['LIP.A'], LB=S.busById['LIP.B']; const g=S.gens.filter(g=>g.isl==='LIP'); 
 console.log(k, L.fm.toFixed(3), L.Vm.toFixed(3), LB.fm.toFixed(3), g.map(x=>x.st.slice(0,4)+' w'+x.w.toFixed(3)+' r'+x.rack.toFixed(2)+' P'+x.Pe.toFixed(2)+' d'+x.d.toFixed(2)).join(' | '), 'bess', S.byId['LIP.BESS'].P.toFixed(2), 'Vul', S.busById['VUL.B'].Vm.toFixed(3)); };
A.initSim();
