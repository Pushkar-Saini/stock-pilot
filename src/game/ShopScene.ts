import Phaser from 'phaser';
import {
  COURIER_PALETTE, CUSTOMER_PALETTES, KEEPER_PALETTE, TILE, makeBubbles, makeCharacterTexture, makeMinis, makeProps, makeTiles,
  miniKindFor, pixelText,
} from './pixelArt';
import {
  COLS, COUNTER, DECOR, DOOR_X, FRONT_WALL_Y, KEEPER_POS, KEEPER_STORAGE_POS, QUEUE, ROWS, SHELF_SLOTS, SIDEWALK_Y,
  STAFF_WALKABLE, findPath, type Cell,
} from './shopLayout';
import { shopBridge } from './bridge';
import type { Product } from '../domain/types';
import type { PendingOrder } from '../store/simStore';

export const GAME_W = COLS * TILE;
export const GAME_H = ROWS * TILE;
const WALK_SPEED = 40; // px per simulated second
const MAX_INSIDE = 6;
const MAX_COURIERS = 2;
const REORDER_CHECK_EVERY = 1.5; // simulated seconds
/** A customer stuck in one state this long is sent home (safety net; should never trigger in normal flow). */
const STUCK_LIMIT: Partial<Record<CState, number>> = { enter: 30, toShelf: 30, toQueue: 40, queue: 90, leave: 40 };

type Persona = 'handyman' | 'builder' | 'mechanic';
type CState = 'enter' | 'toShelf' | 'browse' | 'toQueue' | 'queue' | 'checkout' | 'leave' | 'gone';
type Facing = 'down' | 'up' | 'side';
type BubbleKind = 'think' | 'no' | 'coin' | 'heart' | 'dots' | 'alert' | 'box';

const PERSONA_CATEGORIES: Record<Persona, string[]> = {
  handyman: ['fasteners'],
  builder: ['raw materials', 'plumbing'],
  mechanic: ['abrasives', 'consumables', 'tools'],
};

const NAMES = [
  'Ravi', 'Priya', 'Arjun', 'Meena', 'Suresh', 'Anita', 'Vikram', 'Kavya', 'Imran', 'Neha', 'Rahul', 'Pooja',
  'Deepak', 'Sunita', 'Manoj', 'Farah', 'Karan', 'Divya', 'Amit', 'Rekha', 'Sanjay', 'Asha', 'Nitin', 'Zoya',
];

export interface HoverInfo { productId: string; fx: number; fy: number }
export const HOVER_EVENT = 'stockpilot-shelf-hover';

const tileX = (x: number) => x * TILE + TILE / 2;
const tileY = (y: number) => y * TILE + TILE - 2;

/** Anything that walks the tile grid. */
interface Walker {
  sprite: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Image;
  bubble?: Phaser.GameObjects.Image;
  bubbleT: number;
  carry?: Phaser.GameObjects.Image;
  texKey: string;
  /** The tile the walker stands on, or the one it is stepping into. Always kept in sync with the sprite. */
  tile: Cell;
  path: Cell[];
  wait: number;
  facing: Facing;
  exitX: number;
}

interface Customer extends Walker {
  id: number;
  name: string;
  persona: Persona;
  state: CState;
  stateTime: number;
  timer: number;
  wantId: string | null;
  wantName: string;
  qty: number;
  attempts: number;
  inside: boolean;
}

interface Courier extends Walker {
  order: PendingOrder;
  state: 'in' | 'stock' | 'out' | 'gone';
  timer: number;
}

let nextCustomerId = 1;

export class ShopScene extends Phaser.Scene {
  private customers: Customer[] = [];
  private couriers: Courier[] = [];
  private queue: Customer[] = [];
  private shelfLayers: Phaser.GameObjects.GameObject[] = [];
  private keeper!: Phaser.GameObjects.Sprite;
  private keeperBubble?: Phaser.GameObjects.Image;
  private keeperBubbleT = 0;
  private keeperState: 'idle' | 'serving' | 'toStorage' | 'storage' | 'back' = 'idle';
  private keeperTile: Cell = { ...KEEPER_POS };
  private keeperPath: Cell[] = [];
  private keeperTimer = 0;
  private keeperIdleFor = 0;
  private spawnTimer = 1;
  private reorderTimer = 0;
  private simTime = 0;
  private resetToken = -1;
  private pendingMs = 0;
  private pendingSim = 0;
  private floaters: { img: Phaser.GameObjects.Image; life: number }[] = [];
  private unsub?: () => void;
  private wasRunning = false;

  constructor() {
    super('shop');
  }

  create() {
    makeTiles(this);
    makeProps(this);
    makeMinis(this);
    makeBubbles(this);
    CUSTOMER_PALETTES.forEach((p, i) => makeCharacterTexture(this, `cust${i}`, p));
    makeCharacterTexture(this, 'keeper', KEEPER_PALETTE);
    makeCharacterTexture(this, 'courier', COURIER_PALETTE);

    this.drawMap();
    this.drawFurniture();
    this.refreshShelves();

    this.keeper = this.add.sprite(tileX(KEEPER_POS.x), tileY(KEEPER_POS.y), 'keeper', 0).setOrigin(0.5, 1);
    this.keeper.setDepth(this.keeper.y);

    this.unsub = shopBridge.onInventoryChange(() => this.refreshShelves());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.unsub?.());
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.unsub?.());
    const sim = shopBridge.sim();
    this.resetToken = sim.resetToken;
    this.simTime = sim.simTime;
    if (import.meta.env.DEV) (window as unknown as { __shop: ShopScene }).__shop = this;
  }

  /** Dev-only snapshot used for debugging the simulation from the console. */
  debugState() {
    const w = (c: Walker) => ({ tile: `${c.tile.x},${c.tile.y}`, pos: `${Math.round(c.sprite.x)},${Math.round(c.sprite.y)}`, path: c.path.map((p) => `${p.x},${p.y}`).join(' ') });
    return {
      simTime: +this.simTime.toFixed(1),
      keeper: this.keeperState,
      queue: this.queue.map((c) => c.id),
      customers: this.customers.map((c) => ({ id: c.id, state: c.state, t: +c.stateTime.toFixed(1), want: c.wantName, qty: c.qty, ...w(c) })),
      couriers: this.couriers.map((c) => ({ order: c.order.productName, state: c.state, ...w(c) })),
    };
  }

  /* --------------------------- world building --------------------------- */

  private drawMap() {
    const t = (x: number, y: number, frame: string, depth = -10) =>
      this.add.image(x * TILE, y * TILE, 'tiles', frame).setOrigin(0).setDepth(depth);
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (y === 0) t(x, y, 'wallTop');
        else if (y >= SIDEWALK_Y) t(x, y, y === SIDEWALK_Y ? `sidewalk${x % 2}` : `grass${(x * 7 + y) % 3}`);
        else if (x === 0 || x === COLS - 1) t(x, y, 'sideWall');
        else if (y === 1) t(x, y, 'wallFace');
        else if (y === FRONT_WALL_Y) t(x, y, DOOR_X.includes(x) ? 'threshold' : 'frontWall');
        else if (x >= 14 && y <= 3) t(x, y, `concrete${(x + y) % 2}`);
        else if (x === 13 && y >= 2 && y <= 5) t(x, y, 'sideWall');
        else t(x, y, `floor${(x * 3 + y * 5) % 4}`);
      }
    }
    for (const x of DOOR_X) t(x, 10, 'doormat', -9);
    t(8, 7, 'rugL', -9); t(9, 7, 'rugM', -9); t(10, 7, 'rugR', -9);
    for (const x of [9, 10, 11]) this.add.image(tileX(x), TILE + 1, 'window').setOrigin(0.5, 0).setDepth(-8);
    this.add.image(tileX(12), TILE + 2, 'clock').setOrigin(0.5, 0).setDepth(-8);
    this.add.image(tileX(8), FRONT_WALL_Y * TILE + 4, 'sign').setOrigin(0.5, 0).setDepth(-8);
  }

  private prop(key: string, c: Cell, yOff = 0) {
    const img = this.add.image(tileX(c.x), (c.y + 1) * TILE + yOff, key).setOrigin(0.5, 1);
    img.setDepth(img.y);
    return img;
  }

  private drawFurniture() {
    DECOR.plants.forEach((c) => this.prop('plant', c, -1));
    DECOR.crates.forEach((c) => this.prop('crate', c, -1));
    DECOR.boxes.forEach((c) => this.prop('boxes', c, -1));
    DECOR.barrels.forEach((c) => this.prop('barrel', c, -2));
    DECOR.pipeStack.forEach((c) => this.prop('pipeStack', c, -3));
    for (const x of [14, 15, 18]) this.add.image(tileX(x), 4 * TILE + 1, 'rail').setOrigin(0.5, 1).setDepth(4 * TILE);
    const counter = this.add.image(COUNTER.x * TILE - 1, (COUNTER.y + 1) * TILE + 1, 'counter').setOrigin(0, 1);
    counter.setDepth(counter.y);
    this.add.image(tileX(14), (COUNTER.y + 1) * TILE - 14, 'register').setOrigin(0.5, 1).setDepth(counter.y + 1);
    for (const slot of SHELF_SLOTS) {
      const shelf = this.add.image(tileX(slot.tile.x), (slot.tile.y + 1) * TILE + 1, 'shelf').setOrigin(0.5, 1);
      shelf.setDepth(shelf.y - 1);
      shelf.setInteractive({ useHandCursor: true });
      shelf.on('pointerover', () => this.emitHover(slot.index, shelf));
      shelf.on('pointerout', () => window.dispatchEvent(new CustomEvent(HOVER_EVENT, { detail: null })));
    }
  }

  private emitHover(slotIndex: number, shelf: Phaser.GameObjects.Image) {
    const item = shopBridge.shelfProducts()[slotIndex];
    const detail: HoverInfo | null = item
      ? { productId: item.product.id, fx: shelf.x / GAME_W, fy: (shelf.y - shelf.height) / GAME_H }
      : null;
    window.dispatchEvent(new CustomEvent(HOVER_EVENT, { detail }));
  }

  /** Redraw the products on every shelf from live inventory. Fullness mirrors real stock. */
  private refreshShelves() {
    this.shelfLayers.forEach((o) => o.destroy());
    this.shelfLayers = [];
    const items = shopBridge.shelfProducts();
    for (const slot of SHELF_SLOTS) {
      const item = items[slot.index];
      if (!item) continue;
      const baseX = slot.tile.x * TILE;
      const bottom = (slot.tile.y + 1) * TILE + 1;
      const top = bottom - 26 + 1;
      const p = item.product;
      const kind = miniKindFor(p.name);
      const avail = shopBridge.available(p.id);
      const full = Math.max(p.minStock * 4, 8);
      const count = avail <= 0 ? 0 : Math.min(4, Math.max(1, Math.ceil((avail / full) * 4)));
      const spots = [[baseX + 2, top + 4], [baseX + 8, top + 4], [baseX + 2, top + 13], [baseX + 8, top + 13]];
      for (let i = 0; i < count; i++) {
        this.shelfLayers.push(this.add.image(spots[i][0], spots[i][1], `mini-${kind}`).setOrigin(0).setDepth(bottom));
      }
      if (avail <= 0) this.shelfLayers.push(this.add.image(baseX + 8, top + 9, 'soldout').setDepth(bottom + 0.5));
    }
  }

  /* ------------------------------ lifecycle ------------------------------ */

  private doReset() {
    for (const c of this.customers) this.destroyWalker(c);
    for (const c of this.couriers) this.destroyWalker(c);
    this.customers = [];
    this.couriers = [];
    this.queue = [];
    this.floaters.forEach((f) => f.img.destroy());
    this.floaters = [];
    this.keeperBubble?.destroy();
    this.keeperBubble = undefined;
    shopBridge.resetRun();
    this.keeperState = 'idle';
    this.keeperTile = { ...KEEPER_POS };
    this.keeperPath = [];
    this.keeper.setPosition(tileX(KEEPER_POS.x), tileY(KEEPER_POS.y)).setFrame(0).setFlipX(false).setDepth(tileY(KEEPER_POS.y));
    this.keeper.anims.stop();
    this.spawnTimer = 1;
    this.reorderTimer = 0;
    this.simTime = 0;
    this.pendingMs = 0;
    this.pendingSim = 0;
    shopBridge.setInside(0);
    this.refreshShelves();
  }

  update(_time: number, delta: number) {
    const sim = shopBridge.sim();
    if (sim.resetToken !== this.resetToken) {
      this.resetToken = sim.resetToken;
      this.doReset();
    }
    const running = sim.status === 'running';
    if (running !== this.wasRunning) {
      this.wasRunning = running;
      for (const c of [...this.customers, ...this.couriers]) running ? c.sprite.anims.resume() : c.sprite.anims.pause();
      running ? this.keeper.anims.resume() : this.keeper.anims.pause();
    }
    if (!running) {
      this.flushTime(true);
      return;
    }
    const realMs = Math.min(delta, 100);
    const dt = (realMs / 1000) * sim.speed;
    this.simTime += dt;
    this.pendingMs += realMs;
    this.pendingSim += dt;
    this.flushTime(false);
    for (const c of [...this.customers, ...this.couriers]) c.sprite.anims.timeScale = sim.speed;
    this.keeper.anims.timeScale = sim.speed;

    // customers
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.customers.length < MAX_INSIDE) {
      this.spawnCustomer();
      this.spawnTimer = 2 + Math.random() * 3;
    }
    for (const c of this.customers) this.updateCustomer(c, dt);
    this.customers = this.customers.filter((c) => {
      if (c.state === 'gone') { this.destroyWalker(c); return false; }
      return true;
    });
    this.queue = this.queue.filter((c) => this.customers.includes(c) && (c.state === 'toQueue' || c.state === 'queue' || c.state === 'checkout'));

    // restocking loop: shopkeeper reorders → courier delivers → shelves refill
    this.reorderTimer -= dt;
    if (this.reorderTimer <= 0) {
      this.reorderTimer = REORDER_CHECK_EVERY;
      const placed = shopBridge.reorderCheck(this.simTime);
      if (placed.length) this.keeperSays('alert', 1.6);
    }
    if (this.couriers.length < MAX_COURIERS) {
      const due = shopBridge.dueOrders(this.simTime)[0];
      if (due) this.spawnCourier(due);
    }
    for (const c of this.couriers) this.updateCourier(c, dt);
    this.couriers = this.couriers.filter((c) => {
      if (c.state === 'gone') { this.destroyWalker(c); return false; }
      return true;
    });

    this.updateKeeper(dt);
    this.updateFloaters(dt);
    shopBridge.setInside(this.customers.filter((c) => c.inside).length);
  }

  private flushTime(force: boolean) {
    if (this.pendingMs >= 400 || (force && this.pendingMs > 0)) {
      shopBridge.addTime(this.pendingMs, this.pendingSim);
      this.pendingMs = 0;
      this.pendingSim = 0;
    }
  }

  /* ------------------------------- walking ------------------------------- */

  private cellOf(sprite: Phaser.GameObjects.Sprite): Cell {
    return {
      x: Phaser.Math.Clamp(Math.floor(sprite.x / TILE), 0, COLS - 1),
      y: Phaser.Math.Clamp(Math.floor(sprite.y / TILE), 0, ROWS - 1),
    };
  }

  private centeredOn(w: Walker, c: Cell) {
    return Math.abs(w.sprite.x - tileX(c.x)) < 0.5 && Math.abs(w.sprite.y - tileY(c.y)) < 0.5;
  }

  /**
   * Plan a route from where the sprite actually is. If the walker is between two
   * tiles, it first returns to the centre of its current tile so it never cuts
   * diagonally through furniture.
   */
  private routeTo(w: Walker, dest: Cell, grid?: boolean[][]) {
    const here = this.cellOf(w.sprite);
    w.tile = here;
    w.wait = 0;
    const path = findPath(here, dest, grid) ?? [];
    w.path = this.centeredOn(w, here) ? path : [here, ...path];
  }

  /** Step along the path. Returns true once the path is finished. */
  private walk(w: Walker, dt: number, blockers?: Customer[]): boolean {
    if (!w.path.length) {
      this.standStill(w);
      return true;
    }
    const next = w.path[0];
    const isNewTile = next.x !== w.tile.x || next.y !== w.tile.y;
    if (isNewTile && this.centeredOn(w, w.tile)) {
      // about to step into a new tile: give way briefly to other customers, then squeeze past (avoids deadlock)
      if (blockers && next.y < SIDEWALK_Y && blockers.some((o) => o !== w && o.state !== 'gone' && o.tile.x === next.x && o.tile.y === next.y) && w.wait < 1) {
        w.wait += dt;
        this.standStill(w);
        return false;
      }
      w.wait = 0;
      w.tile = { ...next };
    } else if (isNewTile && (w.sprite.x < 0 || w.sprite.x > GAME_W)) {
      w.tile = { ...next }; // still walking in from off-screen
    }
    const tx = tileX(next.x), ty = tileY(next.y);
    const dx = tx - w.sprite.x, dy = ty - w.sprite.y;
    const dist = Math.hypot(dx, dy);
    const step = WALK_SPEED * dt;
    if (dist <= step) {
      w.sprite.setPosition(tx, ty);
      w.tile = { ...next };
      w.path.shift();
    } else {
      w.sprite.x += (dx / dist) * step;
      w.sprite.y += (dy / dist) * step;
    }
    if (dist > 0.01) this.faceAndAnimate(w, dx, dy);
    return false;
  }

  private faceAndAnimate(w: Walker, dx: number, dy: number) {
    const facing: Facing = Math.abs(dx) > Math.abs(dy) ? 'side' : dy < 0 ? 'up' : 'down';
    w.facing = facing;
    w.sprite.setFlipX(facing === 'side' && dx < 0);
    const anim = `${w.texKey}-walk-${facing}`;
    if (w.sprite.anims.currentAnim?.key !== anim || !w.sprite.anims.isPlaying) w.sprite.play(anim, true);
  }

  private standStill(w: Walker, facing?: Facing) {
    if (facing) w.facing = facing;
    if (w.sprite.anims.isPlaying) w.sprite.anims.stop();
    const row = w.facing === 'down' ? 0 : w.facing === 'up' ? 1 : 2;
    w.sprite.setFrame(row * 4);
  }

  /** Walk off the edge of the screen once at the sidewalk exit. Returns true when gone. */
  private walkOff(w: Walker, dt: number): boolean {
    const offX = w.exitX === 0 ? -12 : GAME_W + 12;
    const dx = offX - w.sprite.x;
    if (Math.abs(dx) < 1) return true;
    w.sprite.x += Math.sign(dx) * Math.min(Math.abs(dx), WALK_SPEED * dt);
    this.faceAndAnimate(w, dx, 0);
    return false;
  }

  private syncAttachments(w: Walker, dt: number, carryAbove = false) {
    w.sprite.setDepth(w.sprite.y);
    w.shadow.setPosition(w.sprite.x, w.sprite.y - 1).setDepth(w.sprite.y - 0.5);
    if (w.carry) {
      if (carryAbove) w.carry.setPosition(w.sprite.x, w.sprite.y - 15).setDepth(w.sprite.y + 0.3);
      else w.carry.setPosition(w.sprite.x + (w.facing === 'side' ? (w.sprite.flipX ? -4 : 4) : 0), w.sprite.y - 5)
        .setDepth(w.facing === 'up' ? w.sprite.y - 0.2 : w.sprite.y + 0.2);
    }
    if (w.bubble) {
      w.bubbleT -= dt;
      w.bubble.setPosition(w.sprite.x + 5, w.sprite.y - (carryAbove ? 20 : 15));
      if (w.bubbleT <= 0) { w.bubble.destroy(); w.bubble = undefined; }
    }
  }

  private destroyWalker(w: Walker) {
    const c = w as Customer;
    if (c.wantId && c.qty > 0) shopBridge.release(c.wantId, c.qty);
    w.sprite.destroy();
    w.shadow.destroy();
    w.bubble?.destroy();
    w.carry?.destroy();
  }

  private showBubble(w: Walker, kind: BubbleKind, secs = 1.2) {
    w.bubble?.destroy();
    w.bubble = this.add.image(w.sprite.x + 5, w.sprite.y - 17, `bubble-${kind}`).setOrigin(0.5, 1).setDepth(10_000);
    w.bubbleT = secs;
  }

  private keeperSays(kind: BubbleKind, secs: number) {
    this.keeperBubble?.destroy();
    this.keeperBubble = this.add.image(this.keeper.x + 5, this.keeper.y - 15, `bubble-${kind}`).setOrigin(0.5, 1).setDepth(10_000);
    this.keeperBubbleT = secs;
  }

  private floatText(x: number, y: number, text: string, color: string) {
    const img = this.add.image(x, y, pixelText(this, text, color)).setOrigin(0.5, 1).setDepth(10_001);
    this.floaters.push({ img, life: 1.4 });
  }

  /* ------------------------------ customers ------------------------------ */

  private spawnCustomer() {
    const fromLeft = Math.random() < 0.5;
    const texKey = `cust${Math.floor(Math.random() * CUSTOMER_PALETTES.length)}`;
    const startX = fromLeft ? -10 : GAME_W + 10;
    const sprite = this.add.sprite(startX, tileY(SIDEWALK_Y), texKey, 8).setOrigin(0.5, 1);
    const shadow = this.add.image(startX, sprite.y, 'shadow');
    const personas: Persona[] = ['handyman', 'handyman', 'builder', 'mechanic'];
    const edge: Cell = { x: fromLeft ? 0 : COLS - 1, y: SIDEWALK_Y };
    const door = DOOR_X[Math.floor(Math.random() * DOOR_X.length)];
    const id = nextCustomerId++;
    this.customers.push({
      id, name: NAMES[(id - 1) % NAMES.length],
      sprite, shadow, texKey, bubbleT: 0,
      persona: personas[Math.floor(Math.random() * personas.length)],
      tile: edge,
      path: [edge, ...(findPath(edge, { x: door, y: 10 }) ?? [])],
      state: 'enter', stateTime: 0, timer: 0, wait: 0, wantId: null, wantName: '', qty: 0, attempts: 0,
      exitX: Math.random() < 0.5 ? 0 : COLS - 1,
      inside: false, facing: 'side',
    });
  }

  private setState(c: Customer, s: CState) {
    c.state = s;
    c.stateTime = 0;
  }

  /** Pick what this customer came for, weighted towards their persona. */
  private chooseWant(c: Customer, exclude: Set<string>, onlyAvailable: boolean): Product | null {
    const all = shopBridge.shelfProducts().map((s) => s.product).filter((p) => !exclude.has(p.id));
    const pool = (list: Product[]) => (onlyAvailable ? list.filter((p) => shopBridge.available(p.id) > 0) : list);
    const mine = pool(all.filter((p) => PERSONA_CATEGORIES[c.persona].includes(p.category.toLowerCase())));
    const any = pool(all);
    const list = mine.length && (onlyAvailable || Math.random() < 0.8) ? mine : any;
    if (!list.length) return null;
    return list[Math.floor(Math.random() * list.length)];
  }

  private desiredQty(p: Product): number {
    const r = Math.random();
    if (p.sellingPrice < 20) return 2 + Math.floor(r * 7); // small fasteners: 2–8
    if (p.sellingPrice < 200) return 1 + Math.floor(r * 4); // 1–4
    return 1 + Math.floor(r * 2); // big-ticket: 1–2
  }

  private slotFor(productId: string) {
    return SHELF_SLOTS[shopBridge.shelfProducts().findIndex((s) => s.product.id === productId)];
  }

  private goToShelf(c: Customer, p: Product) {
    const slot = this.slotFor(p.id);
    if (!slot) return this.leave(c);
    c.wantId = p.id;
    c.wantName = p.name;
    this.routeTo(c, slot.approach);
    this.setState(c, 'toShelf');
  }

  private leave(c: Customer) {
    this.setState(c, 'leave');
    this.routeTo(c, { x: c.exitX, y: SIDEWALK_Y });
  }

  /** Safety net: release the basket and send a stuck customer home. */
  private rescue(c: Customer) {
    if (c.state === 'leave') { this.setState(c, 'gone'); return; }
    if (c.wantId && c.qty > 0) {
      shopBridge.release(c.wantId, c.qty);
      c.qty = 0;
      c.carry?.destroy();
      c.carry = undefined;
      this.refreshShelves();
    }
    this.queue = this.queue.filter((q) => q !== c);
    shopBridge.leftEmptyHanded(c.name, c.wantName || 'their item', 'gone');
    this.leave(c);
  }

  private updateCustomer(c: Customer, dt: number) {
    c.stateTime += dt;
    const limit = STUCK_LIMIT[c.state];
    if (limit && c.stateTime > limit) this.rescue(c);

    switch (c.state) {
      case 'enter':
        if (this.walk(c, dt, this.customers)) {
          const p = this.chooseWant(c, new Set(), false);
          if (!p) { this.leave(c); break; }
          shopBridge.customerEntered(c.name, p.name);
          this.goToShelf(c, p);
        }
        break;
      case 'toShelf':
        if (!c.wantId || !shopBridge.product(c.wantId)) { this.leave(c); break; }
        if (this.walk(c, dt, this.customers)) {
          this.setState(c, 'browse');
          c.timer = 0.9 + Math.random() * 0.8;
          this.standStill(c, 'up');
          this.showBubble(c, 'think', c.timer);
        }
        break;
      case 'browse': {
        c.timer -= dt;
        if (c.timer > 0) break;
        const p = c.wantId ? shopBridge.product(c.wantId) : undefined;
        const taken = p ? shopBridge.reserve(p.id, this.desiredQty(p)) : 0;
        if (p && taken > 0) {
          c.qty = taken;
          c.carry = this.add.image(c.sprite.x, c.sprite.y - 6, `mini-${miniKindFor(p.name)}`).setDepth(c.sprite.y + 1);
          this.floatText(c.sprite.x, c.sprite.y - 16, `x${taken}`, '#ffffff');
          this.refreshShelves();
          this.queue.push(c);
          this.setState(c, 'toQueue');
          c.path = [];
          break;
        }
        // product unavailable: look for an alternative, or leave
        this.showBubble(c, 'no', 1);
        c.attempts++;
        const wanted = p?.name ?? c.wantName;
        const alt = c.attempts < 3 ? this.chooseWant(c, new Set(c.wantId ? [c.wantId] : []), true) : null;
        if (alt) {
          shopBridge.notifyAlternative(c.name, wanted, alt.name);
          this.goToShelf(c, alt);
        } else {
          shopBridge.leftEmptyHanded(c.name, wanted, 'out');
          c.wantId = null;
          this.leave(c);
        }
        break;
      }
      case 'toQueue':
      case 'queue': {
        const idx = this.queue.indexOf(c);
        if (idx < 0) { this.leave(c); break; }
        const spot = QUEUE[Math.min(idx, QUEUE.length - 1)];
        const dest = c.path.length ? c.path[c.path.length - 1] : c.tile;
        if (dest.x !== spot.x || dest.y !== spot.y) this.routeTo(c, spot);
        if (this.walk(c, dt, this.customers)) {
          if (c.state !== 'queue') this.setState(c, 'queue');
          this.standStill(c, 'up');
          if (idx === 0 && this.keeperState === 'idle') {
            this.setState(c, 'checkout');
            c.timer = 1.3;
            this.keeperState = 'serving';
            this.keeperIdleFor = 0;
            this.showBubble(c, 'dots', 1.3);
          }
        }
        break;
      }
      case 'checkout':
        c.timer -= dt;
        if (c.timer > 0) break;
        if (c.wantId && c.qty > 0) {
          const res = shopBridge.checkout(c.id, c.name, c.wantId, c.qty);
          if (res.ok) {
            this.showBubble(c, 'coin', 1.2);
            this.floatText(this.keeper.x, this.keeper.y - 18, `+${Math.round(res.value.total)}`, '#ffe066');
          } else {
            this.showBubble(c, 'no', 1.2);
            c.carry?.destroy();
            c.carry = undefined;
            if (res.code !== 'DUPLICATE') shopBridge.leftEmptyHanded(c.name, c.wantName, 'gone');
          }
          c.qty = 0; // basket released (paid or returned)
        }
        this.queue = this.queue.filter((q) => q !== c);
        this.keeperState = 'idle';
        this.refreshShelves();
        this.leave(c);
        break;
      case 'leave':
        if (c.path.length) this.walk(c, dt, this.customers);
        else if (this.walkOff(c, dt)) this.setState(c, 'gone');
        break;
    }

    c.inside = c.sprite.y < tileY(FRONT_WALL_Y) + 1 && c.sprite.x > 0 && c.sprite.x < GAME_W;
    this.syncAttachments(c, dt);
  }

  /* ------------------------------ deliveries ----------------------------- */

  private spawnCourier(order: PendingOrder) {
    const slot = this.slotFor(order.productId);
    if (!slot) { shopBridge.cancelOrder(order.id); return; }
    shopBridge.startDelivery(order.id);
    const fromLeft = Math.random() < 0.5;
    const startX = fromLeft ? -10 : GAME_W + 10;
    const sprite = this.add.sprite(startX, tileY(SIDEWALK_Y), 'courier', 8).setOrigin(0.5, 1);
    const shadow = this.add.image(startX, sprite.y, 'shadow');
    const carry = this.add.image(startX, sprite.y - 15, 'crate').setScale(0.7);
    const edge: Cell = { x: fromLeft ? 0 : COLS - 1, y: SIDEWALK_Y };
    this.couriers.push({
      order, sprite, shadow, carry, texKey: 'courier', bubbleT: 0,
      tile: edge, path: [edge, ...(findPath(edge, slot.approach) ?? [])],
      wait: 0, facing: 'side', exitX: edge.x, state: 'in', timer: 0,
    });
    this.keeperSays('box', 1.4);
  }

  private updateCourier(c: Courier, dt: number) {
    if (c.state === 'in') {
      if (this.walk(c, dt)) {
        c.state = 'stock';
        c.timer = 1.6;
        this.standStill(c, 'up');
        this.showBubble(c, 'box', 1.6);
      }
    } else if (c.state === 'stock') {
      c.timer -= dt;
      if (c.timer <= 0) {
        const done = shopBridge.completeDelivery(c.order.id);
        if (done) this.floatText(c.sprite.x, c.sprite.y - 18, `+${done.quantity}`, '#8ef0a8');
        c.carry?.destroy();
        c.carry = undefined;
        this.refreshShelves();
        c.state = 'out';
        this.routeTo(c, { x: c.exitX, y: SIDEWALK_Y });
      }
    } else if (c.state === 'out') {
      if (c.path.length) this.walk(c, dt);
      else if (this.walkOff(c, dt)) c.state = 'gone';
    }
    this.syncAttachments(c, dt, true);
  }

  /* ------------------------------ shopkeeper ----------------------------- */

  private updateKeeper(dt: number) {
    if (this.keeperBubble) {
      this.keeperBubbleT -= dt;
      this.keeperBubble.setPosition(this.keeper.x + 5, this.keeper.y - 15);
      if (this.keeperBubbleT <= 0) { this.keeperBubble.destroy(); this.keeperBubble = undefined; }
    }
    const needed = this.queue.length > 0;
    if (this.keeperState === 'serving') {
      if (!this.keeper.anims.isPlaying) this.keeper.play('keeper-walk-down');
      return;
    }
    if (this.keeperState === 'idle') {
      if (this.keeper.anims.isPlaying) this.keeper.anims.stop();
      this.keeper.setFrame(0).setFlipX(false);
      this.keeperIdleFor += dt;
      if (!needed && this.keeperIdleFor > 9 + Math.random() * 6) {
        this.keeperIdleFor = 0;
        this.keeperState = 'toStorage';
        this.keeperPath = findPath(this.keeperTile, KEEPER_STORAGE_POS, STAFF_WALKABLE) ?? [];
      }
      return;
    }
    if (this.keeperState === 'storage') {
      this.keeperTimer -= dt;
      this.keeper.setFrame(4);
      if (this.keeperTimer <= 0 || needed) {
        this.keeperState = 'back';
        this.keeperPath = findPath(this.keeperTile, KEEPER_POS, STAFF_WALKABLE) ?? [];
      }
      return;
    }
    if (this.keeperState === 'toStorage' && needed) {
      this.keeperState = 'back';
      this.keeperPath = findPath(this.keeperTile, KEEPER_POS, STAFF_WALKABLE) ?? [];
    }
    const next = this.keeperPath[0];
    if (!next) {
      if (this.keeperState === 'toStorage') { this.keeperState = 'storage'; this.keeperTimer = 2; }
      else { this.keeperState = 'idle'; this.keeperTile = { ...KEEPER_POS }; this.keeper.setPosition(tileX(KEEPER_POS.x), tileY(KEEPER_POS.y)); }
      this.keeper.anims.stop();
      return;
    }
    const tx = tileX(next.x), ty = tileY(next.y);
    const dx = tx - this.keeper.x, dy = ty - this.keeper.y;
    const dist = Math.hypot(dx, dy);
    const step = WALK_SPEED * dt;
    if (dist <= step) { this.keeper.setPosition(tx, ty); this.keeperTile = { ...next }; this.keeperPath.shift(); }
    else { this.keeper.x += (dx / dist) * step; this.keeper.y += (dy / dist) * step; }
    const facing = Math.abs(dx) > Math.abs(dy) ? 'side' : dy < 0 ? 'up' : 'down';
    this.keeper.setFlipX(facing === 'side' && dx < 0);
    const anim = `keeper-walk-${facing}`;
    if (this.keeper.anims.currentAnim?.key !== anim || !this.keeper.anims.isPlaying) this.keeper.play(anim, true);
    this.keeper.setDepth(this.keeper.y);
  }

  private updateFloaters(dt: number) {
    this.floaters = this.floaters.filter((f) => {
      f.life -= dt;
      f.img.y -= 10 * dt;
      f.img.setAlpha(Math.min(1, f.life / 0.5));
      if (f.life <= 0) { f.img.destroy(); return false; }
      return true;
    });
  }
}
