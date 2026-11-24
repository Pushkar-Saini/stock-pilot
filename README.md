# StockPilot

> Know what you'll run out of before you actually run out of it.

Smart inventory management and demand forecasting for small retailers, hardware distributors and small manufacturers. It has two connected experiences:

- **Business dashboard**: Overview, Inventory, Sales & Transactions (with stock movement history), Suppliers, Demand Forecasting (with a what-if simulator), and Settings.
- **Virtual shop**: a Phaser 3 pixel-art shop. Customers walk in, browse, pick an available quantity, queue, pay and leave. Every purchase goes through the same inventory engine as a manual sale.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # engine + forecasting unit tests
npm run build
```

## Architecture

| Area | Location |
|---|---|
| Domain types | `src/domain/types.ts` |
| **Inventory engine** (pure functions: sale, stock in, adjustment, product CRUD, idempotency) | `src/domain/inventoryEngine.ts` |
| Forecasting (moving average, reorder point, days to stockout, reorder quantity) | `src/domain/forecasting.ts` |
| Demo dataset (10 products, 3 suppliers, 30 days of consistent history) | `src/domain/seed.ts` |
| Shared state (Zustand, persisted to localStorage) | `src/store/inventoryStore.ts`, `src/store/simStore.ts` |
| Game ↔ app bridge (availability, baskets, checkout with idempotency keys) | `src/game/bridge.ts` |
| Phaser scene, layout/pathfinding, procedural pixel art | `src/game/ShopScene.ts`, `shopLayout.ts`, `pixelArt.ts` |
| Pages and UI | `src/pages/*`, `src/components/*` |

The Phaser scene has no business logic. It asks the bridge what is available, reserves items while a customer carries them (so two customers can never buy the same last unit), and commits each purchase through `recordSale` with a per-customer idempotency key. That guarantees one transaction and exactly one stock decrease per purchase.

The shop runs in a loop: customers come in, buy and pay at the counter. When a product hits its reorder point, the shopkeeper places a purchase order for the recommended quantity. After a delay based on the supplier's lead time (4 simulated seconds per lead-time day, between 10 and 40 seconds), a delivery person brings it to the shelf. The delivery is recorded through `receiveStock` as a stock-in movement plus a supplier purchase. The side panel shows open orders and a live log of customer, stock and alert events. Auto-reorder can be switched off.

Forecasts are transparent statistical calculations, not machine learning. Products with too little history fall back to a demo estimate, which is clearly labelled in the UI.

All sprites are drawn procedurally in code on a 16px grid, so there are no external image assets. Data lives in localStorage; **Settings → Restore demo data** resets it. The storage layer is the store, so a Supabase/PostgreSQL backend can replace it later.
