/* modalità Gestione: economia, cantieri, messa in servizio, salvataggio */
const A = require('./load');
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
A.NET_CFG.net = process.argv[2] || 'rinnovabile';
A.initSim(); A.ecoStart();
const S = A.S, E = () => A.ECO;
S.clkSpeed = 120;
const c0 = E().cash;
A.run(60 * 60 / 120 * 3); /* 3 ore di orologio */
const r = E().rate;
console.log('dopo 3 h: cassa', Math.round(E().cash), '· €/h ricavi', r.ric.toFixed(0), 'gasolio', r.gas.toFixed(0), 'manut.', r.om.toFixed(0), 'penali', r.pen.toFixed(0));
ok(E().led.ric > 0 && E().led.gas > 0, 'ricavi e costi del gasolio maturano');
/* acquisti */
E().cash += 400000; /* fondi per il test */
ok(A.ecoBuy({ k: 'pv', isl: 'PAN', kwp: 500 }) === '', 'acquisto FV Panarea');
ok(A.ecoBuy({ k: 'bess', isl: 'FIL', Pn: 0.5, En: 1.5, mode: 'GFL' }) === '', 'acquisto accumulo Filicudi');
ok(A.ecoBuy({ k: 'dsl', isl: 'ALI', Pn: 0.25 }) === '', 'acquisto gruppo Alicudi');
ok(A.ecoBuy({ k: 'cable', a: 'PAN.B', b: 'STR.B' }) === '', 'acquisto cavo Panarea–Stromboli (' + A.ecoQuote({ k: 'cable', a: 'PAN.B', b: 'STR.B' }).km + ' km, ' + A.ecoQuote({ k: 'cable', a: 'PAN.B', b: 'STR.B' }).cost + ' €)');
ok(A.ecoBuy({ k: 'cable', a: 'PAN.B', b: 'STR.B' }) !== '', 'secondo cavo uguale rifiutato');
const kwp0 = S.islById.PAN.pv.kwp;
A.run(11 * 3600 / 120); /* 11 ore: tutti i cantieri chiusi */
ok(E().proj.length === 0, 'cantieri completati');
ok(S.islById.PAN.pv.kwp >= kwp0 + 495, 'FV di Panarea aumentato: ' + kwp0 + ' → ' + S.islById.PAN.pv.kwp + ' kWp');
const BF = S.byId['FIL.BESS'];
ok(BF && S.relays.some(r => r.el === BF), 'accumulo di Filicudi creato con protezioni');
ok(BF && BF.brk.st === 'C', 'accumulo di Filicudi messo in servizio dall\'EMS (SoC ' + (BF ? BF.soc.toFixed(0) : '') + '%)');
const GA = S.byId['ALI.G4'];
ok(GA && S.rec.byId['ALI.G4.I'], 'nuovo gruppo di Alicudi con segnali per l\'oscilloscopio');
const cab = S.br.find(b => b.id === 'CX1');
ok(cab && cab.brkA.st === 'O', 'cavo Panarea–Stromboli posato, aperto');
/* messa in servizio del cavo: un lato chiuso, l'altro con sincronizzatore */
A.opBrk(cab.brkA, 'C'); A.run(1); A.brkAutoSync(cab.brkB, true); A.run(60);
ok(A.S.byId.CX1 && cab.brkB.st === 'C' && S.islById.PAN.area === S.islById.STR.area, 'Panarea e Stromboli in parallelo sul nuovo cavo (P ' + (cab.Sa.r * 1000).toFixed(0) + ' kW)');
/* avvio del nuovo gruppo con l'EMS: messo in servizio a mano */
A.startGen(GA, 'OP'); A.run(30); A.genAutoSync(GA, true); A.run(40);
ok(GA.st === 'IN PARALLELO', 'nuovo gruppo di Alicudi in parallelo (stato ' + GA.st + ')');
/* dismissione */
const G3 = S.byId['ALI.G3'];
if (G3.st !== 'FERMO') { A.stopGen(G3, 'OP'); A.run(60); }
const cb = E().cash; ok(A.ecoScrap(G3) === '' && E().cash > cb && !S.byId['ALI.G3'], 'dismissione del GE3 di Alicudi con recupero');
/* piano accumuli a fasce orarie */
const BL = S.byId['LIP.BESS']; const P = A.bessPlan(BL); P.mode = 'man'; P.p = -0.5; A.run(20);
ok(Math.abs(BL.Pset + 0.5 * BL.Pn) < 0.05 * BL.Pn && !BL.auto, 'accumulo di Lipari in manuale a −50% (Pset ' + BL.Pset.toFixed(2) + ' MW)');
/* qualità */
console.log('qualità', S.isl.map(I => I.id + ' ' + (I.q || 0).toFixed(2)).join(' '));
/* salvataggio e ripristino */
const sv = JSON.parse(JSON.stringify(A.ecoSave()));
A.initSim(); A.ecoStart(sv);
ok(S.byId['ALI.G4'] && !S.byId['ALI.G3'] && S.byId.CX1 && S.byId['FIL.BESS'] && Math.abs(E().cash - sv.cash) < 1, 'partita ripristinata dal salvataggio');
A.run(10);
ok(S.isl.every(I => I.buses[0].live), 'tutte le isole in tensione dopo il ripristino');
console.log('giornate chiuse:', E().days.length, E().days.map(d => 'utile ' + Math.round(d.net) + ' € RE ' + (d.re * 100).toFixed(0) + '%').join(' | '));
