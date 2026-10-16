import { useEffect } from 'react';
import { Linking, Modal, Platform, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Avatar, Btn, T } from './ui';
import { VideoPlayer, isHosted } from './VideoPlayer';
import { EmbeddedVideo } from './EmbeddedVideo';
import { embedInfo } from '../lib/embed';
import { Person, personHref, videoThumb } from '../lib/tags';

export type LightItem = { id: string; kind: 'image' | 'video'; url: string; title?: string | null; caption?: string | null; meta?: string[]; people?: Person[] };

/** Full-screen viewer: the whole picture at full resolution, its caption and details, who is tagged, previous / next. */
export function Lightbox({ items, index, onIndex, onClose }: { items: LightItem[]; index: number | null; onIndex: (i: number) => void; onClose: () => void }) {
  const { height } = useWindowDimensions(); const router = useRouter();
  const open = index != null && items[index] != null; const it = open ? items[index!] : null;
  useEffect(() => {
    if (!open || Platform.OS !== 'web' || typeof window === 'undefined') return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); else if (e.key === 'ArrowRight' && index! < items.length - 1) onIndex(index! + 1); else if (e.key === 'ArrowLeft' && index! > 0) onIndex(index! - 1); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [open, index, items.length]); // eslint-disable-line
  if (!it) return null;
  const mediaH = Math.round(height * 0.6);
  const thumb = it.kind === 'video' ? videoThumb(it.url) : null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View accessibilityViewIsModal style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: Platform.OS === 'web' ? 12 : 48, paddingBottom: 6 }}>
          <T style={{ color: '#fff', fontWeight: '700' }}>{index! + 1} / {items.length}</T>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={{ padding: 10 }}><T style={{ color: '#fff', fontSize: 22 }}>✕</T></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 12, gap: 12, alignItems: 'center' }}>
          <View style={{ width: '100%', maxWidth: 1200 }}>
            {it.kind === 'image' ? <Image source={{ uri: it.url }} accessibilityLabel={it.caption || it.title || 'Picture'} contentFit="contain" style={{ width: '100%', height: mediaH }} />
              : isHosted(it.url) ? <VideoPlayer key={it.id} uri={it.url} />
              : embedInfo(it.url).kind === 'embed' ? <EmbeddedVideo key={it.id} url={it.url} autoplay />
              : (<View style={{ gap: 10 }}>
                  {thumb ? <Image source={{ uri: thumb }} accessibilityLabel="" contentFit="contain" style={{ width: '100%', height: Math.round(mediaH * 0.8) }} /> : null}
                  <Btn title="▶ Watch this video (opens the original site)" onPress={() => Linking.openURL(it.url)} />
                </View>)}
          </View>
          <View style={{ width: '100%', maxWidth: 1200, gap: 6 }}>
            {it.title ? <T style={{ color: '#fff', fontWeight: '800', fontSize: 18 }}>{it.title}</T> : null}
            {it.caption && it.caption !== it.title ? <T style={{ color: '#E6E8EC', lineHeight: 22 }}>{it.caption}</T> : null}
            {(it.meta ?? []).map((m, i) => <T key={i} style={{ color: '#AEB6C1', fontSize: 13 }}>{m}</T>)}
            {(it.people ?? []).length > 0 ? (
              <View style={{ gap: 6, marginTop: 6 }}>
                <T style={{ color: '#AEB6C1', fontSize: 13, fontWeight: '700' }}>In this {it.kind === 'video' ? 'video' : 'picture'}</T>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {it.people!.map((p) => (
                    <Pressable key={p.kind + p.id} accessibilityRole="link" accessibilityLabel={`Open ${p.name}`} onPress={() => { onClose(); router.push(personHref(p) as any); }}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 999, paddingVertical: 4, paddingLeft: 4, paddingRight: 12 }}>
                      <Avatar url={p.photo} name={p.name} size={28} /><T style={{ color: '#fff', fontWeight: '600' }}>{p.name}</T>
                    </Pressable>))}
                </View>
              </View>) : null}
          </View>
        </ScrollView>
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 12, padding: 12, paddingBottom: Platform.OS === 'web' ? 14 : 30 }}>
          <Btn title="‹ Previous" kind="ghost" disabled={index === 0} onPress={() => onIndex(index! - 1)} />
          <Btn title="Next ›" kind="ghost" disabled={index === items.length - 1} onPress={() => onIndex(index! + 1)} />
        </View>
      </View>
    </Modal>
  );
}
