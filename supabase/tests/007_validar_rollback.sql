-- Validação da 007 dentro de uma transação que termina em ROLLBACK (não altera dados reais).
-- Uso: BEGIN; <007_moderacao_voz_ajuda.sql>; <este arquivo>; ROLLBACK;
-- :OWNER e :USER são substituídos por ids reais de perfis (owner e espectador) pelo script de teste.
create temp table _r(n serial, teste text, ok boolean, detalhe text);
grant all on _r to authenticated; grant usage on sequence _r_n_seq to authenticated;
create or replace function pg_temp.como(uid uuid) returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  execute 'set local role authenticated';
end $$;

do $$
declare u uuid := ':USER'; o uuid := ':OWNER'; n int; r jsonb; pid uuid; bid uuid;
begin
  -- espectador não usa funções administrativas
  perform pg_temp.como(u);
  begin perform public.moderar(o, 'banir_perm'); insert into _r(teste,ok) values ('user moderar owner bloqueado', false);
  exception when others then insert into _r(teste,ok,detalhe) values ('user moderar owner bloqueado', sqlerrm = 'sem permissão', sqlerrm); end;
  begin perform public.moderar(u, 'silenciar_voz'); insert into _r(teste,ok) values ('user moderar bloqueado', false);
  exception when others then insert into _r(teste,ok,detalhe) values ('user moderar bloqueado', true, sqlerrm); end;
  begin insert into public.silenciamentos(usuario,tipo) values (u,'voz'); insert into _r(teste,ok) values ('user insert silenciamentos bloqueado', false);
  exception when others then insert into _r(teste,ok,detalhe) values ('user insert silenciamentos bloqueado', true, sqlerrm); end;
  begin insert into public.banimentos(usuario,tipo,motivo) values (u,'permanente','x'); insert into _r(teste,ok) values ('user insert banimentos bloqueado', false);
  exception when others then insert into _r(teste,ok,detalhe) values ('user insert banimentos bloqueado', true, sqlerrm); end;
  select count(*) into n from public.auditoria; insert into _r(teste,ok,detalhe) values ('user não lê auditoria', n = 0, n::text);
  begin perform public.revogar_moderacao('banimentos', gen_random_uuid()); insert into _r(teste,ok) values ('user revogar bloqueado', false);
  exception when others then insert into _r(teste,ok,detalhe) values ('user revogar bloqueado', sqlerrm = 'sem permissão', sqlerrm); end;

  -- owner
  perform pg_temp.como(o);
  begin perform public.moderar(o, 'silenciar_voz'); insert into _r(teste,ok) values ('owner não modera a si', false);
  exception when others then insert into _r(teste,ok,detalhe) values ('owner não modera a si', true, sqlerrm); end;
  begin perform public.moderar(u, 'banir_temp', 15); insert into _r(teste,ok) values ('duração inválida recusada', false);
  exception when others then insert into _r(teste,ok,detalhe) values ('duração inválida recusada', true, sqlerrm); end;
  r := public.moderar(u, 'silenciar_texto', 10, 'teste', 'sala-principal');
  select count(*) into n from public.auditoria where acao = 'MODERAR_SILENCIAR_TEXTO' and registro = r->>'id' and dados->>'target_id' = u::text and dados->>'sala' = 'sala-principal';
  insert into _r(teste,ok,detalhe) values ('owner silencia texto + auditoria', n = 1, r::text);

  -- espectador silenciado não manda mensagem
  perform pg_temp.como(u);
  begin insert into public.mensagens(usuario, texto) values (u, 'oi'); insert into _r(teste,ok) values ('texto silenciado recusado no banco', false);
  exception when others then insert into _r(teste,ok,detalhe) values ('texto silenciado recusado no banco', sqlerrm like '%silenciado%', sqlerrm); end;
  select count(*) into n from public.silenciados_ativos() s where s.usuario = u and s.tipo = 'texto';
  insert into _r(teste,ok,detalhe) values ('silenciados_ativos mostra o mute', n = 1, n::text);
  select count(*) into n from public.silenciamentos; insert into _r(teste,ok,detalhe) values ('user vê só os próprios silenciamentos', n >= 1 and not exists (select 1 from public.silenciamentos where usuario <> u), n::text);

  -- pedido de ajuda + cooldown
  begin insert into public.pedidos_ajuda(usuario, sala) values (u, 'sala-x; drop'); insert into _r(teste,ok) values ('sala inválida recusada', false);
  exception when others then insert into _r(teste,ok,detalhe) values ('sala inválida recusada', true, sqlerrm); end;
  insert into public.pedidos_ajuda(usuario, sala) values (u, 'netmovies-teste-1') returning id into pid;
  insert into _r(teste,ok,detalhe) values ('pedido de ajuda criado', pid is not null, pid::text);
  begin insert into public.pedidos_ajuda(usuario, sala) values (u, 'sala-principal'); insert into _r(teste,ok) values ('cooldown 2 min', false);
  exception when others then insert into _r(teste,ok,detalhe) values ('cooldown 2 min', sqlerrm like '%2 minutos%', sqlerrm); end;
  update public.pedidos_ajuda set status = 'atendido' where id = pid; get diagnostics n = row_count;
  insert into _r(teste,ok,detalhe) values ('user não atualiza pedido', n = 0, n::text);
  begin perform public.atender_pedido_ajuda(pid, 'atendido'); insert into _r(teste,ok) values ('user não atende pedido', false);
  exception when others then insert into _r(teste,ok,detalhe) values ('user não atende pedido', true, sqlerrm); end;

  -- owner atende, bane, revoga
  perform pg_temp.como(o);
  select count(*) into n from public.pedidos_ajuda where id = pid; insert into _r(teste,ok,detalhe) values ('owner lê pedido', n = 1, n::text);
  perform public.atender_pedido_ajuda(pid, 'atendido');
  select count(*) into n from public.auditoria where acao = 'AJUDA_TELETRANSPORTE' and registro = pid::text; insert into _r(teste,ok,detalhe) values ('atender audita', n = 1, n::text);
  r := public.moderar(u, 'banir_temp', 60, null, 'sala-principal'); bid := (r->>'id')::uuid;
  insert into _r(teste,ok,detalhe) values ('ban temporário ativo', public.esta_banido(u), r::text);
  perform public.revogar_moderacao('banimentos', bid);
  insert into _r(teste,ok,detalhe) values ('revogar desfaz ban', not public.esta_banido(u) or exists (select 1 from public.ban_ativo(u) b where b.id <> bid), '');
  r := public.moderar(u, 'banir_perm', null, 'teste perm');
  insert into _r(teste,ok,detalhe) values ('ban permanente ativo', exists (select 1 from public.ban_ativo(u) where tipo = 'permanente'), r::text);
  r := public.moderar(u, 'expulsar');
  insert into _r(teste,ok,detalhe) values ('expulsar = ban 10 min', (r->>'ate')::timestamptz between now() + interval '9 minutes' and now() + interval '11 minutes', r::text);
  execute 'reset role';
end $$;
select n, teste, ok, detalhe from _r order by n;
