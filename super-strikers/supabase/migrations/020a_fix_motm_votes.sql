-- Run this ONCE in the Supabase SQL Editor, then run 020_match_day.sql again.
-- Fixes: ERROR 42703: column "voter_id" does not exist (your motm_votes table has user_id).
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'motm_votes' and column_name = 'user_id')
     and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'motm_votes' and column_name = 'voter_id') then
    alter table motm_votes rename column user_id to voter_id;
  end if;
end $$;
