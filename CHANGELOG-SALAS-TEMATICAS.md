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
