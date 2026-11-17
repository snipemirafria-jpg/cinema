-- =====================================================================
-- Cine Online — esquema completo (PostgreSQL / Supabase)
-- Rode este arquivo inteiro no SQL Editor do Supabase (ou via CLI).
-- É idempotente: pode ser executado de novo sem quebrar nada.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Configuração privada (NÃO exposta ao navegador)
-- ---------------------------------------------------------------------
create schema if not exists privado;
revoke all on schema privado from public, anon, authenticated;

create table if not exists privado.config (
  chave text primary key,
  valor text not null
);
-- E-mail do proprietário (OWNER). Troque aqui se precisar.
insert into privado.config (chave, valor)
values ('owner_email', 'roniellloliveira123@gmail.com')
on conflict (chave) do nothing;

-- ---------------------------------------------------------------------
-- Perfis
-- ---------------------------------------------------------------------
create table if not exists public.perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  google_sub text unique,                       -- identificador exclusivo da conta Google
  email text,
  apelido text unique check (apelido ~ '^[A-Za-z0-9_\.]{3,20}$'),
  genero text check (genero in ('masculino','feminino','outro')),
  avatar jsonb not null default '{"base":"male","cabelo":"simpleparted","pele":"#c68e6b","roupa":"#151515","olhos":"#4a2e1a","cabeloCor":"#2b1a10"}'::jsonb,
  papel text not null default 'espectador' check (papel in ('espectador','owner')),
  cadastro_completo boolean not null default false,
  criado_em timestamptz not null default now(),
  ultimo_acesso timestamptz
);
create index if not exists perfis_apelido_lower on public.perfis (lower(apelido));

-- O papel e o google_sub nunca podem ser alterados pelo próprio usuário.
create or replace function public.tg_proteger_perfil()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated','anon') then
    new.papel := old.papel;
    new.google_sub := old.google_sub;
    new.email := old.email;
    new.id := old.id;
    new.criado_em := old.criado_em;
  end if;
  return new;
end $$;
drop trigger if exists proteger_perfil on public.perfis;
create trigger proteger_perfil before update on public.perfis
for each row execute function public.tg_proteger_perfil();

-- Cria o perfil no primeiro login. O papel OWNER só é dado quando:
--  * o login veio do Google (identidade validada pelo servidor do Supabase)
--  * o e-mail está verificado
--  * o e-mail é exatamente o configurado em privado.config
create or replace function public.tg_novo_usuario()
returns trigger language plpgsql security definer set search_path = public, privado as $$
declare
  v_owner text;
  v_sub text;
  v_papel text := 'espectador';
begin
  select valor into v_owner from privado.config where chave = 'owner_email';
  v_sub := coalesce(new.raw_user_meta_data->>'sub', new.raw_user_meta_data->>'provider_id');

  if new.email_confirmed_at is not null
     and lower(new.email) = lower(v_owner)
     and coalesce(new.raw_app_meta_data->>'provider','') = 'google'
     and not exists (select 1 from public.perfis where papel = 'owner') then
    v_papel := 'owner';
  end if;

  insert into public.perfis (id, google_sub, email, papel)
  values (new.id, v_sub, new.email, v_papel)
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.tg_novo_usuario();

-- Caso o e-mail do owner seja confirmado depois (update), promove também.
create or replace function public.tg_usuario_atualizado()
returns trigger language plpgsql security definer set search_path = public, privado as $$
declare v_owner text;
begin
  select valor into v_owner from privado.config where chave = 'owner_email';
  if new.email_confirmed_at is not null
     and lower(new.email) = lower(v_owner)
     and coalesce(new.raw_app_meta_data->>'provider','') = 'google'
     and not exists (select 1 from public.perfis where papel = 'owner') then
    update public.perfis set papel = 'owner' where id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated after update of email_confirmed_at on auth.users
for each row execute function public.tg_usuario_atualizado();

create or replace function public.eh_owner(uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis where id = uid and papel = 'owner');
$$;

-- ---------------------------------------------------------------------
-- Auditoria (todas as ações administrativas)
-- ---------------------------------------------------------------------
create table if not exists public.auditoria (
  id bigserial primary key,
  ator uuid,
  acao text not null,
  tabela text,
  registro text,
  dados jsonb,
  criado_em timestamptz not null default now()
);

create or replace function public.tg_auditar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.eh_owner(auth.uid()) then
    insert into public.auditoria (ator, acao, tabela, registro, dados)
    values (auth.uid(), tg_op, tg_table_name,
            coalesce((case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end)->>'id',''),
            case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end);
  end if;
  return coalesce(new, old);
end $$;

-- ---------------------------------------------------------------------
-- Banimentos
-- ---------------------------------------------------------------------
create table if not exists public.banimentos (
  id uuid primary key default gen_random_uuid(),
  usuario uuid not null references public.perfis(id) on delete cascade,
  google_sub text,
  tipo text not null check (tipo in ('temporario','permanente','suspensao')),
  motivo text not null,
  ate timestamptz,                         -- só para temporário
  criado_por uuid references public.perfis(id),
  criado_em timestamptz not null default now(),
  revogado_em timestamptz,
  revogado_por uuid references public.perfis(id)
);
create index if not exists banimentos_usuario on public.banimentos(usuario);
create index if not exists banimentos_sub on public.banimentos(google_sub);

-- Copia o google_sub do perfil para o banimento (identidade Google, não só e-mail)
create or replace function public.tg_ban_sub()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.google_sub is null then
    select google_sub into new.google_sub from public.perfis where id = new.usuario;
  end if;
  if new.tipo = 'temporario' and new.ate is null then
    raise exception 'Banimento temporário precisa de data final';
  end if;
  if exists (select 1 from public.perfis where id = new.usuario and papel = 'owner') then
    raise exception 'O proprietário não pode ser banido';
  end if;
  if new.criado_por is null and public.eh_owner(auth.uid()) then new.criado_por := auth.uid(); end if;
  return new;
end $$;
drop trigger if exists ban_sub on public.banimentos;
create trigger ban_sub before insert on public.banimentos
for each row execute function public.tg_ban_sub();

-- Banimento ativo de um usuário (por id OU pela identidade Google)
create or replace function public.ban_ativo(uid uuid default auth.uid())
returns table (id uuid, tipo text, motivo text, ate timestamptz)
language sql stable security definer set search_path = public as $$
  select b.id, b.tipo, b.motivo, b.ate
  from public.banimentos b
  left join public.perfis p on p.id = uid
  where b.revogado_em is null
    and (b.usuario = uid or (p.google_sub is not null and b.google_sub = p.google_sub))
    and (b.tipo <> 'temporario' or b.ate > now())
  order by case b.tipo when 'permanente' then 0 when 'suspensao' then 1 else 2 end
  limit 1;
$$;

create or replace function public.esta_banido(uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.ban_ativo(uid));
$$;

-- ---------------------------------------------------------------------
-- Sinais de abuso / reincidência (sem fingerprinting invasivo:
-- só um identificador aleatório que o próprio app guarda no aparelho)
-- ---------------------------------------------------------------------
create table if not exists public.sinais_acesso (
  id bigserial primary key,
  usuario uuid not null references public.perfis(id) on delete cascade,
  dispositivo text not null,               -- UUID aleatório do localStorage
  criado_em timestamptz not null default now()
);
create index if not exists sinais_disp on public.sinais_acesso(dispositivo);

-- Histórico de acessos
create table if not exists public.acessos (
  id bigserial primary key,
  usuario uuid not null references public.perfis(id) on delete cascade,
  criado_em timestamptz not null default now(),
  plataforma text
);
create index if not exists acessos_data on public.acessos(criado_em desc);

-- Registrado pelo app a cada entrada. Também sinaliza reincidência:
-- se este aparelho já foi usado por uma conta banida, abre uma
-- suspensão preventiva para análise do proprietário.
create or replace function public.registrar_acesso(p_dispositivo text, p_plataforma text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_ban record;
  v_reincidente boolean := false;
begin
  if v_uid is null then raise exception 'não autenticado'; end if;
  if p_dispositivo !~ '^[0-9a-f-]{36}$' then p_dispositivo := null; end if;

  update public.perfis set ultimo_acesso = now() where id = v_uid;
  insert into public.acessos (usuario, plataforma) values (v_uid, left(p_plataforma, 80));

  if p_dispositivo is not null then
    insert into public.sinais_acesso (usuario, dispositivo) values (v_uid, p_dispositivo);
    select true into v_reincidente
    from public.sinais_acesso s
    join public.banimentos b on b.usuario = s.usuario
    where s.dispositivo = p_dispositivo and s.usuario <> v_uid
      and b.revogado_em is null and b.tipo = 'permanente'
    limit 1;
    if v_reincidente and not public.esta_banido(v_uid) and not public.eh_owner(v_uid)
       and not exists (select 1 from public.banimentos where usuario = v_uid and tipo='suspensao') then
      insert into public.banimentos (usuario, tipo, motivo, criado_por)
      values (v_uid, 'suspensao', 'Automático: aparelho ligado a conta banida permanentemente. Aguarda análise.', null);
    end if;
  end if;

  select * into v_ban from public.ban_ativo(v_uid);
  return jsonb_build_object(
    'banido', v_ban.id is not null,
    'tipo', v_ban.tipo, 'motivo', v_ban.motivo, 'ate', v_ban.ate,
    'owner', public.eh_owner(v_uid),
    'agora', now());
end $$;

-- ---------------------------------------------------------------------
-- Filmes
-- ---------------------------------------------------------------------
create table if not exists public.filmes (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descricao text,
  capa_url text,
  duracao_seg integer not null check (duracao_seg > 0),
  genero text,
  classificacao text check (classificacao in ('L','10','12','14','16','18')),
  idioma text,
  legendas jsonb not null default '[]'::jsonb,       -- [{"lang":"pt","label":"Português","url":"..."}]
  origem text not null check (origem in ('upload','mp4','hls','dash')),
  fonte_url text,                                    -- URL do vídeo (mp4/m3u8/mpd)
  arquivo_path text,                                 -- caminho no Storage (upload)
  hls_path text,                                     -- saída HLS gerada do upload
  status text not null default 'pronto' check (status in ('pronto','processando','erro')),
  licenca_tipo text not null,                        -- ex: Domínio público, CC BY, Licenciado
  licenca_detalhes text,
  licenca_titular text,
  licenca_validade date,
  criado_por uuid references public.perfis(id),
  criado_em timestamptz not null default now()
);

-- Validação de endereço no banco (camada extra contra SSRF / links internos).
-- A validação completa (DNS, tipo de conteúdo) é feita pela Edge Function validar-fonte.
create or replace function public.url_externa_segura(u text)
returns boolean language plpgsql immutable as $$
declare h text;
begin
  if u is null then return true; end if;
  if u !~* '^https://[^/\s]+(/\S*)?$' then return false; end if;
  h := lower(substring(u from '^https://([^/:?#]+)'));
  if h in ('localhost','metadata.google.internal','metadata') then return false; end if;
  if h ~ '\.(local|internal|localdomain|lan|intranet|corp|home)$' then return false; end if;
  if h ~ '^\[' then return false; end if;                                  -- IPv6 literal
  if h ~ '^(0|10|127)\.' or h ~ '^169\.254\.' or h ~ '^192\.168\.'
     or h ~ '^172\.(1[6-9]|2[0-9]|3[01])\.' or h ~ '^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\.'
     or h ~ '^(22[4-9]|2[3-5][0-9])\.' or h ~ '^[0-9]+$' or h ~ '^0x' then
    return false;
  end if;
  return true;
end $$;

create or replace function public.tg_validar_filme()
returns trigger language plpgsql as $$
begin
  if not public.url_externa_segura(new.fonte_url) then raise exception 'Endereço de vídeo não permitido'; end if;
  if not public.url_externa_segura(new.capa_url) and new.capa_url !~ '^assets/capas/[a-z0-9_.-]+$' then raise exception 'Endereço de capa não permitido'; end if;
  if new.origem = 'hls' and new.fonte_url !~* '\.m3u8(\?.*)?$' then raise exception 'Fonte HLS precisa terminar em .m3u8'; end if;
  if new.origem = 'dash' and new.fonte_url !~* '\.mpd(\?.*)?$' then raise exception 'Fonte DASH precisa terminar em .mpd'; end if;
  if new.origem = 'mp4' and new.fonte_url !~* '\.(mp4|webm|m4v|mov)(\?.*)?$' then
    raise exception 'O endereço precisa apontar para um arquivo de vídeo (.mp4, .webm), não para uma página';
  end if;
  if new.origem = 'upload' and new.arquivo_path is null then raise exception 'Upload sem arquivo'; end if;
  if new.origem <> 'upload' and new.fonte_url is null then raise exception 'Informe o endereço do vídeo'; end if;
  return new;
end $$;
drop trigger if exists validar_filme on public.filmes;
create trigger validar_filme before insert or update on public.filmes
for each row execute function public.tg_validar_filme();

-- Fila de processamento HLS (executada pelo GitHub Actions — ver .github/workflows)
create table if not exists public.processamentos (
  id uuid primary key default gen_random_uuid(),
  filme uuid not null references public.filmes(id) on delete cascade,
  status text not null default 'pendente' check (status in ('pendente','executando','concluido','erro')),
  log text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create or replace function public.tg_filme_upload()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.origem = 'upload' and new.hls_path is null then
    insert into public.processamentos (filme) values (new.id);
  end if;
  return new;
end $$;
drop trigger if exists filme_upload on public.filmes;
create trigger filme_upload after insert on public.filmes
for each row execute function public.tg_filme_upload();

-- ---------------------------------------------------------------------
-- Programação (fila contínua controlada pelo servidor)
-- ---------------------------------------------------------------------
create table if not exists public.programacao (
  id uuid primary key default gen_random_uuid(),
  filme uuid not null references public.filmes(id) on delete cascade,
  posicao double precision not null,
  criado_em timestamptz not null default now()
);
create index if not exists programacao_pos on public.programacao(posicao);

create table if not exists public.estado_cinema (
  id smallint primary key default 1 check (id = 1),
  item_atual uuid references public.programacao(id) on delete set null,
  iniciado_em timestamptz,
  pausado boolean not null default false,
  atualizado_em timestamptz not null default now()
);
insert into public.estado_cinema (id) values (1) on conflict do nothing;

-- Calcula o que está passando AGORA, sem depender de ninguém conectado.
-- Avança pela fila conforme a duração dos filmes e repete a fila em loop.
create or replace function public.agora_passando()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  e public.estado_cinema;
  itens record;
  v_ids uuid[]; v_dur int[]; v_n int; v_idx int; v_total bigint;
  v_elapsed double precision; v_inicio timestamptz;
  v_prox uuid; f public.filmes;
begin
  select * into e from public.estado_cinema where id = 1 for update;
  select array_agg(p.id order by p.posicao), array_agg(fi.duracao_seg order by p.posicao)
    into v_ids, v_dur
  from public.programacao p join public.filmes fi on fi.id = p.filme
  where fi.status = 'pronto';
  v_n := coalesce(array_length(v_ids,1),0);
  if v_n = 0 then
    return jsonb_build_object('agora', now(), 'filme', null);
  end if;

  v_idx := array_position(v_ids, e.item_atual);
  if v_idx is null or e.iniciado_em is null then
    v_idx := 1; v_inicio := now();
  else
    v_inicio := e.iniciado_em;
  end if;

  if not e.pausado then
    v_elapsed := extract(epoch from now() - v_inicio);
    select sum(x) into v_total from unnest(v_dur) x;
    -- pula ciclos inteiros da fila de uma vez
    if v_elapsed > v_dur[v_idx] + v_total then
      v_inicio := v_inicio + make_interval(secs => floor((v_elapsed - v_dur[v_idx]) / v_total) * v_total);
      v_elapsed := extract(epoch from now() - v_inicio);
    end if;
    while v_elapsed >= v_dur[v_idx] loop
      v_inicio := v_inicio + make_interval(secs => v_dur[v_idx]);
      v_elapsed := v_elapsed - v_dur[v_idx];
      v_idx := (v_idx % v_n) + 1;
    end loop;
  end if;

  if e.item_atual is distinct from v_ids[v_idx] or e.iniciado_em is distinct from v_inicio then
    update public.estado_cinema set item_atual = v_ids[v_idx], iniciado_em = v_inicio, atualizado_em = now() where id = 1;
  end if;

  select fi.* into f from public.programacao p join public.filmes fi on fi.id = p.filme where p.id = v_ids[v_idx];
  v_prox := v_ids[(v_idx % v_n) + 1];

  return jsonb_build_object(
    'agora', now(),
    'item', v_ids[v_idx],
    'iniciado_em', v_inicio,
    'pausado', e.pausado,
    'posicao_seg', case when e.pausado then 0 else extract(epoch from now() - v_inicio) end,
    'filme', jsonb_build_object('id', f.id, 'titulo', f.titulo, 'descricao', f.descricao, 'capa_url', f.capa_url,
       'duracao_seg', f.duracao_seg, 'genero', f.genero, 'classificacao', f.classificacao, 'idioma', f.idioma,
       'legendas', f.legendas, 'origem', f.origem, 'fonte_url', f.fonte_url, 'arquivo_path', f.arquivo_path, 'hls_path', f.hls_path),
    'proximo_item', v_prox
  );
end $$;

-- Controles do proprietário
create or replace function public.prog_reproduzir_agora(p_item uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_owner() then raise exception 'sem permissão'; end if;
  update public.estado_cinema set item_atual = p_item, iniciado_em = now(), pausado = false, atualizado_em = now() where id = 1;
  insert into public.auditoria (ator, acao, tabela, registro) values (auth.uid(), 'REPRODUZIR_AGORA', 'programacao', p_item::text);
end $$;

create or replace function public.prog_definir_proximo(p_item uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_atual uuid; v_pos double precision; v_seg double precision;
begin
  if not public.eh_owner() then raise exception 'sem permissão'; end if;
  perform public.agora_passando();
  select item_atual into v_atual from public.estado_cinema where id = 1;
  select posicao into v_pos from public.programacao where id = v_atual;
  if v_pos is null then return; end if;
  select min(posicao) into v_seg from public.programacao where posicao > v_pos and id <> p_item;
  update public.programacao set posicao = case when v_seg is null then v_pos + 1 else (v_pos + v_seg) / 2 end where id = p_item;
  insert into public.auditoria (ator, acao, tabela, registro) values (auth.uid(), 'DEFINIR_PROXIMO', 'programacao', p_item::text);
end $$;

create or replace function public.prog_reordenar(p_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare i int;
begin
  if not public.eh_owner() then raise exception 'sem permissão'; end if;
  for i in 1..coalesce(array_length(p_ids,1),0) loop
    update public.programacao set posicao = i where id = p_ids[i];
  end loop;
  insert into public.auditoria (ator, acao, tabela, dados) values (auth.uid(), 'REORDENAR', 'programacao', to_jsonb(p_ids));
end $$;

create or replace function public.prog_pausar(p_pausar boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_owner() then raise exception 'sem permissão'; end if;
  perform public.agora_passando();
  update public.estado_cinema set pausado = p_pausar,
    iniciado_em = case when p_pausar then iniciado_em else now() end, atualizado_em = now() where id = 1;
  insert into public.auditoria (ator, acao, tabela, dados) values (auth.uid(), case when p_pausar then 'PAUSAR' else 'RETOMAR' end, 'estado_cinema', null);
end $$;

-- ---------------------------------------------------------------------
-- Chat, denúncias e configurações
-- ---------------------------------------------------------------------
create table if not exists public.mensagens (
  id bigserial primary key,
  usuario uuid not null references public.perfis(id) on delete cascade,
  texto text not null check (char_length(texto) between 1 and 300),
  removida boolean not null default false,
  criado_em timestamptz not null default now()
);
create index if not exists mensagens_data on public.mensagens(criado_em desc);

create table if not exists public.configuracoes (
  id smallint primary key default 1 check (id = 1),
  nome_cinema text not null default 'Cine Online',
  slogan text not null default 'Assista. Converse. Faça parte!',
  boas_vindas text not null default 'Bem-vindo ao Cine Online! Respeite todos na sala.',
  chat_ativo boolean not null default true,
  intervalo_chat_seg int not null default 2 check (intervalo_chat_seg between 0 and 60),
  palavras_bloqueadas text[] not null default '{}',
  lotacao int not null default 120 check (lotacao between 10 and 500)
);
insert into public.configuracoes (id) values (1) on conflict do nothing;

create or replace function public.tg_validar_mensagem()
returns trigger language plpgsql security definer set search_path = public as $$
declare c public.configuracoes; w text;
begin
  select * into c from public.configuracoes where id = 1;
  new.usuario := auth.uid();
  new.removida := false;
  new.criado_em := now();
  if public.esta_banido(new.usuario) then raise exception 'Você está impedido de enviar mensagens'; end if;
  if not c.chat_ativo and not public.eh_owner() then raise exception 'O chat está desativado'; end if;
  if not exists (select 1 from public.perfis where id = new.usuario and cadastro_completo) then raise exception 'Complete o cadastro'; end if;
  if exists (select 1 from public.mensagens where usuario = new.usuario
             and criado_em > now() - make_interval(secs => c.intervalo_chat_seg)) and not public.eh_owner() then
    raise exception 'Calma! Aguarde um pouco para mandar outra mensagem';
  end if;
  foreach w in array c.palavras_bloqueadas loop
    if w <> '' and position(lower(w) in lower(new.texto)) > 0 then
      new.texto := regexp_replace(new.texto, w, repeat('*', char_length(w)), 'gi');
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists validar_mensagem on public.mensagens;
create trigger validar_mensagem before insert on public.mensagens
for each row execute function public.tg_validar_mensagem();

create table if not exists public.denuncias (
  id uuid primary key default gen_random_uuid(),
  denunciante uuid not null references public.perfis(id) on delete cascade,
  denunciado uuid not null references public.perfis(id) on delete cascade,
  mensagem bigint references public.mensagens(id) on delete set null,
  motivo text not null check (char_length(motivo) between 3 and 500),
  status text not null default 'aberta' check (status in ('aberta','analisando','resolvida','descartada')),
  criado_em timestamptz not null default now(),
  resolvido_por uuid references public.perfis(id),
  resolvido_em timestamptz
);

-- Auditoria nas tabelas administrativas
do $$
declare t text;
begin
  foreach t in array array['filmes','programacao','banimentos','configuracoes','denuncias','perfis'] loop
    execute format('drop trigger if exists auditar on public.%I', t);
    execute format('create trigger auditar after insert or update or delete on public.%I for each row execute function public.tg_auditar()', t);
  end loop;
  drop trigger if exists auditar on public.mensagens;
  create trigger auditar after update or delete on public.mensagens for each row execute function public.tg_auditar();
end $$;

-- ---------------------------------------------------------------------
-- Painel: estatísticas
-- ---------------------------------------------------------------------
create or replace function public.painel_estatisticas()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.eh_owner() then raise exception 'sem permissão'; end if;
  return jsonb_build_object(
    'usuarios', (select count(*) from public.perfis),
    'novos_7d', (select count(*) from public.perfis where criado_em > now() - interval '7 days'),
    'acessos_24h', (select count(*) from public.acessos where criado_em > now() - interval '24 hours'),
    'banidos', (select count(distinct usuario) from public.banimentos b where revogado_em is null and (tipo <> 'temporario' or ate > now())),
    'denuncias_abertas', (select count(*) from public.denuncias where status in ('aberta','analisando')),
    'filmes', (select count(*) from public.filmes),
    'mensagens_24h', (select count(*) from public.mensagens where criado_em > now() - interval '24 hours'),
    'acessos_por_dia', (select coalesce(jsonb_agg(jsonb_build_object('dia', d, 'total', n) order by d), '[]'::jsonb) from (
        select date_trunc('day', criado_em)::date d, count(*) n from public.acessos
        where criado_em > now() - interval '14 days' group by 1) x)
  );
end $$;

-- ---------------------------------------------------------------------
-- Segurança (RLS)
-- ---------------------------------------------------------------------
alter table public.perfis enable row level security;
alter table public.auditoria enable row level security;
alter table public.banimentos enable row level security;
alter table public.sinais_acesso enable row level security;
alter table public.acessos enable row level security;
alter table public.filmes enable row level security;
alter table public.processamentos enable row level security;
alter table public.programacao enable row level security;
alter table public.estado_cinema enable row level security;
alter table public.mensagens enable row level security;
alter table public.configuracoes enable row level security;
alter table public.denuncias enable row level security;

-- Perfis: todos logados veem apelido/avatar; cada um edita o seu; owner edita todos
drop policy if exists perfis_ler on public.perfis;
create policy perfis_ler on public.perfis for select to authenticated using (true);
drop policy if exists perfis_editar on public.perfis;
create policy perfis_editar on public.perfis for update to authenticated
  using (id = auth.uid() or public.eh_owner()) with check (id = auth.uid() or public.eh_owner());

-- E-mail e google_sub só aparecem para o próprio usuário e para o owner
revoke select on public.perfis from authenticated, anon;
grant select (id, apelido, genero, avatar, papel, cadastro_completo, criado_em, ultimo_acesso) on public.perfis to authenticated;
grant update (apelido, genero, avatar, cadastro_completo) on public.perfis to authenticated;

create or replace function public.perfis_admin()
returns setof public.perfis language sql stable security definer set search_path = public as $$
  select * from public.perfis where public.eh_owner() order by criado_em desc;
$$;
create or replace function public.meu_perfil()
returns public.perfis language sql stable security definer set search_path = public as $$
  select * from public.perfis where id = auth.uid();
$$;

drop policy if exists auditoria_owner on public.auditoria;
create policy auditoria_owner on public.auditoria for select to authenticated using (public.eh_owner());

drop policy if exists ban_owner on public.banimentos;
create policy ban_owner on public.banimentos for all to authenticated using (public.eh_owner()) with check (public.eh_owner());
drop policy if exists ban_proprio on public.banimentos;
create policy ban_proprio on public.banimentos for select to authenticated using (usuario = auth.uid());

drop policy if exists sinais_owner on public.sinais_acesso;
create policy sinais_owner on public.sinais_acesso for select to authenticated using (public.eh_owner());
drop policy if exists acessos_owner on public.acessos;
create policy acessos_owner on public.acessos for select to authenticated using (public.eh_owner());

drop policy if exists filmes_ler on public.filmes;
create policy filmes_ler on public.filmes for select to authenticated using (true);
drop policy if exists filmes_owner on public.filmes;
create policy filmes_owner on public.filmes for all to authenticated using (public.eh_owner()) with check (public.eh_owner());

drop policy if exists proc_owner on public.processamentos;
create policy proc_owner on public.processamentos for all to authenticated using (public.eh_owner()) with check (public.eh_owner());

drop policy if exists prog_ler on public.programacao;
create policy prog_ler on public.programacao for select to authenticated using (true);
drop policy if exists prog_owner on public.programacao;
create policy prog_owner on public.programacao for all to authenticated using (public.eh_owner()) with check (public.eh_owner());

drop policy if exists estado_ler on public.estado_cinema;
create policy estado_ler on public.estado_cinema for select to authenticated using (true);

drop policy if exists msg_ler on public.mensagens;
create policy msg_ler on public.mensagens for select to authenticated using (not removida or public.eh_owner());
drop policy if exists msg_criar on public.mensagens;
create policy msg_criar on public.mensagens for insert to authenticated with check (true);
drop policy if exists msg_owner on public.mensagens;
create policy msg_owner on public.mensagens for update to authenticated using (public.eh_owner()) with check (public.eh_owner());
drop policy if exists msg_owner_del on public.mensagens;
create policy msg_owner_del on public.mensagens for delete to authenticated using (public.eh_owner());

drop policy if exists cfg_ler on public.configuracoes;
create policy cfg_ler on public.configuracoes for select to anon, authenticated using (true);
drop policy if exists cfg_owner on public.configuracoes;
create policy cfg_owner on public.configuracoes for update to authenticated using (public.eh_owner()) with check (public.eh_owner());

drop policy if exists den_criar on public.denuncias;
create policy den_criar on public.denuncias for insert to authenticated
  with check (denunciante = auth.uid() and denunciado <> auth.uid() and status = 'aberta');
drop policy if exists den_owner on public.denuncias;
create policy den_owner on public.denuncias for all to authenticated using (public.eh_owner()) with check (public.eh_owner());
drop policy if exists den_propria on public.denuncias;
create policy den_propria on public.denuncias for select to authenticated using (denunciante = auth.uid());

-- Funções expostas
grant execute on function public.agora_passando() to authenticated;
grant execute on function public.registrar_acesso(text, text) to authenticated;
grant execute on function public.ban_ativo(uuid) to authenticated;
revoke execute on function public.url_externa_segura(text) from anon;

-- Realtime (chat e mudanças de programação)
do $$
begin
  begin execute 'alter publication supabase_realtime add table public.mensagens'; exception when others then null; end;
  begin execute 'alter publication supabase_realtime add table public.estado_cinema'; exception when others then null; end;
  begin execute 'alter publication supabase_realtime add table public.programacao'; exception when others then null; end;
end $$;

-- ---------------------------------------------------------------------
-- Storage: bucket de filmes (upload só do owner, leitura pública p/ streaming)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('filmes', 'filmes', true)
on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('capas', 'capas', true)
on conflict (id) do nothing;

drop policy if exists filmes_upload_owner on storage.objects;
create policy filmes_upload_owner on storage.objects for insert to authenticated
  with check (bucket_id in ('filmes','capas') and public.eh_owner());
drop policy if exists filmes_update_owner on storage.objects;
create policy filmes_update_owner on storage.objects for update to authenticated
  using (bucket_id in ('filmes','capas') and public.eh_owner());
drop policy if exists filmes_delete_owner on storage.objects;
create policy filmes_delete_owner on storage.objects for delete to authenticated
  using (bucket_id in ('filmes','capas') and public.eh_owner());

-- ---------------------------------------------------------------------
-- Filmes iniciais (licença livre — Blender Foundation, CC BY)
-- ---------------------------------------------------------------------
insert into public.filmes (id, titulo, descricao, capa_url, duracao_seg, genero, classificacao, idioma, origem, fonte_url, licenca_tipo, licenca_titular, licenca_detalhes)
values
 ('00000000-0000-4000-8000-000000000001','Big Buck Bunny','Um coelho gigante e gentil dá o troco em três roedores folgados.',
  'assets/capas/bbb.jpg',
  596,'Animação','L','Sem diálogos','hls','https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
  'CC BY 3.0','Blender Foundation','(c) copyright 2008, Blender Foundation / www.bigbuckbunny.org'),
 ('00000000-0000-4000-8000-000000000002','Sintel','Uma jovem procura o filhote de dragão que criou.',
  'assets/capas/sintel.jpg',
  888,'Aventura','12','Inglês','hls','https://cdn.theoplayer.com/video/sintel/index.m3u8',
  'CC BY 3.0','Blender Foundation','(c) copyright Blender Foundation | durian.blender.org'),
 ('00000000-0000-4000-8000-000000000003','Tears of Steel','Em Amsterdã, cientistas tentam salvar o mundo de robôs.',
  'assets/capas/tos.png',
  734,'Ficção científica','12','Inglês','hls','https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8',
  'CC BY 3.0','Blender Foundation','(CC) Blender Foundation | mango.blender.org')
on conflict (id) do nothing;

insert into public.programacao (filme, posicao)
select f.id, row_number() over (order by f.id)
from public.filmes f
where f.id in ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003')
  and not exists (select 1 from public.programacao);
