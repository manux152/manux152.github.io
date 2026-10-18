import React, { useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, TextInput, TextProps, View, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { useApp } from '../lib/app-context';
import { useLayout } from '../lib/layout';
import { useTheme } from '../lib/theme';
import { SiteFooter } from './SiteFooter';
import { pullRefresh } from '../lib/refresh';
import { trChildren, useI18n, currentLocale } from '../lib/i18n';

export const useColor = () => useApp().settings.primary_color ?? '#0B6E4F';
// Brand color made readable as text/borders in the current theme (lightened on dark backgrounds, black/white in high contrast).
export const useAccent = () => { const { accentFor } = useTheme(); return accentFor(useColor()); };

/**
 * Page wrapper. Pull a page down to refresh it: the phone apps use the native spinner; on the website (phones and tablets)
 * dragging down from the top shows "Pull to refresh". Every list on the page reloads quietly, without a loading screen.
 */
export function Screen({ children, scroll = true }: { children: React.ReactNode; scroll?: boolean }) {
  const { maxWidth } = useLayout(); const { colors } = useTheme(); const c = useColor();
  const [refreshing, setRefreshing] = useState(false); const [pull, setPull] = useState(0);
  const y = useRef(0); const startY = useRef<number | null>(null);
  const doRefresh = async () => { setRefreshing(true); try { await Promise.all([pullRefresh(), new Promise((r) => setTimeout(r, 700))]); } finally { setRefreshing(false); setPull(0); } };
  const body = <View style={{ padding: 16, gap: 12, width: '100%', maxWidth, alignSelf: 'center' }}>{children}</View>;
  if (!scroll) return <View style={{ flex: 1, backgroundColor: colors.bg }}>{body}</View>;
  const web = Platform.OS === 'web';
  const touch: any = web ? {
    scrollEventThrottle: 16,
    onScroll: (e: any) => { y.current = e.nativeEvent.contentOffset.y; },
    onTouchStart: (e: any) => { startY.current = y.current <= 0 && !refreshing ? e.nativeEvent.touches?.[0]?.pageY ?? null : null; },
    onTouchMove: (e: any) => { if (startY.current == null) return; const dy = (e.nativeEvent.touches?.[0]?.pageY ?? 0) - startY.current; if (dy > 0 && y.current <= 0) setPull(Math.min(dy * 0.5, 90)); else if (pull) setPull(0); },
    onTouchEnd: () => { const go = pull >= 60; startY.current = null; if (go) doRefresh(); else setPull(0); },
  } : { refreshControl: <RefreshControl refreshing={refreshing} onRefresh={doRefresh} tintColor={c} colors={[c]} /> };
  const shown = web && (pull > 0 || refreshing);
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} {...touch}>
      {shown ? <View accessibilityLiveRegion="polite" style={{ height: refreshing ? 48 : Math.max(pull, 8), alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}>
        {refreshing ? <ActivityIndicator color={c} /> : null}
        <Text style={{ color: colors.muted, fontSize: 13 }}>{refreshing ? 'Refreshing…' : pull >= 60 ? '↑ Release to refresh' : '↓ Pull down to refresh'}</Text>
      </View> : null}
      {body}{web ? <SiteFooter /> : null}
    </ScrollView>
  );
}
export const H = ({ children, style }: { children: React.ReactNode; style?: any }) => {
  const { colors, fs } = useTheme(); const { t } = useI18n();
  return <Text accessibilityRole="header" style={[{ fontSize: fs(22), fontWeight: '800', color: colors.heading }, style]}>{trChildren(children, t)}</Text>;
};
/** `raw` shows the text exactly as given (use for people's own writing, e.g. chat messages). */
export const T = ({ children, muted, style, raw, ...rest }: TextProps & { children?: React.ReactNode; muted?: boolean; style?: any; raw?: boolean }) => {
  const { colors, fs } = useTheme(); const { t } = useI18n();
  const flat: any = StyleSheet.flatten(style) ?? {};
  const size = fs(flat.fontSize ?? 15);
  return <Text {...rest} style={[{ color: muted ? colors.muted : colors.text }, style, { fontSize: size, lineHeight: flat.lineHeight ? fs(flat.lineHeight) : undefined }]}>{raw ? children : trChildren(children, t)}</Text>;
};
export const Card = ({ children, style }: { children: React.ReactNode; style?: ViewStyle }) => {
  const { colors, prefs } = useTheme();
  return <View style={[{ backgroundColor: colors.card, borderRadius: 12, padding: 14, gap: 6, borderWidth: prefs.highContrast ? 2 : 1, borderColor: colors.border }, style]}>{children}</View>;
};
export function Btn({ title, onPress, kind = 'primary', disabled }: { title: string; onPress: () => void; kind?: 'primary' | 'ghost' | 'danger'; disabled?: boolean }) {
  const c = useColor(); const accent = useAccent(); const { colors, fs, prefs, isDark } = useTheme(); const { t } = useI18n(); const label = t(title);
  const bg = kind === 'primary' ? (prefs.highContrast ? (isDark ? '#FFFFFF' : '#000000') : c) : kind === 'danger' ? (isDark && !prefs.highContrast ? '#C0392B' : '#B3261E') : 'transparent';
  const fg = kind === 'ghost' ? accent : (prefs.highContrast ? (isDark ? '#000000' : '#FFFFFF') : '#fff');
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }} onPress={onPress} disabled={disabled}
      style={(st: any) => ({ backgroundColor: bg, paddingVertical: 11, paddingHorizontal: 16, minHeight: 44, justifyContent: 'center', borderRadius: 10, opacity: disabled ? 0.5 : st.pressed ? 0.8 : st.hovered ? 0.92 : 1, borderWidth: kind === 'ghost' ? (prefs.highContrast ? 2 : 1) : 0, borderColor: accent, alignItems: 'center' })}>
      <Text style={{ color: fg, fontWeight: '700', fontSize: fs(15) }}>{label}</Text>
    </Pressable>
  );
}
export function Input(props: React.ComponentProps<typeof TextInput> & { label?: string; required?: boolean }) {
  const { label: rawLabel, required, secureTextEntry, ...rest0 } = props; const { colors, fs, prefs } = useTheme(); const { t } = useI18n();
  const [shown, setShown] = useState(false);
  const base = rawLabel ? t(rawLabel) : rawLabel; const label = base && required ? `${base} *` : base;
  const rest = { ...rest0, placeholder: typeof rest0.placeholder === 'string' ? t(rest0.placeholder) : rest0.placeholder };
  const isPw = !!secureTextEntry;
  return (
    <View style={{ gap: 4 }}>
      {label ? <Text style={{ fontSize: fs(13), color: colors.muted, fontWeight: '600' }}>{label}</Text> : null}
      <View>
        <TextInput accessibilityLabel={label ?? rest.placeholder} {...rest} secureTextEntry={isPw && !shown}
          {...(isPw ? { autoCapitalize: 'none' as const, autoCorrect: false } : {})} placeholderTextColor={colors.placeholder}
          style={[{ borderWidth: prefs.highContrast ? 2 : 1, borderColor: colors.inputBorder, borderRadius: 10, padding: 10, backgroundColor: colors.inputBg, color: colors.text, fontSize: fs(15) }, isPw ? { paddingRight: 70 } : null, rest.style]} />
        {isPw ? (
          <Pressable accessibilityRole="button" accessibilityLabel={shown ? 'Hide password' : 'Show password'} onPress={() => setShown((v) => !v)} hitSlop={8}
            style={{ position: 'absolute', right: 0, top: 0, bottom: 0, paddingHorizontal: 12, justifyContent: 'center' }}>
            <Text style={{ color: colors.muted, fontWeight: '700', fontSize: fs(13) }}>{shown ? 'Hide' : 'Show'}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
export function Chips({ options, value, onChange, multi }: { options: { value: string; label: string }[]; value: string | string[] | null; onChange: (v: any) => void; multi?: boolean }) {
  const c = useColor(); const accent = useAccent(); const { colors, fs, prefs, isDark } = useTheme(); const { t } = useI18n();
  const sel = (v: string) => (multi ? (value as string[] ?? []).includes(v) : value === v);
  const selBg = prefs.highContrast ? (isDark ? '#FFFFFF' : '#000000') : c; const selFg = prefs.highContrast ? (isDark ? '#000' : '#fff') : '#fff';
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {options.map((o) => (
        <Pressable key={o.value} accessibilityRole="button" accessibilityLabel={t(o.label)} accessibilityState={{ selected: sel(o.value) }} onPress={() => {
          if (multi) { const cur = (value as string[]) ?? []; onChange(cur.includes(o.value) ? cur.filter((x) => x !== o.value) : [...cur, o.value]); }
          else onChange(sel(o.value) ? null : o.value);
        }} style={{ paddingVertical: 6, paddingHorizontal: 12, minHeight: 36, justifyContent: 'center', borderRadius: 999, borderWidth: prefs.highContrast ? 2 : 1, borderColor: accent, backgroundColor: sel(o.value) ? selBg : colors.card }}>
          <Text style={{ color: sel(o.value) ? selFg : accent, fontWeight: '600', fontSize: fs(14) }}>{t(o.label)}</Text>
        </Pressable>
      ))}
    </View>
  );
}
/** On/off setting row with a clear label and optional hint. */
export function Toggle({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  const c = useColor(); const { t } = useI18n();
  return (
    <Pressable accessibilityRole="switch" accessibilityLabel={t(label)} accessibilityState={{ checked: value }} onPress={() => onChange(!value)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 }}>
      <View style={{ flex: 1 }}><T style={{ fontWeight: '700' }}>{label}</T>{hint ? <T muted style={{ fontSize: 13 }}>{hint}</T> : null}</View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: c, false: undefined }} accessibilityLabel={t(label)} />
    </Pressable>
  );
}
/** Round profile photo with an initial-letter fallback. */
export function Avatar({ url, name, size = 44 }: { url?: string | null; name?: string | null; size?: number }) {
  const { colors } = useTheme(); const c = useColor(); const { t } = useI18n();
  const initial = (name ?? '?').trim().charAt(0).toUpperCase() || '?';
  return (
    <View accessible accessibilityLabel={name ? `${name} · ${t('Profile photo')}` : t('Profile photo')} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: url ? colors.skeleton : c, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
      {url ? <Image source={{ uri: url }} style={{ width: size, height: size }} contentFit="cover" /> : <Text style={{ color: '#fff', fontWeight: '800', fontSize: size * 0.42 }}>{initial}</Text>}
    </View>
  );
}
export const Loading = () => { const { t } = useI18n(); return <ActivityIndicator accessibilityLabel={t('Loading')} style={{ marginTop: 40 }} />; };
export const Err = ({ msg }: { msg: string | null }) => { const { colors, fs } = useTheme(); const { t } = useI18n(); return msg ? <Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: fs(14) }}>{t(msg)}</Text> : null; };
export const fmtDate = (d: string) => new Date(d).toLocaleString(currentLocale(), { dateStyle: 'medium', timeStyle: 'short' });
export const s = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', gap: 8 } });
