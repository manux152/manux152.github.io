import Head from 'expo-router/head';

const SITE = 'https://superstrikers.club';
const BRAND = 'Super Strikers';
const DEFAULT_IMAGE = '/og.jpg'; // put a 1200x630 image at public/og.jpg

type SeoProps = {
  title: string;                 // page title, brand is appended automatically
  description: string;           // aim for 120-155 characters
  path?: string;                 // e.g. "/fixtures" (used for canonical + og:url)
  image?: string;                // absolute URL or path under the site
  type?: 'website' | 'article';
  noindex?: boolean;
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
};

export function Seo({
  title,
  description,
  path = '/',
  image = DEFAULT_IMAGE,
  type = 'website',
  noindex = false,
  jsonLd,
}: SeoProps) {
  const fullTitle = title.includes(BRAND) ? title : `${title} | ${BRAND}`;
  const url = `${SITE}${path === '/' ? '' : path}`;
  const img = image.startsWith('http') ? image : `${SITE}${image}`;

  return (
    <Head>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />
      {noindex && <meta name="robots" content="noindex, nofollow" />}

      <meta property="og:site_name" content={BRAND} />
      <meta property="og:type" content={type} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:image" content={img} />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={img} />

      {jsonLd && <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>}
    </Head>
  );
}
