import { useState } from 'react';
import { Link } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Screen, H, T, Card, Loading, Err } from '../../components/ui';
import { FullImage } from '../../components/FullImage';
import { Masonry } from '../../components/Masonry';
import { SortFilterBar } from '../../components/SortFilterBar';
import { SectionHeading } from '../../components/SectionHeading';
import { useTable } from '../../lib/useQuery';
import { useLayout } from '../../lib/layout';
import { ALBUM_SORTS, AlbumSort, sortAlbums } from '../../lib/mediaView';

type Kind = 'all' | 'image' | 'video';

// Albums: search, filter (photo albums / video albums) and sort. Cards show how many photos and videos each album holds.
export default function Media() {
  const { cols } = useLayout();
  const { data, loading, error } = useTable('albums', (q) => q.eq('is_published', true).order('created_at', { ascending: false }));
  const counts = useTable('media_items', (q) => q.select('album_id,kind').limit(5000));
  const [query, setQuery] = useState(''); const [sort, setSort] = useState<AlbumSort>('newest'); const [kind, setKind] = useState<Kind>('all');
  if (loading) return <Loading />;
  const tally = (id: string) => { const all = (counts.data as any[]).filter((m) => m.album_id === id); const v = all.filter((m) => m.kind === 'video').length; return { photos: all.length - v, videos: v, total: all.length }; };
  const albums = data as any[];
  const withPhotos = albums.filter((a) => tally(a.id).photos > 0).length; const withVideos = albums.filter((a) => tally(a.id).videos > 0).length;
  const q = query.trim().toLowerCase();
  const shown = sortAlbums(albums.filter((a) => (kind === 'all' || (kind === 'image' ? tally(a.id).photos > 0 : tally(a.id).videos > 0)) && (!q || `${a.title} ${a.description ?? ''}`.toLowerCase().includes(q))), sort, (a) => tally(a.id).total);
  const columns = Math.min(3, Math.max(1, cols));
  const card = (a: any) => {
    const t = tally(a.id);
    return (
      <Link href={`/media/${a.id}?type=${kind}`} asChild><Pressable accessibilityRole="link" accessibilityLabel={a.title}><Card style={{ padding: 0, overflow: 'hidden' }}>
        {a.cover_url ? <FullImage uri={a.cover_url} alt="" radius={0} /> : <View style={{ padding: 28, backgroundColor: '#E6E8EC', alignItems: 'center' }}><T style={{ fontSize: 34 }}>{t.photos === 0 && t.videos > 0 ? '🎬' : '🖼️'}</T></View>}
        <View style={{ padding: 12, gap: 3 }}>
          <T style={{ fontWeight: '800', fontSize: 17 }}>{a.title}</T>
          {a.description ? <T muted>{a.description}</T> : null}
          <T muted style={{ fontSize: 12 }}>{t.photos > 0 ? `🖼️ ${t.photos} photo${t.photos === 1 ? '' : 's'}` : ''}{t.photos > 0 && t.videos > 0 ? '  ·  ' : ''}{t.videos > 0 ? `🎬 ${t.videos} video${t.videos === 1 ? '' : 's'}` : ''}{t.total === 0 ? 'Empty album' : ''}</T>
        </View>
      </Card></Pressable></Link>);
  };
  return (
    <Screen><H>Media</H><Err msg={error} />
      <T muted>Browse our photo and video albums. Open an album to see every picture full size.</T>
      {albums.length > 0 && <SortFilterBar<AlbumSort> query={query} onQuery={setQuery} sort={sort} onSort={setSort} sortOptions={ALBUM_SORTS} category={kind} onCategory={(c) => setKind(c as Kind)}
        filterLabel="Show" showLabel="Show albums with" searchPlaceholder="Search albums…" shown={shown.length} total={albums.length}
        categories={[{ value: 'all', label: `All albums (${albums.length})` }, { value: 'image', label: `Photos only (${withPhotos})` }, { value: 'video', label: `Videos only (${withVideos})` }]}
        onClear={() => { setQuery(''); setSort('newest'); setKind('all'); }} />}
      {albums.length === 0 && <T muted>No albums yet.</T>}
      {albums.length > 0 && shown.length === 0 && <T muted>No albums match. Try another word or clear the filter.</T>}
      {shown.length > 0 && <>
        <SectionHeading icon={kind === 'video' ? '🎬' : kind === 'image' ? '🖼️' : '📁'} title={kind === 'video' ? 'Albums with videos' : kind === 'image' ? 'Albums with photos' : 'All albums'} count={shown.length} subtitle={kind === 'video' ? 'Albums that contain at least one video' : kind === 'image' ? 'Albums that contain at least one photo' : 'Photos and videos, newest first unless you change the sort'} />
        <Masonry items={shown} columns={columns} keyOf={(a) => a.id} render={card} />
      </>}
    </Screen>
  );
}
