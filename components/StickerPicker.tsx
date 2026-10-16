import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import { T, useAccent } from './ui';
import { BUILTIN_STICKERS } from '../lib/chat';
import { supabase } from '../lib/supabase';
import { useTheme } from '../lib/theme';

/** Stickers: big emoji stickers built in, plus picture stickers the club added in Admin → Chat. One tap sends. */
export function StickerPicker({ onPick }: { onPick: (s: { emoji?: string; url?: string }) => void }) {
  const [custom, setCustom] = useState<{ id: string; name: string; image_url: string }[]>([]); const [tab, setTab] = useState<'club' | 'emoji'>('club'); const accent = useAccent(); const { colors } = useTheme();
  useEffect(() => { supabase.from('chat_stickers').select('id,name,image_url').eq('is_active', true).order('sort_order').order('created_at').then(({ data }) => { setCustom((data ?? []) as any); if (!(data ?? []).length) setTab('emoji'); }); }, []);
  return (
    <View style={{ borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card, height: 230 }}>
      <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border }}>
        {custom.length > 0 ? <Pressable accessibilityRole="tab" accessibilityState={{ selected: tab === 'club' }} onPress={() => setTab('club')} style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderBottomWidth: 3, borderBottomColor: tab === 'club' ? accent : 'transparent' }}><T style={{ fontWeight: '700' }}>Club stickers</T></Pressable> : null}
        <Pressable accessibilityRole="tab" accessibilityState={{ selected: tab === 'emoji' }} onPress={() => setTab('emoji')} style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderBottomWidth: 3, borderBottomColor: tab === 'emoji' ? accent : 'transparent' }}><T style={{ fontWeight: '700' }}>Big emoji</T></Pressable>
      </View>
      <ScrollView contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', padding: 8, gap: 8 }} keyboardShouldPersistTaps="always">
        {tab === 'club'
          ? custom.map((s) => <Pressable key={s.id} accessibilityRole="button" accessibilityLabel={`Send sticker ${s.name}`} onPress={() => onPick({ url: s.image_url })}><Image source={{ uri: s.image_url }} accessibilityLabel={s.name} contentFit="contain" style={{ width: 84, height: 84 }} /></Pressable>)
          : BUILTIN_STICKERS.map((e) => <Pressable key={e} accessibilityRole="button" accessibilityLabel={`Send sticker ${e}`} onPress={() => onPick({ emoji: e })} style={{ width: 76, height: 76, alignItems: 'center', justifyContent: 'center' }}><T style={{ fontSize: 52 }}>{e}</T></Pressable>)}
      </ScrollView>
    </View>
  );
}
