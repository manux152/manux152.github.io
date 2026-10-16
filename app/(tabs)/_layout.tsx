import { Tabs } from 'expo-router';
import { useApp } from '../../lib/app-context';
import { splitNav } from '../../lib/nav';
import { useLayout } from '../../lib/layout';
import { useTheme } from '../../lib/theme';
import { SiteHeader } from '../../components/SiteHeader';
import { NavBackground } from '../../components/NavBackground';
import { useNavLook } from '../../lib/useNavLook';
import { useI18n } from '../../lib/i18n';

// Tab screens are files; labels, order, visibility and how many get a tab (max_tabs) come from the database.
const SCREENS = [
  { name: 'index', route: '/' }, { name: 'matches', route: '/matches' }, { name: 'table', route: '/table' }, { name: 'news', route: '/news' },
  { name: 'players', route: '/players' }, { name: 'stats', route: '/stats' }, { name: 'media', route: '/media' }, { name: 'calendar', route: '/calendar' },
  { name: 'awards', route: '/awards' }, { name: 'tryouts', route: '/tryouts' }, { name: 'shop', route: '/shop' },
];

export default function TabsLayout() {
  const { nav, settings, can } = useApp();
  const { wide, width } = useLayout();
  const { colors } = useTheme(); const look = useNavLook(); const { t } = useI18n();
  const { tabs, more } = splitNav(nav, can, Number(settings.max_tabs ?? 5));
  const inMain = new Map(tabs.map((n) => [n.route, n]));
  return (
    <Tabs screenOptions={{
      header: () => <SiteHeader />,
      sceneStyle: { backgroundColor: colors.bg },
      // Wide screens use the menu row inside the header; phones keep the bottom bar, in the same theme as the header.
      tabBarStyle: wide ? { display: 'none' } : { backgroundColor: look.light ? colors.card : look.bg, borderTopColor: look.border },
      tabBarBackground: wide ? undefined : () => <NavBackground look={look} />,
      tabBarActiveTintColor: look.accent, tabBarInactiveTintColor: look.light ? colors.muted : look.text,
      tabBarIcon: () => null, tabBarIconStyle: { display: 'none' },
      tabBarLabelStyle: { fontSize: Math.round(Math.min(14, Math.max(11, width * 0.032))), fontWeight: '700', paddingVertical: Math.round(Math.min(12, Math.max(6, width * 0.025))) },
    }}>
      {SCREENS.map((s) => {
        const item = inMain.get(s.route);
        return <Tabs.Screen key={s.name} name={s.name} options={{ title: item?.label ? t(item.label) : s.name, href: item ? undefined : null }} />;
      })}
      <Tabs.Screen name="more" options={{ title: t('More'), href: more.length ? undefined : null }} />
    </Tabs>
  );
}
