import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { onPullRefresh } from './refresh';
import { cacheRead, cacheWrite, cacheable, looksOffline, markOffline, markOnline } from './offline';

export function useTable<T = any>(table: string, build?: (q: any) => any, deps: any[] = []) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async (silent?: boolean | unknown) => {
    if (silent !== true) setLoading(true);
    let q: any = supabase.from(table).select('*');
    if (build) q = build(q);
    const href: string | undefined = cacheable(table) ? q?.url?.href : undefined;     // the exact request, so each different query keeps its own saved copy
    const { data, error } = await q;
    if (error) {
      const saved = href && looksOffline(error) ? await cacheRead(href) : null;
      if (saved) { setError(null); setData(saved as T[]); markOffline(); }                            // no signal: show the last saved copy
      else setError(error.message);
    } else {
      setError(null); setData(data ?? []); markOnline();
      if (href && Array.isArray(data)) cacheWrite(href, data);
    }
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, ...deps]);
  useEffect(() => { run(); }, [run]);
  useEffect(() => onPullRefresh(() => run(true)), [run]);          // pull a page down: reload without flashing the loading screen
  return { data, loading, error, refresh: () => run() };
}
