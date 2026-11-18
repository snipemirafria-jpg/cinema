# CineOnline VR

Módulo independente com dois modos:
- **Cinema VR**: é a PRÓPRIA sala do CineOnline (mesma cena, mesmo renderer, mesmo telão, mesmos personagens e luzes). O canvas da sala entra na tela do VR e volta para o lugar ao sair. A câmera fica nos olhos do seu personagem, na poltrona dele, de frente para o telão; só a câmera e o desenho em tela dividida mudam. O filme é o da sessão (vídeo direto, YouTube, Drive ou página). Também dá para abrir um vídeo do celular ou um link no telão da sala. A cabeça olha para todos os lados (frente, trás, teto, chão). Botão 2D/3D para filmes 3D lado a lado ou em cima/embaixo.
- **Vídeos 360°**: esfera panorâmica (equirretangular 2:1, ou 3D 360° 1:1 em cima/embaixo e 4:1 lado a lado). Vídeos comuns são recusados no modo 360°.

## Como usar
1. Entre na sala e toque em **🥽 VR** no menu lateral.
2. A tela "CINEONLINE VR" mostra o que o aparelho tem (WebXR, giroscópio, HTTPS).
3. Escolha **CINEMA VR** ou **VÍDEOS 360°** e depois o vídeo: filme da sessão agora, vídeo do celular ou um link (.mp4, .webm, .m3u8).
4. Com "Usar óculos" marcado, a tela é dividida em duas (VR Box / Cardboard), fica em tela cheia e deitada.
5. Toque na tela para mostrar os controles: ⏪ ▶/⏸ ⏩, 🔴 Ao vivo (volta ao ponto da sessão), volume, 👀 separação entre os olhos, 🔍 escala, ◎ correção das lentes, 🥽 liga/desliga a tela dividida, 📱 Ativar movimento VR (iPhone/iPad), 🎯 centralizar, XR (quando houver WebXR) e ✕ Sair.
6. iPhone/iPad (inclusive iPad que aparece como Mac): toque em **📱 Ativar movimento VR** (tela inicial ou controles), em CINEMA VR / VÍDEOS 360° ou na tela. A permissão é pedida uma vez só, direto no toque. Se for negada, aparece como liberar. Precisa de HTTPS.
7. Sem giroscópio: arraste o dedo para olhar em volta. Teclado no computador: espaço, ← →, Esc. Girar o celular (em pé/deitado) recalibra a frente.

## Desligar
`VR_ENABLED = false` em `integrations/vr/config.js`, ou apague a linha `<script ... integrations/vr/index.js>` do `index.html`.

## Como cada filme aparece no telão
- Filme da sessão em vídeo direto (MP4, WebM, HLS, DASH, upload): é a própria imagem do telão da sala, com correção das lentes.
- Cinema VR em tela dividida: a cena 3D é renderizada uma única vez e o mesmo quadro é copiado para as duas metades. YouTube/Drive/iframes usam uma única instância de player; por serem conteúdo externo, o navegador não permite capturar o quadro interno para duplicá-lo como textura, então esse player único ocupa a visualização inteira.
- Vídeo do celular ou link: vira a imagem do telão da sala enquanto o VR estiver aberto (o filme da sessão fica mudo e volta ao sair).
- Pausar e avançar valem só para você (a sincronia da sessão fica em pausa); 🔴 Ao vivo volta ao ponto da sessão. Ao sair, a sincronia volta.

## Limitações
- Nos players de site (YouTube, Drive, páginas) a correção de lente fica desligada para o telão não sair do lugar, e o botão WebXR some (o WebXR não mostra players de outros sites).
- Páginas externas e o Drive em modo "pré-visualização" não expõem controle confiável de tempo. Nesses casos, não é tecnicamente possível garantir sincronismo quadro a quadro entre duas instâncias independentes; o VR avisa sobre essa limitação. Para sincronismo mais preciso, use MP4/WebM/HLS direto ou um player que exponha o tempo de reprodução.
- O Cinema VR precisa da sala aberta (window.CineOnline.cinema). Fora dela, use o modo 360°.
- O modo Vídeos 360° continua aceitando só vídeos 360° de verdade (arquivo de vídeo 2:1, ou 3D 1:1 / 4:1).
- A cena 3D usa um único render e duplica exatamente o mesmo quadro nos dois lados, sem diferença de tempo entre olhos. YouTube/Drive/iframes também usam somente um player; por restrição de segurança do navegador, o conteúdo interno de iframes de outros domínios não pode ser copiado para uma textura WebGL. No VR, pausar/avançar é só para você; "🔴 Ao vivo" volta ao ponto da sessão.
- iPhone: o giroscópio pede permissão (botão 📱 ou toque na tela). Tela cheia e tela deitada dependem do navegador.

## Teste
`tests/teste-vr-sala.html` abre a sala real (js/cinema3d.js + js/player.js, Supabase simulado) e o Cinema VR; `?modo=livre` toca o filme da sessão num player HTML sobre o telão.
`tests/teste-vr.html?filme=filme.webm` abre o módulo fora do app (modo 360°) com vídeos de teste (`filme.webm`, `filme_2x1.webm` — filme comum 2:1 que NÃO é 360°, `video360.webm`, `video360_TB.webm`).
