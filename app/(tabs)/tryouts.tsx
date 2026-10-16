import { Link } from 'expo-router';
import { Pressable } from 'react-native';
import { Screen, H, T, Card, Loading, Err, fmtDate } from '../../components/ui';
import { useTable } from '../../lib/useQuery';
import { PageHead } from '../../components/PageHead';

export default function Tryouts() {
  const since = new Date(Date.now() - 864e5).toISOString();
  const { data, loading, error } = useTable('tryouts', (q) => q.eq('is_published', true).gte('starts_at', since).order('starts_at'));
  if (loading) return <Loading />;
  return (
    <Screen><PageHead title="Tryouts" description="Apply for upcoming player tryouts." /><H>Tryouts</H><Err msg={error} />
      <T muted>Want to play for us? Apply for an upcoming tryout. Selected players receive a one-time team code to create their player account.</T>
      {data.length === 0 && <T muted>No tryouts scheduled right now. Check back soon.</T>}
      {(data as any[]).map((t) => {
        const open = t.applications_open && (!t.apply_by || new Date(t.apply_by) > new Date());
        return (
          <Link key={t.id} href={`/tryout/${t.id}`} asChild><Pressable><Card>
            <T style={{ fontWeight: '800', fontSize: 17 }}>{t.title}</T>
            <T muted>{fmtDate(t.starts_at)}{t.location ? ` · ${t.location}` : ''}{t.age_group ? ` · ${t.age_group}` : ''}</T>
            <T style={{ fontWeight: '700', color: open ? '#2E9E5B' : '#999' }}>{open ? 'Applications open' : 'Applications closed'}</T>
          </Card></Pressable></Link>
        );
      })}
    </Screen>
  );
}
