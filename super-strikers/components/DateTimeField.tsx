import { useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { TrText as Text } from './TrText';
import { T, Btn, useColor } from './ui';
import { useTheme } from '../lib/theme';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const p2 = (n: number) => String(n).padStart(2, '0');

/** Parses 'YYYY-MM-DD' (as a local day) or any ISO timestamp (shown in the viewer's local time). Returns null if empty or invalid. */
export function parseWhen(v?: string | null): Date | null {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(v.includes(' ') && !v.includes('T') ? v.replace(' ', 'T') : v);
  return isNaN(d.getTime()) ? null : d;
}
export const ymd = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const show = (d: Date, time: boolean) => d.toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }) + (time ? ` · ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : '');

/**
 * A date (or date + time) field with an interactive calendar: tap the field, pick a day on the month grid, set the time, press Done.
 * mode "date" saves "YYYY-MM-DD"; mode "datetime" saves a full timestamp (your local time, stored as UTC). Empty = null (when `optional`).
 */
export function DateTimeField({ label, value, onChange, mode = 'datetime', optional = false }: { label?: string; value?: string | null; onChange: (v: string | null) => void; mode?: 'date' | 'datetime'; optional?: boolean }) {
  const { colors, fs } = useTheme(); const brand = useColor();
  const time = mode === 'datetime'; const cur = parseWhen(value);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState({ y: 0, m: 0 });                         // month being looked at
  const [d, setD] = useState({ y: 0, m: 0, day: 1, h: 12, min: 0 });       // the draft pick
  const today = new Date();

  const start = () => {
    const base = cur ?? new Date(); const hh = cur ? base.getHours() : 15, mm = cur ? base.getMinutes() : 0;
    setD({ y: base.getFullYear(), m: base.getMonth(), day: base.getDate(), h: time ? hh : 0, min: time ? mm : 0 });
    setView({ y: base.getFullYear(), m: base.getMonth() }); setOpen(true);
  };
  const shift = (dm: number) => { const t = new Date(view.y, view.m + dm, 1); setView({ y: t.getFullYear(), m: t.getMonth() }); };
  const first = new Date(view.y, view.m, 1).getDay(); const dim = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: dim }, (_, i) => i + 1)]; while (cells.length % 7) cells.push(null);
  const picked = (day: number) => d.y === view.y && d.m === view.m && d.day === day;
  const isToday = (day: number) => today.getFullYear() === view.y && today.getMonth() === view.m && today.getDate() === day;
  const h12 = d.h % 12 === 0 ? 12 : d.h % 12; const pm = d.h >= 12;
  const setH12 = (n: number, isPm: boolean) => setD({ ...d, h: (n % 12) + (isPm ? 12 : 0) });
  const done = () => { const out = new Date(d.y, d.m, d.day, time ? d.h : 0, time ? d.min : 0); onChange(time ? out.toISOString() : ymd(out)); setOpen(false); };
  const nowBtn = () => { const n = new Date(); setD({ y: n.getFullYear(), m: n.getMonth(), day: n.getDate(), h: time ? n.getHours() : 0, min: time ? Math.floor(n.getMinutes() / 5) * 5 : 0 }); setView({ y: n.getFullYear(), m: n.getMonth() }); };

  const Step = ({ val, onMinus, onPlus, lbl }: { val: string; onMinus: () => void; onPlus: () => void; lbl: string }) => (
    <View style={{ alignItems: 'center', gap: 4 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${lbl} up`} onPress={onPlus} style={{ width: 52, height: 40, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.text, fontSize: fs(18) }}>▲</Text></Pressable>
      <Text accessibilityLabel={`${lbl} ${val}`} style={{ color: colors.text, fontWeight: '800', fontSize: fs(24) }}>{val}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`${lbl} down`} onPress={onMinus} style={{ width: 52, height: 40, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.text, fontSize: fs(18) }}>▼</Text></Pressable>
    </View>);

  return (
    <View style={{ gap: 4 }}>
      {label ? <Text style={{ fontSize: fs(13), color: colors.muted, fontWeight: '600' }}>{label}{optional ? ' (optional)' : ''}</Text> : null}
      <Pressable accessibilityRole="button" accessibilityLabel={`${label ?? 'Date'}: ${cur ? show(cur, time) : 'not set'}. Opens a calendar`} onPress={start}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: colors.inputBorder, borderRadius: 10, padding: 10, minHeight: 44, backgroundColor: colors.inputBg }}>
        <Text style={{ fontSize: fs(18) }}>📅</Text>
        <Text style={{ flex: 1, color: cur ? colors.text : colors.placeholder, fontSize: fs(15) }}>{cur ? show(cur, time) : time ? 'Choose date and time' : 'Choose a date'}</Text>
        {optional && cur ? <Pressable accessibilityRole="button" accessibilityLabel="Clear date" hitSlop={10} onPress={() => onChange(null)}><Text style={{ color: colors.muted, fontSize: fs(18) }}>✕</Text></Pressable> : null}
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable accessibilityLabel="Close calendar" onPress={() => setOpen(false)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 16 }}>
          <Pressable onPress={() => {}} style={{ alignSelf: 'center', width: '100%', maxWidth: 400, maxHeight: '96%', backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border }}>
            <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Pressable accessibilityRole="button" accessibilityLabel="Previous year" onPress={() => shift(-12)} style={{ padding: 8 }}><Text style={{ color: colors.muted, fontSize: fs(18) }}>«</Text></Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel="Previous month" onPress={() => shift(-1)} style={{ padding: 8 }}><Text style={{ color: colors.text, fontSize: fs(22) }}>‹</Text></Pressable>
                <Text accessibilityRole="header" style={{ color: colors.heading, fontWeight: '800', fontSize: fs(17), flex: 1, textAlign: 'center' }}>{MONTHS[view.m]} {view.y}</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Next month" onPress={() => shift(1)} style={{ padding: 8 }}><Text style={{ color: colors.text, fontSize: fs(22) }}>›</Text></Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel="Next year" onPress={() => shift(12)} style={{ padding: 8 }}><Text style={{ color: colors.muted, fontSize: fs(18) }}>»</Text></Pressable>
              </View>
              <View style={{ flexDirection: 'row' }}>{DAYS.map((x) => <Text key={x} style={{ flex: 1, textAlign: 'center', color: colors.muted, fontSize: fs(12), fontWeight: '700' }}>{x}</Text>)}</View>
              {Array.from({ length: cells.length / 7 }, (_, r) => (
                <View key={r} style={{ flexDirection: 'row' }}>
                  {cells.slice(r * 7, r * 7 + 7).map((day, k) => day == null ? <View key={k} style={{ flex: 1, height: 42 }} /> : (
                    <Pressable key={k} accessibilityRole="button" accessibilityLabel={`${MONTHS[view.m]} ${day}, ${view.y}`} accessibilityState={{ selected: picked(day) }} onPress={() => setD({ ...d, y: view.y, m: view.m, day })}
                      style={{ flex: 1, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21, backgroundColor: picked(day) ? brand : 'transparent', borderWidth: isToday(day) && !picked(day) ? 1 : 0, borderColor: brand }}>
                      <Text style={{ color: picked(day) ? '#fff' : colors.text, fontWeight: picked(day) || isToday(day) ? '800' : '400', fontSize: fs(15) }}>{day}</Text>
                    </Pressable>))}
                </View>))}
              {time ? (
                <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 }}>
                  <Text style={{ color: colors.muted, fontWeight: '700', fontSize: fs(13) }}>Time</Text>
                  <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 14 }}>
                    <Step lbl="Hour" val={String(h12)} onPlus={() => setH12(h12 === 12 ? 1 : h12 + 1, pm)} onMinus={() => setH12(h12 === 1 ? 12 : h12 - 1, pm)} />
                    <Text style={{ color: colors.text, fontWeight: '800', fontSize: fs(24) }}>:</Text>
                    <Step lbl="Minute" val={p2(d.min)} onPlus={() => setD({ ...d, min: (d.min + 5) % 60 })} onMinus={() => setD({ ...d, min: (d.min + 55) % 60 })} />
                    <View style={{ gap: 6 }}>
                      {['AM', 'PM'].map((ap) => { const on = (ap === 'PM') === pm; return (
                        <Pressable key={ap} accessibilityRole="button" accessibilityLabel={ap} accessibilityState={{ selected: on }} onPress={() => setH12(h12, ap === 'PM')}
                          style={{ width: 54, height: 40, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? brand : 'transparent', borderWidth: 1, borderColor: on ? brand : colors.border }}>
                          <Text style={{ color: on ? '#fff' : colors.text, fontWeight: '800' }}>{ap}</Text></Pressable>); })}
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
                    {[0, 15, 30, 45].map((mm) => <Pressable key={mm} accessibilityRole="button" accessibilityLabel={`Minute ${p2(mm)}`} onPress={() => setD({ ...d, min: mm })} style={{ paddingHorizontal: 12, height: 36, borderRadius: 18, borderWidth: 1, borderColor: d.min === mm ? brand : colors.border, backgroundColor: d.min === mm ? brand : 'transparent', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: d.min === mm ? '#fff' : colors.text, fontWeight: '700' }}>:{p2(mm)}</Text></Pressable>)}
                  </View>
                </View>) : null}
              <T muted style={{ textAlign: 'center' }}>{show(new Date(d.y, d.m, d.day, time ? d.h : 0, time ? d.min : 0), time)}</T>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}><Btn title={time ? 'Now' : 'Today'} kind="ghost" onPress={nowBtn} /></View>
                {optional ? <View style={{ flex: 1 }}><Btn title="Clear" kind="ghost" onPress={() => { onChange(null); setOpen(false); }} /></View> : null}
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}><Btn title="Cancel" kind="ghost" onPress={() => setOpen(false)} /></View>
                <View style={{ flex: 1 }}><Btn title="Done" onPress={done} /></View>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
