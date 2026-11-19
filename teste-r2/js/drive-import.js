// Importa filmes direto de uma pasta pública do Google Drive.
// Pega sozinho: título (nome do arquivo/pasta), ano, duração (metadados do Drive),
// capa (imagem da pasta), sinopse e gêneros (Wikipédia + Wikidata, em português).
// Precisa de uma chave da Google Drive API (grátis, só leitura de arquivos públicos).
import { capaDrive } from './fontes.js';

const API = 'https://www.googleapis.com/drive/v3/files';
const PASTA = 'application/vnd.google-apps.folder';
export const CHAVE_LS = 'cine_drive_api_key';

export function idPasta(u) {
  try {
    const url = new URL(u.trim());
    if (!/(^|\.)google\.com$/.test(url.hostname)) return null;
    const m = url.pathname.match(/\/folders\/([\w-]{10,})/);
    return m ? m[1] : (url.pathname.includes('folder') ? url.searchParams.get('id') : null);
  } catch { return null; }
}

async function api(caminho, params, chave) {
  const q = new URLSearchParams({ ...params, key: chave, supportsAllDrives: 'true', includeItemsFromAllDrives: 'true' });
  const r = await fetch(`${API}${caminho}?${q}`);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = j?.error?.message || r.statusText;
    if (r.status === 404) throw new Error('Pasta não encontrada. Compartilhe como “Qualquer pessoa com o link”.');
    if (r.status === 400 || r.status === 403) throw new Error('Chave da Google Drive API inválida ou sem a Drive API ativada: ' + msg);
    throw new Error(msg);
  }
  return j;
}

async function listar(id, chave) {
  const campos = 'nextPageToken,files(id,name,mimeType,size,thumbnailLink,videoMediaMetadata(durationMillis,width,height))';
  let out = [], token;
  do {
    const j = await api('', { q: `'${id}' in parents and trashed=false`, fields: campos, pageSize: '1000', ...(token ? { pageToken: token } : {}) }, chave);
    out = out.concat(j.files || []); token = j.nextPageToken;
  } while (token);
  return out;
}

const base = (n) => n.replace(/\.[a-z0-9]{2,4}$/i, '');
const norm = (s) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const LIXO = /\b(1080p?|720p?|480p?|2160p?|4k|uhd|hd|fullhd|full hd|bluray|blu ray|brrip|bdrip|web ?dl|webrip|hdrip|dvdrip|x264|x265|h ?264|h ?265|hevc|aac|ac3|5 1|dublado|dual audio|dual|legendado|nacional|pt ?br|ptbr|torrent|www \w+ \w+|capa|poster|cover)\b/gi;
const GENERICO = /^(filme|video|movie|capa|poster|cover|\d+)$/i;

export function limparTitulo(n) {
  let s = base(n).replace(/[._]+/g, ' ').replace(/\[[^\]]*\]/g, ' ');
  const ano = (s.match(/(?:^|[\s(])((?:19|20)\d{2})(?:[\s)]|$)/) || [])[1] || null;
  if (ano) s = s.slice(0, s.indexOf(ano)) || s.replace(ano, '');
  s = s.replace(/\(\s*\)/g, ' ').replace(LIXO, ' ').replace(/[-–(]+\s*$/g, '').replace(/\s{2,}/g, ' ').trim();
  return { titulo: s, ano };
}

// --------------------------------------------------------- Wikipédia / Wikidata
async function wiki(titulo, ano) {
  try {
    const W = (p) => fetch('https://pt.wikipedia.org/w/api.php?' + new URLSearchParams({ format: 'json', origin: '*', ...p })).then(r => r.json());
    const ler = async (titulos) => {
      const j = await W({ action: 'query', titles: titulos.join('|'), redirects: '1', prop: 'extracts|pageprops|pageimages', exintro: '1', explaintext: '1', piprop: 'original', pithumbsize: '600' });
      return Object.values(j?.query?.pages || {}).filter(pg => pg.pageid && /\bfilme\b|\blonga-metragem\b|\banima[cç][aã]o\b/i.test((pg.extract || '').split(/\.\s/)[0]))
        .sort((x, y) => /\(filme/.test(y.title) - /\(filme/.test(x.title));
    };
    const nt = norm(titulo);
    // 1) título exato (a Wikipédia redireciona o nome brasileiro para o artigo)
    let pg = (await ler([titulo, `${titulo} (filme)`, ...(ano ? [`${titulo} (filme de ${ano})`] : [])]))[0];
    // 2) busca: aceita o artigo cujo título ou trecho cita o nome do filme
    if (!pg) {
      const res = (await W({ action: 'query', list: 'search', srsearch: `${titulo} ${ano || ''} filme`.trim(), srlimit: '8' }))?.query?.search || [];
      const nota = (r) => { const t = norm(r.title.replace(/\(.*\)/, '')), sn = norm(r.snippet.replace(/<[^>]+>/g, '')); return (t === nt ? 4 : 0) + (sn.includes(nt) ? 3 : 0) + (t.startsWith(nt) ? 1 : 0) + (/filme/.test(sn) ? 1 : 0) + (ano && sn.includes(ano) ? 1 : 0); };
      const ord = res.map(r => [nota(r), r]).sort((x, y) => y[0] - x[0]).map(([, r]) => r.title).slice(0, 6);
      const pags = ord.length ? await ler(ord) : [];
      pg = pags.find(p => norm(p.title.replace(/\(.*\)/, '')) === nt) || pags.map(p => [norm((p.extract || '').slice(0, 300)).indexOf(nt), p]).filter(([i]) => i >= 0).sort((x, y) => x[0] - y[0])[0]?.[1];
    }
    if (!pg) return null;
    const sum = { extract: pg.extract, originalimage: pg.original, wikibase_item: pg.pageprops?.wikibase_item };
    const out = { descricao: (sum.extract || '').slice(0, 3000), capa: sum.originalimage?.source || null, generos: [], duracaoMin: null, ano: null };
    const q = sum.wikibase_item;
    if (q) {
      const ent = (await (await fetch(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${q}&props=claims&format=json&origin=*`)).json())?.entities?.[q];
      const cl = ent?.claims || {};
      const ids = (cl.P136 || []).map(c => c.mainsnak?.datavalue?.value?.id).filter(Boolean).slice(0, 6);
      if (ids.length) {
        const lb = (await (await fetch(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids.join('|')}&props=labels&languages=pt-br|pt|en&format=json&origin=*`)).json())?.entities || {};
        out.generos = ids.map(i => lb[i]?.labels?.['pt-br']?.value || lb[i]?.labels?.pt?.value || lb[i]?.labels?.en?.value).filter(Boolean);
      }
      const d = cl.P2047?.[0]?.mainsnak?.datavalue?.value;
      if (d?.amount) out.duracaoMin = Math.round(Math.abs(parseFloat(d.amount)) / (/Q11574$/.test(d.unit) ? 60 : /Q25235$/.test(d.unit) ? 1 / 60 : 1));
      const t = cl.P577?.[0]?.mainsnak?.datavalue?.value?.time; if (t) out.ano = t.slice(1, 5);
    }
    return out;
  } catch { return null; }
}

// casa os gêneros com uma pasta existente (Ação, Comédia, Terror…)
function pastaPorGenero(generos, cats) {
  const txt = norm(generos.join(' '));
  const achada = cats.find(c => c.nome !== 'Outros' && norm(c.nome) && txt.includes(norm(c.nome).replace(/s$/, '')));
  return achada?.nome || null;
}

// --------------------------------------------------------------- análise da pasta
// Aceita: (a) pasta de UM filme (vídeo + capa), (b) pasta com vários vídeos,
// (c) pasta com subpastas, uma por filme.
export async function analisarPasta(url, chave, cats = [], progresso = () => { }) {
  const id = idPasta(url);
  if (!id) throw new Error('Isso não parece um link de pasta do Drive (…/drive/folders/…).');
  if (!chave) throw new Error('Falta a chave da Google Drive API.');
  const raiz = await api('/' + id, { fields: 'id,name' }, chave);
  const grupos = [];
  const juntar = (arquivos, nomePasta) => {
    const videos = arquivos.filter(f => f.mimeType?.startsWith('video/') || /\.(mp4|mkv|webm|mov|m4v|avi)$/i.test(f.name));
    const imgs = arquivos.filter(f => f.mimeType?.startsWith('image/'));
    for (const v of videos) {
      const bv = norm(base(v.name));
      const capa = imgs.find(i => norm(base(i.name)) === bv) || imgs.find(i => bv && norm(base(i.name)).includes(bv.split(' ')[0]))
        || imgs.find(i => /capa|poster|cover|folder/i.test(i.name)) || (videos.length === 1 ? imgs[0] : null);
      grupos.push({ video: v, capa, nomePasta: videos.length === 1 ? nomePasta : null });
    }
  };
  progresso('Lendo a pasta…');
  const itens = await listar(id, chave);
  juntar(itens, raiz.name);
  for (const sub of itens.filter(f => f.mimeType === PASTA)) { progresso(`Lendo ${sub.name}…`); juntar(await listar(sub.id, chave), sub.name); }
  if (!grupos.length) throw new Error('Não achei nenhum vídeo nessa pasta (nem nas subpastas).');

  const filmes = [];
  for (const [i, g] of grupos.entries()) {
    const doArq = limparTitulo(g.video.name), daPasta = g.nomePasta ? limparTitulo(g.nomePasta) : null;
    const usaPasta = daPasta?.titulo && (GENERICO.test(doArq.titulo) || doArq.titulo.length < 3);
    const titulo = (usaPasta ? daPasta.titulo : doArq.titulo) || daPasta?.titulo || base(g.video.name);
    const ano = doArq.ano || daPasta?.ano;
    progresso(`Buscando dados de “${titulo}” (${i + 1}/${grupos.length})…`);
    const w = await wiki(titulo, ano);
    const ms = +g.video.videoMediaMetadata?.durationMillis || 0;
    const generos = w?.generos || [];
    filmes.push({
      titulo,
      ano: ano || w?.ano || null,
      duracao_seg: ms ? Math.round(ms / 1000) : (w?.duracaoMin ? w.duracaoMin * 60 : null),
      capa_url: g.capa ? capaDrive(g.capa.id) : (w?.capa || capaDrive(g.video.id)),
      descricao: w?.descricao || '',
      genero: generos.join(', ') || null,
      categoria: pastaPorGenero(generos, cats) || null,
      fonte_url: `https://drive.google.com/file/d/${g.video.id}/view`,
      origem: 'drive',
      arquivo_nome: g.video.name,
      formato_ok: !/\.(mkv|avi)$/i.test(g.video.name),
    });
  }
  return filmes;
}
