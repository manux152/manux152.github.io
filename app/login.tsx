import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen, H, T, Card, Input, Btn, Err } from '../components/ui';
import { supabase, REVOKED_KEY } from '../lib/supabase';
import { useApp } from '../lib/app-context';
import { appUrl } from '../lib/redirect';
import { PasswordChecklist } from '../components/PasswordChecklist';
import { checkPassword, PASSWORD_ERROR } from '../lib/password';

const REVOKED_MSG = 'This account has been deactivated or deleted, so you have been signed out. Contact the club if you think this is a mistake.';

export default function Login() {
  const r = useRouter(); const params = useLocalSearchParams<{ ref?: string }>();
  const { settings } = useApp();
  const [mode, setMode] = useState<'in' | 'up' | 'mfa'>(typeof params.ref === 'string' && params.ref ? 'up' : 'in');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [name, setName] = useState(''); const [code, setCode] = useState('');
  const [refCode, setRefCode] = useState(typeof params.ref === 'string' ? params.ref.toUpperCase().slice(0, 12) : '');
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [factorId, setFactorId] = useState(''); const [otp, setOtp] = useState('');
  const [err, setErr] = useState<string | null>(null); const [msg, setMsg] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const domains: string[] = Array.isArray(settings.allowed_email_domains) ? settings.allowed_email_domains : [];

  useEffect(() => { AsyncStorage.getItem(REVOKED_KEY).then((v) => { if (v) { AsyncStorage.removeItem(REVOKED_KEY); setErr(REVOKED_MSG); } }).catch(() => {}); }, []);
  const signIn = async () => {
    setBusy(true); setErr(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) { setBusy(false); setErr(/banned|deactivated/i.test(error.message) ? REVOKED_MSG : error.message); if (/not confirmed/i.test(error.message)) setNeedsConfirm(true); return; }
    // Two-step sign-in: if this person turned on 2FA, ask for the 6-digit code before letting them in
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
      const { data: f } = await supabase.auth.mfa.listFactors();
      const id = f?.totp?.find((x) => x.status === 'verified')?.id;
      if (id) { setBusy(false); setFactorId(id); setOtp(''); setMode('mfa'); return; }
    }
    setBusy(false); r.replace('/');
  };
  const verifyOtp = async () => {
    setErr(null); setBusy(true);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: otp.replace(/\s/g, '') });
    setBusy(false);
    if (error) return setErr(/invalid|expired/i.test(error.message) ? 'That code is not right. Use the newest code from your authenticator app.' : error.message);
    r.replace('/');
  };
  const cancelMfa = async () => { await supabase.auth.signOut({ scope: 'local' }); setMode('in'); setPassword(''); setOtp(''); setErr(null); };
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
    if (!name.trim()) return setErr('Please enter your full name.');
    if (!email.trim()) return setErr('Please enter your email address.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setErr('Enter a valid email address.');
    if (!password) return setErr('Please choose a password.');
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

  if (mode === 'mfa') return (
    <Screen>
      <H>Enter your 6-digit code</H>
      <Card><T muted>Open your authenticator app and type the code shown for Super Strikers. Lost your phone? Ask a club admin to reset your 2FA.</T></Card>
      <Input label="6-digit code" keyboardType="number-pad" maxLength={7} autoComplete="one-time-code" autoFocus value={otp} onChangeText={setOtp} onSubmitEditing={verifyOtp} />
      <Err msg={err} />
      <Btn title="Verify and sign in" onPress={verifyOtp} disabled={busy || otp.replace(/\s/g, '').length < 6} />
      <Btn title="Cancel" kind="ghost" onPress={cancelMfa} />
    </Screen>
  );

  return (
    <Screen>
      <H>{mode === 'in' ? 'Sign in' : 'Create your player account'}</H>
      {mode === 'up' && (
        <Card><T muted>Player accounts need the team email address{domains.length ? ` (${domains.map((d) => '@' + d).join(', ')})` : ''} and a one-time team code from the club.
          Not on the team yet? Check the Tryouts section.</T></Card>
      )}
      {mode === 'up' && <Input label="Full name" required autoComplete="name" textContentType="name" value={name} onChangeText={setName} />}
      <Input label="Email" required={mode === 'up'} autoCapitalize="none" autoComplete="email" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <Input label="Password" required={mode === 'up'} secureTextEntry value={password} onChangeText={setPassword} />
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
