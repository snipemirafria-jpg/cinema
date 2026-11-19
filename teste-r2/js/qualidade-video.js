// Diagnóstico local por carregamento. Somente eventos do elemento de vídeo ativo.
export function observarQualidade(video) {
  let inicio, primeiro, paradas, espera, tempoEspera, tocando;
  function reiniciar() {
    inicio = performance.now(); primeiro = null; paradas = 0;
    espera = null; tempoEspera = 0; tocando = false;
  }
  function concluirEspera() {
    if (espera !== null) tempoEspera += performance.now() - espera;
    espera = null;
  }
  reiniciar();
  video.addEventListener('loadstart',reiniciar);
  video.addEventListener('playing',() => {
    if (primeiro === null) primeiro = performance.now() - inicio;
    concluirEspera(); tocando = true;
  });
  video.addEventListener('waiting',() => {
    if (tocando && !video.seeking && !video.paused && !document.hidden && espera === null) {
      espera = performance.now(); paradas++;
    }
  });
  for (const evento of ['pause','ended','seeking','emptied']) video.addEventListener(evento,() => { concluirEspera(); tocando = false; });
  document.addEventListener('visibilitychange',() => { if (document.hidden) concluirEspera(); });
  return () => {
    const q = video.getVideoPlaybackQuality?.();
    const segundos = (tempoEspera + (espera === null ? 0 : performance.now() - espera))/1000;
    return [primeiro === null ? 'Aguardando reprodução' : 'Início em '+(primeiro/1000).toFixed(1)+' s',
      paradas+' interrupções', segundos.toFixed(1)+' s de espera',
      q ? q.droppedVideoFrames+' de '+q.totalVideoFrames+' quadros perdidos' : 'Contagem de quadros indisponível'].join(' · ');
  };
}
