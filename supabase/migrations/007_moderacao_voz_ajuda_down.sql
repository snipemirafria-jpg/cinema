-- DOWN de 007_moderacao_voz_ajuda.sql (desfaz tudo que a 007 criou).
-- Não mexe em public.banimentos nem em public.auditoria (já existiam antes).
select cron.unschedule(jobid) from cron.job where jobname = 'limpar-pedidos-ajuda';
do $$ begin
  begin execute 'alter publication supabase_realtime drop table public.pedidos_ajuda'; exception when others then null; end;
end $$;
drop trigger if exists validar_mensagem_silencio on public.mensagens;
drop function if exists public.tg_mensagem_silencio();
drop function if exists public.moderar(uuid, text, int, text, text);
drop function if exists public.revogar_moderacao(text, uuid);
drop function if exists public.atender_pedido_ajuda(uuid, text);
drop function if exists public.silenciados_ativos();
drop table if exists public.pedidos_ajuda;           -- leva junto trigger pedido_ajuda e policies
drop function if exists public.tg_pedido_ajuda();
drop table if exists public.silenciamentos;
drop function if exists public.silenciado(uuid, text);
