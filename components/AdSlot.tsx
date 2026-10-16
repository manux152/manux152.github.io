import { useEffect, useMemo } from 'react';
import { Linking, Platform, Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { TrText as Text } from './TrText';
import { Card } from './ui';
import { safeUrl } from './Logo';
import { useApp } from '../lib/app-context';
import { useTable } from '../lib/useQuery';
import { useTheme } from '../lib/theme';
import { pickAd, trackAd, type Ad, type AdPlacement } from '../lib/ads';

/**
 * One advert for this place on the site. Which ads exist, where they show, for how long and how often
 * is all managed in Admin → Ads. Always labelled "Ad"; views and clicks feed Admin → Ad report.
 */
export function AdSlot({ placement }: { placement: AdPlacement }) {
  const { settings } = useApp(); const { colors, fs } = useTheme();
  const on = settings.ads_enabled !== false && settings.ads_enabled !== 'false';
  const q = useTable<Ad>('ads', (b) => b.eq(`show_${placement}`, true).eq('is_active', true), [placement]);
  const ad = useMemo(() => (on ? pickAd(q.data) : null), [on, q.data]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (ad) trackAd(ad.id, placement, 'view'); }, [ad?.id, placement]);   // eslint-disable-line react-hooks/exhaustive-deps
  if (!ad || (!ad.headline && !ad.image_url)) return null;
  const url = safeUrl(ad.link_url); const img = safeUrl(ad.image_url);
  const open = () => { if (!url) return; trackAd(ad.id, placement, 'click'); if (Platform.OS === 'web') (globalThis as any).open?.(url, '_blank', 'noopener,noreferrer,nofollow'); else Linking.openURL(url); };
  const body = (
    <Card>
      <Text style={{ color: colors.muted, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' }}>Ad{ad.advertiser ? ` · ${ad.advertiser}` : ''}</Text>
      {img ? <Image source={{ uri: img }} accessibilityLabel={ad.headline || ad.advertiser || 'Advert'} style={{ width: '100%', aspectRatio: 16 / 7, borderRadius: 8, marginTop: 6 }} contentFit="cover" /> : null}
      {ad.headline ? <Text style={{ color: colors.text, fontWeight: '800', fontSize: fs(17), marginTop: 8 }}>{ad.headline}</Text> : null}
      {ad.body ? <Text style={{ color: colors.muted, fontSize: fs(14), marginTop: 2 }}>{ad.body}</Text> : null}
      {url && ad.cta_label ? <View style={{ marginTop: 10, alignSelf: 'flex-start', backgroundColor: settings.primary_color ?? '#0B6E4F', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 }}><Text style={{ color: '#fff', fontWeight: '800' }}>{ad.cta_label}</Text></View> : null}
    </Card>
  );
  return url ? <Pressable accessibilityRole="link" accessibilityLabel={`Ad: ${ad.headline || ad.advertiser || 'open'} (opens their website)`} onPress={open}>{body}</Pressable> : body;
}
