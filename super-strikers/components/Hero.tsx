import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, View } from 'react-native';
import { TrText as Text } from './TrText';
import { Image } from 'expo-image';
import { SlideMedia } from './SlideMedia';
import { Slide, cleanSlide } from '../lib/slides';
import { embedInfo } from '../lib/embed';
import { useRouter } from 'expo-router';
import { useApp } from '../lib/app-context';
import { useLayout } from '../lib/layout';
import { useTheme } from '../lib/theme';

export type { Slide } from '../lib/slides';

export function readSlides(settings: Record<string, any>): Slide[] {
  const raw = settings.hero_slides;
  const list: Slide[] = Array.isArray(raw) ? (raw.map((s) => cleanSlide(s)).filter(Boolean) as Slide[]).slice(0, 20) : [];
  if (list.length === 0 && typeof settings.hero_image_url === 'string' && /^https?:\/\//i.test(settings.hero_image_url)) list.push({ url: settings.hero_image_url });
  return list;
}

// Home-page banner: a sliding picture show (up to 20 pictures) with title, subtitle and buttons on top. Edited in Admin → Hero slider.
export function Hero() {
  const { settings } = useApp(); const router = useRouter(); const { wide } = useLayout(); const { prefs, fs } = useTheme();
  const color = settings.primary_color ?? '#0B6E4F';
  const slides = useMemo(() => readSlides(settings), [settings.hero_slides, settings.hero_image_url]); // eslint-disable-line
  const [i, setI] = useState(0); const [paused, setPaused] = useState(false);
  const n = slides.length; const idx = n ? Math.min(i, n - 1) : 0; const slide = slides[idx];
  const interval = Math.min(15, Math.max(3, Number(settings.hero_interval) || 5)) * 1000;
  const autoplay = settings.hero_autoplay !== false && settings.hero_autoplay !== 'false' && !prefs.reduceMotion && !paused && n > 1;
  // a video that is not looping plays to its end (or trim point) before the show moves on
  const videoHold = slide?.kind === 'video' && !slide.loop && embedInfo(slide.url).kind === 'file';   // embedded players can't tell us when they finish, so they use the normal timer

  const go = useCallback((d: number) => setI((c) => (n ? (c + d + n) % n : 0)), [n]);
  useEffect(() => { if (!autoplay) return; if (videoHold) { const t = setTimeout(() => go(1), 120000); return () => clearTimeout(t); }   // safety net if a video never finishes
    const t = setInterval(() => go(1), interval); return () => clearInterval(t); }, [autoplay, interval, go, videoHold, idx]);
  useEffect(() => { const next = n > 1 ? slides[(idx + 1) % n] : null; if (next && next.kind !== 'video') Image.prefetch(next.url).catch(() => {}); }, [idx, n, slides]);
  useEffect(() => { if (i >= n && n > 0) setI(0); }, [n, i]);

  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 20 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
    onPanResponderRelease: (_e, g) => { if (g.dx < -40) go(1); else if (g.dx > 40) go(-1); },
  }), [go]);

  const title = settings.hero_title || settings.team_name || '';
  const ctaLabel = settings.hero_cta_label, ctaRoute = settings.hero_cta_route;
  const btn = (label: string, route: string, primary: boolean) => (
    <Pressable key={label} accessibilityRole="button" accessibilityLabel={label} onPress={() => router.push(route as any)}
      style={(s: any) => ({ backgroundColor: primary ? '#fff' : 'rgba(255,255,255,0.2)', borderWidth: primary ? 0 : 1, borderColor: 'rgba(255,255,255,0.7)', borderRadius: 10, paddingVertical: 11, paddingHorizontal: 18, minHeight: 44, justifyContent: 'center', opacity: s.pressed ? 0.8 : s.hovered ? 0.92 : 1 })}>
      <Text style={{ color: primary ? '#0b2a1f' : '#fff', fontWeight: '800', fontSize: fs(15) }}>{label}</Text>
    </Pressable>);
  const ctl = (label: string, glyph: string, onPress: () => void) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={6}
      style={(s: any) => ({ width: 44, height: 44, borderRadius: 22, backgroundColor: s.hovered || s.pressed ? 'rgba(0,0,0,0.75)' : 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)' })}>
      <Text style={{ color: '#fff', fontSize: 20, fontWeight: '800' }}>{glyph}</Text>
    </Pressable>);
  const dim = Math.min(80, Math.max(20, slide?.dim ?? 40)) / 100;

  return (
    <View accessibilityRole="none" accessibilityLabel={n > 1 ? `Picture slideshow, slide ${idx + 1} of ${n}` : undefined} {...(n > 1 ? pan.panHandlers : {})}
      style={{ borderRadius: 16, overflow: 'hidden', backgroundColor: color, minHeight: wide ? 340 : 240, justifyContent: 'flex-end' }}>
      {slide ? <SlideMedia key={slide.url + idx} slide={slide} brand={color} play={!paused && !prefs.reduceMotion} onEnded={() => { if (autoplay) go(1); }} /> : null}
      {slide ? <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: `rgba(0,0,0,${dim})` }} /> : null}
      <View style={{ padding: wide ? 32 : 18, paddingBottom: n > 1 ? (wide ? 36 : 24) : undefined, gap: 8 }}>
        {slide?.caption ? (slide.link
          ? <Pressable accessibilityRole="link" onPress={() => router.push(slide.link as any)}><Text style={{ color: '#fff', fontSize: fs(14), fontWeight: '700', textDecorationLine: 'underline' }}>{slide.caption} →</Text></Pressable>
          : <Text style={{ color: '#fff', fontSize: fs(14), fontWeight: '700' }}>{slide.caption}</Text>) : null}
        <Text accessibilityRole="header" style={{ color: '#fff', fontSize: fs(wide ? 40 : 28), fontWeight: '900' }}>{title}</Text>
        {settings.hero_subtitle ? <Text style={{ color: '#fff', fontSize: fs(wide ? 18 : 15), opacity: 0.97 }}>{settings.hero_subtitle}</Text> : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6 }}>
          {ctaLabel && ctaRoute ? btn(ctaLabel, ctaRoute, true) : null}
          {btn('Fixtures', '/matches', !(ctaLabel && ctaRoute))}
          {settings.shop_enabled !== false ? btn('Shop', '/shop', false) : null}
        </View>
      </View>
      {n > 1 && (
        <>
          <View style={{ position: 'absolute', top: 0, bottom: 0, left: 8, justifyContent: 'center' }} pointerEvents="box-none">{ctl('Previous slide', '‹', () => go(-1))}</View>
          <View style={{ position: 'absolute', top: 0, bottom: 0, right: 8, justifyContent: 'center' }} pointerEvents="box-none">{ctl('Next slide', '›', () => go(1))}</View>
          <View style={{ position: 'absolute', top: 10, right: 10 }}>{!prefs.reduceMotion && ctl(paused ? 'Play slideshow' : 'Pause slideshow', paused ? '▶' : '❚❚', () => setPaused((p) => !p))}</View>
          <View accessibilityRole="tablist" style={{ position: 'absolute', bottom: 8, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 4 }}>
            {slides.map((_, k) => (
              <Pressable key={k} accessibilityRole="tab" accessibilityLabel={`Go to slide ${k + 1} of ${n}`} accessibilityState={{ selected: k === idx }} onPress={() => setI(k)} hitSlop={8}
                style={{ paddingVertical: 8, paddingHorizontal: 4 }}><View style={{ width: k === idx ? 22 : 10, height: 10, borderRadius: 5, backgroundColor: k === idx ? '#fff' : 'rgba(255,255,255,0.55)', borderWidth: 1, borderColor: 'rgba(0,0,0,0.35)' }} /></Pressable>
            ))}
          </View>
        </>
      )}
    </View>
  );
}
