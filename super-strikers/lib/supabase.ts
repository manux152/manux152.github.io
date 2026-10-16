import 'react-native-url-polyfill/auto';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { explainFunctionErrors } from './fnErrors';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// True only when a real .env is present (not the .env.example placeholders).
export const supabaseConfigured = !!url && !!key && !url.includes('YOUR-PROJECT') && !key.includes('YOUR-ANON-KEY');

// Placeholders keep createClient from throwing at import time, so the app can show a helpful setup screen instead of a blank page.
export const supabase = createClient(
  supabaseConfigured ? url! : 'https://placeholder.supabase.co',
  supabaseConfigured ? key! : 'placeholder-anon-key',
  { auth: { storage: AsyncStorage, autoRefreshToken: supabaseConfigured, persistSession: true, detectSessionInUrl: Platform.OS === 'web' } }
);

// Edge functions: show the real reason instead of "Edge Function returned a non-2xx status code".
explainFunctionErrors(supabase);
