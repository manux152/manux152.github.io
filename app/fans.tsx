import { useState } from 'react';
import { Pressable } from 'react-native';
import { Link } from 'expo-router';
import { Screen, H, T, Card, Input, Btn, Chips, Err } from '../components/ui';
import { supabase } from '../lib/supabase';
import { useApp } from '../lib/app-context';

const INTERESTS = [{ value: 'news', label: 'Club news' }, { value: 'matches', label: 'Match days & results' }, { value: 'shop', label: 'Shop offers' }, { value: 'events', label: 'Events & tryouts' }];

// Fan club: supporters join with just a name and email (no player account). They confirm by email, then get the newsletters they picked.
export default function FanClub() {
  const { settings, session, profile } = useApp();
  const team = typeof settings.team_name === 'string' && settings.team_name ? settings.team_name : 'the club';
  const [name, setName] = useState(profile?.full_name ?? ''); const [email, setEmail] = useState(session?.user.email ?? '');
  const [interests, setInterests] = useState<string[]>(['news', 'matches']);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null); const [done, setDone] = useState(false);

  const join = async () => {
    setErr(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setErr('Enter a valid email address.');
    setBusy(true);
    const { error } = await supabase.functions.invoke('fan-join', { body: { action: 'join', email: email.trim(), full_name: name.trim(), interests } });
    setBusy(false);
    if (error) return setErr(error.message);
    setDone(true);
  };
  const perk = (href: string, title: string, sub: string) => (
    <Link key={href} href={href as any} asChild><Pressable accessibilityRole="link"><Card><T style={{ fontWeight: '700' }}>{title} →</T><T muted style={{ fontSize: 12 }}>{sub}</T></Card></Pressable></Link>
  );

  return (
    <Screen>
      <H>Join the {team} fan club</H>
      <T muted>Free, takes ten seconds, and you don't need an account. Get club news, match-day updates and offers by email, and unsubscribe any time.</T>
      {done ? (
        <Card>
          <T style={{ fontWeight: '800' }}>Check your inbox 📬</T>
          <T>We sent a confirmation email to {email.trim()}. Tap the button inside to finish joining. If you can't see it, check your spam folder.</T>
        </Card>
      ) : (
        <>
          {session ? <Card><T muted>You already have an account, so you get team emails automatically (change this under Account → Team emails). Joining the fan club is for friends and family who don't have one.</T></Card> : null}
          <Input label="Your name (optional)" autoComplete="name" textContentType="name" value={name} onChangeText={setName} />
          <Input label="Email" required autoCapitalize="none" autoComplete="email" keyboardType="email-address" value={email} onChangeText={setEmail} onSubmitEditing={join} />
          <T style={{ fontWeight: '700' }}>What do you want to hear about?</T>
          <Chips multi options={INTERESTS} value={interests} onChange={(v: string[]) => setInterests(v)} />
          <Err msg={err} />
          <Btn title={busy ? 'Joining…' : 'Join the fan club'} onPress={join} disabled={busy} />
          <T muted style={{ fontSize: 12 }}>By joining you agree to get emails from {team}. Every email has an unsubscribe link.</T>
        </>
      )}
      <H style={{ fontSize: 20 }}>More ways to get involved</H>
      {perk('/predictor', 'Predict the score', 'Guess match results and climb the fans’ league')}
      {perk('/news', 'Club news', 'Read the latest stories and join the conversation')}
      {perk('/invite', 'Invite friends', 'Share the club and earn rewards')}
      {settings.shop_enabled !== false ? perk('/shop', 'Shop', 'Kit and fan gear') : null}
    </Screen>
  );
}
