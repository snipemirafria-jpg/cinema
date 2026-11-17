# CineOnline VR

Módulo independente com dois modos:
- **Cinema VR**: sala de cinema escura com poltronas, arandelas, luz do telão e telão gigante. Filme comum (2D) ou 3D lado a lado / em cima-embaixo (uma imagem para cada olho).
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

## Limitações
- Filmes do YouTube, Internet Archive, Google Drive e páginas externas não entram no VR: esses players não deixam a imagem ser usada em 3D. Funcionam MP4/WebM/HLS com CORS, uploads do Supabase e vídeos do próprio celular.
- No VR, pausar/avançar é só para você; "🔴 Ao vivo" volta ao ponto da sessão. A sala continua sincronizada para os outros.
- iPhone: o giroscópio pede permissão (toque na tela). Travar a tela deitada e tela cheia dependem do navegador.
- WebXR só aparece em navegadores que suportam (Chrome Android com ARCore/Cardboard) e exige HTTPS.

## Teste
`tests/teste-vr.html?filme=filme.webm` abre o módulo fora do app com vídeos de teste (`filme.webm`, `video360.webm`, `video360_TB.webm`).
