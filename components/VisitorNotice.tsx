import { useState } from 'react';
import { Platform, Pressable, ScrollView, View } from 'react-native';
import { TrText as Text } from './TrText';
import { Btn } from './ui';
import { Logo } from './Logo';
import { LegalMeta, LegalSections } from './LegalSections';
import { useApp } from '../lib/app-context';
import { useTheme } from '../lib/theme';
import type { LegalDoc } from '../lib/legal';

/**
 * Short notice for people who are not signed in. They can read the Terms of Use and Privacy Policy if they wish,
 * then press "I agree" to continue. (Creating an account has its own full read-and-accept step.)
 * The acceptance is saved as evidence with the version, time and device.
 */
export function VisitorNotice({ docs, accept, error }: { docs: LegalDoc[]; accept: () => Promise<boolean>; error: string | null }) {
  const { settings } = useApp(); const { colors, fs } = useTheme();
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); const [declined, setDeclined] = useState(false);
  const vars = { team: typeof settings.team_name === 'string' ? settings.team_name : '', email: typeof settings.legal_contact_email === 'string' ? settings.legal_contact_email : '' };
  const color = settings.primary_color ?? '#0B6E4F';
  const go = async () => { setBusy(true); await accept(); setBusy(false); };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ alignItems: 'center', padding: 16, paddingTop: Platform.OS === 'web' ? 48 : 64, paddingBottom: 48 }}>
      <View style={{ width: '100%', maxWidth: 560, gap: 16, backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 20 }}>
        <View style={{ alignItems: 'center', gap: 10 }}>
          <Logo height={48} showName nameColor={colors.heading} />
          <Text accessibilityRole="header" style={{ color: colors.heading, fontSize: fs(22), fontWeight: '800', textAlign: 'center' }}>Before you continue</Text>
          <Text style={{ color: colors.text, fontSize: fs(14), textAlign: 'center', lineHeight: fs(21) }}>
            To use this website you need to accept our Terms of Use and Privacy Policy. You can read them first. Your acceptance is recorded with the date, time and version.
          </Text>
        </View>

        {docs.map((d) => {
          const on = open === d.slug;
          return (
            <View key={d.slug} style={{ gap: 8 }}>
              <Pressable accessibilityRole="button" accessibilityState={{ expanded: on }} onPress={() => setOpen(on ? null : d.slug)}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: on ? color : colors.border, paddingHorizontal: 14 }}>
                <Text style={{ color: colors.heading, fontWeight: '700', fontSize: fs(15) }}>{`Read the ${d.title}`}</Text>
                <Text style={{ color: colors.muted, fontSize: fs(16) }}>{on ? '−' : '+'}</Text>
              </Pressable>
              {on ? (<><LegalMeta doc={d} /><LegalSections key={d.slug + d.version} doc={d} vars={vars} /></>) : null}
            </View>);
        })}

        {error ? <Text style={{ color: colors.danger, fontSize: fs(13) }}>{error}</Text> : null}
        {declined ? <Text style={{ color: colors.muted, fontSize: fs(13), textAlign: 'center', lineHeight: fs(19) }}>You need to accept to use this website. If you do not agree, you can close this page.</Text> : null}
        <Btn title={busy ? 'Saving…' : 'I agree and continue'} onPress={go} disabled={busy} />
        <Btn title="I do not agree" kind="ghost" onPress={() => setDeclined(true)} disabled={busy} />
      </View>
    </ScrollView>
  );
}
