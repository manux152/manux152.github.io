import { View } from 'react-native';
import { T, useColor } from './ui';
import { useApp } from '../lib/app-context';
import { matchNames } from '../lib/matchday';

/** Both teams on one line, home side first: "Super Strikers  2 – 1  HomeBoys" (or "vs" before the match). Our team is highlighted. */
export function MatchTeams({ match, score = true, big = false }: { match: any; score?: boolean; big?: boolean }) {
  const { settings } = useApp(); const c = useColor();
  const n = matchNames(match, settings.team_name);
  const played = match.status === 'finished' || match.status === 'live';
  const f = match.goals_for ?? 0, a = match.goals_against ?? 0;
  const left = n.usHome ? f : a, right = n.usHome ? a : f;
  const size = big ? 22 : 16;
  const name = (txt: string, ours: boolean, align: 'left' | 'right') => <T numberOfLines={2} style={{ flex: 1, fontWeight: '800', fontSize: size, textAlign: align, color: ours ? c : undefined }}>{txt}</T>;
  return (
    <View accessible accessibilityLabel={`${n.home} ${played && score ? `${left}, ` : 'versus '}${n.away}${played && score ? ` ${right}` : ''}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      {name(n.home, n.usHome, 'right')}
      <T muted={!(played && score)} style={{ fontWeight: '900', fontSize: played && score ? size + 6 : size - 2, minWidth: 44, textAlign: 'center' }}>{played && score ? `${left} – ${right}` : 'vs'}</T>
      {name(n.away, !n.usHome, 'left')}
    </View>
  );
}
