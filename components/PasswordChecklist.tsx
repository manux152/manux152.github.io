import { View } from 'react-native';
import { T } from './ui';
import { useTheme } from '../lib/theme';
import { checkPassword } from '../lib/password';

// Live "does my password meet the rules?" panel. Shows each rule with ✓ / ✗ and an overall strength bar.
export function PasswordChecklist({ password }: { password: string }) {
  const { colors, isDark } = useTheme();
  const { rules, passed, total, valid, strength } = checkPassword(password);
  const good = isDark ? '#6FD19A' : '#1B7F3B';
  const barColor = strength === 'weak' ? colors.danger : strength === 'fair' ? (isDark ? '#FFC857' : '#A66300') : good;
  const label = { empty: '', weak: 'Weak', fair: 'Almost there', good: 'Good', strong: 'Strong' }[strength];
  return (
    <View accessibilityLiveRegion="polite" style={{ gap: 6, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: valid ? good : colors.border, backgroundColor: colors.card }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ flex: 1, flexDirection: 'row', gap: 4 }}>
          {Array.from({ length: total }).map((_, i) => (
            <View key={i} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: i < passed ? barColor : colors.border }} />
          ))}
        </View>
        {label ? <T style={{ fontSize: 13, fontWeight: '700', color: barColor }}>{label}</T> : null}
      </View>
      {rules.map((r) => (
        <T key={r.key} style={{ fontSize: 13, color: r.ok ? good : colors.muted }} accessibilityLabel={`${r.label}: ${r.ok ? 'met' : 'not met'}`}>
          {r.ok ? '✓ ' : '✗ '}{r.label}
        </T>
      ))}
      <T style={{ fontSize: 13, fontWeight: '700', color: valid ? good : colors.muted }}>{valid ? '✓ Your password meets all the requirements' : 'Your password does not meet all the requirements yet'}</T>
    </View>
  );
}
