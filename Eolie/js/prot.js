'use strict';
/* =====================================================================
   INTERRUTTORI, GUASTI, PROTEZIONI, RICHIUSURA, ALLARMI, EVENTI (SOE)
   ===================================================================== */

/* ---------------- registro eventi (Sequence Of Events) ---------------- */
function soe(isl, text, prio, el) {
  if (S.settling) return;
  S.soe.push({ n: S.soe.length ? S.soe[S.soe.length - 1].n + 1 : 1, t: S.t, clk: S.clk, isl: isl && isl.id ? isl.id : isl, text, prio: prio || 1, el: el ? el.id : null });
  if (S.soe.length > 3000) S.soe.splice(0, 500);
}
/* ---------------- allarmi ---------------- */
function alarmRaise(key, prio, text, isl, el) {
  if (S.settling) return;
  S.alarms = S.alarms || {};
  const a = S.alarms[key];
  if (a && a.active) { a.text = text; return; }
  S.alarms[key] = { key, t: S.t, clk: S.clk, prio, text, isl: isl && isl.id ? isl.id : isl, el: el ? el.id : null, active: true, acked: false, n: (S.almN = (S.almN || 0) + 1) };
  S.almNew = (S.almNew || 0) + 1;
}
function alarmClear(key) { const a = S.alarms && S.alarms[key]; if (a && a.active) { a.active = false; a.tc = S.t; if (a.acked) delete S.alarms[key]; } }
function alarmAck(key) { const a = S.alarms[key]; if (!a) return; a.acked = true; if (!a.active) delete S.alarms[key]; }
function alarmCond(key, cond, prio, text, isl, el) { if (cond) alarmRaise(key, prio, text, isl, el); else alarmClear(key); }

/* ---------------- interruttori ---------------- */
const devClosed = d => d.st ? (d.st === 'C' || d.st === 'OP') : d.closed;
function brkBus(b) {
  const o = b.owner;
  if (o.el === 'gen' || o.el === 'bess' || o.el === 'fdr') return o.bus;
  if (o.el === 'br') return b === o.brkA ? o.a : o.b;
  return null;
}
function busBreakers(bus) {
  const L = [];
  bus.gens.forEach(g => L.push(g.brk)); bus.bess.forEach(b => L.push(b.brk)); bus.feeders.forEach(f => L.push(f.brk));
  bus.brs.forEach(br => { if (br.kind === 'cpl') L.push(br.brkA); else L.push(br.a === bus ? br.brkA : br.brkB); });
  return L;
}
function brkCmd(b, cmd, cause, by, rel) {
  if (cmd === 'O') {
    if (b.st === 'O' || b.st === 'OP') return true;
    if (b.st === 'CL') { b.st = 'O'; b.tmr = 0; return true; }
    if (by === 'PROT' || by === '50BF' || by === 'UFLS') b.trips++;
    if (b.stuck) {
      soe(b.isl, b.nm + ': COMANDO DI APERTURA NON ESEGUITO (' + cause + ') — interruttore bloccato', 3, b.owner);
      alarmRaise('stuck.' + b.id, 3, 'Mancata apertura ' + b.nm, b.isl, b.owner);
      if (b.bfT < 0) b.bfT = 0;
      return false;
    }
    b.st = 'OP'; b.tmr = b.tOpen; b.cause = cause; b.by = by;
    if (by === 'OP' && b.owner.el === 'fdr') { b.owner.rec.st = 'IDLE'; b.owner.shedBy = 'OP'; }
    return true;
  } else {
    if (b.st === 'C' || b.st === 'CL') return true;
    if (b.racked) { soe(b.isl, 'Chiusura ' + b.nm + ' NON ESEGUITA: interruttore estratto', 2, b.owner); S.lastRefuse = { t: S.t, id: b.id, msg: 'interruttore estratto' }; return false; }
    const ck = canClose(b, by);
    if (!ck[0]) { soe(b.isl, 'Chiusura ' + b.nm + ' NON ESEGUITA: ' + ck[1], 2, b.owner); S.lastRefuse = { t: S.t, id: b.id, msg: ck[1] }; return false; }
    b.st = 'CL'; b.tmr = b.tClose; b.cause = cause; b.by = by; b.ck = ck;
    if (by === 'OP' && b.owner.el === 'fdr') { b.owner.rec.st = 'IDLE'; b.owner.shedBy = ''; }
    return true;
  }
}
/* consenso alla chiusura: interblocchi + controllo di sincronismo (25) */
function syncData(b) {
  const o = b.owner;
  if (o.el === 'gen') {
    const bus = o.bus;
    return { live1: o.Eq * o.w > 0.5, live2: bus.live && bus.Vm > 0.1, df: o.w * 50 - bus.fm, dv: o.Eq * o.w - bus.Vm, dphi: wrapPi(o.d - bus.th), f1: o.w * 50, f2: bus.fm, v1: o.Eq * o.w, v2: bus.Vm };
  }
  if (o.el === 'br') {
    const me = b === o.brkA ? o.a : o.b, other = b === o.brkA ? o.b : o.a, otherBrk = b === o.brkA ? o.brkB : o.brkA;
    const farLive = (!otherBrk || devClosed(otherBrk)) && other.live;
    const same = farLive && me.live && me.area === other.area;
    return { live1: farLive, live2: me.live, df: (other.grid ? 50 : other.fm) - (me.grid ? 50 : me.fm), dv: other.Vm - me.Vm, dphi: wrapPi(other.th - me.th), same, f1: other.grid ? 50 : other.fm, f2: me.grid ? 50 : me.fm, v1: other.Vm, v2: me.Vm };
  }
  return null;
}
function canClose(b, by) {
  const o = b.owner;
  if (b.lock) return [false, 'blocco 86 attivo (reset richiesto)'];
  const bus = brkBus(b);
  if (bus && bus.lock) return [false, 'sbarra ' + bus.nm + ' in blocco 86 (protezione differenziale)'];
  if (o.el === 'gen') {
    if (o.blocked) return [false, 'gruppo in blocco (avaria da ripristinare)'];
    if (o.st !== 'PRONTO' && o.st !== 'IN PARALLELO') return [false, 'gruppo non pronto (stato: ' + o.st + ')'];
  }
  if (o.el === 'bess') {
    if (o.blocked) return [false, 'BESS in blocco'];
    if (o.mode === 'OFF') return [false, 'convertitore spento'];
    if (o.mode === 'GFL' && !o.bus.live) return [false, 'inverter grid-following: serve una rete già in tensione'];
    return [true, ''];
  }
  if (o.el === 'fdr') return [true, ''];
  if (o.el === 'br' && o.notBuilt) return [false, 'collegamento non ancora realizzato (modalità Gestione: va costruito dal cantiere)'];
  const r25 = (b.relays || []).concat(o.relays || []).find(r => r.code === '25');
  const sd = syncData(b);
  if (!sd) return [true, ''];
  if (!sd.live1 || !sd.live2) {
    if (o.el === 'gen' && !sd.live1) return [false, 'tensione macchina assente'];
    if (r25 && r25.en && !r25.set.dead) return [false, '25: chiusura su sbarra/linea morta non abilitata'];
    return [true, 'sbarra morta'];
  }
  if (sd.same) { if (Math.abs(sd.dphi) * 180 / Math.PI > 25 && r25 && r25.en && !r25.byp) return [false, '25: sfasamento tra le estremità ' + (sd.dphi * 180 / Math.PI).toFixed(0) + '° troppo elevato']; return [true, 'magliatura']; }
  if (r25 && r25.en && !r25.byp) {
    const p = r25.set;
    if (Math.abs(sd.df) > p.df) return [false, '25: Δf = ' + sd.df.toFixed(3) + ' Hz > ' + p.df + ' Hz'];
    if (Math.abs(sd.dv) > p.dv) return [false, '25: ΔV = ' + (sd.dv * 100).toFixed(1) + '% > ' + (p.dv * 100) + '%'];
    if (Math.abs(sd.dphi) * 180 / Math.PI > p.dphi) return [false, '25: Δφ = ' + (sd.dphi * 180 / Math.PI).toFixed(1) + '° > ' + p.dphi + '°'];
  }
  return [true, 'sincronismo'];
}
function brkStep(dt) {
  for (const b of S.brks) {
    if (b.st === 'C' && b.bfT < 0) continue;
    if (b.st === 'O' && b.bfT < 0) continue;
    if (b.st === 'OP') { b.tmr -= dt; if (b.tmr <= 0) { b.st = 'O'; b.ops++; S.topoDirty = true; S.feedDirty = true; brkChanged(b, false); } }
    else if (b.st === 'CL') {
      b.tmr -= dt;
      if (b.tmr <= 0) {
        if (b.failClose) { b.st = 'O'; soe(b.isl, b.nm + ': MANCATA CHIUSURA (bobina/meccanismo)', 3, b.owner); alarmRaise('fc.' + b.id, 2, 'Mancata chiusura ' + b.nm, b.isl, b.owner); continue; }
        b.st = 'C'; b.ops++; S.topoDirty = true; S.feedDirty = true; brkChanged(b, true);
      }
    }
    /* 50BF: mancata apertura */
    if (b.bfT >= 0) {
      b.bfT += dt;
      if (!devClosed(b)) b.bfT = -1;
      else if (b.bfT > 0.2) {
        b.bfT = -1;
        const bus = brkBus(b);
        soe(b.isl, '50BF MANCATA APERTURA ' + b.nm + ': apertura di tutti gli interruttori della ' + (bus ? bus.nm : 'sbarra'), 3, b.owner);
        alarmRaise('bf.' + b.id, 3, '50BF intervenuta: ' + b.nm, b.isl, b.owner);
        if (bus) { busBreakers(bus).forEach(x => { if (x !== b) { brkCmd(x, 'O', '50BF', '50BF'); if (x.owner.el === 'fdr') x.owner.shedBy = 'BUS'; } }); bus.lock = true; soe(b.isl, 'Blocco 86BF attivo su ' + bus.nm + ': estrarre l’interruttore guasto e resettare', 3, bus); }
        if (b.owner.el === 'br' && b.owner.kind !== 'cpl') { const other = b === b.owner.brkA ? b.owner.brkB : b.owner.brkA; if (other) brkCmd(other, 'O', '50BF teleinvio', '50BF'); }
        triggerRec(b.isl, '50BF ' + b.nm);
      }
    }
  }
}
/* estrazione/inserzione del carrello dell'interruttore (solo con l'impianto fuori tensione) */
function brkRack(b, out) {
  const bus = brkBus(b);
  if (out) {
    if (b.racked) return false;
    if (bus && bus.live && devClosed(b)) { soe(b.isl, 'Estrazione ' + b.nm + ' rifiutata: interruttore chiuso con sbarra in tensione', 2, b.owner); S.lastRefuse = { t: S.t, id: b.id, msg: 'interruttore chiuso in tensione' }; return false; }
    b.racked = true; b.st = 'O'; b.bfT = -1; S.topoDirty = true; S.feedDirty = true;
    soe(b.isl, b.nm + ': carrello ESTRATTO (sezionato)', 1, b.owner); return true;
  }
  if (!b.racked) return false;
  b.racked = false; soe(b.isl, b.nm + ': carrello INSERITO', 1, b.owner); return true;
}
function brkChanged(b, closed) {
  const o = b.owner;
  if (closed) { b.tCl = S.t; b.byCl = b.by; }
  soe(b.isl, b.nm + (closed ? ' CHIUSO' : ' APERTO') + (b.cause ? ' (' + b.cause + ')' : ''), b.by === 'PROT' || b.by === '50BF' || b.by === 'UFLS' ? 3 : 1, o);
  if (!closed) return;
  if (o.el === 'gen') {
    const dphi = Math.abs(wrapPi(o.d - o.bus.th)) * 180 / Math.PI, live = o.bus.live && o.bus.Vm > 0.1;
    o.closePhi = live ? dphi : 0;
    if (live && dphi > 60) { o.fault.shaft = true; soe(o.isl, o.nm + ': PARALLELO FUORI FASE (Δφ = ' + dphi.toFixed(0) + '°) — coppia di urto, danno meccanico al giunto', 3, o); alarmRaise('shaft.' + o.id, 3, o.nm + ' danno meccanico (parallelo fuori fase)', o.isl, o); o.shaftT = 0.5; }
    else if (live && dphi > 20) soe(o.isl, o.nm + ': parallelo con Δφ = ' + dphi.toFixed(0) + '° — sollecitazione elevata', 2, o);
    if (!live) soe(o.isl, o.nm + ': chiusura su sbarra morta (rimessa in tensione)', 2, o);
  }
  if (o.el === 'bess' && o.mode === 'GFM') {
    if (o.bus.live && o.bus.Vm > 0.1) { o.d = o.bus.th; o.w = (o.bus.fm || 50) / 50; o.Esoft = 1; o.Pref = o.P || 0; }
    else { o.Esoft = 0; o.d = 0; o.w = 1; soe(o.isl, o.nm + ': avvio grid-forming su sbarra morta (rampa di tensione)', 2, o); }
  }
}

/* ---------------- guasti ---------------- */
const FKIND = { LLL: 'trifase', LL: 'bifase', LG: 'monofase a terra' };
function faultName(f) {
  const e = f.el, x = f.loc;
  const where = x === 'seg' ? e.nm : x === 'tie' ? e.nm : x === 'node' ? 'cabina ' + e.nm : x === 'trq' ? 'trasformatore MT/BT cabina ' + e.nm : x === 'lv' ? 'rete BT cabina ' + e.nm : x === 'bus' ? e.nm : x === 'gen' ? 'terminali ' + e.nm : x === 'cab' ? e.nm : e.nm;
  return 'Guasto ' + FKIND[f.kind] + ' ' + (f.perm ? 'permanente' : 'transitorio') + ' · ' + where + (f.rf ? ' · Rf=' + f.rf + ' Ω' : '');
}
function injectFault(spec) {
  const el = typeof spec.el === 'string' ? S.byId[spec.el] : spec.el;
  if (!el) return null;
  const isl = el.isl || (el.a && (el.b.isl || el.a.isl));
  const f = { id: 'F' + (S.fN = (S.fN || 0) + 1), el, loc: spec.loc, kind: spec.kind || 'LLL', perm: spec.perm !== false, rf: spec.rf || 0, x: spec.x === undefined ? 0.5 : spec.x, isl, on: false, t0: S.t, tOn: 0, tOff: 0, bus: null, path: [], segs: [], fd: null, zp: ZERO, I1: null, I2: null };
  if (f.loc === 'trq' || f.loc === 'gen') f.kind = f.loc === 'gen' ? 'LLL' : f.kind;
  f.nm = faultName(f);
  S.faults.push(f);
  faultLocate(f);
  soe(isl, 'GUASTO: ' + f.nm, 3, el);
  triggerRec(isl, f.nm);
  return f;
}
function chainSegs(N) { const L = []; let n = N; while (n) { if (n.via) L.push(n.via); n = n.parent; } return L; }
function faultLocate(f) {
  const e = f.el;
  f.bus = null; f.path = []; f.segs = []; f.fd = null; f.zp = ZERO;
  if (f.loc === 'node' || f.loc === 'trq' || f.loc === 'lv') {
    if (!e.live) return;
    f.bus = e.headBus; f.fd = e.sup; f.zp = e.Zp; f.path = e.path.slice(); f.segs = chainSegs(e);
    if (f.loc !== 'node') { const zt = cx(0.003 / (e.kva / 1000), e.zt / (e.kva / 1000)); f.zp = cadd(f.zp, f.loc === 'lv' ? csc(zt, 1.6) : csc(zt, 0.3)); }
  } else if (f.loc === 'seg') {
    const up = e.up, dn = e.dn, F = e.fd;
    const upLive = up ? up.live : F.live, swc = e.sw ? e.sw.closed : true;
    if (upLive && swc) {
      f.bus = up ? up.headBus : F.bus; f.fd = up ? up.sup : F; f.zp = cadd(up ? up.Zp : ZERO, csc(e.z, f.x));
      f.path = (up ? up.path : [F.brk]).concat(e.sw ? [e.sw] : []); f.segs = (up ? chainSegs(up) : []).concat([e]);
    } else if (dn.live && dn.via !== e) {
      f.bus = dn.headBus; f.fd = dn.sup; f.zp = cadd(dn.Zp, csc(e.z, 1 - f.x)); f.path = dn.path.slice(); f.segs = chainSegs(dn).concat([e]);
    }
  } else if (f.loc === 'tie') {
    if (e.a.live) { f.bus = e.a.headBus; f.fd = e.a.sup; f.zp = cadd(e.a.Zp, csc(e.z, f.x)); f.path = e.a.path.slice(); f.segs = chainSegs(e.a).concat([e]); }
    else if (e.b.live && e.sw.closed) { f.bus = e.b.headBus; f.fd = e.b.sup; f.zp = cadd(e.b.Zp, csc(e.z, 1 - f.x)); f.path = e.b.path.concat([e.sw]); f.segs = chainSegs(e.b).concat([e]); }
  } else if (f.loc === 'bus') { f.bus = e; }
  else if (f.loc === 'gen') { f.bus = e.bus; f.path = [e.brk]; }
  else if (f.loc === 'cab') {
    if (devClosed(e.brkA) && e.a.live) { f.bus = e.a; f.zp = csc(e.z, f.x); f.path = [e.brkA]; }
    else if (devClosed(e.brkB) && e.b.live) { f.bus = e.b; f.zp = csc(e.z, 1 - f.x); f.path = [e.brkB]; }
  }
}
function faultsEnergize() {
  for (const F of S.feeders) { F.I0f = null; F.I0dir = 0; }
  for (const I of S.isl) { I.V0 = 0; I.Ig = 0; }
  for (const f of S.faults) {
    const was = f.on;
    f.on = !!(f.bus && f.bus.live && f.path.every(devClosed) && !f.gone);
    if (f.on && f.loc === 'gen' && !devClosed(f.el.brk)) f.on = false;
    if (!f.on) { f.I1 = null; f.I2 = null; f.Ifa = 0; }
    else if (f.loc === 'gen' || f.loc === 'bus' || f.loc === 'cab') { f.el._fon = S.n; }
    if (f.on !== was && !f.on) f.tOff = 0;
  }
}
function faultAdm(f, A) {
  const zf = cx(f.rf / ZB, 0);
  if (f.kind === 'LLL') return cinv(cadd(cadd(f.zp, zf), cx(1e-5, 0)));
  if (f.kind === 'LL') { const z2 = z2th(A); return z2 ? cinv(cadd(cadd(csc(f.zp, 2), z2), zf)) : cinv(cadd(csc(f.zp, 2), cx(0.5, 3))); }
  return null;
}
function areaY0(A) {
  let c = 0, coil = false, over = 0.1, loss = 0.04;
  A.isl.forEach(id => { const I = S.islById[id]; c += I.C0; if (I.coil.on) { coil = true; over = I.coil.over; loss = I.coil.loss; } });
  A.brs.forEach(br => { if (br.kind === 'cab') c += S.net.cond.sub[3] * br.km; });
  const B0 = WB * c * 1e-6 * ZB;
  let Y0 = cx(0, B0);
  if (coil) Y0 = cadd(Y0, cx(loss * B0, -(1 + over) * B0));
  return { Y0, B0 };
}
function faultCurrents(f, A) {
  const V = f.bus.V;
  if (f.kind === 'LLL' || f.kind === 'LL') {
    f.I1 = cmul(V, f.y);
    if (f.kind === 'LL') {
      f.I2 = csc(f.I1, -1);
      const z2 = z2th(A) || cx(0.5, 3);
      const V2 = cmul(z2, f.I1);
      A.buses.forEach(b => { if (!b.grid) b.V2 = cadd(b.V2, V2); });
    } else f.I2 = ZERO;
    const m = cabs(f.I1) * IB;
    f.Ifa = f.kind === 'LL' ? m * Math.sqrt(3) : m;
  } else {
    /* guasto a terra in rete a neutro isolato/compensato */
    const { Y0, B0 } = areaY0(A);
    const den = cadd(cx(1, 0), cmul(cx(3 * f.rf / ZB, 0), Y0));
    const I0 = cdiv(cmul(V, Y0), den), V0 = cdiv(csc(V, -1), den);
    A.buses.forEach(b => { if (!b.grid) b.V0 = cadd(b.V0, V0); });
    f.I1 = ZERO; f.I2 = ZERO; f.I0 = I0; f.Ifa = cabs(I0) * 3 * IB; f.V0 = V0;
    A.isl.forEach(id => { const I = S.islById[id]; I.V0 = cabs(V0); I.Ig = f.Ifa; });
    /* correnti omopolari viste dai montanti */
    S.feeders.forEach(F => {
      if (!F.live || !F.bus.live || F.bus.area !== A) return;
      const b0 = F.B0 || 0, own = cmul(cx(0, b0), V0);
      if (F === f.fd) { F.I0f = cadd(I0, own); F.I0dir = 1; }
      else { F.I0f = csc(own, -1); F.I0dir = -1; }
    });
    f.I0dirOk = true;
  }
  if (f.loc === 'cab') f.el._fI = f.Ifa;
}
/* aggiornamento lento: localizzazione, estinzione dei transitori, guasti BT/trasformatore */
function faultsSlow(dt) {
  S.faults.forEach(f => {
    faultLocate(f);
    if (f.on) { f.tOn += dt; f.tOff = 0; } else f.tOff += dt;
    const I = S.islById[f.isl];
    if (!f.perm) {
      if (!f.on && f.tOff > 0.12 && f.tOn > 0) f.gone = true;
      if (f.kind === 'LG' && f.on && I && I.coil.on && f.tOn > 0.25) { f.gone = true; soe(f.isl, 'Guasto a terra autoestinto (bobina di Petersen): ' + f.nm, 1, f.el); }
    }
    if (f.on && f.loc === 'trq' && f.tOn > 0.03) { f.el.fuse = false; f.gone = true; f.fuseBlown = true; soe(f.isl, 'Fusibili MT cabina ' + f.el.nm + ' INTERROTTI (guasto interno trasformatore)', 3, f.el); alarmRaise('fuse.' + f.el.id, 2, 'Cabina ' + f.el.nm + ' fuori servizio: fusibili MT interrotti', f.isl, f.el); }
    if (f.on && f.loc === 'lv' && f.tOn > 0.2) { f.el.lvOut = 0.4; f.gone = true; soe(f.isl, 'Interruttore BT cabina ' + f.el.nm + ' APERTO (guasto rete BT)', 2, f.el); alarmRaise('lv.' + f.el.id, 2, 'Cabina ' + f.el.nm + ': linea BT fuori servizio', f.isl, f.el); }
  });
  const before = S.faults.length;
  S.faults = S.faults.filter(f => {
    if (!f.gone) return true;
    if (!f.perm && !f.repaired && f.loc !== 'trq' && f.loc !== 'lv') soe(f.isl, 'Guasto transitorio estinto: ' + f.nm, 1, f.el);
    return false;
  });
  if (S.faults.length !== before) S.feedDirty = true;
}

/* ---------------- protezioni ---------------- */
const CURVES = { SI: [0.14, 0.02], VI: [13.5, 1], EI: [80, 2] };
function mkRel(el, code, nm, set, trips, opts) {
  const r = Object.assign({ id: el.id + '.' + code, el, code, nm, en: true, set, tAcc: 0, acc: 0, pk: false, op: false, led: false, trips, byp: false, last: '' }, opts || {});
  S.relays.push(r); S.byId[r.id] = r;
  trips.forEach(b => b.relays.push(r));
  (el.relays = el.relays || []).push(r);
  return r;
}
function protGen(G) {
  const In = G.Sn * IB, T = [G.brk];
  mkRel(G, '87G', 'Differenziale generatore', { t: 0.03 }, T);
  mkRel(G, '51V', 'Massima corrente a ritenuta di tensione', { k: 1.4, t: 0.9 }, T);
  mkRel(G, '32', 'Ritorno di energia', { P: 0.06, t: 3 }, T);
  mkRel(G, '40', 'Perdita di eccitazione', { Q: 0.35, t: 1.0 }, T);
  mkRel(G, '46', 'Squilibrio (sequenza inversa)', { I2: 0.15, t: 4 }, T);
  mkRel(G, '78', 'Perdita di passo', { ang: 140 }, T);
  mkRel(G, '81O', 'Massima frequenza', { f: 52.0, t: 2.0 }, T);
  mkRel(G, '81U', 'Minima frequenza', { f: 47.0, t: 2.0 }, T);
  mkRel(G, '59', 'Massima tensione', { V: 1.15, t: 1.5 }, T);
  mkRel(G, '27', 'Minima tensione', { V: 0.70, t: 3.0 }, T);
  mkRel(G, '12', 'Sovravelocità (arresto motore)', { w: 1.12 }, T);
  mkRel(G, '26', 'Temperatura acqua motore (arresto)', { T: 98 }, T);
  mkRel(G, '63', 'Pressione olio minima (arresto)', { p: 1.2, t: 2 }, T);
  mkRel(G, '25', 'Controllo di sincronismo', { df: 0.2, dv: 0.08, dphi: 12, dead: true }, []);
  G.In = In;
}
function protBess(B) {
  const T = [B.brk];
  mkRel(B, 'SPI', 'Protezione di interfaccia (81/27/59)', { fmin: 47.5, fmax: 51.5, vmin: 0.5, vmax: 1.15, tf: 0.1, tv: 0.6 }, T);
  mkRel(B, 'BMS', 'Protezioni batteria (SoC, temperatura)', { soc: 1, T: 50 }, T);
}
function protBr(br) {
  const T = [br.brkA].concat(br.brkB ? [br.brkB] : []);
  if (br.kind === 'cpl') { mkRel(br, '51', 'Massima corrente congiuntore', { Is: Math.round(br.Imax * 1.2), tms: 0.15, curve: 'SI' }, T); }
  else {
    mkRel(br, '87L', 'Differenziale di linea (cavo)', { t: 0.04 }, T);
    mkRel(br, '51', 'Massima corrente di riserva', { Is: Math.round(br.Imax * 1.25), tms: 0.15, curve: 'SI' }, T);
    mkRel(br, '49', 'Immagine termica cavo', { k: 1.05, tau: 120 }, T);
  }
  br.brkA.relays.push(mkRel(br, '25', 'Controllo di sincronismo', { df: 0.12, dv: 0.08, dphi: 15, dead: true }, [], { side: 'A' }));
  if (br.brkB) br.brkB.relays.push(br.brkA.relays[br.brkA.relays.length - 1]);
}
/* nuovo interruttore su una sbarra: entra nello schema della differenziale 87B */
function bus87Add(bus, brk) {
  const r = (bus.relays || []).find(x => x.code === '87B');
  if (r && r.trips.indexOf(brk) < 0) { r.trips.push(brk); brk.relays.push(r); }
}
/* rimozione di un componente: relè, interruttori, voci di indice */
function relRemoveEl(el) {
  const mine = S.relays.filter(r => r.el === el);
  S.relays = S.relays.filter(r => r.el !== el);
  mine.forEach(r => { delete S.byId[r.id]; S.brks.forEach(b => { const i = b.relays.indexOf(r); if (i >= 0) b.relays.splice(i, 1); }); });
}
function brkRemove(b) {
  S.brks = S.brks.filter(x => x !== b); delete S.byId[b.id];
  S.relays.forEach(r => { const i = r.trips.indexOf(b); if (i >= 0) r.trips.splice(i, 1); });
}
function buildProt() {
  S.relays = [];
  S.isl.forEach(I => {
    const gmin = Math.min.apply(null, I.gens.map(g => g.Sn).concat([9]));
    I.ufls = { en: !I.micro, stages: [{ f: 49.0, t: 0.15 }, { f: 48.7, t: 0.15 }, { f: 48.4, t: 0.15 }, { f: 48.1, t: 0.15 }], rocof: { en: false, df: -1.5, t: 0.2 }, st: [0, 0, 0, 0], acc: [0, 0, 0, 0] };
    I.feeders.forEach(F => {
      let pk = 0; F.nodes.forEach(N => { for (const k in N.loads) pk += N.loads[k]; });
      const Ipk = pk / 1000 / 0.92 * IB;
      F.Ipk = Ipk;
      F.B0 = F.segs.reduce((a, s) => a + s.bsh, 0);
      const mot = F.nodes.filter(N => N.motor).reduce((a, N) => a + N.motor.Pn, 0);
      const Iinr = mot / 1000 / 0.86 * 5.8 * IB;
      const is51 = Math.max(8, Math.round(Ipk * 1.5 / 5) * 5);
      let is50 = Math.max(is51 * 3, Math.round(gmin / 0.32 * IB * 1.2 / 10) * 10);
      if (mot) is50 = Math.max(is50, Math.round(Iinr * 1.5 / 10) * 10);
      mkRel(F, '50', 'Massima corrente istantanea I>>', { Is: is50, t: 0.08 }, [F.brk]);
      mkRel(F, '51', 'Massima corrente a tempo inverso I>', mot ? { Is: Math.round(Ipk * 1.25 / 5) * 5, tms: 2.0, curve: 'EI' } : { Is: is51, tms: 0.08, curve: 'SI' }, [F.brk]);
      mkRel(F, '67N', 'Direzionale di terra I0>', { Is: I.coil.on ? 1.0 : 2.0, V0: 0.05, t: I.coil.on ? 0.8 : 0.45 }, [F.brk]);
      mkRel(F, '51N', 'Massima corrente omopolare (non direz.)', { Is: 4, t: 0.5 }, [F.brk], { en: false });
      mkRel(F, '27', 'Apertura per mancanza tensione', { V: 0.25, t: 1.5 }, [F.brk]);
      mkRel(F, '81U', 'Alleggerimento carico (UFLS)', {}, [F.brk], { en: F.ufls > 0 });
      F.rel79 = mkRel(F, '79', 'Richiusura automatica', { t1: 0.5, t2: 15, rcl: 6 }, [], { en: F.recEn });
    });
    I.gens.forEach(G => protGen(G));
    I.bess.forEach(B => protBess(B));
    I.buses.forEach(B => { mkRel(B, '87B', 'Differenziale di sbarra', { t: 0.06 }, busBreakers(B)); });
  });
  S.br.forEach(br => protBr(br));
}
function relOperate(r, why) {
  r.op = true; r.led = true; r.last = why; r.tOp = S.t;
  const el = r.el, isl = el.isl || (el.a && (el.b.isl || el.a.isl));
  const nm = el.short ? el.nm : el.nm;
  soe(isl, 'PROTEZIONE ' + r.code + ' ' + nm + ': SCATTO (' + why + ')', 3, el);
  alarmRaise('rel.' + r.id, r.code === '81U' && el.el === 'fdr' ? 2 : 3, 'Scatto ' + r.code + ' ' + nm + ' — ' + why, isl, el);
  r.trips.forEach(b => brkCmd(b, 'O', r.code + ' ' + why, r.code === '81U' && el.el === 'fdr' ? 'UFLS' : 'PROT', r));
  if (el.el === 'fdr') {
    el.shedAt = S.t;
    if (r.code === '81U') { el.shedBy = 'UFLS'; el.rec.st = 'IDLE'; if (el.rT && S.t - el.rT < 8) { el.rk = Math.min(3, (el.rk || 1) * 1.35); soe(el.isl, 'EMS: rialimentazione di ' + el.nm + ' non riuscita, al prossimo tentativo servirà più riserva', 2, el); } if (el.brk.byCl === 'OP' && S.t - (el.brk.tCl || -9) < 4) { S.hint = { t: S.t, el: el.id, msg: el.nm + ' è riscattata per sottofrequenza subito dopo la chiusura: i gruppi in servizio non reggono il carico ripreso. Avvia altri gruppi oppure rialimenta a tronchi (apri gli IMS e chiudi una cabina alla volta).' }; } }
    else if (r.code === '27') { el.shedBy = '27'; el.rec.st = 'IDLE'; }
    else recOnTrip(el);
  }
  if (el.el === 'gen') {
    el.lastTrip = r.code + ' ' + why;
    /* protezioni con blocco 86G: arresto del motore e consenso al riavvio solo dopo reset */
    if (['87G', '12', '26', '63', '40', '46', '78'].indexOf(r.code) >= 0) { emergencyStop(el, r.code); el.blocked = true; }
  }
  if (el.el === 'bus') { el.lock = true; el.feeders.forEach(F => { F.shedBy = 'BUS'; F.rec.st = 'IDLE'; }); }
  triggerRec(isl, r.code + ' ' + nm);
}
const LOGPK = { '50': 1, '51': 1, '67N': 1, '51N': 1, '87G': 1, '87L': 1, '87B': 1 };
/* avviamento / scatto a tempo definito. why(r) è una funzione statica: nessuna closure per passo */
function relPick(r, cond, t, why, dt) {
  if (cond) {
    if (!r.pk) { r.pk = true; r.tAcc = 0; if (LOGPK[r.code]) soe(r.el.isl || (r.el.a && (r.el.b.isl || r.el.a.isl)), 'Avviamento ' + r.code + ' ' + r.el.nm + ' (' + why(r) + ')', 2, r.el); }
    r.tAcc += dt;
    if (r.tAcc >= t && !r.op) relOperate(r, why(r));
  } else if (r.pk || r.op) { r.pk = false; r.tAcc = 0; r.op = false; }
}
function idmt(r, I, dt) {
  const p = r.set, m = I / p.Is;
  if (m > 1.05) {
    const [k, a] = CURVES[p.curve] || CURVES.SI;
    const top = p.curve === 'DT' ? p.tms : p.tms * k / (Math.pow(m, a) - 1);
    if (!r.pk) { r.pk = true; r.acc = 0; }
    r.acc += dt / Math.max(top, 0.02);
    if (r.acc >= 1 && !r.op) relOperate(r, 'I=' + Math.round(I) + ' A');
  } else { if (r.pk) { r.pk = false; r.op = false; } if (r.acc > 0) r.acc = Math.max(0, r.acc - dt * 2); }
}
const fI0 = F => F.I0f ? cabs(F.I0f) * 3 * IB : 0;
const WHY = {
  f50: r => 'I=' + Math.round(r.el.Iamp) + ' A',
  f67N: r => '3I0=' + fI0(r.el).toFixed(1) + ' A, V0=' + (S.islById[r.el.isl].V0 * 100).toFixed(0) + '%',
  f51N: r => '3I0=' + fI0(r.el).toFixed(1) + ' A',
  f27: r => 'V=' + r.el.bus.Vm.toFixed(2) + ' pu',
  f81U: r => { const e = r.el, U = S.islById[e.isl].ufls, st = U.stages[e.ufls - 1]; return r._rc ? 'df/dt=' + e.bus.rocof.toFixed(2) + ' Hz/s' : 'f=' + e.bus.fm.toFixed(2) + ' Hz < ' + st.f; },
  g87G: () => 'guasto interno',
  g51V: r => 'I=' + Math.round(r.el.Ia) + ' A, V=' + r.el.bus.Vm.toFixed(2),
  g32: r => 'P=' + (r.el.Pe * 1000).toFixed(0) + ' kW',
  g40: r => 'Q=' + (r.el.Qe * 1000).toFixed(0) + ' kvar',
  g46: r => 'I2=' + Math.round(r.el.I2a || 0) + ' A',
  g78: r => 'angolo rotore ' + (Math.abs(wrapPi(r.el.d - r.el.bus.th)) * 180 / Math.PI).toFixed(0) + '°',
  gf: r => 'f=' + r.el.bus.fm.toFixed(2) + ' Hz',
  g59: r => 'V=' + r.el.bus.Vm.toFixed(3) + ' pu',
  g27: r => 'V=' + r.el.bus.Vm.toFixed(2) + ' pu',
  g12: r => 'n=' + Math.round(r.el.w * r.el.rpm) + ' giri/min',
  g26: r => 'T acqua ' + r.el.Tc.toFixed(0) + ' °C',
  g63: r => 'p olio ' + r.el.oil.toFixed(1) + ' bar',
  spi: r => r._why + ' (f=' + (r.el.bus.fs || r.el.bus.fm).toFixed(2) + ' Hz, V=' + r.el.bus.Vm.toFixed(2) + ')',
  bms: r => { const B = r.el; return B.Tcell > r.set.T ? 'temperatura celle ' + B.Tcell.toFixed(0) + ' °C' : B.ovT > 1.5 ? 'sovraccarico convertitore' : B.fault.trip ? 'allarme BMS' : 'SoC esaurito'; },
  b87B: () => 'guasto in zona sbarra',
  l87L: () => 'corrente differenziale',
  l49: r => 'sovraccarico termico ' + Math.round(Math.sqrt(r.el.th) * 100) + '%'
};
function protStep(dt) {
  if (S.settling || !S.set.prot) return;
  const R = S.relays;
  for (let i = 0; i < R.length; i++) {
    const r = R[i];
    if (!r.en) { r.pk = false; continue; }
    const e = r.el, p = r.set, c = r.code;
    switch (e.el) {
      case 'fdr': {
        const live = devClosed(e.brk) && e.bus.live;
        if (c === '50') relPick(r, live && e.Iamp > p.Is, p.t, WHY.f50, dt);
        else if (c === '51') { if (live) idmt(r, S.t - (e.brk.tCl || -99) < 60 ? e.Iamp / 2 : e.Iamp, dt); else if (r.pk || r.op || r.acc) { r.pk = false; r.acc = 0; r.op = false; } }
        else if (c === '67N') relPick(r, live && e.I0f !== null && e.I0dir > 0 && fI0(e) > p.Is && S.islById[e.isl].V0 > p.V0, p.t, WHY.f67N, dt);
        else if (c === '51N') relPick(r, live && e.I0f !== null && fI0(e) > p.Is, p.t, WHY.f51N, dt);
        else if (c === '27') relPick(r, devClosed(e.brk) && e.bus.Vm < p.V, p.t, WHY.f27, dt);
        else if (c === '81U') {
          const U = S.islById[e.isl].ufls; if (!U.en || !e.ufls) { r.pk = false; break; }
          const st = U.stages[e.ufls - 1]; if (!st) break;
          const rc = U.rocof.en && e.ufls <= 2 && e.bus.rocof < U.rocof.df;
          r._rc = rc;
          relPick(r, live && e.bus.Vm > 0.5 && (e.bus.fm < st.f || rc), rc ? U.rocof.t : st.t, WHY.f81U, dt);
        }
        break;
      }
      case 'gen': {
        const G = e, cl = devClosed(G.brk), on = cl && G.bus.live, run = genRunning(G);
        /* gruppo fermo e separato: nessuna condizione può essere vera */
        if (!cl && !run && !r.pk && !r.op && G._fon !== S.n) break;
        if (c === '87G') relPick(r, G._fon === S.n, p.t, WHY.g87G, dt);
        else if (c === '51V') { const V = G.bus.Vm, kk = V < 0.8 ? Math.max(0.25, V / 0.8) : 1; relPick(r, on && G.Ia > p.k * G.In * kk, p.t, WHY.g51V, dt); }
        else if (c === '32') relPick(r, on && G.Pe < -p.P * G.Pn, p.t, WHY.g32, dt);
        else if (c === '40') relPick(r, on && G.Qe < -p.Q * G.Sn, p.t, WHY.g40, dt);
        else if (c === '46') relPick(r, on && (G.I2a || 0) > p.I2 * G.In, p.t, WHY.g46, dt);
        else if (c === '78') relPick(r, on && Math.abs(wrapPi(G.d - G.bus.th)) * 180 / Math.PI > p.ang, 0, WHY.g78, dt);
        else if (c === '81O') relPick(r, on && G.bus.Vm > 0.3 && G.bus.fm > p.f, p.t, WHY.gf, dt);
        else if (c === '81U') relPick(r, on && G.bus.Vm > 0.3 && G.bus.fm < p.f && G.bus.fm > 10, p.t, WHY.gf, dt);
        else if (c === '59') relPick(r, on && G.bus.Vm > p.V, p.t, WHY.g59, dt);
        else if (c === '27') relPick(r, cl && G.bus.Vm < p.V, p.t, WHY.g27, dt);
        else if (c === '12') relPick(r, run && G.w > p.w, 0.02, WHY.g12, dt);
        else if (c === '26') relPick(r, run && G.Tc > p.T, 0.5, WHY.g26, dt);
        else if (c === '63') relPick(r, run && G.st !== 'ACCELERAZIONE' && G.oil < p.p, p.t, WHY.g63, dt);
        break;
      }
      case 'bess': {
        const B = e, on = devClosed(B.brk);
        if (c === 'SPI') {
          const f = B.bus.fs || B.bus.fm, v = B.bus.Vm;
          /* sotto 0,5 pu la misura di frequenza non è affidabile: restano solo i criteri di tensione */
          const fok = v > 0.5;
          const why = !B.bus.live ? 'mancanza tensione' : fok && f > p.fmax ? 'f>' + p.fmax : fok && f < p.fmin ? 'f<' + p.fmin : v < p.vmin ? 'V<' + p.vmin : v > p.vmax ? 'V>' + p.vmax : '';
          r._why = why;
          relPick(r, on && !!why && !(B.mode === 'GFM' && !B.bus.live), why.charCodeAt(0) === 86 ? p.tv : p.tf, WHY.spi, dt);
        } else if (c === 'BMS') {
          const lim = B.mode === 'GFM' && B.P > (B.fault.derate ? 0.5 : 1) * B.Pn * 1.25;
          if (lim) B.ovT += dt; else B.ovT = 0;
          relPick(r, on && (B.soc <= p.soc && B.P > 0.01 * B.Pn || B.Tcell > p.T || B.ovT > 1.5 || B.fault.trip), 0.05, WHY.bms, dt);
        }
        break;
      }
      case 'bus': {
        if (c === '87B') relPick(r, e._fon === S.n, p.t, WHY.b87B, dt);
        break;
      }
      case 'br': {
        const br = e, on = brClosed(br) || devClosed(br.brkA) || (br.brkB && devClosed(br.brkB));
        if (c === '87L') relPick(r, br._fon === S.n, p.t, WHY.l87L, dt);
        else if (c === '51') { const I = br.I + (br._fon === S.n ? br._fI : 0); if (on) idmt(r, I, dt); }
        else if (c === '49') {
          br.th += ((br.load * br.load) - br.th) * dt / p.tau;
          relPick(r, on && br.th > p.k * p.k, 0, WHY.l49, dt);
        }
        break;
      }
    }
  }
  /* sequenza inversa nei generatori */
  for (const G of S.gens) { const V2 = G.bus.V2; G.I2a = devClosed(G.brk) && V2 && (V2.r || V2.i) ? cabs(V2) / ((G.x2 + G.xt) / G.Sn) * IB : 0; }
  /* indicatori di passaggio guasto (RGDAT) */
  for (const f of S.faults) {
    if (!f.on) continue;
    f.segs.forEach(sg => {
      const lg = f.kind === 'LG';
      if ((lg && f.Ifa > 1.0) || (!lg && f.Ifa > 60)) { sg.fpi.t += dt; if (sg.fpi.t > 0.04 && !sg.fpi.flag) { sg.fpi.flag = true; sg.fpi.lg = lg; sg.fpi.at = S.t; soe(sg.isl, 'RGDAT: passaggio guasto ' + (lg ? 'a terra' : 'polifase') + ' rilevato su ' + sg.nm, 2, sg); } }
      sg.If = f.Ifa;
    });
  }
  /* richiusura automatica */
  for (const F of S.feeders) arStep(F, dt);
  /* motore rotto dopo parallelo fuori fase */
  for (const G of S.gens) { if (G.fault.shaft && G.shaftT > 0) { G.shaftT -= dt; if (G.shaftT <= 0) { G.shaftT = 0; brkCmd(G.brk, 'O', 'vibrazioni elevate / danno meccanico', 'PROT'); emergencyStop(G, 'danno meccanico'); G.blocked = true; } } }
}
/* richiusura rapida + lenta (79) */
function recOnTrip(F) {
  const r = F.rel79; if (!r || !r.en) { F.rec.st = 'IDLE'; return; }
  const R = F.rec;
  if (R.st === 'IDLE') { R.st = 'PAUSA RAPIDA'; R.t = 0; soe(F.isl, '79 ' + F.nm + ': ciclo di richiusura avviato (pausa rapida ' + r.set.t1 + ' s)', 1, F); }
  else if (R.st === 'RECUPERO 1') { R.st = 'PAUSA LENTA'; R.t = 0; soe(F.isl, '79 ' + F.nm + ': richiusura rapida fallita, pausa lenta ' + r.set.t2 + ' s', 2, F); }
  else if (R.st === 'RECUPERO 2' || R.st === 'PAUSA LENTA' || R.st === 'PAUSA RAPIDA') { R.st = 'DEFINITIVO'; R.t = 0; soe(F.isl, '79 ' + F.nm + ': SCATTO DEFINITIVO (guasto permanente)', 3, F); alarmRaise('def.' + F.id, 3, 'Scatto definitivo ' + F.nm, F.isl, F); F.shedBy = 'DEF'; }
}
function arStep(F, dt) {
  const R = F.rec, r = F.rel79; if (!r) return;
  R.t += dt;
  if (R.st === 'PAUSA RAPIDA' && R.t > r.set.t1) { if (F.bus.live && !devClosed(F.brk)) { R.st = 'RECUPERO 1'; R.t = 0; brkCmd(F.brk, 'C', '79 richiusura rapida', '79'); } }
  else if (R.st === 'PAUSA LENTA' && R.t > r.set.t2) { if (F.bus.live && !devClosed(F.brk)) { R.st = 'RECUPERO 2'; R.t = 0; brkCmd(F.brk, 'C', '79 richiusura lenta', '79'); } }
  else if ((R.st === 'RECUPERO 1' || R.st === 'RECUPERO 2') && R.t > r.set.rcl && devClosed(F.brk)) { soe(F.isl, '79 ' + F.nm + ': richiusura RIUSCITA', 1, F); R.st = 'IDLE'; F.shedBy = ''; }
}
function relReset(el) {
  (el.relays || []).forEach(r => { r.led = false; r.op = false; alarmClear('rel.' + r.id); });
  if (el.el === 'bus' && el.lock) { el.lock = false; soe(el.isl, 'Reset blocco 86 ' + el.nm, 1, el); }
  if (el.el === 'fdr') { alarmClear('def.' + el.id); if (el.rec.st === 'DEFINITIVO') el.rec.st = 'IDLE'; }
  if (el.el === 'gen') { if (el.blocked && !Object.keys(el.fault).some(k => el.fault[k])) { el.blocked = false; alarmClear('nostart.' + el.id); soe(el.isl, el.nm + ': reset blocco', 1, el); } }
  if (el.el === 'bess') { if (el.blocked && !Object.keys(el.fault).some(k => el.fault[k])) el.blocked = false; }
}
