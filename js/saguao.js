import { horariosDaFila } from './horarios.js';
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
      cartaz.href = 'sessao.html?netmovies=' + encodeURIComponent(filme.id);
      const capa = criar('img'); capa.alt = ''; capa.loading = 'lazy'; capa.decoding = 'async'; capa.src = filme.poster || 'icons/icon.svg';
      cartaz.append(capa, criar('strong',filme.title), criar('small', [filme.genres?.join(', '), filme.durationMinutes && filme.durationMinutes+' min'].filter(Boolean).join(' · ')));
      painel.append(cartaz);
    }
    if (!painel.childElementCount) painel.textContent = 'O acervo ainda está vazio.';
  } catch { painel.textContent = 'Não foi possível carregar os cartazes.'; }
}
const formatarHora = new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
let proxima = null, relogio = 0;
function contagem() {
  if (!proxima || document.hidden) return;
  const segundos = Math.ceil((proxima.inicio - (proxima.agora + performance.now() - proxima.recebido))/1000);
  if (segundos <= 0) { proxima = null; clearInterval(relogio); programacao(); return; }
  el('contagem').textContent = 'Próxima sessão em ' + Math.floor(segundos/60) + ' min ' + String(segundos%60).padStart(2,'0') + ' s';
}
let canalPublico, cliente;
function observarPlateia(sb) {
  if (canalPublico || document.hidden) return;
  cliente = sb;
  const canal = canalPublico = sb.channel('sala-principal');
  canal.on('presence',{event:'sync'},() => {
    if (canalPublico !== canal) return;
    const ids = new Set(Object.values(canal.presenceState()).flat().map(p => p.id).filter(Boolean));
    el('plateia').textContent = ids.size + (ids.size === 1 ? ' pessoa na sala' : ' pessoas na sala');
  }).subscribe(status => {
    if (canalPublico === canal && ['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)) el('plateia').textContent = '';
  });
}
function pararPlateia() {
  if (canalPublico) {
    const canal = canalPublico; canalPublico = null;
    cliente.removeChannel(canal);
  }
  el('plateia').textContent = '';
}
async function programacao() {
  const fila = el('fila'), situacao = el('situacao'), botao = el('rever');
  if (botao.disabled) return;
  botao.disabled = true; proxima = null; clearInterval(relogio); el('contagem').textContent = '';
  try {
    const {sb} = await import('./supa.js');
    const {data,error} = await sb.auth.getSession();
    if (error) throw error;
    fila.replaceChildren();
    if (!data.session) {
      pararPlateia();
      situacao.textContent = 'Entre na sua conta para ver a programação ao vivo.';
      fila.append(acao('Entrar na sala principal','sessao.html')); return;
    }
    observarPlateia(sb);
    const [estado, grade] = await Promise.all([sb.rpc('agora_passando'),sb.from('programacao').select('id,posicao,filmes(titulo,status,genero,duracao_seg)').order('posicao')]);
    if (estado.error || grade.error) throw Error();
    const st = estado.data;
    const horarios = horariosDaFila(grade.data || [], st);
    const inicio = horarios.get(st?.proximo_item), agora = Date.parse(st?.agora);
    if (inicio > agora && st.proximo_item !== st.item) {
      proxima = {inicio, agora, recebido:performance.now()};
      contagem(); relogio = setInterval(contagem,1000);
    }
    situacao.textContent = st?.filme ? (st.pausado ? 'A sessão está pausada.' : 'Sessão em andamento.') : 'Nenhuma sessão em exibição agora.';
    for (const item of grade.data || []) {
      const f = item.filmes, atual = !!st?.filme && item.id === st.item, pronta = f?.status === 'pronto';
      const card = criar('article'); card.className = 'sessao';
      const status = !pronta ? 'Indisponível' : atual ? (st.pausado ? 'Pausada' : 'Em exibição') : item.id === st?.proximo_item ? 'A seguir' : 'Na fila';
      card.append(criar('small',status), criar('strong', f?.titulo || 'Filme indisponível'), criar('small',[f?.genero, f?.duracao_seg && Math.round(f.duracao_seg/60)+' min'].filter(Boolean).join(' · ')));
      if (horarios.has(item.id)) card.append(criar('small',(atual ? 'Início' : 'Previsão') + ' · ' + formatarHora.format(horarios.get(item.id))));
      if (atual && pronta) card.append(acao('Agora · entrar na sala','sessao.html'));
      fila.append(card);
    }
  } catch { fila.replaceChildren(); situacao.textContent = 'A programação não carregou. Toque em atualizar para tentar novamente.'; }
  finally { botao.disabled = false; }
}
el('rever').onclick = programacao;
document.addEventListener('visibilitychange', () => { if (document.hidden) pararPlateia(); else programacao(); });
setInterval(() => { if (!document.hidden) programacao(); }, 60000);
mural(); programacao();
