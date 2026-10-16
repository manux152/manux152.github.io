import { useEffect, useState } from 'react';
import { translate } from '../lib/i18n';
import { Alert, Platform, Pressable, Switch, View } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { Screen, H, T, Card, Btn, Err, Avatar } from '../components/ui';
import { supabase } from '../lib/supabase';
import { useApp } from '../lib/app-context';
import { useTable } from '../lib/useQuery';
import { enablePush, disablePush } from '../lib/push';

const confirmAsk = (title: string, msg: string) => new Promise<boolean>((res) => {
  if (Platform.OS === 'web') return res(window.confirm(`${title}\n\n${msg}`));
  Alert.alert(translate(title), translate(msg), [{ text: translate('Cancel'), style: 'cancel', onPress: () => res(false) }, { text: translate('Delete'), style: 'destructive', onPress: () => res(true) }]);
});

export default function Account() {
  const { session, can, signOut, profile, settings } = useApp();
  const r = useRouter();
  const pages = useTable('pages', (q) => q.eq('is_published', true).order('sort_order'));
  const [on, setOn] = useState(false); const [mail, setMail] = useState(true); const [msg, setMsg] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!session) return;
    supabase.from('profiles').select('push_enabled,email_opt_out').eq('id', session.user.id).maybeSingle().then(({ data }) => { setOn(!!data?.push_enabled); setMail(!data?.email_opt_out); });
  }, [session?.user.id]); // eslint-disable-line
  if (!session) return <Screen><T>Please sign in.</T><Btn title="Sign in" onPress={() => r.replace('/login')} /></Screen>;
  const toggle = async (v: boolean) => {
    if (v) { const res = await enablePush(session.user.id); setOn(res.ok); setMsg(res.message); }
    else { await disablePush(session.user.id); setOn(false); setMsg('Notifications are off.'); }
  };
  const del = async () => {
    setErr(null);
    if (!(await confirmAsk('Delete your account?', 'This permanently removes your account, registration and player profile. It cannot be undone.'))) return;
    const { data, error } = await supabase.functions.invoke('delete-account');
    if (error || data?.error) return setErr(data?.error ?? error?.message ?? 'Could not delete the account');
    await signOut(); r.replace('/');
  };
  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1 }}><H>Account</H>{profile?.full_name ? <T style={{ fontWeight: '700' }}>{profile.full_name}</T> : null}<T muted>{session.user.email}</T></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Change your profile picture" onPress={() => r.push('/profile')}><Avatar url={profile?.avatar_url} name={profile?.full_name ?? session.user.email} size={72} /><T muted style={{ fontSize: 11, textAlign: 'center' }}>{profile?.avatar_url ? 'Change' : 'Add photo'}</T></Pressable>
      </View>
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <T style={{ fontWeight: '700' }}>Push notifications</T><Switch value={on} onValueChange={toggle} />
        </View>
        <T muted>Match results, reminders, news and team announcements.</T>{msg ? <T>{msg}</T> : null}
      </Card>
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <T style={{ fontWeight: '700' }}>Team emails</T>
          <Switch value={mail} onValueChange={async (v) => { setMail(v); await supabase.from('profiles').update({ email_opt_out: !v }).eq('id', session.user.id); }} />
        </View>
        <T muted>Announcements and updates from the team. Account emails (like password resets) are always sent.</T>
      </Card>
      <Btn title="Edit my profile & photo" onPress={() => r.push('/profile')} />
      <Btn title="My shop orders" kind="ghost" onPress={() => r.push('/orders')} />
      {settings.shop_enabled !== false && settings.spin_enabled !== false ? <Btn title="🎡 Spin the wheel & my rewards" kind="ghost" onPress={() => r.push('/spin')} /> : null}
      <Btn title="Player registration" kind="ghost" onPress={() => r.push('/register')} />
      {can('admin.access') && <Btn title="Open admin panel" onPress={() => r.push('/admin')} />}
      {(pages.data as any[]).map((p) => <Btn key={p.id} title={p.title} kind="ghost" onPress={() => r.push(`/page/${p.slug}` as any)} />)}
      <Btn title="Sign out" kind="ghost" onPress={async () => { await signOut(); r.replace('/'); }} />
      <Err msg={err} />
      <Btn title="Delete my account" kind="danger" onPress={del} />
    </Screen>
  );
}
