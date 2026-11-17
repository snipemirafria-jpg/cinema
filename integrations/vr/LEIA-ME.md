# CineOnline VR

Módulo independente com dois modos:
- **Cinema VR**: sala de cinema em primeira pessoa (paredes, teto com sanca de luz, chão, poltronas, arandelas, porta de saída e cabine de projeção atrás). Aceita QUALQUER filme que o CineOnline toca: MP4/WebM/HLS/DASH, uploads, Internet Archive, YouTube, Google Drive e páginas. O filme fica plano no telão fixo da sala; a cabeça olha para todos os lados (frente, trás, teto, chão). Botão 2D/3D só para quem tiver filme 3D lado a lado ou em cima/embaixo.
- **Vídeos 360°**: esfera panorâmica (equirretangular 2:1, ou 3D 360° 1:1 em cima/embaixo e 4:1 lado a lado). Vídeos comuns são recusados no modo 360°.

## Como usar
1. Entre na sala e toque em **🥽 VR** no menu lateral.
2. A tela "CINEONLINE VR" mostra o que o aparelho tem (WebXR, giroscópio, HTTPS).
3. Escolha **CINEMA VR** ou **VÍDEOS 360°** e depois o vídeo: filme da sessão agora, vídeo do celular ou um link (.mp4, .webm, .m3u8).
4. Com "Usar óculos" marcado, a tela é dividida em duas (VR Box / Cardboard), fica em tela cheia e deitada.
5. Toque na tela para mostrar os controles: ⏪ ▶/⏸ ⏩, 🔴 Ao vivo (volta ao ponto da sessão), volume, 📐 tamanho da tela, ↔ distância, 👀 separação entre os olhos, 🔍 escala, ◎ correção das lentes, 🥽 liga/desliga a tela dividida, 🎯 centralizar, XR (quando houver WebXR) e ✕ Sair.
6. Sem giroscópio: arraste o dedo para olhar em volta. Teclado no computador: espaço, ← →, Esc.

## Desligar
`VR_ENABLED = false` em `integrations/vr/config.js`, ou apague a linha `<script ... integrations/vr/index.js>` do `index.html`.

## Como cada filme aparece no telão
- Vídeo direto (MP4, WebM, HLS, DASH, upload, Internet Archive): vira imagem do próprio telão 3D, com correção das lentes.
- YouTube, Google Drive, MP4 de site sem CORS e páginas: o player do site é posto sobre o telão em 3D. Na tela dividida há um player para cada olho; o da esquerda tem o som e o da direita acompanha o mesmo tempo.

## Limitações
- Nos players de site (YouTube, Drive, páginas) a correção de lente fica desligada para o telão não sair do lugar, e o botão WebXR some (o WebXR não mostra players de outros sites).
- Páginas externas e o Drive em modo "pré-visualização" não deixam controlar o tempo: dá play tocando no telão, e na tela dividida os dois lados podem ficar um pouco fora de sincronia.
- O modo Vídeos 360° continua aceitando só vídeos 360° de verdade (arquivo de vídeo 2:1, ou 3D 1:1 / 4:1).
- No VR, pausar/avançar é só para você; "🔴 Ao vivo" volta ao ponto da sessão.
- iPhone: o giroscópio pede permissão (toque na tela). Tela cheia e tela deitada dependem do navegador.

## Teste
`tests/teste-vr.html?filme=filme.webm` abre o módulo fora do app com vídeos de teste (`filme.webm`, `filme_2x1.webm` — filme comum 2:1 que NÃO é 360°, `video360.webm`, `video360_TB.webm`).
