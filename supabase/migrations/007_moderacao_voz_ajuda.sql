-- 007: Moderação do criador (bans globais + silenciar voz/texto/ajuda), Pedir ajuda e auditoria.
-- Reversível: veja 007_moderacao_voz_ajuda_down.sql.
--
-- Regras:
--  * O papel de criador vem SÓ do banco: public.eh_owner() (perfis.papel = 'owner').
--  * Ninguém modera o owner, e o owner não modera a si mesmo.
--  * Toda ação de moderação passa por funções SECURITY DEFINER que conferem o owner,
--    gravam a punição e a linha de auditoria na mesma transação.
--  * Banimento é do site inteiro (tabela existente public.banimentos).
--  * Silenciamentos ficam em public.silenciamentos (voz | texto | ajuda), com prazo e revogação.
--  * Silenciar texto é imposto no banco (trigger em public.mensagens).
--  * Silenciar voz: a voz é P2P (WebRTC). O banco é a fonte da verdade (silenciados_ativos());
--    os clientes do silenciado não publicam e os demais recusam a faixa dele. Ver docs/VOZ.md.

-- ---------------------------------------------------------------------
-- Silenciamentos
-- ---------------------------------------------------------------------
create table if not exists public.silenciamentos (
  id uuid primary key default gen_random_uuid(),
  usuario uuid not null references public.perfis(id) on delete cascade,
  tipo text not null check (tipo in ('voz','texto','ajuda')),
  motivo text,
  ate timestamptz,                               -- null = até o criador revogar
  criado_por uuid references public.perfis(id),
  criado_em timestamptz not null default now(),
  revogado_em timestamptz,
  revogado_por uuid references public.perfis(id)
);
create index if not exists silenciamentos_usuario on public.silenciamentos(usuario, tipo);
alter table public.silenciamentos enable row level security;

drop policy if exists sil_owner_ler on public.silenciamentos;
create policy sil_owner_ler on public.silenciamentos for select to authenticated using (public.eh_owner());
drop policy if exists sil_proprio on public.silenciamentos;
create policy sil_proprio on public.silenciamentos for select to authenticated using (usuario = auth.uid());
-- sem policy de insert/update/delete: só pelas funções abaixo (que gravam auditoria juntas)

create or replace function public.silenciado(uid uuid, p_tipo text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.silenciamentos s
                 where s.usuario = uid and s.tipo = p_tipo and s.revogado_em is null
                   and (s.ate is null or s.ate > now()));
$$;

-- Lista pública mínima (sem motivo) de quem está silenciado em voz/texto agora.
-- Os clientes usam para recusar a voz e esconder mensagens de silenciados.
create or replace function public.silenciados_ativos()
returns table (usuario uuid, tipo text, ate timestamptz)
language sql stable security definer set search_path = public as $$
  -- se houver um sem prazo, vale "até revogar" (ate = null)
  select s.usuario, s.tipo, case when bool_or(s.ate is null) then null else max(s.ate) end
  from public.silenciamentos s
  where s.tipo in ('voz','texto') and s.revogado_em is null and (s.ate is null or s.ate > now())
  group by s.usuario, s.tipo;
$$;

-- ---------------------------------------------------------------------
-- Texto: mensagem de quem está silenciado não entra no banco
-- ---------------------------------------------------------------------
create or replace function public.tg_mensagem_silencio()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.silenciado(auth.uid(), 'texto') and not public.eh_owner() then
    raise exception 'Você foi silenciado no chat pelo criador';
  end if;
  return new;
end $$;
drop trigger if exists validar_mensagem_silencio on public.mensagens;
create trigger validar_mensagem_silencio before insert on public.mensagens
for each row execute function public.tg_mensagem_silencio();

-- ---------------------------------------------------------------------
-- Pedidos de ajuda
-- ---------------------------------------------------------------------
create table if not exists public.pedidos_ajuda (
  id uuid primary key default gen_random_uuid(),
  usuario uuid not null references public.perfis(id) on delete cascade,
  sala text not null check (sala ~ '^(sala-principal|netmovies-[a-z0-9-]{1,80})$'),
  criado_em timestamptz not null default now(),
  status text not null default 'pendente' check (status in ('pendente','atendido','ignorado')),
  atendido_por uuid references public.perfis(id),
  atendido_em timestamptz
);
create index if not exists pedidos_ajuda_data on public.pedidos_ajuda(criado_em desc);
alter table public.pedidos_ajuda enable row level security;

drop policy if exists ajuda_criar on public.pedidos_ajuda;
create policy ajuda_criar on public.pedidos_ajuda for insert to authenticated
  with check (usuario = auth.uid() and status = 'pendente');
drop policy if exists ajuda_ler on public.pedidos_ajuda;
create policy ajuda_ler on public.pedidos_ajuda for select to authenticated
  using (usuario = auth.uid() or public.eh_owner());
-- atualização só pela função atender_pedido_ajuda()

create or replace function public.tg_pedido_ajuda()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.usuario := auth.uid();
  new.criado_em := now();
  new.status := 'pendente'; new.atendido_por := null; new.atendido_em := null;
  if new.usuario is null then raise exception 'não autenticado'; end if;
  if public.esta_banido(new.usuario) then raise exception 'Conta bloqueada'; end if;
  if public.silenciado(new.usuario, 'ajuda') then raise exception 'Seus pedidos de ajuda foram pausados pelo criador'; end if;
  if exists (select 1 from public.pedidos_ajuda where usuario = new.usuario and criado_em > now() - interval '2 minutes') then
    raise exception 'Aguarde 2 minutos para pedir ajuda de novo';
  end if;
  return new;
end $$;
drop trigger if exists pedido_ajuda on public.pedidos_ajuda;
create trigger pedido_ajuda before insert on public.pedidos_ajuda
for each row execute function public.tg_pedido_ajuda();

create or replace function public.atender_pedido_ajuda(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare v public.pedidos_ajuda;
begin
  if not public.eh_owner() then raise exception 'sem permissão'; end if;
  if p_status not in ('atendido','ignorado') then raise exception 'status inválido'; end if;
  update public.pedidos_ajuda set status = p_status, atendido_por = auth.uid(), atendido_em = now()
   where id = p_id returning * into v;
  if v.id is null then raise exception 'pedido não encontrado'; end if;
  insert into public.auditoria (ator, acao, tabela, registro, dados)
  values (auth.uid(), case when p_status = 'atendido' then 'AJUDA_TELETRANSPORTE' else 'AJUDA_IGNORADA' end,
          'pedidos_ajuda', v.id::text, jsonb_build_object('target_id', v.usuario, 'sala', v.sala));
end $$;

-- ---------------------------------------------------------------------
-- moderar(): uma porta só para todas as punições, com auditoria atômica
--   p_acao: expulsar | banir_temp | banir_perm | silenciar_voz | silenciar_texto | silenciar_ajuda
--   p_minutos: banir_temp → 10, 60, 1440 ou 10080; silenciar_* → null (até revogar) ou 1..43200
-- ---------------------------------------------------------------------
create or replace function public.moderar(p_alvo uuid, p_acao text, p_minutos int default null,
                                          p_motivo text default null, p_sala text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_ate timestamptz; v_id uuid; v_tabela text;
  v_motivo text := nullif(left(trim(coalesce(p_motivo, '')), 300), '');
  v_sala text := left(p_sala, 100);
begin
  if not public.eh_owner() then raise exception 'sem permissão'; end if;
  if p_alvo is null or p_alvo = auth.uid() then raise exception 'Você não pode moderar a própria conta'; end if;
  if public.eh_owner(p_alvo) then raise exception 'O criador não pode ser moderado'; end if;
  if not exists (select 1 from public.perfis where id = p_alvo) then raise exception 'usuário não encontrado'; end if;

  if p_acao = 'expulsar' then
    v_ate := now() + interval '10 minutes'; v_tabela := 'banimentos';
    insert into public.banimentos (usuario, tipo, motivo, ate, criado_por)
    values (p_alvo, 'temporario', coalesce(v_motivo, 'Expulso da sala pelo dono'), v_ate, auth.uid()) returning id into v_id;
  elsif p_acao = 'banir_temp' then
    if p_minutos is null or p_minutos not in (10, 60, 1440, 10080) then raise exception 'duração inválida'; end if;
    v_ate := now() + make_interval(mins => p_minutos); v_tabela := 'banimentos';
    insert into public.banimentos (usuario, tipo, motivo, ate, criado_por)
    values (p_alvo, 'temporario', coalesce(v_motivo, 'Banido temporariamente pelo criador'), v_ate, auth.uid()) returning id into v_id;
  elsif p_acao = 'banir_perm' then
    v_tabela := 'banimentos';
    insert into public.banimentos (usuario, tipo, motivo, ate, criado_por)
    values (p_alvo, 'permanente', coalesce(v_motivo, 'Banido permanentemente pelo criador'), null, auth.uid()) returning id into v_id;
  elsif p_acao in ('silenciar_voz', 'silenciar_texto', 'silenciar_ajuda') then
    if p_minutos is not null and (p_minutos < 1 or p_minutos > 43200) then raise exception 'duração inválida'; end if;
    v_ate := case when p_minutos is null then null else now() + make_interval(mins => p_minutos) end;
    v_tabela := 'silenciamentos';
    insert into public.silenciamentos (usuario, tipo, motivo, ate, criado_por)
    values (p_alvo, substr(p_acao, 11), v_motivo, v_ate, auth.uid()) returning id into v_id;
  else
    raise exception 'ação inválida';
  end if;

  insert into public.auditoria (ator, acao, tabela, registro, dados)
  values (auth.uid(), 'MODERAR_' || upper(p_acao), v_tabela, v_id::text,
          jsonb_build_object('target_id', p_alvo, 'sala', v_sala, 'motivo', v_motivo, 'ate', v_ate));
  return jsonb_build_object('id', v_id, 'acao', p_acao, 'ate', v_ate);
end $$;

-- revogar_moderacao(): desfaz ban ou silenciamento, com auditoria
create or replace function public.revogar_moderacao(p_tabela text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_alvo uuid;
begin
  if not public.eh_owner() then raise exception 'sem permissão'; end if;
  if p_tabela = 'banimentos' then
    update public.banimentos set revogado_em = now(), revogado_por = auth.uid()
     where id = p_id and revogado_em is null returning usuario into v_alvo;
  elsif p_tabela = 'silenciamentos' then
    update public.silenciamentos set revogado_em = now(), revogado_por = auth.uid()
     where id = p_id and revogado_em is null returning usuario into v_alvo;
  else raise exception 'tabela inválida'; end if;
  if v_alvo is null then raise exception 'registro não encontrado ou já revogado'; end if;
  insert into public.auditoria (ator, acao, tabela, registro, dados)
  values (auth.uid(), 'REVOGAR', p_tabela, p_id::text, jsonb_build_object('target_id', v_alvo));
end $$;

-- ---------------------------------------------------------------------
-- Permissões das funções
-- ---------------------------------------------------------------------
revoke execute on function public.moderar(uuid, text, int, text, text) from public, anon;
revoke execute on function public.revogar_moderacao(text, uuid) from public, anon;
revoke execute on function public.atender_pedido_ajuda(uuid, text) from public, anon;
revoke execute on function public.silenciados_ativos() from public, anon;
revoke execute on function public.silenciado(uuid, text) from public, anon;
grant execute on function public.moderar(uuid, text, int, text, text) to authenticated;
grant execute on function public.revogar_moderacao(text, uuid) to authenticated;
grant execute on function public.atender_pedido_ajuda(uuid, text) to authenticated;
grant execute on function public.silenciados_ativos() to authenticated;
grant execute on function public.silenciado(uuid, text) to authenticated;

-- Realtime: o owner recebe pedidos de ajuda na hora (o Realtime respeita a RLS acima)
do $$
begin
  begin execute 'alter publication supabase_realtime add table public.pedidos_ajuda'; exception when others then null; end;
end $$;

-- Limpeza: pedidos com mais de 1 dia somem (a tela só mostra os últimos 30 min)
create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'limpar-pedidos-ajuda';
select cron.schedule('limpar-pedidos-ajuda', '17 * * * *',
  $$delete from public.pedidos_ajuda where criado_em < now() - interval '1 day'$$);
