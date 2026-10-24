const A = require('./load');
// intercept init: run custom settle with tracing
const S0 = A.initSim;
const ctx = A;
A.initSim();
const S = A.S;
const L = S.busById['LIP.A'], G = S.byId['LIP.G1'], GIN = S.busById['GIN.B'], B = S.byId['GIN.BESS'];
console.log('LIP', L.fm, L.Vm, G.w, G.rack, G.Pm, G.Pe, G.d, L.th);
console.log('GIN', GIN.Vm, B.E, B.Ev, B.xvf, B.P, B.Q, B.ivi, B.Esoft);
