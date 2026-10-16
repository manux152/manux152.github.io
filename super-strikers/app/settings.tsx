import { useEffect, useState } from 'react';
import { Link, useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { NavAppearancePicker } from '../components/NavAppearancePicker';
import { useNavLook } from '../lib/useNavLook';
import { Screen, H, T, Card, Btn, Chips, Toggle, Avatar, Err } from '../components/ui';
import { TEXT_SIZES, useTheme } from '../lib/theme';
import { useApp } from '../lib/app-context';
import { supabase } from '../lib/supabase';
import { LANGS, useI18n } from '../lib/i18n';
import { isOptedOut, setOptedOut } from '../lib/analytics';

// Display, accessibility and privacy options. Display/accessibility choices are saved on this device and apply across the whole app.
export default function Settings() {
  const { prefs, setPrefs, reset, colors, fs } = useTheme();
  const { session, signOut, settings } = useApp(); const router = useRouter();
  const { lang, setLang } = useI18n(); const [stats, setStats] = useState(true);
  useEffect(() => { isOptedOut().then((v) => setStats(!v)); }, []);
  const [profile, setProfile] = useState<{ full_name: string | null; avatar_url: string | null; show_in_search: boolean } | null>(null);
  const [err, setErr] = useState<string | null>(null); const navLook = useNavLook();
  useEffect(() => {
    if (!session) return;
    supabase.from('profiles').select('full_name,avatar_url,show_in_search').eq('id', session.user.id).maybeSingle().then(({ data }) => data && setProfile(data as any));
  }, [session?.user.id]); // eslint-disable-line
  const setSearchable = async (v: boolean) => {
    setErr(null); if (!profile || !session) return;
    setProfile({ ...profile, show_in_search: v });
    const { error } = await supabase.from('profiles').update({ show_in_search: v }).eq('id', session.user.id);
    if (error) { setErr(error.message); setProfile({ ...profile, show_in_search: !v }); }
  };
  const link = (label: string, href: string) => <Link href={href as any} asChild><Pressable accessibilityRole="link"><Card><T style={{ fontWeight: '700' }}>{label} →</T></Card></Pressable></Link>;
  return (
    <Screen>
      <H>Settings</H>
      <Card>
        <T style={{ fontWeight: '800' }}>Language</T>
        <T muted>Choose the language of menus and buttons. News and club messages stay in the language they were written in.</T>
        <Chips options={LANGS} value={lang} onChange={(v) => v && setLang(v)} />
      </Card>
      {settings.analytics_enabled !== false ? <Card>
        <Toggle label="Share anonymous usage statistics" hint="Counts which pages are used, never who you are. Helps the club improve the app." value={stats} onChange={(v) => { setStats(v); setOptedOut(!v); }} />
      </Card> : null}
      <Card>
        <T style={{ fontWeight: '800' }}>Appearance</T>
        <T muted>Choose how the app looks on this device.</T>
        <Chips options={[{ value: 'system', label: 'Match my device' }, { value: 'light', label: '☀️ Light' }, { value: 'dark', label: '🌙 Dark' }]} value={prefs.mode} onChange={(v) => v && setPrefs({ mode: v })} />
      </Card>
      {navLook.allowPersonalise ? <Card>
        <T style={{ fontWeight: '800' }}>Navigation</T>
        <T muted>Pick the colours and background of the top bar and menu on this device.</T>
        <NavAppearancePicker />
      </Card> : null}
      <Card>
        <T style={{ fontWeight: '800' }}>Accessibility</T>
        <T muted>Text size</T>
        <Chips options={TEXT_SIZES.map((t) => ({ value: t.value, label: t.label }))} value={String(prefs.textScale)} onChange={(v) => { const t = TEXT_SIZES.find((x) => x.value === v); if (t) setPrefs({ textScale: t.scale }); }} />
        <Toggle label="High contrast" hint="Stronger borders and pure black/white text for easier reading." value={prefs.highContrast} onChange={(v) => setPrefs({ highContrast: v })} />
        <Toggle label="Reduce motion" hint="Stops the picture slideshow from moving by itself and turns off animations." value={prefs.reduceMotion} onChange={(v) => setPrefs({ reduceMotion: v })} />
        <Toggle label="Underline links" hint="Makes links easier to spot without relying on color." value={prefs.underlineLinks} onChange={(v) => setPrefs({ underlineLinks: v })} />
      </Card>
      <Card style={{ borderStyle: 'dashed' }}>
        <T muted>Preview</T>
        <T style={{ fontWeight: '800', fontSize: 18 }}>Super Strikers — match day</T>
        <T>This is how body text looks with your settings. Buttons and links keep a clear outline and a large tap area.</T>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}><Btn title="Primary button" onPress={() => {}} /><Btn title="Secondary" kind="ghost" onPress={() => {}} /></View>
      </Card>
      {session && profile ? (
        <Card>
          <T style={{ fontWeight: '800' }}>Profile & privacy</T>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Avatar url={profile.avatar_url} name={profile.full_name} size={56} />
            <View style={{ flex: 1 }}><T style={{ fontWeight: '700' }}>{profile.full_name || session.user.email}</T><T muted>{session.user.email}</T></View>
          </View>
          <Btn title={profile.avatar_url ? 'Change profile photo' : 'Add a profile photo'} kind="ghost" onPress={() => router.push('/profile')} />
          <Toggle label="Show me in search results" hint="Other signed-in members can find you by name and see your profile photo. Your email is never shown." value={profile.show_in_search} onChange={setSearchable} />
          <Err msg={err} />
        </Card>
      ) : null}
      {session ? link('My dashboard', '/dashboard') : link('Sign in', '/login')}
      {session ? link('Account & notifications', '/account') : null}
      <Btn title="Reset display & accessibility settings" kind="ghost" onPress={reset} />
      {session ? <Btn title="Sign out" kind="ghost" onPress={async () => { await signOut(); router.replace('/'); }} /> : null}
    </Screen>
  );
}
