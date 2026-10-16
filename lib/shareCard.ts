import { Platform } from 'react-native';
import { shareText } from './share';

/**
 * Turns a rendered card into a PNG and opens the share sheet (phones), the browser's share dialog, or downloads it (web).
 * Needs `react-native-view-shot` and `expo-sharing` (and `html2canvas` on web). If anything is missing it shares plain text instead.
 */
export async function shareCardImage(ref: any, fallbackText: string): Promise<string | null> {
  try {
    const { captureRef } = require('react-native-view-shot');
    const web = Platform.OS === 'web';
    const uri: string = await captureRef(ref, { format: 'png', quality: 1, width: 1080, height: 1350, result: web ? 'data-uri' : 'tmpfile' });
    if (web) {
      const g: any = globalThis;
      const blob = await (await fetch(uri)).blob();
      const file = new g.File([blob], 'super-strikers-card.png', { type: 'image/png' });
      if (g.navigator?.canShare?.({ files: [file] })) { await g.navigator.share({ files: [file], text: fallbackText }); return null; }
      const a = g.document.createElement('a'); a.href = uri; a.download = 'super-strikers-card.png'; g.document.body.appendChild(a); a.click(); a.remove();
      return 'Image downloaded';
    }
    const Sharing = require('expo-sharing');
    if (await Sharing.isAvailableAsync()) { await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png' }); return null; }
  } catch (e: any) {
    if (e?.name === 'AbortError') return null;      // person closed the share dialog
  }
  return shareText(fallbackText);
}
