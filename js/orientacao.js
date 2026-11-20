// O teclado virtual pode mudar a proporção da janela sem girar o aparelho.
export function exigirHorizontal(aviso, aoMudar) {
  const vertical = matchMedia('(orientation: portrait)');
  const toque = matchMedia('(pointer: coarse)');
  const orientacao = screen.orientation;
  let permitirVertical = sessionStorage.getItem('cine-orientacao-vertical') === 'sim';
  let espera, liberar;
  function atualizar() {
    const retrato = orientacao?.type ? orientacao.type.startsWith('portrait') : vertical.matches;
    const bloqueado = !permitirVertical && toque.matches && retrato;
    if (bloqueado && !aviso.open) aviso.showModal();
    if (!bloqueado && aviso.open) aviso.close();
    aoMudar(bloqueado);
    if (!bloqueado && liberar) { liberar(); liberar = null; espera = null; }
  }
  aviso.querySelector('[data-orientacao-vertical]').addEventListener('click', () => {
    permitirVertical = true;
    sessionStorage.setItem('cine-orientacao-vertical', 'sim');
    atualizar();
  });
  aviso.addEventListener('cancel', evento => evento.preventDefault());
  vertical.addEventListener('change', atualizar);
  toque.addEventListener('change', atualizar);
  orientacao?.addEventListener('change', atualizar);
  return () => {
    espera ??= new Promise(resolve => { liberar = resolve; });
    const atual = espera;
    atualizar();
    return atual;
  };
}
