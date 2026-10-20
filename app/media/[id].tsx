import { useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { Screen, H, T, Btn, Loading, fmtDate } from '../../components/ui';
import { PhotoTile } from '../../components/PhotoTile';
import { Masonry } from '../../components/Masonry';
import { Lightbox, LightItem } from '../../components/Lightbox';
import { SortFilterBar } from '../../components/SortFilterBar';
import { SectionHeading } from '../../components/SectionHeading';
import { useTable } from '../../lib/useQuery';
import { useLayout } from '../../lib/layout';
import { Person, fetchTagPeople, videoThumb } from '../../lib/tags';
import { ITEM_SORTS, ItemSort, MediaType, filterItems, sortItems } from '../../lib/mediaView';

// Album page: a "Photos" section and a "Videos" section, photos shown as same-size tiles (tap for the full original). Filter to photos only or videos only, sort, search captions.
export default function Album() {
  const { id, item, type } = useLocalSearchParams<{ id: string; item?: string; type?: string }>(); const { cols } = useLayout();
  const a = useTable('albums', (q) => q.eq('id', id), [id]);
  const items = useTable('media_items', (q) => q.eq('album_id', id).order('sort_order').order('created_at', { ascending: false }), [id]);
  const [people, setPeople] = useState<Record<string, Person[]>>({}); const [open, setOpen] = useState<number | null>(null);
  const [photoLimit, setPhotoLimit] = useState(12); const [videoLimit, setVideoLimit] = useState(6);   // only load a page at a time: saves bandwidth
  const [query, setQuery] = useState(''); const [sort, setSort] = useState<ItemSort>('newest'); const [kind, setKind] = useState<MediaType>(type === 'image' || type === 'video' ? type : 'all');
  const list = items.data as any[];
  useEffect(() => { if (list.length) fetchTagPeople('media', list.map((m) => m.id)).then(setPeople).catch(() => {}); }, [items.data]); // eslint-disable-line
  const photos = sortItems(filterItems(list.filter((m) => m.kind === 'image'), kind, query), sort);
  const videos = sortItems(filterItems(list.filter((m) => m.kind === 'video'), kind, query), sort);
  const shown = [...photos, ...videos];   // the viewer moves through photos first, then videos
  useEffect(() => { if (item && list.length) { setKind('all'); setQuery(''); const all = [...sortItems(list.filter((m) => m.kind === 'image'), 'newest'), ...sortItems(list.filter((m) => m.kind === 'video'), 'newest')]; const i = all.findIndex((m) => m.id === item); if (i >= 0) { if (sort !== 'newest') setSort('newest'); setOpen(i); } } }, [item, items.data]); // eslint-disable-line
  if (a.loading || items.loading) return <Loading />;
  const album: any = a.data[0]; const columns = Math.min(4, Math.max(2, cols));
  const nPhotos = list.filter((m) => m.kind === 'image').length; const nVideos = list.length - nPhotos;
  const light: LightItem[] = shown.map((m) => ({ id: m.id, kind: m.kind, url: m.url, title: album?.title, caption: m.caption, meta: [`Album: ${album?.title ?? ''}`, `Added ${fmtDate(m.created_at)}`], people: people[m.id] }));
  const names = (m: any) => (people[m.id] ?? []).map((p) => p.name).join(', ');
  const tile = (m: any) => {
    const idx = shown.findIndex((x) => x.id === m.id); const thumb = m.kind === 'video' ? videoThumb(m.url) : null;
    return (
      <View style={{ gap: 6 }}>
        {m.kind === 'image' ? <PhotoTile uri={m.url} alt={m.caption || 'Photo'} onPress={() => setOpen(idx)} />
          : (
            <Pressable accessibilityRole="button" accessibilityLabel={`Play video${m.caption ? ': ' + m.caption : ''}`} onPress={() => setOpen(idx)} style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: 10, overflow: 'hidden', backgroundColor: '#111', alignItems: 'center', justifyContent: 'center' }}>
              {thumb ? <Image source={{ uri: thumb }} accessibilityLabel="" contentFit="contain" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} /> : null}
              <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' }}><T style={{ color: '#fff', fontSize: 24 }}>▶</T></View>
            </Pressable>)}
        {m.caption ? <T style={{ fontWeight: '600', fontSize: 14 }}>{m.caption}</T> : null}
        <T muted style={{ fontSize: 12 }}>{fmtDate(m.created_at)}{names(m) ? ` · With ${names(m)}` : ''}</T>
      </View>);
  };
  return (
    <Screen>
      <H>{album?.title ?? 'Album'}</H>
      {album?.description ? <T muted>{album.description}</T> : null}
      {list.length === 0 && <T muted>This album is empty.</T>}
      {list.length > 0 && <SortFilterBar<ItemSort> query={query} onQuery={setQuery} sort={sort} onSort={setSort} sortOptions={ITEM_SORTS} category={kind} onCategory={(c) => setKind(c as MediaType)}
        filterLabel="Show" showLabel="Show" searchPlaceholder="Search captions…" shown={shown.length} total={list.length}
        categories={[{ value: 'all', label: `Photos & videos (${list.length})` }, { value: 'image', label: `Photos only (${nPhotos})` }, { value: 'video', label: `Videos only (${nVideos})` }]}
        onClear={() => { setQuery(''); setSort('newest'); setKind('all'); }} />}
      {list.length > 0 && shown.length === 0 && <T muted>Nothing matches. Try another word or clear the filter.</T>}
      {photos.length > 0 && <>
        <SectionHeading icon="🖼️" title="Photos" count={photos.length} subtitle="Tap a photo to see it full size with its caption and details." />
        <Masonry items={photos.slice(0, photoLimit)} columns={columns} keyOf={(m) => m.id} render={tile} />
        {photos.length > photoLimit ? <Btn title={`Show more photos (${photos.length - photoLimit} left)`} kind="ghost" onPress={() => setPhotoLimit((n) => n + 12)} /> : null}
      </>}
      {videos.length > 0 && <>
        <SectionHeading icon="🎬" title="Videos" count={videos.length} subtitle="Tap a video to watch it." />
        <Masonry items={videos.slice(0, videoLimit)} columns={Math.min(columns, 3)} keyOf={(m) => m.id} render={tile} />
        {videos.length > videoLimit ? <Btn title={`Show more videos (${videos.length - videoLimit} left)`} kind="ghost" onPress={() => setVideoLimit((n) => n + 6)} /> : null}
      </>}
      <Lightbox items={light} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />
    </Screen>
  );
}
