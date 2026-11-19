-- 009 — Moderadores (2026-11-19)
-- O criador (owner) pode nomear qualquer usuário como moderador pelo Painel → Usuários.
-- Moderador pode: silenciar voz/mensagens/pedidos de ajuda, expulsar, banir temporariamente,
-- desfazer as restrições que ele mesmo aplicou e atender pedidos de ajuda.
-- Moderador NÃO pode: banir permanentemente, moderar o criador ou outro moderador,
-- abrir o Painel do criador nem nomear moderadores.
-- Desfazer: 009_moderadores_down.sql

alter table public.perfis drop constraint if exists perfis_papel_check;
alter table public.perfis add constraint perfis_papel_check check (papel in ('espectador','moderador','owner'));

create or replace function public.eh_moderador(uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis where id = uid and papel in ('moderador','owner'));
$$;

-- só o criador nomeia ou remove moderadores
create or replace function public.definir_moderador(p_alvo uuid, p_ativo boolean)
returns text language plpgsql security definer set search_path = public as $$
declare v_papel text;
begin
  if not public.eh_owner() then raise exception 'sem permissão'; end if;
  select papel into v_papel from public.perfis where id = p_alvo;
  if v_papel is null then raise exception 'usuário não encontrado'; end if;
  if v_papel = 'owner' then raise exception 'O criador não muda de papel'; end if;
  update public.perfis set papel = case when p_ativo then 'moderador' else 'espectador' end where id = p_alvo;
  insert into public.auditoria (ator, acao, tabela, registro, dados)
  values (auth.uid(), case when p_ativo then 'MODERADOR_NOMEADO' else 'MODERADOR_REMOVIDO' end, 'perfis', p_alvo::text,
          jsonb_build_object('target_id', p_alvo));
  return case when p_ativo then 'moderador' else 'espectador' end;
end $$;

-- moderar(): agora aceita moderadores, com limites
create or replace function public.moderar(p_alvo uuid, p_acao text, p_minutos int default null,
                                          p_motivo text default null, p_sala text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_ate timestamptz; v_id uuid; v_tabela text;
  v_motivo text := nullif(left(trim(coalesce(p_motivo, '')), 300), '');
  v_sala text := left(p_sala, 100);
  v_owner boolean := public.eh_owner();
  v_quem text;
begin
  if not public.eh_moderador() then raise exception 'sem permissão'; end if;
  v_quem := case when v_owner then 'criador' else 'moderador' end;
  if p_alvo is null or p_alvo = auth.uid() then raise exception 'Você não pode moderar a própria conta'; end if;
  if public.eh_owner(p_alvo) then raise exception 'O criador não pode ser moderado'; end if;
  if not v_owner and public.eh_moderador(p_alvo) then raise exception 'Moderadores não podem moderar outro moderador'; end if;
  if not v_owner and p_acao = 'banir_perm' then raise exception 'Só o criador pode banir permanentemente'; end if;
  if not exists (select 1 from public.perfis where id = p_alvo) then raise exception 'usuário não encontrado'; end if;

  if p_acao = 'expulsar' then
    v_ate := now() + interval '10 minutes'; v_tabela := 'banimentos';
    insert into public.banimentos (usuario, tipo, motivo, ate, criado_por)
    values (p_alvo, 'temporario', coalesce(v_motivo, 'Expulso da sala pelo ' || v_quem), v_ate, auth.uid()) returning id into v_id;
  elsif p_acao = 'banir_temp' then
    if p_minutos is null or p_minutos not in (10, 60, 1440, 10080) then raise exception 'duração inválida'; end if;
    v_ate := now() + make_interval(mins => p_minutos); v_tabela := 'banimentos';
    insert into public.banimentos (usuario, tipo, motivo, ate, criado_por)
    values (p_alvo, 'temporario', coalesce(v_motivo, 'Banido temporariamente pelo ' || v_quem), v_ate, auth.uid()) returning id into v_id;
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
          jsonb_build_object('target_id', p_alvo, 'sala', v_sala, 'motivo', v_motivo, 'ate', v_ate, 'por', v_quem));
  return jsonb_build_object('id', v_id, 'acao', p_acao, 'ate', v_ate);
end $$;

-- revogar: criador desfaz qualquer uma; moderador só as que ele mesmo aplicou
create or replace function public.revogar_moderacao(p_tabela text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_alvo uuid; v_owner boolean := public.eh_owner();
begin
  if not public.eh_moderador() then raise exception 'sem permissão'; end if;
  if p_tabela = 'banimentos' then
    update public.banimentos set revogado_em = now(), revogado_por = auth.uid()
     where id = p_id and revogado_em is null and (v_owner or criado_por = auth.uid()) returning usuario into v_alvo;
  elsif p_tabela = 'silenciamentos' then
    update public.silenciamentos set revogado_em = now(), revogado_por = auth.uid()
     where id = p_id and revogado_em is null and (v_owner or criado_por = auth.uid()) returning usuario into v_alvo;
  else raise exception 'tabela inválida'; end if;
  if v_alvo is null then raise exception 'registro não encontrado, já revogado ou aplicado por outra pessoa'; end if;
  insert into public.auditoria (ator, acao, tabela, registro, dados)
  values (auth.uid(), 'REVOGAR', p_tabela, p_id::text, jsonb_build_object('target_id', v_alvo));
end $$;

create or replace function public.atender_pedido_ajuda(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare v public.pedidos_ajuda;
begin
  if not public.eh_moderador() then raise exception 'sem permissão'; end if;
  if p_status not in ('atendido','ignorado') then raise exception 'status inválido'; end if;
  update public.pedidos_ajuda set status = p_status, atendido_por = auth.uid(), atendido_em = now()
   where id = p_id returning * into v;
  if v.id is null then raise exception 'pedido não encontrado'; end if;
  insert into public.auditoria (ator, acao, tabela, registro, dados)
  values (auth.uid(), case when p_status = 'atendido' then 'AJUDA_TELETRANSPORTE' else 'AJUDA_IGNORADA' end,
          'pedidos_ajuda', v.id::text, jsonb_build_object('target_id', v.usuario, 'sala', v.sala));
end $$;

-- leitura: moderadores veem silenciamentos e pedidos de ajuda (para o menu e os avisos)
drop policy if exists sil_owner_ler on public.silenciamentos;
create policy sil_owner_ler on public.silenciamentos for select to authenticated using (public.eh_moderador());
drop policy if exists ajuda_ler on public.pedidos_ajuda;
create policy ajuda_ler on public.pedidos_ajuda for select to authenticated
  using (usuario = auth.uid() or public.eh_moderador());

-- registrar_acesso devolve também se a pessoa é moderadora
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
    'moderador', public.eh_moderador(v_uid) and not public.eh_owner(v_uid),
    'agora', now());
end $$;

revoke execute on function public.definir_moderador(uuid, boolean) from public, anon;
grant execute on function public.definir_moderador(uuid, boolean) to authenticated;
revoke execute on function public.eh_moderador(uuid) from anon;
grant execute on function public.eh_moderador(uuid) to authenticated;
