import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Link } from 'expo-router';
import { Btn, Card, Loading, T, fmtDate } from './ui';
import { FullImage } from './FullImage';
import { Masonry } from './Masonry';
import { Appearance, fetchAppearances, videoThumb } from '../lib/tags';
import { useLayout } from '../lib/layout';

/** Every news article and photo/video where this person is tagged. Tiles show the whole picture and open the story or the picture. */
export function Appearances({ playerId, profileId, name, limit, title }: { playerId?: string | null; profileId?: string | null; name?: string; limit?: number; title?: string }) {
  const { cols } = useLayout(); const [rows, setRows] = useState<Appearance[] | null>(null); const [all, setAll] = useState(false);
  useEffect(() => { let live = true; setRows(null); fetchAppearances(playerId, profileId).then((r) => live && setRows(r)).catch(() => live && setRows([])); return () => { live = false; }; }, [playerId, profileId]);
  if (rows === null) return <Loading />;
  const news = rows.filter((r) => r.kind === 'news'); const media = rows.filter((r) => r.kind === 'media');
  if (!rows.length) return <T muted>{name ? `${name} hasn't been tagged anywhere yet.` : 'Not tagged anywhere yet.'}</T>;
  const shown = (list: Appearance[]) => (limit && !all ? list.slice(0, limit) : list);
  const hidden = limit && !all ? Math.max(0, news.length - limit) + Math.max(0, media.length - limit) : 0;
  const columns = Math.min(cols, limit ? 2 : 3);
  const tile = (r: Appearance) => {
    const img = r.kind === 'news' ? r.image_url : r.media_kind === 'video' ? (r.url ? videoThumb(r.url) : null) : r.image_url;
    const href = r.kind === 'news' ? `/news/${r.slug}` : `/media/${r.album_id}?item=${r.item_id}`;
    return (
      <Link key={r.kind + r.item_id} href={href as any} asChild>
        <Pressable accessibilityRole="link" accessibilityLabel={r.title}>
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {img ? <FullImage uri={img} alt="" radius={0}>{r.kind === 'media' && r.media_kind === 'video' ? <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}><T style={{ color: '#fff', fontSize: 34, textShadowColor: '#000', textShadowRadius: 6 } as any}>▶</T></View> : null}</FullImage>
              : <View style={{ padding: 16, backgroundColor: '#E6E8EC' }}><T style={{ fontSize: 26 }}>{r.kind === 'news' ? '📰' : r.media_kind === 'video' ? '▶' : '🖼️'}</T></View>}
            <View style={{ padding: 10, gap: 2 }}>
              <T muted style={{ fontSize: 12 }}>{r.kind === 'news' ? '📰 Tagged in news' : r.media_kind === 'video' ? '🎬 Tagged in a video' : '🖼️ Tagged in a photo'}{r.created_at ? ` · ${fmtDate(r.created_at)}` : ''}</T>
              <T style={{ fontWeight: '700' }}>{r.title}</T>
              {r.kind === 'media' && r.sub && r.sub !== r.title ? <T muted style={{ fontSize: 12 }}>Album: {r.sub}</T> : null}
            </View>
          </Card>
        </Pressable>
      </Link>);
  };
  return (
    <View style={{ gap: 10 }}>
      {title ? <T style={{ fontWeight: '800', fontSize: 16 }}>{title}</T> : null}
      {news.length > 0 && <><T style={{ fontWeight: '700' }}>News articles ({news.length})</T><Masonry items={shown(news)} columns={columns} keyOf={(r) => r.item_id} render={tile} /></>}
      {media.length > 0 && <><T style={{ fontWeight: '700' }}>Photos & videos ({media.length})</T><Masonry items={shown(media)} columns={columns} keyOf={(r) => r.item_id} render={tile} /></>}
      {hidden > 0 ? <Btn title={`Show all (${rows.length})`} kind="ghost" onPress={() => setAll(true)} /> : null}
    </View>
  );
}
