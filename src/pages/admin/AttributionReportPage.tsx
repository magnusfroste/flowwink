import { useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageContainer } from '@/components/admin/AdminPageContainer';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAttributionReport } from '@/hooks/useAttributionReport';

function formatCents(cents: number, currency = 'SEK') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(cents / 100);
}

export default function AttributionReportPage() {
  const [days, setDays] = useState(30);
  const { data = [], isLoading } = useAttributionReport(days);

  const totals = data.reduce(
    (acc, r) => ({
      visits: acc.visits + Number(r.visits),
      leads: acc.leads + Number(r.leads),
      orders: acc.orders + Number(r.orders),
      revenue: acc.revenue + Number(r.revenue_cents),
    }),
    { visits: 0, leads: 0, orders: 0, revenue: 0 },
  );

  return (
    <AdminLayout>
      <AdminPageContainer>
        <AdminPageHeader
          title="Attribution report"
          description="Conversions attributed by UTM source, medium, and campaign."
        >
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
        </AdminPageHeader>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-4">
          <SummaryCard label="Visits" value={totals.visits.toLocaleString()} />
          <SummaryCard label="Leads" value={totals.leads.toLocaleString()} />
          <SummaryCard label="Orders" value={totals.orders.toLocaleString()} />
          <SummaryCard label="Revenue" value={formatCents(totals.revenue)} />
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40">
                  <tr className="text-left text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Source</th>
                    <th className="px-4 py-2 font-medium">Medium</th>
                    <th className="px-4 py-2 font-medium">Campaign</th>
                    <th className="px-4 py-2 font-medium text-right">Visits</th>
                    <th className="px-4 py-2 font-medium text-right">Uniques</th>
                    <th className="px-4 py-2 font-medium text-right">Leads</th>
                    <th className="px-4 py-2 font-medium text-right">Orders</th>
                    <th className="px-4 py-2 font-medium text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading && (
                    <tr>
                      <td className="px-4 py-6 text-center text-muted-foreground" colSpan={8}>
                        Loading…
                      </td>
                    </tr>
                  )}
                  {!isLoading && data.length === 0 && (
                    <tr>
                      <td className="px-4 py-6 text-center text-muted-foreground" colSpan={8}>
                        No attributed traffic yet. Add <code>?utm_source=…&amp;utm_campaign=…</code> to
                        campaign links to start populating this report.
                      </td>
                    </tr>
                  )}
                  {data.map((r, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="px-4 py-2">{r.utm_source}</td>
                      <td className="px-4 py-2">{r.utm_medium}</td>
                      <td className="px-4 py-2">{r.utm_campaign}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{Number(r.visits).toLocaleString()}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{Number(r.unique_visitors).toLocaleString()}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{Number(r.leads).toLocaleString()}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{Number(r.orders).toLocaleString()}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{formatCents(Number(r.revenue_cents))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </AdminPageContainer>
    </AdminLayout>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold mt-1 tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}
