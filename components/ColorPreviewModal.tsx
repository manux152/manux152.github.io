import { Modal, View } from 'react-native';
import { Image } from 'expo-image';
import { Btn, T } from './ui';
import { safeHex, webUrl } from '../lib/shop';
import { useTheme } from '../lib/theme';

/** Shows how an item looks in a chosen colour (its picture, or the colour itself if there is no picture). */
export function ColorPreviewModal({ visible, onClose, product, color, hex, image, note, onChoose }: {
  visible: boolean; onClose: () => void; product: string; color: string; hex?: string | null; image?: string | null; note?: string | null; onChoose?: () => void }) {
  const { colors } = useTheme(); const img = webUrl(image);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 16 }}>
        <View style={{ backgroundColor: colors.card, borderRadius: 14, padding: 14, gap: 10, maxWidth: 520, width: '100%', alignSelf: 'center', borderWidth: 1, borderColor: colors.border }}>
          <T style={{ fontWeight: '800', fontSize: 18 }}>{product}</T>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: safeHex(hex), borderWidth: 1, borderColor: colors.border }} />
            <T style={{ fontWeight: '700' }}>{color}</T>
          </View>
          {img ? <Image source={{ uri: img }} style={{ width: '100%', aspectRatio: 1, borderRadius: 12 }} contentFit="contain" accessibilityLabel={`${product} in ${color}`} />
            : <View accessible accessibilityLabel={`${color} colour sample`} style={{ width: '100%', aspectRatio: 1.6, borderRadius: 12, backgroundColor: safeHex(hex), borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}><T style={{ color: '#fff', fontWeight: '800', textShadowColor: '#000', textShadowRadius: 4 } as any}>No picture for this colour yet</T></View>}
          {note ? <T muted>{note}</T> : null}
          {onChoose ? <Btn title={`Choose ${color}`} onPress={() => { onChoose(); onClose(); }} /> : null}
          <Btn title="Close" kind="ghost" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}
