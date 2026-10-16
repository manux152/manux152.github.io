// Quick-answer mode: the same lookups the assistant function uses, run straight from the app with the visitor's own login.
// Used automatically when the AI function is not deployed or cannot be reached. Keep in sync with
// supabase/functions/team-assistant/index.ts (this block is a copy of its tool code).
/* eslint-disable */
// @ts-nocheck
const clip = (s: unknown, n = 400) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };

type Link = { label: string; route: string };
type Out = { text: string; links?: Link[] };
type Ctx = { sb: any; tz: string; cur: string; userId: string | null; team: string };

const when = (ctx: Ctx, d: string | null | undefined, time = true) => !d ? '' : new Date(d).toLocaleString('en-GB', { timeZone: ctx.tz, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', ...(time ? { hour: '2-digit', minute: '2-digit' } : {}) });

// ───────────────────────── How-to guides about the app ─────────────────────────
const GUIDES: { title: string; words: string; route?: string; text: string }[] = [
  { title: 'Create an account and sign in', words: 'sign in login account register create password reset email', route: '/login', text: 'Open Sign in (top right) to log in or create an account. After creating one, confirm your email if asked. Forgot your password? Use “Forgot password” on the sign-in screen. To join the squad you need a team code from the club, or apply through Tryouts.' },
  { title: 'Profile picture and personal details', words: 'profile picture photo avatar name edit details', route: '/profile', text: 'Tap your picture (top right) → Edit profile & photo, or open Account and tap your picture. Upload a photo and it appears top right of every page and on your player card. Your original photo is kept in full quality.' },
  { title: 'Order from the shop', words: 'shop buy order cart checkout colour color size merchandise kit jersey', route: '/shop', text: 'Open Shop, pick an item, tap a colour in the colour grid (tap “See how it looks” to preview it), choose a size, then Add to cart. In the Cart enter your details and choose a payment method, then Place order. Sold-out colours and sizes are crossed out and cannot be ordered; the cart also blocks items that sell out while you shop.' },
  { title: 'Discount codes, offers and free delivery', words: 'discount code promo offer sale coupon free delivery banner save', route: '/cart', text: 'Running offers show in the banner above the menu. Automatic offers apply to your order by themselves when you qualify. If you have a code, type it under “Have a discount code?” in the Cart and tap Apply. The Cart also shows how much more to spend to unlock the next offer. Sale items show the old price crossed out.' },
  { title: 'Spin wheel', words: 'spin wheel prize win lucky reward', route: '/spin', text: 'Open Spin the wheel (banner, Shop page or your account menu). You must be signed in. You can spin once per cooldown period set by the club. Prizes are rare. A win gives you a personal single-use code that expires; it is saved under “Your prizes” and appears in your Cart ready to apply.' },
  { title: 'My orders', words: 'orders history status track my order', route: '/orders', text: 'Account → My shop orders lists your orders with their status, total and any discount you used.' },
  { title: 'Tryouts', words: 'tryout trial join apply application audition', route: '/tryouts', text: 'Open the Tryouts tab, choose a tryout, and fill in the application form before the apply-by date. The page shows date, place, age group and whether applications are open.' },
  { title: 'Matches, results and the league table', words: 'match fixture result score table standings league stats statistics', route: '/matches', text: 'Matches shows upcoming games and results; tap a match for its events timeline (goals, cards). Table shows the league standings and Statistics shows top scorers and assists.' },
  { title: 'Calendar and events', words: 'calendar event schedule date', route: '/calendar', text: 'The Calendar tab lists club events such as meetings, social days and weekly sessions that repeat.' },
  { title: 'Training', words: 'training practice session attendance coach', route: '/training', text: 'Training sessions are for team members: sign in with your team account and open Training from the Dashboard or menu. The coach shares the focus and plan for each session.' },
  { title: 'Formations and tactics', words: 'formation tactics lineup line-up shape position', route: '/formations', text: 'The Formations page shows each team shape, which player plays where (with photos) and the style of play. It is view-only; coaches set it in Admin → Tactics board.' },
  { title: 'News and pictures', words: 'news article story headline picture photo gallery video album media', route: '/news', text: 'News shows headlines with their full pictures; tap one to read. Media has albums of photos and videos shown uncropped; tap any picture to open it full size with its caption and the people tagged.' },
  { title: 'Search and tags', words: 'search find tagged tag player member', route: '/search', text: 'Use Search (magnifier) to find players, members, news, matches, teams, events, shop items and media. When you search a player or member you also see every news article, photo and video where they are tagged. Members appear only if they allow it, and only to signed-in visitors.' },
  { title: 'Settings and accessibility', words: 'settings dark mode theme text size contrast accessibility navigation appearance background', route: '/settings', text: 'Settings lets you choose light or dark, text size, high contrast, reduced motion and underlined links. You can also change the navigation colours and background (Appearance button in the menu).' },
  { title: 'Dashboard', words: 'dashboard home shortcuts overview', route: '/dashboard', text: 'The Dashboard shows what is next for you (next match, training) and shortcuts. Admins also see work waiting, and can sort, filter and group the shortcuts.' },
  { title: 'Awards', words: 'award player of the month', route: '/awards', text: 'The Awards tab lists published awards such as Player of the Month.' },
  { title: 'Contact the club', words: 'contact phone email address location social whatsapp', text: 'Contact details and social links are in the footer at the bottom of every page.' },
  { title: 'For admins and coaches', words: 'admin coach manager panel news ai inventory tactics board promotions spin header footer favicon', route: '/admin', text: 'Admins open Account menu → Admin panel (only visible with permission). It includes News with AI drafts and picture tagging, Photos & videos, Inventory with bulk stock updates, Promotions & codes, Spin wheel odds, Tactics board, Header & footer, Navigation look and Favicon.' },
];
const STOP = new Set(['how', 'does', 'the', 'can', 'what', 'where', 'when', 'and', 'for', 'with', 'use', 'work', 'works', 'ask', 'tell', 'about', 'you', 'your', 'our', 'are', 'was', 'this', 'that', 'get', 'make', 'need', 'want', 'please', 'there', 'any', 'have', 'has', 'show', 'find', 'let', 'into', 'from']);
const guideSearch = (topic: string): Out => {
  const words = topic.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));
  const scored = GUIDES.map((g) => { const bag = new Set(g.words.split(' ')); const title = new Set(g.title.toLowerCase().split(/[^a-z0-9]+/)); return { g, s: words.reduce((a, w) => a + (bag.has(w) ? 2 : 0) + (title.has(w) ? 3 : 0), 0) }; }).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
  scored.splice(scored.length ? scored.findIndex((x) => x.s < scored[0].s * 0.7 && true) < 0 ? 2 : Math.min(2, scored.findIndex((x) => x.s < scored[0].s * 0.7)) : 0);   // keep the best one or two close matches
  if (!scored.length) return { text: 'No matching guide. Topics covered: ' + GUIDES.map((g) => g.title).join('; ') };
  return { text: scored.map(({ g }) => `${g.title}: ${g.text}`).join('\n\n'), links: scored.filter(({ g }) => g.route).map(({ g }) => ({ label: g.title, route: g.route! })) };
};

// ───────────────────────── Tools (all read-only, run as the caller) ─────────────────────────
async function getMatches(ctx: Ctx, a: any): Promise<Out> {
  const mode = ['upcoming', 'results', 'all'].includes(a.when) ? a.when : 'upcoming'; const lim = Math.min(10, Math.max(1, Number(a.limit) || 5));
  let q = ctx.sb.from('matches').select('id,kickoff_at,venue,is_home,competition,status,goals_for,goals_against,opponent_id,opponents(name)').limit(lim);
  if (a.friendly) q = q.ilike('competition', '%friendly%');
  if (a.opponent) { const { data: o } = await ctx.sb.from('opponents').select('id').ilike('name', `%${clip(a.opponent, 60).replace(/[%,()]/g, ' ')}%`); const ids = (o ?? []).map((x: any) => x.id); if (!ids.length) return { text: `No opponent matching “${clip(a.opponent, 40)}”.` }; q = q.in('opponent_id', ids); }
  if (mode === 'upcoming') q = q.in('status', ['scheduled', 'live', 'postponed']).gte('kickoff_at', new Date(Date.now() - 4 * 3600e3).toISOString()).order('kickoff_at');
  else if (mode === 'results') q = q.eq('status', 'finished').order('kickoff_at', { ascending: false });
  else q = q.order('kickoff_at', { ascending: false });
  const { data, error } = await q; if (error) return { text: 'Could not read matches.' };
  if (!data?.length) return { text: mode === 'upcoming' ? 'No upcoming matches are scheduled.' : 'No matches found.' };
  let ev: Record<string, string[]> = {};
  const fin = data.filter((m: any) => m.status === 'finished').slice(0, 3).map((m: any) => m.id);
  if (fin.length) {
    const { data: e } = await ctx.sb.from('match_events').select('match_id,minute,event_types(label),player:players!match_events_player_id_fkey(full_name)').in('match_id', fin).order('minute');
    (e ?? []).forEach((r: any) => { (ev[r.match_id] ||= []).push(`${r.minute != null ? r.minute + "'" : ''} ${r.event_types?.label ?? 'Event'}${r.player?.full_name ? ' ' + r.player.full_name : ''}`.trim()); });
  }
  return {
    text: data.map((m: any) => `${when(ctx, m.kickoff_at)} — ${ctx.team} ${m.is_home ? 'vs' : 'at'} ${m.opponents?.name ?? '?'}${m.competition ? ` (${m.competition})` : ''}${m.venue ? `, venue: ${m.venue}` : ''}, status: ${m.status}${m.status === 'finished' ? `, score ${m.goals_for}–${m.goals_against}${ev[m.id]?.length ? '; events: ' + ev[m.id].join(', ') : ''}` : ''}`).join('\n'),
    links: data.slice(0, 4).map((m: any) => ({ label: `${m.is_home ? 'vs' : '@'} ${m.opponents?.name ?? 'match'}`, route: `/match/${m.id}` })),
  };
}
async function getTraining(ctx: Ctx, a: any): Promise<Out> {
  const past = a.when === 'past'; const lim = Math.min(10, Math.max(1, Number(a.limit) || 5));
  let q = ctx.sb.from('training_sessions').select('id,title,session_date,focus,plan').limit(lim);
  q = past ? q.lt('session_date', new Date().toISOString()).order('session_date', { ascending: false }) : q.gte('session_date', new Date(Date.now() - 3 * 3600e3).toISOString()).order('session_date');
  const { data } = await q;
  if (!data?.length) return { text: ctx.userId ? 'No training sessions are listed for you.' : 'No training sessions are visible. Training schedules are for signed-in team members.' };
  return { text: data.map((s: any) => `${when(ctx, s.session_date)} — ${s.title}${s.focus ? `, focus: ${clip(s.focus, 120)}` : ''}${s.plan ? `, plan: ${clip(s.plan, 200)}` : ''}`).join('\n'), links: [{ label: 'Training', route: '/training' }] };
}
async function getStandings(ctx: Ctx, a: any): Promise<Out> {
  const { data: c } = await ctx.sb.from('competitions').select('id,name,season').eq('is_visible', true).order('is_primary', { ascending: false }).order('sort_order').limit(1);
  if (!c?.length) return { text: 'No league table has been set up.' };
  const { data: rows } = await ctx.sb.from('standings_rows').select('position,team_name,played,won,drawn,lost,goal_diff,points,is_own_team').eq('competition_id', c[0].id).order('position').limit(40);
  if (!rows?.length) return { text: `The ${c[0].name} table has no rows yet.` };
  const own = rows.find((r: any) => r.is_own_team); const top = rows.slice(0, Math.min(Number(a.top) || 6, 12));
  return { text: `${c[0].name}${c[0].season ? ' ' + c[0].season : ''}\n` + top.map((r: any) => `${r.position}. ${r.team_name} — ${r.points} pts (P${r.played} W${r.won} D${r.drawn} L${r.lost}, GD ${r.goal_diff})`).join('\n') + (own && !top.includes(own) ? `\nOur team: ${own.position}. ${own.team_name} — ${own.points} pts` : ''), links: [{ label: 'League table', route: '/table' }] };
}
async function getEvents(ctx: Ctx, a: any): Promise<Out> {
  const { data } = await ctx.sb.from('events').select('id,title,description,starts_at,ends_at,location,category,repeat,repeat_until').eq('is_published', true).or(`starts_at.gte.${new Date().toISOString()},repeat.eq.weekly`).order('starts_at').limit(Math.min(10, Number(a.limit) || 6));
  if (!data?.length) return { text: 'No upcoming events.' };
  return { text: data.map((e: any) => `${when(ctx, e.starts_at)} — ${e.title}${e.category ? ` (${e.category})` : ''}${e.location ? `, ${e.location}` : ''}${e.repeat === 'weekly' ? `, repeats weekly${e.repeat_until ? ' until ' + e.repeat_until : ''}` : ''}${e.description ? `: ${clip(e.description, 160)}` : ''}`).join('\n'), links: [{ label: 'Calendar', route: '/calendar' }] };
}
async function getNews(ctx: Ctx, a: any): Promise<Out> {
  let q = ctx.sb.from('news_posts').select('title,slug,category,summary,published_at').not('published_at', 'is', null).lte('published_at', new Date().toISOString()).order('published_at', { ascending: false }).limit(Math.min(8, Number(a.limit) || 5));
  if (a.query) { const t = clip(a.query, 60).replace(/[%,()*]/g, ' '); q = q.or(`title.ilike.%${t}%,summary.ilike.%${t}%,body.ilike.%${t}%`); }
  const { data } = await q; if (!data?.length) return { text: 'No matching news.' };
  return { text: data.map((n: any) => `${when(ctx, n.published_at, false)} — ${n.title}${n.category ? ` [${n.category}]` : ''}${n.summary ? `: ${clip(n.summary, 200)}` : ''}`).join('\n'), links: data.slice(0, 4).map((n: any) => ({ label: n.title, route: `/news/${n.slug}` })) };
}
async function getSquad(ctx: Ctx, a: any): Promise<Out> {
  let q = ctx.sb.from('players').select('id,full_name,shirt_number,height_cm,preferred_foot,positions(name)').eq('is_active', true).order('shirt_number').limit(40);
  if (a.name) q = q.ilike('full_name', `%${clip(a.name, 60).replace(/[%,()*]/g, ' ')}%`);
  const { data } = await q; let rows = data ?? [];
  if (a.position) rows = rows.filter((p: any) => String(p.positions?.name ?? '').toLowerCase().includes(String(a.position).toLowerCase()));
  if (!rows.length) return { text: 'No players found.' };
  return { text: rows.map((p: any) => `${p.shirt_number != null ? '#' + p.shirt_number + ' ' : ''}${p.full_name} — ${p.positions?.name ?? 'position not set'}${p.height_cm ? `, ${p.height_cm} cm` : ''}${p.preferred_foot ? `, ${p.preferred_foot} foot` : ''}`).join('\n'), links: rows.slice(0, 4).map((p: any) => ({ label: p.full_name, route: `/player/${p.id}` })) };
}
async function getPlayerStats(ctx: Ctx, a: any): Promise<Out> {
  const { data: p } = await ctx.sb.from('players').select('id,full_name,shirt_number,positions(name)').eq('is_active', true).ilike('full_name', `%${clip(a.name, 60).replace(/[%,()*]/g, ' ')}%`).limit(3);
  if (!p?.length) return { text: 'No player with that name.' };
  const lines: string[] = [];
  for (const x of p) {
    const { data: s } = await ctx.sb.from('player_stats').select('appearances,goals,assists,yellow_cards,red_cards').eq('player_id', x.id).maybeSingle();
    const { data: aw } = await ctx.sb.from('awards').select('period_label,award_types(label)').eq('player_id', x.id).eq('is_published', true).limit(5);
    lines.push(`${x.full_name}${x.shirt_number != null ? ' #' + x.shirt_number : ''} (${x.positions?.name ?? 'player'}): ${s ? `${s.appearances} appearances, ${s.goals} goals, ${s.assists} assists, ${s.yellow_cards} yellow, ${s.red_cards} red` : 'no recorded stats yet'}${aw?.length ? '; awards: ' + aw.map((w: any) => `${w.award_types?.label} (${w.period_label})`).join(', ') : ''}`);
  }
  return { text: lines.join('\n'), links: p.map((x: any) => ({ label: x.full_name, route: `/player/${x.id}` })) };
}
async function getTop(ctx: Ctx, a: any): Promise<Out> {
  const col = a.stat === 'assists' ? 'assists' : 'goals';
  const { data } = await ctx.sb.from('player_stats').select(`full_name,${col},appearances`).order(col, { ascending: false }).limit(Math.min(10, Number(a.limit) || 5));
  const rows = (data ?? []).filter((r: any) => r[col] > 0); if (!rows.length) return { text: `No ${col} recorded yet.` };
  return { text: rows.map((r: any, i: number) => `${i + 1}. ${r.full_name} — ${r[col]} ${col} in ${r.appearances} appearances`).join('\n'), links: [{ label: 'Statistics', route: '/stats' }] };
}
async function getTryouts(ctx: Ctx): Promise<Out> {
  const { data } = await ctx.sb.from('tryouts').select('id,title,description,starts_at,location,age_group,capacity,applications_open,apply_by').eq('is_published', true).gte('starts_at', new Date().toISOString()).order('starts_at').limit(6);
  if (!data?.length) return { text: 'No upcoming tryouts are published.' };
  return { text: data.map((t: any) => `${when(ctx, t.starts_at)} — ${t.title}${t.location ? `, ${t.location}` : ''}${t.age_group ? `, ages ${t.age_group}` : ''}${t.capacity ? `, ${t.capacity} places` : ''}; applications ${t.applications_open ? 'OPEN' + (t.apply_by ? ' until ' + when(ctx, t.apply_by, false) : '') : 'closed'}`).join('\n'), links: data.slice(0, 3).map((t: any) => ({ label: t.title, route: `/tryout/${t.id}` })) };
}
async function getAnnouncements(ctx: Ctx): Promise<Out> {
  const { data } = await ctx.sb.from('announcements').select('title,body,created_at').eq('is_active', true).order('created_at', { ascending: false }).limit(5);
  return { text: data?.length ? data.map((x: any) => `${when(ctx, x.created_at, false)} — ${x.title}${x.body ? ': ' + clip(x.body, 250) : ''}`).join('\n') : 'No active announcements.' };
}
async function getAwards(ctx: Ctx): Promise<Out> {
  const { data } = await ctx.sb.from('awards').select('period_label,note,award_types(label),players(full_name,id)').eq('is_published', true).order('awarded_on', { ascending: false }).limit(8);
  return { text: data?.length ? data.map((x: any) => `${x.award_types?.label}: ${x.players?.full_name ?? 'TBA'} (${x.period_label})${x.note ? ' — ' + clip(x.note, 120) : ''}`).join('\n') : 'No awards published yet.', links: [{ label: 'Awards', route: '/awards' }] };
}
async function getShop(ctx: Ctx, a: any): Promise<Out> {
  let q = ctx.sb.from('products').select('name,slug,price,compare_at_price,stock,description,product_variants(color_name,size_label,stock,is_active)').eq('is_active', true).limit(10);
  if (a.query) { const t = clip(a.query, 60).replace(/[%,()*]/g, ' '); q = q.or(`name.ilike.%${t}%,description.ilike.%${t}%`); }
  const { data } = await q; if (!data?.length) return { text: 'No matching products.' };
  return { text: data.map((p: any) => {
    const vs = (p.product_variants ?? []).filter((v: any) => v.is_active); const sold = vs.length ? vs.every((v: any) => v.stock != null && v.stock <= 0) : p.stock != null && p.stock <= 0;
    const colors = [...new Set(vs.filter((v: any) => v.stock == null || v.stock > 0).map((v: any) => v.color_name).filter(Boolean))]; const sizes = [...new Set(vs.filter((v: any) => v.stock == null || v.stock > 0).map((v: any) => v.size_label).filter(Boolean))];
    return `${p.name} — ${ctx.cur} ${p.price}${p.compare_at_price > p.price ? ` (was ${p.compare_at_price})` : ''}${sold ? ' — SOLD OUT' : ''}${colors.length ? `; colours in stock: ${colors.join(', ')}` : ''}${sizes.length ? `; sizes in stock: ${sizes.join(', ')}` : ''}`;
  }).join('\n'), links: data.slice(0, 4).map((p: any) => ({ label: p.name, route: `/product/${p.slug}` })) };
}
async function getOffers(ctx: Ctx): Promise<Out> {
  const { data } = await ctx.sb.from('promotions').select('title,message,kind,value,min_subtotal,ends_at,code,show_banner').eq('is_active', true).is('user_id', null).limit(10);
  const now = Date.now(); const rows = (data ?? []).filter((p: any) => !p.ends_at || new Date(p.ends_at).getTime() > now);
  if (!rows.length) return { text: 'No public offers are running right now.' };
  return { text: rows.map((p: any) => `${p.title}${p.message ? ' — ' + p.message : ''}: ${p.kind === 'percent' ? p.value + '% off' : p.kind === 'fixed' ? ctx.cur + ' ' + p.value + ' off' : 'free delivery'}${p.min_subtotal > 0 ? `, min spend ${ctx.cur} ${p.min_subtotal}` : ''}${p.code ? `, code ${p.code}` : ', applied automatically'}${p.ends_at ? `, ends ${when(ctx, p.ends_at, false)}` : ''}` ).join('\n'), links: [{ label: 'Shop', route: '/shop' }] };
}
async function getClubInfo(ctx: Ctx): Promise<Out> {
  const { data } = await ctx.sb.from('site_settings').select('key,value');
  const keep = /name|contact|email|phone|address|location|footer_text|about|whatsapp|facebook|instagram|twitter|youtube|tiktok|delivery_fee|currency|payment_instructions|points_|tagline/i;
  const lines = (data ?? []).filter((r: any) => keep.test(r.key) && (typeof r.value === 'string' || typeof r.value === 'number') && String(r.value).trim()).map((r: any) => `${r.key}: ${clip(r.value, 300)}`);
  return { text: lines.length ? lines.join('\n') : 'No club contact details have been set.' };
}
async function getMyAccount(ctx: Ctx): Promise<Out> {
  if (!ctx.userId) return { text: 'The visitor is not signed in, so no personal information is available. Suggest they sign in.', links: [{ label: 'Sign in', route: '/login' }] };
  const sb = ctx.sb; const out: string[] = []; const links: Link[] = [];
  const { data: me } = await sb.from('profiles').select('full_name').eq('id', ctx.userId).maybeSingle(); out.push(`Name: ${me?.full_name ?? 'unknown'}`);
  const { data: pl } = await sb.from('players').select('id,full_name,shirt_number,positions(name)').eq('profile_id', ctx.userId).maybeSingle();
  if (pl) { out.push(`Player card: ${pl.full_name}${pl.shirt_number != null ? ' #' + pl.shirt_number : ''}, ${pl.positions?.name ?? 'no position'}`); links.push({ label: 'My player page', route: `/player/${pl.id}` });
    const { data: att } = await sb.from('training_attendance').select('status').eq('player_id', pl.id); if (att?.length) { const c: Record<string, number> = {}; att.forEach((r: any) => (c[r.status] = (c[r.status] ?? 0) + 1)); out.push('Training attendance: ' + Object.entries(c).map(([k, v]) => `${v} ${k}`).join(', ')); } }
  const { data: ord } = await sb.from('orders').select('reference,status,created_at,subtotal,delivery_fee,currency').eq('user_id', ctx.userId).order('created_at', { ascending: false }).limit(5);
  if (ord?.length) { out.push('Recent orders: ' + ord.map((o: any) => `${o.reference} (${o.status}, ${o.currency} ${Number(o.subtotal) + Number(o.delivery_fee)}, ${when(ctx, o.created_at, false)})`).join('; ')); links.push({ label: 'My orders', route: '/orders' }); } else out.push('No shop orders yet.');
  const { data: pr } = await sb.from('promotions').select('title,code,ends_at,uses,max_uses').eq('user_id', ctx.userId).eq('source', 'spin').eq('is_active', true).limit(10);
  const live = (pr ?? []).filter((p: any) => p.uses < (p.max_uses ?? 1) && (!p.ends_at || new Date(p.ends_at).getTime() > Date.now()));
  out.push(live.length ? 'Unused spin prizes: ' + live.map((p: any) => `${String(p.title).replace('Spin & win: ', '')} code ${p.code} (expires ${when(ctx, p.ends_at, false)})`).join('; ') : 'No unused spin prizes.');
  const { data: sp } = await sb.rpc('spin_config'); if (sp?.enabled) out.push(sp.next_spin_at ? `Next spin available: ${when(ctx, sp.next_spin_at)}` : 'A spin is available now.'); links.push({ label: 'Spin the wheel', route: '/spin' });
  return { text: out.join('\n'), links };
}

const TOOLS: { name: string; description: string; input_schema: any; run: (c: Ctx, a: any) => Promise<Out> }[] = [
  { name: 'get_matches', description: 'Matches of the team: upcoming fixtures, finished results (with scorers), friendly matches, or games against one opponent.', input_schema: { type: 'object', properties: { when: { type: 'string', enum: ['upcoming', 'results', 'all'] }, friendly: { type: 'boolean', description: 'Only friendly matches' }, opponent: { type: 'string' }, limit: { type: 'number' } } }, run: getMatches },
  { name: 'get_training', description: 'Training sessions (date, focus, plan). Only visible to signed-in team members.', input_schema: { type: 'object', properties: { when: { type: 'string', enum: ['upcoming', 'past'] }, limit: { type: 'number' } } }, run: getTraining },
  { name: 'get_standings', description: 'League table and where our team stands.', input_schema: { type: 'object', properties: { top: { type: 'number' } } }, run: getStandings },
  { name: 'get_events', description: 'Club calendar events (meetings, social days, repeating sessions).', input_schema: { type: 'object', properties: { limit: { type: 'number' } } }, run: getEvents },
  { name: 'get_news', description: 'Published news articles; optionally search by words.', input_schema: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'number' } } }, run: getNews },
  { name: 'get_squad', description: 'Players: list the squad or search by name or position.', input_schema: { type: 'object', properties: { name: { type: 'string' }, position: { type: 'string' } } }, run: getSquad },
  { name: 'get_player_stats', description: 'Appearances, goals, assists, cards and awards of a player by name.', input_schema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] }, run: getPlayerStats },
  { name: 'get_top_scorers', description: 'Top scorers or assist leaders.', input_schema: { type: 'object', properties: { stat: { type: 'string', enum: ['goals', 'assists'] }, limit: { type: 'number' } } }, run: getTop },
  { name: 'get_tryouts', description: 'Upcoming tryouts and whether applications are open.', input_schema: { type: 'object', properties: {} }, run: (c) => getTryouts(c) },
  { name: 'get_announcements', description: 'Current club announcements.', input_schema: { type: 'object', properties: {} }, run: (c) => getAnnouncements(c) },
  { name: 'get_awards', description: 'Published awards (Player of the Month etc.).', input_schema: { type: 'object', properties: {} }, run: (c) => getAwards(c) },
  { name: 'get_shop', description: 'Shop products with price, sale price, colours and sizes in stock, sold-out status.', input_schema: { type: 'object', properties: { query: { type: 'string' } } }, run: getShop },
  { name: 'get_offers', description: 'Running public promotions and discount codes.', input_schema: { type: 'object', properties: {} }, run: (c) => getOffers(c) },
  { name: 'get_club_info', description: 'Club name, contact details, payment/delivery info and other public settings.', input_schema: { type: 'object', properties: {} }, run: (c) => getClubInfo(c) },
  { name: 'get_my_account', description: 'The signed-in visitor\'s own profile, player card, attendance, orders, spin prizes. Only their own data.', input_schema: { type: 'object', properties: {} }, run: (c) => getMyAccount(c) },
  { name: 'search_app_help', description: 'How-to guides for using the website/app (sign in, shop, spin wheel, tryouts, search, settings, admin tools...).', input_schema: { type: 'object', properties: { topic: { type: 'string' } }, required: ['topic'] }, run: async (_c, a) => guideSearch(String(a.topic ?? '')) },
];

// ───────────────────────── Without an AI key: simple keyword routing ─────────────────────────
async function fallback(ctx: Ctx, question: string): Promise<{ reply: string; links: Link[] }> {
  const q = question.toLowerCase(); const parts: Out[] = []; const is = (re: RegExp) => re.test(q);
  const friendly = is(/\bfriendl/), results = is(/\b(results?|scores?|won|lost|beat|last (match|game))\b/), training = is(/\b(train|training|practice|session|sessions)\b/);
  const matchWord = is(/\b(match|matches|fixtures?|games?|opponents?|versus|vs)\b/);
  let data = false; const add = async (p: Promise<Out>) => { parts.push(await p); data = true; };
  if (friendly) await add(getMatches(ctx, { friendly: true, when: 'all', limit: 5 }));
  else if (results) await add(getMatches(ctx, { when: 'results', limit: 3 }));
  else if (matchWord || (is(/\bnext\b/) && !training)) await add(getMatches(ctx, { when: 'upcoming', limit: 4 }));
  if (training) await add(getTraining(ctx, { when: 'upcoming' }));
  if (is(/\b(table|standings?|league|position)\b/)) await add(getStandings(ctx, {}));
  if (is(/\b(events?|calendar|meetings?)\b/)) await add(getEvents(ctx, {}));
  if (is(/\b(news|articles?|headlines?)\b/)) await add(getNews(ctx, {}));
  if (is(/\b(scorers?|goals?|assists?)\b/)) await add(getTop(ctx, { stat: is(/\bassists?\b/) ? 'assists' : 'goals' }));
  if (is(/\b(tryouts?|trials?)\b/)) await add(getTryouts(ctx));
  if (is(/\bannounce/)) await add(getAnnouncements(ctx));
  if (is(/\bawards?\b/)) await add(getAwards(ctx));
  if (is(/\b(offers?|discounts?|promos?|sale|codes?)\b/)) await add(getOffers(ctx));
  if (is(/\b(shop|buy|price|prices|jerseys?|kits?|shirts?|merch|merchandise|hoodies?)\b/)) await add(getShop(ctx, {}));
  if (is(/\b(contact|phone|email|address)\b/)) await add(getClubInfo(ctx));
  if (is(/\bmy (orders?|account|prizes?|attendance)\b/)) await add(getMyAccount(ctx));
  if (is(/\b(squad|players?|roster)\b/)) await add(getSquad(ctx, {}));
  if (!data && is(/\b(hi|hello|hey|thanks?|thank you)\b/) && !is(/\b(how|help)\b/)) parts.push({ text: `Hi! I can help with matches and results, friendlies, training, events, tryouts, news, the squad, the shop and offers, and how to use this app. What would you like to know?` });
  else if (!data || is(/\b(how|help)\b/)) parts.push(guideSearch(question));
  const links = parts.flatMap((p) => p.links ?? []);
  return { reply: parts.map((p) => p.text).join('\n\n'), links };
}


export type LocalCtx = Ctx;
export const localAnswer = (ctx: Ctx, question: string) => fallback(ctx, question);
