'use strict';
/* =====================================================================
   MAPPA GEOGRAFICA DELLA RETE e MINIMAPPA DELL'ARCIPELAGO
   (coordinate in km, proiezione equirettangolare dei contorni reali)
   ===================================================================== */
const MAP = { hits: [] };
const projLL = ll => [(ll[1] - GEO.LON0) * GEO.KX, (GEO.LAT0 - ll[0]) * GEO.KY];
const GEOISL = { LIP: 'LIP', VUL: 'VUL', SAL: 'SAL', PAN: 'PAN', STR: 'STR', GIN: 'STR', FIL: 'FIL', ALI: 'ALI' };
function islBox(id) {
  const G = GEO.isl[GEOISL[id]]; const c = G.c, bb = G.bb;
  return [c[0] + bb[0], c[1] + bb[1], c[0] + bb[2], c[1] + bb[3]];
}
function mapFit(id) {
  const cv = SLD, b = islBox(id);
  let x0 = b[0], y0 = b[1], x1 = b[2], y1 = b[3];
  if (id === 'GIN') { const p = projLL(S.islById.GIN.plant); x0 = p[0] - 1.2; x1 = p[0] + 1.2; y0 = p[1] - 1; y1 = p[1] + 1; }
  const z = Math.max(3, Math.min((Math.max(cv.w, 300) - 60) / (x1 - x0), (Math.max(cv.h, 240) - 60) / (y1 - y0)));
  UI.view['map:' + id] = { z, ox: cv.w / 2 - (x0 + x1) / 2 * z, oy: cv.h / 2 - (y0 + y1) / 2 * z };
}
function polyPath(g, ring, X, Y, dx, dy) { ring.forEach((p, i) => { const x = X(p[0] + dx), y = Y(p[1] + dy); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); }
function mapDraw() {
  const g = SLD.g, key = 'map:' + UI.isl;
  if (!UI.view[key]) mapFit(UI.isl);
  mapAnimStep(key);
  const v = UI.view[key], X = x => x * v.z + v.ox, Y = y => y * v.z + v.oy;
  /* sfondo statico (mare, griglia, terraferma, isole) in cache: si ridisegna solo se cambia la vista */
  const bgKey = v.z.toFixed(4) + ',' + v.ox.toFixed(1) + ',' + v.oy.toFixed(1) + ',' + SLD.w + ',' + SLD.h + ',' + SLD.dpr + ',' + UI.isl;
  if (!MAP.bg || MAP.bgKey !== bgKey) {
    const bc = MAP.bg || (MAP.bg = document.createElement('canvas'));
    if (bc.width !== SLD.cv.width || bc.height !== SLD.cv.height) { bc.width = SLD.cv.width; bc.height = SLD.cv.height; }
    const b = bc.getContext('2d');
    b.setTransform(SLD.dpr, 0, 0, SLD.dpr, 0, 0);
    const sea = b.createLinearGradient(0, 0, 0, SLD.h); sea.addColorStop(0, '#061722'); sea.addColorStop(1, '#04101a');
    b.fillStyle = sea; b.fillRect(0, 0, SLD.w, SLD.h);
    /* griglia 1 km / 5 km */
    const step = v.z > 60 ? 1 : 5;
    b.strokeStyle = 'rgba(54,185,255,.05)'; b.lineWidth = 1; b.beginPath();
    for (let x = Math.floor(-v.ox / v.z / step) * step; X(x) < SLD.w; x += step) { b.moveTo(X(x), 0); b.lineTo(X(x), SLD.h); }
    for (let y = Math.floor(-v.oy / v.z / step) * step; Y(y) < SLD.h; y += step) { b.moveTo(0, Y(y)); b.lineTo(SLD.w, Y(y)); }
    b.stroke();
    /* terraferma (Sicilia, Calabria) */
    GEO.land.forEach(r => { b.beginPath(); polyPath(b, r, X, Y, 0, 0); b.fillStyle = '#0f1d1f'; b.fill(); b.strokeStyle = '#25424a'; b.lineWidth = 1; b.stroke(); });
    GEO.places.forEach(p => { txt(b, p[0], X(p[1]) + 5, Y(p[2]) + 3, '#3d6570', '10px ' + FONTS); b.fillStyle = '#3d6570'; b.fillRect(X(p[1]) - 2, Y(p[2]) - 2, 4, 4); });
    Object.keys(GEO.isl).forEach(gid => {
      const G = GEO.isl[gid], I = S.islById[gid];
      b.beginPath(); G.polys.forEach(r => polyPath(b, r, X, Y, G.c[0], G.c[1]));
      b.fillStyle = '#132a28'; b.fill();
      b.strokeStyle = I && UI.isl === gid ? '#7fd1c8' : '#36706b'; b.lineWidth = I && UI.isl === gid ? 2 : 1.2; b.stroke();
      if (v.z < 25) txt(b, I ? I.nm.toUpperCase() : gid, X(G.c[0]), Y(G.c[1] + G.bb[1]) - 6, '#8fb6c4', '600 11px ' + FONTS, 'center');
    });
    MAP.bgKey = bgKey;
  }
  g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(MAP.bg, 0, 0);
  g.setTransform(SLD.dpr, 0, 0, SLD.dpr, 0, 0);
  MAP.hits = []; MAP.lbl = [];
  Object.keys(GEO.isl).forEach(gid => {
    const G = GEO.isl[gid], I = S.islById[gid];
    if (I) MAP.hits.push({ isl: gid, el: I, x: X(G.c[0] + G.bb[0]), y: Y(G.c[1] + G.bb[1]), w: (G.bb[2] - G.bb[0]) * v.z, h: (G.bb[3] - G.bb[1]) * v.z, area: true });
  });
  const det = v.z > 30;
  /* cavi tra isole */
  S.br.forEach(br => {
    if (br.kind === 'cpl') return;
    const pa = br.a.grid ? projLL(br.a.ll) : projLL(S.islById[br.a.isl].plant), pb = projLL(S.islById[br.b.isl].plant);
    const live = brClosed(br) && (br.a.live || br.b.live);
    g.strokeStyle = live ? COL.mv : COL.dead; g.lineWidth = Math.max(1.5, Math.min(4, v.z / 15)); g.setLineDash(br.kind === 'hv' ? [10, 6] : [6, 4]);
    const off = br.id === 'CV2' ? 0.15 : 0;
    g.beginPath(); g.moveTo(X(pa[0] + off), Y(pa[1])); g.lineTo(X(pb[0] + off), Y(pb[1])); g.stroke(); g.setLineDash([]);
    const mx = X((pa[0] + pb[0]) / 2 + off), my = Y((pa[1] + pb[1]) / 2);
    txt(g, br.id + (brClosed(br) ? ' ' + fP(Math.abs(br.Sa.r)) : ' aperto'), mx + 6, my, live ? '#9fd0e4' : COL.dim, '10px ' + FONTM);
    MAP.hits.push({ el: br, x: mx - 10, y: my - 10, w: 20, h: 20 });
  });
  /* reti MT */
  S.isl.forEach(I => {
    const pp = projLL(I.plant), P = [X(pp[0]), Y(pp[1])];
    I.feeders.forEach(F => {
      let prev = P;
      F.nodes.forEach((N, k) => {
        const q = projLL(N.ll), Q = [X(q[0]), Y(q[1])], sg = F.segs[k];
        const upLive = k === 0 ? devClosed(F.brk) && F.bus.live : F.nodes[k - 1].live, live = (upLive && (!sg.sw || sg.sw.closed)) || N.live;
        const fs = S.faults.some(f => f.el === sg && f.on);
        g.strokeStyle = fs ? (blinkOn() ? COL.al : '#ffd000') : !I.com ? '#566370' : live ? (I.V0 > 0.15 ? COL.mag : COL.mv) : COL.dead;
        g.lineWidth = Math.max(1, Math.min(3, v.z / 25)); g.setLineDash(sg.t === 'a70' ? [] : [5, 3]);
        g.beginPath(); g.moveTo(prev[0], prev[1]); g.lineTo(Q[0], Q[1]); g.stroke(); g.setLineDash([]);
        if (sg.fpi.flag) { g.fillStyle = blinkOn() ? COL.or : '#402010'; g.beginPath(); g.arc((prev[0] + Q[0]) / 2, (prev[1] + Q[1]) / 2, 4, 0, 7); g.fill(); }
        if (sg.sw && det) { const w = sg.sw; g.fillStyle = w.closed ? COL.brkC : '#06090c'; g.strokeStyle = w.closed ? COL.brkC : COL.brkO; g.lineWidth = 1.5; g.beginPath(); g.arc(prev[0] + (Q[0] - prev[0]) * 0.15, prev[1] + (Q[1] - prev[1]) * 0.15, 3.5, 0, 7); g.fill(); g.stroke(); }
        MAP.hits.push({ el: sg, x: (prev[0] + Q[0]) / 2 - 6, y: (prev[1] + Q[1]) / 2 - 6, w: 12, h: 12 });
        if (v.z > 260 && MAP.lay.lab && I.com) { const mx = (prev[0] + Q[0]) / 2, my = (prev[1] + Q[1]) / 2; txt(g, sg.km.toFixed(1) + ' km · ' + (sg.I > 0.5 ? fI(sg.I) : 'fuori tensione'), mx + 8, my + 4, sg.I > 0.5 ? '#8fb6c4' : COL.dim, '9px ' + FONTM); if (sg.sw) txt(g, 'IMS ' + (sg.sw.closed ? 'chiuso' : 'APERTO'), prev[0] + (Q[0] - prev[0]) * 0.15 + 8, prev[1] + (Q[1] - prev[1]) * 0.15 - 6, sg.sw.closed ? COL.dim : COL.wa, '9px ' + FONTM); }
        const c = !N.live ? COL.dead : N.Vm < 0.92 ? COL.wa : COL.mv;
        if (N.live && det && MAP.lay.load) { const r = 8 + Math.sqrt(N.Pl * 1000) * 0.6; g.drawImage(glowSprite('load'), Q[0] - r, Q[1] - r, 2 * r, 2 * r); }
        if (N.pv > 0 && det && MAP.lay.pv) {
          const sc = clamp(v.z / 60, 0.7, 2.2), pw = 15 * sc, ph = 10 * sc, px = Q[0] - pw - 8, py = Q[1] - ph / 2, on = N.Ppv > 0.0005;
          if (on) { const r = 6 + Math.sqrt(N.Ppv * 1000) * 1.2 * sc / 1.5; g.drawImage(glowSprite('pv'), px + pw / 2 - r, Q[1] - r, 2 * r, 2 * r); }
          pvGlyph(g, px, py, pw, ph, N.pvOff ? COL.dim : on ? '#ffd23d' : '#6b6230');
          if (v.z > 110) txt(g, N.pvOff ? 'off' : (N.Ppv * 1000).toFixed(0) + ' kW', px + pw / 2, py + ph + 10, N.pvOff ? COL.dim : '#ffd23d', '9px ' + FONTM, 'center');
          MAP.hits.push({ el: N, x: px - 2, y: py - 2, w: pw + 4, h: ph + 4 });
        }
        g.fillStyle = '#071015'; g.fillRect(Q[0] - 5, Q[1] - 5, 10, 10); g.strokeStyle = S.faults.some(f => f.el === N) ? COL.al : c; g.lineWidth = 2; g.strokeRect(Q[0] - 5, Q[1] - 5, 10, 10);
        const lr = [Q[0] + 6, Q[1] - 12, 120, 26];
        const free = !MAP.lbl.some(r => lr[0] < r[0] + r[2] && r[0] < lr[0] + lr[2] && lr[1] < r[1] + r[3] && r[1] < lr[1] + lr[3]);
        if (det && MAP.lay.lab && (free || N === UI.sel || N === UI.hov || v.z > 260)) { MAP.lbl.push(lr); if (v.z > 260 && N.live) txt(g, 'TR ' + N.kva + ' kVA al ' + fPct(N.load) + (N.pv ? ' · FV ' + (N.Ppv * 1000).toFixed(0) + ' kW' : ''), Q[0] + 8, Q[1] + 21, COL.dim, '9px ' + FONTM); txt(g, N.nm, Q[0] + 8, Q[1] - 2, N.live ? COL.hi : COL.dim, '600 10px ' + FONTS); txt(g, N.live ? fP(N.Pl) + '  ' + (N.Vm * 100).toFixed(0) + '%' : 'non alimentata', Q[0] + 8, Q[1] + 10, N.live ? '#9fd0e4' : COL.al, '9px ' + FONTM); }
        MAP.hits.push({ el: N, x: Q[0] - 8, y: Q[1] - 8, w: 16, h: 16 });
        prev = Q;
      });
    });
    I.ties.forEach(T => {
      const a = projLL(T.a.ll), b = projLL(T.b.ll);
      g.strokeStyle = T.sw.closed ? (T.a.live ? COL.mv : COL.dead) : COL.dim; g.setLineDash([2, 4]); g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(X(a[0]), Y(a[1])); g.lineTo(X(b[0]), Y(b[1])); g.stroke(); g.setLineDash([]);
      const mx = X((a[0] + b[0]) / 2), my = Y((a[1] + b[1]) / 2);
      g.fillStyle = T.sw.closed ? COL.brkC : '#06090c'; g.strokeStyle = T.sw.closed ? COL.brkC : COL.brkO; g.beginPath(); g.moveTo(mx, my - 5); g.lineTo(mx + 5, my); g.lineTo(mx, my + 5); g.lineTo(mx - 5, my); g.closePath(); g.fill(); g.stroke();
      MAP.hits.push({ el: T, x: mx - 7, y: my - 7, w: 14, h: 14 });
    });
    /* centrale */
    const b = I.buses[0], c = !I.com ? '#7d8a95' : b.live ? (Math.abs(b.fm - 50) > 0.5 ? COL.al : Math.abs(b.fm - 50) > 0.2 ? COL.wa : COL.ok) : COL.al;
    g.fillStyle = '#071015'; g.beginPath(); g.arc(P[0], P[1], 9, 0, 7); g.fill(); g.strokeStyle = c; g.lineWidth = 2.5; g.stroke();
    txt(g, I.micro ? 'µ' : 'G', P[0], P[1] + 4, c, '700 10px ' + FONTS, 'center');
    txt(g, (I.micro ? 'Microrete ' : 'Centrale ') + I.nm, P[0] + 12, P[1] - 4, COL.hi, '600 11px ' + FONTS);
    txt(g, b.live ? fF(b.fm, 2) + ' · ' + fP(b.loadP || 0) : 'FUORI TENSIONE', P[0] + 12, P[1] + 9, c, '10px ' + FONTM);
    MAP.hits.push({ el: I.buses[0], x: P[0] - 10, y: P[1] - 10, w: 20, h: 20 });
  });
  mapOverlay(g, X, Y, v);
  /* scala */
  const km = v.z > 60 ? 0.5 : v.z > 15 ? 2 : 10, px = km * v.z;
  g.strokeStyle = COL.dim; g.lineWidth = 2; g.beginPath(); g.moveTo(14, SLD.h - 30); g.lineTo(14 + px, SLD.h - 30); g.stroke();
  txt(g, km + ' km', 14, SLD.h - 36, COL.dim, '10px ' + FONTM);
  txt(g, 'N ↑', 14, SLD.h - 52, COL.dim, '10px ' + FONTM);
  txt(g, 'Posizioni di centrali e cabine indicative · contorni ISTAT / Natural Earth', SLD.w - 10, SLD.h - 10, '#3d5560', '10px ' + FONTS, 'right');
  $('banner').style.display = 'none';
}
function mapHit(mx, my) {
  let best = null;
  for (let i = MAP.hits.length - 1; i >= 0; i--) { const h = MAP.hits[i]; if (mx >= h.x && mx <= h.x + h.w && my >= h.y && my <= h.y + h.h) { if (!h.area) return h; best = best || h; } }
  return best;
}

/* ---------- minimappa ---------- */
const MINI = { hits: [] };
function miniDraw() {
  const cv = $('mini'), dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = '#04101a'; g.fillRect(0, 0, w, h);
  const x0 = 236, x1 = 340, y0 = -186, y1 = -100, z = Math.min(w / (x1 - x0), h / (y1 - y0));
  const ox = (w - (x1 - x0) * z) / 2 - x0 * z, oy = (h - (y1 - y0) * z) / 2 - y0 * z, X = x => x * z + ox, Y = y => y * z + oy;
  GEO.land.forEach(r => { g.beginPath(); polyPath(g, r, X, Y, 0, 0); g.fillStyle = '#0f1d1f'; g.fill(); });
  S.br.forEach(br => { if (br.kind === 'cpl') return; const pa = br.a.grid ? projLL(br.a.ll) : projLL(S.islById[br.a.isl].plant), pb = projLL(S.islById[br.b.isl].plant); g.strokeStyle = brClosed(br) && br.b.live ? COL.mv : '#26343e'; g.lineWidth = 1; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(X(pa[0]), Y(pa[1])); g.lineTo(X(pb[0]), Y(pb[1])); g.stroke(); g.setLineDash([]); });
  MINI.hits = [];
  Object.keys(GEO.isl).forEach(gid => {
    const G = GEO.isl[gid];
    g.beginPath(); G.polys.forEach(r => polyPath(g, r, X, Y, G.c[0], G.c[1])); g.fillStyle = '#1a3633'; g.fill();
  });
  S.isl.forEach(I => {
    const p = projLL(I.plant), b = I.buses[0], c = !I.com ? '#7d8a95' : !b.live ? COL.al : (Math.abs(b.fm - 50) > 0.5 ? COL.al : Math.abs(b.fm - 50) > 0.2 ? COL.wa : COL.ok);
    const x = X(p[0]) + (I.id === 'GIN' ? -4 : 0), y = Y(p[1]) + (I.id === 'GIN' ? 4 : 0);
    g.fillStyle = c; g.beginPath(); g.arc(x, y, I.id === UI.isl ? 5 : 3.5, 0, 7); g.fill();
    if (!b.live && blinkOn()) { g.strokeStyle = COL.al; g.beginPath(); g.arc(x, y, 8, 0, 7); g.stroke(); }
    if (I.id === UI.isl) { g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, 7, 0, 7); g.stroke(); }
    if (I.id !== 'GIN') txt(g, I.nm, x + 6, y - 4, '#8fb6c4', '9px ' + FONTS);
    MINI.hits.push({ id: I.id, x, y });
  });
  S.clouds.forEach(c => { g.fillStyle = `rgba(220,230,240,${0.25 * c.d * c.grow})`; g.beginPath(); g.ellipse(X(c.x), Y(c.y), c.r * z, c.r * z * 0.75, 0, 0, 7); g.fill(); });
  txt(g, 'Milazzo', X(331.7) + 4, Y(-112.9) + 3, '#3d6570', '9px ' + FONTS);
}

/* ---------------- interattività avanzata della mappa ---------------- */
MAP.lay = { lab: true, flow: true, load: true, units: true, pv: true, clouds: true };
MAP.tool = null;
MAP.anim = null;
function viewFor(id) {
  const b = islBox(id); let x0 = b[0], y0 = b[1], x1 = b[2], y1 = b[3];
  if (id === 'GIN') { const p = projLL(S.islById.GIN.plant); x0 = p[0] - 1.2; x1 = p[0] + 1.2; y0 = p[1] - 1; y1 = p[1] + 1; }
  const z = Math.max(3, Math.min((Math.max(SLD.w, 300) - 60) / (x1 - x0), (Math.max(SLD.h, 240) - 90) / (y1 - y0)));
  return { z, ox: SLD.w / 2 - (x0 + x1) / 2 * z, oy: SLD.h / 2 + 15 - (y0 + y1) / 2 * z };
}
function viewAll() { const x0 = 238, x1 = 338, y0 = -182, y1 = -128, z = Math.max(3, Math.min((Math.max(SLD.w, 300) - 40) / (x1 - x0), (Math.max(SLD.h, 240) - 80) / (y1 - y0))); return { z, ox: SLD.w / 2 - (x0 + x1) / 2 * z, oy: SLD.h / 2 + 15 - (y0 + y1) / 2 * z }; }
function startAnim(key, to) { const cur = UI.view[key] || to; UI.view[key] = Object.assign({}, cur); MAP.anim = { key, from: Object.assign({}, cur), to, k: 0, t0: performance.now() }; }
function flyTo(id) { const cur = UI.view['map:' + UI.isl]; if (cur && !UI.view['map:' + id]) UI.view['map:' + id] = Object.assign({}, cur); startAnim('map:' + id, viewFor(id)); }
function flyAll() { startAnim('map:' + UI.isl, viewAll()); }
function elPos(el) {
  if (!el) return null;
  const pl = id => projLL(S.islById[id].plant);
  switch (el.el) {
    case 'node': return projLL(el.ll);
    case 'seg': { const a = el.up ? projLL(el.up.ll) : pl(el.isl), b = projLL(el.dn.ll); return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; }
    case 'tie': { const a = projLL(el.a.ll), b = projLL(el.b.ll); return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; }
    case 'br': { const a = el.a.grid ? projLL(el.a.ll) : pl(el.a.isl), b = pl(el.b.isl); return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; }
    case 'gen': case 'bess': case 'bus': case 'fdr': return pl(el.isl);
    case 'isl': case 'pv': return pl(el.isl || el.id);
  }
  return null;
}
function flyToEl(el) {
  const p = elPos(el); if (!p) return;
  const key = 'map:' + UI.isl, cur = UI.view[key] || viewFor(UI.isl), z = Math.max(cur.z, 150);
  startAnim(key, { z, ox: SLD.w / 2 - p[0] * z, oy: SLD.h / 2 - p[1] * z });
}
function mapAnimStep(key) {
  const A = MAP.anim; if (!A || A.key !== key) return;
  if (!(A.from.z > 0) || !(A.to.z > 0)) { MAP.anim = null; if (A.to.z > 0) UI.view[key] = A.to; else delete UI.view[key]; return; }
  A.k = Math.min(1, (performance.now() - A.t0) / 550); const e = A.k * A.k * (3 - 2 * A.k);
  const c = v => [(SLD.w / 2 - v.ox) / v.z, (SLD.h / 2 - v.oy) / v.z];
  const c0 = c(A.from), c1 = c(A.to), z = Math.exp(Math.log(A.from.z) + (Math.log(A.to.z) - Math.log(A.from.z)) * e);
  const cx0 = c0[0] + (c1[0] - c0[0]) * e, cy0 = c0[1] + (c1[1] - c0[1]) * e;
  UI.view[key] = { z, ox: SLD.w / 2 - cx0 * z, oy: SLD.h / 2 - cy0 * z };
  if (A.k >= 1) MAP.anim = null;
}
function mapOverlay(g, X, Y, v) {
  MAP.upos = {};
  const det = v.z > 30, t = SLD.t;
  /* flussi di potenza animati */
  if (MAP.lay.flow && !UI.lowGfx) {
    g.save(); g.lineWidth = Math.max(1.5, Math.min(3, v.z / 30)); g.setLineDash([3, 11]); g.lineCap = 'round';
    S.isl.forEach(I => { if (!I.com) return; const pp = projLL(I.plant); I.feeders.forEach(F => { let prev = [X(pp[0]), Y(pp[1])]; F.nodes.forEach((N, k) => { const q = projLL(N.ll), Q = [X(q[0]), Y(q[1])], sg = F.segs[k]; if (sg.I > 0.5 && N.live) { const sp = 18 + Math.min(60, sg.I / 3); g.lineDashOffset = -t * sp; g.strokeStyle = 'rgba(220,245,255,.75)'; const fwd = N.via === sg; g.beginPath(); if (fwd) { g.moveTo(prev[0], prev[1]); g.lineTo(Q[0], Q[1]); } else { g.moveTo(Q[0], Q[1]); g.lineTo(prev[0], prev[1]); } g.stroke(); } prev = Q; }); }); });
    S.br.forEach(br => { if (br.kind === 'cpl' || !brClosed(br) || Math.abs(br.Sa.r) < 0.005) return; const a = br.a.grid ? projLL(br.a.ll) : projLL(S.islById[br.a.isl].plant), b = projLL(S.islById[br.b.isl].plant); const off = br.id === 'CV2' ? 0.15 : 0; g.lineDashOffset = -t * (20 + Math.abs(br.Sa.r) * 20); g.strokeStyle = 'rgba(255,240,170,.85)'; g.beginPath(); if (br.Sa.r > 0) { g.moveTo(X(a[0] + off), Y(a[1])); g.lineTo(X(b[0] + off), Y(b[1])); } else { g.moveTo(X(b[0] + off), Y(b[1])); g.lineTo(X(a[0] + off), Y(a[1])); } g.stroke(); });
    g.restore();
  }
  /* interruttori di testa linea e unità di centrale */
  S.isl.forEach(I => {
    const pp = projLL(I.plant), P = [X(pp[0]), Y(pp[1])];
    if (det) I.feeders.forEach(F => {
      const q = projLL(F.nodes[0].ll), Q = [X(q[0]), Y(q[1])], d = Math.hypot(Q[0] - P[0], Q[1] - P[1]) || 1, k = Math.min(0.45, 22 / d);
      const x = P[0] + (Q[0] - P[0]) * k, y = P[1] + (Q[1] - P[1]) * k, b = F.brk, s = 4.5;
      g.lineWidth = 1.6;
      if (devClosed(b)) { g.fillStyle = COL.brkC; g.fillRect(x - s, y - s, 2 * s, 2 * s); } else { g.fillStyle = '#06090c'; g.fillRect(x - s, y - s, 2 * s, 2 * s); g.strokeStyle = COL.brkO; g.strokeRect(x - s, y - s, 2 * s, 2 * s); }
      if (relFlags(F).filter(c => c !== '79').length && blinkOn()) { g.strokeStyle = COL.al; g.strokeRect(x - s - 3, y - s - 3, 2 * s + 6, 2 * s + 6); }
      MAP.hits.push({ el: F, x: x - 8, y: y - 8, w: 16, h: 16 });
    });
    if (det && MAP.lay.units) {
      const U = I.gens.concat(I.bess), n = U.length;
      U.forEach((u, k) => {
        const x = P[0] + (k - (n - 1) / 2) * 17, y = P[1] + 34;
        if (k === 0) { g.fillStyle = 'rgba(8,13,18,.85)'; g.fillRect(P[0] - (n / 2) * 17 - 4, y - 10, n * 17 + 8, 20); g.strokeStyle = '#2c3a46'; g.lineWidth = 1; g.strokeRect(P[0] - (n / 2) * 17 - 4, y - 10, n * 17 + 8, 20); }
        MAP.upos[u.id] = [x, y];
        const c = u.el === 'gen' ? (u.blocked ? COL.al : u.st === 'IN PARALLELO' ? COL.ok : u.st === 'FERMO' ? '#4b5864' : COL.wa) : (devClosed(u.brk) ? '#c9a2ff' : '#4b5864');
        g.fillStyle = '#071015'; g.strokeStyle = c; g.lineWidth = 2;
        if (u.el === 'gen') { g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill(); g.stroke(); }
        else { g.fillRect(x - 6, y - 4, 12, 8); g.strokeRect(x - 6, y - 4, 12, 8); }
        if (v.z > 110) txt(g, u.short.replace('GE', ''), x, y + 20, COL.dim, '9px ' + FONTM, 'center');
        MAP.hits.push({ el: u, x: x - 8, y: y - 8, w: 16, h: 16 });
      });
    }
  });
  /* guasti e squadre */
  S.faults.forEach(f => { const p = elPos(f.el); if (p) bolt(g, X(p[0]) + 10, Y(p[1]) - 8, 0.9); });
  (S.crews || []).forEach(c => { const p = elPos(c.el); if (p) wrench(g, X(p[0]) - 14, Y(p[1]) - 6, c.t); });
  /* nuvole e loro ombre */
  if (MAP.lay.clouds && !UI.lowGfx) drawClouds(g, X, Y, v);
  /* selezione e passaggio del mouse */
  const ring = (el, col, w) => { if (!el || el.el === 'isl') return; const up = MAP.upos[el.id]; let sx, sy, r;
    if (up) { sx = up[0]; sy = up[1]; r = 9 + Math.sin(t * 5); } else { const p = elPos(el); if (!p) return; sx = X(p[0]); sy = Y(p[1]); r = 13 + 2 * Math.sin(t * 5); }
    g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.arc(sx, sy, r, 0, 7); g.stroke(); };
  if (UI.sel) ring(UI.sel, '#ffffff', 2);
  if (UI.hov && UI.hov !== UI.sel) ring(UI.hov, 'rgba(255,255,255,.45)', 1.5);
}
/* sprite pre-renderizzati (gradienti radiali costosi da ricreare a ogni fotogramma) */
const GLOW = {};
function glowSprite(kind) {
  if (GLOW[kind]) return GLOW[kind];
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const col = kind === 'pv' ? '255,210,61' : '255,215,120', a0 = kind === 'pv' ? 0.35 : 0.25;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(' + col + ',' + a0 + ')'); gr.addColorStop(1, 'rgba(' + col + ',0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return (GLOW[kind] = c);
}
const CLOUD_R = 60, CLOUD_C = 110;
function cloudSprite(c) {
  if (c.spr && c.sprD === c.d) return c.spr;
  const cv = c.spr || document.createElement('canvas'); cv.width = cv.height = 2 * CLOUD_C; const g = cv.getContext('2d');
  g.clearRect(0, 0, cv.width, cv.height);
  const R = CLOUD_R, k = 0.22 + 0.33 * c.d, shade = Math.round(255 - 110 * c.d);
  c.puffs.forEach(p => {
    const px = CLOUD_C + p[0] * R, py = CLOUD_C + p[1] * R, pr = p[2] * R;
    const gr = g.createRadialGradient(px, py - pr * 0.2, pr * 0.1, px, py, pr);
    gr.addColorStop(0, `rgba(${shade},${shade},${shade + 8},${k})`); gr.addColorStop(1, `rgba(${shade},${shade},${shade + 8},0)`);
    g.fillStyle = gr; g.beginPath(); g.arc(px, py, pr, 0, 7); g.fill();
  });
  c.spr = cv; c.sprD = c.d;
  return cv;
}
const WDIR = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
function windName() { return WDIR[Math.round(((S.set.windFrom % 360) + 360) % 360 / 45) % 8]; }
function drawClouds(g, X, Y, v) {
  const t = SLD.t;
  S.clouds.forEach(c => {
    const R = c.r * v.z, a = c.grow;
    if (X(c.x) < -R * 2 || X(c.x) > SLD.w + R * 2 || Y(c.y) < -R * 2 || Y(c.y) > SLD.h + R * 2) return;
    /* ombra a terra */
    g.save(); g.globalAlpha = 0.28 * c.d * a; g.fillStyle = '#000';
    g.beginPath(); g.ellipse(X(c.x), Y(c.y), R * 0.95, R * 0.72, 0, 0, 7); g.fill(); g.restore();
    /* nube (leggermente spostata: è in quota), disegnata da uno sprite pre-calcolato */
    const ox = X(c.x) - R * 0.12, oy = Y(c.y) - R * 0.25, sp = cloudSprite(c), sc = R / CLOUD_R;
    g.save(); g.globalAlpha = a; g.drawImage(sp, ox - CLOUD_C * sc, oy - CLOUD_C * sc, sp.width * sc, sp.height * sc); g.restore();
    if (c.user && v.z > 15) txt(g, Math.round(c.d * 100) + '%', ox, oy - R * 0.6, 'rgba(230,240,255,.8)', '10px ' + FONTM, 'center');
  });
  /* rosa del vento */
  const cx0 = SLD.w - 58, cy0 = 110, [ux, uy] = windVec();
  g.fillStyle = 'rgba(8,13,18,.85)'; g.beginPath(); g.arc(cx0, cy0, 30, 0, 7); g.fill(); g.strokeStyle = '#2c3a46'; g.lineWidth = 1; g.stroke();
  txt(g, 'N', cx0, cy0 - 18, COL.dim, '9px ' + FONTM, 'center');
  g.strokeStyle = '#cfe8ff'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(cx0 - ux * 20, cy0 - uy * 20); g.lineTo(cx0 + ux * 20, cy0 + uy * 20); g.stroke();
  const an = Math.atan2(uy, ux); g.fillStyle = '#cfe8ff'; g.beginPath(); g.moveTo(cx0 + ux * 22, cy0 + uy * 22); g.lineTo(cx0 + ux * 12 + Math.cos(an + 1.6) * 6, cy0 + uy * 12 + Math.sin(an + 1.6) * 6); g.lineTo(cx0 + ux * 12 + Math.cos(an - 1.6) * 6, cy0 + uy * 12 + Math.sin(an - 1.6) * 6); g.fill();
  txt(g, 'vento da ' + windName() + ' · ' + S.set.windSpd + ' km/h', cx0, cy0 + 44, '#cfe8ff', '10px ' + FONTS, 'center');
}
function mapBar() {
  const d = document.createElement('div'); d.id = 'mapBar';
  d.innerHTML = `<div class="mgrp"><button data-a="mapAll" title="Tutto l'arcipelago">${ICO('home')} Arcipelago</button>${S.isl.map(I => `<button data-a="mapIsl" data-p="${I.id}">${esc(I.nm)}</button>`).join('')}</div>
    <div class="mgrp">${[['lab', 'Etichette'], ['flow', 'Flussi'], ['pv', 'Fotovoltaico'], ['clouds', 'Nuvole'], ['load', 'Carichi'], ['units', 'Gruppi']].map(l => `<button data-a="mapLay" data-p="${l[0]}" class="${MAP.lay[l[0]] ? 'on' : ''}">${l[1]}</button>`).join('')}</div>
    <div class="mgrp wx"><button data-a="mapTool" data-p="cloud" id="btCloud" title="Clic sulla mappa per creare una nube, clic su una nube per dissolverla">${ICO('cloud')} Crea / togli nubi</button><button data-a="mapWind" id="btWind" title="Cambia la direzione del vento"></button><button data-a="mapWindSpd" id="btWindS" title="Velocità del vento"></button>${[['sereno', 'sun'], ['variabile', 'partly'], ['coperto', 'cloud'], ['temporale', 'storm']].map(w => `<button data-a="mapWx" data-p="${w[0]}" title="Meteo: ${w[0]}" class="wxb">${ICO(w[1])}</button>`).join('')}<button data-a="mapClear" title="Dissolvi tutte le nubi">${ICO('x')}</button></div>`;
  $('cvWrap').appendChild(d); d.style.display = 'none';
  const hint = document.createElement('div'); hint.id = 'mapHint'; hint.textContent = 'Clic su un elemento: azioni rapide · doppio clic: vola sull\'isola · rotella: zoom · trascina: sposta'; d.appendChild(hint);
}
function wxUpd() {
  const b = $('btWind'); if (!b) return;
  b.innerHTML = ICO('wind') + ' da ' + windName(); $('btWindS').textContent = S.set.windSpd + ' km/h';
  document.querySelectorAll('#mapBar .wxb').forEach(x => x.classList.toggle('on', x.dataset.p === S.set.weather));
  $('btCloud').classList.toggle('on', MAP.tool === 'cloud');
}
ACT.mapTool = p => { MAP.tool = MAP.tool === p ? null : p; wxUpd(); if (MAP.tool) toast('Clic sulla mappa per creare una nube (o su una nube per dissolverla). Le nubi si muovono col vento e oscurano il FV delle cabine sotto di loro.', true); };
ACT.mapWind = () => { S.set.windFrom = (S.set.windFrom + 45) % 360; wxUpd(); };
ACT.mapWindSpd = () => { const L = [10, 25, 40, 70, 110]; S.set.windSpd = L[(L.indexOf(S.set.windSpd) + 1) % L.length] || 40; wxUpd(); };
ACT.mapWx = p => { S.set.weather = p; soe(null, 'Meteo impostato: ' + p, 1); wxUpd(); };
ACT.mapClear = () => { S.clouds = []; S.isl.forEach(I => { I.cvT = 0; }); toast('Cielo sgombro: tutte le nubi dissolte', true); };
ACT.mapAll = () => flyAll();
ACT.mapIsl = p => { selectIsl(p); flyTo(p); };
ACT.mapLay = (p, b) => { MAP.lay[p] = !MAP.lay[p]; b.classList.toggle('on', MAP.lay[p]); };
