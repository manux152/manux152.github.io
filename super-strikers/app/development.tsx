import { Link, Redirect, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { Screen, H, T, Card, Loading } from '../components/ui';
import { useTable } from '../lib/useQuery';
import { useApp } from '../lib/app-context';
import { BadgeRow } from '../components/BadgeRow';
import { FormGuide } from '../components/FormGuide';
import { avg, statusLabel, useBadges, useForm } from '../lib/development';

/** "My development" — a player's own page: form, badges, recent coach feedback that was shared with them, and their injury status. */
export default function MyDevelopment() {
  const { session } = useApp(); const uid = session?.user.id; const asked = useLocalSearchParams<{ player?: string }>().player;
  const me = useTable('players', (q) => q.eq('profile_id', uid ?? '').select('id, full_name'), [uid]);
  const pid: string | undefined = (typeof asked === 'string' && asked ? asked : undefined) ?? (me.data[0] as any)?.id;   // a guardian opens a child's page with ?player=; the database only returns what they are allowed to see
  const rat = useTable('player_ratings', (q) => q.eq('player_id', pid ?? '').order('created_at', { ascending: false }).limit(30).select('*, matches(kickoff_at, opponents(name))'), [pid]);
  const inj = useTable('player_injuries', (q) => q.eq('player_id', pid ?? '').order('started_on', { ascending: false }).limit(5), [pid]);
  const badges = useBadges(pid); const { form } = useForm(pid, 10);
  if (!session) return <Redirect href="/login" />;
  if (me.loading || rat.loading || inj.loading) return <Loading />;
  if (!pid) return <Screen><H>My development</H><T muted>This page is for players. Your account isn't linked to a player yet. Ask a coach to link it.</T></Screen>;
  const rated = (rat.data as any[]).filter((r) => r.match_id && r.rating != null).map((r) => Number(r.rating));
  const openInj = (inj.data as any[]).filter((i) => i.status !== 'cleared');
  return (
    <Screen>
      <H>My development</H>
      {openInj.length ? openInj.map((i) => (
        <Card key={i.id}><T style={{ fontWeight: '800' }}>{statusLabel(i.status)} · {i.description}</T>
          <T muted>{i.expected_return ? `Expected back around ${i.expected_return}` : 'Return date to be confirmed'}</T>
          {i.plan ? <T>{i.plan}</T> : null}</Card>)) : null}
      <BadgeRow badges={badges} />
      <FormGuide rows={form} />
      <H>Coach feedback</H>
      <T muted>{rated.length ? `Average ${avg(rated)} over ${rated.length} rated match${rated.length === 1 ? '' : 'es'}. ` : ''}You only see feedback your coaches chose to share with you.</T>
      {(rat.data as any[]).length === 0 ? <T muted>Nothing shared yet.</T> : (rat.data as any[]).map((r) => (
        <Card key={r.id}>
          <View><T style={{ fontWeight: '700' }}>{r.rating != null ? `${Number(r.rating)}/10 · ` : ''}{r.matches ? `vs ${r.matches.opponents?.name}` : 'Note from your coach'}</T></View>
          {r.note ? <T>{r.note}</T> : null}
        </Card>))}
      <Link href={`/player/${pid}` as any}><T style={{ fontWeight: '700', textDecorationLine: 'underline' }}>See my public player page →</T></Link>
    </Screen>
  );
}
