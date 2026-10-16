import { useEffect, useState } from 'react';
import { Switch, View } from 'react-native';
import { Screen, H, T, Card, Btn, Input, Chips, Err, Loading } from '../../components/ui';
import { EmailPreview } from '../../components/EmailPreview';
import { supabase } from '../../lib/supabase';
import { useApp } from '../../lib/app-context';

const FONTS = [
  { value: 'Arial, Helvetica, sans-serif', label: 'Arial' }, { value: "Georgia, 'Times New Roman', serif", label: 'Georgia' },
  { value: "'Trebuchet MS', Arial, sans-serif", label: 'Trebuchet' }, { value: 'Verdana, Geneva, sans-serif', label: 'Verdana' },
  { value: 'Tahoma, Geneva, sans-serif', label: 'Tahoma' }, { value: "'Times New Roman', Times, serif", label: 'Times' },
  { value: "'Courier New', monospace", label: 'Courier' }, { value: "-apple-system, 'Segoe UI', Roboto, Arial, sans-serif", label: 'System' },
];
const COLORS: [string, string][] = [['primary_color', 'Main color (buttons, accents)'], ['button_text_color', 'Button text color'], ['background_color', 'Page background'], ['card_color', 'Email card background'], ['text_color', 'Text color']];

export default function EmailDesign() {
  const { can, settings } = useApp();
  const [theme, setTheme] = useState<any | null>(null); const [enabled, setEnabled] = useState(true);
  const [msg, setMsg] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  useEffect(() => { supabase.from('email_settings').select('*').eq('id', 1).maybeSingle().then(({ data }) => { setTheme(data?.theme ?? {}); setEnabled(data?.emails_enabled ?? true); }); }, []);
  if (!can('emails.manage')) return <Screen><T>No permission.</T></Screen>;
  if (!theme) return <Loading />;
  const set = (k: string, v: any) => setTheme({ ...theme, [k]: v });

  const save = async () => {
    setErr(null); setMsg(null); setBusy(true);
    const { error } = await supabase.from('email_settings').upsert({ id: 1, emails_enabled: enabled, theme });
    setBusy(false);
    if (error) setErr(error.message); else setMsg('Saved.');
  };
  const test = async () => {
    setErr(null); setMsg(null); setBusy(true);
    await supabase.from('email_settings').upsert({ id: 1, emails_enabled: enabled, theme });
    const { data, error } = await supabase.functions.invoke('send-email', { body: { manual: { template_key: 'welcome', audience: { type: 'self' }, sample: true, test: true } } });
    setBusy(false);
    if (error || data?.error) setErr(data?.error ?? error?.message ?? 'Could not send'); else setMsg('Test email sent to your account address.');
  };

  return (
    <Screen>
      <H>Email design</H>
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><T style={{ fontWeight: '700' }}>Send emails</T><Switch value={enabled} onValueChange={setEnabled} /></View>
        <T muted>Master switch for all automatic and manual emails.</T>
      </Card>
      <Card>
        <T style={{ fontWeight: '700' }}>Sender</T>
        <Input label="From name (blank = team name)" value={theme.from_name ?? ''} onChangeText={(v) => set('from_name', v)} />
        <Input label="From email address (must be verified with your email provider)" autoCapitalize="none" keyboardType="email-address" value={theme.from_address ?? ''} onChangeText={(v) => set('from_address', v)} />
        <Input label="Reply-to address (optional)" autoCapitalize="none" value={theme.reply_to ?? ''} onChangeText={(v) => set('reply_to', v)} />
      </Card>
      <Card>
        <T style={{ fontWeight: '700' }}>Look</T>
        <Input label="Logo image URL (https, optional)" autoCapitalize="none" value={theme.logo_url ?? ''} onChangeText={(v) => set('logo_url', v)} />
        {COLORS.map(([k, label]) => (
          <View key={k} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}>
            <View style={{ flex: 1 }}><Input label={`${label} (#RRGGBB)`} autoCapitalize="none" value={theme[k] ?? ''} onChangeText={(v) => set(k, v)} /></View>
            <View style={{ width: 40, height: 40, borderRadius: 8, borderWidth: 1, borderColor: '#D5D8DD', backgroundColor: /^#[0-9a-fA-F]{3,8}$/.test(theme[k] ?? '') ? theme[k] : '#fff' }} />
          </View>
        ))}
        <T muted>Font</T>
        <Chips options={FONTS} value={theme.font_family ?? null} onChange={(v) => v && set('font_family', v)} />
        <Input label="Google Font name (optional, e.g. Poppins) — shown in Apple Mail & iPhone; other apps use the font above" value={theme.google_font ?? ''} onChangeText={(v) => set('google_font', v)} />
        <Input label="Corner roundness (0–32)" keyboardType="numeric" value={String(theme.radius ?? 12)} onChangeText={(v) => set('radius', Number(v) || 0)} />
        <Input label="Footer text (e.g. club address, contact)" multiline value={theme.footer_text ?? ''} onChangeText={(v) => set('footer_text', v)} />
      </Card>
      <H>Preview</H>
      <EmailPreview theme={theme} team={settings.team_name} subject="Welcome to {team}, {first_name}!" body={'Hi {first_name},\n\nYour {team} account is ready. **See you at the next match!**'} buttonLabel="Open the app" />
      <Err msg={err} />{msg ? <T>{msg}</T> : null}
      <Btn title="Save" onPress={save} disabled={busy} />
      <Btn title="Save & send me a test email" kind="ghost" onPress={test} disabled={busy} />
    </Screen>
  );
}
