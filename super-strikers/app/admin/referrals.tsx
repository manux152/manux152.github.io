import { useCallback, useEffect, useState } from 'react';
import { Screen, H, T, Card, Btn, Input, Chips, Toggle, Err, Loading, fmtDate } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { useApp } from '../../lib/app-context';

type R = { id: string; referrer: string; referee: string; status: string; created_at: string; rewarded_at: string | null };
const KINDS = [{ value: 'percent', label: '% off' }, { value: 'fixed', label: 'Amount off' }, { value: 'free_delivery', label: 'Free delivery' }];
const num = (v: string) => (v.trim() === '' || Number.isNaN(Number(v)) || Number(v) < 0 ? null : Number(v));

/** Admin → Referrals: reward settings and everyone who joined through a friend. */
export default function AdminReferrals() {
  const { can, settings } = useApp();
  const s = (k: string, d: string) => String(settings[k] ?? d);
  const [on, setOn] = useState(settings.referral_enabled !== false); const [kind, setKind] = useState(s('referral_reward_kind', 'percent'));
  const [val, setVal] = useState(s('referral_reward_value', '10')); const [min, setMin] = useState(s('referral_min_order', '0')); const [exp, setExp] = useState(s('referral_expires_days', '60'));
  const [win, setWin] = useState(s('referral_window_days', '60')); const [cap, setCap] = useState(s('referral_max_rewards', '5'));
  const [rows, setRows] = useState<R[] | null>(null); const [err, setErr] = useState<string | null>(null); const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(async () => { const { data, error } = await supabase.rpc('referrals_admin'); if (error) setErr(error.message); setRows((data ?? []) as R[]); }, []);
  useEffect(() => { load(); }, [load]);
  if (!can('settings.manage')) return <Screen><T>No permission.</T></Screen>;
  const save = async () => {
    setErr(null); setMsg(null);
    const v = num(val), m = num(min), e = num(exp), w = num(win), c = num(cap);
    if (v == null || m == null || e == null || w == null || c == null) return setErr('Use plain positive numbers in every box.');
    if (kind === 'percent' && v > 100) return setErr('A percentage cannot be more than 100.');
    const { error } = await supabase.from('site_settings').upsert([
      { key: 'referral_enabled', value: on }, { key: 'referral_reward_kind', value: kind }, { key: 'referral_reward_value', value: v }, { key: 'referral_min_order', value: m },
      { key: 'referral_expires_days', value: e }, { key: 'referral_window_days', value: w }, { key: 'referral_max_rewards', value: c }], { onConflict: 'key' });
    if (error) setErr(error.message); else setMsg('Saved.');
  };
  const reject = async (id: string) => { const { error } = await supabase.from('referrals').update({ status: 'rejected' }).eq('id', id).eq('status', 'joined'); if (error) setErr(error.message); await load(); };
  const count = (st: string) => (rows ?? []).filter((r) => r.status === st).length;
  return (
    <Screen>
      <H>Referrals</H>
      <Card>
        <Toggle label="Invite-a-friend rewards" value={on} onChange={setOn} />
        <T muted>Reward for the member who invited</T><Chips options={KINDS} value={kind} onChange={setKind} />
        {kind !== 'free_delivery' ? <Input label={kind === 'percent' ? 'Percent off' : 'Amount off'} keyboardType="numeric" value={val} onChangeText={setVal} /> : null}
        <Input label="Friend's order must be at least (0 = any)" keyboardType="numeric" value={min} onChangeText={setMin} />
        <Input label="Reward code lasts (days)" keyboardType="numeric" value={exp} onChangeText={setExp} />
        <Input label="Friend must order within (days of joining)" keyboardType="numeric" value={win} onChangeText={setWin} />
        <Input label="Most rewards one member can earn" keyboardType="numeric" value={cap} onChangeText={setCap} />
        <T muted style={{ fontSize: 12 }}>The reward is created automatically when the friend's first qualifying order is paid. It is not taken back if that order is later refunded, so check refunds in Orders and mark suspicious referrals “Not counted” below before they order.</T>
        <Err msg={err} />{msg ? <T>{msg}</T> : null}<Btn title="Save" onPress={save} />
      </Card>
      <T muted>{count('joined')} waiting · {count('rewarded')} rewarded · {count('capped')} over the limit · {count('rejected')} not counted</T>
      {rows === null ? <Loading /> : rows.length === 0 ? <T muted>No referrals yet.</T> : rows.map((r) => (
        <Card key={r.id}><T style={{ fontWeight: '700' }}>{r.referrer} invited {r.referee}</T><T muted>{r.status} · {fmtDate(r.created_at)}{r.rewarded_at ? ` · rewarded ${fmtDate(r.rewarded_at)}` : ''}</T>
          {r.status === 'joined' ? <Btn title="Don't count this one" kind="ghost" onPress={() => reject(r.id)} /> : null}</Card>))}
    </Screen>
  );
}
