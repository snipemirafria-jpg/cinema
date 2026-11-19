// A fila gira a partir do início real do item indicado pelo servidor.
export function horariosDaFila(itens, estado) {
  const horarios = new Map();
  const prontos = itens.filter(i => i.filmes?.status === 'pronto');
  const primeiro = prontos.findIndex(i => i.id === estado?.item);
  let quando = Date.parse(estado?.iniciado_em);
  if (!estado?.filme || estado.pausado || primeiro < 0 || !Number.isFinite(quando)) return horarios;
  for (let passo = 0; passo < prontos.length; passo++) {
    const item = prontos[(primeiro + passo) % prontos.length];
    horarios.set(item.id, quando);
    const duracao = Number(item.filmes.duracao_seg);
    if (!(duracao > 0 && Number.isFinite(duracao))) break;
    quando += duracao * 1000;
  }
  return horarios;
}
