import { Link } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Screen, H, T, Card, Loading, fmtDate } from '../../components/ui';
import { useTable } from '../../lib/useQuery';
import { useApp } from '../../lib/app-context';
import { matchTitle } from '../../lib/matchday';

export default function CoachHub() {
  const { can, settings } = useApp();
  const m = useTable('matches', (q) => q.eq('status', 'scheduled').gte('kickoff_at', new Date(Date.now() - 36e5).toISOString()).order('kickoff_at').limit(10).select('*, opponents(name)'));
  const av = useTable('match_availability');
  const lu = useTable('lineups');
  if (!can('lineups.manage') && !can('training.manage')) return <Screen><T>No permission.</T></Screen>;
  if (m.loading) return <Loading />;
  const rows = av.data as any[];
  return (
    <Screen>
      <H>Coaches' area</H>
      {can('lineups.manage') && (<>
        <H>Upcoming matches</H>
        {m.data.length === 0 && <T muted>No upcoming matches.</T>}
        {(m.data as any[]).map((x) => {
          const a = rows.filter((r) => r.match_id === x.id && r.status === 'available').length, u = rows.filter((r) => r.match_id === x.id && r.status === 'unavailable').length;
          const l: any = (lu.data as any[]).find((y) => y.match_id === x.id);
          return (
            <Link key={x.id} href={`/admin/lineup/${x.id}` as any} asChild><Pressable><Card>
              <T style={{ fontWeight: '800' }}>{matchTitle(x, settings.team_name)}</T><T muted>{fmtDate(x.kickoff_at)}</T>
              <View style={{ flexDirection: 'row', gap: 14 }}><T style={{ color: '#2E9E5B', fontWeight: '700' }}>{a} available</T><T style={{ color: '#D64545', fontWeight: '700' }}>{u} unavailable</T></View>
              <T muted>{l ? (l.is_published ? 'Lineup published' : 'Lineup saved (draft)') : 'No lineup yet'} · tap to open</T>
            </Card></Pressable></Link>
          );
        })}
      </>)}
      <H>Tools</H>
      {can('lineups.manage') && <Link href={'/admin/tactics' as any} asChild><Pressable><Card><T style={{ fontWeight: '700' }}>Tactics board (team shape, players & tactics)</T></Card></Pressable></Link>}
      {can('lineups.manage') && <Link href={'/admin/formation-design' as any} asChild><Pressable><Card><T style={{ fontWeight: '700' }}>Design a custom formation (AI-guided)</T></Card></Pressable></Link>}
      {can('lineups.manage') && <Link href={'/admin/manage/formations' as any} asChild><Pressable><Card><T style={{ fontWeight: '700' }}>Edit formation explanations</T></Card></Pressable></Link>}
      {can('training.manage') && <Link href={'/admin/attendance' as any} asChild><Pressable><Card><T style={{ fontWeight: '700' }}>Training attendance report</T></Card></Pressable></Link>}
      {can('training.manage') && <Link href={'/admin/manage/trainingSessions' as any} asChild><Pressable><Card><T style={{ fontWeight: '700' }}>Training sessions & notes</T></Card></Pressable></Link>}
    </Screen>
  );
}
