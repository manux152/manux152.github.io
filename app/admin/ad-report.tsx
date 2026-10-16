import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Screen, H, T, Card, Btn, Chips, Err, Loading } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { useApp } from '../../lib/app-context';
import { shareText } from '../../lib/share';

type Stat = { ad_id: string; placement: string; views: number; clicks: number };
const PLACE: Record<string, string> = { home: 'Home page', news: 'News stories', match: 'Match pages', shop: 'Shop', footer: 'Website footer' };
const pct = (c: number, v: number) => (v > 0 ? `${((c / v) * 100).toFixed(1)}%` : '–');

/** Admin → Ad report: views, clicks and click rate for every ad and place, with a summary you can send to the advertiser. */
export default function AdReport() {
  const router = useRouter(); const { can, settings } = useApp(); const team = typeof settings.team_name === 'string' ? settings.team_name : 'the club';
  const [days, setDays] = useState('30'); const [ads, setAds] = useState<any[] | null>(null); const [stats, setStats] = useState<Stat[]>([]);
  const [err, setErr] = useState<string | null>(null); const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(async () => {
    const since = new Date(Date.now() - Number(days) * 86400000).toISOString().slice(0, 10);
    const [a, s] = await Promise.all([supabase.from('ads').select('id,title,advertiser,is_active,ends_at,max_impressions').order('created_at', { ascending: false }), supabase.from('ad_stats').select('ad_id,placement,views,clicks').gte('day', since)]);
    if (a.error || s.error) setErr((a.error ?? s.error)!.message);
    setAds(a.data ?? []); setStats((s.data ?? []) as Stat[]);
  }, [days]);
  useEffect(() => { load(); }, [load]);
  if (!can('settings.manage')) return <Screen><T>No permission.</T></Screen>;
  if (ads === null) return <Loading />;
  const sum = (rows: Stat[]) => ({ v: rows.reduce((x, r) => x + Number(r.views), 0), c: rows.reduce((x, r) => x + Number(r.clicks), 0) });
  const total = sum(stats);
  const summary = (a: any) => { const rs = stats.filter((r) => r.ad_id === a.id); const t = sum(rs);
    return [`${team} — ${a.advertiser || a.title}: last ${days} days`, `Seen ${t.v} time${t.v === 1 ? '' : 's'} · ${t.c} click${t.c === 1 ? '' : 's'} (${pct(t.c, t.v)})`, ...rs.map((r) => `${PLACE[r.placement]}: ${r.views} views, ${r.clicks} clicks`)].join('\n'); };
  return (
    <Screen>
      <H>Ad report</H>
      <Chips options={[{ value: '7', label: '7 days' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }]} value={days} onChange={setDays} />
      <Card><T style={{ fontWeight: '800' }}>All ads · last {days} days</T><T>{total.v} views · {total.c} clicks · {pct(total.c, total.v)} click rate</T></Card>
      {ads.length === 0 ? <T muted>No ads yet. Add one under Ads.</T> : null}
      {ads.map((a) => { const rs = stats.filter((r) => r.ad_id === a.id); const t = sum(rs); return (
        <Card key={a.id}>
          <T style={{ fontWeight: '800' }}>{a.title}{a.advertiser ? ` · ${a.advertiser}` : ''}{a.is_active ? '' : ' (off)'}</T>
          <T>{t.v} views · {t.c} clicks · {pct(t.c, t.v)}</T>
          {rs.length ? Object.keys(PLACE).filter((p) => rs.some((r) => r.placement === p)).map((p) => { const x = sum(rs.filter((r) => r.placement === p)); return <T key={p} muted style={{ fontSize: 13 }}>{PLACE[p]}: {x.v} views, {x.c} clicks</T>; }) : <T muted style={{ fontSize: 13 }}>No views yet in this period.</T>}
          <Btn title="Share summary with advertiser" kind="ghost" onPress={async () => setMsg(await shareText(summary(a)))} />
        </Card>); })}
      <Err msg={err} />{msg ? <T muted>{msg}</T> : null}
      <Btn title="Manage ads" onPress={() => router.push('/admin/manage/ads' as any)} />
    </Screen>
  );
}
