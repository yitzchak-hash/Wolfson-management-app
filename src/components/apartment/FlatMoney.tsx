import { Wallet } from 'lucide-react';
import { useStore } from '../../data/store';
import type { Apartment } from '../../types';
import { crmJobUrl } from '../../data/crmLink';
import { shekels, orderStateWord, sortedOrders, balanceWords } from '../../data/flatMoney';
import { CrmMark, FromCrmTag } from '../ui/CrmMark';

/**
 * THE FLAT'S MONEY PART (owner's D19, slice S37). Read only: Finance's balance
 * for the flat's job and the CRM's upgrade orders for it, each written onto
 * the flat by the app that owns it (src/data/flatMoney.ts). Nothing here is a
 * button that changes money; the order numbers open the CRM.
 *
 * Hebrew changes the words, never the layout: the part stays left-to-right,
 * the words inside it carry their own direction.
 */
const STATE_CHIP: Record<string, string> = {
  won: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  open: 'bg-amber-50 text-amber-700 border-amber-200',
  lost: 'bg-gray-50 text-gray-500 border-gray-200',
};

function when(iso: string | undefined, isRtl: boolean): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(isRtl ? 'he-IL' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function FlatMoney({ apartmentId, fallback }: { apartmentId: string; fallback: Apartment }) {
  const ui = useStore(st => st.mainUiStrings);
  // Read LIVE: the CRM or Finance may write while the window is open, and the
  // balance line must fill itself the moment Finance's field arrives.
  const apt = useStore(st => st.apartments.find(a => a.id === apartmentId)) ?? fallback;
  const isRtl = ui.isRtl;
  const money = apt.crmMoney;
  const orders = sortedOrders(money?.orders);
  const bal = balanceWords(apt, ui);
  const fb = apt.financeBalance;
  const jobNo = apt.jobNo?.trim() ?? '';
  const dirAuto = isRtl ? 'rtl' : undefined;

  return (
    <section data-flat-money className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-3 py-2 bg-gray-50 border-b border-gray-200">
        <Wallet size={14} className="text-[#1e3a5f] flex-shrink-0" aria-hidden="true" />
        <span className="text-sm font-bold text-gray-800" dir={dirAuto}>{ui.moneyTitle}</span>
        {jobNo && <FromCrmTag href={crmJobUrl(jobNo)} title={ui.fromCrm} field="money" />}
        {/* On a phone the note takes its own line rather than being cut. */}
        <span className="basis-full sm:basis-auto sm:ms-auto text-[10.5px] text-gray-500 min-w-0" dir={dirAuto} data-money-readonly>
          {ui.moneyReadOnly}
        </span>
      </div>

      {/* Balance: Finance's, or "Not connected yet" until Finance publishes it. */}
      <div className="flex items-baseline gap-3 px-3 py-2 border-b border-gray-100" data-money-balance={fb ? 'connected' : 'waiting'}>
        <span className="text-xs font-medium text-gray-500 w-28 flex-shrink-0" dir={dirAuto}>{ui.moneyBalance}</span>
        {bal ? (
          <span className="min-w-0 flex-1">
            <span className={`text-sm font-bold ${fb!.balanceAgorot > 0 ? 'text-rose-700' : 'text-emerald-700'}`} dir={dirAuto}>{bal}</span>
            {(fb!.billedAgorot != null && fb!.paidAgorot != null) && (
              <span className="block text-[11px] text-gray-500" dir={dirAuto}>
                {ui.moneyBilledPaid.replace('{billed}', shekels(fb!.billedAgorot)).replace('{paid}', shekels(fb!.paidAgorot))}
              </span>
            )}
            <span className="block text-[10.5px] text-gray-400" dir={dirAuto}>{ui.moneyAsOf.replace('{when}', when(fb!.asOf, isRtl))}</span>
          </span>
        ) : (
          <span className="text-sm italic text-gray-400" title={ui.moneyNotConnectedTip} dir={dirAuto}>{ui.moneyNotConnected}</span>
        )}
      </div>

      {/* The CRM's upgrade orders for this flat. */}
      <div className="px-3 py-2" data-money-orders={orders.length}>
        <div className="text-xs font-medium text-gray-500 mb-1.5" dir={dirAuto}>{ui.moneyUpgradeOrders}</div>
        {!money ? (
          <div className="text-sm italic text-gray-400" dir={dirAuto}>{ui.moneyNotMirrored}</div>
        ) : !orders.length ? (
          <div className="text-sm text-gray-500" dir={dirAuto}>{ui.moneyNoOrders}</div>
        ) : (
          <ul className="space-y-1.5">
            {orders.map(o => (
              <li key={o.number} data-money-order={o.number} data-state={o.state}
                className="flex items-center gap-2 min-w-0">
                <a href={crmJobUrl(o.number)} target="_blank" rel="noopener noreferrer" title={ui.openInCrm}
                  className="inline-flex items-center gap-1 font-bold tabular-nums text-sm text-indigo-700 hover:underline flex-shrink-0">
                  {o.number} <CrmMark size={11} />
                </a>
                <span className={`text-[11px] font-semibold border rounded px-1.5 py-px flex-shrink-0 ${STATE_CHIP[o.state] ?? STATE_CHIP.open}`} dir={dirAuto}>
                  {orderStateWord(o.state, ui)}
                </span>
                <span className="ms-auto text-end min-w-0">
                  {o.valueAgorot != null ? (
                    <span className="inline-flex items-baseline gap-1.5">
                      <bdi className={`text-sm font-bold tabular-nums ${o.state === 'lost' ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{shekels(o.valueAgorot)}</bdi>
                      <span className="text-[10.5px] text-gray-500" dir={dirAuto}>{ui.moneyInclVat}</span>
                    </span>
                  ) : (
                    <span className="text-xs italic text-gray-400" dir={dirAuto}>{ui.moneyNoValue}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}

        {money?.mirroredAt && (
          <div className="mt-1.5 text-[10.5px] text-gray-400" dir={dirAuto}>{ui.moneyAsOf.replace('{when}', when(money.mirroredAt, isRtl))}</div>
        )}
      </div>
    </section>
  );
}
