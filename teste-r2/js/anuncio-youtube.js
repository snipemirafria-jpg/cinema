// Amplia o iframe onde ele já está. Removê-lo da árvore reinicia o player.
export function controlesAnuncio(cinema, player, { botao, aviso, barra }) {
  let camada = null;
  const fechar = barra.querySelector('button');
  function alternar(abrir) {
    const caixa = cinema.objTela?.element;
    if (abrir) {
      if (player.modo !== 'youtube' || !caixa) return;
      if (!caixa.isConnected) cinema.css3d.render(cinema.cenaHtml, cinema.camera);
      camada = caixa.closest('.camada-tela, .camada-tela-plana');
      if (!camada) return;
      camada.classList.add('youtube-ampliado');
    } else {
      camada?.classList.remove('youtube-ampliado');
      camada = null;
    }
    player.controlesYouTube = abrir;
    cinema.anuncioAmpliado = abrir;
    document.body.classList.toggle('yt-tocavel', abrir);
    barra.hidden = !abrir;
    aviso.hidden = abrir || !player.emAnuncio || player.modo !== 'youtube';
    botao.setAttribute('aria-expanded', String(abrir));
    if (abrir) fechar.focus({ preventScroll: true });
  }
  botao.onclick = aviso.onclick = () => alternar(true);
  function voltar() {
    alternar(false);
    botao.focus({ preventScroll: true });
  }
  fechar.onclick = () => { voltar(); player._corrigir(true); };
  player.aoFecharAmpliado = voltar;
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && camada) { e.preventDefault(); fechar.click(); }
  });
  player.aoAnuncio = sim => { if (!sim && camada) voltar(); aviso.hidden = !!camada || !sim || player.modo !== 'youtube'; };
  return modo => {
    botao.hidden = modo !== 'youtube';
    if (modo !== 'youtube') alternar(false);
  };
}
