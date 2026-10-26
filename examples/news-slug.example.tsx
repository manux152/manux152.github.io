// Example: app/news/[slug].tsx
// Static export needs generateStaticParams so each article gets its own HTML file.
import { useLocalSearchParams } from 'expo-router';
import { Seo } from '../components/Seo';

export async function generateStaticParams() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return [];
  const res = await fetch(`${url}/rest/v1/news?select=slug`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  const rows: { slug: string }[] = await res.json();
  return rows.map((r) => ({ slug: r.slug }));
}

export default function NewsArticle() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  // Load the article by slug from Supabase (your existing code), then:
  const article = { title: 'Article title', summary: 'Short summary', image: '/og.jpg', published: '2026-01-01' };

  return (
    <>
      <Seo
        title={article.title}
        description={article.summary}
        path={`/news/${slug}`}
        image={article.image}
        type="article"
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'NewsArticle',
          headline: article.title,
          datePublished: article.published,
          image: article.image,
          publisher: { '@type': 'Organization', name: 'Super Strikers' },
        }}
      />
      {/* ...your existing article screen... */}
    </>
  );
}
