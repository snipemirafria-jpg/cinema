// Liga/desliga a seção NetMovies. Para desativar: troque para false (nada mais precisa mudar).
export const NETMOVIES_ENABLED = true;

// Fornecedores mostrados no menu, nesta ordem (um botão para cada).
export const FORNECEDORES = [
  { id: 'cineonline', nome: 'Cine Online', icone: '🎬', catalogo: 'catalogo-cineonline.json' },   // filmes próprios no Cloudflare R2, sem anúncios (botão só aparece quando tiver filme)
  { id: 'netmovies', nome: 'NetMovies', icone: '🍿', catalogo: 'catalogo-netmovies.json' },
  { id: 'capivara', nome: 'Capivara Filmes', icone: '🦫', catalogo: 'catalogo-capivara.json' },
];
