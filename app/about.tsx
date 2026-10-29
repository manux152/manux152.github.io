import { useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { Screen, H, T, Card, Loading } from '../components/ui';
import { useTable } from '../lib/useQuery';
import { useLayout } from '../lib/layout';

const paragraphs = (s: string) => String(s ?? '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('');

// About us: introduction, mission, vision, value proposition and leadership. Everything is edited in Admin → About us.
// The texts are translated automatically for visitors who choose another language.
export default function About() {
  const sections = useTable('about_sections', (q) => q.eq('is_visible', true).order('sort_order'));
  const leaders = useTable('about_leaders', (q) => q.eq('is_visible', true).order('sort_order').order('created_at'));
  const { width } = useWindowDimensions(); const { maxWidth } = useLayout();
  if (sections.loading || leaders.loading) return <Loading />;
  if (sections.error) return <Screen><H>About us</H><T muted>This page is not available right now. Please try again later.</T></Screen>;

  const rows = sections.data as any[];
  const intro = rows.find((r) => r.key === 'intro');
  const blocks = rows.filter((r) => r.key !== 'intro' && String(r.body ?? '').trim());
  const people = leaders.data as any[];

  // The same card size for everyone: 2, 3 or 4 across depending on the screen, with a square photo frame in each.
  const avail = Math.min(width, maxWidth) - 32; const gap = 12; const cols = avail >= 720 ? 4 : avail >= 480 ? 3 : 2;
  const cardW = Math.floor((avail - gap * (cols - 1)) / cols); const photo = cardW - 28;

  return (
    <Screen>
      <H>{intro?.title?.trim() || 'About us'}</H>
      {paragraphs(intro?.body).map((p, i) => <T key={i} style={{ lineHeight: 23 }}>{p}</T>)}
      {blocks.map((b) => (
        <Card key={b.key}>
          <H style={{ fontSize: 20 }}>{b.title?.trim() || b.key}</H>
          {paragraphs(b.body).map((p, i) => <T key={i} style={{ lineHeight: 22 }}>{p}</T>)}
        </Card>
      ))}
      {people.length > 0 ? <>
        <H>Our leadership</H>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>
          {people.map((p) => (
            <Card key={p.id} style={{ width: cardW }}>
              <View style={{ width: photo, height: photo, borderRadius: 12, overflow: 'hidden', backgroundColor: '#E6E8EC', alignItems: 'center', justifyContent: 'center' }}>
                {p.photo_url
                  ? <Image source={{ uri: p.photo_url }} style={{ width: photo, height: photo }} contentFit="cover" accessibilityLabel={p.full_name} />
                  : <T raw muted style={{ fontSize: 28, fontWeight: '800' }}>{initials(p.full_name)}</T>}
              </View>
              <T raw style={{ fontWeight: '800' }}>{p.full_name}</T>
              {p.role_title ? <T muted style={{ fontWeight: '600' }}>{p.role_title}</T> : null}
              {p.bio ? <T style={{ fontSize: 13, lineHeight: 19 }}>{p.bio}</T> : null}
            </Card>
          ))}
        </View>
      </> : null}
      {!String(intro?.body ?? '').trim() && blocks.length === 0 && people.length === 0 ? <T muted>Nothing here yet.</T> : null}
    </Screen>
  );
}
