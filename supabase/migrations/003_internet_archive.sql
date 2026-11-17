-- Internet Archive: permite armazenar a página do item e usar o embed oficial.
-- Execute no SQL Editor do Supabase antes de publicar o frontend.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.filmes'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%origem%'
  loop
    execute format('alter table public.filmes drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.filmes
  add constraint filmes_origem_check
  check (origem in ('upload','mp4','hls','dash','youtube','drive','link','archive'));
