// Real brand logos for the social links in the footer. The admin can replace any of them with their own picture (Admin → Website).
export type SocialLink = { label: string; url: string; icon_url?: string };

// [name or web address fragments to look for, logo slug on the free Simple Icons library, fallback emoji]
const BRANDS: [string[], string, string][] = [
  [['instagram'], 'instagram', '📸'],
  [['whatsapp', 'wa.me'], 'whatsapp', '💬'],
  [['facebook', 'fb.com', 'fb.me'], 'facebook', '👍'],
  [['twitter', 'x.com'], 'x', '✖'],
  [['youtube', 'youtu.be'], 'youtube', '▶'],
  [['tiktok'], 'tiktok', '🎵'],
  [['linkedin'], 'linkedin', '💼'],
  [['snapchat'], 'snapchat', '👻'],
  [['telegram', 't.me'], 'telegram', '✈'],
  [['threads'], 'threads', '🧵'],
  [['discord'], 'discord', '🎮'],
  [['pinterest'], 'pinterest', '📌'],
  [['twitch'], 'twitch', '🎮'],
  [['spotify'], 'spotify', '🎧'],
  [['github'], 'github', '💻'],
  [['reddit'], 'reddit', '👽'],
];

function brandOf(link: SocialLink) {
  const label = (link.label ?? '').trim().toLowerCase();
  let host = ''; try { host = new URL(link.url).hostname.toLowerCase(); } catch { /* not a full address */ }
  const exact = label === 'x' ? BRANDS.find((b) => b[1] === 'x') : undefined;
  return exact ?? BRANDS.find((b) => b[0].some((k) => (k === 'x.com' || k === 't.me' || k === 'wa.me' || k === 'fb.com' || k === 'fb.me' || k === 'youtu.be') ? host === k || host.endsWith('.' + k) : label.includes(k) || host.includes(k)));
}

/** The picture to show: the admin's own icon if they set one, otherwise the official logo for the brand, otherwise nothing. */
export function socialIconUrl(link: SocialLink): string | null {
  if (link.icon_url && /^https?:\/\//i.test(link.icon_url)) return link.icon_url;
  const b = brandOf(link);
  return b ? `https://cdn.simpleicons.org/${b[1]}` : null;
}
export const socialEmoji = (link: SocialLink) => brandOf(link)?.[2] ?? '🔗';
