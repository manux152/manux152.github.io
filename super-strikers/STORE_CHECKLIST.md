# Going live: website + App Store + Google Play

## 0. Before anything
- Change `com.superstrikers.app` (in `app.json`, iOS `bundleIdentifier` and Android `package`) to an identifier you own, e.g. `com.yourclub.strikers`. It can't be changed after publishing.
- Replace the placeholder icons/splash in `assets/` (icon 1024×1024 PNG, no transparency; adaptive icon 1024×1024 with transparent background).
- Run migrations 001–006 in order; deploy all edge functions (`create-user`, `send-push`, `sync-standings`, `predict-match`, `delete-account`).
- Supabase Auth settings: turn on **email confirmation**, set a minimum password length, and add CAPTCHA or rate limits if signups get abused.
- Write real **Privacy policy** and **Terms** text in Admin → Info & legal pages (the seeded text is a draft). Both stores require a public privacy-policy URL; host the same text on your website.
- Make a demo account (with a normal role) and put its login in the review notes for Apple/Google.

## 1. Website
`npm run build:web` creates `dist/`. Host it on Netlify, Vercel, or Cloudflare Pages (`vercel.json` and `public/_redirects` are included for single-page routing). Add your domain in Supabase → Auth → URL configuration.

## 2. Mobile builds (EAS)
1. `npm i -g eas-cli && eas login && eas init` → put the project ID in `app.json → extra.eas.projectId`.
2. `eas build -p android --profile production` and `eas build -p ios --profile production` (EAS creates signing keys and push credentials for you).
3. Test first with `--profile preview` on real phones.
4. `eas submit -p ios` / `eas submit -p android`, or upload manually in the store consoles.

Accounts: Apple Developer Program (about $99/year), Google Play Console (about $25 one-time). Check current prices and review times with each store.

## 3. Store listing material
- Name, short + long description, category (Sports), contact email, privacy-policy URL.
- Screenshots (phone sizes each store lists), feature graphic for Google Play.
- Age rating questionnaire. Data-safety (Google) / App privacy (Apple) answers: you collect email, name, optional registration answers, push token; photos/videos are uploaded by admins; users can delete their account in-app (Account → Delete my account).
- Apple review notes: explain it is a team app and give the demo login.

## 4. Operations
- Back up the database (Supabase scheduled backups on paid plans, or `pg_dump`).
- Watch Supabase usage: storage (photos/videos), bandwidth, edge function calls.
- Keep API keys only in function secrets, never in the app or site settings.

## 5. Review accounts with team codes
Reviewers cannot create accounts without a team code. Create a demo account in Admin → Users (it bypasses the code rule) and put its email/password in the store review notes.
