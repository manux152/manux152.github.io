import { Platform, View } from 'react-native';
import { SiteHeader } from './SiteHeader';
import { useLayout } from '../lib/layout';
import { useTheme } from '../lib/theme';
import { T } from './ui';

/** Header for every non-tab page: the same site menu as the home tabs, pinned to the top, with the page title underneath. */
export function StackHeader({ title }: { title?: string }) {
  const { maxWidth, gutter } = useLayout(); const { colors } = useTheme();
  return (
    <View style={[{ zIndex: 20, backgroundColor: colors.bg }, Platform.OS === 'web' ? ({ position: 'sticky', top: 0 } as any) : null]}>
      <SiteHeader />
      {title ? (
        <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.bg }}>
          <View style={{ width: '100%', maxWidth, alignSelf: 'center', paddingHorizontal: gutter, paddingVertical: 8 }}>
            <T raw accessibilityRole="header" style={{ fontWeight: '800', fontSize: 16 }}>{title}</T>
          </View>
        </View>
      ) : null}
    </View>
  );
}
