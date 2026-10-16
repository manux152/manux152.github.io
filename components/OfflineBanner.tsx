import { View } from 'react-native';
import { T } from './ui';
import { useOffline } from '../lib/offline';

/** A thin bar shown while the app is displaying saved information because it cannot reach the server. */
export function OfflineBanner() {
  const off = useOffline();
  if (!off) return null;
  return <View accessibilityLiveRegion="polite" accessibilityRole="alert" style={{ backgroundColor: '#5B4A00', paddingVertical: 6, paddingHorizontal: 12 }}><T style={{ color: '#fff', fontSize: 13, textAlign: 'center', fontWeight: '600' }}>You're offline — showing saved information.</T></View>;
}
