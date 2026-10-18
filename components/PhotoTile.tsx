import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { thumbUrl } from '../lib/thumb';

/** Uniform grid tile: every photo sits in the same-size frame and is shown WHOLE (never cropped or centred-and-cut).
 *  A soft blurred copy fills any empty space so the tiles look tidy. Loads a small compressed copy;
 *  tapping opens the viewer, which shows the full original. Falls back to the original if no small copy can be made. */
export function PhotoTile({ uri, alt, onPress, ratio = 4 / 5, radius = 10 }: { uri: string; alt: string; onPress: () => void; ratio?: number; radius?: number }) {
  const [small, setSmall] = useState(true);
  const src = small ? thumbUrl(uri) : uri; const fail = () => { if (small) setSmall(false); };
  const fill = { position: 'absolute' as const, left: 0, right: 0, top: 0, bottom: 0 };
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={alt || 'Open photo'} onPress={onPress}>
      <View style={{ width: '100%', aspectRatio: ratio, borderRadius: radius, overflow: 'hidden', backgroundColor: '#0B1B3A' }}>
        <Image source={{ uri: src }} accessibilityLabel="" contentFit="cover" blurRadius={25} style={{ ...fill, opacity: 0.55 }} onError={fail} />
        <Image source={{ uri: src }} accessibilityLabel={alt} contentFit="contain" transition={120} style={fill} onError={fail} />
      </View>
    </Pressable>
  );
}
