const A = require('./load');
A.initSim();
const t=Date.now(); A.run(5); console.log('5s', Date.now()-t);
