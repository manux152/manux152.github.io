import { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import { View } from 'react-native';
import { Screen, H, T, Card, Btn, Input, Err, Loading, fmtDate } from '../components/ui';
import { useApp } from '../lib/app-context';
import { appUrl } from '../lib/redirect';
import { shareText } from '../lib/share';
import { claimReferral, fetchMyReferrals, rewardText, type MyReferrals } from '../lib/fans';

const STATUS: Record<string, string> = { joined: 'Joined — reward after their first paid order', rewarded: 'Reward earned 🎉', capped: 'Joined (reward limit reached)', rejected: 'Not counted' };

/** "Invite friends": your code and link, who joined, and the reward codes you've earned. */
export default function Invite() {
  const { session, settings } = useApp();
  const [d, setD] = useState<MyReferrals | null>(null); const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null); const [code, setCode] = useState('');
  const load = async () => { setD(await fetchMyReferrals()); setLoading(false); };
  useEffect(() => { if (session) load(); }, [session]);
  if (!session) return <Redirect href="/login" />;
  if (loading) return <Loading />;
  if (!d || !d.enabled) return <Screen><H>Invite friends</H><T muted>Invitations are switched off right now.</T></Screen>;
  const team = typeof settings.team_name === 'string' ? settings.team_name : 'the team';
  const link = appUrl(`/login?ref=${d.code}`);
  const reward = rewardText(d.reward_kind, d.reward_value);
  const share = async () => setMsg(await shareText(`Join me at ${team}! Use my code ${d.code} when you sign up: ${link}`));
  const claim = async () => { setErr(null); setMsg(null); try { const who = await claimReferral(code); setMsg(`Thanks! You joined through ${who}.`); setCode(''); await load(); } catch (e: any) { setErr(e.message); } };
  return (
    <Screen>
      <H>Invite friends</H>
      <Card>
        <T muted>When a friend you invited places their first paid order in the shop, you get a code for {reward}{Number(d.min_order) > 0 ? ` (on orders over ${d.min_order})` : ''}. You can earn up to {d.max_rewards} rewards.</T>
        <T muted>Your code</T><T style={{ fontSize: 28, fontWeight: '900', letterSpacing: 2 }} selectable>{d.code}</T>
        <T muted selectable style={{ fontSize: 12 }}>{link}</T>
        <Btn title="Share my invite" onPress={share} />{msg ? <T>{msg}</T> : null}
      </Card>
      <H>Friends</H>
      {d.friends.length === 0 ? <T muted>Nobody has joined with your code yet.</T> : d.friends.map((f, i) => <Card key={i}><T style={{ fontWeight: '700' }}>{f.name}</T><T muted>{STATUS[f.status] ?? f.status} · {fmtDate(f.joined)}</T></Card>)}
      <H>My reward codes</H>
      {d.rewards.length === 0 ? <T muted>No rewards yet.</T> : d.rewards.map((r) => (
        <Card key={r.code}><T style={{ fontWeight: '800', fontSize: 18 }} selectable>{r.code}</T><T muted>{rewardText(r.kind, r.value)}{r.min_subtotal > 0 ? ` on orders over ${r.min_subtotal}` : ''}{r.ends_at ? ` · until ${fmtDate(r.ends_at)}` : ''}{r.used ? ' · used' : ''}</T></Card>))}
      {!d.was_referred ? (
        <Card><T style={{ fontWeight: '700' }}>Did a friend invite you?</T><T muted>You can add their code within your first 14 days.</T>
          <Input label="Friend's code" autoCapitalize="characters" autoCorrect={false} value={code} onChangeText={setCode} /><Err msg={err} />
          <Btn title="Add code" kind="ghost" disabled={!code.trim()} onPress={claim} /></Card>) : null}
    </Screen>
  );
}
