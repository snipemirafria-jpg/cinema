# NetMovies — módulo opcional

Seção independente "NetMovies — Filmes gratuitos" (em **Outras salas** na Sala Principal).

- `config.js` — `NETMOVIES_ENABLED = true/false` liga ou desliga a seção.
- `index.js` — cria o botão e o painel; não mexe em Supabase, login, avatares, cinema 3D nem sessão sincronizada.
- `netmovies-catalog.js` — Web Component isolado (Shadow DOM): capas, títulos, gêneros, duração, busca, filtro e player oficial incorporado (youtube-nocookie).
- Salas por filme (`js/sala-filme.js`): "Assistir" abre `sessao.html?netmovies=<id>`, uma sala 3D só daquele filme. Quem abrir o mesmo filme entra junto, no mesmo ponto. Sala vazia = o filme começa do início para quem entrar. Chat da sala é ao vivo e não fica salvo. Usa só canais de tempo real (sem tabelas novas no Supabase).
- `catalogo-netmovies.json` — catálogo (10 filmes do canal oficial NetMovies).

Remover de vez: apague a linha `integrations/netmovies/index.js` do `index.html` e a pasta.

Observações: "Spartacus" (incorporação bloqueada pelo dono) e "Deu Zebra!" (vídeo indisponível) foram retirados do catálogo original.
Duração e gêneros são dados editoriais; confira na página de cada vídeo. Anúncios e disponibilidade dependem do YouTube.
