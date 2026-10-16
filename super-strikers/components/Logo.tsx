import { Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useApp } from '../lib/app-context';

export const LOGO_HEIGHTS: Record<string, number> = { sm: 36, md: 56, lg: 84 };
export const safeUrl = (u?: string | null) => (u && /^https?:\/\//i.test(u) ? u : null);

/** The club logo (Admin → Logo & branding) with the team name. Falls back to a monogram badge when no logo is set. */
export type LogoPreview = { url?: string | null; size?: string; showName?: boolean; plate?: string };
export function Logo({ height, showName, nameColor = '#fff', nameSize = 18, onPlate = true, preview }: { height?: number; showName?: boolean; nameColor?: string; nameSize?: number; onPlate?: boolean; preview?: LogoPreview }) {
  const app = useApp(); const settings = preview ? { ...app.settings, logo_url: preview.url, logo_size: preview.size, logo_show_name: preview.showName, logo_plate: preview.plate } : app.settings;
  const url = safeUrl(settings.logo_url); const color = settings.primary_color ?? '#0B6E4F';
  const h = height ?? LOGO_HEIGHTS[settings.logo_size as string] ?? 56;
  const name = settings.team_name ?? '';
  const show = showName ?? (settings.logo_show_name !== false && settings.logo_show_name !== 'false');
  const plate = onPlate && url && settings.logo_plate !== 'none';
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={`${name} logo`} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      {url ? (
        <View style={plate ? { backgroundColor: '#fff', borderRadius: 12, padding: Math.max(4, h * 0.1) } : undefined}>
          <Image source={{ uri: url }} accessibilityLabel="" style={{ width: h * 1.4, height: h }} contentFit="contain" />
        </View>
      ) : (
        <View style={{ width: h, height: h, borderRadius: h / 2, backgroundColor: color, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)' }}>
          <Text style={{ color: '#fff', fontWeight: '900', fontSize: h * 0.42 }}>{name.trim().charAt(0).toUpperCase() || 'S'}</Text>
        </View>
      )}
      {show && name ? <Text numberOfLines={2} style={{ color: nameColor, fontWeight: '800', fontSize: nameSize, flexShrink: 1 }}>{name}</Text> : null}
    </View>
  );
}
