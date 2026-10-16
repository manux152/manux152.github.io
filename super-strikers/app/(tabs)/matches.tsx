import { useEffect, useRef, useState } from 'react';
import { Link } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Screen, H, T, Card, Chips, Loading, Err, fmtDate } from '../../components/ui';
import { useTable } from '../../lib/useQuery';
import { useApp } from '../../lib/app-context';
import { supabase } from '../../lib/supabase';
import { PageHead } from '../../components/PageHead';
import { MatchTeams } from '../../components/MatchTeams';
import { MatchStatus } from '../../components/MatchStatus';
import { autoTick, matchPhase, nextAutoBoundary, useNow } from '../../lib/matchday';

const TABS = [{ value: 'all', label: 'All' }, { value: 'live', label: 'Live' }, { value: 'upcoming', label: 'Upcoming' }, { value: 'results', label: 'Results' }];

/**
 * Fixtures and results, sorted: live matches first (with the running clock and score), then upcoming in date order (with a countdown),
 * then results, newest first. The clock ticks every second and the list follows live changes by itself.
 */
export default function Matches() {
  const { settings } = useApp();
  const { data, loading, error, refresh } = useTable('matches', (q) => q.order('kickoff_at', { ascending: false }).limit(150).select('*, opponents(name)'));
  const [tab, setTab] = useState('all');
  const htMin = Number(settings.half_time_minutes ?? 15) || 15;
  const rows = data as any[];
  const anyRunning = rows.some((m) => ['live', 'ht'].includes(matchPhase(m)) || (m.status === 'scheduled' && new Date(m.kickoff_at).getTime() - Date.now() < 3600e3));
  const now = useNow(anyRunning, 1000);
  const reload = useRef(refresh); reload.current = refresh;
  const lastTick = useRef(0); const rowsRef = useRef(rows); rowsRef.current = rows;

  // follow score / status changes as they happen
  useEffect(() => {
    const ch = supabase.channel(`matches-list-${Math.random().toString(36).slice(2, 7)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, () => { reload.current(); }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);
  // when a kick-off / half time / full time moment passes, nudge the server clock and reload
  useEffect(() => {
    const t = setInterval(async () => {
      const due = rowsRef.current.some((m) => { const b = nextAutoBoundary(m, htMin); return b != null && b + 1500 <= Date.now(); });
      if (due && Date.now() - lastTick.current > 15000) { lastTick.current = Date.now(); await autoTick(); reload.current(); }
    }, 5000);
    return () => clearInterval(t);
  }, [htMin]);

  if (loading) return <Loading />;
  const ts = (m: any) => new Date(m.kickoff_at).getTime();
  const live = rows.filter((m) => ['live', 'ht'].includes(matchPhase(m))).sort((a, b) => ts(a) - ts(b));
  const upcoming = rows.filter((m) => ['scheduled', 'postponed'].includes(matchPhase(m))).sort((a, b) => ts(a) - ts(b));
  const results = rows.filter((m) => ['ft', 'cancelled'].includes(matchPhase(m))).sort((a, b) => ts(b) - ts(a));
  const card = (m: any) => (
    <Link key={m.id} href={`/match/${m.id}`} asChild><Pressable accessibilityRole="link"><Card style={matchPhase(m) === 'live' ? { borderColor: '#D64545', borderWidth: 2 } : undefined}>
      <MatchStatus match={m} now={now} htMinutes={htMin} />
      <MatchTeams match={m} />
      <T muted style={{ textAlign: 'center' }}>{fmtDate(m.kickoff_at)}{m.venue ? ` · ${m.venue}` : ''}{m.competition ? ` · ${m.competition}` : ''}</T>
      {m.report ? <T>{m.report}</T> : null}
    </Card></Pressable></Link>);
  const section = (title: string, list: any[], key: string) => (tab === 'all' || tab === key) && list.length ? (
    <View key={key} style={{ gap: 10 }}><T style={{ fontWeight: '800', fontSize: 16 }}>{title} ({list.length})</T>{list.map(card)}</View>) : null;
  const shown = (tab === 'all' ? rows.length : tab === 'live' ? live.length : tab === 'upcoming' ? upcoming.length : results.length);
  return (
    <Screen><PageHead title="Matches" description="Fixtures, live scores and results." /><H>Matches</H><Err msg={error} />
      <Chips options={TABS} value={tab} onChange={(v: string | null) => setTab(v ?? 'all')} />
      {shown === 0 && <T muted>{tab === 'live' ? 'No match is being played right now.' : tab === 'upcoming' ? 'No upcoming matches.' : tab === 'results' ? 'No results yet.' : 'No matches scheduled.'}</T>}
      {section('🔴 Live now', live, 'live')}
      {section('Upcoming', upcoming, 'upcoming')}
      {section('Results', results, 'results')}
    </Screen>
  );
}
