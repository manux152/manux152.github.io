import { Platform } from 'react-native';
import * as Linking from 'expo-linking';

// Where email links should bring the user back to (web origin, or the app's deep link on phones).
// Add these to Supabase → Authentication → URL Configuration → Redirect URLs.
export const appUrl = (path = '/') => (Platform.OS === 'web' ? `${(globalThis as any).location.origin}${path}` : Linking.createURL(path));
