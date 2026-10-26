// Root HTML shell for static export. MERGE with your existing app/+html.tsx if you have one.
import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

const orgJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SportsTeam',
  name: 'Super Strikers',
  url: 'https://superstrikers.club',
  logo: 'https://superstrikers.club/og.jpg',
  // sport: 'Soccer',            // uncomment and set
  // sameAs: ['https://facebook.com/...', 'https://instagram.com/...'],
};

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <meta name="theme-color" content="#0B6E4F" />
        <meta
          name="description"
          content="Official Super Strikers website and app: fixtures, results, squad, news and shop."
        />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }} />
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
