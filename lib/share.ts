import { Platform, Share } from 'react-native';

// Copies on web, opens the share sheet on phones. Returns a short status message for web.
export async function shareText(message: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    try { await (globalThis as any).navigator.clipboard.writeText(message); return 'Copied to clipboard'; } catch { return 'Could not copy — select and copy manually'; }
  }
  try { await Share.share({ message }); } catch { /* cancelled */ }
  return null;
}
