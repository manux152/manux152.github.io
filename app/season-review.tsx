import { useEffect, useState } from 'react';
import { Screen, H, T, Card, Btn, Chips, Loading, Err } from '../components/ui';
import { ReportPublic, publicSummary } from '../components/ReportPublic';
import { PageHead } from '../components/PageHead';
import { supabase } from '../lib/supabase';
import { useTable } from '../lib/useQuery';
import { useApp } from '../lib/app-context';
import { shareText } from '../lib/share';

const iso = (d: Date) => d.toISOString().slice(0, 10);

// Public "season in review": results, scorers, assists, appearances, discipline and awards (no private data).
export default function SeasonReview() {
  const { settings } = useApp();
  const seasons = useTable('seasons', (q) => q.order('starts_on', { ascending: false }));
  const [sel, setSel] = useState<string | null>(null);
  const [d, setD] = useState<any | null>(null); const [err, setErr] = useState<string | null>(null); const [msg, setMsg] = useState<string | null>(null);
  const list = seasons.data as any[];
  const season = list.find((s) => s.id === sel) ?? list.find((s) => s.is_current) ?? list[0];
  const from = season?.starts_on ?? iso(new Date(Date.now() - 365 * 864e5)); const to = season?.ends_on ?? iso(new Date());
  const name = season?.name ?? 'Last 12 months';

  useEffect(() => {
    if (seasons.loading) return;
    setD(null); setErr(null);
    supabase.rpc('season_report_public', { p_from: from, p_to: to }).then(({ data, error }) => { if (error) setErr(error.message); else setD(data); });
  }, [from, to, seasons.loading]);
  if (seasons.loading) return <Loading />;

  return (
    <Screen><PageHead title="Season review" description={`${settings.team_name} — results, top scorers and awards`} />
      <H>Season review</H>
      {list.length > 1 && <Chips options={list.map((s) => ({ value: s.id, label: s.name }))} value={season?.id ?? null} onChange={(v) => v && setSel(v)} />}
      <T muted>{name} · {from} to {to}</T>
      <Err msg={err} />
      {!d && !err ? <Loading /> : d ? <ReportPublic d={d} /> : null}
      {d ? <><Btn title="Share this summary" kind="ghost" onPress={async () => setMsg(await shareText(publicSummary(name, settings.team_name ?? '', d)))} />{msg ? <T>{msg}</T> : null}</> : null}
    </Screen>
  );
}
