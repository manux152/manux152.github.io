import { useState } from 'react';
import { Platform, Pressable, ScrollView, View } from 'react-native';
import { TrText as Text } from './TrText';
import { Btn, Loading } from './ui';
import { Logo } from './Logo';
import { LegalMeta, LegalSections } from './LegalSections';
import { useApp } from '../lib/app-context';
import { useTheme } from '../lib/theme';
import { useLegalStatus } from '../lib/legal';

/**
 * Nobody gets past this screen until they have opened every section of the Terms of Use and Privacy Policy
 * and ticked both acknowledgements. The acceptance (versions, time, device) is saved to the database as evidence.
 * It returns each time a new version is published.
 */
export function LegalGate({ children }: { children: React.ReactNode }) {
  const { status, docs, accept, error, renewal } = useLegalStatus();
  const { settings } = useApp(); const { colors, fs } = useTheme();
  const [tab, setTab] = useState(0);
  const [opened, setOpened] = useState<Record<string, Set<number>>>({});
  const [agreed, setAgreed] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  if (status === 'ok') return <>{children}</>;
  if (status === 'checking') return <Loading />;

  const vars = { team: typeof settings.team_name === 'string' ? settings.team_name : '', email: typeof settings.legal_contact_email === 'string' ? settings.legal_contact_email : '' };
  const color = settings.primary_color ?? '#0B6E4F';
  const done = (slug: string, n: number) => (opened[slug]?.size ?? 0) >= n;
  const doc = docs[Math.min(tab, docs.length - 1)];
  const allRead = docs.every((d) => done(d.slug, d.sections.length));
  const allAgreed = docs.every((d) => agreed[d.slug]);
  const next = docs.findIndex((d) => !done(d.slug, d.sections.length));
  const submit = async () => { setBusy(true); await accept(); setBusy(false); };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ alignItems: 'center', padding: 16, paddingTop: Platform.OS === 'web' ? 32 : 56, paddingBottom: 48 }}>
      <View style={{ width: '100%', maxWidth: 760, gap: 16 }}>
        <View style={{ alignItems: 'center', gap: 10 }}>
          <Logo height={56} showName nameColor={colors.heading} />
          <Text accessibilityRole="header" style={{ color: colors.heading, fontSize: fs(24), fontWeight: '800', textAlign: 'center' }}>Before you continue</Text>
          <Text style={{ color: colors.muted, fontSize: fs(14), textAlign: 'center', lineHeight: fs(21) }}>
            {renewal ? 'It has been a while since you last confirmed these. Please read our Terms of Use and Privacy Policy again, open each section, then confirm below.' : 'Please read our Terms of Use and Privacy Policy. Open each section, then confirm below.'} Your acceptance is recorded with the date, time and version.
          </Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          {docs.map((d, i) => {
            const n = opened[d.slug]?.size ?? 0; const complete = n >= d.sections.length; const on = i === tab;
            return (
              <Pressable key={d.slug} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => setTab(i)}
                style={{ flex: 1, borderRadius: 12, padding: 12, borderWidth: on ? 2 : 1, borderColor: on ? color : colors.border, backgroundColor: colors.card, gap: 4 }}>
                <Text style={{ color: colors.heading, fontWeight: '800', fontSize: fs(15) }}>{d.title}</Text>
                <Text style={{ color: complete ? '#1E8E4E' : colors.muted, fontSize: fs(12), fontWeight: '700' }}>{complete ? '✓ Reviewed' : `${n} of ${d.sections.length} sections opened`}</Text>
                <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.border, overflow: 'hidden' }}><View style={{ height: 4, width: `${Math.round((n / d.sections.length) * 100)}%`, backgroundColor: complete ? '#1E8E4E' : color }} /></View>
              </Pressable>);
          })}
        </View>

        {doc ? (<>
          <View style={{ gap: 4 }}>
            {doc.summary ? <Text style={{ color: colors.text, fontSize: fs(14) }}>{doc.summary}</Text> : null}
            <LegalMeta doc={doc} />
          </View>
          <LegalSections key={doc.slug + doc.version} doc={doc} vars={vars} opened={opened[doc.slug]} onOpen={(i) => setOpened((cur) => { const s = new Set(cur[doc.slug] ?? []); s.add(i); return { ...cur, [doc.slug]: s }; })} />
          {!done(doc.slug, doc.sections.length) ? <Text style={{ color: colors.muted, fontSize: fs(13), textAlign: 'center' }}>Open every section to unlock the confirmation.</Text> : null}
          {done(doc.slug, doc.sections.length) && next > tab ? <Btn title={`Next: ${docs[next].title}`} kind="ghost" onPress={() => setTab(next)} /> : null}
        </>) : null}

        <View style={{ gap: 10, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14 }}>
          {docs.map((d) => {
            const ready = done(d.slug, d.sections.length); const on = !!agreed[d.slug];
            return (
              <Pressable key={d.slug} accessibilityRole="checkbox" accessibilityState={{ checked: on, disabled: !ready }} disabled={!ready} onPress={() => setAgreed((a) => ({ ...a, [d.slug]: !a[d.slug] }))}
                style={{ flexDirection: 'row', gap: 12, alignItems: 'center', opacity: ready ? 1 : 0.45, minHeight: 44 }}>
                <View style={{ width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: on ? color : colors.muted, backgroundColor: on ? color : 'transparent', alignItems: 'center', justifyContent: 'center' }}>{on ? <Text style={{ color: '#fff', fontWeight: '900' }}>✓</Text> : null}</View>
                <Text style={{ flex: 1, color: colors.text, fontSize: fs(14), lineHeight: fs(20) }}>{`I have read and I accept the ${d.title} (version ${d.version}).`}</Text>
              </Pressable>);
          })}
          {error ? <Text style={{ color: colors.danger, fontSize: fs(13) }}>{error}</Text> : null}
          <Btn title={busy ? 'Saving…' : 'Accept and continue'} onPress={submit} disabled={!allRead || !allAgreed || busy} />
          <Text style={{ color: colors.muted, fontSize: fs(12), textAlign: 'center' }}>The text above is shown in its original wording. If you do not agree, you can close the app or website.</Text>
        </View>
      </View>
    </ScrollView>
  );
}
