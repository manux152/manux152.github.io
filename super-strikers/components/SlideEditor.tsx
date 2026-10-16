import { useState } from 'react';
import { View } from 'react-native';
import { Btn, Chips, Input, T, Toggle } from './ui';
import { SinglePicture } from './SinglePicture';
import { embedInfo } from '../lib/embed';
import { FX_DEFAULT, FX_PRESETS, FX_RANGE, Fx, Slide, activePreset, clamp, fxFull } from '../lib/slides';

const ZOOM_PRESETS = [50, 75, 100, 125, 150, 200, 300].map((n) => ({ value: String(n), label: `${n}%` }));
const SPEEDS = [0.5, 1, 1.5, 2].map((n) => ({ value: String(n), label: `${n}×` }));
const BGS = [{ value: 'black', label: 'Black' }, { value: 'white', label: 'White' }, { value: 'brand', label: 'Club colour' }, { value: 'blur', label: 'Blurred picture' }];
const row = { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8, alignItems: 'center' as const };

function Stepper({ label, text, onMinus, onPlus, onReset, changed }: { label: string; text: string; onMinus: () => void; onPlus: () => void; onReset: () => void; changed: boolean }) {
  return (
    <View style={[row, { justifyContent: 'space-between' }]}>
      <T style={{ flex: 1, minWidth: 130 }}>{label}</T>
      <View style={row}>
        <Btn title="−" kind="ghost" onPress={onMinus} /><T style={{ minWidth: 58, textAlign: 'center', fontWeight: '800' }}>{text}</T><Btn title="+" kind="ghost" onPress={onPlus} />
        <Btn title="Reset" kind="ghost" onPress={onReset} disabled={!changed} />
      </View>
    </View>);
}
const H = ({ children }: { children: string }) => <T style={{ fontWeight: '800', fontSize: 16, marginTop: 6 }}>{children}</T>;

/** Everything for editing one hero slide: picture size, move, rotate, filters; and for videos: trim, speed, sound, loop, cover picture. */
export function SlideEditor({ slide, patch, getPlayer, onBake, onRestore, canBake, busy }: {
  slide: Slide; patch: (p: Partial<Slide>) => void; getPlayer: () => any; onBake: () => void; onRestore: () => void; canBake: boolean; busy: boolean }) {
  const isVideo = slide.kind === 'video'; const fx = fxFull(slide.fx); const zoom = Math.round((slide.zoom ?? 1) * 100); const [note, setNote] = useState<string | null>(null);
  const setFx = (p: Fx) => patch({ fx: { ...slide.fx, ...p } });
  const move = (dx: number, dy: number) => patch({ panX: clamp(Math.round(((slide.panX ?? 0) + dx) * 10) / 10, -1, 1), panY: clamp(Math.round(((slide.panY ?? 0) + dy) * 10) / 10, -1, 1) });
  const setZoom = (pct: number) => patch({ zoom: clamp(pct, 50, 300) / 100 });
  const turn = (d: number) => patch({ rotate: ((((slide.rotate ?? 0) + d) % 360 + 360) % 360) as any });
  const markTime = (which: 'start' | 'end') => {
    const p = getPlayer(); const t = Number(p?.currentTime); if (!p || !isFinite(t)) return setNote('Press play in the preview, pause where you want, then try again.');
    const v = Math.round(t * 10) / 10;
    if (which === 'start') { patch({ start: v, ...(slide.end && slide.end <= v ? { end: undefined } : {}) }); setNote(`Starts at ${v}s.`); }
    else if (v > (slide.start ?? 0)) { patch({ end: v }); setNote(`Ends at ${v}s.`); } else setNote('The end must come after the start.');
  };
  const dur = Number(getPlayer()?.duration);
  const info = embedInfo(slide.url); const embedded = info.kind === 'embed'; const yt = embedded && info.provider === 'YouTube';
  return (
    <View style={{ gap: 10 }}>
      <H>Size & position</H>
      <T muted>How the {isVideo ? 'video' : 'picture'} sits in the banner</T>
      <Chips options={[{ value: 'cover', label: 'Fill the banner (may crop)' }, { value: 'contain', label: 'Show the whole picture' }]} value={slide.fit ?? 'cover'} onChange={(v) => v && patch({ fit: v as any })} />
      <Stepper label="Zoom (below 100% zooms out)" text={`${zoom}%`} onMinus={() => setZoom(zoom - 10)} onPlus={() => setZoom(zoom + 10)} onReset={() => patch({ zoom: undefined })} changed={zoom !== 100} />
      <Chips options={ZOOM_PRESETS} value={ZOOM_PRESETS.some((z) => z.value === String(zoom)) ? String(zoom) : null} onChange={(v) => v && setZoom(Number(v))} />
      <T muted>Move the {isVideo ? 'video' : 'picture'}</T>
      <View style={row}>
        <Btn title="◀ Left" kind="ghost" onPress={() => move(-0.1, 0)} /><Btn title="Right ▶" kind="ghost" onPress={() => move(0.1, 0)} />
        <Btn title="▲ Up" kind="ghost" onPress={() => move(0, -0.1)} /><Btn title="Down ▼" kind="ghost" onPress={() => move(0, 0.1)} />
        <Btn title="Centre" kind="ghost" onPress={() => patch({ panX: undefined, panY: undefined })} disabled={!slide.panX && !slide.panY} />
      </View>
      <View style={row}>
        <Btn title="⟲ Rotate left" kind="ghost" onPress={() => turn(-90)} /><Btn title="⟳ Rotate right" kind="ghost" onPress={() => turn(90)} />
        <Btn title="⇆ Flip" kind="ghost" onPress={() => patch({ flipH: !slide.flipH })} /><Btn title="⇅ Flip upside down" kind="ghost" onPress={() => patch({ flipV: !slide.flipV })} />
      </View>
      <T muted>Background where the {isVideo ? 'video' : 'picture'} doesn't reach the edges</T>
      <Chips options={BGS.filter((b) => b.value !== 'blur' || !isVideo)} value={slide.bg ?? 'black'} onChange={(v) => v && patch({ bg: v as any })} />

      <H>Filters</H>
      <Chips options={FX_PRESETS.map((p) => ({ value: p.key, label: p.label }))} value={activePreset(slide.fx)} onChange={(v) => { const p = FX_PRESETS.find((x) => x.key === v); if (p) patch({ fx: p.fx }); }} />
      {(Object.keys(FX_RANGE) as (keyof Fx)[]).map((k) => { const r = FX_RANGE[k]; return (
        <Stepper key={k} label={r.label} text={`${fx[k]}${r.unit}`} changed={fx[k] !== FX_DEFAULT[k]}
          onMinus={() => setFx({ [k]: clamp(fx[k] - r.step, r.min, r.max) })} onPlus={() => setFx({ [k]: clamp(fx[k] + r.step, r.min, r.max) })} onReset={() => setFx({ [k]: FX_DEFAULT[k] })} />); })}
      <Btn title="Remove all filters" kind="ghost" onPress={() => patch({ fx: undefined })} disabled={!slide.fx} />

      {isVideo ? (<>
        <H>Video options</H>
        {embedded ? <T muted style={{ fontSize: 12 }}>This is a {info.provider} video playing inside the banner. {yt ? 'You can choose where it starts and ends.' : 'Start/end and speed are only available for YouTube links and video files.'} The slideshow moves on after the usual time.</T> : null}
        {!embedded || yt ? <T muted>Trim: play only part of the video{!embedded && isFinite(dur) && dur > 0 ? ` (length ${Math.round(dur * 10) / 10}s)` : ''}</T> : null}
        {(!embedded || yt) ? <View style={row}>
          <View style={{ width: 130 }}><Input label="Start (seconds)" keyboardType="numeric" value={slide.start != null ? String(slide.start) : ''} onChangeText={(t) => patch({ start: t === '' ? undefined : Math.max(0, Number(t.replace(',', '.')) || 0) })} /></View>
          <View style={{ width: 130 }}><Input label="End (seconds)" keyboardType="numeric" value={slide.end != null ? String(slide.end) : ''} onChangeText={(t) => patch({ end: t === '' ? undefined : Math.max(0, Number(t.replace(',', '.')) || 0) })} /></View>
        </View> : null}
        {!embedded ? <View style={row}>
          <Btn title="Start here" kind="ghost" onPress={() => markTime('start')} /><Btn title="End here" kind="ghost" onPress={() => markTime('end')} />
          <Btn title="Clear trim" kind="ghost" onPress={() => { patch({ start: undefined, end: undefined }); setNote(null); }} disabled={slide.start == null && slide.end == null} />
        </View> : null}
        {!embedded ? <T muted style={{ fontSize: 12 }}>Play the preview above, pause at the right moment, then press “Start here” or “End here”.{note ? ` ${note}` : ''}</T> : null}
        {!embedded ? <><T muted>Speed</T><Chips options={SPEEDS} value={String(slide.speed ?? 1)} onChange={(v) => v && patch({ speed: Number(v) === 1 ? undefined : Number(v) })} /></> : null}
        <Toggle label="Let visitors turn the sound on" hint="Off = the video is always silent (best for a banner). On = a small speaker button appears." value={slide.mute === false} onChange={(v) => patch({ mute: v ? false : undefined })} />
        <Toggle label="Repeat the video" hint={embedded ? 'Keeps the video looping inside the banner.' : 'When on, the slideshow moves on after the usual time instead of waiting for the video to end.'} value={!!slide.loop} onChange={(v) => patch({ loop: v || undefined })} />
        <SinglePicture label="Cover picture (optional)" hint="Shown while the video loads, and for visitors who choose “Reduce motion”." url={slide.poster ?? null} folder="hero" onChange={(u) => patch({ poster: u ?? undefined })} height={90} />
        <T muted style={{ fontSize: 12 }}>Trim, speed, zoom and filters are applied while the video plays. Your video file itself is not changed.</T>
      </>) : (<>
        <H>Make the edits permanent</H>
        <T muted style={{ fontSize: 12 }}>Until you do this, your zoom, position, rotation and filters are applied live on the site and your original picture is untouched. “Apply permanently” saves a new 16:9 picture with the edits baked in, so it looks the same everywhere.</T>
        <View style={row}>
          <Btn title={busy ? 'Working…' : 'Apply edits permanently'} onPress={onBake} disabled={busy || !canBake} />
          {slide.original ? <Btn title="Restore original picture" kind="ghost" onPress={onRestore} disabled={busy} /> : null}
        </View>
        {!canBake ? <T muted style={{ fontSize: 12 }}>This button works in the web admin.</T> : null}
      </>)}
    </View>
  );
}
