import { useEffect, useState } from 'react';
import { Link, useLocalSearchParams } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Screen, H, T, Btn, Loading, Avatar, fmtDate } from '../../components/ui';
import { FullImage } from '../../components/FullImage';
import { Masonry } from '../../components/Masonry';
import { Lightbox, LightItem } from '../../components/Lightbox';
import { shareText, pageLink } from '../../lib/share';
import { useApp } from '../../lib/app-context';
import { useTable } from '../../lib/useQuery';
import { PageHead } from '../../components/PageHead';
import { AdSlot } from '../../components/AdSlot';
import { useLayout } from '../../lib/layout';
import { Person, fetchTagPeople, personHref } from '../../lib/tags';
import { CommentsSection } from '../../components/CommentsSection';
import { PollCard } from '../../components/PollCard';
import { fetchPolls, type Poll } from '../../lib/fans';

const web = (u?: string | null) => (u && /^https?:\/\//i.test(u) ? u : null);

export default function Post() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { settings } = useApp(); const { cols } = useLayout(); const [shared, setShared] = useState<string | null>(null); const [open, setOpen] = useState<number | null>(null);
  const { data, loading } = useTable('news_posts', (q) => q.eq('slug', slug).limit(1), [slug]);
  const [people, setPeople] = useState<Person[]>([]); const [polls, setPolls] = useState<Poll[]>([]);
  const p: any = data[0];
  useEffect(() => { if (p?.id) fetchPolls({ news: p.id, limit: 2 }).then(setPolls).catch(() => {}); }, [p?.id]);
  useEffect(() => { if (p?.id) fetchTagPeople('news', [p.id]).then((m) => setPeople(m[p.id] ?? [])).catch(() => {}); }, [p?.id]);
  if (loading) return <Loading />;
  if (!p) return <Screen><T muted>Post not found.</T></Screen>;
  const cover = web(p.cover_url);
  const g: { url: string; caption?: string }[] = (Array.isArray(p.gallery) ? p.gallery : []).filter((x: any) => web(x?.url));
  const coverCaption = g.find((x) => x.url === cover)?.caption ?? '';
  const rest = g.filter((x) => x.url !== cover);
  const all = [...(cover ? [{ url: cover, caption: coverCaption }] : []), ...rest];
  const light: LightItem[] = all.map((x, i) => ({ id: String(i), kind: 'image', url: x.url, title: p.title, caption: x.caption, meta: [`${p.category ? p.category + ' · ' : ''}${p.published_at ? fmtDate(p.published_at) : ''}`], people }));
  const offset = cover ? 1 : 0;
  return (
    <Screen><PageHead title={p.title} description={p.summary || p.body} image={cover} type="article" jsonLd={{ '@context': 'https://schema.org', '@type': 'NewsArticle', headline: String(p.title).slice(0, 110), image: cover ? [cover] : undefined, datePublished: p.published_at || undefined, dateModified: p.updated_at || p.published_at || undefined, description: String(p.summary || p.body || '').slice(0, 200), publisher: { '@type': 'Organization', name: settings.team_name } }} />
      {cover ? <FullImage uri={cover} alt={coverCaption || p.title} onPress={() => setOpen(0)} /> : null}
      {coverCaption ? <T muted style={{ fontSize: 13 }}>{coverCaption}</T> : null}
      <T muted>{p.category ? `${p.category} · ` : ''}{p.published_at ? fmtDate(p.published_at) : ''}</T>
      <H>{p.title}</H>
      {String(p.body).split(/\n{2,}/).map((para: string, i: number) => <T key={i} style={{ lineHeight: 24 }}>{para}</T>)}
      <AdSlot placement="news" />
      {people.length > 0 && (
        <View style={{ gap: 8 }}>
          <T style={{ fontWeight: '800' }}>People in this story</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {people.map((x) => (
              <Link key={x.kind + x.id} href={personHref(x) as any} asChild>
                <Pressable accessibilityRole="link" accessibilityLabel={`See where ${x.name} is tagged`} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#8886', borderRadius: 999, paddingVertical: 3, paddingLeft: 3, paddingRight: 12 }}>
                  <Avatar url={x.photo} name={x.name} size={28} /><T style={{ fontWeight: '600' }}>{x.name}</T>
                </Pressable>
              </Link>))}
          </View>
        </View>)}
      {rest.length > 0 && (<>
        <H style={{ fontSize: 18 }}>Pictures</H>
        <Masonry items={rest} columns={Math.min(3, Math.max(1, cols))} keyOf={(x) => x.url} render={(x, i) => (
          <View style={{ gap: 4 }}>
            <FullImage uri={x.url} alt={x.caption || `Picture ${i + 1}`} onPress={() => setOpen(i + offset)} />
            {x.caption ? <T muted style={{ fontSize: 13 }}>{x.caption}</T> : null}
          </View>)} />
      </>)}
      <Btn title="Share this story" kind="ghost" onPress={async () => setShared(await shareText(p.title, { title: p.title, url: pageLink(settings.site_url, '/news/' + p.slug) }))} />{shared ? <T muted>{shared}</T> : null}
      {polls.map((x) => <PollCard key={x.id} poll={x} />)}
      <CommentsSection newsId={p.id} enabled={p.comments_enabled !== false} />
      <Lightbox items={light} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />
    </Screen>
  );
}
