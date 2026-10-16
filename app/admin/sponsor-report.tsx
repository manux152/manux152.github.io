import { useCallback, useEffect, useState } from 'react';
import { Link } from 'expo-router';
import { Screen, H, T, Card, Btn, Input, Chips, Err, Loading } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { useApp } from '../../lib/app-context';
import { shareText } from '../../lib/share';

type Row = { sponsor_id: string; name: string; placement: string | null; views: number; clicks: number };
const PLACE: Record<string, string> = { footer: 'Website footer', home: 'Home page', match: 'Match pages' };
const pct = (c: number, v: number) => (v > 0 ? `${((c / v) * 100).toFixed(1)}%` : '–');

/** Admin → Sponsor report: views and clicks per sponsor and place, a summary you can send to them, and private deal notes. */
export default function SponsorReport() {
  const { can, settings } = useApp(); const team = typeof settings.team_name === 'string' ? settings.team_name : 'the club';
  const [days, setDays] = useState('30'); const [rows, setRows] = useState<Row[] | null>(null);
  const [deals, setDeals] = useState<Record<string, any>>({}); const [edit, setEdit] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null); const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(async () => {
    const [r, d] = await Promise.all([supabase.rpc('sponsor_report', { p_days: Number(days) }), supabase.from('sponsor_deals').select('*')]);
    if (r.error) setErr(r.error.message);
    setRows(((r.data ?? []) as any[]).map((x) => ({ ...x, views: Number(x.views), clicks: Number(x.clicks) })));
    setDeals(Object.fromEntries(((d.data ?? []) as any[]).map((x) => [x.sponsor_id, x])));
  }, [days]);
  useEffect(() => { load(); }, [load]);
  if (!can('settings.manage')) return <Screen><T>No permission.</T></Screen>;
  if (rows === null) return <Loading />;
  const names = Array.from(new Map(rows.map((r) => [r.sponsor_id, r.name])).entries());
  const of = (id: string) => rows.filter((r) => r.sponsor_id === id && r.placement);
  const text = (id: string, name: string) => { const rs = of(id); const v = rs.reduce((a, r) => a + r.views, 0); const c = rs.reduce((a, r) => a + r.clicks, 0);
    return [`${team} — ${name}: last ${days} days`, `Seen ${v} time${v === 1 ? '' : 's'} · ${c} click${c === 1 ? '' : 's'} (${pct(c, v)})`, ...rs.map((r) => `${PLACE[r.placement!]}: ${r.views} views, ${r.clicks} clicks`)].join('\n'); };
  const saveDeal = async (id: string) => {
    const d = deals[id] ?? {}; const value = d.value === '' || d.value == null ? null : Number(d.value);
    if (value != null && (Number.isNaN(value) || value < 0)) return setErr('Value must be a number.');
    const { error } = await supabase.from('sponsor_deals').upsert({ sponsor_id: id, contact_name: d.contact_name || null, contact_email: d.contact_email || null, value, notes: d.notes || null, updated_at: new Date().toISOString() }, { onConflict: 'sponsor_id' });
    if (error) setErr(error.message); else { setMsg('Saved.'); setEdit(null); }
  };
  const setD = (id: string, k: string, v: string) => setDeals((s) => ({ ...s, [id]: { ...(s[id] ?? {}), [k]: v } }));
  return (
    <Screen>
      <H>Sponsor report</H>
      <T muted>A view is counted once per visit when a sponsor is shown; a click when someone taps through. Counts are approximate (automated visits can add to them), so use them as a guide. Set where each sponsor appears, its level and dates in Admin → Sponsors & partners.</T>
      <Chips options={[{ value: '7', label: '7 days' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }, { value: '365', label: 'Year' }]} value={days} onChange={setDays} />
      <Err msg={err} />{msg ? <T>{msg}</T> : null}
      {names.length === 0 ? <T muted>No sponsors yet. Add them under Sponsors & partners.</T> : names.map(([id, name]) => { const rs = of(id); const v = rs.reduce((a, r) => a + r.views, 0); const c = rs.reduce((a, r) => a + r.clicks, 0); const d = deals[id] ?? {}; return (
        <Card key={id}>
          <T style={{ fontWeight: '800', fontSize: 17 }}>{name}</T>
          <T>{v} views · {c} clicks · {pct(c, v)} click rate</T>
          {rs.map((r) => <T key={r.placement!} muted>{PLACE[r.placement!]}: {r.views} views, {r.clicks} clicks</T>)}
          {rs.length === 0 ? <T muted>Nothing recorded in this period. Check the sponsor is switched on for a place.</T> : null}
          <Btn title="Share this report" kind="ghost" onPress={async () => setMsg(await shareText(text(id, name)))} />
          {edit === id ? (<>
            <Input label="Contact name" value={d.contact_name ?? ''} onChangeText={(v) => setD(id, 'contact_name', v)} />
            <Input label="Contact email" value={d.contact_email ?? ''} onChangeText={(v) => setD(id, 'contact_email', v)} autoCapitalize="none" keyboardType="email-address" />
            <Input label="Deal value (private)" value={d.value == null ? '' : String(d.value)} onChangeText={(v) => setD(id, 'value', v)} keyboardType="numeric" />
            <Input label="Notes (private)" value={d.notes ?? ''} onChangeText={(v) => setD(id, 'notes', v)} multiline maxLength={1000} />
            <Btn title="Save deal notes" onPress={() => saveDeal(id)} />
          </>) : <Btn title={d.contact_email || d.notes || d.value != null ? 'Deal notes (private)' : 'Add deal notes (private)'} kind="ghost" onPress={() => setEdit(id)} />}
        </Card>); })}
      <Link href="/admin/manage/sponsors"><T style={{ fontWeight: '700', textDecorationLine: 'underline' }}>Edit sponsors & where they appear →</T></Link>
    </Screen>
  );
}
