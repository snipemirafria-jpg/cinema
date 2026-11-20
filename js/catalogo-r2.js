// Acervo público de vídeos do bucket do CineOnline.
export const ORIGEM_R2 = 'https://pub-85dd77ddbbce44a5891417b08065fbea.r2.dev';
const manifesto = new URL('../integrations/netmovies/catalogo-cineonline.json', import.meta.url);
const formatos = { mp4: 'mp4', m4v: 'mp4', webm: 'mp4', mov: 'mp4', ogv: 'mp4', m3u8: 'hls', mpd: 'dash' };

export function fonteR2(valor) {
  try {
    const url = new URL(valor);
    const extensao = url.pathname.split('.').pop().toLowerCase();
    if (url.origin !== ORIGEM_R2 || url.username || url.password || !Object.hasOwn(formatos, extensao)) return null;
    url.hash = '';
    return { tipo: formatos[extensao], url: url.href };
  } catch { return null; }
}

export function mesmoFilmeParaVR(atual, copia) {
  if (!atual || !copia) return false;
  if (atual.id && atual.id === copia.id) return true;
  const a = fonteR2(atual.fonte_url), b = fonteR2(copia.fonte_url);
  if (a && b && new URL(a.url).pathname === new URL(b.url).pathname) return true;
  const titulo = valor => String(valor ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim().replace(/\s+/g, ' ');
  const nome = titulo(atual.titulo);
  // O manifesto arredonda a duração em minutos. Evita combinar cortes com durações muito diferentes.
  return !!nome && nome === titulo(copia.titulo) && atual.duracao_seg > 0 && copia.duracao_seg > 0
    && Math.abs(atual.duracao_seg - copia.duracao_seg) <= 60;
}

export function reunirFilmesR2(catalogo, registros = []) {
  const itens = new Map();
  const inserir = f => {
    const fonte = fonteR2(f.fonte_url);
    if (!fonte || !f.titulo?.trim()) return;
    const chave = new URL(fonte.url).pathname;
    itens.set(chave, { ...itens.get(chave), ...f, fonte_url: fonte.url, origem: fonte.tipo });
  };
  if (catalogo?.source?.ads === false) {
    for (const i of catalogo.items || []) inserir({ titulo: i.title, capa_url: i.poster, fonte_url: i.watchUrl,
      duracao_seg: (i.durationMinutes || 0) * 60, genero: (i.genres || []).join(', ') });
  }
  for (const f of registros) inserir(f);
  return [...itens.values()].sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR'));
}

export async function carregarFilmesR2(sb) {
  const lerManifesto = async () => {
    const resposta = await fetch(manifesto, { cache: 'no-cache' });
    if (!resposta.ok) throw new Error('Falha ao ler o acervo');
    return resposta.json();
  };
  const lerCadastro = async () => {
    const { data, error } = await sb.from('filmes').select('id,titulo,capa_url,fonte_url,duracao_seg,genero')
      .eq('status', 'pronto').like('fonte_url', ORIGEM_R2 + '/%');
    if (error) throw error;
    return data;
  };
  const [arquivo, banco] = await Promise.allSettled([lerManifesto(), lerCadastro()]);
  const filmes = reunirFilmesR2(arquivo.value, banco.value || []);
  if (!filmes.length && (arquivo.status === 'rejected' || banco.status === 'rejected')) throw new Error('Não foi possível carregar o acervo do VR Box.');
  return filmes;
}
