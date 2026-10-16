import { Pressable, View } from 'react-native';
import { Btn, Chips, T } from './ui';
import { NAV_PRESETS, NAV_STYLES } from '../lib/navTheme';
import { useApp } from '../lib/app-context';
import { useTheme } from '../lib/theme';
import { useNavLook } from '../lib/useNavLook';

/** Visitor's own choice of navigation colours and background. Saved on this device. */
export function NavAppearancePicker() {
  const { settings } = useApp(); const { prefs, setPrefs, colors } = useTheme(); const look = useNavLook();
  const club = typeof settings.primary_color === 'string' ? settings.primary_color : NAV_PRESETS[0].bg;
  const hasImage = typeof settings.nav_bg_image === 'string' && /^https?:\/\//i.test(settings.nav_bg_image);
  const styles = NAV_STYLES.filter((s) => s.value !== 'image' || hasImage);
  return (
    <View style={{ gap: 10 }}>
      <T muted>Colour theme</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {NAV_PRESETS.map((p) => {
          const on = look.preset === p.key; const bg = p.key === 'brand' ? club : p.bg;
          return (
            <Pressable key={p.key} accessibilityRole="button" accessibilityLabel={`${p.label} theme`} accessibilityState={{ selected: on }} onPress={() => setPrefs({ navTheme: p.key })} style={{ alignItems: 'center', width: 76, gap: 4 }}>
              <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: bg, borderWidth: on ? 4 : 1, borderColor: on ? p.accent : colors.border, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ width: 20, height: 5, borderRadius: 3, backgroundColor: p.key === 'ivory' ? p.accent : p.accent }} />
              </View>
              <T style={{ fontSize: 12, fontWeight: on ? '800' : '500', textAlign: 'center' }}>{p.label}</T>
            </Pressable>
          );
        })}
      </View>
      <T muted>Background</T>
      <Chips options={styles} value={prefs.navBg === 'site' ? look.style : prefs.navBg} onChange={(v) => v && setPrefs({ navBg: v })} />
      <Btn title="Use the club's default look" kind="ghost" onPress={() => setPrefs({ navTheme: 'site', navBg: 'site' })} />
    </View>
  );
}
