import { useRouter, usePathname } from 'expo-router';
import { Screen, H } from '../../components/ui';
import { GroupedMenu } from '../../components/GroupedMenu';
import { useApp } from '../../lib/app-context';
import { useChatUnread } from '../../lib/chat';
import { buildMenuGroups } from '../../lib/menuGroups';
import { splitNav } from '../../lib/nav';

// Same groups and dropdowns as the side menu.
export default function More() {
  const { nav, settings, session, can, pages } = useApp(); const router = useRouter(); const path = usePathname();
  const { tabs, more } = splitNav(nav, can, 99);
  const chatOn = !!session && settings.chat_enabled !== false && settings.chat_enabled !== 'false'; const unread = useChatUnread(chatOn);
  const shopOn = settings.shop_enabled !== false;
  const { home, groups } = buildMenuGroups({ navItems: [...tabs, ...more], pages, signedIn: !!session, chatOn, unread, spinOn: shopOn && settings.spin_enabled !== false, isAdmin: can('admin.access') });
  const active = (r: string) => (r === '/' ? path === '/' : path === r || path.startsWith(r + '/'));
  return (
    <Screen>
      <H>More</H>
      <GroupedMenu home={home} groups={groups} onGo={(h) => router.push(h as any)} active={active} />
    </Screen>
  );
}
