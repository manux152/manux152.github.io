import Head from 'expo-router/head';
import { useApp } from '../lib/app-context';
import { useI18n } from '../lib/i18n';

// Sets the browser tab title and search/social description on the website (no effect in the phone apps).
export function PageHead({ title, description, image }: { title?: string; description?: string | null; image?: string | null }) {
  const { settings } = useApp(); const { t } = useI18n();
  const team = settings.team_name ?? '';
  const full = title ? `${t(title)} · ${team}` : team;
  const desc = (description ?? '').replace(/\s+/g, ' ').slice(0, 160);
  return (
    <Head>
      <title>{full}</title>
      {desc ? <meta name="description" content={desc} /> : null}
      <meta property="og:title" content={full} />
      {desc ? <meta property="og:description" content={desc} /> : null}
      {image ? <meta property="og:image" content={image} /> : null}
      <meta property="og:type" content="website" />
      <meta name="twitter:card" content={image ? 'summary_large_image' : 'summary'} />
    </Head>
  );
}
