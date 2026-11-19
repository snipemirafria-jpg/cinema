# Progresso: Moderação, Pedir ajuda, Câmeras das Salas e Voz por sala

Branch: `moderacao-voz` (NADA vai para `main`, NADA de deploy, NADA aplicado no banco real).

## Feito
- Passo 0: leitura das especificações e inspeção do schema real (somente leitura).
  - Confirmado no banco real: `eh_owner(uid)`, `ban_ativo`, `esta_banido`, `banimentos` (RLS `ban_owner`, `ban_proprio`),
    `mensagens` (trigger `validar_mensagem` → `tg_validar_mensagem`, policy `msg_criar` with check true),
    `auditoria` (policy `auditoria_owner` select), job pg_cron `apagar-chat-1min`.
  - Observação: o banco real não lista triggers públicos via pg_trigger na consulta feita (talvez permissões da API); as funções existem.

## Falta (ordem)
1. Migration `supabase/migrations/007_moderacao_voz_ajuda.sql` + `007_moderacao_voz_ajuda_down.sql`, validar com ROLLBACK.
2. `js/voz.js` (VoiceManager + transporte P2P Supabase) e UI de voz em `index.html`/`css/app.css`/`js/main.js`.
3. `js/moderacao.js`: menu do criador no avatar/nome, mutes, Pedir ajuda, notificações ao criador.
4. `js/admin.js`: abas Moderação (bans/mutes ativos + revogar), Pedidos de ajuda, Câmeras das Salas.
5. `sw.js` cine-v18 → cine-v19.
6. Testes Playwright com Supabase simulado.

## Publicado
- Nada em `main`. Nada de deploy. Nada aplicado no banco real.
