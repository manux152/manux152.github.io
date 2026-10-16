import { useEffect, useState } from 'react';
import { Switch, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Screen, H, T, Card, Btn, Input, Chips, Err, Loading, fmtDate } from '../../../components/ui';
import { Pitch } from '../../../components/Pitch';
import { supabase } from '../../../lib/supabase';
import { useTable } from '../../../lib/useQuery';
import { useApp } from '../../../lib/app-context';
import { matchTitle } from '../../../lib/matchday';

export default function LineupBuilder() {
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const { can, session, settings } = useApp();
  const m = useTable('matches', (q) => q.eq('id', matchId).select('*, opponents(name)'), [matchId]);
  const forms = useTable('formations', (q) => q.eq('is_active', true).eq('format', '11-a-side').order('name'));
  const players = useTable('players', (q) => q.eq('is_active', true).order('shirt_number'));
  const av = useTable('match_availability', (q) => q.eq('match_id', matchId), [matchId]);
  const [formationId, setFormationId] = useState<string | null>(null);
  const [slots, setSlots] = useState<Record<string, string>>({});
  const [bench, setBench] = useState<string[]>([]);
  const [notes, setNotes] = useState(''); const [published, setPublished] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false); const [lineupId, setLineupId] = useState<string | null>(null);
  const [rec, setRec] = useState<any | null>(null);
  const [captain, setCaptain] = useState<string | null>(null); const [vice, setVice] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null); const [msg, setMsg] = useState<string | null>(null); const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: l } = await supabase.from('lineups').select('*, lineup_players(player_id, slot_key, sort_order)').eq('match_id', matchId).maybeSingle();
      if (l) {
        setLineupId(l.id); setCaptain(l.captain_id ?? null); setVice(l.vice_captain_id ?? null); setFormationId(l.formation_id); setNotes(l.notes ?? ''); setPublished(l.is_published);
        const s: Record<string, string> = {}; const b: string[] = [];
        (l.lineup_players ?? []).sort((a: any, c: any) => a.sort_order - c.sort_order).forEach((r: any) => (r.slot_key ? (s[r.slot_key] = r.player_id) : b.push(r.player_id)));
        setSlots(s); setBench(b);
      }
      setLoaded(true);
    })();
  }, [matchId]);
  if (!can('lineups.manage')) return <Screen><T>No permission.</T></Screen>;
  if (m.loading || forms.loading || players.loading || !loaded) return <Loading />;

  const x: any = m.data[0]; const fs = forms.data as any[]; const ps = players.data as any[];
  const f = fs.find((y) => y.id === formationId);
  const status = (pid: string) => (av.data as any[]).find((a) => a.player_id === pid)?.status as string | undefined;
  const byId = (id: string) => ps.find((p) => p.id === id);
  const placed = new Set([...Object.values(slots), ...bench]);
  const starters = Object.values(slots);
  const cap = captain && starters.includes(captain) ? captain : null; const vc = vice && starters.includes(vice) ? vice : null;
  const info: Record<string, any> = {};
  Object.entries(slots).forEach(([k, pid]) => { const p = byId(pid); if (p) info[k] = { name: p.full_name.split(' ').slice(-1)[0], photo: p.photo_url, number: p.shirt_number, warn: status(pid) === 'unavailable', captain: pid === cap ? 'C' : pid === vc ? 'VC' : null }; });
  const makeCaptain = (pid: string | null) => { setCaptain(pid); if (pid && pid === vice) setVice(null); };
  const makeVice = (pid: string | null) => { setVice(pid); if (pid && pid === captain) setCaptain(null); };

  const chooseFormation = (id: string | null) => {
    if (!id) return;
    const nf = fs.find((y) => y.id === id); const keys = new Set((nf?.positions ?? []).map((p: any) => p.key));
    setFormationId(id); setSlots((cur) => Object.fromEntries(Object.entries(cur).filter(([k]) => keys.has(k)))); setActive(null);
  };
  const assign = (pid: string) => {
    if (active) { setSlots((cur) => ({ ...cur, [active]: pid })); setActive(null); }
    else setBench((cur) => (cur.includes(pid) ? cur.filter((x) => x !== pid) : [...cur, pid]));
  };
  const setAvail = async (pid: string, s: 'available' | 'unavailable') => {
    const { error } = await supabase.from('match_availability').upsert({ match_id: matchId, player_id: pid, status: s, updated_by: session?.user.id, updated_at: new Date().toISOString() }, { onConflict: 'match_id,player_id' });
    if (error) setErr(error.message); else await av.refresh();
  };
  const recommend = async () => {
    setErr(null); setBusy(true);
    const { data, error } = await supabase.functions.invoke('formation-ai', { body: { mode: 'recommend', match_id: matchId } });
    setBusy(false);
    if (error || data?.error) return setErr(data?.error ?? error?.message ?? 'Could not get a recommendation');
    setRec(data);
  };
  const save = async () => {
    setErr(null); setMsg(null);
    if (!formationId) return setErr('Choose a formation first.');
    setBusy(true);
    const row = { match_id: matchId, formation_id: formationId, notes: notes.trim() || null, captain_id: cap, vice_captain_id: vc, is_published: published, updated_by: session?.user.id, updated_at: new Date().toISOString() };
    const res = lineupId ? await supabase.from('lineups').update(row).eq('id', lineupId).select('id').single() : await supabase.from('lineups').insert(row).select('id').single();
    if (res.error) { setBusy(false); return setErr(res.error.message); }
    const lid = res.data.id; setLineupId(lid);
    await supabase.from('lineup_players').delete().eq('lineup_id', lid);
    const rows = [...Object.entries(slots).map(([slot_key, player_id], i) => ({ lineup_id: lid, player_id, slot_key, sort_order: i })),
      ...bench.filter((p) => !Object.values(slots).includes(p)).map((player_id, i) => ({ lineup_id: lid, player_id, slot_key: null, sort_order: 100 + i }))];
    const ins = rows.length ? await supabase.from('lineup_players').insert(rows) : { error: null };
    setBusy(false);
    if (ins.error) return setErr(ins.error.message);
    setMsg(published ? 'Saved and published — the team has been notified.' : 'Saved as a draft.');
  };

  return (
    <Screen>
      <H>Lineup · {x ? matchTitle(x, settings.team_name) : ''}</H><T muted>{x ? fmtDate(x.kickoff_at) : ''}</T>
      <Card>
        <T style={{ fontWeight: '700' }}>Formation</T>
        <Chips options={fs.map((y) => ({ value: y.id, label: y.name }))} value={formationId} onChange={chooseFormation} />
        <Btn title={busy ? 'Thinking…' : 'AI: recommend a formation for this match'} kind="ghost" onPress={recommend} disabled={busy} />
        {rec && (<Card style={{ borderColor: '#2F7FD8' }}>
          <T style={{ fontWeight: '800' }}>Suggested: {rec.name}</T><T>{rec.reasoning}</T>
          {rec.alternatives?.length ? <T muted>Alternatives: {rec.alternatives.join(', ')}</T> : null}
          <T muted style={{ fontSize: 12 }}>A suggestion from your available players{rec.ai ? ' and AI' : ''} — you decide.</T>
          <Btn title={`Use ${rec.name}`} onPress={() => { chooseFormation(rec.formation_id); setRec(null); }} /></Card>)}
        {f ? (<>
          {f.description ? <T>{f.description}</T> : null}
          {f.how_to_use ? <T muted><T style={{ fontWeight: '700' }}>How to use it: </T>{f.how_to_use}</T> : null}
        </>) : null}
      </Card>
      {f ? (<>
        <T muted>Tap a spot on the pitch, then tap a player below to place them. {active ? `Choosing for: ${f.positions.find((p: any) => p.key === active)?.label}` : ''}</T>
        <Pitch positions={f.positions} info={info} active={active} onPress={(k) => setActive(active === k ? null : k)} />
        {active && slots[active] ? <Btn title="Clear this spot" kind="ghost" onPress={() => { setSlots((c) => { const n = { ...c }; delete n[active]; return n; }); setActive(null); }} /> : null}
      </>) : <T muted>Choose a formation to see the pitch.</T>}

      <H>Players</H>
      <T muted>Starters get C / VC buttons to choose the captain and vice-captain for this match. {active ? 'Tap a player to place them in the selected spot.' : 'With no spot selected, tapping a player adds or removes them from the bench.'} ✅/❌ sets availability on their behalf.</T>
      {ps.map((p) => {
        const s = status(p.id); const inSlot = Object.entries(slots).find(([, v]) => v === p.id)?.[0]; const onBench = bench.includes(p.id);
        return (
          <Card key={p.id} style={{ opacity: placed.has(p.id) && !active ? 0.8 : 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <T style={{ fontWeight: '700' }}>{p.shirt_number != null ? `#${p.shirt_number} ` : ''}{p.full_name}{p.id === cap ? ' (C)' : p.id === vc ? ' (VC)' : ''} {s === 'available' ? '🟢' : s === 'unavailable' ? '🔴' : '⚪'}</T>
                <T muted style={{ fontSize: 12 }}>{inSlot ? `Starting (${f?.positions.find((q: any) => q.key === inSlot)?.label})` : onBench ? 'On the bench' : 'Not selected'}{s === 'unavailable' ? ' · marked unavailable' : ''}</T>
              </View>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <Btn title="✅" kind="ghost" onPress={() => setAvail(p.id, 'available')} />
                <Btn title="❌" kind="ghost" onPress={() => setAvail(p.id, 'unavailable')} />
                {inSlot ? <><Btn title={p.id === cap ? '✓ C' : 'C'} kind={p.id === cap ? 'primary' : 'ghost'} onPress={() => makeCaptain(p.id === cap ? null : p.id)} />
                  <Btn title={p.id === vc ? '✓ VC' : 'VC'} kind={p.id === vc ? 'primary' : 'ghost'} onPress={() => makeVice(p.id === vc ? null : p.id)} /></> : null}
                <Btn title={active ? 'Place' : onBench ? 'Remove' : 'Bench'} onPress={() => assign(p.id)} />
              </View>
            </View>
          </Card>
        );
      })}
      <Input label="Team notes (shown with the lineup)" multiline value={notes} onChangeText={setNotes} />
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><T style={{ fontWeight: '700' }}>Publish to the team</T><Switch value={published} onValueChange={setPublished} /></View>
        <T muted>Publishing shows the lineup on the match page and sends a notification and email to the whole team (once).</T>
      </Card>
      <Err msg={err} />{msg ? <T style={{ fontWeight: '700' }}>{msg}</T> : null}
      <Btn title={busy ? 'Saving…' : 'Save lineup'} onPress={save} disabled={busy} />
    </Screen>
  );
}
