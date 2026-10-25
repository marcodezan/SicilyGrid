/* modalità Gestione: acquisto e vendita di energia con la rete nazionale (collegamento 150 kV) */
const A = require('./load');
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
A.NET_CFG.net = 'rinnovabile';
A.initSim(); A.ecoStart(); A.run(1);
const S = A.S, E = () => A.ECO; S.clkSpeed = 60;
A.admCash(1000000, 'set'); A.admSpeed(0);
ok(A.ecoBuy({ k: 'rtn' }) === '', 'collegamento con la Sicilia acquistato');
A.run(0.5);
const C = S.byId.CRT;
ok(C && !C.notBuilt, 'collegamento realizzato');
/* messa in servizio: lato RTN chiuso, lato Lipari con il sincronizzatore */
A.opBrk(C.brkA, 'C'); A.run(1); A.brkAutoSync(C.brkB, true); A.run(120);
ok(C.brkA.st === 'C' && C.brkB.st === 'C', 'Lipari in parallelo con la rete nazionale');
/* mezzogiorno: il FV di Lipari e Vulcano supera il carico, l'eccedenza va in Sicilia */
A.retime(11.5 * 3600); A.run(30); /* 30 min di assestamento */
const L0 = JSON.parse(JSON.stringify(E().led));
A.run(60); /* 12:00–13:00 */
const gP = S.grid.P, d = k => E().led[k] - L0[k];
console.log('scambio RTN ' + (gP * 1000).toFixed(0) + ' kW · FV LIP ' + (S.islById.LIP.pv.P * 1000).toFixed(0) + ' kW · venduti ' + Math.round(d('kwhExp')) + ' kWh = ' + Math.round(d('exp')) + ' € · acquisti ' + Math.round(d('imp')) + ' €');
ok(d('exp') > 0 && d('kwhExp') > 0, 'eccedenza venduta alla rete nazionale');
ok(Math.abs(d('exp') - d('kwhExp') * A.PRICE.exp) < 1, 'prezzo di vendita ' + A.PRICE.exp + ' €/kWh applicato');
const R = E().rate;
ok(gP < 0 ? R.exp > 0 && R.imp === 0 : R.imp >= 0 && R.exp === 0, 'tassi coerenti con il verso dello scambio (' + (gP < 0 ? 'cessione' : 'prelievo') + ')');
/* di sera si compra */
A.retime(21 * 3600); A.run(120);
ok(S.grid.P > 0 && E().rate.imp > 0 && E().rate.exp === 0, 'di sera si compra dalla Sicilia (' + (S.grid.P * 1000).toFixed(0) + ' kW)');
A.ecoCloseDay();
const day = E().days[E().days.length - 1];
ok(Number.isFinite(day.net) && day.exp > 0, 'vendita nel bilancio della giornata (' + Math.round(day.exp) + ' €)');
