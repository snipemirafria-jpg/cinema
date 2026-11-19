const el = id => document.getElementById(id);
function criar(tag, texto) {
  const n = document.createElement(tag);
  if (texto) n.textContent = texto;
  return n;
}
function acao(texto, href) {
  const a = criar('a', texto); a.href = href; a.className = 'acao'; return a;
}
async function mural() {
  const painel = el('mural');
  try {
    const r = await fetch('integrations/netmovies/catalogo-cineonline.json');
    if (!r.ok) throw Error();
    const {items} = await r.json();
    for (const filme of items) {
      if (!/^[a-z0-9-]{1,80}$/i.test(filme.id)) continue;
      const cartaz = criar('a'); cartaz.className = 'cartaz';
      cartaz.href = './?netmovies=' + encodeURIComponent(filme.id);
      const capa = criar('img'); capa.alt = ''; capa.loading = 'lazy'; capa.decoding = 'async'; capa.src = filme.poster || 'icons/icon.svg';
      cartaz.append(capa, criar('strong',filme.title), criar('small', [filme.genres?.join(', '), filme.durationMinutes && filme.durationMinutes+' min'].filter(Boolean).join(' · ')));
      painel.append(cartaz);
    }
    if (!painel.childElementCount) painel.textContent = 'O acervo ainda está vazio.';
  } catch { painel.textContent = 'Não foi possível carregar os cartazes.'; }
}
async function programacao() {
  const fila = el('fila'), situacao = el('situacao'), botao = el('rever');
  if (botao.disabled) return;
  botao.disabled = true;
  try {
    const {sb} = await import('./supa.js');
    const {data,error} = await sb.auth.getSession();
    if (error) throw error;
    fila.replaceChildren();
    if (!data.session) {
      situacao.textContent = 'Entre na sua conta para ver a programação ao vivo.';
      fila.append(acao('Entrar na sala principal','./')); return;
    }
    const [estado, grade] = await Promise.all([sb.rpc('agora_passando'),sb.from('programacao').select('id,posicao,filmes(titulo,status,genero,duracao_seg)').order('posicao')]);
    if (estado.error || grade.error) throw Error();
    const st = estado.data;
    situacao.textContent = st?.filme ? (st.pausado ? 'A sessão está pausada.' : 'Sessão em andamento.') : 'Nenhuma sessão em exibição agora.';
    for (const item of grade.data || []) {
      const f = item.filmes, atual = !!st?.filme && item.id === st.item, pronta = f?.status === 'pronto';
      const card = criar('article'); card.className = 'sessao';
      const status = !pronta ? 'Indisponível' : atual ? (st.pausado ? 'Pausada' : 'Em exibição') : item.id === st?.proximo_item ? 'A seguir' : 'Na fila';
      card.append(criar('small',status), criar('strong', f?.titulo || 'Filme indisponível'), criar('small',[f?.genero, f?.duracao_seg && Math.round(f.duracao_seg/60)+' min'].filter(Boolean).join(' · ')));
      if (atual && pronta) card.append(acao('Agora · entrar na sala','./'));
      fila.append(card);
    }
  } catch { fila.replaceChildren(); situacao.textContent = 'A programação não carregou. Toque em atualizar para tentar novamente.'; }
  finally { botao.disabled = false; }
}
el('rever').onclick = programacao;
document.addEventListener('visibilitychange', () => { if (!document.hidden) programacao(); });
setInterval(() => { if (!document.hidden) programacao(); }, 60000);
mural(); programacao();
