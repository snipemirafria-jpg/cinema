begin;

create table if not exists public.anuncios_parede (
  posicao smallint primary key check (posicao between 1 and 6),
  tipo text not null default 'auto' check (tipo in ('auto', 'foto', 'video', 'pagina')),
  url text check (
    url is null or (
      char_length(url) <= 2048
      and url ~* '^https?://[^/@?#[:space:]]+([/?#][^[:space:]]*)?$'
    )
  )
);

insert into public.anuncios_parede (posicao)
select n from generate_series(1, 6) as serie(n)
on conflict (posicao) do nothing;

alter table public.anuncios_parede enable row level security;
revoke all on public.anuncios_parede from anon, authenticated;
grant select on public.anuncios_parede to authenticated;
grant update (tipo, url) on public.anuncios_parede to authenticated;

drop policy if exists anuncios_parede_ler on public.anuncios_parede;
create policy anuncios_parede_ler on public.anuncios_parede
  for select to authenticated using (true);

drop policy if exists anuncios_parede_editar on public.anuncios_parede;
create policy anuncios_parede_editar on public.anuncios_parede
  for update to authenticated using (public.eh_owner()) with check (public.eh_owner());

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') and not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'anuncios_parede'
  ) then
    alter publication supabase_realtime add table public.anuncios_parede;
  end if;
end;
$$;

commit;
