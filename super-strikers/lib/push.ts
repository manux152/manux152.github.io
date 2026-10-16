import { Platform } from 'react-native';
import { supabase } from './supabase';

// expo-notifications is loaded lazily so the web build never touches native-only code.
const N = () => require('expo-notifications');

export function initPush(onRoute: (route: string) => void) {
  if (Platform.OS === 'web') return () => {};
  const n = N();
  n.setNotificationHandler({ handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false }) });
  const sub = n.addNotificationResponseReceivedListener((r: any) => {
    const route = r.notification.request.content.data?.route;
    if (typeof route === 'string') onRoute(route);
  });
  return () => sub.remove();
}

export async function enablePush(userId: string): Promise<{ ok: boolean; message: string }> {
  if (Platform.OS === 'web') return { ok: false, message: 'Push notifications work in the iOS and Android apps.' };
  const Device = require('expo-device'); const Constants = require('expo-constants').default; const n = N();
  if (!Device.isDevice) return { ok: false, message: 'Push notifications need a physical device.' };
  if (Platform.OS === 'android') await n.setNotificationChannelAsync('default', { name: 'Team updates', importance: n.AndroidImportance.DEFAULT });
  let { status } = await n.getPermissionsAsync();
  if (status !== 'granted') status = (await n.requestPermissionsAsync()).status;
  if (status !== 'granted') return { ok: false, message: 'Permission was denied. You can enable notifications in your phone settings.' };
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  const token = (await n.getExpoPushTokenAsync(projectId ? { projectId } : undefined)).data;
  const { error } = await supabase.from('push_tokens').upsert({ user_id: userId, token, platform: Platform.OS }, { onConflict: 'token' });
  if (error) return { ok: false, message: error.message };
  await supabase.from('profiles').update({ push_enabled: true }).eq('id', userId);
  return { ok: true, message: 'Notifications are on for this device.' };
}

export async function disablePush(userId: string) {
  await supabase.from('profiles').update({ push_enabled: false }).eq('id', userId);
}
