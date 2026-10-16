import { View } from 'react-native';
import { T, useColor } from './ui';
import { clockDisplay, countdownText, matchPhase, secondHalfAt, untilText } from '../lib/matchday';

const Pill = ({ text, bg }: { text: string; bg: string }) => <View style={{ backgroundColor: bg, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}><T style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>{text}</T></View>;

/** Status line of a match: LIVE + running clock (mm:ss), HALF TIME + countdown to the second half, FULL TIME, or UPCOMING + countdown. Pass a ticking `now`. */
export function MatchStatus({ match, now, htMinutes = 15 }: { match: any; now: number; htMinutes?: number }) {
  const brand = useColor(); const ph = matchPhase(match);
  const added = match.period === 'first_half' ? match.first_half_added : match.period === 'second_half' ? match.second_half_added : 0;
  const row = (children: any) => <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>{children}</View>;
  if (ph === 'live') return row(<>
    <Pill text="● LIVE" bg="#D64545" />
    <T accessibilityLabel={`Match clock ${clockDisplay(match, now)}`} style={{ fontWeight: '900', fontSize: 18, color: '#D64545' }}>{clockDisplay(match, now)}</T>
    {added ? <T muted style={{ fontSize: 12 }}>({added} min added)</T> : null}
    <T muted style={{ fontSize: 12 }}>{match.period === 'first_half' ? '1st half' : '2nd half'}</T></>);
  if (ph === 'ht') return row(<><Pill text="HALF TIME" bg="#E08A00" /><T muted>2nd half in <T style={{ fontWeight: '800' }}>{countdownText(secondHalfAt(match, htMinutes), now)}</T></T></>);
  if (ph === 'ft') return row(<Pill text="FULL TIME" bg="#6B7785" />);
  if (ph === 'cancelled') return row(<Pill text="CANCELLED" bg="#6B7785" />);
  if (ph === 'postponed') return row(<Pill text="POSTPONED" bg="#6B7785" />);
  const left = new Date(match.kickoff_at).getTime() - now;
  return row(<><Pill text="UPCOMING" bg={brand} /><T muted>{left > 0 ? <>Kicks off in <T style={{ fontWeight: '800' }}>{untilText(match.kickoff_at, now)}</T></> : 'Starting…'}</T></>);
}
