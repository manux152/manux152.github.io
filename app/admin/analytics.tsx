import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Screen, H, T, Card, Chips, Err, Loading, useColor } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { useApp } from '../../lib/app-context';
import { money } from '../../lib/money';

type Rep = { days: number; views: number; visitors: number; signups: number; orders: number; revenue: number; daily: { day: string; views: number; visitors: number; signups: number }[]; top_pages: { path: string; views: number }[] };

function Bars({ rows, pick, label }: { rows: Rep['daily']; pick: (r: Rep['daily'][number]) => number; label: string }) {
  const c = useColor(); const max = Math.max(1, ...rows.map(pick)); const total = rows.reduce((a, r) => a + pick(r), 0);
  return (
    <Card>
      <T style={{ fontWeight: '800' }}>{label} <T muted>· {total} in total</T></T>
      <View accessible accessibilityLabel={`${label} per day, ${total} in total`} style={{ flexDirection: 'row', alignItems: 'flex-end', height: 70, gap: rows.length > 60 ? 0 : 2 }}>
        {rows.map((r) => <View key={r.day} style={{ flex: 1, height: Math.max(2, (pick(r) / max) * 70), backgroundColor: pick(r) ? c : '#E6E8EC', borderRadius: 2 }} />)}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><T muted style={{ fontSize: 12 }}>{rows[0]?.day}</T><T muted style={{ fontSize: 12 }}>{rows[rows.length - 1]?.day}</T></View>
    </Card>
  );
}

/** Admin → Analytics: anonymous visits, sign-ups and shop sales. */
export default function Analytics() {
  const { can, settings } = useApp(); const [days, setDays] = useState('30'); const [rep, setRep] = useState<Rep | null>(null); const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => { setRep(null); const { data, error } = await supabase.rpc('analytics_report', { p_days: Number(days) }); if (error) setErr(error.message); else setRep(data as Rep); }, [days]);
  useEffect(() => { load(); }, [load]);
  if (!(can('reports.view') || can('settings.manage'))) return <Screen><T>No permission.</T></Screen>;
  const cur = typeof settings.currency === 'string' ? settings.currency : 'USD';
  return (
    <Screen>
      <H>Analytics</H>
      <T muted>Page counts are anonymous: only the page name is recorded, never who looked at it. A “visit” is one person-day. Members can switch counting off in Settings, browsers that ask not to be tracked are skipped, and personal pages (profile, orders, family, chat, admin) are never counted. Counts are a guide, not an exact figure.</T>
      {settings.analytics_enabled === false ? <T muted>Counting is switched off (site setting “analytics_enabled”).</T> : null}
      <Chips options={[{ value: '7', label: '7 days' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }, { value: '365', label: 'Year' }]} value={days} onChange={(v) => v && setDays(v)} />
      <Err msg={err} />
      {!rep ? <Loading /> : (<>
        <Card>
          <T style={{ fontWeight: '800', fontSize: 20 }}>{rep.views.toLocaleString()} page views</T>
          <T>{rep.visitors.toLocaleString()} visits · {rep.signups} new accounts · {rep.orders} paid order{rep.orders === 1 ? '' : 's'} ({money(rep.revenue, cur)})</T>
        </Card>
        <Bars rows={rep.daily} pick={(r) => r.views} label="Page views" />
        <Bars rows={rep.daily} pick={(r) => r.visitors} label="Visits" />
        <Bars rows={rep.daily} pick={(r) => r.signups} label="New accounts" />
        <H>Most viewed pages</H>
        {rep.top_pages.length === 0 ? <T muted>Nothing counted yet.</T> : rep.top_pages.map((p) => <Card key={p.path} style={{ flexDirection: 'row', justifyContent: 'space-between' }}><T>{p.path}</T><T style={{ fontWeight: '800' }}>{p.views}</T></Card>)}
      </>)}
    </Screen>
  );
}
