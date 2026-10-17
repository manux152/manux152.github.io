// Server-side copy of the password rules in lib/password.ts (keep the two in step).
export const PASSWORD_ERROR = 'Your password must have at least 8 characters, with an uppercase letter, a lowercase letter, a number and a symbol.';
export const passwordOk = (pw: string) => pw.length >= 8 && /[a-z]/.test(pw) && /[A-Z]/.test(pw) && /[0-9]/.test(pw) && /[^A-Za-z0-9]/.test(pw);
