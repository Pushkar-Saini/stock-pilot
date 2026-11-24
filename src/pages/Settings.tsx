import { useState } from 'react';
import { Database, Download, RotateCcw } from 'lucide-react';
import { useInventory } from '../store/inventoryStore';
import { useSim } from '../store/simStore';
import { toast } from '../store/toastStore';
import { fmtNum } from '../lib/format';
import { Button, Card, CardHeader, Field, Input, Select } from '../components/ui';
import { ConfirmModal } from '../components/StockModals';
import type { Settings as S } from '../domain/types';

export function Settings() {
  const settings = useInventory((s) => s.settings);
  const updateSettings = useInventory((s) => s.updateSettings);
  const restore = useInventory((s) => s.restoreDemoData);
  const counts = {
    p: useInventory((s) => s.products.length),
    t: useInventory((s) => s.transactions.length),
    m: useInventory((s) => s.movements.length),
  };
  const resetSim = useSim((s) => s.reset);
  const [confirm, setConfirm] = useState(false);
  const [draft, setDraft] = useState(settings);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Card>
        <CardHeader title="Business profile" subtitle="Shown in the sidebar and top bar." />
        <form
          className="grid grid-cols-1 gap-4 sm:grid-cols-2"
          onSubmit={(e) => { e.preventDefault(); updateSettings(draft); toast.success('Settings saved'); }}
        >
          <Field label="Business name"><Input value={draft.businessName} onChange={(e) => setDraft({ ...draft, businessName: e.target.value })} /></Field>
          <Field label="Owner name"><Input value={draft.ownerName} onChange={(e) => setDraft({ ...draft, ownerName: e.target.value })} /></Field>
          <Field label="Currency">
            <Select value={draft.currency} onChange={(e) => setDraft({ ...draft, currency: e.target.value as S['currency'] })}>
              <option value="INR">Indian Rupee (₹)</option>
              <option value="USD">US Dollar ($)</option>
              <option value="EUR">Euro (€)</option>
            </Select>
          </Field>
          <div />
          <Field label="Forecast history window" hint="Days of sales used to compute average daily usage.">
            <Select value={draft.forecastWindowDays} onChange={(e) => setDraft({ ...draft, forecastWindowDays: Number(e.target.value) })}>
              {[7, 14, 30, 60, 90].map((d) => <option key={d} value={d}>{d} days</option>)}
            </Select>
          </Field>
          <Field label="Planning period" hint="How many days a recommended order should cover.">
            <Select value={draft.planningPeriodDays} onChange={(e) => setDraft({ ...draft, planningPeriodDays: Number(e.target.value) })}>
              {[7, 14, 30, 60].map((d) => <option key={d} value={d}>{d} days</option>)}
            </Select>
          </Field>
          <div className="sm:col-span-2"><Button variant="primary" type="submit">Save settings</Button></div>
        </form>
      </Card>

      <Card>
        <CardHeader title="Data" subtitle="All data is stored in this browser (localStorage). A Supabase/PostgreSQL backend can replace it later." />
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-canvas px-3 py-2.5 text-[13px] text-ink-2">
          <Database size={15} /> {counts.p} products · {fmtNum(counts.t)} transactions · {fmtNum(counts.m)} stock movements
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            icon={<Download size={15} />}
            onClick={() => {
              const s = useInventory.getState();
              const data = { products: s.products, suppliers: s.suppliers, transactions: s.transactions, movements: s.movements, purchases: s.purchases, settings: s.settings };
              const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
              const a = document.createElement('a');
              a.href = url; a.download = 'stockpilot-backup.json'; a.click();
              URL.revokeObjectURL(url);
            }}
          >
            Export backup (JSON)
          </Button>
          <Button variant="danger" icon={<RotateCcw size={15} />} onClick={() => setConfirm(true)}>Restore demo data</Button>
        </div>
      </Card>

      <ConfirmModal
        open={confirm}
        title="Restore the demo dataset?"
        text="This replaces all products, suppliers, transactions and stock movements with the original sample hardware shop. Your current data will be lost unless you export a backup first."
        confirmLabel="Restore demo data"
        onConfirm={() => { restore(); resetSim(); setDraft(useInventory.getState().settings); toast.success('Demo data restored'); }}
        onClose={() => setConfirm(false)}
      />
    </div>
  );
}
