import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

// Root HTML for the web build. Anything here is in the static <head> of index.html, so crawlers see it without running JavaScript.
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <meta name="google-site-verification" content="g7bWAX-1LnhZAScPKDpnPEZ8YFqJTOvdu6ZiQixy2g8" />
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
