'use strict';
/* =====================================================================
   SCHEMA UNIFILARE (SLD) — layout automatico, disegno, selezione
   Convenzioni: interruttore CHIUSO = quadrato pieno rosso, APERTO = verde vuoto,
   in manovra = giallo; IMS = rombo; linee in tensione azzurre, fuori tensione grigie.
   ===================================================================== */
const SLD = { L: {}, cv: null, g: null, w: 0, h: 0, dpr: 1, hits: [], drag: null, t: 0 };
function sldInvalidate() { SLD.L = {}; }
function sldLayout(I) {
  if (SLD.L[I.id]) return SLD.L[I.id];
  const CW = 158, SW = 122, BUSY = 265, NODE0 = BUSY + 140, NODEH = 100;
  const L = { secs: [], items: [], nodes: {}, BUSY, CW };
  let x = 175, maxN = 0;
  I.buses.forEach(B => {
    const src = B.gens.concat(B.bess).concat(B.brs.filter(br => br.kind !== 'cpl'));
    const wd = Math.max(src.length * SW, B.feeders.length * CW, 2 * CW);
    const ws = wd / Math.max(1, src.length), wf = wd / Math.max(1, B.feeders.length);
    const sec = { B, x0: x, x1: x + wd, src: src.map((el, k) => ({ el, x: x + ws * (k + 0.5) })), fds: B.feeders.map((F, k) => ({ F, x: x + Math.min(wf, CW * 1.3) * (k + 0.5) })) };
    sec.fds.forEach(f => { f.F.nodes.forEach((N, k) => { L.nodes[N.id] = { N, x: f.x, y: NODE0 + k * NODEH }; }); maxN = Math.max(maxN, f.F.nodes.length); });
    L.secs.push(sec);
    x = sec.x1 + 110;
  });
  L.cpl = [];
  I.buses.forEach(B => B.brs.forEach(br => { if (br.kind === 'cpl' && br.a === B) { const sa = L.secs.find(s => s.B === br.a), sb = L.secs.find(s => s.B === br.b); L.cpl.push({ br, x: (sa.x1 + sb.x0) / 2, xa: sa.x1, xb: sb.x0 }); } }));
  L.yTie = NODE0 + (maxN - 1) * NODEH + 58;
  L.ties = I.ties.map((T, k) => ({ T, a: L.nodes[T.a.id], b: L.nodes[T.b.id], y: L.yTie + k * 22 }));
  L.w = x + 10; L.h = L.yTie + 30 + I.ties.length * 22 + 20;
  return L;
}

/* ---------- vista (zoom/pan) ---------- */
function sldView(I) {
  const L = sldLayout(I);
  if (!UI.view[I.id]) sldFit(I);
  return UI.view[I.id];
}
function sldFit(I) {
  const L = sldLayout(I);
  const z = Math.min((Math.max(SLD.w, 300) - 20) / L.w, (Math.max(SLD.h, 240) - 20) / L.h);
  UI.view[I.id] = { z: clamp(z, 0.35, 1.4), ox: 0, oy: 0 };
  const v = UI.view[I.id]; v.ox = (SLD.w - L.w * v.z) / 2; v.oy = Math.max(6, (SLD.h - L.h * v.z) / 2);
}
const TX = (v, x) => x * v.z + v.ox, TY = (v, y) => y * v.z + v.oy;

/* ---------- colori ---------- */
function blinkOn() { return (SLD.t * 2.2 | 0) % 2 === 0; }
function lineCol(live, I) { if (!I.com) return '#566370'; return live ? (I.V0 > 0.15 ? COL.mag : COL.mv) : COL.dead; }
function brkDraw(g, x, y, s, b, I) {
  if (!I.com) { g.strokeStyle = '#7d8a95'; g.setLineDash([2, 2]); g.strokeRect(x - s, y - s, 2 * s, 2 * s); g.setLineDash([]); g.fillStyle = '#7d8a95'; g.font = '700 9px ' + FONTM; g.textAlign = 'center'; g.fillText('?', x, y + 3); return; }
  if (b.racked) { g.strokeStyle = '#7d8a95'; g.setLineDash([3, 2]); g.strokeRect(x - s, y - s, 2 * s, 2 * s); g.setLineDash([]); g.fillStyle = '#7d8a95'; g.font = '700 9px ' + FONTM; g.textAlign = 'center'; g.fillText('E', x, y + 3); return; }
  const tr = b.st === 'OP' || b.st === 'CL';
  const c = tr ? COL.wa : b.st === 'C' ? COL.brkC : COL.brkO;
  g.lineWidth = 2;
  if (b.st === 'C' || (tr && blinkOn())) { g.fillStyle = c; g.fillRect(x - s, y - s, 2 * s, 2 * s); }
  else { g.fillStyle = '#06090c'; g.fillRect(x - s, y - s, 2 * s, 2 * s); g.strokeStyle = c; g.strokeRect(x - s, y - s, 2 * s, 2 * s); }
  if (b.stuck || b.failClose) { g.strokeStyle = COL.or; g.lineWidth = 1.5; g.strokeRect(x - s - 3, y - s - 3, 2 * s + 6, 2 * s + 6); }
}
function swDraw(g, x, y, s, w, I) {
  const tr = w.tmr > 0;
  const c = !I.com ? '#7d8a95' : tr ? COL.wa : w.closed ? COL.brkC : COL.brkO;
  g.beginPath(); g.moveTo(x, y - s); g.lineTo(x + s, y); g.lineTo(x, y + s); g.lineTo(x - s, y); g.closePath();
  g.lineWidth = 2;
  if ((w.closed && !tr) || (tr && blinkOn())) { g.fillStyle = c; g.fill(); } else { g.fillStyle = '#06090c'; g.fill(); g.strokeStyle = c; g.stroke(); }
}
function relFlags(el) { return (el.relays || []).filter(r => r.led).map(r => r.code); }
function flagDraw(g, x, y, codes, al) {
  if (!codes.length) return;
  const t = codes.join(' ');
  g.font = '700 10px ' + FONTM; const w = g.measureText(t).width + 8;
  g.fillStyle = blinkOn() ? '#7a0f0f' : '#3a0909'; g.fillRect(x, y - 8, w, 15);
  g.strokeStyle = COL.al; g.lineWidth = 1; g.strokeRect(x, y - 8, w, 15);
  g.fillStyle = '#fff'; g.textAlign = 'left'; g.fillText(t, x + 4, y + 3);
}
const FONTM = 'ui-monospace,"Cascadia Mono",Consolas,monospace', FONTS = '"Segoe UI",system-ui,sans-serif';
function txt(g, s, x, y, c, f, al) { g.fillStyle = c || COL.hi; g.font = f || ('10px ' + FONTM); g.textAlign = al || 'left'; g.fillText(s, x, y); }
function bolt(g, x, y, s) { g.fillStyle = blinkOn() ? COL.al : '#ffd000'; g.beginPath(); g.moveTo(x - 3 * s, y - 9 * s); g.lineTo(x + 4 * s, y - 9 * s); g.lineTo(x, y - 1 * s); g.lineTo(x + 4 * s, y - 1 * s); g.lineTo(x - 4 * s, y + 10 * s); g.lineTo(x - 1 * s, y + 1 * s); g.lineTo(x - 5 * s, y + 1 * s); g.closePath(); g.fill(); }
function wrench(g, x, y, t) { g.fillStyle = '#2a2410'; g.strokeStyle = '#d9b44a'; g.lineWidth = 1; g.fillRect(x - 13, y - 9, 26, 12); g.strokeRect(x - 13, y - 9, 26, 12); txt(g, 'SQ', x, y + 1, '#d9b44a', '700 8px ' + FONTM, 'center'); txt(g, Math.ceil(t) + 's', x, y + 13, '#d9b44a', '9px ' + FONTM, 'center'); }
function pvGlyph(g, x, y, w, h, c) {
  g.fillStyle = '#0a1012'; g.fillRect(x, y, w, h);
  g.strokeStyle = c; g.lineWidth = 1.2; g.strokeRect(x, y, w, h);
  g.beginPath(); for (let i = 1; i < 3; i++) { g.moveTo(x + w * i / 3, y); g.lineTo(x + w * i / 3, y + h); } g.moveTo(x, y + h / 2); g.lineTo(x + w, y + h / 2); g.stroke();
}
function crewOn(el) { return (S.crews || []).find(c => c.el === el); }

/* ---------- disegno ---------- */
function sldDraw() {
  const g = SLD.g, I = S.islById[UI.isl], L = sldLayout(I), v = sldView(I);
  g.setTransform(SLD.dpr, 0, 0, SLD.dpr, 0, 0);
  g.fillStyle = '#05080b'; g.fillRect(0, 0, SLD.w, SLD.h);
  /* griglia leggera */
  g.strokeStyle = 'rgba(54,185,255,.035)'; g.lineWidth = 1; g.beginPath();
  for (let x = (v.ox % (40 * v.z)); x < SLD.w; x += 40 * v.z) { g.moveTo(x, 0); g.lineTo(x, SLD.h); }
  for (let y = (v.oy % (40 * v.z)); y < SLD.h; y += 40 * v.z) { g.moveTo(0, y); g.lineTo(SLD.w, y); }
  g.stroke();
  const hits = SLD.hits = [];
  const z = v.z, k = clamp(z, 0.55, 1.25), X = x => TX(v, x), Y = y => TY(v, y);
  const BY = Y(L.BUSY), bw = Math.max(4, 7 * k), bs = 7 * k;
  const hov = UI.hov, sel = UI.sel, lite = z < 0.62;
  const ring = (el, x, y, w, h) => { if (el === sel || (sel && sel.el === 'seg' && el === sel) ) { g.strokeStyle = '#ffffff'; g.lineWidth = 1.5; g.setLineDash([4, 3]); g.strokeRect(x - 4, y - 4, w + 8, h + 8); g.setLineDash([]); } else if (el === hov) { g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = 1; g.strokeRect(x - 3, y - 3, w + 6, h + 6); } };
  const fON = el => S.faults.some(f => f.el === el && f.on);
  const fANY = el => S.faults.some(f => f.el === el);

  /* --- neutro --- */
  const s0 = L.secs[0];
  {
    const cx = X(s0.x0 - 60), cy = BY + 70 * z;
    g.strokeStyle = lineCol(s0.B.live, I); g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(X(s0.x0 - 20), BY); g.lineTo(cx, BY); g.lineTo(cx, cy - 22 * k); g.stroke();
    if (I.coil.on) { g.beginPath(); for (let i = 0; i < 4; i++) g.arc(cx, cy - 15 * k + i * 8 * k, 4 * k, -Math.PI / 2, Math.PI / 2); g.stroke(); }
    else { g.beginPath(); g.moveTo(cx, cy - 22 * k); g.lineTo(cx, cy + 10 * k); g.stroke(); g.beginPath(); g.moveTo(cx - 8 * k, cy + 4 * k); g.lineTo(cx + 8 * k, cy + 4 * k); g.stroke(); }
    g.beginPath(); g.moveTo(cx - 10 * k, cy + 20 * k); g.lineTo(cx + 10 * k, cy + 20 * k); g.moveTo(cx - 6 * k, cy + 24 * k); g.lineTo(cx + 6 * k, cy + 24 * k); g.moveTo(cx - 2 * k, cy + 28 * k); g.lineTo(cx + 2 * k, cy + 28 * k); g.stroke();
    txt(g, I.coil.on ? 'Bobina Petersen' : 'Neutro isolato', cx, cy + 42 * k, COL.dim, '9px ' + FONTS, 'center');
    if (I.V0 > 0.05) txt(g, 'V0 ' + (I.V0 * 100).toFixed(0) + '% · Ig ' + I.Ig.toFixed(1) + ' A', cx, cy + 54 * k, blinkOn() ? COL.mag : '#c06aa8', '700 10px ' + FONTM, 'center');
    hits.push({ el: I, x: cx - 30, y: cy - 30, w: 60, h: 90 });
  }

  /* --- fotovoltaico distribuito dell'isola --- */
  {
    const P = I.pv, bx = X(s0.x0 - 60), by = BY - 150 * z, w = 92, h = 58, on = P.P > 0.0005;
    g.fillStyle = '#0d1608'; g.fillRect(bx - w / 2, by - h / 2, w, h);
    g.strokeStyle = !I.com ? '#7d8a95' : P.opOff ? COL.al : on ? '#ffd23d' : '#6b6230'; g.lineWidth = 1.6; g.strokeRect(bx - w / 2, by - h / 2, w, h);
    pvGlyph(g, bx - w / 2 + 8, by - h / 2 + 8, 26, 18, on ? '#ffd23d' : '#6b6230');
    txt(g, 'FV', bx + 4, by - h / 2 + 15, COL.hi, '700 11px ' + FONTS);
    txt(g, I.com ? fP(P.P) : 'N.D.', bx + 4, by - h / 2 + 28, on ? '#ffd23d' : COL.dim, '600 11px ' + FONTM);
    const gg = P.groups.filter(q => q.frac > 0);
    gg.forEach((q, i2) => { g.fillStyle = q.on ? COL.ok : COL.al; g.beginPath(); g.arc(bx - w / 2 + 12 + i2 * 12, by + h / 2 - 12, 4, 0, 7); g.fill(); });
    txt(g, P.opOff ? 'TELESCATTO' : P.curt < 0.999 ? 'limite ' + fPct(P.curt) : 'distribuito', bx - w / 2 + 12 + gg.length * 12, by + h / 2 - 9, P.opOff ? COL.al : COL.dim, '9px ' + FONTS);
    g.strokeStyle = on ? 'rgba(255,210,61,.45)' : '#2a3036'; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(bx, by + h / 2); g.lineTo(bx, BY - bw / 2 - 26); g.lineTo(X(s0.x0 - 20), BY - bw / 2 - 26); g.stroke(); g.setLineDash([]);
    txt(g, 'sulle cabine', bx, BY - bw / 2 - 30, COL.dim, '8px ' + FONTS, 'center');
    ring(I.pvEl, bx - w / 2, by - h / 2, w, h);
    hits.push({ el: I.pvEl, x: bx - w / 2, y: by - h / 2, w, h });
  }

  /* --- congiuntori --- */
  L.cpl.forEach(c => {
    const br = c.br, x = X(c.x), live = br.a.live || br.b.live;
    g.strokeStyle = lineCol(br.a.live, I); g.lineWidth = bw * 0.6; g.beginPath(); g.moveTo(X(c.xa + 20), BY); g.lineTo(x - bs, BY); g.stroke();
    g.strokeStyle = lineCol(br.b.live, I); g.beginPath(); g.moveTo(x + bs, BY); g.lineTo(X(c.xb - 20), BY); g.stroke();
    brkDraw(g, x, BY, bs, br.brkA, I);
    txt(g, 'CONGIUNTORE', x, BY - 16 * k, COL.dim, '9px ' + FONTS, 'center');
    if (devClosed(br.brkA) && br.I > 0.5) txt(g, fI(br.I), x, BY + 20 * k, COL.tx, '10px ' + FONTM, 'center');
    flagDraw(g, x - 12, BY + 34 * k, relFlags(br), true);
    ring(br, x - bs, BY - bs, 2 * bs, 2 * bs);
    hits.push({ el: br, x: x - 18, y: BY - 18, w: 36, h: 36 });
  });

  L.secs.forEach(sec => {
    const B = sec.B, bl = B.live;
    /* --- sorgenti e collegamenti --- */
    sec.src.forEach(s => {
      const el = s.el, x = X(s.x);
      let brk, liveUp;
      if (el.el === 'gen') { brk = el.brk; liveUp = genRunning(el) && el.Eq * el.w > 0.3; }
      else if (el.el === 'bess') { brk = el.brk; liveUp = el.run && el.mode !== 'OFF'; }
      else { brk = el.a === B ? el.brkA : el.brkB; const o = el.a === B ? el.b : el.a, ob = el.a === B ? el.brkB : el.brkA; liveUp = (devClosed(brk) && bl) || (o.live && (!ob || devClosed(ob))); }
      const yb = BY - 44 * z, cl = devClosed(brk);
      g.lineWidth = 2.2; g.strokeStyle = lineCol(bl, I); g.beginPath(); g.moveTo(x, BY); g.lineTo(x, yb + bs); g.stroke();
      g.strokeStyle = lineCol(cl ? bl || liveUp : liveUp, I); g.beginPath(); g.moveTo(x, yb - bs); g.lineTo(x, BY - 75 * z); g.stroke();
      brkDraw(g, x, yb, bs, brk, I);
      const fl = relFlags(el).concat(brk.relays.filter(r => r.led && r.el !== el).map(r => r.code));
      flagDraw(g, x + 12, yb, fl);
      if (el.el === 'gen') {
        const G = el, ty = BY - 92 * z, gy = BY - 140 * z, R = 19 * k;
        g.strokeStyle = lineCol(liveUp || (cl && bl), I); g.lineWidth = 1.6;
        g.beginPath(); g.arc(x, ty - 6 * k, 8 * k, 0, 7); g.stroke(); g.beginPath(); g.arc(x, ty + 6 * k, 8 * k, 0, 7); g.stroke();
        g.beginPath(); g.moveTo(x, ty - 14 * k); g.lineTo(x, gy + R); g.stroke();
        const c = !I.com ? '#7d8a95' : G.blocked ? COL.al : G.st === 'IN PARALLELO' ? COL.ok : G.st === 'FERMO' ? COL.dim : COL.wa;
        g.fillStyle = '#071015'; g.beginPath(); g.arc(x, gy, R, 0, 7); g.fill();
        g.strokeStyle = c; g.lineWidth = 2.2; g.beginPath(); g.arc(x, gy, R, 0, 7); g.stroke();
        g.lineWidth = 1.8; g.beginPath(); for (let i = 0; i <= 20; i++) { const a = i / 20, px = x - 10 * k + 20 * k * a, py = gy + 5 * k - 6 * k * Math.sin(a * 2 * Math.PI) ; i ? g.lineTo(px, py) : g.moveTo(px, py); } g.stroke();
        txt(g, 'G', x, gy - 5 * k, c, '700 ' + Math.round(10 * k) + 'px ' + FONTS, 'center');
        if (G.st !== 'IN PARALLELO' && G.st !== 'FERMO' && blinkOn() && !G.blocked) { g.strokeStyle = COL.wa; g.lineWidth = 1; g.beginPath(); g.arc(x, gy, R + 4, 0, 7); g.stroke(); }
        txt(g, G.short + ' · ' + (G.Pn * 1000).toFixed(0) + ' kW', x, gy - R - 20 * k, COL.hi, '600 11px ' + FONTS, 'center');
        txt(g, I.com ? (G.blocked ? 'BLOCCO' : G.st) : 'N.D.', x, gy - R - 7 * k, c, '9px ' + FONTM, 'center');
        if (I.com && G.st !== 'FERMO') {
          txt(g, fP(G.Pe), x + 13, yb - 16 * z, COL.hi, '10px ' + FONTM);
          if (!lite) txt(g, (G.w * 50).toFixed(2) + ' Hz', x + R + 4, gy + 4, '#8fb6c4', '10px ' + FONTM);
          if (G.st === 'IN PARALLELO') { const ld = G.Pe / G.Pn; g.fillStyle = '#16222b'; g.fillRect(x - 20 * k, gy + R + 4, 40 * k, 4); g.fillStyle = ld > 1 ? COL.al : ld > 0.9 ? COL.wa : COL.ok; g.fillRect(x - 20 * k, gy + R + 4, 40 * k * clamp(ld, 0, 1), 4); }
        }
        if (crewOn(G)) wrench(g, x - R - 14, gy, crewOn(G).t);
        if (fANY(G)) bolt(g, x - R - 6, gy - R, k);
        ring(G, x - R, gy - R, 2 * R, BY - gy + R - 4);
        hits.push({ el: G, x: x - 28, y: gy - R - 30 * k, w: 56, h: BY - gy + R + 30 * k - 4 });
      } else if (el.el === 'bess') {
        const B2 = el, iy = BY - 98 * z, by2 = BY - 150 * z, W = 34 * k, H = 22 * k;
        g.strokeStyle = lineCol(liveUp, I); g.lineWidth = 1.6; g.strokeRect(x - 13 * k, iy - 13 * k, 26 * k, 26 * k);
        g.beginPath(); g.moveTo(x - 13 * k, iy + 13 * k); g.lineTo(x + 13 * k, iy - 13 * k); g.stroke();
        txt(g, '~', x - 6 * k, iy - 1, COL.tx, Math.round(10 * k) + 'px ' + FONTM, 'center'); txt(g, '=', x + 6 * k, iy + 9 * k, COL.tx, Math.round(10 * k) + 'px ' + FONTM, 'center');
        g.beginPath(); g.moveTo(x, iy - 13 * k); g.lineTo(x, by2 + H / 2); g.stroke();
        const c = !I.com ? '#7d8a95' : B2.blocked ? COL.al : !B2.run || B2.mode === 'OFF' ? COL.dim : B2.soc < 15 ? COL.wa : COL.ok;
        g.fillStyle = '#071015'; g.fillRect(x - W / 2, by2 - H / 2, W, H); g.strokeStyle = c; g.lineWidth = 2; g.strokeRect(x - W / 2, by2 - H / 2, W, H); g.fillStyle = c; g.fillRect(x + W / 2, by2 - 4 * k, 3 * k, 8 * k);
        g.fillRect(x - W / 2 + 2, by2 - H / 2 + 2, (W - 4) * clamp(B2.soc / 100, 0, 1), H - 4);
        txt(g, 'BESS ' + (B2.Pn * 1000).toFixed(0) + ' kW · ' + B2.mode, x, by2 - H / 2 - 18 * k, COL.hi, '600 11px ' + FONTS, 'center');
        txt(g, I.com ? 'SoC ' + B2.soc.toFixed(1) + '%' : 'N.D.', x, by2 - H / 2 - 5 * k, c, '9px ' + FONTM, 'center');
        if (I.com && devClosed(B2.brk)) txt(g, (B2.P >= 0 ? '▲ ' : '▼ ') + fP(Math.abs(B2.P)), x + 13, yb - 16 * z, B2.P >= 0 ? COL.hi : '#c9a2ff', '10px ' + FONTM);
        if (crewOn(B2)) wrench(g, x - W, by2, crewOn(B2).t);
        ring(B2, x - W / 2, by2 - H / 2, W, BY - by2 + H / 2 - 4);
        hits.push({ el: B2, x: x - 28, y: by2 - H / 2 - 30 * k, w: 56, h: BY - by2 + H / 2 + 30 * k - 4 });
      } else {
        const br = el, o = br.a === B ? br.b : br.a, ob = br.a === B ? br.brkB : br.brkA, ty = BY - 190 * z;
        g.strokeStyle = lineCol(liveUp, I); g.lineWidth = 2.2; g.setLineDash(br.kind === 'hv' ? [8, 4] : []);
        g.beginPath(); g.moveTo(x, BY - 75 * z); g.lineTo(x, ty + 12); g.stroke(); g.setLineDash([]);
        /* estremo remoto */
        if (ob) { brkDraw(g, x, ty + 22 * z, bs * 0.8, ob, I); }
        const lab = (o.grid ? 'RTN 150 kV' : '↔ ' + S.islById[o.isl].nm.toUpperCase());
        g.font = '600 11px ' + FONTS; const tw = g.measureText(lab).width + 14;
        g.fillStyle = '#0b1820'; g.fillRect(x - tw / 2, ty - 26 * z - 9, tw, 20); g.strokeStyle = lineCol(o.live, I); g.lineWidth = 1; g.strokeRect(x - tw / 2, ty - 26 * z - 9, tw, 20);
        txt(g, lab, x, ty - 26 * z + 5, COL.hi, '600 11px ' + FONTS, 'center');
        txt(g, br.id + (br.planned ? (br.kind === 'hv' ? ' futuro' : ' riserva') : ''), x, ty - 26 * z - 15, COL.dim, '9px ' + FONTM, 'center');
        if (I.com && brClosed(br)) { const P = br.a === B ? -br.Sa.r : -br.Sb.r; txt(g, (P >= 0 ? '▼ ' : '▲ ') + fP(Math.abs(P)) + '  ' + fI(br.I), x + 13, yb - 16 * z, COL.hi, '10px ' + FONTM); }
        if (fANY(br)) bolt(g, x - 14, (BY + ty) / 2, k);
        if (crewOn(br)) wrench(g, x + 20, (BY + ty) / 2, crewOn(br).t);
        ring(br, x - 10, ty - 26 * z - 9, 20, BY - ty + 26 * z - 4);
        hits.push({ el: br, x: x - tw / 2, y: ty - 26 * z - 12, w: tw, h: BY - ty + 26 * z + 6, go: o.isl });
      }
    });

    /* --- sbarra --- */
    const bf = fON(B);
    g.fillStyle = bf ? (blinkOn() ? COL.al : '#ffd000') : lineCol(bl, I);
    g.fillRect(X(sec.x0 - 20), BY - bw / 2, X(sec.x1 + 20) - X(sec.x0 - 20), bw);
    if (B.lock) { g.strokeStyle = COL.al; g.lineWidth = 1; g.setLineDash([4, 3]); g.strokeRect(X(sec.x0 - 24), BY - bw / 2 - 4, X(sec.x1 + 24) - X(sec.x0 - 24), bw + 8); g.setLineDash([]); }
    txt(g, B.nm.toUpperCase(), X(sec.x0 - 18), BY - bw / 2 - 6, COL.tx, '600 10px ' + FONTS);
    txt(g, I.com ? (bl ? fV(B.Vm) + '  ' + fF(B.fm) : 'FUORI TENSIONE') : 'RTU N.D.', X(sec.x0 - 18), BY + bw / 2 + 13, bl ? COL.hi : COL.al, '600 11px ' + FONTM);
    flagDraw(g, X(sec.x0 - 18), BY + bw / 2 + 28, relFlags(B).concat(B.lock ? ['86'] : []));
    if (bf) bolt(g, X(sec.x0 + 10), BY - 16, k);
    ring(B, X(sec.x0 - 20), BY - bw / 2, X(sec.x1 + 20) - X(sec.x0 - 20), bw);
    hits.push({ el: B, x: X(sec.x0 - 20), y: BY - 9, w: X(sec.x1 + 20) - X(sec.x0 - 20), h: 18 });

    /* --- montanti e cabine --- */
    sec.fds.forEach(fd => {
      const F = fd.F, x = X(fd.x), yb = BY + 44 * z, cl = devClosed(F.brk), fl = cl && bl;
      g.lineWidth = 2.2; g.strokeStyle = lineCol(bl, I); g.beginPath(); g.moveTo(x, BY); g.lineTo(x, yb - bs); g.stroke();
      brkDraw(g, x, yb, bs, F.brk, I);
      flagDraw(g, x + 12, yb, relFlags(F).filter(c => c !== '79'));
      txt(g, F.short, x - 12, yb + 4, COL.hi, '600 11px ' + FONTS, 'right');
      if (!lite) txt(g, F.nm.replace('Linea ', ''), x - 12, yb + 17, COL.dim, '9px ' + FONTS, 'right');
      if (I.com && fl) { txt(g, fI(F.Iamp), x + 12, yb + (relFlags(F).length ? 22 : 4), COL.hi, '10px ' + FONTM); txt(g, fP(F.P), x + 12, yb + (relFlags(F).length ? 34 : 16), COL.tx, '10px ' + FONTM); }
      if (F.rec.st !== 'IDLE') txt(g, '79 ' + F.rec.st, x + 12, yb - 14, F.rec.st === 'DEFINITIVO' ? COL.al : COL.wa, '600 9px ' + FONTM);
      else if (F.shedBy && !cl) txt(g, { UFLS: 'UFLS', '27': 'MANC. TENS.', BUS: 'SCATTO SBARRA', DEF: 'DEFINITIVO', OP: 'APERTO OP.', EMS: 'EMS' }[F.shedBy] || '', x + 12, yb - 14, COL.wa, '600 9px ' + FONTM);
      ring(F, x - bs, yb - bs, 2 * bs, 2 * bs);
      hits.push({ el: F, x: x - 60, y: yb - 14, w: 72, h: 30 });
      let yPrev = yb + bs;
      F.nodes.forEach((N, k2) => {
        const n = L.nodes[N.id], ny = Y(n.y), sg = F.segs[k2], bw2 = 104 * k, bh = 42 * k;
        const upLive = k2 === 0 ? fl : F.nodes[k2 - 1].live, swc = sg.sw ? sg.sw.closed : true;
        const segLive = (upLive && swc) || N.live;
        const yTop = ny - bh / 2;
        /* tratto */
        const fs = fON(sg);
        g.lineWidth = 2.2; g.strokeStyle = fs ? (blinkOn() ? COL.al : '#ffd000') : lineCol(segLive, I);
        g.setLineDash(sg.t === 'a70' ? [] : [6, 3]);
        let ySw = yPrev;
        if (sg.sw) { ySw = yPrev + 14 * z; g.setLineDash([]); g.strokeStyle = lineCol(upLive, I); g.beginPath(); g.moveTo(x, yPrev); g.lineTo(x, ySw - 6 * k); g.stroke(); g.strokeStyle = fs ? (blinkOn() ? COL.al : '#ffd000') : lineCol(segLive, I); g.setLineDash(sg.t === 'a70' ? [] : [6, 3]); }
        g.beginPath(); g.moveTo(x, sg.sw ? ySw + 6 * k : ySw); g.lineTo(x, yTop); g.stroke(); g.setLineDash([]);
        if (sg.sw) { swDraw(g, x, ySw, 6 * k, sg.sw, I); hits.push({ el: sg, x: x - 10, y: ySw - 10, w: 20, h: 20, sw: true }); }
        const ym = (ySw + yTop) / 2;
        if (!lite) txt(g, sg.km.toFixed(1) + ' km ' + (sg.t === 'a70' ? 'aereo' : 'cavo'), x + 8, ym - 2, COL.dim, '9px ' + FONTM);
        if (I.com && sg.I > 0.5 && !lite) txt(g, fI(sg.I), x + 8, ym + 10, '#8fb6c4', '9px ' + FONTM);
        /* indicatore di passaggio guasto */
        const fp = sg.fpi.flag;
        g.beginPath(); g.moveTo(x - 9, ym - 6); g.lineTo(x - 3, ym); g.lineTo(x - 9, ym + 6); g.closePath();
        g.fillStyle = fp ? (blinkOn() ? (sg.fpi.lg ? COL.mag : COL.or) : '#402010') : '#1d2a33'; g.fill();
        if (fs) bolt(g, x - 20, ym, k * 0.9);
        if (crewOn(sg)) wrench(g, x - 30, ym, crewOn(sg).t);
        ring(sg, x - 12, ySw, 24, yTop - ySw);
        hits.push({ el: sg, x: x - 14, y: ySw + 8, w: 28, h: yTop - ySw - 10 });
        /* cabina */
        const nf = fON(N);
        const c = !I.com ? '#7d8a95' : !N.live ? COL.dead : !N.fuse ? COL.al : N.Vm < 0.92 ? COL.wa : COL.mv;
        g.fillStyle = N.live ? '#0b1a24' : '#0c1014'; g.fillRect(x - bw2 / 2, yTop, bw2, bh);
        g.strokeStyle = nf ? (blinkOn() ? COL.al : '#ffd000') : c; g.lineWidth = 1.6; g.strokeRect(x - bw2 / 2, yTop, bw2, bh);
        let nm = N.nm; g.font = '600 10px ' + FONTS; while (g.measureText(nm).width > bw2 - 8 && nm.length > 4) nm = nm.slice(0, -2);
        if (nm !== N.nm) nm += '…';
        txt(g, nm, x, yTop + 13 * k, N.live ? COL.hi : COL.dim, '600 10px ' + FONTS, 'center');
        if (I.com && N.live) {
          txt(g, fP(N.Pl), x, yTop + 26 * k, '#9fd0e4', '9px ' + FONTM, 'center');
          txt(g, (N.Vm * 100).toFixed(1) + '%' + (N.motor ? '  M:' + N.motor.st.slice(0, 4) : ''), x, yTop + 37 * k, N.Vm < 0.92 ? COL.wa : COL.dim, '9px ' + FONTM, 'center');
        } else txt(g, !I.com ? 'N.D.' : !N.fuse ? 'FUSIBILI MT' : 'NON ALIMENTATA', x, yTop + 30 * k, !N.fuse ? COL.al : COL.dim, '600 9px ' + FONTM, 'center');
        if (N.pv > 0) {
          const px = x + bw2 / 2 + 6, py = yTop + bh / 2 - 7 * k, pw = 20 * k, ph = 14 * k, on = N.Ppv > 0.0005;
          pvGlyph(g, px, py, pw, ph, !I.com ? '#7d8a95' : N.pvOff ? COL.dim : on ? '#ffd23d' : '#6b6230');
          g.strokeStyle = on ? 'rgba(255,210,61,.6)' : '#2a3036'; g.lineWidth = 1; g.beginPath(); g.moveTo(x + bw2 / 2, yTop + bh / 2); g.lineTo(px, yTop + bh / 2); g.stroke();
          if (!lite && I.com) txt(g, N.pvOff ? 'FV off' : (N.Ppv * 1000).toFixed(0), px + pw / 2, py + ph + 10, N.pvOff ? COL.dim : '#ffd23d', '9px ' + FONTM, 'center');
          hits.push({ el: N, x: px - 2, y: py - 2, w: pw + 4, h: ph + 14, pv: true });
        }
        if (N.lvOut > 0 || !N.lvBrk) txt(g, N.lvBrk ? 'BT parz.' : 'BT aperto', x + bw2 / 2 + 3, yTop + 10, COL.wa, '9px ' + FONTM);
        if (S.faults.some(f => f.el === N)) bolt(g, x + bw2 / 2 + 8, yTop + 22, k * 0.8);
        if (crewOn(N)) wrench(g, x + bw2 / 2 + 16, yTop + 20, crewOn(N).t);
        ring(N, x - bw2 / 2, yTop, bw2, bh);
        hits.push({ el: N, x: x - bw2 / 2, y: yTop, w: bw2, h: bh });
        yPrev = yTop + bh;
      });
    });
  });

  /* --- punti di apertura (contro-alimentazione) --- */
  L.ties.forEach(t => {
    const T = t.T, xa = X(t.a.x) - 52 * k - 12, xb = X(t.b.x) - 52 * k - 12, ya = Y(t.a.y), yb2 = Y(t.b.y), yt = Y(t.y), xm = (xa + xb) / 2;
    const fs = fON(T);
    const la = T.a.live, lb = T.b.live && T.sw.closed;
    g.lineWidth = 2; g.setLineDash([6, 3]);
    g.strokeStyle = fs ? COL.al : lineCol(la, I); g.beginPath(); g.moveTo(xa + 12, ya); g.lineTo(xa, ya); g.lineTo(xa, yt); g.lineTo(xm - 8, yt); g.stroke();
    g.strokeStyle = fs ? COL.al : lineCol(T.b.live, I); g.beginPath(); g.moveTo(xm + 8, yt); g.lineTo(xb, yt); g.lineTo(xb, yb2); g.lineTo(xb + 12, yb2); g.stroke(); g.setLineDash([]);
    swDraw(g, xm, yt, 7 * k, T.sw, I);
    txt(g, (T.sw.closed ? 'NA CHIUSO ' : 'NA ') + T.id.split('.')[1] + ' · ' + T.km.toFixed(1) + ' km', xm, yt - 10, T.sw.closed ? COL.wa : COL.dim, '9px ' + FONTM, 'center');
    if (I.com && T.I > 0.5) txt(g, fI(T.I), xm, yt + 16, '#8fb6c4', '9px ' + FONTM, 'center');
    if (T.fpi.flag) { g.fillStyle = blinkOn() ? COL.or : '#402010'; g.beginPath(); g.moveTo(xm + 14, yt - 5); g.lineTo(xm + 20, yt); g.lineTo(xm + 14, yt + 5); g.fill(); }
    if (S.faults.some(f => f.el === T)) bolt(g, xm + 30, yt, k * 0.8);
    ring(T, xm - 10, yt - 10, 20, 20);
    hits.push({ el: T, x: xm - 14, y: yt - 14, w: 28, h: 28 });
  });

  /* --- legenda --- */
  const ly = SLD.h - 12;
  g.font = '10px ' + FONTS; g.textAlign = 'left';
  let lx = 10;
  const leg = (draw, t) => { draw(lx + 6, ly - 4); txt(g, t, lx + 16, ly, COL.dim, '10px ' + FONTS); lx += 26 + g.measureText(t).width; };
  leg((x, y) => { g.fillStyle = COL.brkC; g.fillRect(x - 5, y - 5, 10, 10); }, 'interr. chiuso');
  leg((x, y) => { g.strokeStyle = COL.brkO; g.lineWidth = 2; g.strokeRect(x - 5, y - 5, 10, 10); }, 'aperto');
  leg((x, y) => { g.fillStyle = COL.brkC; g.beginPath(); g.moveTo(x, y - 5); g.lineTo(x + 5, y); g.lineTo(x, y + 5); g.lineTo(x - 5, y); g.fill(); }, 'IMS / punto di apertura');
  leg((x, y) => { g.fillStyle = COL.or; g.beginPath(); g.moveTo(x - 3, y - 5); g.lineTo(x + 3, y); g.lineTo(x - 3, y + 5); g.fill(); }, 'indicatore guasto RGDAT');
  leg((x, y) => { g.strokeStyle = COL.mv; g.lineWidth = 2; g.beginPath(); g.moveTo(x - 6, y); g.lineTo(x + 6, y); g.stroke(); }, 'in tensione');
  leg((x, y) => { g.strokeStyle = COL.mag; g.lineWidth = 2; g.beginPath(); g.moveTo(x - 6, y); g.lineTo(x + 6, y); g.stroke(); }, 'guasto a terra presente');
  leg((x, y) => { g.strokeStyle = COL.mv; g.lineWidth = 2; g.setLineDash([4, 2]); g.beginPath(); g.moveTo(x - 6, y); g.lineTo(x + 6, y); g.stroke(); g.setLineDash([]); }, 'cavo');
  /* banner comunicazione */
  const bn = $('banner');
  if (!I.com) { bn.style.display = 'block'; bn.textContent = 'RTU ' + I.nm.toUpperCase() + ' NON RAGGIUNGIBILE — telemisure non valide, telecomandi inibiti'; }
  else if (!I.buses[0].live) { bn.style.display = 'block'; bn.textContent = 'ISOLA DI ' + I.nm.toUpperCase() + ' FUORI TENSIONE'; }
  else bn.style.display = 'none';
}

/* ---------- selezione / tooltip ---------- */
function sldHit(mx, my) {
  for (let i = SLD.hits.length - 1; i >= 0; i--) { const h = SLD.hits[i]; if (mx >= h.x && mx <= h.x + h.w && my >= h.y && my <= h.y + h.h) return h; }
  return null;
}
function tipFor(el) {
  const I = S.islById[elIsl(el)] || S.islById[UI.isl];
  if (I && !I.com) return el.nm + '\nRTU non raggiungibile';
  switch (el.el) {
    case 'gen': return `${el.nm} · ${el.st}\nP ${fP(el.Pe)}  Q ${fQ(el.Qe)}  I ${fI(el.Ia)}\nn ${Math.round(el.w * el.rpm)} giri/min  f ${(el.w * 50).toFixed(3)} Hz\nregolatore ${el.mode}  T acqua ${el.Tc.toFixed(0)} °C`;
    case 'bess': return `${el.nm} · ${el.mode} · ${el.run ? 'acceso' : 'spento'}\nP ${fP(el.P)}  Q ${fQ(el.Q)}\nSoC ${el.soc.toFixed(1)} %  T celle ${el.Tcell.toFixed(0)} °C`;
    case 'fdr': return `${el.nm}\nI ${el.Iph.map(x => x.toFixed(0)).join(' / ')} A  (portata ${el.Inom} A)\nP ${fP(el.P)}  Q ${fQ(el.Q)}  3I0 ${(el.I0f ? cabs(el.I0f) * 3 * IB : 0).toFixed(1)} A\n79: ${el.rel79.en ? el.rec.st : 'esclusa'}`;
    case 'node': return `Cabina ${el.nm}\n${el.live ? 'alimentata da ' + (el.sup ? el.sup.short : '—') : 'NON alimentata'}  V ${(el.Vm * 100).toFixed(1)} %\ncarico ${fP(el.Pl)}  FV ${(el.Ppv * 1000).toFixed(0)} kW\ntrasformatore ${el.kva} kVA al ${fPct(el.load)}`;
    case 'seg': return `${el.nm}\n${el.km} km ${NET.cond[el.t][0]}\nI ${fI(el.I)} (portata ${el.Imax} A)` + (el.sw ? `\nIMS ${el.sw.closed ? 'CHIUSO' : 'APERTO'}` : '') + (el.fpi.flag ? '\nRGDAT: GUASTO RILEVATO' : '');
    case 'tie': return `${el.nm}\n${el.km} km · IMS ${el.sw.closed ? 'CHIUSO' : 'APERTO (punto di apertura)'}\nI ${fI(el.I)}`;
    case 'bus': return `${el.nm}\n${el.live ? fV(el.Vm) + '  ' + fF(el.fm) + '  df/dt ' + el.rocof.toFixed(2) + ' Hz/s' : 'FUORI TENSIONE'}` + (el.lock ? '\nBLOCCO 86 ATTIVO' : '');
    case 'br': return `${el.nm}\nP ${fP(Math.abs(el.Sa.r))}  I ${fI(el.I)}  carico ${fPct(el.load)}`;
    case 'pv': return `${el.nm}\nimmessa ${fP(el.I.pv.P)} · disponibile ${fP(el.I.pv.Pav)}\nirraggiamento ${el.I.pv.irr.toFixed(0)} W/m² · limite ${fPct(el.I.pv.curt)}\n` + el.I.pv.groups.filter(g => g.frac > 0).map(g => (g.on ? '● ' : '○ ') + g.nm).join('\n');
    case 'isl': return `${el.nm} · neutro ${el.coil.on ? 'compensato (bobina di Petersen)' : 'isolato'}\nC0 rete ${el.C0.toFixed(1)} µF · Ic ≈ ${(3 * WB * el.C0 * 1e-6 * VPH * 1000).toFixed(0)} A`;
  }
  return el.nm || '';
}
function sldEvents() {
  const cv = SLD.cv;
  cv.addEventListener('mousemove', e => {
    const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    const v = UI.view[UI.ctab === 'sld' ? UI.isl : 'map:' + UI.isl];
    if (SLD.drag && v) { v.ox = SLD.drag.ox + mx - SLD.drag.x; v.oy = SLD.drag.oy + my - SLD.drag.y; SLD.drag.moved = Math.max(SLD.drag.moved, Math.abs(mx - SLD.drag.x) + Math.abs(my - SLD.drag.y)); }
    if (UI.ctab !== 'sld' && UI.ctab !== 'map') return;
    if (UI.ctab === 'map' && MAP.tool === 'cloud') { const v2 = UI.view['map:' + UI.isl], c = v2 && cloudAt((mx - v2.ox) / v2.z, (my - v2.oy) / v2.z); const tip = $('tip'); tip.style.display = 'block'; tip.textContent = c ? 'Nube ' + Math.round(c.d * 100) + '% · raggio ' + c.r.toFixed(1) + ' km\nclic: dissolvi' : 'clic: crea una nube qui'; tip.style.left = Math.min(mx + 14, SLD.w - 220) + 'px'; tip.style.top = (my + 14) + 'px'; cv.style.cursor = 'crosshair'; UI.hov = null; return; }
    const h = UI.ctab === 'sld' ? sldHit(mx, my) : mapHit(mx, my); UI.hov = h ? h.el : null;
    const tip = $('tip');
    if (h) { tip.style.display = 'block'; tip.textContent = tipFor(h.el) + (h.go ? '\n(doppio clic: apri ' + (S.islById[h.go] ? S.islById[h.go].nm : 'RTN') + ')' : UI.ctab === 'map' ? (h.area ? '\nclic: azioni · doppio clic: vola sull\'isola' : '\nclic: azioni rapide') : '\nclic: comandi · tasto destro: azioni rapide'); tip.style.left = Math.min(mx + 14, SLD.w - 300) + 'px'; tip.style.top = Math.min(my + 14, SLD.h - 90) + 'px'; cv.style.cursor = 'pointer'; }
    else { tip.style.display = 'none'; cv.style.cursor = SLD.drag ? 'grabbing' : 'default'; }
  });
  cv.addEventListener('mousedown', e => { const r = cv.getBoundingClientRect(), v = UI.view[UI.ctab === 'sld' ? UI.isl : 'map:' + UI.isl]; if (!v) return; SLD.drag = { x: e.clientX - r.left, y: e.clientY - r.top, ox: v.ox, oy: v.oy, moved: 0 }; });
  window.addEventListener('mouseup', () => { setTimeout(() => SLD.drag = null, 0); });
  cv.addEventListener('mouseleave', () => { UI.hov = null; $('tip').style.display = 'none'; });
  cv.addEventListener('click', e => {
    if (SLD.drag && SLD.drag.moved > 4) return;
    const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    if (UI.ctab === 'map' && MAP.tool === 'cloud') { const v = UI.view['map:' + UI.isl], x = (mx - v.ox) / v.z, y = (my - v.oy) / v.z, c = cloudAt(x, y); if (c) removeCloud(c); else addCloud(x, y, clamp(140 / v.z, 0.8, 6), 0.8, true); return; }
    if (UI.ctab === 'map') { const h = mapHit(mx, my); if (h) { if (h.isl && h.isl !== UI.isl) selectIsl(h.isl); selectEl(h.el); ctxOpen(h.el, e.clientX, e.clientY); } else ctxClose(); return; }
    const h = sldHit(mx, my); if (h) selectEl(h.el);
  });
  cv.addEventListener('dblclick', e => {
    const r = cv.getBoundingClientRect();
    if (UI.ctab === 'map') { const h = mapHit(e.clientX - r.left, e.clientY - r.top); ctxClose(); if (h) { const id = h.isl || elIsl(h.el); if (id) { selectIsl(id); flyTo(id); } } return; }
    const h = UI.ctab === 'sld' ? sldHit(e.clientX - r.left, e.clientY - r.top) : null;
    if (h && h.go && S.islById[h.go]) selectIsl(h.go);
  });
  cv.addEventListener('wheel', e => {
    e.preventDefault();
    const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    const key = UI.ctab === 'sld' ? UI.isl : 'map:' + UI.isl, v = UI.view[key]; if (!v) return;
    MAP.anim = null; ctxClose();
    const f = e.deltaY < 0 ? 1.18 : 1 / 1.18, z = clamp(v.z * f, UI.ctab === 'sld' ? 0.2 : 3, UI.ctab === 'sld' ? 3.5 : 3000), ff = z / v.z;
    v.ox = mx - (mx - v.ox) * ff; v.oy = my - (my - v.oy) * ff; v.z = z;
  }, { passive: false });
}
