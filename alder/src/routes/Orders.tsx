import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, ArrowUpRight } from 'lucide-react';
import { useStore } from '../lib/store';
import { ITEM_STATUSES, STATUS_LABEL, type ItemStatus } from '../lib/types';
import { CATEGORY_LABEL, lineBest, orderPlan } from '../lib/budget';
import { itemsCsv } from '../lib/export';
import { fmtMoney } from '../lib/takeoff';
import { catalogItem } from '../data/catalog';
import { marketUrl } from '../data/markets';
import { Button, Chip, Kicker, Empty, ExportSheet } from '../components/ui';

const NEXT: Partial<Record<ItemStatus, ItemStatus>> = { idea: 'shortlist', shortlist: 'approved', approved: 'ordered', ordered: 'delivered', delivered: 'installed' };

export default function Orders() {
  const house = useStore((s) => s.house);
  const setItemStatus = useStore((s) => s.setItemStatus);
  const updateItem = useStore((s) => s.updateItem);
  const [view, setView] = useState<'board' | 'plan' | 'sheet'>('board');
  const [roomF, setRoomF] = useState('all');
  const [csv, setCsv] = useState(false);
  const items = house.items.filter((i) => roomF === 'all' || i.roomId === roomF);
  const roomName = (id: string) => house.rooms.find((r) => r.id === id)?.name ?? '';
  const plan = orderPlan(items);
  const moveIn = house.settings.moveIn ? new Date(house.settings.moveIn) : null;
  const weeksLeft = moveIn ? Math.round((moveIn.getTime() - Date.now()) / (7 * 86400000)) : null;

  if (house.items.length === 0) return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-10 md:py-8"><Kicker>Orders</Kicker><h1 className="mt-2 display text-4xl">Nothing to order</h1>
      <div className="mt-6"><Empty title="Lists are empty" body="Add pieces to a room from the catalog or from the room's own list. They show up here as a pipeline from idea to installed." action={<Link to="/catalog" className="text-sm text-oak">Open the catalog</Link>} /></div></div>
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-10 md:py-8">
      <Kicker>Orders</Kicker>
      <h1 className="mt-2 display text-4xl">From idea to installed</h1>
      <p className="mt-2 max-w-xl text-muted">Every item, by where it is in the pipeline. Move things along as you decide, order, and sign for them. {weeksLeft != null && (weeksLeft > 0 ? `${weeksLeft} weeks to move-in.` : 'Move-in has passed; the list is what it is.')}</p>
      <div className="mt-4 flex flex-wrap gap-2 no-print">
        {(['board', 'plan', 'sheet'] as const).map((v) => <Chip key={v} on={view === v} onClick={() => setView(v)}>{v === 'board' ? 'Pipeline' : v === 'plan' ? 'What to order first' : 'Order sheet'}</Chip>)}
        <span className="mx-2 self-center text-muted">·</span>
        <Chip on={roomF === 'all'} onClick={() => setRoomF('all')}>All rooms</Chip>
        {house.rooms.map((r) => <Chip key={r.id} on={roomF === r.id} onClick={() => setRoomF(r.id)}>{r.name}</Chip>)}
      </div>

      {view === 'board' && (
        <div className="mt-6 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          {ITEM_STATUSES.filter((s) => s !== 'returned').map((st) => {
            const col = items.filter((i) => i.status === st);
            return (
              <div key={st} className="card min-h-32 p-3">
                <p className="kicker">{STATUS_LABEL[st]} <span className="text-muted normal-case tracking-normal">· {col.length} · {fmtMoney(col.reduce((a, i) => a + lineBest(i), 0))}</span></p>
                <div className="mt-2 flex flex-col gap-2">
                  {col.map((i) => (
                    <div key={i.id} className="rounded-xl bg-raised p-2 text-sm">
                      <p className="font-medium leading-tight">{i.name}</p>
                      <p className="text-xs text-muted">{roomName(i.roomId)} · {i.qty} {i.unit} · {fmtMoney(lineBest(i))}{i.lead ? ` · ${i.lead} wk` : ''}</p>
                      <div className="mt-1 flex gap-1 no-print">
                        {NEXT[st] && <button type="button" className="rounded-full bg-oak px-2 py-0.5 text-xs text-ink" onClick={() => setItemStatus(i.id, NEXT[st]!)}>→ {STATUS_LABEL[NEXT[st]!]}</button>}
                        {st !== 'idea' && <button type="button" className="rounded-full px-2 py-0.5 text-xs text-muted" onClick={() => setItemStatus(i.id, ITEM_STATUSES[ITEM_STATUSES.indexOf(st) - 1])}>←</button>}
                        {(st === 'delivered' || st === 'installed') && <button type="button" className="rounded-full px-2 py-0.5 text-xs text-stop" onClick={() => setItemStatus(i.id, 'returned')}>Return</button>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {items.some((i) => i.status === 'returned') && <div className="card p-3 md:col-span-3 xl:col-span-6"><p className="kicker">Returned</p><p className="mt-1 text-sm text-muted">{items.filter((i) => i.status === 'returned').map((i) => i.name).join(', ')}. Not counted in the budget.</p></div>}
        </div>
      )}

      {view === 'plan' && (
        <div className="mt-6">
          <p className="text-sm text-muted">Shortlisted and approved items, in the order a build wants them: millwork and surfaces first (they have the longest lead and everything sits on them), then plumbing and appliances, lighting, hardware, furniture, textiles, art.</p>
          {plan.length === 0 ? <p className="mt-4 text-sm text-muted">Nothing shortlisted or approved yet.</p> : (
            <ol className="mt-4 grid gap-2">
              {plan.map((i, n) => {
                const orderBy = moveIn && i.lead ? new Date(moveIn.getTime() - (i.lead + 2) * 7 * 86400000) : null;
                return (
                  <li key={i.id} className="card flex flex-wrap items-center gap-3 p-3 text-sm">
                    <span className="grid size-8 place-items-center rounded-full bg-raised text-xs">{n + 1}</span>
                    <span className="min-w-0 flex-1"><span className="block font-medium">{i.name}</span><span className="text-xs text-muted">{roomName(i.roomId)} · {CATEGORY_LABEL[i.category]} · {i.lead ? `${i.lead}-week lead` : 'no stated lead time'}{orderBy ? ` · order by ${orderBy.toLocaleDateString()}` : ''}</span></span>
                    <span className="tabular-nums">{fmtMoney(lineBest(i))}</span>
                    {i.status !== 'ordered' && <Button kind="ghost" className="min-h-9 px-3 text-xs" onClick={() => setItemStatus(i.id, 'ordered')}>Mark ordered</Button>}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}

      {view === 'sheet' && (
        <div className="mt-6">
          <div className="flex flex-wrap gap-2 no-print"><Button kind="ghost" onClick={() => setCsv(true)}><Download className="size-4" />CSV</Button></div>
          <ExportSheet open={csv} onClose={() => setCsv(false)} title="Order sheet, CSV" filename="alder-order-sheet.csv" content={itemsCsv(items, house.rooms, house.settings)} type="text/csv" />
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead><tr className="text-left text-xs text-muted"><th className="py-2">Item</th><th>Room</th><th>Qty</th><th>Unit $</th><th>Line</th><th>Status</th><th>Retailer / SKU</th><th>Link</th></tr></thead>
              <tbody>
                {[...items].sort((a, b) => roomName(a.roomId).localeCompare(roomName(b.roomId)) || a.name.localeCompare(b.name)).map((i) => {
                  const c = i.catalogId ? catalogItem(i.catalogId) : undefined;
                  return (
                    <tr key={i.id} className="border-t border-line align-top">
                      <td className="py-2"><span className="font-medium">{i.name}</span>{i.dims && <span className="block text-xs text-muted">{i.dims.join('×')}″</span>}</td>
                      <td>{roomName(i.roomId)}</td>
                      <td>{i.qty} {i.unit}</td>
                      <td className="tabular-nums">{i.price ? fmtMoney(i.price) : <span className="text-muted">est.</span>}</td>
                      <td className="tabular-nums">{fmtMoney(lineBest(i))}</td>
                      <td><select value={i.status} onChange={(e) => setItemStatus(i.id, e.target.value as ItemStatus)} className="min-h-9 py-1 text-xs">{ITEM_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select></td>
                      <td><input className="field min-h-9 py-1 text-xs" placeholder="Retailer" value={i.retailer ?? ''} onChange={(e) => updateItem(i.id, { retailer: e.target.value })} /><input className="field mt-1 min-h-9 py-1 text-xs" placeholder="SKU / order #" value={i.sku ?? ''} onChange={(e) => updateItem(i.id, { sku: e.target.value })} /></td>
                      <td>{i.url ? <a href={i.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-oak">Open <ArrowUpRight className="size-3" /></a> : c ? <a href={marketUrl(c.markets[0], c.query)} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-oak">Hunt <ArrowUpRight className="size-3" /></a> : <input className="field min-h-9 py-1 text-xs" placeholder="Paste a link" onBlur={(e) => e.target.value && updateItem(i.id, { url: e.target.value })} />}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
