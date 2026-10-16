import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { T, useAccent } from './ui';
import { EMOJI_GROUPS } from '../lib/chat';
import { useTheme } from '../lib/theme';

/** Emoji panel: pick a group, tap an emoji to add it to the message. */
export function EmojiPicker({ onPick }: { onPick: (e: string) => void }) {
  const [g, setG] = useState(0); const accent = useAccent(); const { colors } = useTheme();
  return (
    <View style={{ borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card, height: 230 }}>
      <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border }}>
        {EMOJI_GROUPS.map((x, i) => (
          <Pressable key={x.label} accessibilityRole="tab" accessibilityLabel={x.label} accessibilityState={{ selected: g === i }} onPress={() => setG(i)} style={{ flex: 1, alignItems: 'center', paddingVertical: 8, borderBottomWidth: 3, borderBottomColor: g === i ? accent : 'transparent' }}><T style={{ fontSize: 22 }}>{x.icon}</T></Pressable>))}
      </View>
      <ScrollView contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', padding: 6 }} keyboardShouldPersistTaps="always">
        {EMOJI_GROUPS[g].items.map((e) => <Pressable key={e} accessibilityRole="button" accessibilityLabel={`Emoji ${e}`} onPress={() => onPick(e)} style={{ width: '12.5%', minWidth: 40, alignItems: 'center', paddingVertical: 6 }}><T style={{ fontSize: 26 }}>{e}</T></Pressable>)}
      </ScrollView>
    </View>
  );
}
