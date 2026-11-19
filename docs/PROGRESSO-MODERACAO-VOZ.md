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

- Passo 4 (FEITO, 5365b31): painel do criador com abas Moderação (ativos + revogar), Pedidos de ajuda e Câmeras das Salas.
- Passo 5 (FEITO): `docs/VOZ.md` (limites da conexão direta e como trocar para LiveKit).
- Passo 6 (FEITO, testes no navegador simulado, Chromium headless):
  - `tests/teste-voz.html` + `tests/mock-supa-voz.js`: 17/17 OK — entra com mic desligado; sala A só vê A; sala B isolada;
    mic liga no toque; conexão WebRTC real entre duas abas e faixa de áudio recebida; mic ligado aparece na lista;
    sala B não recebe nada da A; Ouvir vozes e Mensagens só locais; trocar de sala fecha o canal anterior (1 canal aberto);
    Sair libera mic e conexões; entrar/sair 5x sem canal sobrando; permissão negada mostra aviso e continua ouvindo.
  - `tests/teste-admin.html` + `tests/mock-supa-admin.js`: 7/7 OK — painel abre; Moderação lista ativos; Revogar chama
    `revogar_moderacao`; Pedidos de ajuda lista e Ignorar chama `atender_pedido_ajuda`; Câmeras desenha 2 salas; sem erros.
  - `tests/teste-modulos.html`: voz.js, voz-ui.js, moderacao.js e vr.js carregam sem erro. index.html e teste-sala.html sem erros.
  - Corrigido: admin.js lançava erro sem sessão antes do redirecionamento (agora para ali).

## Falta (ordem)
1. Testar dentro da sala logada (menu do criador no avatar, botão 🆘, aviso ao criador, entrar/sair do VR com a gaveta de voz)
   — precisa de login real ou de um simulador maior do Supabase.
2. **Com liberação do Victor:** aplicar `007_moderacao_voz_ajuda.sql` no SQL Editor do Supabase.
3. **Com liberação do Victor:** juntar `moderacao-voz` no `main` (publica o site).
4. Teste com 2–3 celulares em redes diferentes (Wi-Fi e 4G).

## Publicado
- Nada em `main`. Nada de deploy. Nada aplicado no banco real. Só o ramo `moderacao-voz` no GitHub.
