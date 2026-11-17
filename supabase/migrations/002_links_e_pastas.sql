-- 002: filmes por link (YouTube, Google Drive, qualquer site) + pastas (categorias) + expulsar
alter table public.filmes add column if not exists categoria text not null default 'Outros';
alter table public.filmes alter column licenca_tipo set default 'Não informado';
alter table public.filmes drop constraint if exists filmes_origem_check;
alter table public.filmes add constraint filmes_origem_check
  check (origem in ('upload','mp4','hls','dash','youtube','drive','link'));

create table if not exists public.categorias (
  nome text primary key,
  icone text not null default '🎬',
  ordem int not null default 100
);
insert into public.categorias (nome, icone, ordem) values
 ('Ação','💥',1),('Aventura','🗺️',2),('Desenho','🧸',3),('Anime','🍥',4),('Comédia','😂',5),('Terror','👻',6),
 ('Suspense','🔪',7),('Drama','🎭',8),('Romance','❤️',9),('Ficção científica','🚀',10),('Fantasia','🐉',11),
 ('Documentário','🎥',12),('Séries','📺',13),('Infantil','🎈',14),('Outros','🎬',99)
on conflict (nome) do nothing;
alter table public.categorias enable row level security;
drop policy if exists cat_ler on public.categorias;
create policy cat_ler on public.categorias for select to authenticated using (true);
drop policy if exists cat_owner on public.categorias;
create policy cat_owner on public.categorias for all to authenticated using (public.eh_owner()) with check (public.eh_owner());
grant select, insert, update, delete on public.categorias to authenticated;

create or replace function public.tg_validar_filme()
returns trigger language plpgsql as $$
begin
  if not public.url_externa_segura(new.fonte_url) then raise exception 'Endereço de vídeo não permitido (use um link https público)'; end if;
  if not public.url_externa_segura(new.capa_url) and new.capa_url !~ '^assets/capas/[a-z0-9_.-]+$' then raise exception 'Endereço de capa não permitido'; end if;
  if new.origem = 'hls' and new.fonte_url !~* '\.m3u8(\?.*)?$' then raise exception 'Fonte HLS precisa terminar em .m3u8'; end if;
  if new.origem = 'dash' and new.fonte_url !~* '\.mpd(\?.*)?$' then raise exception 'Fonte DASH precisa terminar em .mpd'; end if;
  if new.origem = 'youtube' and new.fonte_url !~* '^https://(www\.|m\.)?(youtube\.com|youtu\.be|youtube-nocookie\.com)/' then raise exception 'Link do YouTube inválido'; end if;
  if new.origem = 'drive' and new.fonte_url !~* '^https://(drive|docs)\.google\.com/' then raise exception 'Link do Google Drive inválido'; end if;
  if new.origem = 'upload' and new.arquivo_path is null then raise exception 'Upload sem arquivo'; end if;
  if new.origem <> 'upload' and new.fonte_url is null then raise exception 'Informe o link do vídeo'; end if;
  return new;
end $$;

-- Dono: a conta roniellloliveira123@gmail.com (criada por e-mail e senha) vira owner.
update public.perfis set papel = 'owner'
 where lower(email) = 'roniellloliveira123@gmail.com'
   and not exists (select 1 from public.perfis where papel = 'owner');
