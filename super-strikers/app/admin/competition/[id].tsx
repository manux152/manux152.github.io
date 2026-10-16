import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Screen, H, T, Card, Btn, Input, Err, Loading } from '../../../components/ui';
import { StandingsTable } from '../../../components/StandingsTable';
import { supabase } from '../../../lib/supabase';
import { useTable } from '../../../lib/useQuery';
import { useApp } from '../../../lib/app-context';

const SAMPLE = 'Pos,Team,P,W,D,L,GF,GA,Pts\n1,Super Strikers,5,4,1,0,12,3,13\n2,Rovers FC,5,3,1,1,9,5,10';

export default function CompetitionAdmin() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { can, settings } = useApp();
  const comp = useTable('competitions', (q) => q.eq('id', id), [id]);
  const rows = useTable('standings_rows', (q) => q.eq('competition_id', id).order('position'), [id]);
  const [csv, setCsv] = useState('');
  const [msg, setMsg] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  if (!can('competitions.manage')) return <Screen><T>No permission.</T></Screen>;
  if (comp.loading) return <Loading />;
  const c: any = comp.data[0];
  if (!c) return <Screen><T muted>Competition not found.</T></Screen>;

  const sync = async () => {
    setErr(null); setMsg(null); setBusy(true);
    const { data, error } = await supabase.functions.invoke('sync-standings', { body: { competition_id: id } });
    setBusy(false);
    const e = data?.results?.[0]?.error ?? data?.error ?? error?.message;
    if (e) setErr(e); else setMsg(`Synced ${data.results[0].rows} teams.`);
    await comp.refresh(); await rows.refresh();
  };
  const importCsv = async () => {
    setErr(null); setMsg(null);
    const own = String(c.config?.own_team_name ?? settings.team_name ?? '').toLowerCase();
    const parsed = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => l.split(/[,\t]/).map((x) => x.trim()))
      .filter((p) => /^\d+$/.test(p[0]));
    if (!parsed.length) return setErr('No data rows found. Each row: Pos,Team,P,W,D,L,GF,GA,Pts');
    const bad = parsed.find((p) => p.length < 9); if (bad) return setErr(`Row "${bad.join(',')}" needs 9 columns.`);
    const data = parsed.map((p) => ({
      competition_id: id, position: +p[0], team_name: p[1], played: +p[2] || 0, won: +p[3] || 0, drawn: +p[4] || 0, lost: +p[5] || 0,
      goals_for: +p[6] || 0, goals_against: +p[7] || 0, goal_diff: (+p[6] || 0) - (+p[7] || 0), points: +p[8] || 0, is_own_team: p[1].toLowerCase() === own }));
    setBusy(true);
    const del = await supabase.from('standings_rows').delete().eq('competition_id', id);
    const ins = del.error ? del : await supabase.from('standings_rows').insert(data);
    if (!ins.error) await supabase.from('competitions').update({ last_synced_at: new Date().toISOString(), sync_error: null }).eq('id', id);
    setBusy(false);
    if (ins.error) return setErr(ins.error.message);
    setMsg(`Imported ${data.length} teams.`); setCsv(''); await rows.refresh(); await comp.refresh();
  };
  const clear = async () => { await supabase.from('standings_rows').delete().eq('competition_id', id); await rows.refresh(); };

  return (
    <Screen>
      <H>{c.name}</H>
      <T muted>{c.source === 'api' ? 'Pulled from a league API' : 'Entered manually'}{c.last_synced_at ? ` · updated ${new Date(c.last_synced_at).toLocaleString()}` : ''}</T>
      {c.sync_error ? <Err msg={`Last sync failed: ${c.sync_error}`} /> : null}
      {c.source === 'api' ? (
        <Card><T>Fetches the latest table from the provider and replaces the rows below. Edit the competition to change league, season or provider.</T>
          <Btn title={busy ? 'Syncing…' : 'Sync now'} onPress={sync} disabled={busy} /></Card>
      ) : (
        <Card><T style={{ fontWeight: '700' }}>Paste the table (replaces all rows)</T>
          <T muted>One team per line: Pos,Team,P,W,D,L,GF,GA,Pts. A header line is ignored. You can paste straight from a spreadsheet.</T>
          <Input multiline value={csv} onChangeText={setCsv} placeholder={SAMPLE} autoCapitalize="none" style={{ minHeight: 120 }} />
          <Btn title="Import table" onPress={importCsv} disabled={busy} /></Card>
      )}
      <Err msg={err} />{msg ? <T>{msg}</T> : null}
      <H>Current table</H>
      {rows.data.length ? <Card><StandingsTable rows={rows.data as any[]} /></Card> : <T muted>No rows yet.</T>}
      {rows.data.length > 0 && <Btn title="Clear table" kind="danger" onPress={clear} />}
    </Screen>
  );
}
