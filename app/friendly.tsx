import { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImageManipulator from 'expo-image-manipulator';
import { Link } from 'expo-router';
import { Screen, H, T, Card, Input, Btn, Chips, Err } from '../components/ui';
import { DateTimeField } from '../components/DateTimeField';
import { Turnstile } from '../components/Turnstile';
import { PageHead } from '../components/PageHead';
import { supabase } from '../lib/supabase';
import { useApp } from '../lib/app-context';
import { pickImage } from '../lib/upload';

const VENUES = [{ value: 'either', label: 'Either' }, { value: 'our_ground', label: 'At your ground' }, { value: 'their_ground', label: 'At our ground' }];
type Logo = { uri: string; base64: string };

// Shrinks the logo (max 600 px wide) and returns it as base64. PNG logos stay PNG so transparent backgrounds survive.
async function prepareLogo(a: { uri: string; width?: number; mimeType?: string | null }): Promise<Logo> {
  const png = (a.mimeType ?? '').includes('png');
  const attempts: { w: number; png: boolean; q: number }[] = [{ w: 600, png, q: 0.85 }, { w: 500, png: false, q: 0.7 }, { w: 400, png: false, q: 0.6 }];
  for (const t of attempts) {
    const actions = !a.width || a.width > t.w ? [{ resize: { width: t.w } }] : [];
    const out = await ImageManipulator.manipulateAsync(a.uri, actions as any, { compress: t.q, format: t.png ? ImageManipulator.SaveFormat.PNG : ImageManipulator.SaveFormat.JPEG, base64: true });
    if (out.base64 && out.base64.length < 1_900_000) return { uri: out.uri, base64: out.base64 };
  }
  throw new Error('That picture is too big. Please choose a smaller one.');
}

// Public page: any team can ask us for a friendly match. A team logo is required. Staff answer in Admin → Friendly requests.
export default function FriendlyRequest() {
  const { settings, session, profile } = useApp();
  const team = typeof settings.team_name === 'string' && settings.team_name ? settings.team_name : 'the club';
  const [teamName, setTeamName] = useState(''); const [age, setAge] = useState('');
  const [name, setName] = useState(profile?.full_name ?? ''); const [email, setEmail] = useState(session?.user.email ?? ''); const [phone, setPhone] = useState('');
  const [d1, setD1] = useState<string | null>(null); const [d2, setD2] = useState<string | null>(null); const [timeNote, setTimeNote] = useState('');
  const [venue, setVenue] = useState('either'); const [msg, setMsg] = useState('');
  const [logo, setLogo] = useState<Logo | null>(null); const [logoBusy, setLogoBusy] = useState(false);
  const [website, setWebsite] = useState('');   // hidden trap for bots
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null); const [done, setDone] = useState(false);
  const [captcha, setCaptcha] = useState(''); const [capKey, setCapKey] = useState(0);
  const captchaShown = Platform.OS === 'web' && typeof settings.turnstile_site_key === 'string' && settings.turnstile_site_key.trim() !== '';
  const fnError = async (e: any): Promise<string> => { try { const j = await e?.context?.json?.(); if (j?.error) return String(j.error); } catch { /* use the generic text */ } return e?.message ?? 'Something went wrong. Please try again.'; };

  const chooseLogo = async () => {
    setErr(null);
    let a: any;
    try { a = await pickImage(false); } catch (e: any) { return setErr(e?.message ?? 'Could not open your photos.'); }
    if (!a) return;
    setLogoBusy(true);
    try { setLogo(await prepareLogo(a)); }
    catch (e: any) { setLogo(null); setErr(e?.message && /too big/i.test(e.message) ? e.message : 'We could not read that picture. Please use a PNG or JPG file.'); }
    setLogoBusy(false);
  };

  const send = async () => {
    setErr(null);
    if (teamName.trim().length < 2) return setErr('Enter your team name.');
    if (!logo) return setErr('Please upload your team logo. It is required.');
    if (name.trim().length < 2) return setErr('Enter a contact name.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setErr('Enter a valid email address.');
    if (!d1) return setErr('Choose the date you would like to play.');
    if (captchaShown && !captcha) return setErr('Please complete the “I am not a robot” check.');
    setBusy(true);
    const { error } = await supabase.functions.invoke('friendly-request', { body: {
      team_name: teamName.trim(), age_group: age.trim(), contact_name: name.trim(), contact_email: email.trim(), contact_phone: phone.trim(),
      date_option_1: d1, date_option_2: d2, time_note: timeNote.trim(), venue_pref: venue, message: msg.trim(),
      logo_base64: logo.base64, website, turnstile_token: captcha } });
    setBusy(false);
    setCaptcha(''); setCapKey((k) => k + 1);   // a CAPTCHA token works once: get a fresh check
    if (error) return setErr(await fnError(error));
    setDone(true);
  };

  return (
    <Screen>
      <PageHead title="Request a friendly match" description={`Ask ${team} for a friendly match.`} />
      <H>Request a friendly match</H>
      <T muted>Would your team like to play {team}? Tell us a little about your team and when you are free, and add your team logo. We will reply by email.</T>
      {done ? (
        <Card>
          <T style={{ fontWeight: '800' }}>Request sent ⚽</T>
          <T>Thanks! We emailed a confirmation to {email.trim()}. We will check our fixtures and get back to you by email. If you can't see it, check your spam folder.</T>
          <Link href="/matches" asChild><Pressable accessibilityRole="link"><T style={{ fontWeight: '700' }}>See our fixtures →</T></Pressable></Link>
        </Card>
      ) : (
        <>
          <Card>
            <T style={{ fontWeight: '800' }}>Your team</T>
            <Input label="Team name" required value={teamName} onChangeText={setTeamName} maxLength={80} />
            <Input label="Age group or level (optional, e.g. Under 12)" value={age} onChangeText={setAge} maxLength={40} />
            <T style={{ fontWeight: '700' }}>Team logo (required)</T>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <View accessible accessibilityLabel={logo ? 'Your team logo' : 'No logo chosen yet'} style={{ width: 96, height: 96, borderRadius: 12, backgroundColor: '#E6E8EC', overflow: 'hidden', alignItems: 'center', justifyContent: 'center', opacity: logoBusy ? 0.6 : 1 }}>
                {logo ? <Image source={{ uri: logo.uri }} style={{ width: 96, height: 96 }} contentFit="contain" /> : <T muted>No logo</T>}
              </View>
              <View style={{ flex: 1, gap: 6 }}>
                <Btn title={logoBusy ? 'Preparing…' : logo ? 'Change logo' : 'Choose logo picture'} kind="ghost" onPress={chooseLogo} disabled={logoBusy} />
                <T muted style={{ fontSize: 12 }}>PNG or JPG. We shrink it for you.</T>
              </View>
            </View>
          </Card>
          <Card>
            <T style={{ fontWeight: '800' }}>Who should we contact?</T>
            <Input label="Contact name" required autoComplete="name" textContentType="name" value={name} onChangeText={setName} maxLength={80} />
            <Input label="Email" required autoCapitalize="none" autoComplete="email" keyboardType="email-address" value={email} onChangeText={setEmail} />
            <Input label="Phone (optional)" autoComplete="tel" keyboardType="phone-pad" value={phone} onChangeText={setPhone} maxLength={40} />
          </Card>
          <Card>
            <T style={{ fontWeight: '800' }}>When and where</T>
            <DateTimeField label="Preferred date" mode="date" value={d1} onChange={setD1} />
            <DateTimeField label="Backup date (optional)" mode="date" value={d2} onChange={setD2} optional />
            <Input label="Preferred kick-off time (optional, e.g. morning)" value={timeNote} onChangeText={setTimeNote} maxLength={80} />
            <T style={{ fontWeight: '700' }}>Where would you like to play?</T>
            <Chips options={VENUES} value={venue} onChange={(v: string | null) => setVenue(v ?? 'either')} />
            <Input label="Anything else we should know? (optional)" multiline value={msg} onChangeText={setMsg} maxLength={1000} />
          </Card>
          {/* Bots fill every box; people can't see this one. */}
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ position: 'absolute', left: -9999, width: 1, height: 1, overflow: 'hidden' }}>
            <Input label="Website" value={website} onChangeText={setWebsite} autoComplete="off" />
          </View>
          <Turnstile key={capKey} onToken={setCaptcha} action="friendly_request" />
          <Err msg={err} />
          <Btn title={busy ? 'Sending…' : 'Send request'} onPress={send} disabled={busy || logoBusy} />
          <T muted style={{ fontSize: 12 }}>We only use these details to answer your request.</T>
        </>
      )}
    </Screen>
  );
}
