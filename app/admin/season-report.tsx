import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { Screen, H, T, Card, Btn, Chips, Input, Loading, Err } from '../../components/ui';
import { ReportPublic, publicSummary } from '../../components/ReportPublic';
import { BarList } from '../../components/BarList';
import { supabase } from '../../lib/supabase';
import { useTable } from '../../lib/useQuery';
import { useApp } from '../../lib/app-context';
import { money } from '../../lib/money';
import { shareText, copyText } from '../../lib/share';
import { DateTimeField } from '../../components/DateTimeField';

const csvCell = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;

export default function SeasonReport() {
  const { can, settings } = useApp();
  const seasons = useTable('seasons', (q) => q.order('starts_on', { ascending: false }));
  const [sel, setSel] = useState<string>('current'); const [cFrom, setCFrom] = useState(''); const [cTo, setCTo] = useState('');
  const [pub, setPub] = useState<any | null>(null); const [priv, setPriv] = useState<any | null>(null);
  const [err, setErr] = useState<string | null>(null); const [msg, setMsg] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const list = seasons.data as any[];
  const season = sel === 'custom' ? null : list.find((s) => s.id === sel) ?? list.find((s) => s.is_current) ?? list[0];
  const from = sel === 'custom' ? cFrom : season?.starts_on; const to = sel === 'custom' ? cTo : season?.ends_on;
  const name = sel === 'custom' ? `${cFrom} to ${cTo}` : season?.name ?? 'Report';
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(from ?? '') && /^\d{4}-\d{2}-\d{2}$/.test(to ?? '');

  useEffect(() => {
    if (seasons.loading || !valid) return;
    setBusy(true); setErr(null); setPub(null); setPriv(null);
    Promise.all([supabase.rpc('season_report_public', { p_from: from, p_to: to }), supabase.rpc('season_report_private', { p_from: from, p_to: to })])
      .then(([a, b]) => { if (a.error || b.error) setErr((a.error ?? b.error)!.message); else { setPub(a.data); setPriv(b.data); } setBusy(false); });
  }, [from, to, seasons.loading]); // eslint-disable-line
  if (!can('reports.view')) return <Screen><T>No permission.</T></Screen>;
  if (seasons.loading) return <Loading />;

  const shop = priv?.shop; const cur = shop?.currency ?? settings.currency ?? 'USD';
  const text = () => !pub ? '' : [publicSummary(name, settings.team_name ?? '', pub),
    `Training: ${priv.sessions} sessions, average attendance ${priv.avg_attendance}%`,
    `Shop: ${shop.orders} paid orders, ${shop.units} items, revenue ${money(shop.revenue, cur)}${shop.top_products?.length ? `, best seller ${shop.top_products[0].name}` : ''}`].join('\n');
  const attCsv = () => ['Player,Jersey,Present,Late,Excused,Absent,Attendance %', ...(priv.attendance ?? []).map((a: any) => [csvCell(a.full_name), a.shirt_number ?? '', a.present, a.late, a.excused, a.absent, a.pct].join(','))].join('\n');
  const salesCsv = () => ['Product,Units,Revenue', ...(shop.top_products ?? []).map((p: any) => [csvCell(p.name), p.units, p.revenue].join(',')), '', 'Month,Orders,Revenue', ...(shop.monthly ?? []).map((m: any) => [m.month, m.orders, m.revenue].join(','))].join('\n');

  return (
    <Screen>
      <H>Season report</H>
      <Chips options={[...list.map((s) => ({ value: s.id, label: s.name })), { value: 'custom', label: 'Custom dates' }]} value={sel === 'current' ? season?.id ?? null : sel} onChange={(v) => v && setSel(v)} />
      {sel === 'custom' && <Card><DateTimeField mode="date" label="From" value={cFrom || null} onChange={(v) => setCFrom(v ?? '')} /><DateTimeField mode="date" label="To" value={cTo || null} onChange={(v) => setCTo(v ?? '')} /></Card>}
      <T muted>{name}{valid ? ` · ${from} to ${to}` : ''}. Manage seasons under Admin → Seasons.</T>
      <Err msg={err} />
      {busy ? <Loading /> : null}
      {pub && priv && (<>
        <ReportPublic d={pub} />
        <Card>
          <T style={{ fontWeight: '800', fontSize: 17 }}>Training attendance 🏃 (private)</T>
          <T muted>{priv.sessions} session(s) · average attendance {priv.avg_attendance}%</T>
          {priv.sessions === 0 ? <T muted>No training sessions in this period.</T>
            : <BarList suffix="%" color="#2F7FD8" rows={(priv.attendance ?? []).map((a: any) => ({ label: a.full_name, value: Number(a.pct), sub: `Present ${a.present} · Late ${a.late} · Excused ${a.excused} · Absent ${a.absent}` }))} />}
        </Card>
        <Card>
          <T style={{ fontWeight: '800', fontSize: 17 }}>Shop sales 🛍️ (private)</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 }}>
            {[['Revenue', money(shop.revenue, cur)], ['Paid orders', shop.orders], ['Items sold', shop.units], ['Avg order', shop.orders ? money(Number(shop.revenue) / shop.orders, cur) : '—']].map(([k, v]) => (
              <View key={String(k)}><T muted>{k}</T><T style={{ fontWeight: '800', fontSize: 20 }}>{v}</T></View>))}
          </View>
          <T muted>Products {money(shop.products_revenue, cur)} · delivery fees {money(shop.delivery_fees, cur)} · unpaid/pending {money(shop.outstanding, cur)} · cancelled {shop.cancelled} · refunded {shop.refunded}</T>
          {shop.top_products?.length ? <><T style={{ fontWeight: '700' }}>Best sellers</T><BarList color="#E0A100" rows={shop.top_products.map((p: any) => ({ label: p.name, value: Number(p.units), sub: `${money(p.revenue, cur)}` }))} suffix=" sold" /></> : <T muted>No paid orders in this period.</T>}
          {shop.monthly?.length ? <><T style={{ fontWeight: '700' }}>By month</T><BarList color="#2E9E5B" rows={shop.monthly.map((m: any) => ({ label: m.month, value: Math.round(Number(m.revenue)), sub: `${m.orders} order(s)` }))} /></> : null}
          {shop.by_method?.length ? <T muted>By method: {shop.by_method.map((m: any) => `${m.method} ${m.orders} (${money(m.revenue, cur)})`).join(' · ')}</T> : null}
          <T muted style={{ fontSize: 12 }}>Counts orders marked paid, excluding cancelled and fully refunded ones. Partial refunds are not deducted.</T>
        </Card>
        {msg ? <T>{msg}</T> : null}
        <Btn title="Share text summary" onPress={async () => setMsg(await shareText(text()))} />
        <Btn title="Copy attendance CSV" kind="ghost" onPress={async () => setMsg(await copyText(attCsv()))} />
        <Btn title="Copy shop sales CSV" kind="ghost" onPress={async () => setMsg(await copyText(salesCsv()))} />
        {Platform.OS === 'web' && <Btn title="Print / save as PDF" kind="ghost" onPress={() => (globalThis as any).print()} />}
      </>)}
    </Screen>
  );
}
