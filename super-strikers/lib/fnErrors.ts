import { getLang } from './langState';

// supabase-js builds a NEW functions client on every `supabase.functions` access, so the wrapper has to be installed on the getter.
export function explainFunctionErrors(client: any) {
  const getter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(client), 'functions')?.get;
  if (!getter) return;
  Object.defineProperty(client, 'functions', {
    configurable: true,
    get() {
      const fc: any = getter.call(client); const raw = fc.invoke.bind(fc);
      fc.invoke = async (name: string, options?: any) => {
        // Every function gets the language the person chose, so AI answers come back in it.
        const b = options?.body; const plain = b && typeof b === 'object' && Object.getPrototypeOf(b) === Object.prototype;
        const opts = !options || b == null ? { ...(options ?? {}), body: { lang: getLang() } } : plain ? { ...options, body: { lang: getLang(), ...b } } : options;
        const res: any = await raw(name, opts); const err = res?.error;
        if (err) {
          const ctx = err.context as Response | undefined; const status = ctx?.status; let msg: string | undefined;
          try { const j = await ctx?.clone().json(); msg = typeof j?.error === 'string' ? j.error : typeof j?.message === 'string' ? j.message : undefined; } catch { /* body was not JSON */ }
          if (status === 404 && (!msg || /not found/i.test(msg))) msg = `The “${name}” function is not deployed in your Supabase project yet (Supabase → Edge Functions → Deploy a new function, name it “${name}”).`;
          else if (!msg && (status === 401 || status === 403)) msg = 'You are not allowed to do this, or your session has expired. Sign in again and retry.';
          else if (!msg && status && status >= 500) msg = `The “${name}” function crashed (error ${status}). Open Supabase → Edge Functions → ${name} → Logs to see why.`;
          if (msg) err.message = msg;
        }
        return res;
      };
      return fc;
    },
  });
}
