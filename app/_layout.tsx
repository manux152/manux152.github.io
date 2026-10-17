import { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppProvider, useApp } from '../lib/app-context';
import { CartProvider } from '../lib/cart';
import { Loading } from '../components/ui';
import { initPush } from '../lib/push';
import { supabaseConfigured } from '../lib/supabase';
import { ThemeProvider, useTheme } from '../lib/theme';
import { View } from 'react-native';
import { TrText as Text } from '../components/TrText';
import { Favicon } from '../components/Favicon';
import { AssistantFab } from '../components/AssistantFab';
import { CallOverlay } from '../components/CallOverlay';
import { NavBackground } from '../components/NavBackground';
import { useNavLook } from '../lib/useNavLook';
import { I18nProvider, useI18n } from '../lib/i18n';
import { usePageViews } from '../lib/analytics';
import { PwaSetup } from '../components/PwaSetup';
import { OfflineBanner } from '../components/OfflineBanner';
import { LegalGate } from '../components/LegalGate';
import { CookieBanner } from '../components/CookieBanner';

export { ErrorBoundary } from 'expo-router';

function Inner() {
  const { t } = useI18n();
  const { ready, settings } = useApp();
  const { colors } = useTheme();
  const router = useRouter(); const look = useNavLook();
  useEffect(() => initPush((route) => router.push(route as any)), []); // eslint-disable-line
  usePageViews();
  if (!ready) return <Loading />;
  return (
    <LegalGate>
      <Favicon />
      <PwaSetup />
      <OfflineBanner />
      <StatusBar style={look.light ? 'dark' : 'light'} />
      <Stack screenOptions={{ headerStyle: { backgroundColor: look.bg }, headerBackground: () => <NavBackground look={look} />, headerTintColor: look.text, headerTitleStyle: { color: look.text }, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ title: t('Sign in') }} />
        <Stack.Screen name="news/[slug]" options={{ title: t('News') }} />
        <Stack.Screen name="season-review" options={{ title: t('Season review') }} />
        <Stack.Screen name="search" options={{ title: t('Search') }} />
        <Stack.Screen name="profile" options={{ title: t('My profile') }} />
        <Stack.Screen name="training" options={{ title: t('Training') }} />
        <Stack.Screen name="development" options={{ title: t('My development') }} />
        <Stack.Screen name="predictor" options={{ title: t('Predict the score') }} />
        <Stack.Screen name="family" options={{ title: t('My family') }} />
        <Stack.Screen name="rotas" options={{ title: t('Volunteers & lifts') }} />
        <Stack.Screen name="invite" options={{ title: t('Invite friends') }} />
        <Stack.Screen name="formations" options={{ title: t('Formations') }} />
        <Stack.Screen name="product/[slug]" options={{ title: t('Product') }} />
        <Stack.Screen name="cart" options={{ title: t('Cart') }} />
        <Stack.Screen name="orders" options={{ title: t('My orders') }} />
        <Stack.Screen name="reset-password" options={{ title: t('New password') }} />
        <Stack.Screen name="tryout/[id]" options={{ title: t('Tryout') }} />
        <Stack.Screen name="page/[slug]" options={{ title: t('Info') }} />
        <Stack.Screen name="legal/[slug]" options={{ title: t('Legal') }} />
        <Stack.Screen name="account" options={{ title: t('Account') }} />
        <Stack.Screen name="dashboard" options={{ title: t('My dashboard') }} />
        <Stack.Screen name="settings" options={{ title: t('Settings & accessibility') }} />
        <Stack.Screen name="register" options={{ title: t('Join the team') }} />
        <Stack.Screen name="match/[id]" options={{ title: t('Match') }} />
        <Stack.Screen name="player/[id]" options={{ title: t('Player') }} />
        <Stack.Screen name="media/[id]" options={{ title: t('Album') }} />
        <Stack.Screen name="chat/index" options={{ title: t('Messages') }} />
        <Stack.Screen name="chat/[id]" options={{ title: t('Chat') }} />
        <Stack.Screen name="assistant" options={{ title: settings.assistant_name ?? 'Team Assistant' }} />
        <Stack.Screen name="admin" options={{ headerShown: false }} />
      </Stack>
      <AssistantFab />
      <CallOverlay />
      <CookieBanner />
    </LegalGate>
  );
}
function SetupNeeded() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#fff' }}>
      <Text style={{ fontSize: 20, fontWeight: '700', marginBottom: 12 }}>Supabase isn't configured</Text>
      <Text style={{ fontSize: 15, lineHeight: 22 }}>
        Create a .env file in the project root with EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY (see .env.example), then restart with: npx expo start --web --clear
      </Text>
    </View>
  );
}
export default function Root() { if (!supabaseConfigured) return <SetupNeeded />; return <ThemeProvider><AppProvider><I18nProvider><CartProvider><Inner /></CartProvider></I18nProvider></AppProvider></ThemeProvider>; }
