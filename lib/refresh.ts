// Pull-to-refresh bus: screens' data hooks register here, and pulling a page down asks all of them to reload quietly.
type Fn = () => unknown | Promise<unknown>;
const listeners = new Set<Fn>();
export function onPullRefresh(fn: Fn) { listeners.add(fn); return () => { listeners.delete(fn); }; }
export async function pullRefresh() { await Promise.allSettled([...listeners].map((f) => Promise.resolve().then(f))); }
