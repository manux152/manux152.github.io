-- Shared cache of automatic translations (filled by the translate-text Edge Function; nobody reads it directly).
create table if not exists ui_translations (
  lang text not null,
  hash text not null,
  source text not null,
  translated text not null,
  created_at timestamptz not null default now(),
  primary key (lang, hash)
);
alter table ui_translations enable row level security;   -- no policies on purpose: only the Edge Function (service role) can read or write

-- The language each person picked (also used for their own AI replies).
alter table profiles add column if not exists language text;

-- To force a re-translation after you improve wording:  delete from ui_translations where lang = 'es';
