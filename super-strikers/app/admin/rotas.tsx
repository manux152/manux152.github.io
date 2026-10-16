import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Screen, H, T, Card, Btn, Input, Chips, Toggle, Err, Loading, fmtDate } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { useApp } from '../../lib/app-context';
import type { Rota } from '../../lib/clubops';
import { DateTimeField } from '../../components/DateTimeField';

const parse = (s: string) => { const m = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})$/); if (!m) return null; const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]); return Number.isNaN(d.getTime()) ? null : d; };

/** Admin → Rotas: create a volunteer or transport rota, add slots, and see or remove sign-ups. */
export default function AdminRotas() {
  const { can } = useApp();
  const [rotas, setRotas] = useState<Rota[] | null>(null); const [f, setF] = useState({ title: '', kind: 'volunteer', when: '', where: '', notes: '' });
  const [slots, setSlots] = useState<Record<string, { label: string; cap: string }>>({}); const [err, setErr] = useState<string | null>(null); const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(async () => { const { data } = await supabase.rpc('rotas_upcoming', { p_include_past: false }); setRotas((data ?? []) as Rota[]); }, []);
  useEffect(() => { load(); }, [load]);
  if (!can('rotas.manage')) return <Screen><T>No permission.</T></Screen>;
  if (rotas === null) return <Loading />;
  const run = async (fn: () => PromiseLike<{ error: any }>, ok?: string) => { setErr(null); setMsg(null); const { error } = await fn(); if (error) return setErr(error.message); if (ok) setMsg(ok); await load(); };
  const create = () => {
    const d = f.when ? new Date(f.when) : null; if (f.title.trim().length < 3) return setErr('Give the rota a title.'); if (!d || isNaN(d.getTime())) return setErr('Choose the date and time on the calendar.');
    return run(() => supabase.from('rotas').insert({ title: f.title.trim(), kind: f.kind, starts_at: d.toISOString(), location: f.where.trim() || null, notes: f.notes.trim() || null }) as any, 'Rota created. Add slots below it.').then(() => setF({ title: '', kind: 'volunteer', when: '', where: '', notes: '' }));
  };
  const addSlot = (rid: string) => { const s = slots[rid] ?? { label: '', cap: '1' }; const cap = Number(s.cap || '1'); if (!s.label.trim()) return setErr('Name the slot, e.g. Refreshments.'); if (!Number.isInteger(cap) || cap < 1 || cap > 20) return setErr('Spaces must be 1–20.');
    return run(() => supabase.from('rota_slots').insert({ rota_id: rid, label: s.label.trim(), capacity: cap }) as any).then(() => setSlots((x) => ({ ...x, [rid]: { label: '', cap: '1' } }))); };
  return (
    <Screen>
      <H>Rotas</H>
      <T muted>Members sign up in the app under Volunteers & lifts. Others see first names and last initials only. For transport rotas, only accept drivers who meet your club's safeguarding rules; the app does not check this for you.</T>
      <Err msg={err} />{msg ? <T>{msg}</T> : null}
      <Card>
        <T style={{ fontWeight: '800' }}>New rota</T>
        <Input label="Title (e.g. Saturday match-day helpers)" value={f.title} onChangeText={(v) => setF({ ...f, title: v })} maxLength={120} />
        <Chips options={[{ value: 'volunteer', label: 'Volunteers' }, { value: 'transport', label: 'Lifts / transport' }]} value={f.kind} onChange={(v) => setF({ ...f, kind: v })} />
        <DateTimeField label="When" value={f.when || null} onChange={(v) => setF({ ...f, when: v ?? '' })} />
        <Input label="Where (optional)" value={f.where} onChangeText={(v) => setF({ ...f, where: v })} maxLength={200} />
        <Input label="Notes (optional)" value={f.notes} onChangeText={(v) => setF({ ...f, notes: v })} multiline maxLength={1000} />
        <Btn title="Create rota" onPress={create} />
      </Card>
      {rotas.length === 0 ? <T muted>No upcoming rotas.</T> : rotas.map((r) => { const s = slots[r.id] ?? { label: '', cap: '1' }; return (
        <Card key={r.id}>
          <T style={{ fontWeight: '800' }}>{r.kind === 'transport' ? '🚗' : '🙋'} {r.title}</T><T muted>{fmtDate(r.starts_at)}{r.location ? ` · ${r.location}` : ''}</T>
          {r.slots.map((sl) => (
            <View key={sl.id} style={{ gap: 4, borderTopWidth: 1, borderTopColor: '#E6E8EC', paddingTop: 6 }}>
              <T style={{ fontWeight: '700' }}>{sl.label} <T muted>({sl.people.length}/{sl.capacity})</T></T>
              {sl.people.map((p: any, i) => <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><T style={{ flex: 1 }} muted>• {p.name}{p.seats ? ` · ${p.seats} seats` : ''}{p.note ? ` · ${p.note}` : ''}</T>{p.user_id ? <Btn title="Remove" kind="ghost" onPress={() => run(() => supabase.from('rota_signups').delete().eq('slot_id', sl.id).eq('user_id', p.user_id) as any)} /> : null}</View>)}
              <Btn title="Delete slot" kind="ghost" onPress={() => run(() => supabase.from('rota_slots').delete().eq('id', sl.id) as any)} />
            </View>))}
          <Input label="New slot (e.g. Refreshments, Driver from school)" value={s.label} onChangeText={(v) => setSlots({ ...slots, [r.id]: { ...s, label: v } })} maxLength={80} />
          <Input label="Spaces" keyboardType="number-pad" value={s.cap} onChangeText={(v) => setSlots({ ...slots, [r.id]: { ...s, cap: v } })} />
          <Btn title="Add slot" kind="ghost" onPress={() => addSlot(r.id)} />
          <Btn title="Delete this rota" kind="danger" onPress={() => run(() => supabase.from('rotas').delete().eq('id', r.id) as any)} />
        </Card>); })}
    </Screen>
  );
}
