# Progresso: Moderação, Pedir ajuda, Câmeras das Salas e Voz por sala

Branch: `moderacao-voz` (NADA vai para `main`, NADA de deploy, NADA aplicado no banco real).

## Feito
- Passo 0: leitura das especificações e inspeção do schema real (somente leitura).
  - Confirmado no banco real: `eh_owner(uid)`, `ban_ativo`, `esta_banido`, `banimentos` (RLS `ban_owner`, `ban_proprio`),
    `mensagens` (trigger `validar_mensagem` → `tg_validar_mensagem`, policy `msg_criar` with check true),
    `auditoria` (policy `auditoria_owner` select), job pg_cron `apagar-chat-1min`.
  - Observação: o banco real não lista triggers públicos via pg_trigger na consulta feita (talvez permissões da API); as funções existem.

- Passo 1 (FEITO): migration `supabase/migrations/007_moderacao_voz_ajuda.sql` e DOWN `007_moderacao_voz_ajuda_down.sql`.
  - Cria `silenciamentos` (voz|texto|ajuda), `pedidos_ajuda`, funções `moderar()`, `revogar_moderacao()`,
    `atender_pedido_ajuda()`, `silenciado()`, `silenciados_ativos()`, triggers `validar_mensagem_silencio` (mensagens)
    e `pedido_ajuda` (cooldown 2 min), cron `limpar-pedidos-ajuda`, pedidos_ajuda no Realtime.
  - Validada no banco real DENTRO de BEGIN…ROLLBACK com `supabase/tests/007_validar_rollback.sql`: 23/23 OK.
    DOWN também testado em transação com ROLLBACK (remove tudo). Conferido depois: o banco real NÃO tem as tabelas novas.

## Falta (ordem)
2. `js/voz.js` (VoiceManager + transporte P2P Supabase) e UI de voz em `index.html`/`css/app.css`/`js/main.js`.
3. `js/moderacao.js`: menu do criador no avatar/nome, mutes, Pedir ajuda, notificações ao criador.
4. `js/admin.js`: abas Moderação (bans/mutes ativos + revogar), Pedidos de ajuda, Câmeras das Salas.
5. `sw.js` cine-v18 → cine-v19.
6. Testes Playwright com Supabase simulado.

## Publicado
- Nada em `main`. Nada de deploy. Nada aplicado no banco real.
