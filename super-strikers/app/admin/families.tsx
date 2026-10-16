import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Screen, H, T, Card, Btn, Chips, Toggle, Err, Loading, Avatar } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { useApp } from '../../lib/app-context';
import { shareText } from '../../lib/share';

type Row = { player_id: string; name: string; photo_url: string | null; requires_guardian: boolean; guardians: { guardian_id: string; name: string; relationship: string }[]; missing_forms: number };
const REL = [{ value: 'parent', label: 'Parent' }, { value: 'guardian', label: 'Guardian' }, { value: 'carer', label: 'Carer' }, { value: 'other', label: 'Other' }];

/** Admin → Families: who looks after which player, one-time link codes, and who needs a guardian to sign for them. */
export default function Families() {
  const { can, settings } = useApp();
  const [rows, setRows] = useState<Row[] | null>(null); const [rel, setRel] = useState('parent'); const [codes, setCodes] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<'all' | 'minors' | 'missing'>('all'); const [err, setErr] = useState<string | null>(null); const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(async () => { const { data, error } = await supabase.rpc('families_admin'); if (error) setErr(error.message); setRows((data ?? []) as Row[]); }, []);
  useEffect(() => { load(); }, [load]);
  if (!can('families.manage')) return <Screen><T>No permission.</T></Screen>;
  if (rows === null) return <Loading />;
  const team = typeof settings.team_name === 'string' ? settings.team_name : 'the club';
  const mk = async (r: Row) => { setErr(null); const { data, error } = await supabase.rpc('guardian_code_create', { p_player: r.player_id, p_relationship: rel }); if (error) return setErr(error.message); setCodes((c) => ({ ...c, [r.player_id]: data as string })); };
  const unlink = async (r: Row, g: { guardian_id: string }) => { const { error } = await supabase.from('player_guardians').delete().eq('player_id', r.player_id).eq('guardian_id', g.guardian_id); if (error) setErr(error.message); await load(); };
  const setReq = async (r: Row, v: boolean) => { const { error } = await supabase.rpc('player_set_guardian_required', { p_player: r.player_id, p_value: v }); if (error) setErr(error.message); await load(); };
  const shown = rows.filter((r) => filter === 'all' || (filter === 'minors' && r.requires_guardian) || (filter === 'missing' && r.missing_forms > 0));
  return (
    <Screen>
      <H>Families</H>
      <T muted>Link a parent or guardian to a player with a one-time code (valid 14 days, up to 4 guardians per player). Guardians can then sign forms, see fees and kit, and read the child's injury status and shared coach feedback. Turn on “Needs a guardian” for players under 18 so that only a guardian can sign for them.</T>
      <T muted>Code is for</T><Chips options={REL} value={rel} onChange={setRel} />
      <Chips options={[{ value: 'all', label: `All (${rows.length})` }, { value: 'minors', label: 'Needs a guardian' }, { value: 'missing', label: 'Forms missing' }]} value={filter} onChange={setFilter} />
      <Err msg={err} />{msg ? <T>{msg}</T> : null}
      {shown.map((r) => (
        <Card key={r.player_id}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><Avatar url={r.photo_url} name={r.name} size={36} /><View style={{ flex: 1 }}><T style={{ fontWeight: '700' }}>{r.name}</T><T muted style={{ fontSize: 12 }}>{r.missing_forms ? `${r.missing_forms} required form${r.missing_forms === 1 ? '' : 's'} missing` : 'Forms up to date'}</T></View></View>
          <Toggle label="Needs a guardian" value={r.requires_guardian} onChange={(v) => setReq(r, v)} />
          {r.guardians.length === 0 ? <T muted>No guardian linked.</T> : r.guardians.map((g) => (
            <View key={g.guardian_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><T style={{ flex: 1 }}>{g.name} · {g.relationship}</T><Btn title="Remove" kind="ghost" onPress={() => unlink(r, g)} /></View>))}
          {codes[r.player_id] ? <View style={{ gap: 6 }}><T style={{ fontSize: 24, fontWeight: '900', letterSpacing: 2 }} selectable>{codes[r.player_id]}</T>
            <Btn title="Share the code" kind="ghost" onPress={async () => setMsg(await shareText(`Your ${team} link code for ${r.name}: ${codes[r.player_id]}. Sign in to the app, open “My family” and enter it. It works once and expires in 14 days.`))} /></View> : null}
          <Btn title="New link code" kind="ghost" onPress={() => mk(r)} />
        </Card>))}
    </Screen>
  );
}
