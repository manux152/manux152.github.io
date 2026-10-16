import { useLocalSearchParams } from 'expo-router';
import { Screen, H, T, Loading } from '../../components/ui';
import { useTable } from '../../lib/useQuery';

export default function InfoPage() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { data, loading } = useTable('pages', (q) => q.eq('slug', slug).limit(1), [slug]);
  if (loading) return <Loading />;
  const p: any = data[0];
  if (!p) return <Screen><T muted>Page not found.</T></Screen>;
  return <Screen><H>{p.title}</H><T>{p.body}</T></Screen>;
}
