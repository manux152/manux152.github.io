import { Link } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Screen, H, T, Card, Loading, Err } from '../../components/ui';
import { useTable } from '../../lib/useQuery';
import { PageHead } from '../../components/PageHead';
import { useApp } from '../../lib/app-context';
import { matchTitle } from '../../lib/matchday';

type Item = { key: string; at: Date; end?: Date | null; kind: 'match' | 'event'; title: string; sub?: string; body?: string; href?: string };
const WEEKS = 8;

export default function Calendar() {
  const { settings } = useApp();
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const m = useTable('matches', (q) => q.in('status', ['scheduled', 'live']).gte('kickoff_at', startOfToday.toISOString()).order('kickoff_at').limit(30).select('*, opponents(name)'));
  const e = useTable('events', (q) => q.eq('is_published', true).or(`starts_at.gte.${startOfToday.toISOString()},repeat.eq.weekly`).order('starts_at').limit(100));
  if (m.loading || e.loading) return <Loading />;

  const items: Item[] = [];
  (m.data as any[]).forEach((x) => items.push({ key: 'm' + x.id, at: new Date(x.kickoff_at), kind: 'match', title: matchTitle(x, settings.team_name), sub: [x.competition, x.venue].filter(Boolean).join(' · '), href: `/match/${x.id}` }));
  const horizon = new Date(startOfToday.getTime() + WEEKS * 7 * 864e5);
  (e.data as any[]).forEach((x) => {
    const base = new Date(x.starts_at), dur = x.ends_at ? new Date(x.ends_at).getTime() - base.getTime() : null;
    const until = x.repeat_until ? new Date(x.repeat_until + 'T23:59:59') : horizon;
    for (let t = new Date(base), i = 0; t <= until && t <= horizon && i < 60; t = new Date(t.getTime() + (x.repeat === 'weekly' ? 7 * 864e5 : Infinity)), i++) {
      if (t >= startOfToday) items.push({ key: `e${x.id}-${t.getTime()}`, at: new Date(t), end: dur ? new Date(t.getTime() + dur) : null, kind: 'event', title: x.title, sub: [x.category, x.location].filter(Boolean).join(' · '), body: x.description });
      if (x.repeat !== 'weekly') break;
    }
  });
  items.sort((a, b) => a.at.getTime() - b.at.getTime());
  const groups: Record<string, Item[]> = {};
  items.forEach((it) => { const k = it.at.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }); (groups[k] ||= []).push(it); });
  const time = (d: Date) => d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  return (
    <Screen><PageHead title="Calendar" description="Matches, training and club events." /><H>Calendar</H><Err msg={m.error ?? e.error} />
      {items.length === 0 && <T muted>Nothing scheduled yet.</T>}
      {Object.entries(groups).map(([day, list]) => (
        <View key={day} style={{ gap: 8 }}>
          <T muted style={{ fontWeight: '700' }}>{day}</T>
          {list.map((it) => {
            const card = (
              <Card style={{ borderLeftWidth: 4, borderLeftColor: it.kind === 'match' ? '#2E9E5B' : '#2F7FD8' }}>
                <T style={{ fontWeight: '700' }}>{it.kind === 'match' ? '⚽ ' : ''}{it.title}</T>
                <T muted>{time(it.at)}{it.end ? ` – ${time(it.end)}` : ''}{it.sub ? ` · ${it.sub}` : ''}</T>
                {it.body ? <T>{it.body}</T> : null}
              </Card>
            );
            return it.href ? <Link key={it.key} href={it.href as any} asChild><Pressable>{card}</Pressable></Link> : <View key={it.key}>{card}</View>;
          })}
        </View>
      ))}
    </Screen>
  );
}
