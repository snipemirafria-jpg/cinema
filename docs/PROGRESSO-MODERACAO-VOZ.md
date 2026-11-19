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

- Passo 2a (FEITO): `js/voz.js` — GerenciadorVoz (único por página) + TransporteP2P (WebRTC malha, só áudio,
  sinalização/presença no canal Realtime `voz-<sala>`, STUN Google, máx. 8, backoff limitado, ICE restart 2x,
  silenciamento do criador via `silenciados_ativos()`, indicador de fala por AnalyserNode a cada 200 ms, `diagnostico()`).
  Ainda NÃO ligado à interface.

- Passo 2b/3 (FEITO): interface ligada.
  - `js/voz-ui.js`: botão 🎙️ no topo + gaveta (Entrar, Meu microfone, Ouvir vozes, Mensagens, Sair, volumes conversa/filme, lista com fala/mic/rede).
  - `js/moderacao.js`: canal global `cine-global` (presença leve p/ aba Câmeras + aviso `moderacao`), botão 🆘 Ajuda no menu lateral,
    menu do criador no nome/avatar (expulsar, ban 10min/1h/24h/7d, permanente com confirmação vermelha, silenciar voz/texto/ajuda, desfazer),
    notificações de pedidos de ajuda com "Ir para a sala"/"Ignorar"/"Pausar 1 h".
  - `js/main.js` (integração mínima), `js/cinema3d.js` (clique no nome passa o evento), `js/player.js` + `js/fontes.js` (volume do filme),
    `css/app.css` (estilos novos + esconder no VR), `sw.js` cine-v19.

## Falta (ordem)
2. `js/voz.js` (VoiceManager + transporte P2P Supabase) e UI de voz em `index.html`/`css/app.css`/`js/main.js`.
3. `js/moderacao.js`: menu do criador no avatar/nome, mutes, Pedir ajuda, notificações ao criador.
4. `js/admin.js`: abas Moderação (bans/mutes ativos + revogar), Pedidos de ajuda, Câmeras das Salas.
5. `sw.js` cine-v18 → cine-v19.
6. Testes Playwright com Supabase simulado.

## Publicado
- Nada em `main`. Nada de deploy. Nada aplicado no banco real.
