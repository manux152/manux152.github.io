import { Redirect, Stack } from 'expo-router';
import { useApp } from '../../lib/app-context';
import { useTheme } from '../../lib/theme';
import { useI18n } from '../../lib/i18n';
import { StackHeader } from '../../components/StackHeader';

export default function AdminLayout() {
  const { session } = useApp(); const { t } = useI18n();
  const { colors } = useTheme();
  if (!session) return <Redirect href="/login" />;
  return (
    <Stack screenOptions={{ header: ({ options }) => <StackHeader title={typeof options.title === 'string' ? options.title : undefined} />, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="index" options={{ title: t('Admin') }} />
      <Stack.Screen name="users" options={{ title: t('Users') }} />
      <Stack.Screen name="roles" options={{ title: t('Roles') }} />
      <Stack.Screen name="manage/[resource]" options={{ title: t('Manage') }} />
      <Stack.Screen name="match/[id]" options={{ title: t('Match events') }} />
      <Stack.Screen name="live/[id]" options={{ title: t('Live console') }} />
      <Stack.Screen name="polls" options={{ title: t('Polls') }} />
      <Stack.Screen name="video/[matchId]" options={{ title: t('Match video') }} />
      <Stack.Screen name="analytics" options={{ title: t('Analytics') }} />
      <Stack.Screen name="export" options={{ title: t('Export data') }} />
      <Stack.Screen name="families" options={{ title: t('Families') }} />
      <Stack.Screen name="consents" options={{ title: t('Consent forms') }} />
      <Stack.Screen name="fees" options={{ title: t('Fees') }} />
      <Stack.Screen name="kit" options={{ title: t('Kit') }} />
      <Stack.Screen name="rotas" options={{ title: t('Rotas') }} />
      <Stack.Screen name="sponsor-report" options={{ title: t('Sponsor report') }} />
      <Stack.Screen name="comments" options={{ title: t('Comments') }} />
      <Stack.Screen name="referrals" options={{ title: t('Referrals') }} />
      <Stack.Screen name="ratings/[matchId]" options={{ title: t('Rate players') }} />
      <Stack.Screen name="development/index" options={{ title: t('Player development') }} />
      <Stack.Screen name="development/[id]" options={{ title: t('Player development') }} />
      <Stack.Screen name="match-report/[id]" options={{ title: t('Match report') }} />
      <Stack.Screen name="registrations" options={{ title: t('Registrations') }} />
      <Stack.Screen name="notifications" options={{ title: t('Notifications') }} />
      <Stack.Screen name="competition/[id]" options={{ title: t('League table') }} />
      <Stack.Screen name="audit" options={{ title: t('Audit log') }} />
      <Stack.Screen name="codes" options={{ title: t('Team codes') }} />
      <Stack.Screen name="tryouts/[id]" options={{ title: t('Applications') }} />
      <Stack.Screen name="email-design" options={{ title: t('Email design') }} />
      <Stack.Screen name="email-template/[id]" options={{ title: t('Email template') }} />
      <Stack.Screen name="email-send" options={{ title: t('Send email') }} />
      <Stack.Screen name="email-log" options={{ title: t('Email log') }} />
      <Stack.Screen name="coach" options={{ title: "Coaches' area" }} />
      <Stack.Screen name="lineup/[matchId]" options={{ title: t('Lineup') }} />
      <Stack.Screen name="formation-design" options={{ title: t('Design formation') }} />
      <Stack.Screen name="product/[id]" options={{ title: t('Product photos & sizes') }} />
      <Stack.Screen name="orders" options={{ title: t('Orders') }} />
      <Stack.Screen name="payments" options={{ title: t('Payments') }} />
      <Stack.Screen name="training/[id]" options={{ title: t('Attendance') }} />
      <Stack.Screen name="attendance" options={{ title: t('Attendance report') }} />
      <Stack.Screen name="season-report" options={{ title: t('Season report') }} />
      <Stack.Screen name="website" options={{ title: t('Website') }} />
      <Stack.Screen name="hero" options={{ title: t('Hero slider') }} />
      <Stack.Screen name="branding" options={{ title: t('Logo & branding') }} />
      <Stack.Screen name="media" options={{ title: t('Media') }} />
      <Stack.Screen name="news/index" options={{ title: t('News') }} />
      <Stack.Screen name="news/[id]" options={{ title: t('News story') }} />
      <Stack.Screen name="chat" options={{ title: t('Chat settings & moderation') }} />
      <Stack.Screen name="assistant" options={{ title: t('Team assistant') }} />
      <Stack.Screen name="header-footer" options={{ title: t('Header & footer') }} />
      <Stack.Screen name="spin" options={{ title: t('Spin wheel') }} />
      <Stack.Screen name="inventory" options={{ title: t('Inventory') }} />
      <Stack.Screen name="tactics" options={{ title: t('Tactics board') }} />
      <Stack.Screen name="nav-appearance" options={{ title: t('Navigation look') }} />
      <Stack.Screen name="newsletters" options={{ title: t('Newsletters') }} />
      <Stack.Screen name="fans" options={{ title: t('Fan club') }} />
      <Stack.Screen name="security" options={{ title: t('Security') }} />
      <Stack.Screen name="favicon" options={{ title: t('Favicon') }} />
    </Stack>
  );
}
