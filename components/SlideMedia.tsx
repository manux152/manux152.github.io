import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { TrText as Text } from './TrText';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { cssFilter, fitBox, Slide } from '../lib/slides';
import { knownRatio } from './FullImage';
import { EmbeddedVideo } from './EmbeddedVideo';
import { embedInfo } from '../lib/embed';

const fabric = typeof (globalThis as any).nativeFabricUIManager !== 'undefined';
const filterStyle = (slide: Slide): any => { const f = cssFilter(slide.fx); return f && (Platform.OS === 'web' || fabric) ? { filter: f } : null; };
const bgColor = (slide: Slide, brand: string) => (slide.bg === 'white' ? '#ffffff' : slide.bg === 'brand' ? brand : '#000000');

/** One slide of the hero banner: a picture or a video with its fit, zoom, move, rotate, flip and filters applied. Fills its parent. */
export function SlideMedia({ slide, brand = '#0B6E4F', play = true, controls = false, onEnded, onPlayer }: {
  slide: Slide; brand?: string; play?: boolean; controls?: boolean; onEnded?: () => void; onPlayer?: (p: any) => void }) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const fit = slide.fit ?? 'cover'; const rot = slide.rotate ?? 0; const zoom = slide.zoom ?? 1;
  const transform: any[] = [{ translateX: (slide.panX ?? 0) * (box.w / 2) }, { translateY: (slide.panY ?? 0) * (box.h / 2) }, { rotate: `${rot}deg` }, { scaleX: (slide.flipH ? -1 : 1) * zoom }, { scaleY: (slide.flipV ? -1 : 1) * zoom }];
  return (
    <View onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      style={[StyleSheet.absoluteFillObject, { overflow: 'hidden', backgroundColor: bgColor(slide, brand) }, filterStyle(slide)]}>
      {slide.kind === 'video' && embedInfo(slide.url).kind === 'embed'
        ? <EmbedSurface slide={slide} box={box} transform={transform} play={play} controls={controls} />
        : slide.kind === 'video'
        ? <VideoSurface slide={slide} box={box} transform={transform} play={play} controls={controls} onEnded={onEnded} onPlayer={onPlayer} />
        : <PictureSurface slide={slide} box={box} transform={transform} fit={fit} rot={rot} />}
    </View>
  );
}

function PictureSurface({ slide, box, transform, fit, rot }: { slide: Slide; box: { w: number; h: number }; transform: any[]; fit: 'cover' | 'contain'; rot: number }) {
  const [ratio, setRatio] = useState<number>(knownRatio(slide.url) ?? 16 / 9);
  // a 1000-px-wide reference box with the picture's shape, scaled to real pixels so it covers / fits the banner
  const iw = 1000, ih = iw / ratio; const sc = box.w ? fitBox(box.w, box.h, iw, ih, rot, fit).s : 1; const W = iw * sc, Hh = ih * sc;
  return (
    <>
      {slide.bg === 'blur' && fit === 'contain' ? <Image source={{ uri: slide.url }} accessibilityLabel="" contentFit="cover" blurRadius={Platform.OS === 'web' ? 0 : 25} style={[StyleSheet.absoluteFillObject, Platform.OS === 'web' ? ({ filter: 'blur(25px)', transform: [{ scale: 1.15 }] } as any) : null]} /> : null}
      {box.w > 0 ? (
        <View pointerEvents="none" style={{ position: 'absolute', left: box.w / 2 - W / 2, top: box.h / 2 - Hh / 2, width: W, height: Hh, transform }}>
          <Image source={{ uri: slide.url }} accessibilityLabel={slide.alt ?? ''} accessible={!!slide.alt} contentFit="fill" transition={250} style={{ width: '100%', height: '100%' }}
            onLoad={(e) => { const w = e.source?.width, h = e.source?.height; if (w && h && Math.abs(w / h - ratio) > 0.005) setRatio(w / h); }} />
        </View>) : null}
    </>
  );
}

// YouTube / Vimeo / Facebook… inside the banner. Muted autoplay without controls (a background video); controls appear when sound is allowed.
function EmbedSurface({ slide, box, transform, play, controls }: { slide: Slide; box: { w: number; h: number }; transform: any[]; play: boolean; controls: boolean }) {
  const interactive = controls || slide.mute === false;
  const info = embedInfo(slide.url);
  return (
    <>
      {slide.poster ? <Image source={{ uri: slide.poster }} accessibilityLabel="" contentFit={slide.fit ?? 'cover'} style={StyleSheet.absoluteFillObject} /> : null}
      {box.w > 0 && (play || controls) ? (
        <View style={{ position: 'absolute', left: 0, top: 0, width: box.w, height: box.h, transform, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
          {/* "cover" = scale the player up so it fills the banner; "contain" = keep it whole */}
          <View style={{ width: (slide.fit ?? 'cover') === 'cover' && info.kind === 'embed' ? Math.max(box.w, box.h * info.aspect) : '100%', aspectRatio: info.kind === 'embed' ? info.aspect : 16 / 9, maxHeight: (slide.fit ?? 'cover') === 'cover' ? undefined : box.h }}>
            <EmbeddedVideo url={slide.url} fill interactive={interactive} autoplay={!controls} mute={slide.mute !== false} loop={!!slide.loop || !controls} controls={interactive} start={slide.start} end={slide.end} />
          </View>
        </View>) : null}
    </>
  );
}

function VideoSurface({ slide, box, transform, play, controls, onEnded, onPlayer }: { slide: Slide; box: { w: number; h: number }; transform: any[]; play: boolean; controls: boolean; onEnded?: () => void; onPlayer?: (p: any) => void }) {
  const [sound, setSound] = useState(false); const [playing, setPlaying] = useState(false);
  const player = useVideoPlayer(slide.url, (p) => { p.loop = false; p.muted = true; });
  const latest = useRef({ slide, onEnded }); latest.current = { slide, onEnded };
  const wantSound = slide.mute === false && sound;
  useEffect(() => { onPlayer?.(player); }, [player]); // eslint-disable-line
  useEffect(() => { try { player.muted = slide.mute !== false ? true : !wantSound; player.playbackRate = slide.speed ?? 1; } catch { /* player not ready */ } }, [player, slide.mute, slide.speed, wantSound]);
  useEffect(() => { try { player.currentTime = slide.start ?? 0; } catch { /* ignore */ } }, [player, slide.start, slide.url]);
  useEffect(() => { try { if (play && !controls) player.play(); else if (!play) player.pause(); } catch { /* ignore */ } }, [player, play, controls]);
  useEffect(() => {
    const sub = player.addListener('playingChange', (e: any) => setPlaying(!!(e?.isPlaying ?? e)));
    const end = player.addListener('playToEnd', () => { const { slide: s, onEnded: cb } = latest.current; if (s.loop) { try { player.currentTime = s.start ?? 0; player.play(); } catch { /* ignore */ } } else cb?.(); });
    return () => { sub.remove(); end.remove(); };
  }, [player]);
  // trim: stop (or loop back) at the chosen end time
  useEffect(() => {
    if (!slide.end) return;
    const id = setInterval(() => {
      try {
        const { slide: s, onEnded: cb } = latest.current; if (!s.end || player.currentTime < s.end - 0.12) return;
        if (s.loop) player.currentTime = s.start ?? 0; else { player.pause(); cb?.(); }
      } catch { /* ignore */ }
    }, 200);
    return () => clearInterval(id);
  }, [player, slide.end, slide.start, slide.loop]);
  const showPosterOnly = !play && !controls && !!slide.poster && !playing;
  return (
    <>
      {slide.poster ? <Image source={{ uri: slide.poster }} accessibilityLabel="" contentFit={slide.fit ?? 'cover'} style={StyleSheet.absoluteFillObject} /> : null}
      {box.w > 0 && !showPosterOnly ? (
        <View style={{ position: 'absolute', left: 0, top: 0, width: box.w, height: box.h, transform }}>
          <VideoView player={player} style={{ width: '100%', height: '100%', backgroundColor: 'transparent' }} contentFit={slide.fit ?? 'cover'} nativeControls={controls} allowsFullscreen={controls} allowsPictureInPicture={false} />
        </View>) : null}
      {slide.mute === false && !controls ? (
        <Pressable accessibilityRole="button" accessibilityLabel={sound ? 'Mute video' : 'Turn video sound on'} onPress={() => setSound((v) => !v)} style={{ position: 'absolute', left: 10, top: 10, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.55)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#fff', fontSize: 20 }}>{sound ? '🔊' : '🔇'}</Text>
        </Pressable>) : null}
    </>
  );
}
