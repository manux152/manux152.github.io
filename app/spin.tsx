import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Platform, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, H, T, Card, Btn, Err, Loading, fmtDate } from '../components/ui';
import { SpinWheel } from '../components/SpinWheel';
import { countdown } from '../components/PromoStrip';
import { supabase } from '../lib/supabase';
import { useApp } from '../lib/app-context';
import { useTable } from '../lib/useQuery';
import { useTheme } from '../lib/theme';
import { useLayout } from '../lib/layout';
import { money } from '../lib/money';

type Config = { enabled: boolean; signed_in: boolean; cooldown_hours: number; next_spin_at: string | null; segments: { id: string; label: string; color: string; prize_kind: string; value: number }[] };
type Result = { index: number; label: string; prize_kind: string; value: number; code: string | null; expires_at: string | null; min_subtotal: number; next_spin_at: string };

const prizeText = (kind: string, value: number, cur: string) => kind === 'percent' ? `${value}% off your order` : kind === 'fixed' ? `${money(value, cur)} off your order` : kind === 'free_delivery' ? 'free delivery' : '';

export default function Spin() {
  const { session, settings } = useApp(); const router = useRouter(); const { prefs } = useTheme(); const { width } = useLayout();
  const cur = settings.currency ?? 'USD';
  const [cfg, setCfg] = useState<Config | null>(null); const [busy, setBusy] = useState(false); const [spinning, setSpinning] = useState(false);
  const [res, setRes] = useState<Result | null>(null); const [err, setErr] = useState<string | null>(null); const [now, setNow] = useState(Date.now());
  const rot = useRef(new Animated.Value(0)).current; const at = useRef(0);
  const mine = useTable('promotions', (q) => (session ? q.eq('user_id', session.user.id).eq('source', 'spin').order('created_at', { ascending: false }).limit(20) : q.limit(0)), [session?.user.id, res?.code]);
  const load = () => supabase.rpc('spin_config').then(({ data, error }) => { if (error) setErr(error.message); else setCfg(data as Config); });
  useEffect(() => { load(); }, [session?.user.id]); // eslint-disable-line
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const size = Math.min(340, Math.max(240, width - 72));
  const deg = useMemo(() => rot.interpolate({ inputRange: [0, 360], outputRange: ['0deg', '360deg'] }), [rot]);
  if (!cfg) return err ? <Screen><Err msg={err} /></Screen> : <Loading />;

  const waitMs = cfg.next_spin_at ? new Date(cfg.next_spin_at).getTime() - now : 0;
  const canSpin = cfg.enabled && cfg.signed_in && waitMs <= 0 && !busy && !spinning && cfg.segments.length >= 3;
  const spin = async () => {
    setErr(null); setRes(null); setBusy(true);
    const { data, error } = await supabase.rpc('spin_wheel');
    setBusy(false);
    if (error) { setErr(error.message); load(); return; }
    const r = data as Result; const n = cfg.segments.length; const step = 360 / n;
    const base = ((-(r.index + 0.5) * step + (Math.random() - 0.5) * step * 0.6) % 360 + 360) % 360;
    const target = Math.ceil(at.current / 360) * 360 + 360 * 5 + base; at.current = target;
    const done = () => { setSpinning(false); setRes(r); setCfg({ ...cfg, next_spin_at: r.next_spin_at }); };
    setSpinning(true);
    if (prefs.reduceMotion) { rot.setValue(target); done(); return; }
    Animated.timing(rot, { toValue: target, duration: 5200, easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== 'web' }).start(done);
  };
  const prizes = (mine.data as any[]).filter((p) => p.is_active && p.uses < (p.max_uses ?? 1) && (!p.ends_at || new Date(p.ends_at).getTime() > now));
  return (
    <Screen>
      <H>🎡 Spin & win</H>
      <T muted>Spin the wheel for a chance to win a discount for the shop. Prizes are rare, so every win is a treat. {cfg.cooldown_hours >= 24 ? `One spin every ${Math.round(cfg.cooldown_hours / 24)} day${Math.round(cfg.cooldown_hours / 24) === 1 ? '' : 's'}.` : `One spin every ${cfg.cooldown_hours} hours.`}</T>
      {!cfg.enabled ? <Card><T>The wheel is taking a break. Please check back soon.</T></Card> : (<>
        <View style={{ alignItems: 'center', paddingVertical: 8 }}>
          <SpinWheel segments={cfg.segments} size={size} rotation={deg} />
        </View>
        {!cfg.signed_in ? <Btn title="Sign in to spin" onPress={() => router.push('/login')} /> : (
          <Btn title={spinning || busy ? 'Spinning…' : waitMs > 0 ? `Next spin in ${countdown(waitMs)}` : 'SPIN!'} onPress={spin} disabled={!canSpin} />
        )}
        <Err msg={err} />
        {res && !spinning ? (
          <Card style={{ borderColor: res.prize_kind === 'none' ? undefined : '#2E9E5B' }}>
            <View accessibilityLiveRegion="polite">
              {res.prize_kind === 'none' ? (<><T style={{ fontWeight: '800', fontSize: 18 }}>{res.label}</T><T muted>No prize this time — you can spin again {cfg.cooldown_hours >= 24 ? 'in a few days' : 'later'}.</T></>) : (<>
                <T style={{ fontWeight: '800', fontSize: 20 }}>🎉 You won {prizeText(res.prize_kind, Number(res.value), cur)}!</T>
                <T>Your code: <T style={{ fontWeight: '900' }} selectable>{res.code}</T></T>
                <T muted>{res.min_subtotal > 0 ? `Spend at least ${money(res.min_subtotal, cur)}. ` : ''}Valid until {res.expires_at ? fmtDate(res.expires_at) : 'further notice'}. It's saved under “Your prizes” below and in your cart.</T>
              </>)}
            </View>
            {res.prize_kind !== 'none' ? <Btn title="Shop now" onPress={() => router.push('/shop')} /> : null}
          </Card>
        ) : null}
        <H style={{ fontSize: 18 }}>Your prizes</H>
        {prizes.length === 0 ? <T muted>No active prizes yet.</T> : prizes.map((p) => (
          <Card key={p.id}>
            <T style={{ fontWeight: '700' }}>{String(p.title).replace('Spin & win: ', '')}</T>
            <T selectable style={{ fontWeight: '900' }}>{p.code}</T>
            <T muted style={{ fontSize: 12 }}>{Number(p.min_subtotal) > 0 ? `Min. spend ${money(Number(p.min_subtotal), cur)} · ` : ''}Expires {p.ends_at ? fmtDate(p.ends_at) : 'never'} · one use</T>
          </Card>))}
        {prizes.length > 0 ? <Btn title="Go to my cart" kind="ghost" onPress={() => router.push('/cart')} /> : null}
      </>)}
    </Screen>
  );
}
