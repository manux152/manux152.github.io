import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { TrText as Text } from './TrText';
import { LegalMeta, LegalSections } from './LegalSections';
import { useApp } from '../lib/app-context';
import { useTheme } from '../lib/theme';
import { fetchDocs, REQUIRED, type LegalDoc } from '../lib/legal';

export type SignupLegal = { ready: boolean; docs: { slug: string; version: number }[] };

/** Sign-up step: open every section of the Terms of Use and Privacy Policy, then tick both boxes. Reports back when the person is ready. */
export function SignupTerms({ onChange }: { onChange: (v: SignupLegal) => void }) {
  const { settings } = useApp(); const { colors, fs } = useTheme();
  const [docs, setDocs] = useState<LegalDoc[] | null>(null);
  const [tab, setTab] = useState(0);
  const [opened, setOpened] = useState<Record<string, Set<number>>>({});
  const [agreed, setAgreed] = useState<Record<string, boolean>>({});
  const color = settings.primary_color ?? '#0B6E4F';
  const vars = { team: typeof settings.team_name === 'string' ? settings.team_name : '', email: typeof settings.legal_contact_email === 'string' ? settings.legal_contact_email : '' };
  useEffect(() => { fetchDocs(REQUIRED).then((d) => setDocs(d.sort((a, b) => a.slug.localeCompare(b.slug)).reverse())); }, []);   // terms first
  const done = (d: LegalDoc) => (opened[d.slug]?.size ?? 0) >= d.sections.length;
  const ready = !!docs && docs.every((d) => done(d) && agreed[d.slug]);
  useEffect(() => {
    if (!docs) return onChange({ ready: false, docs: [] });
    // Documents not set up yet: do not block sign-up.
    onChange({ ready: docs.length === 0 || ready, docs: docs.map((d) => ({ slug: d.slug, version: d.version })) });
  }, [docs, ready]);   // eslint-disable-line
  if (!docs || !docs.length) return null;
  const doc = docs[Math.min(tab, docs.length - 1)];

  return (
    <View style={{ gap: 12, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14 }}>
      <Text accessibilityRole="header" style={{ color: colors.heading, fontSize: fs(16), fontWeight: '800' }}>Terms of Use and Privacy Policy</Text>
      <Text style={{ color: colors.muted, fontSize: fs(13), lineHeight: fs(19) }}>Open every section of both documents, then tick the boxes to create your account. Your acceptance is recorded with the date, time and version.</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {docs.map((d, i) => {
          const on = i === tab; const n = opened[d.slug]?.size ?? 0;
          return (
            <Pressable key={d.slug} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => setTab(i)}
              style={{ flex: 1, borderRadius: 10, padding: 10, borderWidth: on ? 2 : 1, borderColor: on ? color : colors.border, gap: 2 }}>
              <Text style={{ color: colors.heading, fontWeight: '800', fontSize: fs(14) }}>{d.title}</Text>
              <Text style={{ color: done(d) ? '#1E8E4E' : colors.muted, fontSize: fs(12), fontWeight: '700' }}>{done(d) ? '✓ Reviewed' : `${n} of ${d.sections.length} opened`}</Text>
            </Pressable>);
        })}
      </View>
      <LegalMeta doc={doc} />
      <LegalSections key={doc.slug + doc.version} doc={doc} vars={vars} opened={opened[doc.slug]} onOpen={(i) => setOpened((cur) => { const s = new Set(cur[doc.slug] ?? []); s.add(i); return { ...cur, [doc.slug]: s }; })} />
      {docs.map((d) => {
        const can = done(d); const on = !!agreed[d.slug];
        return (
          <Pressable key={d.slug} accessibilityRole="checkbox" accessibilityState={{ checked: on, disabled: !can }} disabled={!can} onPress={() => setAgreed((a) => ({ ...a, [d.slug]: !a[d.slug] }))}
            style={{ flexDirection: 'row', gap: 12, alignItems: 'center', opacity: can ? 1 : 0.45, minHeight: 44 }}>
            <View style={{ width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: on ? color : colors.muted, backgroundColor: on ? color : 'transparent', alignItems: 'center', justifyContent: 'center' }}>{on ? <Text style={{ color: '#fff', fontWeight: '900' }}>✓</Text> : null}</View>
            <Text style={{ flex: 1, color: colors.text, fontSize: fs(14), lineHeight: fs(20) }}>{`I have read and I accept the ${d.title} (version ${d.version}).`}</Text>
          </Pressable>);
      })}
    </View>
  );
}
