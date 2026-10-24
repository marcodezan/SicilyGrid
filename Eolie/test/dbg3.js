const A = require('./load');
A.initSim.cb = k => { const S=A.S; if (k%300 && k>20) return; const b=S.busById['GIN.B'], B=S.byId['GIN.BESS'];
 console.log(k, 'GIN V', b.Vm.toFixed(3), 'f', b.fm.toFixed(3), 'live', b.live, 'E', B.E.toFixed(3), 'Ev', B.Ev.toFixed(3),'ivi',B.ivi.toFixed(3), 'P', (B.P*1000).toFixed(1), 'Q', (B.Q*1000).toFixed(1), 'brk', B.brk.st, 'Lip', S.busById['LIP.A'].fm.toFixed(3)); };
A.initSim();
