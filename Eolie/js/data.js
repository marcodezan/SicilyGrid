/* =====================================================================
   RETE ELETTRICA DELLE ISOLE EOLIE — dati di scenario
   Valori indicativi (didattici), plausibili per ordine di grandezza:
   non sono dati ufficiali dei gestori.
   Unità: potenze in kW (carichi) / MW (macchine), lunghezze in km.
   ===================================================================== */
const NET = {
  /* tipi di carico: [nome, cosφ, quota motori (dip. frequenza)] */
  loadTypes: {
    res: ['Residenziale', 0.95, 0.25],
    tur: ['Alberghi e ristorazione (climatizzazione)', 0.88, 0.55],
    com: ['Commerciale', 0.92, 0.35],
    ill: ['Illuminazione pubblica', 0.95, 0.0],
    srv: ['Servizi idrici / pompe', 0.85, 0.9],
    ess: ['Utenze essenziali (sanità, telecom.)', 0.92, 0.3],
    diss: ['Dissalatore (motori MT)', 0.86, 1.0]
  },

  islands: [
    {
      id: 'LIP', nm: 'Lipari', neutral: 'comp', plant: [38.4760, 14.9555],
      buses: [{ id: 'LIP.A', nm: 'Sbarra 20 kV sez. A' }, { id: 'LIP.B', nm: 'Sbarra 20 kV sez. B' }],
      couplers: [{ id: 'LIP.CPL', nm: 'Congiuntore sbarre A–B', a: 'LIP.A', b: 'LIP.B', mva: 16 }],
      gens: [
        { id: 'LIP.G1', bus: 'LIP.A', Pn: 3.2 }, { id: 'LIP.G2', bus: 'LIP.A', Pn: 3.2 },
        { id: 'LIP.G3', bus: 'LIP.A', Pn: 2.4 }, { id: 'LIP.G4', bus: 'LIP.B', Pn: 2.4 },
        { id: 'LIP.G5', bus: 'LIP.B', Pn: 1.6 }, { id: 'LIP.G6', bus: 'LIP.B', Pn: 1.6 }
      ],
      bess: [{ id: 'LIP.BESS', bus: 'LIP.B', Pn: 2.0, En: 4.0, mode: 'GFL' }],
      feeders: [
        { id: 'LIP.L1', nm: 'Lipari Centro', bus: 'LIP.A', ufls: 3, rec: false, nodes: [
          { nm: 'Marina Corta', ll: [38.4655, 14.9605], km: 0.8, t: 'c185', loads: { res: 500, tur: 500, com: 300, ill: 40 }, pv: 270 },
          { nm: 'Corso V. Emanuele', ll: [38.4680, 14.9540], km: 0.6, t: 'c185', loads: { res: 600, tur: 300, com: 450, ill: 40 }, pv: 330 },
          { nm: 'Ospedale e Municipio', ll: [38.4700, 14.9505], km: 0.5, t: 'c95', loads: { ess: 450, res: 200, ill: 20 }, pv: 180 },
          { nm: 'Diana', ll: [38.4632, 14.9488], km: 0.9, t: 'c95', loads: { res: 600, tur: 250, com: 150, ill: 30 }, pv: 360 }] },
        { id: 'LIP.L2', nm: 'Canneto – Acquacalda', bus: 'LIP.A', ufls: 2, rec: true, nodes: [
          { nm: 'Canneto', ll: [38.4890, 14.9590], km: 2.4, t: 'c95', loads: { res: 450, tur: 300, com: 150, ill: 30 }, pv: 330 },
          { nm: 'Porticello – Cave di pomice', ll: [38.5075, 14.9600], km: 2.2, t: 'a70', loads: { res: 150, srv: 100, tur: 80 }, pv: 120 },
          { nm: 'Acquacalda', ll: [38.5135, 14.9440], km: 1.7, t: 'a70', loads: { res: 200, tur: 120, com: 50, ill: 20 }, pv: 150 }] },
        { id: 'LIP.L3', nm: 'Pianoconte – Quattropani', bus: 'LIP.A', ufls: 4, rec: true, nodes: [
          { nm: 'Pianoconte', ll: [38.4705, 14.9320], km: 2.6, t: 'a70', loads: { res: 300, tur: 150, ill: 20 }, pv: 240 },
          { nm: 'Serbatoi Monte Gallina', ll: [38.4860, 14.9230], km: 2.1, t: 'a70', loads: { res: 120, srv: 150 }, pv: 90 },
          { nm: 'Quattropani', ll: [38.5020, 14.9180], km: 1.9, t: 'a70', loads: { res: 220, tur: 100, ill: 20 }, pv: 180 }] },
        { id: 'LIP.L4', nm: 'Marina Lunga – Porto', bus: 'LIP.B', ufls: 3, rec: false, nodes: [
          { nm: 'Marina Lunga', ll: [38.4722, 14.9575], km: 0.5, t: 'c185', loads: { res: 500, tur: 450, com: 300, ill: 30 }, pv: 300 },
          { nm: 'Porto e Sottomonastero', ll: [38.4680, 14.9625], km: 0.6, t: 'c185', loads: { com: 300, srv: 250, tur: 200 }, pv: 120 }] },
        { id: 'LIP.L5', nm: 'Dissalatore', bus: 'LIP.B', ufls: 1, rec: false, nodes: [
          { nm: 'Dissalatore Lipari', ll: [38.4795, 14.9590], km: 0.4, t: 'c185', loads: { diss: 1200 }, pv: 0, motor: true },
          { nm: 'Stazione di pompaggio', ll: [38.4835, 14.9560], km: 0.6, t: 'c95', loads: { srv: 200 }, pv: 0 }] }
      ],
      ties: [{ id: 'LIP.NA1', nm: 'Punto di apertura Acquacalda–Quattropani', a: 'LIP.L2.3', b: 'LIP.L3.3', km: 2.0, t: 'a70' }]
    },
    {
      id: 'VUL', nm: 'Vulcano', neutral: 'comp', plant: [38.4155, 14.9575],
      buses: [{ id: 'VUL.B', nm: 'Sbarra 20 kV Vulcano Porto' }],
      gens: [{ id: 'VUL.G1', bus: 'VUL.B', Pn: 1.0 }, { id: 'VUL.G2', bus: 'VUL.B', Pn: 1.0 }],
      bess: [],
      feeders: [
        { id: 'VUL.V1', nm: 'Porto – Vulcanello', bus: 'VUL.B', ufls: 2, rec: false, nodes: [
          { nm: 'Porto Levante', ll: [38.4180, 14.9612], km: 0.4, t: 'c95', loads: { res: 400, tur: 600, com: 300, ill: 30 }, pv: 360 },
          { nm: 'Vulcanello', ll: [38.4265, 14.9640], km: 1.1, t: 'c95', loads: { res: 150, tur: 300, ill: 15 }, pv: 180 },
          { nm: 'Porto Ponente', ll: [38.4172, 14.9530], km: 1.0, t: 'c95', loads: { tur: 350, com: 100 }, pv: 150 }] },
        { id: 'VUL.V2', nm: 'Piano – Gelso', bus: 'VUL.B', ufls: 3, rec: true, nodes: [
          { nm: 'Piano', ll: [38.3920, 14.9550], km: 3.2, t: 'a70', loads: { res: 250, tur: 100, srv: 80, ill: 15 }, pv: 210 },
          { nm: 'Gelso', ll: [38.3650, 14.9560], km: 3.4, t: 'a70', loads: { res: 80, tur: 40, ill: 5 }, pv: 60 }] }
      ],
      ties: []
    },
    {
      id: 'SAL', nm: 'Salina', neutral: 'iso', plant: [38.5700, 14.8600],
      buses: [{ id: 'SAL.B', nm: 'Sbarra 20 kV Salina' }],
      gens: [{ id: 'SAL.G1', bus: 'SAL.B', Pn: 1.6 }, { id: 'SAL.G2', bus: 'SAL.B', Pn: 1.6 }, { id: 'SAL.G3', bus: 'SAL.B', Pn: 1.0 }, { id: 'SAL.G4', bus: 'SAL.B', Pn: 1.0 }],
      bess: [{ id: 'SAL.BESS', bus: 'SAL.B', Pn: 1.0, En: 2.0, mode: 'GFL' }],
      feeders: [
        { id: 'SAL.S1', nm: 'Santa Marina – Lingua', bus: 'SAL.B', ufls: 3, rec: true, nodes: [
          { nm: 'Santa Marina Salina', ll: [38.5620, 14.8730], km: 1.6, t: 'c95', loads: { res: 350, tur: 400, com: 200, ill: 25 }, pv: 270 },
          { nm: 'Lingua', ll: [38.5420, 14.8710], km: 2.3, t: 'a70', loads: { res: 150, tur: 250, ill: 10 }, pv: 150 }] },
        { id: 'SAL.S2', nm: 'Malfa – Pollara', bus: 'SAL.B', ufls: 2, rec: true, nodes: [
          { nm: 'Malfa', ll: [38.5780, 14.8350], km: 2.4, t: 'a70', loads: { res: 300, tur: 350, com: 120, ill: 20 }, pv: 240 },
          { nm: 'Pollara', ll: [38.5800, 14.8050], km: 2.8, t: 'a70', loads: { res: 80, tur: 120, ill: 8 }, pv: 90 }] },
        { id: 'SAL.S3', nm: 'Leni – Rinella', bus: 'SAL.B', ufls: 4, rec: true, nodes: [
          { nm: 'Leni', ll: [38.5530, 14.8270], km: 3.1, t: 'a70', loads: { res: 200, tur: 100, srv: 120, ill: 12 }, pv: 150 },
          { nm: 'Rinella', ll: [38.5440, 14.8280], km: 1.2, t: 'a70', loads: { res: 120, tur: 200, com: 60, ill: 10 }, pv: 120 }] }
      ],
      ties: [{ id: 'SAL.NA1', nm: 'Punto di apertura Pollara–Leni', a: 'SAL.S2.2', b: 'SAL.S3.1', km: 3.0, t: 'a70' }]
    },
    {
      id: 'PAN', nm: 'Panarea', neutral: 'iso', plant: [38.6370, 15.0640],
      buses: [{ id: 'PAN.B', nm: 'Sbarra 20 kV Panarea' }],
      gens: [{ id: 'PAN.G1', bus: 'PAN.B', Pn: 1.0 }, { id: 'PAN.G2', bus: 'PAN.B', Pn: 1.0 }, { id: 'PAN.G3', bus: 'PAN.B', Pn: 0.8 }, { id: 'PAN.G4', bus: 'PAN.B', Pn: 0.5 }],
      bess: [],
      feeders: [
        { id: 'PAN.P1', nm: 'San Pietro – Ditella', bus: 'PAN.B', ufls: 2, rec: true, nodes: [
          { nm: 'San Pietro', ll: [38.6390, 15.0712], km: 0.8, t: 'c95', loads: { res: 200, tur: 450, com: 250, ill: 20 }, pv: 180 },
          { nm: 'Ditella', ll: [38.6460, 15.0670], km: 1.0, t: 'a70', loads: { tur: 250, res: 80, ill: 8 }, pv: 75 }] },
        { id: 'PAN.P2', nm: 'Drauto – Calcara', bus: 'PAN.B', ufls: 3, rec: true, nodes: [
          { nm: 'Drauto', ll: [38.6300, 15.0660], km: 0.9, t: 'a70', loads: { tur: 250, res: 120, srv: 100, ill: 10 }, pv: 90 },
          { nm: 'Calcara', ll: [38.6440, 15.0590], km: 1.6, t: 'a70', loads: { res: 40, tur: 60 }, pv: 30 }] }
      ],
      ties: []
    },
    {
      id: 'STR', nm: 'Stromboli', neutral: 'iso', plant: [38.8030, 15.2160],
      buses: [{ id: 'STR.B', nm: 'Sbarra 20 kV Stromboli' }],
      gens: [{ id: 'STR.G1', bus: 'STR.B', Pn: 0.8 }, { id: 'STR.G2', bus: 'STR.B', Pn: 0.8 }, { id: 'STR.G3', bus: 'STR.B', Pn: 0.5 }, { id: 'STR.G4', bus: 'STR.B', Pn: 0.5 }],
      bess: [{ id: 'STR.BESS', bus: 'STR.B', Pn: 0.5, En: 1.0, mode: 'GFL' }],
      feeders: [
        { id: 'STR.R1', nm: 'Scari – Ficogrande – Piscità', bus: 'STR.B', ufls: 2, rec: true, nodes: [
          { nm: 'Scari', ll: [38.8000, 15.2350], km: 1.4, t: 'c95', loads: { res: 150, tur: 250, com: 120, srv: 75 }, pv: 210 },
          { nm: 'Ficogrande', ll: [38.8032, 15.2300], km: 0.6, t: 'a70', loads: { res: 100, tur: 200, ill: 15 }, pv: 150 },
          { nm: 'Piscità', ll: [38.8060, 15.2205], km: 0.9, t: 'a70', loads: { res: 60, tur: 90, srv: 18 }, pv: 90 }] },
        { id: 'STR.R2', nm: 'San Vincenzo – San Bartolo', bus: 'STR.B', ufls: 3, rec: true, nodes: [
          { nm: 'San Vincenzo', ll: [38.8010, 15.2310], km: 1.2, t: 'c95', loads: { res: 120, tur: 150, com: 100, ill: 15 }, pv: 180 },
          { nm: 'San Bartolo', ll: [38.8075, 15.2265], km: 0.8, t: 'a70', loads: { res: 80, tur: 100, ill: 10 }, pv: 120 }] }
      ],
      ties: []
    },
    {
      id: 'GIN', nm: 'Ginostra', neutral: 'iso', plant: [38.7862, 15.1925], micro: true,
      buses: [{ id: 'GIN.B', nm: 'Quadro 20 kV microrete Ginostra' }],
      gens: [{ id: 'GIN.G1', bus: 'GIN.B', Pn: 0.16 }],
      bess: [{ id: 'GIN.BESS', bus: 'GIN.B', Pn: 0.15, En: 0.6, mode: 'GFM' }],
      feeders: [
        { id: 'GIN.G1L', nm: 'Ginostra paese', bus: 'GIN.B', ufls: 0, rec: false, nodes: [
          { nm: 'Ginostra paese', ll: [38.7868, 15.1935], km: 0.3, t: 'c95', loads: { res: 40, tur: 30, ill: 5, srv: 15 }, pv: 100 },
          { nm: 'Pontile', ll: [38.7852, 15.1888], km: 0.4, t: 'c95', loads: { com: 10, srv: 12 }, pv: 0 }] }
      ],
      ties: []
    },
    {
      id: 'FIL', nm: 'Filicudi', neutral: 'iso', plant: [38.5655, 14.5815],
      buses: [{ id: 'FIL.B', nm: 'Sbarra 20 kV Filicudi' }],
      gens: [{ id: 'FIL.G1', bus: 'FIL.B', Pn: 0.4 }, { id: 'FIL.G2', bus: 'FIL.B', Pn: 0.4 }, { id: 'FIL.G3', bus: 'FIL.B', Pn: 0.25 }],
      bess: [],
      feeders: [
        { id: 'FIL.F1', nm: 'Porto – Pecorini', bus: 'FIL.B', ufls: 2, rec: true, nodes: [
          { nm: 'Filicudi Porto', ll: [38.5648, 14.5842], km: 0.4, t: 'c95', loads: { res: 100, tur: 120, com: 40, ill: 8 }, pv: 90 },
          { nm: 'Pecorini Mare', ll: [38.5550, 14.5760], km: 1.6, t: 'a70', loads: { res: 50, tur: 80, ill: 5 }, pv: 45 }] },
        { id: 'FIL.F2', nm: 'Val di Chiesa – Zucco Grande', bus: 'FIL.B', ufls: 3, rec: true, nodes: [
          { nm: 'Val di Chiesa', ll: [38.5700, 14.5640], km: 1.8, t: 'a70', loads: { res: 60, srv: 40, ill: 5 }, pv: 30 },
          { nm: 'Zucco Grande', ll: [38.5800, 14.5700], km: 1.3, t: 'a70', loads: { res: 15 }, pv: 15 }] }
      ],
      ties: []
    },
    {
      id: 'ALI', nm: 'Alicudi', neutral: 'iso', plant: [38.5450, 14.3520],
      buses: [{ id: 'ALI.B', nm: 'Sbarra 20 kV Alicudi' }],
      gens: [{ id: 'ALI.G1', bus: 'ALI.B', Pn: 0.25 }, { id: 'ALI.G2', bus: 'ALI.B', Pn: 0.25 }, { id: 'ALI.G3', bus: 'ALI.B', Pn: 0.12 }],
      bess: [],
      feeders: [
        { id: 'ALI.A1', nm: 'Porto – Montagna', bus: 'ALI.B', ufls: 2, rec: true, nodes: [
          { nm: 'Alicudi Porto', ll: [38.5420, 14.3552], km: 0.3, t: 'c95', loads: { res: 70, tur: 50, com: 20, ill: 5, srv: 20 }, pv: 75 },
          { nm: 'Montagna (S. Bartolo)', ll: [38.5475, 14.3440], km: 1.1, t: 'a70', loads: { res: 30, srv: 15 }, pv: 45 }] }
      ],
      ties: []
    }
  ],

  /* cavi sottomarini e collegamenti tra sbarre di isole diverse */
  cables: [
    { id: 'CV1', nm: 'Cavo 20 kV Lipari–Vulcano n.1', a: 'LIP.B', b: 'VUL.B', km: 4.6, t: 'sub', mva: 5.5, on: true },
    { id: 'CV2', nm: 'Cavo 20 kV Lipari–Vulcano n.2', a: 'LIP.B', b: 'VUL.B', km: 4.8, t: 'sub', mva: 5.5, on: true },
    { id: 'CS1', nm: 'Cavo 20 kV Lipari–Salina (riserva)', a: 'LIP.A', b: 'SAL.B', km: 11.5, t: 'sub', mva: 6, on: false },
    { id: 'CRT', nm: 'Collegamento 150 kV Sicilia–Lipari (scenario futuro)', a: 'RTN', b: 'LIP.A', km: 40, t: 'hv', mva: 30, on: false }
  ],
  grid: { id: 'RTN', nm: 'RTN Sicilia · SE Sorgente/Milazzo 150 kV', ll: [38.224, 15.243], scc: 2500 },

  /* parametri dei conduttori: R, X [Ω/km], C [µF/km], portata [A] */
  cond: {
    c185: ['Cavo Al 185 mm²', 0.21, 0.11, 0.30, 360],
    c95: ['Cavo Al 95 mm²', 0.41, 0.12, 0.23, 250],
    a70: ['Linea aerea Al-Acc 70 mm²', 0.46, 0.38, 0.009, 230],
    sub: ['Cavo sottomarino 3x185 mm²', 0.16, 0.12, 0.28, 330],
    hv: ['Cavo 150 kV + TR 150/20 kV', 0, 0, 0, 0]
  }
};
