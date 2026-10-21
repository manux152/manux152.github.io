import { Platform } from 'react-native';

// Face ID / Touch ID / fingerprint / Windows Hello sign-in uses "passkeys" (WebAuthn). Offered on the website only, and only when this browser supports it.
export const passkeysSupported = (): boolean => Platform.OS === 'web' && typeof window !== 'undefined' && !!(window as any).PublicKeyCredential && window.isSecureContext !== false;

export function passkeyError(e: any): string {
  const m = String(e?.message ?? e ?? '');
  if (e?.name === 'NotAllowedError' || /cancel|abort|not allowed|timed out/i.test(m)) return 'Cancelled. Try again, or use your password.';
  if (/not (enabled|supported)|disabled|404|experimental/i.test(m)) return 'Biometric sign-in is not turned on for this site yet. Use your password for now.';
  if (/no.*(credential|passkey)|not found/i.test(m)) return 'No passkey found on this device. Sign in with your password, then add one on your Account page.';
  return m || 'Biometric sign-in did not work. Use your password.';
}
