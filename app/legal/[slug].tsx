import { useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { Screen, H, T, Btn, Loading } from '../../components/ui';
import { PageHead } from '../../components/PageHead';
import { LegalMeta, LegalSections } from '../../components/LegalSections';
import { useApp } from '../../lib/app-context';
import { fetchDocs, type LegalDoc, type Slug } from '../../lib/legal';
import { openCookieSettings } from '../../lib/consent';

const SLUGS: Slug[] = ['terms', 'privacy', 'cookies'];

/** Public page for the Terms of Use, Privacy Policy and Cookie Policy (also linked from the footer and the sign-up gate). */
export default function LegalPage() {
  const { slug } = useLocalSearchParams<{ slug: string }>(); const { settings } = useApp();
  const [doc, setDoc] = useState<LegalDoc | null | undefined>(undefined);
  useEffect(() => { setDoc(undefined); if (!SLUGS.includes(slug as Slug)) return setDoc(null); fetchDocs([slug as Slug]).then((d) => setDoc(d[0] ?? null)); }, [slug]);
  if (doc === undefined) return <Loading />;
  if (!doc) return <Screen><T muted>Document not found.</T></Screen>;
  const vars = { team: typeof settings.team_name === 'string' ? settings.team_name : '', email: typeof settings.legal_contact_email === 'string' ? settings.legal_contact_email : '' };
  return (
    <Screen>
      <PageHead title={doc.title} description={doc.summary} />
      <H>{doc.title}</H>
      {doc.summary ? <T>{doc.summary}</T> : null}
      <LegalMeta doc={doc} />
      <LegalSections doc={doc} vars={vars} startOpen />
      {doc.slug === 'cookies' ? <View style={{ gap: 8 }}><Btn title="Change my cookie settings" onPress={openCookieSettings} /></View> : null}
    </Screen>
  );
}
