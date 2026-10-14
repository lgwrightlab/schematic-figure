// Demo of the cs parts (engine/cs.js): every part drawn at least once.
//   a  Transformer encoder: blockStack, repeatFrame, opNode, sineGlyph, fork, residual, link, wire
//   b  gallery: opNode operators, sineGlyph lobes, link vs wire, routed wire with a dot, vh fork, right residual (units)
//   e  DiT block: box, route (sharp trunk), opNode aliases, residual (radius 0), bus with arrowed taps, richRow
//   c  U-Net + ControlNet: blockStack (per-item widths, lock badges, fit), bus (two rails), pill, elbow, route chevrons,
//      lock / open lock / snowflake / flame badges
//   d  memory-layout table: grid (partial rules, cells), stackedBar (full / shard), ellipsis, fraction, swatchLegend,
//      fitText, route arrowhead styles
import * as D from '../engine/cs.js';
export const figure = { width: 183, height: 180, name: 'cs' };

export default async function draw(F, L) {
  const C = L.STYLE.color, INK = '#000', BW = 1.0;
  const a = F.panel('a', { x: 1, y: 1, w: 62, h: 98 });
  const cx = 92;
  // the repeat frame first, then a connector layer, then the boxes (connectors run over the frame fill)
  D.repeatFrame(a, cx - 44, 70, 88, 136, { label: 'N×', labelSide: 'left', r: 7, width: BW, fill: '#F2F2F2' });
  const conn = L.group(a, { part: 'connectors' });

  // input embedding (a one-box stack) and the positional-encoding sum
  D.blockStack(a, cx, 250, 64, [{ name: 'emb', label: 'Input\nEmbedding', h: 20, fill: '#F9D8DC' }], { width: BW, stroke: INK, F });
  L.text(a, cx, 272, 'Inputs', { anchor: 'middle', valign: 'middle', size: 7 });
  D.link(conn, [cx, 264], 'emb.bottom', { F, outline: BW, width: 0.8 });
  D.opNode(a, cx, 216, 4.5, { op: '+', width: 0.7, F, name: 'add' });
  D.sineGlyph(a, cx - 28, 216, 8, { width: 0.7, F, name: 'pe' });
  L.text(a, cx - 38, 216, 'Positional\nEncoding', { anchor: 'end', valign: 'middle', size: 6 });
  D.wire(conn, 'pe.right', 'add.left', { F, width: 1.0, relate: true, kind: 'sum' });
  D.link(conn, 'emb.top', 'add.bottom', { F, outline0: BW, width: 0.8, relate: true });

  // the repeated layer
  D.blockStack(a, cx, 190, 64, [
    { name: 'mha', label: 'Multi-Head\nAttention', h: 22, fill: '#FDDBB0', gap: 4 },
    { name: 'an1', label: 'Add & Norm', h: 10, fill: '#EFF3BE', gap: 20 },
    { name: 'ff', label: 'Feed\nForward', h: 22, fill: '#BDE5F6', gap: 4 },
    { name: 'an2', label: 'Add & Norm', h: 10, fill: '#EFF3BE' },
  ], { width: BW, stroke: INK, F, relate: true, linkWidth: 0.8 });
  D.wire(conn, 'add.top', [cx, 199], { F, width: 1.1 });
  D.fork(conn, [cx, 199], [[cx - 20, 190], [cx, 190], [cx + 20, 190]], { outline: BW, width: 0.8, radius: 3 });
  D.residual(conn, [cx, 203], 'an1.left', { F, outline: BW, width: 0.8, rail: 7, relate: true, relFrom: 'add.top' });
  D.residual(conn, [cx, 147], 'an2.left', { F, outline: BW, width: 0.8, rail: 7, relate: true, relFrom: 'an1.top' });
  D.link(conn, 'an2.top', [cx, 52], { F, outline0: BW, width: 0.8 });
  L.text(a, cx, 44, 'Encoder output', { anchor: 'middle', valign: 'middle', size: 7 });

  // gallery: operator nodes, glyph variants, wires and links, laid out in mm with a unit scale
  const b = F.panel('b', { x: 64, y: 1, w: 55, h: 98 });
  const U = D.units(L.mm(1));
  const ops = ['+', '×', '⊙', '−', '∥', 'σ'];
  ops.forEach((op, i) => {
    const [x, y] = U.P([8 + i * 8, 12]);
    D.opNode(b, x, y, U.X(2.6), { op, width: 0.7 });
    L.text(b, x, y + U.X(5), op, { anchor: 'middle', valign: 'middle', size: 5, color: C.mid });
  });
  const g1 = U.P([14, 30]), g2 = U.P([34, 30]);
  D.sineGlyph(b, g1[0], g1[1], U.X(5), { lobes: 'sine', width: 0.8 });
  D.sineGlyph(b, g2[0], g2[1], U.X(5), { lobes: 'arc', width: 0.8 });
  L.text(b, g1[0], g1[1] + U.X(8), "lobes: 'sine'", { anchor: 'middle', valign: 'middle', size: 5 });
  L.text(b, g2[0], g2[1] + U.X(8), "lobes: 'arc'", { anchor: 'middle', valign: 'middle', size: 5 });

  // wire vs link against a heavy-outline box: the link tip stops on the outer edge of the outline
  const bx = U.P([28, 50]);
  L.rect(b, bx[0], bx[1], U.X(20), U.X(10), { r: 2, fill: C.tintBlue, stroke: INK, width: 2 });
  L.text(b, bx[0] + U.X(10), bx[1] + U.X(5), 'outline 2 pt', { anchor: 'middle', valign: 'middle', size: 5 });
  D.link(b, U.P([8, 53]), [bx[0], bx[1] + U.X(3)], { outline: 2, width: 0.8 });
  D.wire(b, U.P([8, 57]), [bx[0], bx[1] + U.X(7)], { gap1: 1, width: 0.8 });
  L.text(b, U.X(8), U.X(51.5), 'link', { size: 5 });
  L.text(b, U.X(8), U.X(59.5), 'wire', { size: 5, valign: 'top' });
  L.text(b, U.X(8), U.X(66), '2 pt stub, then a routed wire with a dot', { size: 5 });
  D.wire(b, U.P([8, 68]), U.P([10, 68]), { width: 1 });
  D.wire(b, U.P([12, 68]), U.P([46, 78]), { via: U.pts([[30, 68], [30, 78]]), radius: 4, dot: true, width: 0.8 });

  // a fork in 'vh' order and a right-side residual
  const src = U.P([8, 88]);
  D.fork(b, src, [U.P([20, 82]), U.P([20, 88]), U.P([20, 94])], { order: 'vh', width: 0.7, dot: true });
  L.rect(b, U.X(20), U.X(80), U.X(12), U.X(16), { r: 1.5, fill: '#FDDBB0', stroke: INK, width: 0.8 });
  L.text(b, U.X(26), U.X(88), 'Q K V', { anchor: 'middle', valign: 'middle', size: 5, rotate: -90 });
  L.rect(b, U.X(38), U.X(84), U.X(10), U.X(6), { r: 1.2, fill: '#EFF3BE', stroke: INK, width: 0.8 });
  D.link(b, U.P([43, 97]), U.P([43, 90]), { outline: 0.8, width: 0.7 });
  D.residual(b, U.P([43, 95]), U.P([48, 87]), { side: 'right', rail: U.X(3), outline: 0.8, width: 0.7 });

  // ---- e: DiT block with adaLN-Zero (sharp corners, bus of modulation taps) ----
  const e = F.panel('e', { x: 120, y: 1, w: 62, h: 98 });
  L.rect(e, 16, 8, 150, 250, { r: 10, fill: '#F3F3F6', stroke: INK, width: 0.8 });
  const eL = L.group(e, { part: 'connectors' });
  const tx = 72, bx0 = 44, bw = 56, B = { width: 0, stroke: 'none', size: 5.5 };
  const BL = '#C6DAFD', GR = '#C3E3BD', OR = '#F9CC8B', GY = '#D4D7E3';
  D.route(eL, [[tx, 236], [tx, 12]], { width: 0.7 });
  D.box(e, bx0, 236, bw, 14, { ...B, label: 'Input Tokens', fill: GY, F, name: 'tok' });
  D.box(e, bx0, 216, bw, 12, { ...B, label: 'Layer Norm', fill: BL });
  D.box(e, bx0, 200, bw, 12, { ...B, label: 'Scale, Shift', fill: BL, F, name: 'ss1' });
  D.box(e, bx0, 172, bw, 24, { ...B, label: 'Multi-Head\nSelf-Attention', fill: OR });
  D.box(e, bx0, 156, bw, 12, { ...B, label: 'Scale', fill: BL, F, name: 's1' });
  D.opNode(e, tx, 142, 5.5, { op: '⊕', width: 0.8, F, name: 'add1' });
  D.box(e, bx0, 118, bw, 12, { ...B, label: 'Layer Norm', fill: BL });
  D.box(e, bx0, 102, bw, 12, { ...B, label: 'Scale, Shift', fill: BL, F, name: 'ss2' });
  D.box(e, bx0, 74, bw, 24, { ...B, label: 'Pointwise\nFeedforward', fill: GR });
  D.box(e, bx0, 58, bw, 12, { ...B, label: 'Scale', fill: BL, F, name: 's2' });
  D.opNode(e, tx, 42, 5.5, { op: '⊕', width: 0.8, F, name: 'add2' });
  D.residual(eL, [tx, 233], 'add1.left', { F, railX: 28, radius: 0, width: 0.7, relate: true, relFrom: 'tok.top' });
  D.residual(eL, [tx, 134], 'add2.left', { F, railX: 28, radius: 0, width: 0.7, relate: true, relFrom: 'add1.top' });
  D.box(e, 108, 236, 50, 14, { ...B, label: 'Conditioning', fill: BL, F, name: 'cond' });
  D.box(e, 113, 212, 40, 16, { ...B, label: 'MLP', fill: BL, F, name: 'mlp' });
  D.wire(eL, 'cond.top', 'mlp.bottom', { F, width: 0.7, relate: true });
  D.bus(eL, 133, 212, [206, 162, 108, 64].map((y) => ({ y, to: bx0 + bw })), { width: 0.7, head: 'fill' });
  for (const [y, s] of [[206, 'γ_{1}, β_{1}'], [162, 'α_{1}'], [108, 'γ_{2}, β_{2}'], [64, 'α_{2}']])
    L.text(e, 117, y - 3.5, s, { size: 5.5, anchor: 'middle', family: L.STYLE.font.latex, italic: true });
  D.richRow(e, 91, 270, ['DiT block ×', { s: 'N', family: L.STYLE.font.latex, italic: true, size: 7, gap: 1 }], { anchor: 'middle', valign: 'middle', size: 6.5 });

  // ---- c: U-Net with locked blocks + ControlNet copy ----
  const c = F.panel('c', { x: 1, y: 101, w: 100, h: 78 });
  const TEAL = '#2F7F93', TEALF = '#DCEDF3', GREY = '#707070';
  D.repeatFrame(c, 186, 22, 94, 172, { label: false, fill: 'none', stroke: '#8EC9D6', dash: '3 2', r: 6, width: 0.7 });
  const cL = L.group(c, { part: 'connectors' });
  const widths = [118, 104, 90, 80, 90, 104, 118];
  const labels = ['Encoder Block A 64×64', 'Encoder Block B 32×32', 'Encoder Block C 16×16', 'Middle Block 8×8',
    'Decoder Block C 16×16', 'Decoder Block B 32×32', 'Decoder Block A 64×64'];
  const st = D.blockStack(c, 100, 30, 118, labels.map((label, i) => ({ name: `u${i}`, label, w: widths[i], h: 18 })), {
    dir: 'down', gap: 6, fill: '#F2F2F2', stroke: GREY, width: 0.8, r: 3, size: 6, fit: true, badge: 'lock', badgeColor: '#8E8E8E', badgeSize: 5, F,
  });
  D.box(c, 12, 2, 50, 16, { label: 'Prompt & Time', size: 5.5, fill: '#F8F8F8', stroke: GREY, width: 0.8, r: 3, badge: 'lock', badgeAt: 'tr', badgeColor: '#8E8E8E', badgeSize: 4.5, F, name: 'enc' });
  D.bus(cL, 30, 18, st.list.map((bb) => ({ y: bb.y + 7, to: bb.x })), { rails: [{ dx: 0, stroke: '#666' }, { dx: -10, stroke: '#CFCFCF', tapDy: 5 }], width: 0.8 });
  D.link(cL, [100, 18], 'u0.top', { F, outline: 0.8, width: 0.8, stroke: '#666' });
  L.text(c, 104, 20, 'Input', { size: 5.5, valign: 'middle' });
  D.blockStack(c, 233, 30, 84, [
    { name: 'cA', label: 'Encoder A (trainable copy)', h: 18, badge: 'flame' },
    { name: 'cM', label: 'Middle (trainable copy)', h: 18, w: 72, badge: 'flame' },
  ], { dir: 'down', gap: 6, fill: TEALF, stroke: TEAL, width: 0.8, r: 3, size: 5.5, fit: true, badgeSize: 6, F });
  D.elbow(cL, 'cM.bottom', 'u3.right', { F, order: 'vh', head: 'chevron', stroke: TEAL, width: 0.8, outline: 0.8, relate: true });
  [4, 5, 6].forEach((k, j) => {
    const bb = st.list[k], cy = bb.y + bb.h / 2;
    D.pill(c, 196, cy - 6, 74, 12, { label: 'zero convolution', size: 5.5, stroke: '#C4C4C4', width: 0.8 });
    D.route(cL, [[196, cy], [bb.x + bb.w, cy]], { head: 'chevron', stroke: TEAL, width: 0.8, outline: 0.8 });
    D.route(cL, [[250 + j * 8, 72], [250 + j * 8, cy - 6]], { head: 'chevron', headLength: 2.4, stroke: TEAL, width: 0.6, dash: '1.5 1.2', outline: 0.8 });
  });
  // badge key
  const kx = 10, ky = 210;
  D.lock(c, kx, ky, 5); L.text(c, kx + 6, ky, 'lock', { size: 5.5, valign: 'middle' });
  D.lock(c, kx + 36, ky, 5, { open: true, color: TEAL }); L.text(c, kx + 42, ky, 'lock, open', { size: 5.5, valign: 'middle' });
  D.snowflake(c, kx + 90, ky, 7); L.text(c, kx + 96, ky, 'snowflake', { size: 5.5, valign: 'middle' });
  D.flame(c, kx + 138, ky, 7); L.text(c, kx + 144, ky, 'flame', { size: 5.5, valign: 'middle' });
  D.pill(c, kx + 172, ky - 5, 44, 10, { label: 'pill', size: 5.5, stroke: GREY, width: 0.7 });

  // ---- d: memory-layout table (ZeRO style) ----
  const d = F.panel('d', { x: 102, y: 101, w: 80, h: 78 });
  const RULE = '#4472C4', PB = '#8FAADC', GB = '#F4B183', OB = '#A9D18E';
  const G = D.grid(d, 0, 6, [36, 146, 44], [22, 34, 34, 34, 34], {
    stroke: RULE, width: 0.6, size: 6.5,
    h: [{ at: 1, from: 2 }, { at: 2, from: 0.4 }, { at: 3, from: 0.4 }, { at: 4, from: 0.4 }, { at: 5, from: 0.4 }],
    v: [{ at: 1, from: 0.5, to: 5, ext1: 4 }, { at: 2, from: 0, to: 5, ext1: 4 }],
    cells: [[null, null, 'Memory'], ['Baseline'], ['P_{os}'], ['P_{os+g}'], ['P_{os+g+p}']], fit: true,
  });
  const gx = [40, 94, 148], bwid = 34;
  gx.forEach((x, k) => L.text(d, x + bwid / 2, G.cell(0, 1).cy + 2, ['gpu_{0}', 'gpu_{i}', 'gpu_{N-1}'][k], { size: 6.5, anchor: 'middle', valign: 'middle' }));
  const spans = [['full', 'full', 'full'], ['full', 'full', 'shard'], ['full', 'shard', 'shard'], ['shard', 'shard', 'shard']];
  spans.forEach((sp, r) => {
    const y0 = G.cell(r + 1, 1).y + 5;
    gx.forEach((x, j) => D.stackedBar(d, x, y0, bwid, [{ h: 3, fill: PB, span: sp[0] }, { h: 3, fill: GB, span: sp[1] }, { h: 17, fill: OB, span: sp[2] }], { shardAt: j / 2, shardW: bwid / 8 }));
    for (const ex of [84, 138]) D.ellipsis(d, ex, y0 + 10, { r: 0.7 });
  });
  const mc = G.cell(1, 2).cx, M = { size: 5.5, family: L.STYLE.font.math };
  L.text(d, mc, G.cell(1, 2).cy, '16Ψ', { ...M, anchor: 'middle', valign: 'middle' });
  L.text(d, mc - 1, G.cell(2, 2).cy, '4Ψ +', { ...M, anchor: 'end', valign: 'middle' });
  D.fraction(d, mc + 1, G.cell(2, 2).cy, '12Ψ', '*N*_{d}', { ...M, anchor: 'start' });
  L.text(d, mc - 1, G.cell(3, 2).cy, '2Ψ +', { ...M, anchor: 'end', valign: 'middle' });
  D.fraction(d, mc + 1, G.cell(3, 2).cy, '14Ψ', '*N*_{d}', { ...M, anchor: 'start' });
  D.fraction(d, mc, G.cell(4, 2).cy, '16Ψ', '*N*_{d}', M);
  D.fitText(d, 18, G.cell(0, 0).cy, 'fitText demo', 30, { size: 6, anchor: 'middle', valign: 'middle', color: C.mid });
  D.swatchLegend(d, 30, 180, [{ fill: PB, label: 'Parameters' }, { fill: GB, label: 'Gradients' }, { fill: OB, label: 'Optimizer states' }], { size: 6.5 });
  // arrowhead styles of route
  ['fill', 'open', 'chevron'].forEach((hd, k) => {
    const x = 20 + k * 70;
    D.route(d, [[x, 200], [x + 30, 200], [x + 30, 212]], { head: hd, width: 0.7 });
    L.text(d, x + 34, 208, `head: '${hd}'`, { size: 5, valign: 'middle' });
  });
}
