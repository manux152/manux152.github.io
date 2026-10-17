import { useEffect, useSyncExternalStore } from 'react';
import { BackHandler, Platform } from 'react-native';
import { usePathname, useRouter } from 'expo-router';

// Remembers the pages visited this session so the header can show ← only when there is somewhere to go back to,
// and → only after the person has gone back (exactly like a browser).
let stack: string[] = []; let idx = -1; let pending: 'back' | 'forward' | 'pop' | null = null;
let snap = { canBack: false, canForward: false };
const subs = new Set<() => void>();
const emit = () => { const next = { canBack: idx > 0, canForward: idx < stack.length - 1 }; if (next.canBack !== snap.canBack || next.canForward !== snap.canForward) { snap = next; subs.forEach((f) => f()); } };

function record(p: string) {
  if (stack[idx] === p) { pending = null; return; }
  const how = pending; pending = null;
  if (how === 'back' && idx > 0) idx--;
  else if (how === 'forward' && idx < stack.length - 1) idx++;
  else if (how === 'pop') { const j = stack[idx - 1] === p ? idx - 1 : stack[idx + 1] === p ? idx + 1 : stack.lastIndexOf(p); if (j >= 0) idx = j; else { stack = stack.slice(0, idx + 1); stack.push(p); idx++; } }
  else if (Platform.OS !== 'web' && idx > 0 && stack[idx - 1] === p) idx--;   // iOS swipe-back
  else { stack = stack.slice(0, idx + 1); stack.push(p); idx++; }
  emit();
}

/** Mount once, near the root. */
export function useNavTracker() {
  const path = usePathname();
  useEffect(() => { record(path); }, [path]);
  useEffect(() => {
    if (Platform.OS === 'web') {
      const onPop = () => { pending = 'pop'; };            // the browser's own back / forward buttons
      (globalThis as any).addEventListener?.('popstate', onPop);
      return () => (globalThis as any).removeEventListener?.('popstate', onPop);
    }
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { pending = 'pop'; return false; });
    return () => sub.remove();
  }, []);
}

export function useNavArrows() {
  const router = useRouter();
  const s = useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => snap, () => snap);
  const back = () => {
    pending = 'back';
    if (Platform.OS === 'web') (globalThis as any).history.back();
    else if (router.canGoBack()) router.back();
    else router.replace((stack[idx - 1] ?? '/') as any);
  };
  const forward = () => {
    const next = stack[idx + 1]; if (next == null) return;
    pending = 'forward';
    if (Platform.OS === 'web') (globalThis as any).history.forward(); else router.push(next as any);
  };
  return { ...s, back, forward };
}
