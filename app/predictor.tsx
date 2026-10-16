import { useEffect, useState } from 'react';
import { Link, Redirect } from 'expo-router';
import { View } from 'react-native';
import { Screen, H, T, Card, Chips, Loading, Avatar } from '../components/ui';
import { useApp } from '../lib/app-context';
import { fetchLeaderboard, type Leader } from '../lib/fans';

const monthStart = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString(); };

/** The "Predict the score" league. Names show as first name + last initial; members can opt out in their profile. */
export default function Predictor() {
  const { session, settings } = useApp();
  const [scope, setScope] = useState<'all' | 'month'>('all'); const [rows, setRows] = useState<Leader[] | null>(null);
  useEffect(() => { if (session) { setRows(null); fetchLeaderboard(scope === 'month' ? monthStart() : null).then(setRows); } }, [scope, session]);
  if (!session) return <Redirect href="/login" />;
  const mine = rows?.find((r) => r.is_me);
  return (
    <Screen>
      <H>Predict the score</H>
      <T muted>Pick the score of each match before kick-off. 5 points for the exact score, 2 for the right result (win, draw or loss).</T>
      {settings.fan_predictions_enabled === false ? <T muted>The predictor is switched off right now.</T> : null}
      <Chips options={[{ value: 'all', label: 'All time' }, { value: 'month', label: 'This month' }]} value={scope} onChange={setScope} />
      {mine ? <Card><T style={{ fontWeight: '800' }}>You: #{mine.rank} · {mine.points} pts</T><T muted>{mine.exact} exact · {mine.correct} right results · {mine.played} predictions scored</T></Card> : null}
      {rows === null ? <Loading /> : rows.length === 0 ? <T muted>No scored predictions yet. Predict an upcoming match, then check back after full time.</T> : rows.map((r) => (
        <Card key={r.user_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: r.is_me ? 2 : 1 }}>
          <T style={{ width: 34, fontWeight: '800' }}>{r.rank}</T>
          <Avatar url={r.avatar_url} name={r.name} size={34} />
          <View style={{ flex: 1 }}><T style={{ fontWeight: '700' }}>{r.name}{r.is_me ? ' (you)' : ''}</T><T muted style={{ fontSize: 12 }}>{r.exact} exact · {r.played} played</T></View>
          <T style={{ fontWeight: '900', fontSize: 18 }}>{r.points}</T>
        </Card>))}
      <Link href="/profile"><T muted style={{ textDecorationLine: 'underline' }}>Prefer not to be listed? Change it in your profile.</T></Link>
    </Screen>
  );
}
