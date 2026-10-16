import { createElement } from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { Btn, T } from './ui';
import { EmbedOpts, embedInfo } from '../lib/embed';

// react-native-webview is optional (phones only). On the web a normal <iframe> is used and nothing needs installing.
let WebView: any = null;
try { WebView = require('react-native-webview').WebView; } catch { WebView = null; }

/** Plays a YouTube / Vimeo / Facebook / TikTok… link inside the app. `fill` stretches it over its parent (used in the hero banner). */
export function EmbeddedVideo({ url, fill = false, interactive = true, ...opts }: { url: string; fill?: boolean; interactive?: boolean } & EmbedOpts) {
  const info = embedInfo(url);
  if (info.kind !== 'embed') return null;
  const src = info.src(opts);
  const box = fill ? StyleSheet.absoluteFillObject : { width: '100%' as const, aspectRatio: info.aspect, maxHeight: 620 };
  if (Platform.OS === 'web') {
    return (
      <View style={[box as any, { backgroundColor: '#000', overflow: 'hidden', borderRadius: fill ? 0 : 10 }, !interactive ? ({ pointerEvents: 'none' } as any) : null]}>
        {createElement('iframe', {
          src, title: `${info.provider} video`, allow: 'autoplay; fullscreen; picture-in-picture; encrypted-media; clipboard-write', allowFullScreen: true,
          referrerPolicy: 'strict-origin-when-cross-origin', sandbox: 'allow-scripts allow-same-origin allow-presentation allow-popups allow-forms', loading: 'lazy',
          style: { border: 0, width: '100%', height: '100%', display: 'block' },
        })}
      </View>);
  }
  if (WebView) {
    return (
      <View style={[box as any, { backgroundColor: '#000', overflow: 'hidden', borderRadius: fill ? 0 : 10 }]} pointerEvents={interactive ? 'auto' : 'none'}>
        <WebView source={{ uri: src }} allowsFullscreenVideo allowsInlineMediaPlayback mediaPlaybackRequiresUserAction={!opts.autoplay} javaScriptEnabled domStorageEnabled
          originWhitelist={['https://*']} setSupportMultipleWindows={false} style={{ backgroundColor: '#000' }}
          onShouldStartLoadWithRequest={(r: any) => r.url === src || /^https:\/\/(www\.)?(youtube-nocookie\.com|youtube\.com|player\.vimeo\.com|dailymotion\.com|facebook\.com|drive\.google\.com|streamable\.com|tiktok\.com|instagram\.com)\//i.test(r.url)} />
      </View>);
  }
  // Phone build without the optional package: show the picture and a way to watch
  return (
    <View style={[box as any, { backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, overflow: 'hidden' }]}>
      {info.thumb ? <Image source={{ uri: info.thumb }} accessibilityLabel="" contentFit="cover" style={[StyleSheet.absoluteFillObject, { opacity: 0.5 }]} /> : null}
      {!fill ? <><T style={{ color: '#fff', textAlign: 'center' }}>Playing {info.provider} videos inside the phone app needs one more package.</T><Btn title="▶ Watch it now" onPress={() => Linking.openURL(url)} /></> : null}
    </View>);
}
