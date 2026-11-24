/**
 * Procedural pixel art. Every sprite in the shop is drawn here pixel-by-pixel on a
 * consistent 16px grid with a shared outline colour, so the art stays coherent
 * without external image assets.
 */
import Phaser from 'phaser';

export const TILE = 16;
const OUTLINE = '#2b1d16';

type Px = (string | null)[][];

function buf(w: number, h: number): Px {
  return Array.from({ length: h }, () => Array<string | null>(w).fill(null));
}

/** Add a 1px dark outline around every filled region (classic sprite look). */
function outline(b: Px, color = OUTLINE): Px {
  const h = b.length, w = b[0].length;
  const out = b.map((r) => [...r]);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (b[y][x]) continue;
      const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => b[y + dy]?.[x + dx] && b[y + dy][x + dx] !== color);
      if (n) out[y][x] = color;
    }
  return out;
}

function blit(ctx: CanvasRenderingContext2D, b: Px, ox: number, oy: number, flip = false) {
  const w = b[0].length;
  b.forEach((row, y) =>
    row.forEach((c, x) => {
      if (!c) return;
      ctx.fillStyle = c;
      ctx.fillRect(ox + (flip ? w - 1 - x : x), oy + y, 1, 1);
    }),
  );
}

function rect(b: Px, x: number, y: number, w: number, h: number, c: string) {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (b[j] && i >= 0 && i < b[0].length) b[j][i] = c;
}
function px(b: Px, x: number, y: number, c: string) {
  if (b[y] && x >= 0 && x < b[0].length) b[y][x] = c;
}

/** Parse a string-art sprite: each char maps through the palette, '.' is transparent. */
function fromArt(rows: string[], pal: Record<string, string>): Px {
  return rows.map((r) => [...r].map((ch) => (ch === '.' || ch === ' ' ? null : pal[ch] ?? null)));
}

export function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v + amt * 255)));
  const r = f((n >> 16) & 255), g = f((n >> 8) & 255), b = f(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return { c, ctx };
}

function addCanvasTexture(scene: Phaser.Scene, key: string, c: HTMLCanvasElement, frames?: { name: string | number; x: number; y: number; w: number; h: number }[]) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.addCanvas(key, c)!;
  frames?.forEach((f) => tex.add(f.name, 0, f.x, f.y, f.w, f.h));
  return tex;
}

/* ------------------------------------------------------------------ */
/* Characters                                                          */
/* ------------------------------------------------------------------ */

export interface CharPalette { skin: string; hair: string; shirt: string; pants: string; shoes: string; apron?: string; hat?: string }

export const CUSTOMER_PALETTES: CharPalette[] = [
  { skin: '#e8b48a', hair: '#3b2a20', shirt: '#3d7ec9', pants: '#3a3f5c', shoes: '#2a2321' },
  { skin: '#c58b62', hair: '#1f1a17', shirt: '#d9573b', pants: '#4b4a44', shoes: '#3a2a20' },
  { skin: '#a8714d', hair: '#2a2220', shirt: '#e2b33c', pants: '#2f4f6b', shoes: '#262222', hat: '#e07b2a' },
  { skin: '#f0c7a0', hair: '#8a5a2b', shirt: '#4f9d62', pants: '#5a4636', shoes: '#2a2321' },
  { skin: '#8d5a3b', hair: '#121010', shirt: '#8a5cc2', pants: '#34364a', shoes: '#1d1a19' },
  { skin: '#dba27a', hair: '#5a3a22', shirt: '#e3e0d6', pants: '#2c5a78', shoes: '#2a2321', hat: '#f0c419' },
  { skin: '#b8805a', hair: '#6b6b6b', shirt: '#7a8b47', pants: '#3a3434', shoes: '#262222' },
  { skin: '#e9b98f', hair: '#c46a2c', shirt: '#2f8f8f', pants: '#45404f', shoes: '#2a2321' },
];

/** Delivery person: brown courier uniform with a green cap. */
export const COURIER_PALETTE: CharPalette = { skin: '#c58b62', hair: '#1f1a17', shirt: '#a8642a', pants: '#4b3a2a', shoes: '#2a2321', hat: '#2f6b3f' };

export const KEEPER_PALETTE: CharPalette = { skin: '#d9a07a', hair: '#2a1f1a', shirt: '#f2efe6', pants: '#3b3a40', shoes: '#2a2321', apron: '#2f6b3f' };

type Dir = 'down' | 'up' | 'side';
export const DIRS: Dir[] = ['down', 'up', 'side'];
const FRAMES = 4;

function drawCharacter(dir: Dir, frame: number, p: CharPalette): Px {
  const b = buf(16, 16);
  const skinD = shade(p.skin, -0.12);
  const shirtD = shade(p.shirt, -0.16);
  const pantsD = shade(p.pants, -0.12);
  const hairL = shade(p.hair, 0.1);
  const step = frame === 1 ? 1 : frame === 3 ? -1 : 0; // 1: left foot forward, -1: right
  const bob = step !== 0 ? 0 : 0;

  if (dir === 'down' || dir === 'up') {
    // legs + shoes
    const leftUp = step === 1, rightUp = step === -1;
    rect(b, 5, 12, 6, 1, pantsD);
    rect(b, 5, 13, 3, leftUp ? 0 : 1, p.pants);
    rect(b, 8, 13, 3, rightUp ? 0 : 1, p.pants);
    rect(b, 5, leftUp ? 13 : 14, 3, 1, p.shoes);
    rect(b, 8, rightUp ? 13 : 14, 3, 1, p.shoes);
    // torso
    rect(b, 4, 8, 8, 4, p.shirt);
    rect(b, 4, 11, 8, 1, shirtD);
    if (p.apron && dir === 'down') { rect(b, 5, 9, 6, 4, p.apron); rect(b, 5, 9, 6, 1, shade(p.apron, 0.12)); }
    // arms (swing opposite to legs)
    const la = leftUp ? -1 : rightUp ? 1 : 0;
    rect(b, 3, 8 + Math.max(0, -la), 1, 3, p.shirt);
    px(b, 3, 11 + (la < 0 ? -1 : la > 0 ? 0 : 0), p.skin);
    rect(b, 12, 8 + Math.max(0, la), 1, 3, p.shirt);
    px(b, 12, 11 + (la > 0 ? -1 : 0), p.skin);
    // head
    if (dir === 'down') {
      rect(b, 4, 3, 8, 5, p.skin);
      rect(b, 5, 7, 6, 1, skinD);
      rect(b, 5, 1, 6, 1, p.hair);
      rect(b, 4, 2, 8, 2, p.hair);
      px(b, 4, 4, p.hair); px(b, 11, 4, p.hair);
      px(b, 6, 2, hairL); px(b, 7, 2, hairL);
      px(b, 6, 5, OUTLINE); px(b, 9, 5, OUTLINE);
      px(b, 5, 6, shade(p.skin, 0.06)); px(b, 10, 6, shade(p.skin, 0.06));
    } else {
      rect(b, 4, 2, 8, 5, p.hair);
      rect(b, 5, 1, 6, 1, p.hair);
      rect(b, 5, 7, 6, 1, skinD);
      px(b, 6, 2, hairL); px(b, 9, 3, hairL);
    }
    if (p.hat) { rect(b, 4, 1, 8, 2, p.hat); rect(b, 5, 0, 6, 1, p.hat); rect(b, 3, 3, dir === 'down' ? 10 : 0, 1, shade(p.hat, -0.15)); }
  } else {
    // side view, facing right
    const front = step === 1, back = step === -1;
    rect(b, 6, 12, 4, 1, pantsD);
    if (front) { rect(b, 8, 13, 3, 1, p.pants); rect(b, 9, 14, 3, 1, p.shoes); rect(b, 5, 13, 2, 1, p.pants); rect(b, 4, 14, 3, 1, p.shoes); }
    else if (back) { rect(b, 5, 13, 3, 1, p.pants); rect(b, 4, 14, 3, 1, p.shoes); rect(b, 8, 13, 2, 1, p.pants); rect(b, 8, 14, 4, 1, p.shoes); }
    else { rect(b, 6, 13, 4, 1, p.pants); rect(b, 6, 14, 5, 1, p.shoes); }
    rect(b, 5, 8, 6, 4, p.shirt);
    rect(b, 5, 11, 6, 1, shirtD);
    if (p.apron) rect(b, 8, 9, 3, 4, p.apron);
    // arm
    const ax = front ? 8 : back ? 6 : 7;
    rect(b, ax, 8, 2, 3, shirtD);
    px(b, ax + (front ? 1 : 0), 11, p.skin);
    // head
    rect(b, 5, 3, 7, 5, p.skin);
    rect(b, 6, 7, 5, 1, skinD);
    px(b, 12, 5, p.skin);
    rect(b, 5, 1, 6, 1, p.hair);
    rect(b, 4, 2, 8, 2, p.hair);
    rect(b, 4, 4, 3, 3, p.hair);
    px(b, 7, 2, hairL);
    px(b, 10, 5, OUTLINE);
    if (p.hat) { rect(b, 4, 1, 8, 2, p.hat); rect(b, 5, 0, 6, 1, p.hat); rect(b, 9, 3, 4, 1, shade(p.hat, -0.15)); }
  }
  void bob;
  return outline(b);
}

/** Builds a sprite sheet: rows = directions (down, up, side), columns = 4 walk frames. */
export function makeCharacterTexture(scene: Phaser.Scene, key: string, p: CharPalette) {
  const { c, ctx } = canvas(16 * FRAMES, 16 * DIRS.length);
  const frames: { name: number; x: number; y: number; w: number; h: number }[] = [];
  DIRS.forEach((d, row) => {
    for (let f = 0; f < FRAMES; f++) {
      blit(ctx, drawCharacter(d, f, p), f * 16, row * 16);
      frames.push({ name: row * FRAMES + f, x: f * 16, y: row * 16, w: 16, h: 16 });
    }
  });
  addCanvasTexture(scene, key, c, frames);
  for (const [row, d] of DIRS.entries()) {
    const animKey = `${key}-walk-${d}`;
    if (scene.anims.exists(animKey)) scene.anims.remove(animKey);
    scene.anims.create({
      key: animKey,
      frames: [0, 1, 2, 3].map((f) => ({ key, frame: row * FRAMES + f })),
      frameRate: 8,
      repeat: -1,
    });
  }
}

/* ------------------------------------------------------------------ */
/* Tiles & furniture                                                   */
/* ------------------------------------------------------------------ */

function drawFloor(ctx: CanvasRenderingContext2D, ox: number, oy: number, seed: number) {
  const r = rng(seed);
  const planks = ['#b98450', '#ad7848', '#b3804d', '#a97445'];
  for (let row = 0; row < 4; row++) {
    const base = planks[(row + seed) % planks.length];
    ctx.fillStyle = base;
    ctx.fillRect(ox, oy + row * 4, 16, 4);
    ctx.fillStyle = shade(base, 0.05);
    ctx.fillRect(ox, oy + row * 4, 16, 1);
    ctx.fillStyle = '#7f5330';
    ctx.fillRect(ox, oy + row * 4 + 3, 16, 1);
    const seam = (row * 7 + seed * 5) % 16;
    ctx.fillRect(ox + seam, oy + row * 4, 1, 3);
    if (r() > 0.6) { ctx.fillStyle = shade(base, -0.08); ctx.fillRect(ox + Math.floor(r() * 14) + 1, oy + row * 4 + 1, 2, 1); }
  }
}

function drawConcrete(ctx: CanvasRenderingContext2D, ox: number, oy: number, seed: number) {
  const r = rng(seed + 99);
  ctx.fillStyle = '#9c978d';
  ctx.fillRect(ox, oy, 16, 16);
  for (let i = 0; i < 10; i++) {
    ctx.fillStyle = r() > 0.5 ? '#8f8a80' : '#aaa59b';
    ctx.fillRect(ox + Math.floor(r() * 16), oy + Math.floor(r() * 16), 1, 1);
  }
  ctx.fillStyle = '#8a857b';
  ctx.fillRect(ox, oy + 15, 16, 1);
  ctx.fillRect(ox + 15, oy, 1, 16);
}

function drawWallFace(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  ctx.fillStyle = '#e8d9b8';
  ctx.fillRect(ox, oy, 16, 16);
  ctx.fillStyle = '#dccaa3';
  for (let x = 0; x < 16; x += 4) ctx.fillRect(ox + x, oy, 2, 12);
  ctx.fillStyle = '#c9b48c';
  ctx.fillRect(ox, oy + 11, 16, 1);
  ctx.fillStyle = '#8c5d39';
  ctx.fillRect(ox, oy + 12, 16, 3);
  ctx.fillStyle = '#a9714a';
  ctx.fillRect(ox, oy + 12, 16, 1);
  ctx.fillStyle = '#5e3d27';
  ctx.fillRect(ox, oy + 15, 16, 1);
}

function drawWallTop(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  ctx.fillStyle = '#5a3d2b';
  ctx.fillRect(ox, oy, 16, 16);
  ctx.fillStyle = '#6e4c36';
  ctx.fillRect(ox, oy + 1, 16, 2);
  ctx.fillStyle = '#4a3123';
  ctx.fillRect(ox, oy + 14, 16, 2);
  ctx.fillStyle = '#7c573e';
  for (let x = 2; x < 16; x += 8) ctx.fillRect(ox + x, oy + 6, 4, 1);
}

function drawSideWall(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  ctx.fillStyle = '#5a3d2b';
  ctx.fillRect(ox, oy, 16, 16);
  ctx.fillStyle = '#6e4c36';
  ctx.fillRect(ox + 2, oy, 12, 16);
  ctx.fillStyle = '#7c573e';
  ctx.fillRect(ox + 4, oy, 1, 16);
  ctx.fillStyle = '#4a3123';
  ctx.fillRect(ox, oy, 2, 16);
  ctx.fillRect(ox + 14, oy, 2, 16);
}

function drawFrontWall(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  ctx.fillStyle = '#5a3d2b';
  ctx.fillRect(ox, oy, 16, 16);
  ctx.fillStyle = '#6e4c36';
  ctx.fillRect(ox, oy + 2, 16, 6);
  ctx.fillStyle = '#4a3123';
  ctx.fillRect(ox, oy, 16, 2);
  // exterior face (brick) on the lower half
  ctx.fillStyle = '#9b4a35';
  ctx.fillRect(ox, oy + 8, 16, 8);
  ctx.fillStyle = '#7d3a2a';
  for (let y = 8; y < 16; y += 3) ctx.fillRect(ox, oy + y, 16, 1);
  for (let y = 8, k = 0; y < 16; y += 3, k++) for (let x = (k % 2) * 4; x < 16; x += 8) ctx.fillRect(ox + x, oy + y, 1, 3);
}

function drawSidewalk(ctx: CanvasRenderingContext2D, ox: number, oy: number, seed: number) {
  ctx.fillStyle = '#bdb6a6';
  ctx.fillRect(ox, oy, 16, 16);
  ctx.fillStyle = '#a49d8d';
  ctx.fillRect(ox, oy + 7, 16, 1);
  ctx.fillRect(ox + (seed % 2 ? 4 : 11), oy, 1, 7);
  ctx.fillRect(ox + (seed % 2 ? 11 : 4), oy + 8, 1, 8);
  ctx.fillStyle = '#cbc5b6';
  ctx.fillRect(ox, oy, 16, 1);
}

function drawGrass(ctx: CanvasRenderingContext2D, ox: number, oy: number, seed: number) {
  const r = rng(seed + 7);
  ctx.fillStyle = '#5f9442';
  ctx.fillRect(ox, oy, 16, 16);
  for (let i = 0; i < 9; i++) {
    const x = Math.floor(r() * 15), y = Math.floor(r() * 14);
    ctx.fillStyle = '#78ad52';
    ctx.fillRect(ox + x, oy + y, 1, 2);
    ctx.fillStyle = '#4d7d36';
    ctx.fillRect(ox + x + 1, oy + y + 1, 1, 1);
  }
  if (r() > 0.55) {
    const x = Math.floor(r() * 12) + 2, y = Math.floor(r() * 10) + 3;
    ctx.fillStyle = r() > 0.5 ? '#f2d24b' : '#f08aa8';
    ctx.fillRect(ox + x, oy + y, 2, 2);
    ctx.fillStyle = '#fff6d5';
    ctx.fillRect(ox + x, oy + y, 1, 1);
  }
}

function drawDoormat(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  drawFloor(ctx, ox, oy, 3);
  ctx.fillStyle = '#7a3b2e';
  ctx.fillRect(ox + 1, oy + 3, 14, 11);
  ctx.fillStyle = '#9a5141';
  ctx.fillRect(ox + 2, oy + 4, 12, 9);
  ctx.fillStyle = '#7a3b2e';
  for (let y = 5; y < 13; y += 2) ctx.fillRect(ox + 3, oy + y, 10, 1);
}

function drawThreshold(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  ctx.fillStyle = '#8d6a4b';
  ctx.fillRect(ox, oy, 16, 16);
  ctx.fillStyle = '#a07b59';
  ctx.fillRect(ox, oy + 2, 16, 12);
  ctx.fillStyle = '#6f5038';
  ctx.fillRect(ox, oy + 7, 16, 1);
}

function drawRug(ctx: CanvasRenderingContext2D, ox: number, oy: number, part: 'l' | 'm' | 'r') {
  drawFloor(ctx, ox, oy, 5);
  const x0 = part === 'l' ? 2 : 0, x1 = part === 'r' ? 14 : 16;
  ctx.fillStyle = '#2f5d73';
  ctx.fillRect(ox + x0, oy + 2, x1 - x0, 12);
  ctx.fillStyle = '#e1c27a';
  ctx.fillRect(ox + x0, oy + 4, x1 - x0, 1);
  ctx.fillRect(ox + x0, oy + 11, x1 - x0, 1);
  ctx.fillStyle = '#3f7690';
  for (let x = x0 + 2; x < x1 - 1; x += 4) ctx.fillRect(ox + x, oy + 7, 2, 2);
}

const TILE_NAMES = [
  'floor0', 'floor1', 'floor2', 'floor3', 'concrete0', 'concrete1', 'wallFace', 'wallTop', 'sideWall', 'frontWall',
  'sidewalk0', 'sidewalk1', 'grass0', 'grass1', 'grass2', 'doormat', 'threshold', 'rugL', 'rugM', 'rugR',
] as const;
export type TileName = (typeof TILE_NAMES)[number];

export function makeTiles(scene: Phaser.Scene) {
  const { c, ctx } = canvas(16 * TILE_NAMES.length, 16);
  TILE_NAMES.forEach((n, i) => {
    const ox = i * 16;
    if (n.startsWith('floor')) drawFloor(ctx, ox, 0, Number(n.slice(-1)));
    else if (n.startsWith('concrete')) drawConcrete(ctx, ox, 0, Number(n.slice(-1)));
    else if (n === 'wallFace') drawWallFace(ctx, ox, 0);
    else if (n === 'wallTop') drawWallTop(ctx, ox, 0);
    else if (n === 'sideWall') drawSideWall(ctx, ox, 0);
    else if (n === 'frontWall') drawFrontWall(ctx, ox, 0);
    else if (n.startsWith('sidewalk')) drawSidewalk(ctx, ox, 0, Number(n.slice(-1)));
    else if (n.startsWith('grass')) drawGrass(ctx, ox, 0, Number(n.slice(-1)) * 13 + 1);
    else if (n === 'doormat') drawDoormat(ctx, ox, 0);
    else if (n === 'threshold') drawThreshold(ctx, ox, 0);
    else if (n === 'rugL') drawRug(ctx, ox, 0, 'l');
    else if (n === 'rugM') drawRug(ctx, ox, 0, 'm');
    else if (n === 'rugR') drawRug(ctx, ox, 0, 'r');
  });
  addCanvasTexture(scene, 'tiles', c, TILE_NAMES.map((n, i) => ({ name: n, x: i * 16, y: 0, w: 16, h: 16 })));
}

/** Free-standing furniture and props, each its own texture. */
export function makeProps(scene: Phaser.Scene) {
  // Shelf unit, 16×24, two levels. Products are layered on top separately.
  {
    const b = buf(16, 24);
    const side = '#8a5a34', top = '#c58b55', front = '#9a6538', inner = '#4e3222', innerL = '#5d3d29';
    rect(b, 0, 0, 16, 24, side);
    rect(b, 1, 0, 14, 2, top);
    rect(b, 1, 2, 14, 1, front);
    rect(b, 1, 3, 14, 7, inner);
    rect(b, 1, 3, 14, 1, innerL);
    rect(b, 1, 10, 14, 1, top);
    rect(b, 1, 11, 14, 1, front);
    rect(b, 1, 12, 14, 7, inner);
    rect(b, 1, 12, 14, 1, innerL);
    rect(b, 1, 19, 14, 1, top);
    rect(b, 1, 20, 14, 2, front);
    rect(b, 1, 22, 14, 2, '#6b4426');
    rect(b, 6, 20, 4, 2, '#efe6cf'); // price tag
    px(b, 7, 21, '#9b4a35'); px(b, 8, 21, '#9b4a35');
    const { c, ctx } = canvas(18, 26);
    blit(ctx, outline(padded(b)), 0, 0);
    addCanvasTexture(scene, 'shelf', c);
  }
  // Counter, 5 tiles wide, plus an L-return 1 tile wide.
  {
    const w = 80, h = 26;
    const b = buf(w, h);
    rect(b, 0, 0, w, 10, '#c99a62');
    rect(b, 0, 0, w, 1, '#ddb27a');
    for (let x = 6; x < w; x += 16) rect(b, x, 2, 1, 7, '#b88a55');
    rect(b, 0, 10, w, 1, '#7f5331');
    rect(b, 0, 11, w, 13, '#8f5f38');
    for (let x = 2; x < w; x += 16) { rect(b, x, 13, 12, 9, '#9e6b41'); rect(b, x, 13, 12, 1, '#b07a4c'); }
    rect(b, 0, 24, w, 2, '#5e3c25');
    const { c, ctx } = canvas(w + 2, h + 2);
    blit(ctx, outline(padded(b)), 0, 0);
    addCanvasTexture(scene, 'counter', c);
  }
  {
    const b = buf(16, 26);
    rect(b, 0, 0, 16, 16, '#c99a62');
    rect(b, 0, 0, 16, 1, '#ddb27a');
    rect(b, 0, 16, 16, 1, '#7f5331');
    rect(b, 0, 17, 16, 7, '#8f5f38');
    rect(b, 2, 18, 12, 5, '#9e6b41');
    rect(b, 0, 24, 16, 2, '#5e3c25');
    const { c, ctx } = canvas(18, 28);
    blit(ctx, outline(padded(b)), 0, 0);
    addCanvasTexture(scene, 'counterSide', c);
  }
  // Cash register
  addArt(scene, 'register', [
    '..cccccccc..',
    '..cggggggc..',
    '..cgllgggc..',
    '..cccccccc..',
    'aaaaaaaaaaaa',
    'abbbbbbbbbba',
    'abdbdbdbdbba',
    'abbbbbbbbbba',
    'aaaaaaaaaaaa',
  ], { a: '#4b5157', b: '#6f777e', c: '#3a3f44', g: '#4fb06d', l: '#9be0a9', d: '#d7dadc' });
  // Crate
  addArt(scene, 'crate', [
    'aaaaaaaaaaaaaa',
    'abbbbbbbbbbbba',
    'abccccccccccba',
    'abcbbbbbbbbcba',
    'abcbdbbbbdbcba',
    'abcbbdbbdbbcba',
    'abcbbbddbbbcba',
    'abcbbbddbbbcba',
    'abcbbdbbdbbcba',
    'abcbdbbbbdbcba',
    'abcbbbbbbbbcba',
    'abccccccccccba',
    'abbbbbbbbbbbba',
    'aaaaaaaaaaaaaa',
  ], { a: '#6b4426', b: '#c08a52', c: '#9a6a3d', d: '#8a5a34' });
  // Cardboard boxes stack
  addArt(scene, 'boxes', [
    '...aaaaaaaa...',
    '...abbbbbbba..',
    '...abbccbbba..',
    '...abbbbbbba..',
    '..aaaaaaaaaaa.',
    'aaaaaaaaaaaaaa',
    'abbbbbbabbbbba',
    'abbbccbabbccba',
    'abbbbbbabbbbba',
    'abbbbbbabbbbba',
    'abbbbbbabbbbba',
    'aaaaaaaaaaaaaa',
  ], { a: '#8a5f32', b: '#d2a46b', c: '#f4ead2' });
  // Barrel
  addArt(scene, 'barrel', [
    '..aaaaaaaa..',
    '.abbbbbbbba.',
    '.accccccccа.',
    'adddddddddda',
    'abbbbbbbbbba',
    'abbbbbbbbbba',
    'adddddddddda',
    'abbbbbbbbbba',
    'abbbbbbbbbba',
    'adddddddddda',
    '.abbbbbbbba.',
    '..aaaaaaaa..',
  ], { a: '#5e3c25', b: '#a66f3f', c: '#c88f57', d: '#6d7378', 'а': '#5e3c25' });
  // Potted plant
  addArt(scene, 'plant', [
    '.....gg.......',
    '...gglgg..g...',
    '..gllgggggg...',
    '.gglggdggllg..',
    '.ggggdglgggg..',
    '..ggddgggdgg..',
    '.gglgggdggg...',
    '..ggggggdgg...',
    '....gdggg.....',
    '....aaaaaa....',
    '...abbbbbba...',
    '...accccccа...',
    '....bbbbbb....',
    '....bbbbbb....',
    '.....aaaa.....',
  ], { g: '#4f8f3a', l: '#7cbf55', d: '#356b29', a: '#8a4a2f', b: '#c0643f', c: '#d98055', 'а': '#8a4a2f' });
  // Window for back wall (16×12)
  addArt(scene, 'window', [
    'aaaaaaaaaaaaaaaa',
    'abbbbbbbabbbbbba',
    'abllbbbbabllbbba',
    'ablbbbbbablbbbba',
    'abbbbbbbabbbbbba',
    'aaaaaaaaaaaaaaaa',
    'abbbbbbbabbbbbba',
    'abbbbbbbabbbbbba',
    'abbbbbbbabbbbbba',
    'aaaaaaaaaaaaaaaa',
    'cccccccccccccccc',
  ], { a: '#f1ece0', b: '#8fc3d8', l: '#d6eef5', c: '#b59a74' });
  // Wall clock
  addArt(scene, 'clock', [
    '..aaaa..',
    '.abbbba.',
    'abbcbbba',
    'abbcbbba',
    'abbccbba',
    'abbbbbba',
    '.abbbba.',
    '..aaaa..',
  ], { a: '#5e3c25', b: '#f5eedc', c: '#2b1d16' });
  // "OPEN" sign
  addArt(scene, 'sign', [
    'aaaaaaaaaaaaa',
    'abbbbbbbbbbba',
    'abcccbcbcbcba',
    'abcbcbccbbcba',
    'abcccbcbcbcba',
    'abbbbbbbbbbba',
    'aaaaaaaaaaaaa',
  ], { a: '#5e3c25', b: '#2f6b3f', c: '#f5eedc' });
  // Low partition (storage railing)
  addArt(scene, 'rail', [
    'aaaaaaaaaaaaaaaa',
    'bbbbbbbbbbbbbbbb',
    'a..a...a...a..a.',
    'a..a...a...a..a.',
    'a..a...a...a..a.',
    'aaaaaaaaaaaaaaaa',
  ], { a: '#6b4426', b: '#a06d40' });
  // Pallet of pipes / rods in storage
  addArt(scene, 'pipeStack', [
    '..............',
    'abababababab..',
    'cccccccccccccc',
    'dbdbdbdbdbdbd.',
    'cccccccccccccc',
    'eeeeeeeeeeeeee',
    'e.e.e.e.e.e.e.',
  ], { a: '#e8eef2', b: '#5f8fbf', c: '#9aa9b5', d: '#cfd8df', e: '#8a5a34' });
  // Out-of-stock tag
  addArt(scene, 'soldout', [
    'aaaaaaaaa',
    'abbbbbbba',
    'abcbbbcba',
    'abbcbcbba',
    'abbbcbbba',
    'abbcbcbba',
    'abcbbbcba',
    'abbbbbbba',
    'aaaaaaaaa',
  ], { a: '#5a1714', b: '#d8413a', c: '#ffffff' });
  // Shadow under characters
  addArt(scene, 'shadow', [
    '..aaaaaa..',
    'aaaaaaaaaa',
    '..aaaaaa..',
  ], { a: 'rgba(30,20,10,0.28)' }, false);
}

function padded(b: Px): Px {
  const w = b[0].length + 2;
  return [Array(w).fill(null), ...b.map((r) => [null, ...r, null]), Array(w).fill(null)];
}

function addArt(scene: Phaser.Scene, key: string, rows: string[], pal: Record<string, string>, withOutline = true) {
  const art = fromArt(rows, pal);
  const b = withOutline ? outline(padded(art)) : art;
  const { c, ctx } = canvas(b[0].length, b.length);
  blit(ctx, b, 0, 0);
  addCanvasTexture(scene, key, c);
}

/* ------------------------------------------------------------------ */
/* Product minis (6×6) shown on shelves and carried by customers        */
/* ------------------------------------------------------------------ */

const MINIS: Record<string, { art: string[]; pal: Record<string, string> }> = {
  nut: { art: ['..bb..', '.baab.', 'ba..ac', 'ba..ac', '.aacc.', '..cc..'], pal: { a: '#9aa3ad', b: '#dde2e6', c: '#5d6670' } },
  rod: { art: ['bbbbbb', 'cccccc', '......', 'bbbbbb', 'aaaaaa', 'cccccc'], pal: { a: '#868d94', b: '#b9c0c6', c: '#4f565d' } },
  sheet: { art: ['bbbbbc', 'baaaac', 'baaaac', 'baaaac', 'baaaac', 'cccccc'], pal: { a: '#cfd6dd', b: '#f3f6f8', c: '#8a949e' } },
  bolt: { art: ['.bbbb.', '.aaac.', '..ac..', '..ac..', '..ac..', '..cc..'], pal: { a: '#8d959e', b: '#c5ccd3', c: '#4f565d' } },
  screw: { art: ['bbbbbb', 'baaaac', 'bddddc', 'baaaac', 'baaaac', 'cccccc'], pal: { a: '#c8955a', b: '#e2b478', c: '#8a5f32', d: '#3b6fb6' } },
  washer: { art: ['.bbbb.', 'bba.ac', 'b....c', 'b....c', 'ba..cc', '.cccc.'], pal: { a: '#b9c0c6', b: '#e8ebee', c: '#7a838b' } },
  disc: { art: ['.bbbb.', 'baaaac', 'baddac', 'baddac', 'baaaac', '.cccc.'], pal: { a: '#c8382f', b: '#ea6b5b', c: '#7c1f1a', d: '#d5d9dc' } },
  lube: { art: ['...c..', '..cc..', '.bbbb.', '.adda.', '.aaaa.', '.cccc.'], pal: { a: '#e0a623', b: '#f3cd5c', c: '#8a6210', d: '#c23b2b' } },
  drill: { art: ['cccccc', 'cbcbcb', 'cacaca', 'cacaca', 'cacaca', 'cccccc'], pal: { a: '#e3a73a', b: '#f6d58a', c: '#2f3437' } },
  pipe: { art: ['bbbbbd', 'aaaaad', 'cccccc', 'bbbbbd', 'aaaaad', 'cccccc'], pal: { a: '#e3e9ee', b: '#ffffff', c: '#97a6b2', d: '#4f86c0' } },
  box: { art: ['bbbbbb', 'baaaac', 'baddac', 'baaaac', 'baaaac', 'cccccc'], pal: { a: '#b98d5e', b: '#d9ae78', c: '#7a5631', d: '#f2ead6' } },
};

export function miniKindFor(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('nut')) return 'nut';
  if (n.includes('rod') || n.includes('bar')) return 'rod';
  if (n.includes('sheet') || n.includes('plate')) return 'sheet';
  if (n.includes('bolt')) return 'bolt';
  if (n.includes('screw')) return 'screw';
  if (n.includes('washer')) return 'washer';
  if (n.includes('disc') || n.includes('wheel')) return 'disc';
  if (n.includes('lubric') || n.includes('oil') || n.includes('grease')) return 'lube';
  if (n.includes('drill') || n.includes('bit')) return 'drill';
  if (n.includes('pipe') || n.includes('pvc') || n.includes('tube')) return 'pipe';
  return 'box';
}

export function makeMinis(scene: Phaser.Scene) {
  for (const [k, { art, pal }] of Object.entries(MINIS)) {
    const b = fromArt(art, pal);
    const { c, ctx } = canvas(6, 6);
    blit(ctx, b, 0, 0);
    addCanvasTexture(scene, `mini-${k}`, c);
  }
}

/* ------------------------------------------------------------------ */
/* Speech bubbles & a tiny pixel font                                  */
/* ------------------------------------------------------------------ */

const BUBBLE_ICONS: Record<string, string[]> = {
  think: ['.....', '.ccc.', '...c.', '..c..', '.....', '..c..'],
  no: ['c...c', '.c.c.', '..c..', '.c.c.', 'c...c', '.....'],
  coin: ['.yyy.', 'yhyyy', 'yhyyy', 'yyyyy', '.yyy.', '.....'],
  heart: ['.r.r.', 'rrrrr', 'rrrrr', '.rrr.', '..r..', '.....'],
  dots: ['.....', '.....', 'c.c.c', '.....', '.....', '.....'],
  alert: ['..r..', '..r..', '..r..', '.....', '..r..', '.....'],
  box: ['.....', 'bbbbb', 'bdddb', 'bbbbb', 'bbbbb', '.....'],
};

export function makeBubbles(scene: Phaser.Scene) {
  for (const [k, icon] of Object.entries(BUBBLE_ICONS)) {
    const b = buf(11, 11);
    rect(b, 1, 0, 9, 9, '#ffffff');
    rect(b, 0, 1, 11, 7, '#ffffff');
    px(b, 4, 9, '#ffffff'); px(b, 5, 9, '#ffffff'); px(b, 5, 10, '#ffffff');
    const ic = fromArt(icon, { c: '#2b1d16', y: '#e8b52f', h: '#fff1a8', r: '#d9413a', b: '#c08a52', d: '#7a5631' });
    ic.forEach((row, y) => row.forEach((c, x) => c && px(b, 3 + x, 2 + y, c)));
    const o = outline(padded(b));
    const { c, ctx } = canvas(o[0].length, o.length);
    blit(ctx, o, 0, 0);
    addCanvasTexture(scene, `bubble-${k}`, c);
  }
}

const GLYPHS: Record<string, string[]> = {
  '0': ['###', '#.#', '#.#', '#.#', '###'], '1': ['.#.', '##.', '.#.', '.#.', '###'], '2': ['###', '..#', '###', '#..', '###'],
  '3': ['###', '..#', '.##', '..#', '###'], '4': ['#.#', '#.#', '###', '..#', '..#'], '5': ['###', '#..', '###', '..#', '###'],
  '6': ['###', '#..', '###', '#.#', '###'], '7': ['###', '..#', '.#.', '.#.', '.#.'], '8': ['###', '#.#', '###', '#.#', '###'],
  '9': ['###', '#.#', '###', '..#', '###'], 'x': ['...', '#.#', '.#.', '#.#', '...'], '+': ['...', '.#.', '###', '.#.', '...'],
  '-': ['...', '...', '###', '...', '...'], '.': ['...', '...', '...', '...', '.#.'],
};

/** Render a short string in the 3×5 pixel font with a dark outline; returns a texture key. */
export function pixelText(scene: Phaser.Scene, text: string, color = '#ffffff'): string {
  const key = `ptxt-${text}-${color}`;
  if (scene.textures.exists(key)) return key;
  const chars = [...text].filter((ch) => GLYPHS[ch]);
  const w = chars.length * 4 - 1;
  const b = buf(Math.max(1, w), 5);
  chars.forEach((ch, i) => GLYPHS[ch].forEach((row, y) => [...row].forEach((v, x) => v === '#' && px(b, i * 4 + x, y, color))));
  const o = outline(padded(b));
  const { c, ctx } = canvas(o[0].length, o.length);
  blit(ctx, o, 0, 0);
  addCanvasTexture(scene, key, c);
  return key;
}
