// One place for the password rules. The sign-up screen, reset screen and admin "Create account" screen use it to show the live checklist,
// and supabase/functions/_shared/password.ts repeats the same rules on the server (keep the two in step).
export const PASSWORD_MIN = 8;

export type PasswordRule = { key: string; label: string; ok: boolean };

export function checkPassword(pw: string): { rules: PasswordRule[]; passed: number; total: number; valid: boolean; strength: 'empty' | 'weak' | 'fair' | 'good' | 'strong' } {
  const rules: PasswordRule[] = [
    { key: 'len', label: `At least ${PASSWORD_MIN} characters`, ok: pw.length >= PASSWORD_MIN },
    { key: 'lower', label: 'A lowercase letter (a–z)', ok: /[a-z]/.test(pw) },
    { key: 'upper', label: 'An uppercase letter (A–Z)', ok: /[A-Z]/.test(pw) },
    { key: 'num', label: 'A number (0–9)', ok: /[0-9]/.test(pw) },
    { key: 'sym', label: 'A symbol (for example ! @ # $ ?)', ok: /[^A-Za-z0-9]/.test(pw) },
  ];
  const passed = rules.filter((r) => r.ok).length;
  const valid = passed === rules.length;
  const strength = !pw ? 'empty' : !valid ? (passed <= 2 ? 'weak' : 'fair') : pw.length >= 12 ? 'strong' : 'good';
  return { rules, passed, total: rules.length, valid, strength };
}

export const PASSWORD_ERROR = 'Your password must have at least 8 characters, with an uppercase letter, a lowercase letter, a number and a symbol.';
