import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Link } from 'expo-router';
import { Screen, H, T, Card, Btn, Input, Chips, Avatar, Err, Loading } from '../../components/ui';
import { Pitch } from '../../components/Pitch';
import { supabase } from '../../lib/supabase';
import { useTable } from '../../lib/useQuery';
import { useApp } from '../../lib/app-context';
import { Tactics, TACTIC_OPTIONS, autoFill } from '../../lib/tactics';

// Admin → Tactics board: choose a team shape, put players (with their profile photos) in each position, set the style of play.
// Visitors see the result on the Formations page, read-only.
export default function TacticsBoard() {
  const { can } = useApp();
  const forms = useTable('formations', (q) => q.eq('is_active', true).order('name'));
  const players = useTable('players', (q) => q.eq('is_active', true).order('shirt_number').select('*, positions(name)'));
  const [fmt, setFmt] = useState('11-a-side'); const [fid, setFid] = useState<string | null>(null);
  const [slots, setSlots] = useState<Record<string, string>>({}); const [roles, setRoles] = useState<Record<string, string>>({}); const [tactics, setTactics] = useState<Tactics>({});
  const [captain, setCaptain] = useState<string | null>(null); const [vice, setVice] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null); const [dirty, setDirty] = useState(false); const [loadingShape, setLoadingShape] = useState(false);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null); const [msg, setMsg] = useState<string | null>(null);
  const list = (forms.data as any[]).filter((f) => f.format === fmt);
  const f = (forms.data as any[]).find((x) => x.id === fid) ?? null;

  useEffect(() => { if (!forms.loading && (!fid || !list.some((x) => x.id === fid))) setFid(list[0]?.id ?? null); }, [fmt, forms.loading, forms.data]); // eslint-disable-line
  useEffect(() => {
    if (!fid) return; let live = true; setLoadingShape(true); setActive(null); setMsg(null); setErr(null);
    supabase.from('formation_assignments').select('slot_key,player_id,role_note').eq('formation_id', fid).then(({ data, error }) => {
      if (!live) return; if (error) setErr(error.message);
      const s: Record<string, string> = {}, r: Record<string, string> = {};
      (data ?? []).forEach((a: any) => { s[a.slot_key] = a.player_id; if (a.role_note) r[a.slot_key] = a.role_note; });
      setSlots(s); setRoles(r); const fm: any = (forms.data as any[]).find((x) => x.id === fid); setTactics((fm?.tactics ?? {}) as Tactics); setCaptain(fm?.captain_id ?? null); setVice(fm?.vice_captain_id ?? null); setDirty(false); setLoadingShape(false);
    });
    return () => { live = false; };
  }, [fid]); // eslint-disable-line
  if (!can('lineups.manage')) return <Screen><T>No permission.</T></Screen>;
  if (forms.loading || players.loading) return <Loading />;

  const ps = players.data as any[]; const byId = (id: string) => ps.find((p) => p.id === id);
  const slotOf = (pid: string) => Object.entries(slots).find(([, v]) => v === pid)?.[0];
  const label = (k: string) => f?.positions?.find((p: any) => p.key === k)?.label ?? k;
  const touch = () => { setDirty(true); setMsg(null); };
  const placedIds = Object.values(slots);
  const cap = captain && placedIds.includes(captain) ? captain : null; const vc = vice && placedIds.includes(vice) ? vice : null;
  const info: Record<string, any> = {};
  Object.entries(slots).forEach(([k, pid]) => { const p = byId(pid); if (p) info[k] = { name: p.full_name.split(' ').slice(-1)[0], photo: p.photo_url, number: p.shirt_number, captain: pid === cap ? 'C' : pid === vc ? 'VC' : null }; });
  // One person cannot be both: choosing them for one armband takes it off the other.
  const makeCaptain = (pid: string | null) => { setCaptain(pid); if (pid && pid === vice) setVice(null); touch(); };
  const makeVice = (pid: string | null) => { setVice(pid); if (pid && pid === captain) setCaptain(null); touch(); };

  const swap = (a: string, b: string) => {
    setSlots((c) => { const n = { ...c }; const pa = c[a], pb = c[b]; if (pb) n[a] = pb; else delete n[a]; if (pa) n[b] = pa; else delete n[b]; return n; });
    setRoles((c) => { const n = { ...c }; const ra = c[a], rb = c[b]; if (rb) n[a] = rb; else delete n[a]; if (ra) n[b] = ra; else delete n[b]; return n; });
    setActive(null); touch();
  };
  const tapSlot = (k: string) => { if (active && active !== k && slots[active]) return swap(active, k); setActive(active === k ? null : k); };
  const place = (pid: string) => {
    if (!active) return setErr('Tap a spot on the pitch first, then choose a player.');
    setErr(null);
    setSlots((c) => { const n = { ...c }; const from = Object.entries(n).find(([, v]) => v === pid)?.[0]; if (from) delete n[from]; n[active] = pid; return n; });
    setRoles((c) => { const n = { ...c }; delete n[active]; return n; }); setActive(null); touch();
  };
  const clearSlot = (k: string) => { setSlots((c) => { const n = { ...c }; delete n[k]; return n; }); setRoles((c) => { const n = { ...c }; delete n[k]; return n; }); setActive(null); touch(); };
  const setTactic = (k: keyof Tactics, v: string | null) => { setTactics((c) => { const n = { ...c }; if (v) n[k] = v; else delete n[k]; return n; }); touch(); };

  const save = async () => {
    if (!fid) return; setErr(null); setMsg(null); setBusy(true);
    const a = await supabase.from('formations').update({ tactics, captain_id: cap, vice_captain_id: vc }).eq('id', fid);
    if (a.error) { setBusy(false); return setErr(a.error.message); }
    const d = await supabase.from('formation_assignments').delete().eq('formation_id', fid);
    if (d.error) { setBusy(false); return setErr(d.error.message); }
    const rows = Object.entries(slots).map(([slot_key, player_id]) => ({ formation_id: fid, slot_key, player_id, role_note: roles[slot_key]?.trim() || null }));
    const ins = rows.length ? await supabase.from('formation_assignments').insert(rows) : { error: null };
    setBusy(false); if (ins.error) return setErr(ins.error.message);
    setDirty(false); setMsg('Saved. Visitors now see this team shape on the Formations page.'); await forms.refresh();
  };

  return (
    <Screen>
      <H>Tactics board</H>
      <T muted>Choose a shape, then tap a spot and tap a player to place them. Tap one player and then another spot to move or swap them — on a computer you can also drag. Profile photos and positions show automatically.</T>
      <Chips options={['11-a-side', '9-a-side', '7-a-side'].map((v) => ({ value: v, label: v }))} value={fmt} onChange={(v) => v && setFmt(v)} />
      {list.length === 0 ? <T muted>No formations for this size yet. Add one under Coaches' area → Design a custom formation.</T> : <Chips options={list.map((x) => ({ value: x.id, label: x.name }))} value={fid} onChange={(v) => v && setFid(v)} />}
      {loadingShape ? <Loading /> : f ? (<>
        <Pitch positions={f.positions} info={info} active={active} onPress={tapSlot} onSwap={swap} tokenSize={52} showRole />
        <T muted style={{ textAlign: 'center' }}>{Object.keys(slots).length} of {f.positions.length} positions filled{active ? ` · choosing ${label(active)}` : ''}</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Btn title="Auto-fill empty spots" kind="ghost" onPress={() => { setSlots((c) => autoFill(f.positions, ps, c)); touch(); }} />
          <Btn title="Clear all" kind="ghost" onPress={() => { setSlots({}); setRoles({}); setActive(null); touch(); }} />
          {active && slots[active] ? <Btn title="Remove from this spot" kind="ghost" onPress={() => clearSlot(active)} /> : null}
        </View>
        {active && slots[active] ? <Input label={`Role for ${byId(slots[active])?.full_name} at ${label(active)} (optional, e.g. playmaker, overlaps on the right)`} value={roles[active] ?? ''} onChangeText={(v) => { setRoles((c) => ({ ...c, [active]: v })); touch(); }} /> : null}

        <Card>
          <T style={{ fontWeight: '800' }}>Captain & vice-captain</T>
          <T muted>Captain: <T style={{ fontWeight: '700' }}>{cap ? byId(cap)?.full_name : 'not chosen'}</T> · Vice-captain: <T style={{ fontWeight: '700' }}>{vc ? byId(vc)?.full_name : 'not chosen'}</T></T>
          {active && slots[active] ? (<>
            <T muted>Selected: {byId(slots[active])?.full_name}</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <Btn title={slots[active] === cap ? '✓ Captain (C)' : 'Make captain (C)'} kind={slots[active] === cap ? 'primary' : 'ghost'} onPress={() => makeCaptain(slots[active] === cap ? null : slots[active])} />
              <Btn title={slots[active] === vc ? '✓ Vice-captain (VC)' : 'Make vice-captain (VC)'} kind={slots[active] === vc ? 'primary' : 'ghost'} onPress={() => makeVice(slots[active] === vc ? null : slots[active])} />
            </View>
          </>) : <T muted>Tap a player on the pitch, then choose Captain or Vice-captain. The captain wears the yellow C armband on the pitch.</T>}
        </Card>

        <Card>
          <T style={{ fontWeight: '800' }}>Tactics</T>
          {TACTIC_OPTIONS.map((o) => (<View key={o.key} style={{ gap: 4 }}><T muted>{o.label}</T><Chips options={o.options} value={(tactics[o.key] as string) ?? null} onChange={(v) => setTactic(o.key, v)} /></View>))}
          <Input label="Instructions for the team (shown on the Formations page)" multiline value={tactics.instructions ?? ''} onChangeText={(v) => { setTactics((c) => ({ ...c, instructions: v })); touch(); }} />
        </Card>

        <H>Players</H>
        <T muted>{active ? `Tap Place to put a player at ${label(active)}.` : 'Tap a spot on the pitch first.'}</T>
        {ps.map((p) => { const k = slotOf(p.id); return (
          <Card key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderColor: k && k === active ? '#FFD400' : undefined }}>
            <Avatar url={p.photo_url} name={p.full_name} size={48} />
            <View style={{ flex: 1 }}>
              <T style={{ fontWeight: '700' }}>{p.shirt_number != null ? `#${p.shirt_number} ` : ''}{p.full_name}{p.id === cap ? ' (C)' : p.id === vc ? ' (VC)' : ''}</T>
              <T muted style={{ fontSize: 12 }}>{p.positions?.name ?? 'No position set'} · {k ? `Plays ${label(k)}` : 'Not in this shape'}</T>
            </View>
            {k ? <View style={{ flexDirection: 'row', gap: 6 }}>
              <Btn title={p.id === cap ? '✓ C' : 'C'} kind={p.id === cap ? 'primary' : 'ghost'} onPress={() => makeCaptain(p.id === cap ? null : p.id)} />
              <Btn title={p.id === vc ? '✓ VC' : 'VC'} kind={p.id === vc ? 'primary' : 'ghost'} onPress={() => makeVice(p.id === vc ? null : p.id)} />
            </View> : null}
            <Btn title={k ? 'Move here' : 'Place'} kind={k ? 'ghost' : 'primary'} onPress={() => place(p.id)} disabled={!active} />
          </Card>); })}
        {ps.length === 0 && <T muted>No active players yet. Add players under Admin → Players.</T>}
      </>) : null}
      <Err msg={err} />{msg ? <T style={{ fontWeight: '700' }}>{msg}</T> : null}
      <Btn title={busy ? 'Saving…' : dirty ? 'Save team shape & tactics' : 'Saved'} onPress={save} disabled={busy || !dirty || !fid} />
      <Link href="/formations" asChild><Btn title="See the public Formations page" kind="ghost" onPress={() => {}} /></Link>
    </Screen>
  );
}
