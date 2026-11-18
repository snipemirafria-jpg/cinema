# CineOnline — Salas temáticas 3D + correção do VR (2026-11-17)

## Novo
- **Salas temáticas por gênero** (`js/temas-sala.js`, `js/temas-decoracao.js`, `js/temas-texturas.js`): a sala muda sozinha conforme o gênero do filme (Terror, Ação, Ficção científica, Romance, Comédia, Animação/Família, Aventura, Fantasia, Drama, Documentário, Suspense, Policial, Guerra). Filme sem gênero = sala original.
- Mantém a identidade: mesma arquitetura, telão na mesma posição, mesmas poltronas, cortinas e logo CineOnline (nunca removida).
- Muda de verdade em 3D: cores e texturas de paredes, painéis, piso e degraus; cor do tecido das poltronas (shader que preserva o relevo); iluminação (ambiente, pontuais, neons e efeitos como sirene, tremor de vela, arco-íris); decoração 3D por gênero (candelabros, teias e névoa no terror; caixotes, treliça e fachos na ação; colmeias e anéis holográficos na ficção; lustres e rosas no romance; balões e bandeirinhas na comédia; tochas e baús na aventura; cristais e estandartes na fantasia; máscaras e abajures no drama; e mais).
- Filmes com 2 ou 3 gêneros: cores misturadas e decoração combinada (principal + secundário).
- Transição suave (as luzes baixam e voltam) sem reconstruir a sala; decoração criada só uma vez e reaproveitada.
- Botão ✨ Gráficos no menu da sala: Auto, Alta, Média, Leve. Celulares fracos entram no modo leve automaticamente e o sistema baixa a qualidade sozinho se o FPS cair.
- VR (Cardboard/VR Box) usa a mesma cena, então o tema é idêntico no modo normal e no VR.

## Corrigido
- **VR: as duas telas (olho esquerdo e direito) fora de sincronia.** Sincronização refeita: checagem a cada 200 ms, correção por velocidade de reprodução em vez de saltos constantes, compensação de latência aprendida e pausa/play espelhados.

## Arquivos
- Novos: js/temas-sala.js, js/temas-decoracao.js, js/temas-texturas.js, tests/teste-temas.html
- Alterados: js/cinema3d.js, js/main.js, js/fontes.js, integrations/vr/vr.js, sw.js (cache v5)


## 2026-11-18
- Modo VR removido por completo (integrations/vr, testes de VR e vídeos 360°).

## 2026-11-18 — Modo VR refeito (js/vr.js)
- Mesma cena, mesmo loop (setAnimationLoop da sala), mesmo player e mesma textura do telão; nada da sala é clonado.
- WebXR (headset): renderer.xr do Three.js r170, sessão immersive-vr com referência 'local'; a câmera vai num suporte na poltrona; recentralizar pelo botão de apertar (squeeze) do controle; sair pelo headset volta ao modo normal.
- Cardboard (celular): sistema separado; StereoCamera (perspectiva por olho, IPD ajustável 50–75 mm), lente em barril opcional, giroscópio (só rotação, 3DoF) com permissão pedida no toque (iPhone); sem sensor/permissão: olhar arrastando o dedo.
- Controles discretos que somem em 4 s: centralizar, telão perto/longe, maior/menor, olhos, lente, sair. Qualidade baixa/média/alta + redução automática se ficar abaixo de ~24 fps.
- Estados: NORMAL, VR_CHECKING, VR_WEBXR, VR_CARDBOARD, VR_EXITING, VR_ERROR; toques duplos ignorados; ao sair tudo é restaurado sem recarregar.
- YouTube, Drive (player do Drive), Internet Archive e sites em iframe não podem virar textura WebGL: no VR o telão mostra um aviso e o som continua.
- Testado (navegador Chromium simulando celular deitado 844x390): menu mostra só o Cardboard quando não há headset; 10 entradas/saídas seguidas sem listeners sobrando nem erros; vídeo MP4/WebM aparece nos dois olhos; aviso do YouTube; modo normal restaurado. NÃO testado em headset WebXR real, em óculos Cardboard real nem em iPhone real.

## 2026-11-18 — VR: YouTube nos dois olhos + controle Bluetooth
- Cardboard + YouTube: o player original (com som) fica sobre o telão do olho esquerdo; uma cópia muda fica sobre o do olho direito. Cada um é projetado com a câmera do seu olho e a mesma lente (homografia em matrix3d), seguindo cabeça, tamanho e distância do telão.
- Sincronia do olho direito: segue o tempo do esquerdo; acima de 0,5 s pula direto, entre 30 ms e 0,5 s acelera/freia (1,25×/0,75×) até ficar abaixo de 10 ms. Pausa junto, espera durante anúncio do olho esquerdo.
- No WebXR (headset) o YouTube continua só com som. Drive (player do Drive), Archive e sites continuam com aviso.
- Controle Bluetooth (VR Box): Gamepad API (joystick/D-pad, botões) e teclas (setas, Enter, Esc, mídia). Joystick escolhe o botão da barra, A aperta, B esconde, cima centraliza. Barra duplicada, uma por olho.
- Teste em Chromium com YouTube simulado: alinhamento com a moldura do telão conferido em imagem; diferença entre olhos ~10 ms; navegação por teclado. NÃO testado com YouTube real (bloqueado no ambiente), VR Box real nem controle real.
