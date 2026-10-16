import { Link } from 'expo-router';
import { Pressable } from 'react-native';
import { Screen, H, Card, T } from '../../components/ui';
import { useApp } from '../../lib/app-context';
import { useTable } from '../../lib/useQuery';
import { splitNav } from '../../lib/nav';

export default function More() {
  const { nav, settings, can } = useApp();
  const { more } = splitNav(nav, can, Number(settings.max_tabs ?? 5));
  const pages = useTable('pages', (q) => q.eq('is_published', true).order('sort_order'));
  return (
    <Screen>
      <H>More</H>
      {more.map((n) => <Link key={n.id} href={n.route as any} asChild><Pressable><Card><T style={{ fontWeight: '700' }}>{n.label}</T></Card></Pressable></Link>)}
      {pages.data.length > 0 && <H>About</H>}
      {(pages.data as any[]).map((p) => <Link key={p.id} href={`/page/${p.slug}`} asChild><Pressable><Card><T style={{ fontWeight: '700' }}>{p.title}</T></Card></Pressable></Link>)}
    </Screen>
  );
}
