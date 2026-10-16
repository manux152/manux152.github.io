import { Text, View } from 'react-native';

export const SAMPLE: Record<string, string> = {
  first_name: 'Alex', name: 'Alex Morgan', email: 'alex@example.com', team: 'Your team', app_url: 'https://example.com',
  action_url: 'https://example.com/link', tryout_title: 'Open tryout', tryout_date: 'Saturday 14 November 2026, 09:00',
  tryout_location: 'Main pitch', code: 'SS-ABCD-EFGH', expires_on: '14 December 2026', note: 'Well done!',
};
const ok = (c: any, d: string) => (/^#[0-9a-fA-F]{3,8}$/.test(String(c)) ? c : d);

// Approximate on-screen preview (real emails are rendered on the server; fonts shown by name only).
export function EmailPreview({ theme, subject, body, buttonLabel, team }: { theme: any; subject: string; body: string; buttonLabel?: string | null; team?: string }) {
  const vars = { ...SAMPLE, team: team || SAMPLE.team };
  const fill = (s: string) => (s ?? '').replace(/\{(\w+)\}/g, (_m, k) => (vars as any)[k] ?? '');
  const primary = ok(theme.primary_color, '#0B6E4F');
  const paras = fill(body).split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const bold = (s: string) => s.split(/(\*\*.+?\*\*)/g).map((x, i) => x.startsWith('**') ? <Text key={i} style={{ fontWeight: '800' }}>{x.slice(2, -2)}</Text> : x);
  return (
    <View style={{ backgroundColor: ok(theme.background_color, '#F4F5F7'), padding: 12, borderRadius: 10 }}>
      <Text style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>Subject: <Text style={{ fontWeight: '700' }}>{fill(subject)}</Text></Text>
      <View style={{ backgroundColor: ok(theme.card_color, '#FFFFFF'), borderRadius: Number(theme.radius) || 0, borderTopWidth: 5, borderTopColor: primary, padding: 18, gap: 12 }}>
        <Text style={{ fontSize: 20, fontWeight: '800', color: primary }}>{vars.team}</Text>
        {paras.map((p, i) => <Text key={i} style={{ fontSize: 15, lineHeight: 22, color: ok(theme.text_color, '#222') }}>{bold(p)}</Text>)}
        {buttonLabel ? <View style={{ alignSelf: 'flex-start', backgroundColor: primary, borderRadius: 8, paddingVertical: 11, paddingHorizontal: 22 }}>
          <Text style={{ color: ok(theme.button_text_color, '#fff'), fontWeight: '700' }}>{fill(buttonLabel)}</Text></View> : null}
        {theme.footer_text ? <Text style={{ fontSize: 12, color: '#888' }}>{theme.footer_text}</Text> : null}
      </View>
      <Text style={{ fontSize: 11, color: '#888', marginTop: 6 }}>Font: {(theme.google_font ? theme.google_font + ', ' : '') + (theme.font_family || 'Arial')}</Text>
    </View>
  );
}
