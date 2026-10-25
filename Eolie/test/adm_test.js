/* amministrazione: password, tempi di costruzione, fondi */
const A = require('./load');
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
A.initSim(); A.ecoStart(); A.run(1);
const S = A.S, E = () => A.ECO; S.clkSpeed = 120;
ok(A.admOk('30.59') && A.admOk(' 30,59 ') && !A.admOk('30.58') && !A.admOk(''), 'password 30.59 accettata, altre rifiutate');
ok(A.admCash(500000, 'add') === '' && E().cash >= 560000, 'fondi aggiunti (cassa ' + Math.round(E().cash) + ')');
ok(A.admCash(250000, 'set') === '' && E().cash === 250000, 'cassa impostata a 250000');
ok(E().led.ric < 1e5 && E().led.inv === 0, 'conto economico non toccato');
A.ecoBuy({ k: 'dsl', isl: 'ALI', Pn: 0.25 }); /* 6 h */
const p = E().proj[0], left0 = p.tEnd - S.tc;
ok(A.admSpeed(5) === '' && Math.abs((p.tEnd - S.tc) - left0 / 5) < 2, 'cantiere aperto accelerato ×5 (' + (left0 / 3600).toFixed(1) + ' h → ' + ((p.tEnd - S.tc) / 3600).toFixed(1) + ' h)');
A.ecoBuy({ k: 'pv', isl: 'LIP', kwp: 100 }); /* 2 h → 24 min */
ok(Math.abs((E().proj[1].tEnd - S.tc) - 2 * 3600 / 5) < 2, 'nuovo cantiere con tempi ridotti');
ok(A.admFinishAll() === '' && E().proj.length === 0 && S.byId['ALI.G4'], 'cantieri completati subito');
ok(A.admSpeed(0) === '', 'tempi istantanei');
const kwp = S.islById.PAN.pv.kwp;
A.ecoBuy({ k: 'pv', isl: 'PAN', kwp: 250 }); A.run(0.5);
ok(E().proj.length === 0 && S.islById.PAN.pv.kwp >= kwp + 245, 'cantiere istantaneo completato al passo successivo');
ok(A.admSpeed(1) === '' && (A.ecoBuy({ k: 'pv', isl: 'SAL', kwp: 100 }), E().proj[0].tEnd - S.tc > 7000), 'ritorno ai tempi normali');
E().cash = -40000; A.run(0.5); ok(E().over, 'fallimento con cassa sotto la soglia');
ok(A.admCash(100000, 'set') === '' && !E().over, 'partita ripresa impostando la cassa');
const sv = JSON.parse(JSON.stringify(A.ecoSave())); ok(sv.adm && sv.adm.speed === 1, 'velocità nel salvataggio');
