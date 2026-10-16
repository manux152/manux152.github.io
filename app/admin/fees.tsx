import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Screen, H, T, Card, Btn, Input, Chips, Err, Loading } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { useApp } from '../../lib/app-context';
import { shareText } from '../../lib/share';
import { METHODS, isOverdue, methodLabel, money, receiptText, type Invoice } from '../../lib/clubops';
import { DateTimeField } from '../../components/DateTimeField';

const BILLING = [{ value: 'once', label: 'One-off' }, { value: 'monthly', label: 'Monthly' }, { value: 'termly', label: 'Termly' }, { value: 'yearly', label: 'Yearly' }];
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

/** Admin → Fees: plans, invoices for the squad, payments recorded with numbered receipts. */
export default function Fees() {
  const { can, settings } = useApp(); const cur = typeof settings.currency === 'string' ? settings.currency : ''; const team = typeof settings.team_name === 'string' ? settings.team_name : 'the club';
  const [plans, setPlans] = useState<any[]>([]); const [inv, setInv] = useState<(Invoice & { players?: { full_name: string } })[] | null>(null); const [sum, setSum] = useState<any>(null);
  const [tab, setTab] = useState('overdue'); const [np, setNp] = useState({ name: '', amount: '', billing: 'monthly' });
  const [gen, setGen] = useState<{ plan: string | null; due: string }>({ plan: null, due: new Date().toISOString().slice(0, 10) });
  const [pay, setPay] = useState<{ id: string; method: string; ref: string } | null>(null); const [how, setHow] = useState(typeof settings.fee_payment_instructions === 'string' ? settings.fee_payment_instructions : '');
  const [err, setErr] = useState<string | null>(null); const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(async () => {
    const [p, i, s] = await Promise.all([supabase.from('fee_plans').select('*').order('created_at'), supabase.from('fee_invoices').select('*, players(full_name)').order('due_on', { ascending: false }).limit(300), supabase.rpc('fee_summary')]);
    setPlans(p.data ?? []); setInv((i.data ?? []) as any); setSum(s.data);
  }, []);
  useEffect(() => { load(); }, [load]);
  if (!can('fees.manage')) return <Screen><T>No permission.</T></Screen>;
  if (inv === null) return <Loading />;
  const run = async (fn: () => PromiseLike<{ error: any; data?: any }>, ok?: (d: any) => string) => { setErr(null); setMsg(null); const r = await fn(); if (r.error) return setErr(r.error.message); if (ok) setMsg(ok(r.data)); await load(); };
  const addPlan = () => { const a = Number(np.amount); if (np.name.trim().length < 2 || Number.isNaN(a) || a < 0 || np.amount.trim() === '') return setErr('Give the plan a name and an amount.'); return run(() => supabase.from('fee_plans').insert({ name: np.name.trim(), amount: a, billing: np.billing }) as any, () => 'Plan added.').then(() => setNp({ name: '', amount: '', billing: 'monthly' })); };
  const generate = () => { if (!gen.plan) return setErr('Choose a plan.'); if (!isDate(gen.due)) return setErr('Use a due date like 2026-11-01.'); return run(() => supabase.rpc('fee_generate', { p_plan: gen.plan, p_due: gen.due }) as any, (n) => `${n} invoice${n === 1 ? '' : 's'} created (players who already had one were skipped).`); };
  const markPaid = () => pay && run(() => supabase.rpc('fee_mark_paid', { p_invoice: pay.id, p_method: pay.method, p_reference: pay.ref || null }) as any, (rn) => `Recorded. Receipt ${rn}.`).then(() => setPay(null));
  const setStatus = (id: string, status: string) => run(() => supabase.from('fee_invoices').update({ status }).eq('id', id).eq('status', 'due') as any);
  const saveHow = () => run(() => supabase.from('site_settings').upsert({ key: 'fee_payment_instructions', value: how }, { onConflict: 'key' }) as any, () => 'Saved.');
  const list = inv.filter((i) => (tab === 'overdue' ? isOverdue(i) : tab === 'due' ? i.status === 'due' : tab === 'paid' ? i.status === 'paid' : true));
  return (
    <Screen>
      <H>Fees</H>
      {sum ? <Card><T style={{ fontWeight: '800' }}>Overdue: {money(sum.overdue_total, cur)} ({sum.overdue_count})</T><T muted>Total due {money(sum.due_total, cur)} · paid this month {money(sum.paid_this_month, cur)}</T></Card> : null}
      <Err msg={err} />{msg ? <T>{msg}</T> : null}
      <Chips options={[{ value: 'overdue', label: 'Overdue' }, { value: 'due', label: 'Due' }, { value: 'paid', label: 'Paid' }, { value: 'all', label: 'All' }]} value={tab} onChange={setTab} />
      {list.length === 0 ? <T muted>Nothing here.</T> : list.map((i) => (
        <Card key={i.id}>
          <T style={{ fontWeight: '700' }}>{i.players?.full_name} · {i.title}</T>
          <T muted style={{ color: isOverdue(i) ? '#D64545' : undefined }}>{money(i.amount, cur)} · {i.status === 'paid' ? `paid ${i.paid_on} · ${methodLabel(i.method)} · ${i.receipt_no}` : i.status === 'due' ? `${isOverdue(i) ? 'overdue, due' : 'due'} ${i.due_on}` : i.status}</T>
          {i.status === 'due' ? (pay?.id === i.id ? (<>
            <Chips options={METHODS} value={pay.method} onChange={(v) => setPay({ ...pay, method: v })} />
            <Input label="Reference (optional, e.g. mobile money code)" value={pay.ref} onChangeText={(v) => setPay({ ...pay, ref: v })} maxLength={80} />
            <Btn title="Record payment" onPress={markPaid} /><Btn title="Cancel" kind="ghost" onPress={() => setPay(null)} /></>) : (
            <View style={{ gap: 8 }}><Btn title="Mark as paid" onPress={() => setPay({ id: i.id, method: 'cash', ref: '' })} /><Btn title="Waive" kind="ghost" onPress={() => setStatus(i.id, 'waived')} /><Btn title="Cancel this invoice" kind="ghost" onPress={() => setStatus(i.id, 'cancelled')} /></View>)) : null}
          {i.status === 'paid' ? <Btn title="Share receipt" kind="ghost" onPress={async () => setMsg(await shareText(receiptText(i, i.players?.full_name ?? '', team, cur)))} /> : null}
        </Card>))}
      <H>Plans & invoices</H>
      <Card>
        <T style={{ fontWeight: '700' }}>New plan</T>
        <Input label="Name (e.g. Monthly subs)" value={np.name} onChangeText={(v) => setNp({ ...np, name: v })} maxLength={80} />
        <Input label={`Amount ${cur}`} keyboardType="numeric" value={np.amount} onChangeText={(v) => setNp({ ...np, amount: v })} />
        <Chips options={BILLING} value={np.billing} onChange={(v) => setNp({ ...np, billing: v })} />
        <Btn title="Add plan" onPress={addPlan} />
      </Card>
      <Card>
        <T style={{ fontWeight: '700' }}>Create invoices for the whole squad</T>
        <Chips options={plans.filter((p) => p.is_active).map((p) => ({ value: p.id, label: `${p.name} · ${money(p.amount, cur)}` }))} value={gen.plan} onChange={(v) => setGen({ ...gen, plan: v })} />
        <DateTimeField mode="date" label="Due date" value={gen.due || null} onChange={(v) => setGen({ ...gen, due: v ?? '' })} />
        <Btn title="Create invoices" onPress={generate} />
        <T muted style={{ fontSize: 12 }}>Everyone active gets one invoice for that plan and date; nobody gets two. For a single player, create invoices and cancel the others, or waive them.</T>
      </Card>
      <Card>
        <T style={{ fontWeight: '700' }}>How families pay</T>
        <Input label="Shown to families (bank details, mobile money number, cash handover…)" value={how} onChangeText={setHow} multiline maxLength={500} />
        <Btn title="Save" kind="ghost" onPress={saveHow} />
        <T muted style={{ fontSize: 12 }}>Payments are recorded by staff and each one gets a numbered receipt. Online card payment for fees is not part of this phase.</T>
      </Card>
    </Screen>
  );
}
