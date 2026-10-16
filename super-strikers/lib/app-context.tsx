import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { clearOfflineCache } from './offline';
import { onPullRefresh } from './refresh';

type NavItem = { id: string; label: string; route: string; sort_order: number; is_visible: boolean; required_permission: string | null };
type Ctx = {
  ready: boolean;
  session: Session | null;
  settings: Record<string, any>;
  nav: NavItem[];
  pages: { id: string; slug: string; title: string }[];
  sponsors: { id: string; name: string; logo_url: string | null; link_url: string | null; tier: string; show_footer: boolean; show_home: boolean; show_match: boolean }[];
  permissions: string[];
  profile: { full_name: string | null; avatar_url: string | null } | null;
  can: (p: string) => boolean;
  reload: () => Promise<void>;
  signOut: () => Promise<void>;
};
const AppCtx = createContext<Ctx>(null as any);
export const useApp = () => useContext(AppCtx);

const TIER: Record<string, number> = { headline: 0, gold: 1, silver: 2, bronze: 3, partner: 4 };
export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [nav, setNav] = useState<NavItem[]>([]);
  const [pages, setPages] = useState<Ctx['pages']>([]);
  const [sponsors, setSponsors] = useState<Ctx['sponsors']>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [profile, setProfile] = useState<Ctx['profile']>(null);

  const loadPerms = useCallback(async (s: Session | null) => {
    if (!s) { setProfile(null); return setPermissions([]); }
    const { data: pr } = await supabase.from('profiles').select('is_active,full_name,avatar_url').eq('id', s.user.id).maybeSingle();
    setProfile(pr ? { full_name: pr.full_name ?? null, avatar_url: pr.avatar_url ?? null } : null);
    if (pr && pr.is_active === false) return setPermissions([]);
    const { data: ur } = await supabase.from('user_roles').select('role_id').eq('user_id', s.user.id);
    const ids = (ur ?? []).map((r: any) => r.role_id);
    if (!ids.length) return setPermissions([]);
    const { data: rp } = await supabase.from('role_permissions').select('permission_key').in('role_id', ids);
    setPermissions(Array.from(new Set((rp ?? []).map((r: any) => r.permission_key))));
  }, []);

  const reload = useCallback(async () => {
    const today = new Date().toISOString().slice(0, 10);
    const [{ data: st }, { data: nv }, { data: pg }, { data: sp }] = await Promise.all([
      supabase.from('site_settings').select('key,value'),
      supabase.from('nav_items').select('*').order('sort_order'),
      supabase.from('pages').select('id,slug,title').eq('is_published', true).order('sort_order'),
      supabase.from('sponsors').select('id,name,logo_url,link_url,tier,starts_on,ends_on,show_footer,show_home,show_match').eq('is_active', true).order('sort_order'),
    ]);
    setSettings(Object.fromEntries((st ?? []).map((r: any) => [r.key, r.value])));
    setNav((nv ?? []) as NavItem[]);
    setPages((pg ?? []) as Ctx['pages']); setSponsors(((sp ?? []) as any[]).filter((s) => (!s.starts_on || s.starts_on <= today) && (!s.ends_on || s.ends_on >= today)).sort((a, b) => (TIER[a.tier] ?? 4) - (TIER[b.tier] ?? 4)) as Ctx['sponsors']);
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
    await loadPerms(data.session);
  }, [loadPerms]);

  useEffect(() => onPullRefresh(reload), [reload]);    // pulling a page down also refreshes settings, sponsors and menus
  useEffect(() => {
    reload().finally(() => setReady(true));
    const { data: sub } = supabase.auth.onAuthStateChange((e, s) => { if (e === 'SIGNED_OUT') clearOfflineCache(); setSession(s); loadPerms(s); });
    return () => sub.subscription.unsubscribe();
  }, [reload, loadPerms]);

  const value = useMemo<Ctx>(() => ({
    ready, session, settings, nav, pages, sponsors, permissions, profile,
    can: (p) => permissions.includes(p),
    reload,
    signOut: async () => { await supabase.auth.signOut(); },
  }), [ready, session, settings, nav, pages, sponsors, permissions, profile, reload]);

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
