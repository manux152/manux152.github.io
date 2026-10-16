import { useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { Screen, H, T, Card, Btn, Input, Chips, Toggle, Err } from '../../components/ui';
import { ImageEditTools } from '../../components/ImageEditTools';
import { SlideEditor } from '../../components/SlideEditor';
import { SlideMedia } from '../../components/SlideMedia';
import { supabase } from '../../lib/supabase';
import { useApp } from '../../lib/app-context';
import { MAX_HERO_SLIDES, MAX_VIDEO_MB, canEditImages, editImage, pickImages, pickVideo, removeAsset, uploadBranding, uploadHeroVideo } from '../../lib/imageTools';
import { bakeSlide, canBake } from '../../lib/bakeImage';
import { Slide, cleanSlide, isWeb } from '../../lib/slides';
import { embedInfo, providerName } from '../../lib/embed';

const FOCUS = [{ value: 'top', label: 'Top' }, { value: 'center', label: 'Middle' }, { value: 'bottom', label: 'Bottom' }];
const DIM = [0, 20, 30, 40, 50, 60, 70].map((n) => ({ value: String(n), label: n === 0 ? 'None' : `${n}%` }));
const SECS = [3, 5, 8, 12].map((n) => ({ value: String(n), label: `${n} sec` }));

// Admin → Hero slider: up to 20 pictures and videos for the home-page banner, each with its own editing.
export default function HeroAdmin() {
  const { can, settings, reload } = useApp();
  const brand = typeof settings.primary_color === 'string' ? settings.primary_color : '#0B6E4F';
  const [slides, setSlides] = useState<Slide[]>(() => (Array.isArray(settings.hero_slides) ? (settings.hero_slides.map(cleanSlide).filter(Boolean) as Slide[]) : []));
  const [removed, setRemoved] = useState<string[]>([]);
  const [sel, setSel] = useState<number | null>(null);
  const [interval, setIntervalSecs] = useState<string>(String(Number(settings.hero_interval) || 5));
  const [autoplay, setAutoplay] = useState<boolean>(settings.hero_autoplay !== false && settings.hero_autoplay !== 'false');
  const [videoLink, setVideoLink] = useState('');
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null);
  const player = useRef<any>(null);
  if (!can('settings.manage')) return <Screen><T>No permission.</T></Screen>;

  const patch = (i: number, p: Partial<Slide>) => setSlides((cur) => cur.map((s, k) => (k === i ? { ...s, ...p } : s)));
  const trash = (u?: string) => { if (u) setRemoved((r) => [...r, u]); };

  const addPictures = async () => {
    setErr(null); setMsg(null);
    const room = MAX_HERO_SLIDES - slides.length; if (room <= 0) return setErr(`You can have up to ${MAX_HERO_SLIDES} slides. Remove one first.`);
    setBusy(true);
    try {
      const picked = await pickImages(room); const added: Slide[] = [];
      for (const a of picked) {
        if (a.fileSize && a.fileSize > 12 * 1048576) { setErr('Some pictures were skipped because they are over 12 MB.'); continue; }
        const prepared = canEditImages ? await editImage(a.uri, []) : a;
        added.push({ url: await uploadBranding('hero', prepared as any), focus: 'center', dim: 40 });
      }
      if (added.length) { setSlides((c) => [...c, ...added]); setSel(slides.length); }
    } catch (e: any) { setErr(e.message ?? 'Upload failed'); }
    setBusy(false);
  };
  const addVideo = async () => {
    setErr(null); setMsg(null); if (slides.length >= MAX_HERO_SLIDES) return setErr(`You can have up to ${MAX_HERO_SLIDES} slides. Remove one first.`);
    setBusy(true);
    try {
      const a = await pickVideo(); if (!a) { setBusy(false); return; }
      const url = await uploadHeroVideo(a);
      setSlides((c) => [...c, { url, kind: 'video', focus: 'center', dim: 30 }]); setSel(slides.length); setMsg('Video added. Use the editor below to trim it, change its speed or add a filter.');
    } catch (e: any) { setErr(e.message ?? 'Upload failed'); }
    setBusy(false);
  };
  const addVideoLink = () => {
    setErr(null); const u = videoLink.trim();
    if (!isWeb(u) || embedInfo(u).kind === 'link') return setErr('That link cannot play inside the app. Paste a YouTube, Vimeo, Dailymotion, Facebook, TikTok, Instagram, Google Drive or Streamable video link, or a direct link to a video file (.mp4, .webm, .mov).');
    if (slides.length >= MAX_HERO_SLIDES) return setErr(`You can have up to ${MAX_HERO_SLIDES} slides.`);
    setSlides((c) => [...c, { url: u, kind: 'video', focus: 'center', dim: 30 }]); setSel(slides.length); setVideoLink(''); setMsg(`${providerName(u)} video added. It plays inside the banner, without leaving your site.`);
  };
  const move = (i: number, d: number) => { const j = i + d; if (j < 0 || j >= slides.length) return; const c = [...slides]; [c[i], c[j]] = [c[j], c[i]]; setSlides(c); setSel(j); };
  const remove = (i: number) => { const s = slides[i]; trash(s.url); trash(s.original); trash(s.poster); setSlides(slides.filter((_, k) => k !== i)); setSel(null); };
  const duplicate = (i: number) => { if (slides.length >= MAX_HERO_SLIDES) return setErr(`You can have up to ${MAX_HERO_SLIDES} slides.`); const c = [...slides]; c.splice(i + 1, 0, { ...slides[i], original: undefined }); setSlides(c); setSel(i + 1); setMsg('Copied. Both slides share the same file, so removing one keeps the other working.'); };

  const bake = async (i: number) => {
    setErr(null); setMsg(null); setBusy(true);
    try {
      const s = slides[i]; const out = await bakeSlide(s, brand);
      const url = await uploadBranding('hero', out as any);
      const keep = s.original ?? s.url; if (s.original) trash(s.url);   // an earlier baked copy is no longer needed
      patch(i, { url, original: keep, zoom: undefined, panX: undefined, panY: undefined, rotate: undefined, flipH: undefined, flipV: undefined, fx: undefined, fit: 'cover', bg: undefined });
      setMsg(out.filtersApplied ? 'Edits applied. The picture is saved as a new copy. Press Save slideshow to publish.' : 'Edits applied, but this browser cannot bake filters into the picture. Use Chrome or Edge to include them.');
    } catch (e: any) { setErr(`Couldn't apply the edits (${e?.message ?? 'unknown error'}).`); }
    setBusy(false);
  };
  const restore = (i: number) => { const s = slides[i]; if (!s.original) return; trash(s.url); patch(i, { url: s.original, original: undefined, zoom: undefined, panX: undefined, panY: undefined, rotate: undefined, flipH: undefined, flipV: undefined, fx: undefined, fit: undefined, bg: undefined }); setMsg('Original picture restored. Press Save slideshow to publish.'); };

  const save = async () => {
    setErr(null); setMsg(null);
    for (const [k, s] of slides.entries()) {
      if (s.link && !s.link.startsWith('/') && !/^https?:\/\//i.test(s.link)) return setErr(`Slide ${k + 1}: the link must start with / (for example /tryouts) or https://`);
      if (s.kind === 'video' && s.start != null && s.end != null && s.end <= s.start) return setErr(`Slide ${k + 1}: the video end time must come after the start time.`);
    }
    setBusy(true);
    const clean = slides.map((s) => cleanSlide(s)).filter(Boolean) as Slide[];
    const rows = [{ key: 'hero_slides', value: clean }, { key: 'hero_interval', value: Number(interval) || 5 }, { key: 'hero_autoplay', value: autoplay }];
    const { error } = await supabase.from('site_settings').upsert(rows, { onConflict: 'key' });
    setBusy(false);
    if (error) return setErr(error.message);
    const still = new Set(clean.flatMap((s) => [s.url, s.original, s.poster].filter(Boolean) as string[]));
    for (const u of removed) if (!still.has(u)) await removeAsset(u);
    setRemoved([]); setSlides(clean); await reload(); setMsg('Saved. The home page slideshow is updated.');
  };
  const cur = sel != null ? slides[sel] : null;
  return (
    <Screen>
      <H>Hero slider</H>
      <T muted>Pictures and videos slide across the top of the home page. Add up to {MAX_HERO_SLIDES} ({slides.length} added). Wide pictures (16:9) look best, or choose “Show the whole picture” for any shape.</T>
      <Card>
        <T style={{ fontWeight: '800' }}>Slideshow</T>
        <Toggle label="Slide automatically" hint="Visitors with “Reduce motion” on always get a manual slideshow. Videos play to their end before the show moves on." value={autoplay} onChange={setAutoplay} />
        <T muted>Time on each picture</T><Chips options={SECS} value={interval} onChange={(v) => v && setIntervalSecs(v)} />
      </Card>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Btn title={busy ? 'Working…' : slides.length >= MAX_HERO_SLIDES ? 'Maximum reached' : '+ Add pictures'} onPress={addPictures} disabled={busy || slides.length >= MAX_HERO_SLIDES} />
        <Btn title={busy ? 'Working…' : '🎬 Add a video'} kind="ghost" onPress={addVideo} disabled={busy || slides.length >= MAX_HERO_SLIDES} />
      </View>
      <T muted style={{ fontSize: 12 }}>Videos: up to {MAX_VIDEO_MB} MB (mp4 works best). Keep them short and silent for a banner.</T>
      <Input label="Or paste a video link (YouTube, Vimeo, Facebook, TikTok, Instagram, Google Drive… or a .mp4 file)" autoCapitalize="none" keyboardType="url" value={videoLink} onChangeText={setVideoLink} placeholder="https://…/clip.mp4" />
      <Btn title="Add this video link" kind="ghost" onPress={addVideoLink} disabled={!videoLink.trim()} />
      {slides.length === 0 ? <Card><T muted>No slides yet. Until you add some, the home page uses the single banner picture from Admin → Website (if any).</T></Card> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {slides.map((s, i) => (
          <View key={s.url + i} style={{ width: 150, gap: 4 }}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Edit slide ${i + 1}${s.kind === 'video' ? ' (video)' : ''}`} accessibilityState={{ selected: sel === i }} onPress={() => setSel(i)}
              style={{ borderRadius: 10, overflow: 'hidden', borderWidth: sel === i ? 3 : 1, borderColor: sel === i ? '#2f7fd8' : '#8884', aspectRatio: 16 / 9, backgroundColor: '#000' }}>
              {s.kind === 'video' ? (s.poster ? <Image source={{ uri: s.poster }} accessibilityLabel="" style={{ width: '100%', height: '100%' }} contentFit="cover" /> : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><T style={{ color: '#fff', fontSize: 28 }}>▶</T></View>)
                : <View pointerEvents="none" style={{ flex: 1 }}><SlideMedia slide={s} brand={brand} /></View>}
              {s.kind === 'video' ? <View style={{ position: 'absolute', left: 6, bottom: 6, backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 6, paddingHorizontal: 6 }}><T style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>VIDEO</T></View> : null}
            </Pressable>
            <T muted style={{ fontSize: 12 }}>{i + 1}{s.caption ? ` · ${s.caption}` : ''}</T>
          </View>))}
      </View>
      {cur && sel != null ? (
        <Card>
          <T style={{ fontWeight: '800' }}>{cur.kind === 'video' ? 'Video' : 'Picture'} {sel + 1} of {slides.length}</T>
          <T muted style={{ fontSize: 12 }}>Live preview of the banner. {cur.kind === 'video' ? 'Use the player controls to play and pause.' : 'Edits show here instantly.'}</T>
          <View style={{ borderRadius: 12, overflow: 'hidden', backgroundColor: '#000', aspectRatio: 16 / 9 }}>
            <SlideMedia key={cur.url} slide={cur} brand={brand} controls={cur.kind === 'video'} play={false} onPlayer={(p) => { player.current = p; }} />
            <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: `rgba(0,0,0,${(cur.dim ?? 40) / 100})` }} />
            {cur.caption ? <View pointerEvents="none" style={{ position: 'absolute', left: 12, top: 10 }}><T style={{ color: '#fff', fontWeight: '700' }}>{cur.caption}</T></View> : null}
          </View>
          <SlideEditor slide={cur} patch={(p) => patch(sel, p)} getPlayer={() => player.current} onBake={() => bake(sel)} onRestore={() => restore(sel)} canBake={canBake} busy={busy} />
          <T style={{ fontWeight: '800', fontSize: 16, marginTop: 6 }}>Text & link</T>
          <T muted>Darken (keeps white text readable)</T><Chips options={DIM} value={String(cur.dim ?? 40)} onChange={(v) => v != null && patch(sel, { dim: Number(v) })} />
          <Input label="Caption (optional)" value={cur.caption ?? ''} onChangeText={(x) => patch(sel, { caption: x })} />
          <Input label="Describe it (for screen readers)" value={cur.alt ?? ''} onChangeText={(x) => patch(sel, { alt: x })} />
          <Input label="Caption link (optional, e.g. /tryouts or https://…)" autoCapitalize="none" value={cur.link ?? ''} onChangeText={(x) => patch(sel, { link: x })} />
          {cur.kind !== 'video' ? (<>
            <T style={{ fontWeight: '800', fontSize: 16, marginTop: 6 }}>Crop to a new shape</T>
            <T muted style={{ fontSize: 12 }}>Cuts the picture itself (saves a new copy). For zoom, position and filters use the controls above.</T>
            <ImageEditTools url={cur.url} folder="hero" onChange={(u) => { if (!cur.original) trash(cur.url); patch(sel, { url: u }); }} />
          </>) : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
            <Btn title="↑ Move earlier" kind="ghost" onPress={() => move(sel, -1)} disabled={sel === 0} />
            <Btn title="↓ Move later" kind="ghost" onPress={() => move(sel, 1)} disabled={sel === slides.length - 1} />
            <Btn title="Duplicate" kind="ghost" onPress={() => duplicate(sel)} />
            <Btn title="Remove" kind="danger" onPress={() => remove(sel)} />
          </View>
        </Card>) : slides.length > 0 ? <T muted>Tap a slide above to edit it.</T> : null}
      <Err msg={err} />{msg ? <T style={{ fontWeight: '700' }}>{msg}</T> : null}
      <Btn title={busy ? 'Saving…' : 'Save slideshow'} onPress={save} disabled={busy} />
    </Screen>
  );
}
