import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Download } from 'lucide-react';
import { useStore } from '../lib/store';
import { rollup, roomRollup, CATEGORY_LABEL } from '../lib/budget';
import { itemsCsv } from '../lib/export';
import { fmtMoney } from '../lib/takeoff';
import { Button, Kicker, Stat, Field, Empty, ExportSheet } from '../components/ui';
import { ITEM_CATEGORIES, STATUS_LABEL, ITEM_STATUSES } from '../lib/types';

export default function Budget() {
  const house = useStore((s) => s.house);
  const updateSettings = useStore((s) => s.updateSettings);
  const updateRoom = useStore((s) => s.updateRoom);
  const s = house.settings;
  const [csv, setCsv] = useState(false);
  const t = rollup(house.items, s);
  const rooms = house.rooms.map((r) => ({ r, roll: roomRollup(r, house.items, s) }));
  const shellMissing = rooms.filter((x) => !x.roll.hasShellLines).reduce((a, x) => a + x.roll.shellMid, 0);
  const grand = t.total + shellMissing * (1 + s.taxRate) * (1 + s.contingency);
  const budget = s.totalBudget ?? 0;
  const maxCat = Math.max(1, ...Object.values(t.byCategory));

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-10 md:py-8">
      <Kicker>Budget</Kicker>
      <h1 className="mt-2 display text-4xl italic">The number, honestly</h1>
      <p className="mt-2 max-w-xl text-muted">Every list in every room, plus tax, delivery and a contingency you should not delete. Rooms without shell lines are estimated from their surfaces.</p>

      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="At the door" value={fmtMoney(grand)} sub={`range ${fmtMoney(t.low + shellMissing * 0.8)}–${fmtMoney(t.high + shellMissing * 1.2)}`} />
        <Stat label="Committed" value={fmtMoney(t.committed)} sub="ordered, delivered, installed" />
        <Stat label="Spent" value={fmtMoney(t.spent)} sub="delivered or installed" />
        <Stat label={budget ? 'Left in the budget' : 'Budget'} value={budget ? fmtMoney(budget - grand) : '—'} sub={budget ? (grand > budget ? `over by ${fmtMoney(grand - budget)}` : `${Math.round(((budget - grand) / budget) * 100)}% headroom`) : 'set one below'} />
      </div>

      {budget > 0 && (
        <div className="mt-4">
          <div className="flex h-3 overflow-hidden rounded-full bg-raised">
            <div className="bg-good" style={{ width: `${Math.min(100, (t.spent / budget) * 100)}%` }} title="Spent" />
            <div className="bg-oak" style={{ width: `${Math.min(100, ((t.committed - t.spent) / budget) * 100)}%` }} title="Ordered" />
            <div className="bg-hmm/70" style={{ width: `${Math.min(100, ((grand - t.committed) / budget) * 100)}%` }} title="Planned" />
          </div>
          <p className="mt-1 text-xs text-muted">green spent · oak ordered · amber still to buy</p>
        </div>
      )}

      <section className="card mt-6 grid gap-3 p-4 md:grid-cols-5">
        <Field label="Whole-house budget" type="number" min={0} value={s.totalBudget ?? ''} placeholder="e.g. 60000" onChange={(e) => updateSettings({ totalBudget: e.target.value ? Number(e.target.value) : undefined })} />
        <Field label="Sales tax" type="number" step={0.001} min={0} value={Math.round(s.taxRate * 10000) / 100} suffix="%" onChange={(e) => updateSettings({ taxRate: Number(e.target.value) / 100 })} />
        <Field label="Delivery, default" type="number" step={1} min={0} value={Math.round(s.shippingDefault * 100)} suffix="% of item" onChange={(e) => updateSettings({ shippingDefault: Number(e.target.value) / 100 })} />
        <Field label="Contingency" type="number" step={1} min={0} value={Math.round(s.contingency * 100)} suffix="%" onChange={(e) => updateSettings({ contingency: Number(e.target.value) / 100 })} />
        <Field label="Move-in" type="date" value={s.moveIn ?? ''} onChange={(e) => updateSettings({ moveIn: e.target.value || undefined })} />
        <p className="text-xs text-muted md:col-span-5">New Jersey sales tax is 6.625%; furniture delivered from out of state is still taxed. Twelve percent contingency is the honest minimum on a build. Budgeting lesson: <Link to="/learn/budget" className="text-oak">read it</Link>.</p>
      </section>

      {house.rooms.length === 0 ? (
        <div className="mt-6"><Empty title="Nothing to add up yet" body="Add a room in My House. Its surfaces alone will put a number here." action={<Link to="/house" className="text-sm text-oak">Go to My House</Link>} /></div>
      ) : (<>
        <h2 className="mt-8 display text-2xl">By room</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr className="text-left text-xs text-muted"><th className="py-2">Room</th><th>Items</th><th>Shell</th><th>Subtotal</th><th>At the door</th><th>Room budget</th><th></th></tr></thead>
            <tbody>
              {rooms.map(({ r, roll }) => {
                const atDoor = roll.total + (roll.hasShellLines ? 0 : roll.shellMid * (1 + s.taxRate) * (1 + s.contingency));
                return (
                  <tr key={r.id} className="border-t border-line">
                    <td className="py-2"><Link to={`/house/${r.id}`} className="text-oak">{r.name}</Link></td>
                    <td>{roll.count}</td>
                    <td className="text-muted">{roll.hasShellLines ? 'on the list' : `~${fmtMoney(roll.shellMid)} est.`}</td>
                    <td>{fmtMoney(roll.subtotal)}</td>
                    <td className="font-medium">{fmtMoney(atDoor)}</td>
                    <td><input type="number" className="field w-28" min={0} value={r.budget ?? ''} placeholder="—" onChange={(e) => updateRoom(r.id, { budget: e.target.value ? Number(e.target.value) : undefined })} /></td>
                    <td className={r.budget ? (atDoor > r.budget ? 'text-stop' : 'text-good') : 'text-muted'}>{r.budget ? (atDoor > r.budget ? `+${fmtMoney(atDoor - r.budget)}` : `${fmtMoney(r.budget - atDoor)} left`) : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <h2 className="mt-8 display text-2xl">By category</h2>
        <div className="mt-3 grid gap-2">
          {ITEM_CATEGORIES.filter((c) => t.byCategory[c]).sort((a, b) => t.byCategory[b] - t.byCategory[a]).map((c) => (
            <div key={c} className="flex items-center gap-3 text-sm"><span className="w-32 shrink-0 text-muted">{CATEGORY_LABEL[c]}</span><div className="h-2 flex-1 overflow-hidden rounded-full bg-raised"><div className="h-full bg-oak" style={{ width: `${(t.byCategory[c] / maxCat) * 100}%` }} /></div><span className="w-24 text-right tabular-nums">{fmtMoney(t.byCategory[c])}</span></div>
          ))}
        </div>

        <h2 className="mt-8 display text-2xl">By status</h2>
        <div className="mt-3 flex flex-wrap gap-2">{ITEM_STATUSES.map((st) => <span key={st} className="rounded-full bg-raised px-3 py-1 text-sm">{STATUS_LABEL[st]} <span className="text-muted">{fmtMoney(t.byStatus[st])}</span></span>)}</div>

        <h2 className="mt-8 display text-2xl">The arithmetic</h2>
        <dl className="mt-3 grid max-w-md grid-cols-[1fr_auto] gap-y-1 text-sm">
          <dt className="text-muted">Items, best estimate</dt><dd className="text-right tabular-nums">{fmtMoney(t.subtotal)}</dd>
          <dt className="text-muted">Shell estimates for rooms without lines</dt><dd className="text-right tabular-nums">{fmtMoney(shellMissing)}</dd>
          <dt className="text-muted">Delivery</dt><dd className="text-right tabular-nums">{fmtMoney(t.shipping)}</dd>
          <dt className="text-muted">Tax</dt><dd className="text-right tabular-nums">{fmtMoney(t.tax + shellMissing * s.taxRate)}</dd>
          <dt className="text-muted">Contingency</dt><dd className="text-right tabular-nums">{fmtMoney(grand - t.subtotal - shellMissing - t.shipping - t.tax - shellMissing * s.taxRate)}</dd>
          <dt className="border-t border-line pt-1 font-medium">At the door</dt><dd className="border-t border-line pt-1 text-right font-medium tabular-nums">{fmtMoney(grand)}</dd>
        </dl>
        <div className="mt-6 flex flex-wrap gap-2 no-print">
          <Button kind="ghost" onClick={() => setCsv(true)}><Download className="size-4" />Export CSV</Button>
          <ExportSheet open={csv} onClose={() => setCsv(false)} title="Budget, CSV" filename="alder-budget.csv" content={itemsCsv(house.items, house.rooms, s)} type="text/csv" />
        </div>
      </>)}
    </div>
  );
}
