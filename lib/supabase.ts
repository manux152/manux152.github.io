import 'react-native-url-polyfill/auto';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { explainFunctionErrors } from './fnErrors';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// True only when a real .env is present (not the .env.example placeholders).
export const supabaseConfigured = !!url && !!key && !url.includes('YOUR-PROJECT') && !key.includes('YOUR-ANON-KEY');

// When the server says this account was deactivated or deleted (see migration 032), end the session on this device at once.
let revoking = false;
export const REVOKED_KEY = 'ss_account_revoked';
export async function endRevokedSession() {
  if (revoking) return; revoking = true;
  try { await AsyncStorage.setItem(REVOKED_KEY, '1'); await supabase.auth.signOut({ scope: 'local' }); } catch { /* already signed out */ }
  finally { setTimeout(() => { revoking = false; }, 3000); }
}
const guardedFetch: typeof fetch = async (input, init) => {
  const res = await fetch(input, init);
  if (res.status === 403 || res.status === 401) {
    try { const t = await res.clone().text(); if (t.includes('account_inactive') || /user_banned|User from sub claim in JWT does not exist/i.test(t)) endRevokedSession(); } catch { /* not readable */ }
  }
  return res;
};

// Placeholders keep createClient from throwing at import time, so the app can show a helpful setup screen instead of a blank page.
export const supabase = createClient(
  supabaseConfigured ? url! : 'https://placeholder.supabase.co',
  supabaseConfigured ? key! : 'placeholder-anon-key',
  { global: { fetch: guardedFetch }, auth: { storage: AsyncStorage, autoRefreshToken: supabaseConfigured, persistSession: true, detectSessionInUrl: Platform.OS === 'web', experimental: { passkey: true } } as any }
);

// Edge functions: show the real reason instead of "Edge Function returned a non-2xx status code".
explainFunctionErrors(supabase);
