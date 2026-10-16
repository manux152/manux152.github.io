import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Screen, H, T, Card, Btn, Input, Chips, Err, Loading } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { useApp } from '../../lib/app-context';
import { DateTimeField } from '../../components/DateTimeField';

const today = () => new Date().toISOString().slice(0, 10);
const isDate = (v: string) => !v || (/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)));

/** Admin → Kit: what you own, who has what, and what is overdue to come back. */
export default function Kit() {
  const { can } = useApp();
  const [types, setTypes] = useState<any[]>([]); const [issues, setIssues] = useState<any[] | null>(null); const [players, setPlayers] = useState<any[]>([]);
  const [nt, setNt] = useState({ name: '', stock: '' }); const [q, setQ] = useState('');
  const [f, setF] = useState<{ player: string | null; type: string | null; size: string; num: string; due: string; note: string }>({ player: null, type: null, size: '', num: '', due: '', note: '' });
  const [tab, setTab] = useState('out'); const [err, setErr] = useState<string | null>(null); const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(async () => {
    const [t, i, p] = await Promise.all([supabase.from('kit_types').select('*').order('name'), supabase.from('kit_issues').select('*, players(full_name), kit_types(name)').order('issued_on', { ascending: false }).limit(300), supabase.from('players').select('id, full_name, shirt_number').eq('is_active', true).order('full_name')]);
    setTypes(t.data ?? []); setIssues(i.data ?? []); setPlayers(p.data ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);
  if (!can('kit.manage')) return <Screen><T>No permission.</T></Screen>;
  if (issues === null) return <Loading />;
  const run = async (fn: () => PromiseLike<{ error: any }>, ok?: string) => { setErr(null); setMsg(null); const { error } = await fn(); if (error) return setErr(error.message); if (ok) setMsg(ok); await load(); };
  const out = (id: string) => issues.filter((i) => i.kit_type_id === id && !i.returned_on).length;
  const addType = () => { if (nt.name.trim().length < 2) return setErr('Name the kit item.'); const s = nt.stock.trim() === '' ? null : Number(nt.stock); if (s != null && (Number.isNaN(s) || s < 0)) return setErr('Stock must be a number.'); return run(() => supabase.from('kit_types').insert({ name: nt.name.trim(), stock_total: s }) as any, 'Added.').then(() => setNt({ name: '', stock: '' })); };
  const issue = () => {
    if (!f.player || !f.type) return setErr('Choose the player and the kit item.'); if (!isDate(f.due)) return setErr('Use a return date like 2026-12-01.');
    const n = f.num.trim() === '' ? null : Number(f.num); if (n != null && (!Number.isInteger(n) || n < 0 || n > 99)) return setErr('Shirt number is 0–99.');
    return run(() => supabase.from('kit_issues').insert({ player_id: f.player, kit_type_id: f.type, size: f.size.trim() || null, shirt_number: n, due_back_on: f.due || null, note: f.note.trim() || null }) as any, 'Issued.').then(() => setF({ player: null, type: null, size: '', num: '', due: '', note: '' }));
  };
  const list = issues.filter((i) => (tab === 'out' ? !i.returned_on : tab === 'overdue' ? !i.returned_on && i.due_back_on && i.due_back_on < today() : true));
  const matches = players.filter((p) => !q.trim() || p.full_name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 12);
  return (
    <Screen>
      <H>Kit</H>
      {types.length ? <Card>{types.map((t) => <T key={t.id}>{t.name}: {out(t.id)} out{t.stock_total != null ? ` of ${t.stock_total} (${Math.max(0, t.stock_total - out(t.id))} left)` : ''}</T>)}</Card> : null}
      <Err msg={err} />{msg ? <T>{msg}</T> : null}
      <Chips options={[{ value: 'out', label: 'Out now' }, { value: 'overdue', label: 'Overdue' }, { value: 'all', label: 'History' }]} value={tab} onChange={setTab} />
      {list.length === 0 ? <T muted>Nothing here.</T> : list.map((i) => {
        const late = !i.returned_on && i.due_back_on && i.due_back_on < today();
        return (<Card key={i.id}>
          <T style={{ fontWeight: '700' }}>{i.players?.full_name} · {i.kit_types?.name}{i.size ? ` · ${i.size}` : ''}{i.shirt_number != null ? ` · #${i.shirt_number}` : ''}</T>
          <T muted style={{ color: late ? '#D64545' : undefined }}>{i.returned_on ? `returned ${i.returned_on}` : `issued ${i.issued_on}${i.due_back_on ? ` · due back ${i.due_back_on}${late ? ' (overdue)' : ''}` : ''}`}{i.note ? ` · ${i.note}` : ''}</T>
          {!i.returned_on ? <Btn title="Mark returned" kind="ghost" onPress={() => run(() => supabase.from('kit_issues').update({ returned_on: today() }).eq('id', i.id) as any)} /> : null}
          <Btn title="Delete record" kind="danger" onPress={() => run(() => supabase.from('kit_issues').delete().eq('id', i.id) as any)} />
        </Card>); })}
      <H>Issue kit</H>
      <Card>
        <Input label="Find a player" value={q} onChangeText={setQ} />
        <Chips options={matches.map((p) => ({ value: p.id, label: `${p.shirt_number != null ? '#' + p.shirt_number + ' ' : ''}${p.full_name}` }))} value={f.player} onChange={(v) => setF({ ...f, player: v })} />
        <Chips options={types.filter((t) => t.is_active).map((t) => ({ value: t.id, label: t.name }))} value={f.type} onChange={(v) => setF({ ...f, type: v })} />
        <View style={{ flexDirection: 'row', gap: 8 }}><View style={{ flex: 1 }}><Input label="Size" value={f.size} onChangeText={(v) => setF({ ...f, size: v })} maxLength={20} /></View><View style={{ flex: 1 }}><Input label="Shirt no." keyboardType="number-pad" value={f.num} onChangeText={(v) => setF({ ...f, num: v })} /></View></View>
        <DateTimeField mode="date" optional label="Return by" value={f.due || null} onChange={(v) => setF({ ...f, due: v ?? '' })} />
        <Input label="Note (optional)" value={f.note} onChangeText={(v) => setF({ ...f, note: v })} maxLength={300} />
        <Btn title="Issue" onPress={issue} />
      </Card>
      <Card>
        <T style={{ fontWeight: '700' }}>New kit item</T>
        <Input label="Name (e.g. Home shirt)" value={nt.name} onChangeText={(v) => setNt({ ...nt, name: v })} maxLength={80} />
        <Input label="How many you own (optional)" keyboardType="number-pad" value={nt.stock} onChangeText={(v) => setNt({ ...nt, stock: v })} />
        <Btn title="Add kit item" kind="ghost" onPress={addType} />
      </Card>
    </Screen>
  );
}
