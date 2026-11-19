-- Desfaz 009: volta todos os moderadores a espectador e restaura as funções da 007/001.
update public.perfis set papel = 'espectador' where papel = 'moderador';
alter table public.perfis drop constraint if exists perfis_papel_check;
alter table public.perfis add constraint perfis_papel_check check (papel in ('espectador','owner'));
drop function if exists public.definir_moderador(uuid, boolean);
drop policy if exists sil_owner_ler on public.silenciamentos;
create policy sil_owner_ler on public.silenciamentos for select to authenticated using (public.eh_owner());
drop policy if exists ajuda_ler on public.pedidos_ajuda;
create policy ajuda_ler on public.pedidos_ajuda for select to authenticated using (usuario = auth.uid() or public.eh_owner());
-- depois rode de novo as definições de moderar/revogar_moderacao/atender_pedido_ajuda (007)
-- e registrar_acesso (001); eh_moderador() pode ficar (sem uso) ou ser removida por último.
