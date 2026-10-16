import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Screen, H, T, Card, Btn, Chips, Err, Loading, fmtDate } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { useApp } from '../../lib/app-context';

type Q = { id: string; news_title: string; author_id: string | null; author_name: string; body: string; status: string; created_at: string; reports: number; banned: boolean };
const TABS = [{ value: 'pending', label: 'Waiting' }, { value: 'reported', label: 'Reported' }, { value: 'hidden', label: 'Hidden' }, { value: 'all', label: 'Recent' }];
const MODES = [{ value: 'open', label: 'Open' }, { value: 'approval', label: 'Approve first' }, { value: 'off', label: 'Off' }];

/** Admin → Comments: approve, hide or remove comments, and stop people from commenting. */
export default function AdminComments() {
  const { can, session, settings } = useApp();
  const [tab, setTab] = useState('pending'); const [rows, setRows] = useState<Q[] | null>(null);
  const [mode, setMode] = useState(typeof settings.comments_mode === 'string' ? settings.comments_mode : 'open');
  const [err, setErr] = useState<string | null>(null); const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(async () => { setRows(null); const { data, error } = await supabase.rpc('comment_queue', { p_kind: tab }); if (error) setErr(error.message); setRows((data ?? []) as Q[]); }, [tab]);
  useEffect(() => { load(); }, [load]);
  if (!can('comments.moderate')) return <Screen><T>No permission.</T></Screen>;
  const act = async (id: string, action: string) => { setErr(null); const { error } = await supabase.rpc('comment_moderate', { p_id: id, p_action: action }); if (error) setErr(error.message); await load(); };
  const ban = async (r: Q) => { if (!r.author_id) return; setErr(null); const { error } = await supabase.from('comment_bans').upsert({ user_id: r.author_id, reason: 'Moderator decision', banned_by: session?.user.id ?? null }, { onConflict: 'user_id' }); if (error) setErr(error.message); else { await supabase.rpc('comment_moderate', { p_id: r.id, p_action: 'hide' }); setMsg(`${r.author_name} can no longer comment.`); } await load(); };
  const unban = async (r: Q) => { if (!r.author_id) return; const { error } = await supabase.from('comment_bans').delete().eq('user_id', r.author_id); if (error) setErr(error.message); else setMsg(`${r.author_name} can comment again.`); await load(); };
  const saveMode = async (v: string) => { setMode(v); setErr(null); const { error } = await supabase.from('site_settings').upsert({ key: 'comments_mode', value: v }, { onConflict: 'key' }); if (error) setErr(error.message); else setMsg('Saved.'); };
  return (
    <Screen>
      <H>Comments</H>
      {can('settings.manage') ? <Card><T style={{ fontWeight: '700' }}>Who sees new comments?</T><Chips options={MODES} value={mode} onChange={saveMode} />
        <T muted style={{ fontSize: 13 }}>“Approve first” holds every member's comment until you approve it (staff comments go straight up). Comments never allow links, are limited to 10 an hour per person, and three reports hide a comment until you review it. If your club has young members, consider “Approve first” and tell parents how comments work. You can also turn comments off for a single story in the news editor.</T></Card> : null}
      <Chips options={TABS} value={tab} onChange={setTab} />
      <Err msg={err} />{msg ? <T>{msg}</T> : null}
      {rows === null ? <Loading /> : rows.length === 0 ? <T muted>Nothing here. 🎉</T> : rows.map((r) => (
        <Card key={r.id}>
          <T style={{ fontWeight: '700' }}>{r.author_name}{r.banned ? ' (blocked)' : ''} · <T muted>{r.news_title}</T></T>
          <T>{r.body}</T>
          <T muted style={{ fontSize: 12 }}>{fmtDate(r.created_at)} · {r.status}{r.reports ? ` · ${r.reports} report${r.reports === 1 ? '' : 's'}` : ''}</T>
          <View style={{ gap: 8 }}>
            {r.status !== 'visible' ? <Btn title={r.status === 'pending' ? 'Approve' : 'Show again'} onPress={() => act(r.id, 'approve')} /> : <Btn title="Hide" kind="ghost" onPress={() => act(r.id, 'hide')} />}
            {r.status === 'pending' ? <Btn title="Hide" kind="ghost" onPress={() => act(r.id, 'hide')} /> : null}
            <Btn title="Delete for good" kind="danger" onPress={() => act(r.id, 'delete')} />
            {r.author_id ? (r.banned ? <Btn title="Let them comment again" kind="ghost" onPress={() => unban(r)} /> : <Btn title="Stop this person commenting" kind="danger" onPress={() => ban(r)} />) : null}
          </View>
        </Card>))}
    </Screen>
  );
}
