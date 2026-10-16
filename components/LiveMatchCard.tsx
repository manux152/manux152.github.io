import { View } from 'react-native';
import { T, Card, useColor } from './ui';
import { matchNames, useNow, KIND_ICON, type Commentary } from '../lib/matchday';
import { MatchStatus } from './MatchStatus';
import { useApp } from '../lib/app-context';

/** Scoreboard + running clock + commentary feed. Fed by useLiveMatch, so it updates by itself. */
export function LiveMatchCard({ match, commentary }: { match: any; commentary: Commentary[] }) {
  const { settings } = useApp(); const c = useColor();
  const live = match?.status === 'live';
  const now = useNow(live, 1000); const htMin = Number(settings.half_time_minutes ?? 15) || 15;
  if (!match) return null;
  const team = typeof settings.team_name === 'string' ? settings.team_name : 'Us';
  const names = matchNames(match, team); const gf = match.goals_for ?? 0, ga = match.goals_against ?? 0; const hs = names.usHome ? gf : ga, as = names.usHome ? ga : gf;
  return (
    <Card>
      <MatchStatus match={match} now={now} htMinutes={htMin} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <T style={{ flex: 1, fontWeight: '700', fontSize: 16 }} numberOfLines={2}>{names.home}</T>
        <T accessibilityLabel={`Score ${names.home} ${hs}, ${names.away} ${as}`} style={{ fontSize: 32, fontWeight: '900' }}>{hs} – {as}</T>
        <T style={{ flex: 1, fontWeight: '700', fontSize: 16, textAlign: 'right' }} numberOfLines={2}>{names.away}</T>
      </View>
      {commentary.length === 0 ? <T muted>{live ? 'Commentary will appear here.' : 'No commentary for this match.'}</T> : (
        <View style={{ gap: 8, marginTop: 6 }}>
          {commentary.slice(0, 40).map((x) => (
            <View key={x.id} style={{ flexDirection: 'row', gap: 8 }}>
              <T style={{ width: 40, fontWeight: '700' }} muted>{x.minute != null ? `${x.minute}′` : ''}</T>
              <T style={{ width: 24 }}>{KIND_ICON[x.kind] ?? '💬'}</T>
              <T style={{ flex: 1, fontWeight: x.kind === 'goal' ? '800' : '400' }}>{x.body}</T>
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}
