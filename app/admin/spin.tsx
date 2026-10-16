import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Screen, H, T, Card, Btn, Input, Chips, Toggle, Err, Loading, fmtDate } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { useTable } from '../../lib/useQuery';
import { useApp } from '../../lib/app-context';

type Seg = { id: string; label: string; prize_kind: string; value: string; min_subtotal: string; weight: string; color: string; expires_days: string; is_active: boolean };
const KINDS = [{ value: 'none', label: 'No prize' }, { value: 'percent', label: '% off' }, { value: 'fixed', label: 'Money off' }, { value: 'free_delivery', label: 'Free delivery' }];
const COLORS = ['#2E9E5B', '#1E88E5', '#F57C00', '#D32F2F', '#7B1FA2', '#EC6FA6', '#FBC02D', '#14284B', '#5B6470', '#8A9099'];
const COOLDOWNS = [{ value: '24', label: 'Daily' }, { value: '72', label: '3 days' }, { value: '168', label: 'Weekly' }, { value: '336', label: '2 weeks' }, { value: '720', label: 'Monthly' }];
const num = (s: string) => (s.trim() === '' ? NaN : Number(s));

// Admin → Spin wheel: what is on the wheel, how rare each prize is, and how often a member may spin.
export default function SpinAdmin() {
  const { can, settings, reload } = useApp();
  const segs = useTable('spin_segments', (q) => q.order('sort_order').order('id'));
  const recent = useTable('spins', (q) => q.order('created_at', { ascending: false }).limit(10).select('*, profiles(full_name)'));
  const [list, setList] = useState<Seg[]>([]); const [removed, setRemoved] = useState<string[]>([]); const [ready, setReady] = useState(false);
  const [enabled, setEnabled] = useState(settings.spin_enabled !== false && settings.spin_enabled !== 'false'); const [cool, setCool] = useState(String(settings.spin_cooldown_hours ?? 168));
  const [target, setTarget] = useState(''); const [stats, setStats] = useState<{ all: number; wins: number } | null>(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null); const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (segs.loading || ready) return;
    setList((segs.data as any[]).map((s) => ({ id: s.id, label: s.label, prize_kind: s.prize_kind, value: String(s.value), min_subtotal: String(s.min_subtotal), weight: String(s.weight), color: s.color, expires_days: String(s.expires_days), is_active: s.is_active }))); setReady(true);
  }, [segs.loading, segs.data, ready]);
  useEffect(() => {
    Promise.all([supabase.from('spins').select('id', { count: 'exact', head: true }), supabase.from('spins').select('id', { count: 'exact', head: true }).neq('prize_kind', 'none')]).then(([a, b]) => setStats({ all: a.count ?? 0, wins: b.count ?? 0 }));
  }, [msg]);
  if (!can('shop.manage')) return <Screen><T>No permission.</T></Screen>;
  if (segs.loading || !ready) return <Loading />;

  const active = list.filter((s) => s.is_active); const total = active.reduce((a, s) => a + (num(s.weight) || 0), 0);
  const winW = active.filter((s) => s.prize_kind !== 'none').reduce((a, s) => a + (num(s.weight) || 0), 0);
  const winPct = total > 0 ? (winW / total) * 100 : 0; const pct = (s: Seg) => (s.is_active && total > 0 ? ((num(s.weight) || 0) / total) * 100 : 0);
  const set = (i: number, patch: Partial<Seg>) => { setList((l) => l.map((s, k) => (k === i ? { ...s, ...patch } : s))); setMsg(null); };
  const move = (i: number, d: number) => setList((l) => { const n = [...l]; const j = i + d; if (j < 0 || j >= n.length) return l; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const add = () => setList((l) => [...l, { id: `new-${Date.now()}`, label: 'Try again', prize_kind: 'none', value: '0', min_subtotal: '0', weight: '100', color: '#8A9099', expires_days: '14', is_active: true }]);
  const del = (i: number) => { const s = list[i]; if (!s.id.startsWith('new-')) setRemoved((r) => [...r, s.id]); setList((l) => l.filter((_, k) => k !== i)); };

  const applyTarget = () => {
    setErr(null); const p = num(target);
    if (!(p >= 0 && p < 100)) return setErr('Enter a win chance between 0 and 99, e.g. 5.');
    const lose = active.filter((s) => s.prize_kind === 'none'); const win = active.filter((s) => s.prize_kind !== 'none');
    const L = lose.reduce((a, s) => a + (num(s.weight) || 0), 0); const W = win.reduce((a, s) => a + (num(s.weight) || 0), 0);
    if (!win.length || W <= 0) return setErr('Add at least one prize segment with a weight above 0 first.');
    if (L <= 0) return setErr('Add a “No prize” segment so there is something to lose.');
    const factor = ((p / (100 - p)) * L) / W;
    setList((l) => l.map((s) => (s.is_active && s.prize_kind !== 'none' ? { ...s, weight: String(Math.max(p > 0 ? 0.01 : 0, Math.round((num(s.weight) || 0) * factor * 100) / 100)) } : s)));
    setMsg(`Prize weights rescaled so about ${p}% of spins win. Press Save to apply.`);
  };

  const save = async () => {
    setErr(null); setMsg(null);
    if (active.length < 3 || active.length > 12) return setErr('The wheel needs between 3 and 12 active segments.');
    if (total <= 0) return setErr('At least one active segment needs a weight above 0.');
    for (const s of list) {
      if (!s.label.trim()) return setErr('Every segment needs a label.');
      if (!/^#[0-9a-f]{6}$/i.test(s.color)) return setErr(`${s.label}: pick a colour.`);
      for (const [k, v] of [['weight', s.weight], ['value', s.value], ['spend', s.min_subtotal]] as const) if (!(num(v) >= 0)) return setErr(`${s.label}: ${k} must be a number, 0 or more.`);
      if (s.prize_kind === 'percent' && num(s.value) > 100) return setErr(`${s.label}: percent can't be over 100.`);
      if (s.prize_kind !== 'none' && s.prize_kind !== 'free_delivery' && !(num(s.value) > 0)) return setErr(`${s.label}: enter how much the prize is worth.`);
      const d = num(s.expires_days); if (!(Number.isInteger(d) && d >= 1 && d <= 365)) return setErr(`${s.label}: validity must be 1–365 days.`);
    }
    setBusy(true);
    try {
      if (removed.length) { const r = await supabase.from('spin_segments').delete().in('id', removed); if (r.error) throw r.error; }
      for (let i = 0; i < list.length; i++) {
        const s = list[i]; const row: any = { label: s.label.trim(), prize_kind: s.prize_kind, value: s.prize_kind === 'none' || s.prize_kind === 'free_delivery' ? 0 : num(s.value), min_subtotal: num(s.min_subtotal), weight: num(s.weight), color: s.color, expires_days: Number(s.expires_days), sort_order: i + 1, is_active: s.is_active };
        const r = s.id.startsWith('new-') ? await supabase.from('spin_segments').insert(row).select('id').single() : await supabase.from('spin_segments').update(row).eq('id', s.id).select('id').single();
        if (r.error) throw r.error; if (s.id.startsWith('new-')) list[i] = { ...s, id: (r.data as any).id };
      }
      const st = await supabase.from('site_settings').upsert([{ key: 'spin_enabled', value: enabled }, { key: 'spin_cooldown_hours', value: Number(cool) }], { onConflict: 'key' });
      if (st.error) throw st.error;
      setList([...list]); setRemoved([]); await reload(); setMsg('Saved. The wheel is updated.');
    } catch (e: any) { setErr(e.message ?? 'Could not save'); }
    setBusy(false);
  };

  return (
    <Screen>
      <H>Spin wheel</H>
      <T muted>Members spin once per cooldown. The chance of each prize is its weight divided by the total of all weights. The wheel shows equal slices, but the odds are whatever you set here. Prize codes are single-use and personal.</T>
      <Card>
        <Toggle label="Spin wheel is on" hint="Turn off to hide the wheel everywhere." value={enabled} onChange={setEnabled} />
        <T muted>How often a member can spin</T><Chips options={COOLDOWNS} value={COOLDOWNS.some((c) => c.value === cool) ? cool : null} onChange={(v) => v && setCool(v)} />
      </Card>
      <Card style={{ borderColor: winPct > 25 ? '#D64545' : undefined }}>
        <T style={{ fontWeight: '800' }}>Overall chance of winning a prize: {winPct.toFixed(1)}%</T>
        {winPct > 25 ? <T style={{ color: '#D64545' }}>That is generous — many spins will cost you a discount. Rare prizes keep it exciting.</T> : <T muted>About 1 spin in {winPct > 0 ? Math.max(1, Math.round(100 / winPct)) : '—'} wins something.</T>}
        <Input label="Set the overall win chance to (%)" keyboardType="numeric" value={target} onChangeText={setTarget} placeholder="e.g. 5" />
        <Btn title="Rescale prize weights" kind="ghost" onPress={applyTarget} />
        {stats ? <T muted style={{ fontSize: 12 }}>So far: {stats.all} spins, {stats.wins} prizes won{stats.all ? ` (${((stats.wins / stats.all) * 100).toFixed(1)}%)` : ''}.</T> : null}
      </Card>
      {list.map((s, i) => (
        <Card key={s.id} style={{ borderLeftWidth: 8, borderLeftColor: s.color, opacity: s.is_active ? 1 : 0.6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <T style={{ fontWeight: '800' }}>#{i + 1} · {s.is_active ? `${pct(s).toFixed(2)}% chance` : 'hidden'}</T>
            <View style={{ flexDirection: 'row', gap: 6 }}><Btn title="↑" kind="ghost" onPress={() => move(i, -1)} disabled={i === 0} /><Btn title="↓" kind="ghost" onPress={() => move(i, 1)} disabled={i === list.length - 1} /></View>
          </View>
          <Input label="Label on the wheel" value={s.label} onChangeText={(v) => set(i, { label: v })} />
          <T muted>Prize</T><Chips options={KINDS} value={s.prize_kind} onChange={(v) => v && set(i, { prize_kind: v })} />
          {s.prize_kind === 'percent' || s.prize_kind === 'fixed' ? <Input label={s.prize_kind === 'percent' ? 'Percent off' : 'Money off'} keyboardType="numeric" value={s.value} onChangeText={(v) => set(i, { value: v })} /> : null}
          {s.prize_kind !== 'none' ? (<><Input label="Minimum spend to use it (0 = none)" keyboardType="numeric" value={s.min_subtotal} onChangeText={(v) => set(i, { min_subtotal: v })} /><Input label="Valid for (days after winning)" keyboardType="numeric" value={s.expires_days} onChangeText={(v) => set(i, { expires_days: v })} /></>) : null}
          <Input label="Weight (bigger = more likely)" keyboardType="numeric" value={s.weight} onChangeText={(v) => set(i, { weight: v })} />
          <T muted>Colour</T><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>{COLORS.map((c) => <Pressable key={c} accessibilityRole="button" accessibilityLabel={`Colour ${c}`} accessibilityState={{ selected: s.color === c }} onPress={() => set(i, { color: c })} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c, borderWidth: s.color === c ? 4 : 1, borderColor: s.color === c ? '#FFD400' : '#0004' }} />)}</View>
          <Toggle label="Show on the wheel" value={s.is_active} onChange={(v) => set(i, { is_active: v })} />
          <Btn title="Delete segment" kind="danger" onPress={() => del(i)} />
        </Card>
      ))}
      <Btn title="+ Add a segment" kind="ghost" onPress={add} />
      <Err msg={err} />{msg ? <T style={{ fontWeight: '700' }}>{msg}</T> : null}
      <Btn title={busy ? 'Saving…' : 'Save wheel'} onPress={save} disabled={busy} />
      <Card>
        <T style={{ fontWeight: '800' }}>Recent spins</T>
        {(recent.data as any[]).length === 0 && <T muted>No spins yet.</T>}
        {(recent.data as any[]).map((r) => <T key={r.id} style={{ fontSize: 13 }}>{fmtDate(r.created_at)} · {r.profiles?.full_name ?? 'Member'} · {r.prize_kind === 'none' ? r.label : `🎉 ${r.label}`}</T>)}
      </Card>
    </Screen>
  );
}
