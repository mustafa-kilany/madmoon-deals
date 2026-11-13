// What is going on (GET /admin/analytics, BACKEND_PLAN B8.8): the period's
// headline numbers against the period before, day-by-day charts, and how the
// marketplace splits up. One period switch scopes the whole page.

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { categoryInfo } from '@/services/mock/filters';
import { api } from './api';
import { AreaChart, ChartCard, ColumnChart, RankedBars, SegmentedBar, type Part, type Point } from './charts';
import type { Analytics } from './types';
import { areaName, Failed, jod, Loading } from './ui';

const PERIODS = [7, 30, 90] as const;

const dayLong = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const dayShort = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const categoryName = (id: string) => categoryInfo.find(c => c.id === id)?.name.en ?? id;
const jodShort = (fils: number) => {
  const value = fils / 1000;
  return value >= 10_000 ? `${new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value)}` : value.toLocaleString('en', { maximumFractionDigits: 0 });
};

export function AnalyticsPage() {
  const [params, setParams] = useSearchParams();
  const days = PERIODS.find(p => String(p) === params.get('days')) ?? 30;
  const { data, isPending, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['analytics', days],
    queryFn: () => api.get<Analytics>(`/admin/analytics?days=${days}`),
    placeholderData: keepPreviousData,
    refetchInterval: 5 * 60_000,
  });

  return (
    <div className="page wide">
      <div className="page-head">
        <h1>Analytics</h1>
        {data && (
          <span className="muted small">
            {dayShort(data.from)} – {dayShort(data.to)} · days in Jordan time
          </span>
        )}
      </div>
      <div className="tabs" role="tablist" aria-label="Period">
        {PERIODS.map(p => (
          <button
            key={p}
            role="tab"
            aria-selected={days === p}
            className={`tab${days === p ? ' active' : ''}`}
            onClick={() => setParams(p === 30 ? {} : { days: String(p) })}
          >
            Last {p} days
          </button>
        ))}
      </div>

      {isPending ? (
        <Loading />
      ) : isError ? (
        <Failed error={error} retry={refetch} />
      ) : (
        <div className={isFetching ? 'refetching' : undefined}>
          <Headline data={data} />
          <Charts data={data} />
        </div>
      )}
    </div>
  );
}

/** The period's totals, each against the period before. Up is good except for reports. */
function Headline({ data }: { data: Analytics }) {
  const tiles: { label: string; key: keyof Analytics['totals']; format: (n: number) => string; upIsGood: boolean }[] = [
    { label: 'New customers', key: 'signups', format: n => n.toLocaleString('en'), upIsGood: true },
    { label: 'New listings', key: 'listings', format: n => n.toLocaleString('en'), upIsGood: true },
    { label: 'Paid orders', key: 'paidOrders', format: n => n.toLocaleString('en'), upIsGood: true },
    { label: 'Sales value', key: 'salesFils', format: jod, upIsGood: true },
    { label: 'Reports received', key: 'reports', format: n => n.toLocaleString('en'), upIsGood: false },
  ];
  return (
    <div className="tiles kpis">
      {tiles.map(t => {
        const now = data.totals[t.key];
        const before = data.previous[t.key];
        const change = now - before;
        const pct = before ? Math.round((change / before) * 100) : null;
        const good = change === 0 ? null : change > 0 === t.upIsGood;
        return (
          <div key={t.key} className="card tile">
            <span className="tile-label">{t.label}</span>
            <span className="tile-value">{t.format(now)}</span>
            <span className={`delta small${good === true ? ' good' : good === false ? ' bad' : ''}`}>
              {change === 0 ? (
                'Same as the period before'
              ) : (
                <>
                  <span aria-hidden="true">{change > 0 ? '▲' : '▼'}</span>{' '}
                  {pct === null ? (
                    <span className="muted">up from none the {data.days} days before</span>
                  ) : (
                    <>
                      {change > 0 ? 'up' : 'down'} {Math.abs(pct)}% <span className="muted">from {t.format(before)} the {data.days} days before</span>
                    </>
                  )}
                </>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Charts({ data }: { data: Analytics }) {
  const series = (key: keyof Analytics['daily'][number]): Point[] =>
    data.daily.map(d => ({ label: dayLong(d.day), value: Number(d[key]) }));
  const axis = (i: number) => dayShort(data.daily[i]!.day);
  const dailyTable = (head: string, key: keyof Analytics['daily'][number], format = (n: number) => n.toLocaleString('en')) => ({
    head: ['Day', head],
    rows: [...data.daily].reverse().map(d => [dayLong(d.day), format(Number(d[key]))]),
  });

  const statusParts: Part[] = [
    { label: 'Delivered', value: data.ordersByStatus.completed, slot: 1 },
    { label: 'Paid, not delivered yet', value: data.ordersByStatus.escrow_held, slot: 2 },
    { label: 'Refunded or cancelled', value: data.ordersByStatus.refunded + (data.ordersByStatus.cancelled ?? 0), slot: 3 },
    { label: 'Not paid (yet)', value: data.ordersByStatus.awaiting_payment, slot: 4 },
  ];
  const signInParts: Part[] = [
    { label: 'Email', value: data.customersBySignIn.email, slot: 1 },
    { label: 'Google', value: data.customersBySignIn.google, slot: 2 },
    { label: 'Apple', value: data.customersBySignIn.apple, slot: 3 },
  ];
  const partTable = (parts: Part[]) => {
    const total = parts.reduce((s, p) => s + p.value, 0);
    return { head: ['', 'Count', 'Share'], rows: parts.map(p => [p.label, p.value.toLocaleString('en'), total ? `${Math.round((p.value / total) * 100)}%` : '—']) };
  };
  const categories = data.listingsByCategory.map(c => ({ label: categoryName(c.category), value: c.count }));
  const areas = data.listingsByArea.map(a => ({ label: areaName(a.areaId), value: a.count }));

  return (
    <div className="viz-grid">
      <ChartCard
        wide
        title="Sales value per day"
        subtitle="Orders paid that day, in JOD (item, buyer protection and delivery; later refunds included)"
        table={dailyTable('Sales', 'salesFils', jod)}
      >
        <AreaChart
          data={series('salesFils')}
          format={jod}
          tickFormat={jodShort}
          axisLabel={axis}
          description={`Sales value per day over the last ${data.days} days: ${jod(data.totals.salesFils)} in total.`}
        />
      </ChartCard>
      <ChartCard title="Paid orders per day" table={dailyTable('Paid orders', 'paidOrders')}>
        <ColumnChart data={series('paidOrders')} axisLabel={axis} description={`Paid orders per day: ${data.totals.paidOrders} in total.`} />
      </ChartCard>
      <ChartCard title="New customers per day" subtitle="Sign-ups (staff accounts not counted)" table={dailyTable('New customers', 'signups')}>
        <ColumnChart data={series('signups')} axisLabel={axis} description={`New customers per day: ${data.totals.signups} in total.`} />
      </ChartCard>
      <ChartCard title="New listings per day" subtitle="By people (brand stores’ sheets not counted)" table={dailyTable('New listings', 'listings')}>
        <ColumnChart data={series('listings')} axisLabel={axis} description={`New listings per day: ${data.totals.listings} in total.`} />
      </ChartCard>
      <ChartCard title="Reports received per day" subtitle="About listings and accounts" table={dailyTable('Reports', 'reports')}>
        <ColumnChart data={series('reports')} axisLabel={axis} description={`Reports per day: ${data.totals.reports} in total.`} />
      </ChartCard>
      <ChartCard title="Orders by status" subtitle={`Orders started in the last ${data.days} days, by where they are now`} table={partTable(statusParts)}>
        <SegmentedBar parts={statusParts} unit="orders" description="Orders started in the period by status." />
      </ChartCard>
      <ChartCard title="Customers by sign-in" subtitle="All customers, now" table={partTable(signInParts)}>
        <SegmentedBar parts={signInParts} unit="customers" description="All customers by how they sign in." />
      </ChartCard>
      <ChartCard
        title="On sale by category"
        subtitle="Listings on sale now"
        table={{ head: ['Category', 'Listings'], rows: categories.map(c => [c.label, c.value]) }}
      >
        <RankedBars data={categories} description="Listings on sale now, by category, largest first." />
      </ChartCard>
      <ChartCard
        title="On sale by area"
        subtitle="Listings on sale now, the busiest areas"
        table={{ head: ['Area', 'Listings'], rows: areas.map(a => [a.label, a.value]) }}
      >
        <RankedBars data={areas} description="Listings on sale now, by area, largest first." />
      </ChartCard>
    </div>
  );
}
