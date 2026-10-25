/* modalità Gestione: richiesta di fondi (prestito, contributo, anticipo) */
const A = require('./load');
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
A.NET_CFG.net = 'rinnovabile';
A.initSim(); A.ecoStart();
const S = A.S, E = () => A.ECO, F = () => A.ECO.fin;
S.clkSpeed = 120;
const h = n => A.run(n * 3600 / S.clkSpeed);
h(0.5);
let R = A.finRating();
console.log('merito iniziale', R.g, R.sc, 'fido', R.lim);
ok(R.g !== 'D' && R.lim >= 30000, 'merito di credito e fido iniziali');
/* prestito */
ok(A.loanCheck(R.lim + 1000, 7) !== '', 'prestito oltre il fido rifiutato');
ok(A.loanCheck(50000, 5) !== '', 'durata non prevista rifiutata');
const c0 = E().cash;
ok(A.loanAsk(50000, 3) === '', 'richiesta di prestito da 50k in 3 giorni');
ok(A.loanAsk(25000, 3) !== '', 'seconda richiesta durante l\'istruttoria rifiutata');
h(1.1);
ok(F().loans.length === 1 && E().cash > c0 + 45000, 'prestito erogato dopo l\'istruttoria (cassa ' + Math.round(c0) + ' → ' + Math.round(E().cash) + ')');
ok(E().led.int === 500, 'commissione dell\'1% registrata (' + E().led.int + ')');
/* rate giornaliere */
const L = F().loans[0], b0 = L.bal, cb = E().cash;
A.finDaily();
ok(L.bal < b0 && L.left === 2 && E().cash < cb, 'prima rata: residuo ' + Math.round(b0) + ' → ' + Math.round(L.bal) + ', addebitati ' + Math.round(cb - E().cash) + ' €');
A.finDaily(); A.finDaily();
ok(F().loans.length === 0, 'prestito rimborsato in 3 rate');
const intTot = E().led.int - 500;
ok(intTot > 0 && intTot < 50000 * 0.02, 'interessi totali ' + Math.round(intTot) + ' €');
/* estinzione anticipata */
ok(A.loanAsk(25000, 7) === '', 'nuovo prestito da 25k'); h(1.1);
const id = F().loans[0].id, cp = E().cash;
ok(A.loanPayoff(id) === '' && F().loans.length === 0 && cp - E().cash > 25000, 'estinzione anticipata con penale (' + Math.round(cp - E().cash) + ' €)');
/* contributo pubblico */
ok(A.grantCheck(75000) !== '', 'importo del bando non previsto rifiutato');
const cg = E().cash;
ok(A.grantAsk(100000) === '', 'domanda di contributo da 100k');
h(12.2);
const G = F().grant;
console.log('qualità', (A.ECO.day.q / A.ECO.day.qn).toFixed(3), 'contributo', G && G.amt);
ok(G && G.amt >= 60000 && E().cash > cg + 50000, 'contributo approvato (' + (G ? G.amt : 0) + ' €)');
ok(A.grantAsk(50000) !== '', 'nuovo bando bloccato finché il contributo non è impiegato');
E().cash += 200000;
ok(A.ecoBuy({ k: 'pv', isl: 'LIP', kwp: 1000 }) === '' && G.vinc === Math.max(0, G.amt - 20000), 'FV impiegato nel vincolo (restano ' + G.vinc + ' €)');
ok(A.ecoBuy({ k: 'dsl', isl: 'ALI', Pn: 0.25 }) === '' && G.vinc === Math.max(0, G.amt - 20000), 'diesel escluso dal vincolo');
const left = G.vinc, cv = E().cash;
S.tc = G.tEnd + 1; A.run(0.5);
ok(F().grant === null && Math.round(cv - E().cash) >= left - 1, 'a scadenza restituita la parte non impiegata (' + left + ' €)');
/* anticipo di emergenza */
ok(A.advCheck() !== '', 'anticipo negato con cassa alta');
E().cash = 2000;
ok(A.advAsk() === '' && E().cash === 2000 + 40000 - 800, 'anticipo accreditato (cassa ' + Math.round(E().cash) + ')');
const a0 = F().adv.bal; S.clk = 12 * 3600; h(2);
ok(F().adv && F().adv.bal < a0, 'restituzione con trattenuta sui ricavi (residuo ' + Math.round(F().adv.bal) + ')');
/* salvataggio */
const sv = JSON.parse(JSON.stringify(A.ecoSave()));
ok(sv.fin && sv.fin.adv && sv.fin.adv.bal > 0, 'fondi inclusi nel salvataggio');
/* chiusura della giornata con interessi e contributi nel conto */
A.ecoCloseDay();
const d = E().days[E().days.length - 1];
ok(Number.isFinite(d.net), 'giornata chiusa con risultato numerico (' + Math.round(d.net) + ' €)');
R = A.finRating(); ok(Number.isFinite(R.sc), 'merito ricalcolato dopo la giornata: ' + R.g + ' ' + R.sc);
