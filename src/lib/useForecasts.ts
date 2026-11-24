import { useMemo } from 'react';
import { useInventory } from '../store/inventoryStore';
import { forecastAll } from '../domain/forecasting';
import type { InventoryState } from '../domain/types';

/** Forecasts for every product, recomputed whenever inventory data changes. */
export function useForecasts(demandMultiplier = 1) {
  const products = useInventory((s) => s.products);
  const movements = useInventory((s) => s.movements);
  const windowDays = useInventory((s) => s.settings.forecastWindowDays);
  const planningPeriodDays = useInventory((s) => s.settings.planningPeriodDays);
  return useMemo(
    () => forecastAll({ products, movements } as InventoryState, { windowDays, planningPeriodDays, demandMultiplier }),
    [products, movements, windowDays, planningPeriodDays, demandMultiplier],
  );
}
