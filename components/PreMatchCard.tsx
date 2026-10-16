import { View } from 'react-native';
import { T, Card, useColor } from './ui';
import { PredictionBar } from './PredictionBar';
import { Pitch } from './Pitch';
import { countdownText, useNow } from '../lib/matchday';
import { useApp } from '../lib/app-context';

/**
 * Shown in the last few minutes before kick-off: live countdown, venue, the match prediction and the published line-up
 * (with the captain's armband). When the countdown reaches zero the server starts the clock and the live card takes over.
 */
export function PreMatchCard({ match, prediction, lineup }: { match: any; prediction?: any; lineup?: any }) {
  const { settings } = useApp(); const c = useColor();
  const now = useNow(true, 1000);
  const team = typeof settings.team_name === 'string' ? settings.team_name : 'Us';
  const left = new Date(match.kickoff_at).getTime() - now;
  const published = !!lineup && lineup.is_published && !!lineup.formations;
  const info: Record<string, any> = {};
  if (published) (lineup.lineup_players ?? []).filter((r: any) => r.slot_key).forEach((r: any) => {
    info[r.slot_key] = { name: r.players?.full_name?.split(' ').slice(-1)[0], photo: r.players?.photo_url, number: r.players?.shirt_number,
      captain: r.player_id === lineup.captain_id ? 'C' : r.player_id === lineup.vice_captain_id ? 'VC' : null };
  });
  const bench = published ? (lineup.lineup_players ?? []).filter((r: any) => !r.slot_key) : [];
  const capName = published ? (lineup.lineup_players ?? []).find((r: any) => r.player_id === lineup.captain_id)?.players?.full_name : null;
  return (
    <Card style={{ borderColor: c, borderWidth: 2 }}>
      <T style={{ fontWeight: '800', color: c }}>⏱️ {left > 0 ? 'Kick-off in' : 'Kicking off…'}</T>
      <T accessibilityLabel={`Kick-off in ${countdownText(match.kickoff_at, now)}`} style={{ fontSize: 44, fontWeight: '900', textAlign: 'center' }}>{countdownText(match.kickoff_at, now)}</T>
      <T style={{ fontWeight: '700', textAlign: 'center' }}>{team} {match.is_home ? 'vs' : '@'} {match.opponents?.name}</T>
      <T muted style={{ textAlign: 'center' }}>📍 {match.venue ?? (match.is_home ? 'Home' : 'Away')} · {match.is_home ? 'Home' : 'Away'}</T>
      {prediction && settings.predictions_enabled !== false ? (
        <View style={{ gap: 4, marginTop: 8 }}>
          <T style={{ fontWeight: '800' }}>Match prediction</T>
          <PredictionBar p={prediction} />
          <T muted>Expected goals {Number(prediction.expected_goals_for).toFixed(1)} – {Number(prediction.expected_goals_against).toFixed(1)}</T>
        </View>) : null}
      <View style={{ gap: 6, marginTop: 8 }}>
        <T style={{ fontWeight: '800' }}>Line-up{published ? ` · ${lineup.formations.name}` : ''}</T>
        {published ? (<>
          <Pitch positions={lineup.formations.positions} info={info} />
          {capName ? <T muted>Captain: {capName}</T> : null}
          {bench.length ? <T><T style={{ fontWeight: '700' }}>Bench: </T>{bench.map((r: any) => r.players?.full_name).join(', ')}</T> : null}
          {lineup.notes ? <T muted>{lineup.notes}</T> : null}
        </>) : <T muted>The line-up has not been announced yet.</T>}
      </View>
    </Card>
  );
}

/** Small "Kick-off in 07:42 · line-ups →" line for the home page. Appears only inside the pre-match window. */
export function KickoffCountdown({ match }: { match: any }) {
  const { settings } = useApp(); const c = useColor();
  const preMin = Number(settings.pre_match_minutes ?? 10) || 10;
  const left0 = new Date(match.kickoff_at).getTime() - Date.now();
  const now = useNow(true, left0 <= preMin * 60000 ? 1000 : 20000);
  const left = new Date(match.kickoff_at).getTime() - now;
  if (match.status !== 'scheduled' || left > preMin * 60000) return null;
  return <T style={{ fontWeight: '800', color: c }}>⏱️ {left > 0 ? `Kick-off in ${countdownText(match.kickoff_at, now)}` : 'Kicking off…'} · prediction and line-up inside</T>;
}
