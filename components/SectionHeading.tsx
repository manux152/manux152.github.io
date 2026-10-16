import { View } from 'react-native';
import { T, useAccent } from './ui';

/** Heading + subtitle that introduces a block of content ("Photos", "Videos"…). */
export function SectionHeading({ icon, title, count, subtitle }: { icon?: string; title: string; count?: number; subtitle?: string }) {
  const accent = useAccent();
  return (
    <View accessibilityRole="header" style={{ gap: 2, borderBottomWidth: 2, borderBottomColor: accent, paddingBottom: 6, marginTop: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
        {icon ? <T style={{ fontSize: 20 }}>{icon}</T> : null}
        <T style={{ fontWeight: '900', fontSize: 20 }}>{title}</T>
        {count != null ? <T muted style={{ fontWeight: '700' }}>{count}</T> : null}
      </View>
      {subtitle ? <T muted style={{ fontSize: 13 }}>{subtitle}</T> : null}
    </View>
  );
}
