import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Image } from 'expo-image';
import { socialEmoji, socialIconUrl, type SocialLink } from '../lib/socialIcons';

/** A round white badge with the brand's real logo (or the admin's own picture). Falls back to an emoji if the picture can't load. */
export function SocialIcon({ link, size = 18 }: { link: SocialLink; size?: number }) {
  const url = socialIconUrl(link); const [bad, setBad] = useState(false);
  useEffect(() => setBad(false), [url]);
  if (!url || bad) return <Text style={{ fontSize: size }}>{socialEmoji(link)}</Text>;
  const box = size + 12;
  return (
    <View style={{ width: box, height: box, borderRadius: box / 2, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
      <Image source={{ uri: url }} contentFit="contain" accessibilityLabel="" onError={() => setBad(true)} style={{ width: size, height: size }} />
    </View>
  );
}
