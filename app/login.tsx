import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen, H, T, Card, Input, Btn, Err } from '../components/ui';
import { supabase } from '../lib/supabase';
import { useApp } from '../lib/app-context';
import { appUrl } from '../lib/redirect';
import { PasswordChecklist } from '../components/PasswordChecklist';
import { checkPassword, PASSWORD_ERROR } from '../lib/password';

export default function Login() {
  const r = useRouter(); const params = useLocalSearchParams<{ ref?: string }>();
  const { settings } = useApp();
  const [mode, setMode] = useState<'in' | 'up'>(typeof params.ref === 'string' && params.ref ? 'up' : 'in');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [name, setName] = useState(''); const [code, setCode] = useState('');
  const [refCode, setRefCode] = useState(typeof params.ref === 'string' ? params.ref.toUpperCase().slice(0, 12) : '');
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [err, setErr] = useState<string | null>(null); const [msg, setMsg] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const domains: string[] = Array.isArray(settings.allowed_email_domains) ? settings.allowed_email_domains : [];

  const signIn = async () => {
    setBusy(true); setErr(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) { setErr(error.message); if (/not confirmed/i.test(error.message)) setNeedsConfirm(true); } else r.replace('/');
  };
  const forgot = async () => {
    setErr(null); setMsg(null);
    if (!email.trim()) return setErr('Enter your email above first.');
    setBusy(true);
    // Sent by our own function so the email always uses the club's template and design.
    const { error } = await supabase.functions.invoke('password-reset', { body: { email: email.trim() } });
    setBusy(false);
    if (error) return setErr(error.message);
    setMsg('If an account exists for that email, we\'ve sent a reset link. Check your spam folder too.');
  };
  const resendConfirm = async () => {
    setErr(null); setMsg(null);
    if (!email.trim()) return setErr('Enter your email above first.');
    setBusy(true);
    const { error } = await supabase.functions.invoke('signup', { body: { action: 'resend', email: email.trim() } });
    setBusy(false);
    if (error) return setErr(error.message);
    setMsg('If that account still needs confirming, we\'ve sent a new link. Use the newest email.');
  };
  const signUp = async () => {
    setErr(null); setMsg(null);
    if (!email.trim() || !password) return setErr('Enter your email and a password.');
    if (!checkPassword(password).valid) return setErr(PASSWORD_ERROR);
    setBusy(true);
    const { data: check } = await supabase.rpc('check_signup', { p_email: email.trim(), p_code: code });
    if (check === 'code') { setBusy(false); return setErr('That team code is not valid, has already been used, has expired, or is for a different email.'); }
    if (check === 'domain') { setBusy(false); return setErr(`Please use your team email address${domains.length ? ` (${domains.map((d) => '@' + d).join(', ')})` : ''}.`); }
    // Created by our own function so the confirmation email always uses the club's template.
    const { error } = await supabase.functions.invoke('signup', { body: { email: email.trim(), password, full_name: name.trim(), team_code: code.trim(), referral_code: refCode.trim() } });
    setBusy(false);
    if (error) return setErr(error.message);
    setMsg('Account created. We\'ve emailed you a confirmation link. Open it, then sign in. Check your spam folder too.'); setMode('in'); setNeedsConfirm(true);
  };

  return (
    <Screen>
      <H>{mode === 'in' ? 'Sign in' : 'Create your player account'}</H>
      {mode === 'up' && (
        <Card><T muted>Player accounts need the team email address{domains.length ? ` (${domains.map((d) => '@' + d).join(', ')})` : ''} and a one-time team code from the club.
          Not on the team yet? Check the Tryouts section.</T></Card>
      )}
      {mode === 'up' && <Input label="Full name" value={name} onChangeText={setName} />}
      <Input label="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <Input label="Password" secureTextEntry value={password} onChangeText={setPassword} />
      {mode === 'up' && <PasswordChecklist password={password} />}
      {mode === 'up' && <Input label="Team code" autoCapitalize="characters" autoCorrect={false} value={code} onChangeText={setCode} placeholder="e.g. SS-ABCD-EFGH" />}
      {mode === 'up' && settings.referral_enabled !== false && <Input label="Friend's invite code (optional)" autoCapitalize="characters" autoCorrect={false} value={refCode} onChangeText={setRefCode} />}
      <Err msg={err} />{msg ? <T>{msg}</T> : null}
      {mode === 'in'
        ? <><Btn title="Sign in" onPress={signIn} disabled={busy} /><Btn title="I have a team code — create account" kind="ghost" onPress={() => { setMode('up'); setErr(null); }} />{needsConfirm ? <Btn title="Resend confirmation email" kind="ghost" onPress={resendConfirm} disabled={busy} /> : null}<Btn title="Forgot password?" kind="ghost" onPress={forgot} /><Btn title="See tryouts" kind="ghost" onPress={() => r.push('/tryouts')} /></>
        : <><Btn title="Create account" onPress={signUp} disabled={busy} /><Btn title="Back to sign in" kind="ghost" onPress={() => { setMode('in'); setErr(null); }} /></>}
    </Screen>
  );
}
