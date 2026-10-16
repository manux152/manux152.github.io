import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Screen, H, T, Card, Btn, Err, Loading, fmtDate } from '../../../components/ui';
import { supabase } from '../../../lib/supabase';
import { useTable } from '../../../lib/useQuery';
import { useApp } from '../../../lib/app-context';

const OPTS: [string, string, string][] = [['present', 'Present', '#2E9E5B'], ['late', 'Late', '#E0A100'], ['excused', 'Excused', '#2F7FD8'], ['absent', 'Absent', '#D64545']];

export default function SessionAttendance() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { can, session } = useApp();
  const s = useTable('training_sessions', (q) => q.eq('id', id), [id]);
  const players = useTable('players', (q) => q.eq('is_active', true).order('shirt_number'));
  const att = useTable('training_attendance', (q) => q.eq('session_id', id), [id]);
  const ck = useTable('training_checkin', (q) => q.eq('session_id', id), [id]);
  const [err, setErr] = useState<string | null>(null);
  if (!can('training.manage')) return <Screen><T>No permission.</T></Screen>;
  if (s.loading || players.loading || att.loading) return <Loading />;
  const x: any = s.data[0]; const rows = att.data as any[];
  const status = (pid: string) => rows.find((r) => r.player_id === pid)?.status as string | undefined;
  const code: string | undefined = (ck.data[0] as any)?.code;
  const count = (k: string) => rows.filter((r) => r.status === k).length;

  const mark = async (pid: string, st: string) => {
    setErr(null);
    const { error } = await supabase.from('training_attendance').upsert({ session_id: id, player_id: pid, status: st, source: 'coach', marked_by: session?.user.id, marked_at: new Date().toISOString() }, { onConflict: 'session_id,player_id' });
    if (error) setErr(error.message); else await att.refresh();
  };
  const markAll = async (st: string) => {
    const todo = (players.data as any[]).filter((p) => !status(p.id)).map((p) => ({ session_id: id, player_id: p.id, status: st, source: 'coach', marked_by: session?.user.id }));
    if (!todo.length) return;
    const { error } = await supabase.from('training_attendance').upsert(todo, { onConflict: 'session_id,player_id' });
    if (error) setErr(error.message); else await att.refresh();
  };
  const clear = async (pid: string) => { await supabase.from('training_attendance').delete().eq('session_id', id).eq('player_id', pid); await att.refresh(); };
  const open = async () => { setErr(null); const { error } = await supabase.rpc('open_training_checkin', { p_session: id }); if (error) setErr(error.message); await ck.refresh(); await s.refresh(); };
  const close = async () => { await supabase.rpc('close_training_checkin', { p_session: id }); await ck.refresh(); };

  return (
    <Screen>
      <H>{x?.title}</H><T muted>{x ? fmtDate(x.session_date) : ''}</T>
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {OPTS.map(([k, l, c]) => <View key={k} style={{ alignItems: 'center' }}><T style={{ color: c, fontWeight: '700' }}>{l}</T><T style={{ fontWeight: '800', fontSize: 20 }}>{count(k)}</T></View>)}
          <View style={{ alignItems: 'center' }}><T muted>Not marked</T><T style={{ fontWeight: '800', fontSize: 20 }}>{(players.data as any[]).length - rows.length}</T></View>
        </View>
      </Card>
      <Card>
        <T style={{ fontWeight: '800' }}>Self check-in</T>
        {code ? (<>
          <T muted>Read this code out or show it. Players enter it on the Training screen (open from 1 hour before to 4 hours after the start; after 15 minutes they count as late).</T>
          <T style={{ fontSize: 40, fontWeight: '800', letterSpacing: 6, textAlign: 'center' }}>{code}</T>
          <Btn title="Close check-in" kind="ghost" onPress={close} />
        </>) : (<><T muted>Let players mark themselves in with a one-time code. The session becomes visible to the whole team.</T><Btn title="Open check-in" onPress={open} /></>)}
      </Card>
      <Btn title="Mark everyone not yet marked as Present" kind="ghost" onPress={() => markAll('present')} />
      <Err msg={err} />
      {(players.data as any[]).map((p) => {
        const cur = status(p.id); const src = rows.find((r) => r.player_id === p.id)?.source;
        return (
          <Card key={p.id}>
            <T style={{ fontWeight: '700' }}>{p.shirt_number != null ? `#${p.shirt_number} ` : ''}{p.full_name}{src === 'self' ? ' · self check-in' : ''}</T>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {OPTS.map(([k, l, c]) => <View key={k} style={{ flex: 1 }}><Btn title={l} kind={cur === k ? 'primary' : 'ghost'} onPress={() => mark(p.id, k)} /></View>)}
            </View>
            {cur ? <T muted style={{ fontSize: 12, color: OPTS.find((o) => o[0] === cur)?.[2] }} onPress={() => clear(p.id)}>Marked {cur} · tap to clear</T> : null}
          </Card>
        );
      })}
    </Screen>
  );
}
