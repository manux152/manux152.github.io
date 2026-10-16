import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Line = { product_id: string; variant_id: string | null; qty: number };
type Ctx = { lines: Line[]; count: number; add: (l: Line) => void; setQty: (i: number, q: number) => void; remove: (i: number) => void; clear: () => void };
const C = createContext<Ctx>(null as any);
export const useCart = () => useContext(C);
const KEY = 'cart.v1';

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<Line[]>([]);
  useEffect(() => { AsyncStorage.getItem(KEY).then((s) => { if (s) try { setLines(JSON.parse(s)); } catch { /* ignore */ } }); }, []);
  useEffect(() => { AsyncStorage.setItem(KEY, JSON.stringify(lines)).catch(() => {}); }, [lines]);
  const value = useMemo<Ctx>(() => ({
    lines, count: lines.reduce((a, l) => a + l.qty, 0),
    add: (l) => setLines((cur) => { const i = cur.findIndex((x) => x.product_id === l.product_id && x.variant_id === l.variant_id);
      if (i < 0) return [...cur, l]; const n = [...cur]; n[i] = { ...n[i], qty: Math.min(20, n[i].qty + l.qty) }; return n; }),
    setQty: (i, q) => setLines((cur) => cur.map((x, j) => (j === i ? { ...x, qty: Math.max(1, Math.min(20, q)) } : x))),
    remove: (i) => setLines((cur) => cur.filter((_, j) => j !== i)),
    clear: () => setLines([]),
  }), [lines]);
  return <C.Provider value={value}>{children}</C.Provider>;
}
