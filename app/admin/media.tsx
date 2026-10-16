import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Screen, H, T, Card, Btn, Input, Chips, Err, Loading } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { useTable } from '../../lib/useQuery';
import { useApp } from '../../lib/app-context';
import { FullImage } from '../../components/FullImage';
import { Masonry } from '../../components/Masonry';
import { TagPicker } from '../../components/TagPicker';
import { Person, fetchTagsForEditor, saveTags, videoThumb } from '../../lib/tags';
import { embedInfo, providerName } from '../../lib/embed';
import { useLayout } from '../../lib/layout';
import { SortFilterBar } from '../../components/SortFilterBar';
import { SectionHeading } from '../../components/SectionHeading';
import { ITEM_SORTS, ItemSort, MediaType, filterItems, sortItems } from '../../lib/mediaView';

const MAX_MB = 50;

export default function AdminMedia() {
  const { can, session } = useApp(); const { cols } = useLayout();
  const albums = useTable('albums', (q) => q.order('created_at', { ascending: false }));
  const [album, setAlbum] = useState<string | null>(null);
  const items = useTable('media_items', (q) => (album ? q.eq('album_id', album).order('created_at', { ascending: false }) : q.limit(0)), [album]);
  const [caption, setCaption] = useState(''); const [video, setVideo] = useState('');
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [query, setQuery] = useState(''); const [sort, setSort] = useState<ItemSort>('newest'); const [kind, setKind] = useState<MediaType>('all');
  const [tagOpen, setTagOpen] = useState<string | null>(null); const [tags, setTags] = useState<Record<string, Person[]>>({}); const [counts, setCounts] = useState<Record<string, number>>({}); const [caps, setCaps] = useState<Record<string, string>>({});
  useEffect(() => {
    const ids = (items.data as any[]).map((m) => m.id); if (!ids.length) { setCounts({}); return; }
    supabase.from('content_tags').select('target_id').eq('target_type', 'media').in('target_id', ids).then(({ data }) => { const c: Record<string, number> = {}; (data ?? []).forEach((r: any) => { c[r.target_id] = (c[r.target_id] ?? 0) + 1; }); setCounts(c); });
  }, [items.data]);
  if (!can('media.manage')) return <Screen><T>No permission.</T></Screen>;
  if (albums.loading) return <Loading />;

  const extOf = (a: ImagePicker.ImagePickerAsset) => {
    const sub = (a.mimeType ?? '').split('/')[1];
    if (sub === 'quicktime') return 'mov';
    return sub || (a.type === 'video' ? 'mp4' : 'jpg');
  };

  const pick = async (kind: 'images' | 'videos') => {
    if (!album) return setErr('Choose an album first');
    setErr(null);
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: [kind], quality: 1, allowsMultipleSelection: true });
    if (res.canceled) return;
    let n = 0;
    for (const a of res.assets) {
      n++; setBusy(`Uploading ${n} of ${res.assets.length}…`);
      if (a.fileSize && a.fileSize > MAX_MB * 1048576) { setErr(`${a.fileName ?? 'File'} is over ${MAX_MB} MB — trim or compress it first.`); continue; }
      const contentType = a.mimeType ?? (kind === 'videos' ? 'video/mp4' : 'image/jpeg');
      const path = `${album}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extOf(a)}`;
      let body: any;
      if (Platform.OS === 'web') body = await (await fetch(a.uri)).blob();
      else { body = new FormData(); body.append('file', { uri: a.uri, name: path.split('/').pop(), type: contentType } as any); }
      const up = await supabase.storage.from('media').upload(path, body, { contentType });
      if (up.error) { setErr(up.error.message); break; }
      const { data } = supabase.storage.from('media').getPublicUrl(path);
      const { error } = await supabase.from('media_items').insert({ album_id: album, kind: kind === 'videos' ? 'video' : 'image', url: data.publicUrl, caption: caption || null });
      if (error) { setErr(error.message); break; }
    }
    setBusy(null); setCaption(''); await items.refresh();
  };
  const addLink = async () => {
    if (!album || !video.trim()) return setErr('Choose an album and paste a video link');
    const u = video.trim(); if (!/^https?:\/\//i.test(u)) return setErr('Paste a full link starting with https://');
    const { error } = await supabase.from('media_items').insert({ album_id: album, kind: 'video', url: u, caption: caption || null });
    if (error) return setErr(error.message);
    setVideo(''); setCaption(''); setErr(embedInfo(u).kind === 'link' ? 'Added, but this site cannot play inside the app, so visitors will be sent to the original page. Supported: YouTube, Vimeo, Dailymotion, Facebook, TikTok, Instagram, Google Drive, Streamable and video files.' : null); setInfo(embedInfo(u).kind === 'link' ? null : `${providerName(u)} video added. It plays inside the app.`); await items.refresh();
  };
  const remove = async (m: any) => {
    await supabase.from('media_items').delete().eq('id', m.id);
    const marker = '/object/public/media/';
    if (m.url.includes(marker)) await supabase.storage.from('media').remove([decodeURIComponent(m.url.split(marker)[1])]);
    await items.refresh();
  };

  const card = (m: any) => {
          const thumb = m.kind === 'video' ? videoThumb(m.url) : null;
          const tagged = tags[m.id] ?? []; const n = tagOpen === m.id ? tagged.length : counts[m.id] ?? 0;
          return (
            <Card>
              {m.kind === 'image' ? <FullImage uri={m.url} alt={m.caption || 'Photo'} /> : thumb ? <FullImage uri={thumb} alt="Video" /> : <T>▶ {m.url}</T>}
              <T muted style={{ fontSize: 12 }}>{m.kind === 'video' ? '🎬 Video' : '🖼️ Photo'}{n ? ` · 🏷 ${n} tagged` : ''}</T>
              <Input label="Caption / details" multiline value={caps[m.id] ?? m.caption ?? ''} onChangeText={(v) => setCaps((c) => ({ ...c, [m.id]: v }))} />
              {caps[m.id] !== undefined && caps[m.id] !== (m.caption ?? '') ? <Btn title="Save caption" kind="ghost" onPress={async () => { const { error } = await supabase.from('media_items').update({ caption: caps[m.id].trim() || null }).eq('id', m.id); if (error) return setErr(error.message); setCaps((c) => { const x = { ...c }; delete x[m.id]; return x; }); await items.refresh(); }} /> : null}
              <Btn title={tagOpen === m.id ? 'Close tagging' : n ? `Tag people (${n})` : 'Tag people'} kind="ghost" onPress={async () => { if (tagOpen === m.id) return setTagOpen(null); setTagOpen(m.id); setTags((t) => ({ ...t, [m.id]: t[m.id] ?? [] })); const cur = await fetchTagsForEditor('media', m.id); setTags((t) => ({ ...t, [m.id]: cur })); }} />
              {tagOpen === m.id ? <TagPicker value={tagged} suggestFrom={m.caption ?? ''} onChange={async (next) => { setTags((t) => ({ ...t, [m.id]: next })); try { await saveTags('media', m.id, next, session?.user.id); setCounts((c) => ({ ...c, [m.id]: next.length })); setErr(null); } catch (e: any) { setErr(e.message); } }} /> : null}
              <Btn title="Delete" kind="danger" onPress={() => remove(m)} />
            </Card>);
  };
  const all = items.data as any[]; const nPhotos = all.filter((m) => m.kind === 'image').length; const nVideos = all.length - nPhotos;
  const photos = sortItems(filterItems(all.filter((m) => m.kind === 'image'), kind, query), sort);
  const videos = sortItems(filterItems(all.filter((m) => m.kind === 'video'), kind, query), sort);

  return (
    <Screen>
      <H>Photos & videos</H>
      <T muted>Create albums under Admin → Albums, then add media here. Files up to {MAX_MB} MB.</T>
      <Chips options={(albums.data as any[]).map((a) => ({ value: a.id, label: a.title }))} value={album} onChange={setAlbum} />
      {album && (<>
        <Input label="Caption (optional, applies to this upload)" value={caption} onChangeText={setCaption} />
        <Btn title="Upload photos" onPress={() => pick('images')} disabled={!!busy} />
        <Btn title="Upload videos" onPress={() => pick('videos')} disabled={!!busy} />
        {busy ? <T muted>{busy}</T> : null}
        <Input label="Or add a video link (YouTube, Vimeo, Facebook, TikTok, Instagram, Google Drive, a .mp4 file…) — it plays inside the app" autoCapitalize="none" value={video} onChangeText={setVideo} />
        <Btn title="Add video link" kind="ghost" onPress={addLink} />
        <Err msg={err} />{info ? <T style={{ fontWeight: '700' }}>{info}</T> : null}
        {(items.data as any[]).length > 0 && <SortFilterBar<ItemSort> query={query} onQuery={setQuery} sort={sort} onSort={setSort} sortOptions={ITEM_SORTS} category={kind} onCategory={(c) => setKind(c as MediaType)}
          filterLabel="Show" showLabel="Show" searchPlaceholder="Search captions…" shown={photos.length + videos.length} total={(items.data as any[]).length}
          categories={[{ value: 'all', label: `Photos & videos (${(items.data as any[]).length})` }, { value: 'image', label: `Photos only (${nPhotos})` }, { value: 'video', label: `Videos only (${nVideos})` }]}
          onClear={() => { setQuery(''); setSort('newest'); setKind('all'); }} />}
        {photos.length > 0 && <><SectionHeading icon="🖼️" title="Photos" count={photos.length} subtitle="Edit captions, tag people or delete." /><Masonry items={photos} columns={Math.min(3, Math.max(1, cols))} keyOf={(m) => m.id} render={card} /></>}
        {videos.length > 0 && <><SectionHeading icon="🎬" title="Videos" count={videos.length} subtitle="Edit captions, tag people or delete." /><Masonry items={videos} columns={Math.min(3, Math.max(1, cols))} keyOf={(m) => m.id} render={card} /></>}
        {(items.data as any[]).length > 0 && photos.length + videos.length === 0 && <T muted>Nothing matches. Try another word or clear the filter.</T>}
      </>)}
    </Screen>
  );
}
