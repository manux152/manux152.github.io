import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { thumbUrl } from '../lib/thumb';

/** Uniform grid tile: every photo is the same size (centre-cropped to fill), loaded as a small compressed copy.
 *  Tapping opens the viewer, which shows the full original. Falls back to the original if no small copy can be made. */
export function PhotoTile({ uri, alt, onPress, ratio = 4 / 5, radius = 10 }: { uri: string; alt: string; onPress: () => void; ratio?: number; radius?: number }) {
  const [small, setSmall] = useState(true);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={alt || 'Open photo'} onPress={onPress}>
      <View style={{ width: '100%', aspectRatio: ratio, borderRadius: radius, overflow: 'hidden', backgroundColor: '#E6E8EC' }}>
        <Image source={{ uri: small ? thumbUrl(uri) : uri }} accessibilityLabel={alt} contentFit="cover" contentPosition="center" transition={120}
          onError={() => { if (small) setSmall(false); }} style={{ width: '100%', height: '100%' }} />
      </View>
    </Pressable>
  );
}
