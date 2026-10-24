'use strict';
/* =====================================================================
   IMPREVISTI — scenari di esercizio e di emergenza
   ===================================================================== */
function later(sec, fn) { (S.later = S.later || []).push({ t: S.t + sec, fn }); }
function biggestGen(isl) { return S.islById[isl].gens.filter(g => g.st === 'IN PARALLELO').sort((a, b) => b.Pe - a.Pe)[0]; }
const SCEN = [
  { id: 'lip-perm', isl: 'LIP', tag: 'Rete MT', nm: 'Guasto trifase permanente sulla linea Canneto – Acquacalda',
    desc: 'Un mezzo d\'opera danneggia la linea tra Canneto e le Cave di pomice.',
    hint: 'Osserva: intervento della 50 in 80 ms, richiusura rapida (0,5 s) e lenta (15 s) fallite, scatto definitivo. Gli indicatori RGDAT si accendono sui tratti percorsi dalla corrente di guasto: il guasto è a valle dell\'ultimo indicatore acceso. Manovre: apri l\'IMS a monte e a valle del tratto guasto, richiudi l\'interruttore di linea (Canneto rialimentata), chiudi il punto di apertura NA1 per contro-alimentare Acquacalda dalla linea Pianoconte–Quattropani, poi invia la squadra e resetta gli indicatori.',
    run() { injectFault({ el: 'LIP.L2.s2', loc: 'seg', kind: 'LLL', perm: true }); selectEl(S.byId['LIP.L2']); scopePreset('line', S.byId['LIP.L2']); } },
  { id: 'sal-lg', isl: 'SAL', tag: 'Guasto a terra', nm: 'Guasto a terra transitorio su linea aerea (Salina, neutro isolato)',
    desc: 'Un ramo tocca un conduttore della linea Malfa – Pollara.',
    hint: 'Con il neutro isolato la corrente di guasto è solo capacitiva (pochi ampere) ma la tensione della fase guasta va a zero e le altre due salgono a √3: usa l\'oscilloscopio con la preimpostazione «Guasto a terra». La 67N direzionale apre solo la linea guasta, la richiusura rapida riesce.',
    run() { scopePreset('lg'); injectFault({ el: 'SAL.S2.s2', loc: 'seg', kind: 'LG', perm: false }); selectEl(S.byId['SAL.S2']); } },
  { id: 'lip-pet', isl: 'LIP', tag: 'Guasto a terra', nm: 'Guasto a terra con bobina di Petersen (Lipari)',
    desc: 'Arco verso terra sulla linea Pianoconte – Quattropani.',
    hint: 'La bobina di Petersen compensa la corrente capacitiva: l\'arco si autoestingue in pochi decimi di secondo senza aprire la linea. Prova poi a ripetere il guasto da pannello (Guasti) come permanente: interviene la 67N con tempo più lungo. Prova anche a disinserire la bobina (scheda Protezioni dell\'isola).',
    run() { scopePreset('lg'); SC.tb = 50; injectFault({ el: 'LIP.L3.s2', loc: 'seg', kind: 'LG', perm: false }); selectEl(S.islById.LIP); } },
  { id: 'lip-trip', isl: 'LIP', tag: 'Produzione', nm: 'Scatto del gruppo più carico di Lipari',
    desc: 'Il gruppo con la potenza maggiore va in blocco per un\'avaria del motore.',
    hint: 'Guarda il trend rapido: la frequenza scende con pendenza fissata dall\'inerzia rimasta, i regolatori isocroni recuperano in pochi secondi. Se scende sotto 49,7 Hz si distaccano gli inverter con tarature storiche, peggiorando lo squilibrio. L\'EMS avvia un\'unità di riserva per ripristinare il criterio N-1.',
    run() { const G = biggestGen('LIP'); if (G) { equipFault(G, 'gtrip'); selectEl(G); } UI.btab = 'trend'; TR.win = 60; showBtab('trend'); } },
  { id: 'vul-cab', isl: 'VUL', tag: 'Interconnessione', nm: 'Ancora di una nave sui cavi Lipari – Vulcano',
    desc: 'Entrambi i cavi sottomarini vengono danneggiati: Vulcano resta isolata.',
    hint: 'Le differenziali 87L aprono i cavi in 40 ms. Vulcano va in blackout: l\'EMS esegue la rimessa in tensione con i gruppi locali (avviamento, chiusura su sbarra morta, rialimentazione delle linee a gradini, attenzione al carico freddo). Disinserisci l\'EMS di Vulcano prima dello scenario se vuoi fare la procedura a mano.',
    run() { injectFault({ el: 'CV1', loc: 'cab', kind: 'LLL', perm: true, x: 0.4 }); later(0.35, () => injectFault({ el: 'CV2', loc: 'cab', kind: 'LG', perm: true, x: 0.45 })); selectEl(S.byId.CV1); } },
  { id: 'diss', isl: 'LIP', tag: 'Carichi', nm: 'Avviamento diretto del dissalatore di Lipari',
    desc: 'Le pompe ad alta pressione (1,2 MW) ripartono con avviamento diretto.',
    hint: 'Lo spunto (≈ 6 In, basso cos φ) provoca un buco di tensione su tutta la rete e un abbassamento di frequenza. Confronta con l\'avviamento tramite soft-starter dal pannello della cabina «Dissalatore Lipari». Con pochi gruppi in servizio l\'avviamento diretto può non riuscire (stallo, intervento 51).',
    run() { const N = S.byId['LIP.L5.1']; motorCmd(N, false); selectEl(N); scopePreset('bus'); SC.tb = 200; later(4, () => motorCmd(N, true, false)); } },
  { id: 'legacy', isl: 'LIP', tag: 'Fotovoltaico', nm: 'Rigetto di carico e FV con tarature storiche',
    desc: 'A mezzogiorno con cielo sereno, con l\'accumulo di Lipari fuori servizio per manutenzione, scatta la linea del dissalatore (1,4 MW di carico).',
    hint: 'Con il FV che copre gran parte del carico restano in servizio pochi diesel, con poca inerzia: il rigetto del dissalatore fa salire la frequenza oltre 50,3 Hz: gli inverter con le vecchie tarature (49,7–50,3 Hz) si distaccano tutti insieme, la frequenza poi scende. È il problema reale che ha portato alla revisione della norma CEI 0-21. Gli inverter conformi riducono invece la potenza (LFSM-O) sopra 50,2 Hz.',
    run() { S.set.weather = 'sereno'; S.isl.forEach(I => { I.cloud.ev = []; I.cloud.base = 1; }); const B = S.byId['LIP.BESS']; if (B) { B.auto = false; B.Pset = 0; B.brk.st = 'O'; S.topoDirty = true; } retime(12.5 * 3600); later(3, () => brkCmd(S.byId['LIP.L5.Q'], 'O', 'scenario: apertura intempestiva', 'OP')); selectEl(S.islById.LIP); showBtab('trend'); TR.win = 60; } },
  { id: 'hunt', isl: 'SAL', tag: 'Regolazione', nm: 'Pendolamento del regolatore di velocità (Salina)',
    desc: 'Il regolatore elettronico del GE1 entra in oscillazione.',
    hint: 'Nel trend rapido vedi la potenza del GE1 oscillare e trascinare la frequenza. Rimedi: mettere il gruppo in MANUALE e regolatore a STATISMO o POTENZA COSTANTE, oppure fermarlo dopo aver avviato un\'altra unità. Prova anche a modificare i guadagni del regolatore (scheda Parametri).',
    run() { equipFault(S.byId['SAL.G1'], 'govHunt'); selectEl(S.byId['SAL.G1']); showBtab('trend'); TR.win = 60; } },
  { id: 'lof', isl: 'PAN', tag: 'Produzione', nm: 'Perdita di eccitazione del GE1 di Panarea',
    desc: 'Si interrompe un diodo del ponte rotante dell\'eccitatrice.',
    hint: 'Il gruppo assorbe potenza reattiva dalla rete (Q negativa), la tensione cala; la protezione 40 lo separa e lo mette in blocco. Gli altri gruppi devono riprendere il carico: con il criterio N-1 rispettato non ci sono distacchi.',
    run() { equipFault(S.byId['PAN.G1'], 'lof'); selectEl(S.byId['PAN.G1']); } },
  { id: 'pan-bus', isl: 'PAN', tag: 'Centrale', nm: 'Guasto sulla sbarra di Panarea',
    desc: 'Cedimento di un isolatore nel quadro MT di centrale.',
    hint: 'La differenziale di sbarra 87B apre tutto in 60 ms e attiva il blocco 86: l\'isola è al buio. Procedura: invia la squadra sulla sbarra, a riparazione finita fai il reset del blocco 86 (pannello della sbarra). L\'EMS riavvia la centrale e rialimenta le linee.',
    run() { injectFault({ el: 'PAN.B', loc: 'bus', kind: 'LLL', perm: true }); selectEl(S.busById['PAN.B']); } },
  { id: 'str-bf', isl: 'STR', tag: 'Protezioni', nm: 'Guasto con mancata apertura dell\'interruttore (Stromboli)',
    desc: 'Corto sulla linea per Ficogrande, ma l\'interruttore di linea non apre.',
    hint: 'La 50 comanda l\'apertura, l\'interruttore resta chiuso: dopo 200 ms la 50BF apre tutta la sbarra e attiva il blocco 86BF. Procedura: estrai il carrello dell\'interruttore guasto (sbarra fuori tensione), resetta il blocco sulla sbarra, lascia ripartire la centrale, poi invia la squadra sull\'interruttore e sulla linea.',
    run() { equipFault(S.byId['STR.R1.Q'], 'stuck'); injectFault({ el: 'STR.R1.s2', loc: 'seg', kind: 'LLL', perm: true }); selectEl(S.byId['STR.R1']); } },
  { id: 'gin', isl: 'GIN', tag: 'Microrete', nm: 'Ginostra: sera con batteria quasi scarica',
    desc: 'La microrete è alimentata solo dall\'accumulo in grid-forming; il sole tramonta.',
    hint: 'L\'accumulo forma tensione e frequenza (inverter grid-forming con inerzia virtuale). Sotto il 30% di carica l\'EMS avvia il diesel di soccorso, che lavora a potenza costante e ricarica la batteria. Se disinserisci l\'EMS della microrete la batteria si scarica e la protezione BMS la separa: blackout. Prova poi la rimessa in tensione con il BESS in GFM.',
    run() { S.byId['GIN.BESS'].soc = 33; retime(19.6 * 3600); selectEl(S.byId['GIN.BESS']); } },
  { id: 'ferr', isl: 'PAN', tag: 'Picco', nm: 'Ferragosto: picco serale e scatto di un gruppo a Panarea',
    desc: 'Ore 21:00, domanda +25% in tutte le isole, accumuli già scarichi dopo il tramonto e il GE4 di Panarea in manutenzione; poco dopo un altro gruppo di Panarea scatta.',
    hint: 'Con la domanda al massimo la riserva è al limite: alla perdita del gruppo interviene l\'alleggerimento (UFLS). Una linea troppo carica non si richiude in un colpo solo (carico ferragostano più carico freddo dopo il buio): i gruppi rimasti non reggono il gradino e la linea riscatta per sottofrequenza. Procedura: avvia tutti i gruppi disponibili, poi rialimenta a tronchi: apri l\'IMS tra le cabine, chiudi l\'interruttore di linea e, quando la frequenza è tornata a 50 Hz, chiudi l\'IMS. Prima di chiudere, la conferma ti dice se la riserva basta. L\'EMS, se inserito, fa la stessa cosa da solo.',
    run() { S.set.demand = 1.25; S.bess.forEach(b => { if (b.mode === 'GFL') b.soc = 6; }); const G4 = S.byId['PAN.G4']; G4.blocked = true; G4.lastTrip = 'manutenzione programmata'; retime(20.9 * 3600); later(25, () => { const G = biggestGen('PAN'); if (G) equipFault(G, 'gtrip'); }); selectEl(S.islById.PAN); } },
  { id: 'cool', isl: 'FIL', tag: 'Produzione', nm: 'Avaria del raffreddamento del GE1 di Filicudi',
    desc: 'Si rompe la cinghia della pompa dell\'acqua.',
    hint: 'La temperatura dell\'acqua sale in circa mezzo minuto: allarme a 92 °C, arresto per protezione a 98 °C. Puoi prevenire lo scatto: avvia un altro gruppo, sincronizzalo e ferma il GE1 in modo controllato.',
    run() { equipFault(S.byId['FIL.G1'], 'cool'); selectEl(S.byId['FIL.G1']); } },
  { id: 'com', isl: 'ALI', tag: 'Telecontrollo', nm: 'Perdita della comunicazione con l\'RTU di Alicudi',
    desc: 'Il ponte radio verso Alicudi è fuori servizio.',
    hint: 'Le telemisure non sono più valide e i telecomandi sono inibiti: la centrale continua a funzionare con l\'automazione locale. Invia la squadra (pannello dell\'isola) per ripristinare il collegamento.',
    run() { equipFault(S.islById.ALI, 'com'); selectEl(S.islById.ALI); } },
  { id: 'storm', isl: 'SAL', tag: 'Meteo', nm: 'Temporale sull\'arcipelago',
    desc: 'Fulmini e vento sulle linee aeree per due minuti.',
    hint: 'Guasti casuali sulle linee aeree (soprattutto a terra e transitori), nubi sul fotovoltaico. Osserva le richiusure automatiche e gestisci gli scatti definitivi con le manovre di contro-alimentazione.',
    run() { S.set.weather = 'temporale'; S.set.randF = 3; S.storm = 120; later(125, () => { S.set.randF = 0; }); selectEl(S.islById.SAL); } },
  { id: 'parox', isl: 'STR', tag: 'Vulcano', nm: 'Parossismo dello Stromboli',
    desc: 'Esplosione parossistica: ricaduta di cenere e un incendio sotto la linea per Piscità.',
    hint: 'La cenere riduce la produzione FV; il fumo dell\'incendio provoca un guasto a terra permanente sulla linea aerea per Piscità. Isola il tratto con gli IMS, invia la squadra, valuta l\'avvio di un gruppo in più.',
    run() { S.islById.STR.ash = 0.7; S.islById.GIN.ash = 0.5; S.islById.STR.cvT = 120; S.islById.STR.cvD = 0.5; injectFault({ el: 'STR.R1.s3', loc: 'seg', kind: 'LG', perm: true, rf: 10 }); selectEl(S.byId['STR.R1']); } },
  { id: 'sync', isl: 'SAL', tag: 'Esercitazione', nm: 'Parallelo manuale di un gruppo (Salina)',
    desc: 'Il GE3 viene messo in manuale e avviato: va messo in parallelo a mano.',
    hint: 'Usa il sincronoscopio: regola la frequenza (f+/f−) in modo che l\'indice ruoti lentamente in senso orario (macchina leggermente più veloce), la tensione con V+/V−, e chiudi l\'interruttore quando l\'indice si avvicina alle 12. Il controllo di sincronismo 25 rifiuta le chiusure fuori finestra; se lo escludi (scheda Protezioni) puoi vedere cosa succede chiudendo in opposizione di fase.',
    run() { const G = S.byId['SAL.G3']; G.auto = false; startGen(G, 'OP'); selectEl(G); scopePreset('sync', G); } },
  { id: 'rtn', isl: 'LIP', tag: 'Scenario futuro', nm: 'Collegamento di Lipari alla rete siciliana',
    desc: 'Il collegamento a 150 kV con la Sicilia viene messo in tensione dal lato RTN.',
    hint: 'Chiudi l\'interruttore lato Lipari con il sincronizzatore (pannello del collegamento CRT): regola i gruppi isocroni di Lipari per portare l\'isola in fase con la rete nazionale. Dopo il parallelo la frequenza è imposta dalla RTN e l\'EMS ferma i diesel, lasciandone uno in riserva calda.',
    run() { brkCmd(S.byId['CRT.QA'], 'C', 'scenario: messa in tensione dal lato RTN', 'OP'); selectEl(S.byId.CRT); } },
  { id: 'cs1', isl: 'SAL', tag: 'Interconnessione', nm: 'Parallelo tra Lipari e Salina sul cavo di riserva',
    desc: 'Si vuole mettere in parallelo le due reti tramite il cavo CS1.',
    hint: 'Chiudi prima un estremo del cavo (il cavo si mette in tensione), poi l\'altro con il sincronizzatore: le due isole hanno frequenze leggermente diverse. Dopo il parallelo la ripartizione del carico avviene tra tutti i gruppi isocroni delle due isole.',
    run() { selectEl(S.byId.CS1); } },
  { id: 'ali-man', isl: 'ALI', tag: 'Black start', nm: 'Blackout di Alicudi con rimessa in tensione manuale',
    desc: 'Scattano tutti i gruppi di Alicudi; l\'EMS è disinserito.',
    hint: 'Procedura: 1) verifica che la linea sia aperta (27); 2) avvia un gruppo; 3) quando è PRONTO chiudi l\'interruttore su sbarra morta; 4) avvia un secondo gruppo e sincronizzalo; 5) richiudi la linea: il carico freddo è maggiore del normale. Controlla frequenza e tensione a ogni passo.',
    run() { const I = S.islById.ALI; I.ems.on = false; I.gens.filter(g => g.st === 'IN PARALLELO').forEach(g => equipFault(g, 'gtrip')); selectEl(I); } }
];
let SCN_ACTIVE = null;
function scenMenu(only) {
  const L = typeof only === 'string' ? SCEN.filter(s => s.isl === only) : SCEN;
  const tags = [...new Set(SCEN.map(s => s.tag))];
  modal(typeof only === 'string' ? 'Imprevisti · ' + S.islById[only].nm : 'Imprevisti', '<p class="note">Ogni imprevisto ha un obiettivo: più sei rapido, più punti ottieni. Puoi anche creare guasti su misura dalla scheda «Guasti» di qualsiasi componente.</p>' +
    '<div class="dsel">' + (typeof only === 'string' ? '<button data-a="scenAll">← tutti gli imprevisti</button>' : '') + tags.map(t => `<button data-a="scenTag" data-p="${esc(t)}">${esc(t)}</button>`).join('') + '</div><div id="scnList">' +
    L.map(s => `<div class="scn"><span class="tag">${s.tag} · ${esc(S.islById[s.isl].nm)}${GAME.log.some(l => l.nm === s.nm) ? ' · superato' : ''}</span><b>${esc(s.nm)}</b><p>${esc(s.desc)}${GOALS[s.id] ? '<br><span class="goaltxt">Obiettivo: ' + esc(GOALS[s.id][0]) + '</span>' : ''}</p><button class="btn hi" data-a="scenRun" data-p="${s.id}">Avvia</button></div>`).join('') + '</div>');
}
ACT.scenAll = () => scenMenu();
ACT.scenTag = p => { document.querySelectorAll('#mBody .dsel button').forEach(b => b.classList.toggle('on', b.dataset.p === p)); document.querySelectorAll('#scnList .scn').forEach(d => { d.style.display = d.querySelector('.tag').textContent.startsWith(p) ? '' : 'none'; }); };
ACT.scenRun = p => {
  const s = SCEN.find(x => x.id === p); closeModal();
  selectIsl(s.isl); s.run(); SCN_ACTIVE = s; goalStart(s); showScenBox(); if (!UI.lay.right) { UI.lay.right = true; applyLayout(); }
  soe(s.isl, 'SCENARIO: ' + s.nm, 2, null);
  toast('Scenario avviato: ' + s.nm, true);
};
function showScenBox() {
  let b = $('scnBox');
  if (!b) { b = document.createElement('div'); b.id = 'scnBox'; $('right').insertBefore(b, $('fp')); }
  if (!SCN_ACTIVE) { b.innerHTML = ''; return; }
  b.innerHTML = `<div class="sec" style="margin:6px 6px 0"><h5><span>Scenario · ${esc(SCN_ACTIVE.nm)}</span><button class="btn sm" data-a="scenClose">${ICO('x')}</button></h5><div class="bd" style="max-height:200px;overflow:auto"><div id="goalBox" class="goal"></div><details class="more"><summary>Cosa succede e come intervenire</summary><p class="note" style="color:#c9d6de">${esc(SCN_ACTIVE.hint)}</p></details></div></div>`;
}
ACT.scenClose = () => { SCN_ACTIVE = null; showScenBox(); };
