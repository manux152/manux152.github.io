import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { TrText } from './TrText';
import { useTheme } from '../lib/theme';
import { blocks, fill, type LegalDoc } from '../lib/legal';

/**
 * A legal document as numbered, collapsible sections. The wording is shown exactly as published (not machine-translated).
 * With `onOpen`, the parent learns which sections have been opened, so it can require that everything is reviewed.
 */
export function LegalSections({ doc, vars, opened, onOpen, startOpen }: {
  doc: LegalDoc; vars: { team?: string; email?: string }; opened?: Set<number>; onOpen?: (i: number) => void; startOpen?: boolean;
}) {
  const { colors, fs } = useTheme();
  const [open, setOpen] = useState<Set<number>>(() => new Set(startOpen ? doc.sections.map((_, i) => i) : []));
  const toggle = (i: number) => { setOpen((cur) => { const n = new Set(cur); if (n.has(i)) n.delete(i); else n.add(i); return n; }); onOpen?.(i); };
  return (
    <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.card }}>
      {doc.sections.map((s, i) => {
        const isOpen = open.has(i); const seen = opened?.has(i);
        return (
          <View key={i} style={{ borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: isOpen }} accessibilityLabel={`Section ${i + 1}: ${s.heading}`} onPress={() => toggle(i)}
              style={(st: any) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 14, minHeight: 52, backgroundColor: st.hovered ? colors.bg : 'transparent' })}>
              <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: seen ? '#1E8E4E' : colors.bg, borderWidth: 1, borderColor: seen ? '#1E8E4E' : colors.border }}>
                <Text style={{ color: seen ? '#fff' : colors.muted, fontWeight: '800', fontSize: 12 }}>{seen ? '✓' : i + 1}</Text>
              </View>
              <Text style={{ flex: 1, color: colors.heading, fontWeight: '700', fontSize: fs(15) }}>{s.heading}</Text>
              <Text style={{ color: colors.muted, fontSize: fs(16) }}>{isOpen ? '−' : '+'}</Text>
            </Pressable>
            {isOpen ? (
              <View style={{ paddingHorizontal: 14, paddingBottom: 16, paddingLeft: 54, gap: 8 }}>
                {blocks(fill(s.body, vars)).map((b, k) => b.bullet
                  ? <View key={k} style={{ flexDirection: 'row', gap: 8 }}><Text style={{ color: colors.muted }}>•</Text><Text style={{ flex: 1, color: colors.text, fontSize: fs(14), lineHeight: fs(21) }}>{b.text}</Text></View>
                  : <Text key={k} style={{ color: colors.text, fontSize: fs(14), lineHeight: fs(21) }}>{b.text}</Text>)}
              </View>) : null}
          </View>);
      })}
    </View>
  );
}
export const LegalMeta = ({ doc }: { doc: LegalDoc }) => {
  const { colors, fs } = useTheme();
  return <TrText style={{ color: colors.muted, fontSize: fs(12) }}>{`Version ${doc.version} · Effective ${new Date(doc.published_at).toLocaleDateString(undefined, { dateStyle: 'long' })}`}</TrText>;
};
