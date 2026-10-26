// Root HTML for the static web export. Titles, descriptions, canonical links and JSON-LD come from components/PageHead.tsx.
import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <meta name="theme-color" content="#0B6E4F" />
        <meta name="google-site-verification" content="g7bWAX-1LnhZAScPKDpnPEZ8YFqJTOvdu6ZiQixy2g8" />
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
