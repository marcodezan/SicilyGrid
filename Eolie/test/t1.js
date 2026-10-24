const A = require('./load');
const t0 = Date.now();
A.initSim();
console.log('init ms', Date.now() - t0);
['LIP','VUL','SAL','PAN','STR','GIN','FIL','ALI'].forEach(id => console.log(A.sum(id)));
const t1 = Date.now(); A.run(10); console.log('10s sim ms', Date.now() - t1);
['LIP','VUL','SAL','PAN','STR','GIN','FIL','ALI'].forEach(id => console.log(A.sum(id)));
console.log(A.soe());
