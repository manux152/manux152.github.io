import { useCallback, useEffect, useState } from 'react';
import { Link } from 'expo-router';
import { Pressable, View } from 'react-native';
import { T, Card, Btn, Err, useColor } from './ui';
import { useApp } from '../lib/app-context';
import { fetchPickSummary, myPick, pickPoints, savePick, type Pick } from '../lib/fans';

function Step({ label, value, onChange, disabled }: { label: string; value: number; onChange: (n: number) => void; disabled?: boolean }) {
  const c = useColor();
  const b = (t: string, d: number) => (
    <Pressable accessibilityRole="button" accessibilityLabel={`${t === '−' ? 'Fewer' : 'More'} ${label} goals`} disabled={disabled || (d < 0 && value <= 0) || (d > 0 && value >= 20)} onPress={() => onChange(value + d)}
      style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: c, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.4 : 1 }}><T style={{ fontWeight: '800', fontSize: 20, color: c }}>{t}</T></Pressable>);
  return (<View style={{ alignItems: 'center', gap: 6, flex: 1 }}><T muted numberOfLines={1}>{label}</T><View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>{b('−', -1)}<T style={{ fontSize: 30, fontWeight: '900', minWidth: 28, textAlign: 'center' }}>{value}</T>{b('+', 1)}</View></View>);
}

/** "Predict the score": pick a result before kick-off, earn 5 points for the exact score and 2 for the right result. */
export function FanPredictCard({ match }: { match: any }) {
  const { session, settings } = useApp(); const me = session?.user.id;
  const [pick, setPick] = useState<Pick>({ goals_for: 1, goals_against: 0 }); const [saved, setSaved] = useState<Pick | null>(null);
  const [sum, setSum] = useState<any>(null); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false); const [ok, setOk] = useState(false);
  const before = match.status === 'scheduled' && new Date(match.kickoff_at).getTime() > Date.now();
  const load = useCallback(async () => { if (me) { const p = await myPick(match.id, me); setSaved(p); if (p) setPick(p); } setSum(await fetchPickSummary(match.id)); }, [match.id, me]);
  useEffect(() => { load(); }, [load]);
  if (settings.fan_predictions_enabled === false || match.status === 'cancelled' || match.status === 'postponed') return null;
  if (!before && !saved && !(sum?.visible)) return null;       // nothing to show after kick-off for someone who did not play
  const team = typeof settings.team_name === 'string' ? settings.team_name : 'Us';
  const pts = saved ? pickPoints(saved, match) : null;
  const save = async () => { if (!me) return; setBusy(true); setErr(null); setOk(false); try { await savePick(match.id, me, pick); setSaved(pick); setOk(true); setSum(await fetchPickSummary(match.id)); } catch (e: any) { setErr(e.message); } setBusy(false); };
  return (
    <Card>
      <T style={{ fontWeight: '800', fontSize: 17 }}>🎯 Predict the score</T>
      {before ? (<>
        {!me ? <T muted>Sign in to make your prediction.</T> : <T muted>Pick the final score. You can change it until kick-off.</T>}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Step label={team} value={pick.goals_for} onChange={(n) => setPick({ ...pick, goals_for: n })} disabled={!me} />
          <Step label={match.opponents?.name ?? 'Them'} value={pick.goals_against} onChange={(n) => setPick({ ...pick, goals_against: n })} disabled={!me} />
        </View>
        <Err msg={err} />{ok ? <T>Saved ✓ {pick.goals_for}–{pick.goals_against}</T> : saved ? <T muted>Your pick: {saved.goals_for}–{saved.goals_against}</T> : null}
        {me ? <Btn title={saved ? 'Update my prediction' : 'Save my prediction'} disabled={busy} onPress={save} /> : <Link href="/login"><T style={{ fontWeight: '700', textDecorationLine: 'underline' }}>Sign in →</T></Link>}
      </>) : saved ? (
        <T>Your pick: <T style={{ fontWeight: '800' }}>{saved.goals_for}–{saved.goals_against}</T>{match.status === 'finished' ? ` · final ${match.goals_for ?? 0}–${match.goals_against ?? 0} · ` : ' · '}{pts != null ? <T style={{ fontWeight: '800' }}>{pts} point{pts === 1 ? '' : 's'}</T> : 'points when the match finishes'}</T>
      ) : null}
      {sum?.visible ? <T muted>Fans are picking: {Math.round((sum.win / sum.total) * 100)}% win · {Math.round((sum.draw / sum.total) * 100)}% draw · {Math.round((sum.loss / sum.total) * 100)}% loss (average {sum.avg_for}–{sum.avg_against}, {sum.total} picks)</T> : null}
      <Link href="/predictor"><T style={{ fontWeight: '700', textDecorationLine: 'underline' }}>See the leaderboard →</T></Link>
    </Card>
  );
}
