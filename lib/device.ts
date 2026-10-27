import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const TOKEN_KEY = 'ss_device_token';      // proof that this browser/phone was verified with an emailed code
const PENDING_KEY = 'ss_device_pending';  // set while a password sign-in is waiting for the device check / emailed code
export const IDLE_KEY = 'ss_idle_signout'; // set when the app signed someone out for inactivity (login page shows a message)
export const LAST_ACTIVE_KEY = 'ss_last_active';

let pending = false;
/** True while a sign-in is held back until this device is verified. The app treats that session as "not signed in yet". */
export const devicePending = () => pending;
export async function loadDeviceGate() { try { pending = !!(await AsyncStorage.getItem(PENDING_KEY)); } catch { pending = false; } }
export async function setDevicePending(v: boolean) {
  pending = v;
  try { if (v) await AsyncStorage.setItem(PENDING_KEY, '1'); else await AsyncStorage.removeItem(PENDING_KEY); } catch { /* storage unavailable */ }
}

/** Has this device been verified for the signed-in person? Skips the check (true) if the feature isn't installed yet, so nobody is locked out. */
export async function isDeviceTrusted(): Promise<boolean> {
  let token = ''; try { token = (await AsyncStorage.getItem(TOKEN_KEY)) ?? ''; } catch { /* none */ }
  const { data, error } = await supabase.rpc('device_trusted', { p_token: token });
  if (error) return /could not find|does not exist|schema cache/i.test(error.message);
  return data === true;
}

export async function sendLoginCode(): Promise<string | null> {
  const { error } = await supabase.functions.invoke('send-login-code');
  return error ? error.message : null;
}

const label = () => (Platform.OS === 'web' ? String((globalThis as any).navigator?.userAgent ?? 'Web browser').slice(0, 110) : Platform.OS);
export async function verifyLoginCode(code: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const { data, error } = await supabase.rpc('verify_login_code', { p_code: code.replace(/\s/g, ''), p_label: label() });
  if (error) return { ok: false, message: error.message };
  const r = String(data ?? '');
  if (r.startsWith('ok:')) { try { await AsyncStorage.setItem(TOKEN_KEY, r.slice(3)); } catch { /* still signed in, will be asked again next time */ } return { ok: true }; }
  if (r === 'wrong') return { ok: false, message: 'That code is not right. Check the newest email we sent you.' };
  if (r === 'locked') return { ok: false, message: 'Too many wrong tries. Ask for a new code.' };
  return { ok: false, message: 'That code has expired. Ask for a new code.' };
}
