/** Static layout of the virtual shop on a 20×14 tile grid, plus grid pathfinding. */

export const COLS = 20;
export const ROWS = 14;

export interface Cell { x: number; y: number }

export interface ShelfSlot { index: number; tile: Cell; approach: Cell }

const wall = (x: number, y: number) => ({ index: -1, tile: { x, y }, approach: { x, y: y + 1 } });

/** Shelf slots in the order products are stocked: back wall, then island A, then island B. */
export const SHELF_SLOTS: ShelfSlot[] = [
  ...[2, 3, 4, 5, 6, 7].map((x) => wall(x, 2)),
  ...[2, 3, 4, 5].map((x) => wall(x, 5)),
  ...[2, 3, 4, 5].map((x) => wall(x, 8)),
].map((s, i) => ({ ...s, index: i }));

export const DOOR_X = [9, 10];
export const FRONT_WALL_Y = 11;
export const SIDEWALK_Y = 12;
export const KEEPER_POS: Cell = { x: 14, y: 5 };
export const KEEPER_STORAGE_POS: Cell = { x: 16, y: 4 };
export const QUEUE: Cell[] = [
  { x: 14, y: 7 }, { x: 14, y: 8 }, { x: 14, y: 9 }, { x: 15, y: 9 }, { x: 16, y: 9 }, { x: 17, y: 9 },
];
export const COUNTER = { x: 13, y: 6, w: 5 };

export const DECOR = {
  plants: [{ x: 8, y: 2 }, { x: 1, y: 10 }, { x: 18, y: 6 }, { x: 18, y: 10 }],
  crates: [{ x: 15, y: 2 }, { x: 17, y: 2 }, { x: 18, y: 3 }],
  boxes: [{ x: 16, y: 2 }, { x: 18, y: 2 }],
  barrels: [{ x: 11, y: 3 }],
  pipeStack: [{ x: 15, y: 3 }],
};

/** true = customers may stand here */
function buildWalkable(): boolean[][] {
  const g = Array.from({ length: ROWS }, () => Array<boolean>(COLS).fill(false));
  for (let y = 2; y <= 10; y++) for (let x = 1; x <= 18; x++) g[y][x] = true;
  for (const x of DOOR_X) g[FRONT_WALL_Y][x] = true;
  for (let y = SIDEWALK_Y; y < ROWS; y++) for (let x = 0; x < COLS; x++) g[y][x] = y === SIDEWALK_Y;
  for (const s of SHELF_SLOTS) g[s.tile.y][s.tile.x] = false;
  // staff-only area: storage + behind the counter + the counter itself
  for (let y = 2; y <= 6; y++) for (let x = 13; x <= 18; x++) g[y][x] = false;
  for (const p of [...DECOR.plants, ...DECOR.barrels]) g[p.y][p.x] = false;
  return g;
}
export const WALKABLE = buildWalkable();

/** Staff can walk behind the counter and into storage. */
function buildStaffWalkable(): boolean[][] {
  const g = Array.from({ length: ROWS }, () => Array<boolean>(COLS).fill(false));
  for (let y = 4; y <= 5; y++) for (let x = 14; x <= 18; x++) g[y][x] = true;
  g[3][16] = true; g[3][17] = true;
  return g;
}
export const STAFF_WALKABLE = buildStaffWalkable();

/** Breadth-first search on the tile grid (4-neighbour). Returns the path excluding the start cell. */
export function findPath(from: Cell, to: Cell, grid = WALKABLE): Cell[] | null {
  const inBounds = (c: Cell) => c.x >= 0 && c.y >= 0 && c.x < COLS && c.y < ROWS;
  if (!inBounds(to)) return null;
  const key = (c: Cell) => c.y * COLS + c.x;
  const prev = new Map<number, number>();
  const start = key(from);
  const goal = key(to);
  prev.set(start, -1);
  const queue: Cell[] = [from];
  while (queue.length) {
    const cur = queue.shift()!;
    if (key(cur) === goal) break;
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const n = { x: cur.x + dx, y: cur.y + dy };
      if (!inBounds(n) || prev.has(key(n))) continue;
      if (!grid[n.y][n.x] && key(n) !== goal) continue;
      prev.set(key(n), key(cur));
      queue.push(n);
    }
  }
  if (!prev.has(goal)) return null;
  const path: Cell[] = [];
  for (let k = goal; k !== start; k = prev.get(k)!) path.unshift({ x: k % COLS, y: Math.floor(k / COLS) });
  return path;
}
