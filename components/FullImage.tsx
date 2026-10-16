import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';

// Remembers each picture's real shape so grids don't jump when it is shown again.
const ratios = new Map<string, number>();
export const knownRatio = (uri: string) => ratios.get(uri);

/** Shows the WHOLE picture in its own proportions (never cropped) at the full width it is given. */
export function FullImage({ uri, alt, radius = 10, onPress, fallbackRatio = 4 / 3, children, maxHeight }: {
  uri: string; alt: string; radius?: number; onPress?: () => void; fallbackRatio?: number; children?: React.ReactNode; maxHeight?: number }) {
  const [ratio, setRatio] = useState<number>(ratios.get(uri) ?? fallbackRatio);
  const img = (
    <View style={{ width: '100%', aspectRatio: ratio, maxHeight, borderRadius: radius, overflow: 'hidden', backgroundColor: '#E6E8EC' }}>
      <Image source={{ uri }} accessibilityLabel={alt} contentFit="contain" transition={120} style={{ width: '100%', height: '100%' }}
        onLoad={(e) => { const w = e.source?.width, h = e.source?.height; if (w && h) { const r = w / h; ratios.set(uri, r); if (Math.abs(r - ratio) > 0.01) setRatio(r); } }} />
      {children}
    </View>
  );
  return onPress ? <Pressable accessibilityRole="button" accessibilityLabel={alt || 'Open picture'} onPress={onPress}>{img}</Pressable> : img;
}
