import { View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { T, Card, Avatar, Loading, fmtDate } from './ui';
import { useHeadToHead, type H2H, type Result } from '../lib/headToHead';

export const RES_COLOR: Record<Result, string> = { W: '#2E9E5B', D: '#2F7FD8', L: '#D64545' };
const WORD: Record<Result, string> = { W: 'Win', D: 'Draw', L: 'Loss' };

function Chip({ r }: { r: Result }) {
  return <View accessible accessibilityLabel={WORD[r]} style={{ backgroundColor: RES_COLOR[r], borderRadius: 4, minWidth: 22, alignItems: 'center', paddingHorizontal: 5, paddingVertical: 1 }}><T style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>{r}</T></View>;
}

/** Wins, draws and losses as one proportional bar. */
export function RecordBar({ h }: { h: H2H }) {
  if (!h.played) return null;
  const seg = (n: number, r: Result) => (n ? <View key={r} style={{ flex: n, backgroundColor: RES_COLOR[r] }} /> : null);
  return (
    <View accessible accessibilityLabel={`${h.won} won, ${h.drawn} drawn, ${h.lost} lost`} style={{ flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden' }}>
      {seg(h.won, 'W')}{seg(h.drawn, 'D')}{seg(h.lost, 'L')}
    </View>);
}

/** Last results against this team, oldest on the left, newest on the right. */
export function FormChips({ h, n = 5 }: { h: H2H; n?: number }) {
  const last = h.meetings.slice(0, n).reverse();
  if (!last.length) return null;
  return <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}><T muted style={{ fontSize: 12 }}>Last {last.length}</T>{last.map((m) => <Chip key={m.id} r={m.res} />)}</View>;
}

export function RecordSummary({ h }: { h: H2H }) {
  const gd = h.gf - h.ga;
  const cols: [string, string | number][] = [['P', h.played], ['W', h.won], ['D', h.drawn], ['L', h.lost], ['GF', h.gf], ['GA', h.ga], ['GD', gd > 0 ? `+${gd}` : gd]];
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {cols.map(([k, v]) => <View key={k} style={{ alignItems: 'center', minWidth: 36 }}><T muted style={{ fontSize: 12 }}>{k}</T><T style={{ fontWeight: '800', fontSize: 18 }}>{v}</T></View>)}
      </View>
      <RecordBar h={h} />
      <FormChips h={h} />
    </View>);
}

/** The list of past meetings. Tap one to open that match. */
export function Meetings({ h, limit }: { h: H2H; limit?: number }) {
  const router = useRouter();
  const list = limit ? h.meetings.slice(0, limit) : h.meetings;
  return (
    <View style={{ gap: 2 }}>
      {list.map((m) => (
        <Pressable key={m.id} accessibilityRole="link" accessibilityLabel={`${fmtDate(m.kickoff_at)}, ${m.is_home ? 'home' : 'away'}, ${m.gf} to ${m.ga}, ${WORD[m.res]}`} onPress={() => router.push(`/match/${m.id}` as any)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 }}>
          <Chip r={m.res} />
          <View style={{ flex: 1 }}>
            <T style={{ fontWeight: '700' }}>{new Date(m.kickoff_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}</T>
            <T muted style={{ fontSize: 12 }}>{m.is_home ? 'Home' : 'Away'}{m.competition ? ` · ${m.competition}` : ''}</T>
          </View>
          <T style={{ fontWeight: '800', fontSize: 17 }}>{m.gf} – {m.ga}</T>
        </Pressable>))}
    </View>);
}

/** Card for one opponent, e.g. on the match page: "Head-to-head vs Rovers". */
export function HeadToHeadCard({ opponentId, name, limit = 5 }: { opponentId?: string | null; name?: string | null; limit?: number }) {
  const { rows, loading } = useHeadToHead();
  if (!opponentId) return null;
  if (loading) return <Loading />;
  const h = rows.find((r) => r.opponent_id === opponentId);
  return (
    <Card>
      <T style={{ fontWeight: '800', fontSize: 17 }}>Head-to-head{name ? ` vs ${name}` : ''}</T>
      {h ? (<><RecordSummary h={h} /><Meetings h={h} limit={limit} /></>) : <T muted>No finished matches against {name ?? 'this team'} yet. This will be our first meeting on record.</T>}
    </Card>);
}

export function OpponentHeader({ h }: { h: H2H }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><Avatar url={h.logo_url} name={h.name} size={40} /><T style={{ fontWeight: '800', fontSize: 17, flex: 1 }}>{h.name}</T></View>;
}
