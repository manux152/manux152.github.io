import { useEffect, useState } from 'react';
import { useLocalSearchParams, Link } from 'expo-router';
import { Screen, H, T, Card, Btn, Input, Chips, Err, Loading } from '../../../components/ui';
import { supabase } from '../../../lib/supabase';
import { useTable } from '../../../lib/useQuery';
import { useApp } from '../../../lib/app-context';
import { motmTally } from '../../../lib/matchday';

/** After full time: draft the match report (AI or plain), and close the Man of the Match vote. */
export default function MatchReport() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { can } = useApp();
  const m = useTable('matches', (q) => q.eq('id', id).select('*, opponents(name), motm:players!matches_motm_player_id_fkey(full_name)'), [id]);
  const squad = useTable('match_players', (q) => q.eq('match_id', id).select('player_id, players(full_name, shirt_number)'), [id]);
  const [report, setReport] = useState(''); const [tone, setTone] = useState('friendly'); const [notes, setNotes] = useState('');
  const [tally, setTally] = useState<Record<string, number>>({});
  const [pick, setPick] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const x: any = m.data[0];
  useEffect(() => { if (x) setReport(x.report ?? ''); }, [x?.id]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (id) motmTally(id).then(setTally); }, [id, m.data]);
  if (!can('matches.manage')) return <Screen><T>No permission.</T></Screen>;
  if (m.loading || squad.loading) return <Loading />;
  if (!x) return <Screen><T muted>Match not found.</T></Screen>;

  const name = (pid: string) => (squad.data as any[]).find((r) => r.player_id === pid)?.players?.full_name ?? 'Unknown';
  const votes = Object.entries(tally).sort((a, b) => b[1] - a[1]);
  const wrap = async (fn: () => Promise<void>) => { setBusy(true); setErr(null); setMsg(null); try { await fn(); } catch (e: any) { setErr(e.message); } setBusy(false); };

  const draft = () => wrap(async () => {
    const { data, error } = await supabase.functions.invoke('match-report', { body: { match_id: id, tone, notes } });
    if (error || data?.error) throw new Error(data?.error ?? error?.message ?? 'Could not draft the report');
    setReport(data.report); setMsg(data.ai ? 'Draft written by AI from your match events. Read it and fix anything before saving.' : 'Draft built from your match events (add an AI key to get nicer wording). Edit before saving.');
  });
  const save = () => wrap(async () => { const { error } = await supabase.from('matches').update({ report: report.trim() || null }).eq('id', id); if (error) throw new Error(error.message); setMsg('Report saved — fans can read it on the match page.'); await m.refresh(); });
  const finalize = (pid?: string) => wrap(async () => { const { error } = await supabase.rpc('motm_finalize', { p_match: id, p_player: pid ?? null }); if (error) throw new Error(error.message); setMsg('Man of the Match saved.'); await m.refresh(); });
  const reopen = () => wrap(async () => { const { error } = await supabase.rpc('motm_reopen', { p_match: id }); if (error) throw new Error(error.message); setMsg('Voting reopened.'); await m.refresh(); });

  return (
    <Screen>
      <H>Report: {x.opponents?.name}</H>
      <T muted>Final score {x.goals_for ?? 0} – {x.goals_against ?? 0}</T>
      {x.status !== 'finished' ? <T muted>This match is not finished yet — finish it from the live console first.</T> : null}
      <Err msg={err} />{msg ? <T>{msg}</T> : null}
      {can('development.manage') ? <Link href={`/admin/ratings/${id}` as any} asChild><Btn title="Rate the players (private to staff)" kind="ghost" onPress={() => {}} /></Link> : null}
      <Card>
        <T style={{ fontWeight: '800' }}>Match report</T>
        <Chips options={[{ value: 'friendly', label: 'Friendly' }, { value: 'professional', label: 'Professional' }, { value: 'enthusiastic', label: 'Enthusiastic' }]} value={tone} onChange={setTone} />
        <Input label="Anything to add? (optional, used as given)" value={notes} onChangeText={setNotes} multiline />
        <Btn title="Draft report" kind="ghost" disabled={busy || x.status !== 'finished'} onPress={draft} />
        <Input label="Report shown to fans" value={report} onChangeText={setReport} multiline numberOfLines={8} />
        <Btn title="Save report" disabled={busy} onPress={save} />
      </Card>
      <Card>
        <T style={{ fontWeight: '800' }}>⭐ Man of the Match</T>
        {x.motm?.full_name ? <><T>Winner: <T style={{ fontWeight: '800' }}>{x.motm.full_name}</T></T><Btn title="Reopen voting" kind="ghost" disabled={busy} onPress={reopen} /></> : (<>
          {votes.length === 0 ? <T muted>No votes yet.</T> : votes.map(([pid, n]) => <T key={pid}>{name(pid)} — {n} vote{n === 1 ? '' : 's'}</T>)}
          <Btn title="Close voting — top vote wins" disabled={busy || votes.length === 0} onPress={() => finalize()} />
          <T muted>Or choose the winner yourself (needed if there is a tie):</T>
          <Chips options={(squad.data as any[]).map((r) => ({ value: r.player_id, label: r.players?.full_name }))} value={pick} onChange={setPick} />
          <Btn title="Set winner" kind="ghost" disabled={busy || !pick} onPress={() => finalize(pick!)} />
        </>)}
      </Card>
    </Screen>
  );
}
