// Painel do criador (OWNER). Toda permissão é garantida no banco (RLS + funções),
// esta tela só organiza as ferramentas.
import { sb, esc, toast, urlPublica } from './supa.js';
import { CANAL_GLOBAL, nomeSala, urlSala } from './moderacao.js';
import { detectarTipo, NOME_TIPO, idArchive, idYouTube, idDrive, urlDriveDireto, capaYouTube, capaDrive, carregarApiYouTube } from './fontes.js';
import { POSICOES_ANUNCIOS, urlAnuncio } from './midia-anuncio.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const C = $('#conteudo');
const st = { online: [], secao: 'dashboard', uid: null };
const dataBR = (d) => d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
const dur = (s) => { s = +s || 0; const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60); return (h ? h + 'h ' : '') + m + 'min'; };
const erro = (e) => { if (e) { toast(e.message || String(e), 'erro'); return true; } return false; };

// ------------------------------------------------------------------ acesso
const { data: { session } } = await sb.auth.getSession();
if (!session) { location.href = './'; throw new Error('sem sessão'); }
st.uid = session.user.id;
const { data: ehOwner } = await sb.rpc('eh_owner');
if (!ehOwner) { $('#bloqueio').textContent = 'Acesso restrito ao proprietário da Sessão Juntos.'; throw new Error('sem permissão'); }
$('#bloqueio').hidden = true; $('#layout').hidden = false;
$('#eu').textContent = '👑 ' + (session.user.email || '');

// presença: observa a sala sem aparecer nela
const canal = sb.channel('sala-principal');
canal.on('presence', { event: 'sync' }, () => {
  st.online = Object.values(canal.presenceState()).map(a => a[0]).filter(Boolean);
  if (st.secao === 'dashboard') $('#n-online') && ($('#n-online').textContent = st.online.length, $('#n-assistindo').textContent = st.online.length);
}).subscribe();

// ------------------------------------------------------------------ navegação
const SECOES = { dashboard, programacao, filmes, anuncios, usuarios, mensagens, denuncias, banimentos, moderacao, ajuda, cameras, acessos, auditoria, config };

// canal global: presença de todas as salas (só observa: o painel não entra na contagem) + avisos de moderação
const global = sb.channel(CANAL_GLOBAL);
st.salas = new Map();
global.on('presence', { event: 'sync' }, () => {
  const m = new Map();
  Object.values(global.presenceState()).forEach(a => { const p = a[0]; if (!p?.sala) return; const s = m.get(p.sala) || m.set(p.sala, { sala: p.sala, titulo: '', capa: '', fonte: '', pessoas: new Map() }).get(p.sala); s.pessoas.set(p.id, p); if (p.titulo) Object.assign(s, { titulo: p.titulo, capa: p.capa, fonte: p.fonte }); });
  st.salas = m;
  if (st.secao === 'cameras') desenharCameras();
}).subscribe();
const avisar = (alvo, acao) => { const msg = { type: 'broadcast', event: 'moderacao', payload: { alvo, acao } }; canal.send(msg); global.send(msg); };
$$('nav button').forEach(b => b.onclick = () => ir(b.dataset.sec));
$('#menu-mob').onclick = () => $('#lateral').classList.toggle('aberta');
function ir(sec) {
  if (st.secao === 'cameras' && sec !== 'cameras') pararCameras();
  st.secao = sec;
  $$('nav button').forEach(b => b.classList.toggle('ativo', b.dataset.sec === sec));
  $('#titulo-sec').textContent = $(`nav button[data-sec="${sec}"]`).textContent.replace(/\d+$/, '').trim();
  $('#lateral').classList.remove('aberta');
  C.innerHTML = '<p class="dica">Carregando…</p>';
  SECOES[sec]().catch(e => { C.innerHTML = `<p class="dica">Erro: ${esc(e.message)}</p>`; });
  history.replaceState(null, '', '#' + sec);
}
async function badge() {
  const { count } = await sb.from('denuncias').select('id', { count: 'exact', head: true }).in('status', ['aberta', 'analisando']);
  $('#badge-den').textContent = count || '';
}

function modal(html, aoOk) {
  const dlg = $('#modal'), f = $('#modal-form');
  f.innerHTML = html + `<div class="linha-acoes" style="justify-content:flex-end"><button class="btn" value="cancelar" formnovalidate>Cancelar</button><button class="btn p" value="ok">Salvar</button></div>`;
  dlg.showModal();
  f.onsubmit = async (e) => {
    if (e.submitter?.value !== 'ok') return;
    e.preventDefault();
    const btn = e.submitter; btn.disabled = true;
    try { const ok = await aoOk(f); if (ok !== false) dlg.close(); } finally { btn.disabled = false; }
  };
  return f;
}

// ------------------------------------------------------------------ dashboard
async function dashboard() {
  const [{ data: s, error }, { data: agora }] = await Promise.all([sb.rpc('painel_estatisticas'), sb.rpc('agora_passando')]);
  if (erro(error)) return;
  const f = agora?.filme;
  const pct = f ? Math.min(100, (agora.posicao_seg / f.duracao_seg) * 100) : 0;
  const max = Math.max(1, ...s.acessos_por_dia.map(d => d.total));
  C.innerHTML = `
    <div class="grade">
      <div class="stat destaque"><small>Usuários cadastrados</small><b>${s.usuarios}</b><small>+${s.novos_7d} nos últimos 7 dias</small></div>
      <div class="stat"><small>Espectadores online</small><b id="n-online">${st.online.length}</b></div>
      <div class="stat"><small>Assistindo o filme atual</small><b id="n-assistindo">${st.online.length}</b></div>
      <div class="stat"><small>Acessos (24h)</small><b>${s.acessos_24h}</b></div>
      <div class="stat"><small>Mensagens (24h)</small><b>${s.mensagens_24h}</b></div>
      <div class="stat"><small>Denúncias abertas</small><b>${s.denuncias_abertas}</b></div>
      <div class="stat"><small>Contas bloqueadas</small><b>${s.banidos}</b></div>
      <div class="stat"><small>Filmes no catálogo</small><b>${s.filmes}</b></div>
    </div>
    <div class="card"><h3>🔴 Transmitindo agora</h3>${f ? `
      <div class="ao-vivo"><img src="${esc(f.capa_url || 'icons/icon.svg')}" alt="">
      <div style="flex:1"><b style="font-size:18px">${esc(f.titulo)}</b><div class="dica">${esc(f.genero || '')} · ${dur(f.duracao_seg)} · ${agora.pausado ? 'pausado' : 'no ar'}</div>
      <div class="barra"><i style="width:${pct}%"></i></div><div class="dica">${dur(agora.posicao_seg)} de ${dur(f.duracao_seg)}</div>
      <div class="linha-acoes" style="margin-top:10px"><button class="btn" id="b-pausa">${agora.pausado ? '▶ Retomar' : '⏸ Pausar'}</button><button class="btn" onclick="location.hash='programacao'">Gerenciar programação</button></div></div></div>`
      : '<p class="dica">Nada na programação. Adicione filmes.</p>'}</div>
    <div class="card"><h3>Acessos nos últimos 14 dias</h3><div class="grafico" style="margin-bottom:20px">${s.acessos_por_dia.map(d => `<div style="height:${(d.total / max) * 100}%" title="${d.total}"><span>${new Date(d.dia + 'T12:00').getDate()}</span></div>`).join('') || '<p class="dica">Sem dados ainda.</p>'}</div></div>`;
  $('#b-pausa')?.addEventListener('click', async () => { if (!erro((await sb.rpc('prog_pausar', { p_pausar: !agora.pausado })).error)) dashboard(); });
}

// ------------------------------------------------------------------ programação
async function programacao() {
  const [{ data: itens, error }, { data: agora }, { data: catalogo }] = await Promise.all([
    sb.from('programacao').select('id, posicao, filme, filmes(titulo, capa_url, duracao_seg, status)').order('posicao'),
    sb.rpc('agora_passando'),
    sb.from('filmes').select('id, titulo, duracao_seg, status').order('titulo'),
  ]);
  if (erro(error)) return;
  C.innerHTML = `
    <div class="card"><h3>Adicionar à fila</h3><div class="linha-acoes">
      <select id="p-filme" style="max-width:360px">${(catalogo || []).map(f => `<option value="${f.id}">${esc(f.titulo)} (${dur(f.duracao_seg)})${f.status !== 'pronto' ? ' — ' + f.status : ''}</option>`).join('')}</select>
      <button class="btn p" id="p-add">+ Adicionar ao fim</button></div>
      <p class="dica">A programação é contínua: ao terminar o último filme, a fila recomeça. O servidor controla a troca, mesmo com você desconectado.</p></div>
    <div class="card"><h3>Fila (${itens.length})</h3><ul class="fila" id="fila">${itens.map((i, k) => `
      <li class="${i.id === agora?.item ? 'atual' : ''}" data-id="${i.id}">
        <b style="width:22px;color:var(--sub)">${k + 1}</b><img src="${esc(i.filmes?.capa_url || 'icons/icon.svg')}" style="width:34px;height:48px;object-fit:cover;border-radius:6px">
        <div class="info"><b>${esc(i.filmes?.titulo)}</b><small>${dur(i.filmes?.duracao_seg)} ${i.id === agora?.item ? '· <span style="color:#ff2d55">● passando agora</span>' : ''} ${i.id === agora?.proximo_item ? '· próximo' : ''}</small></div>
        <div class="linha-acoes">
          <button class="btn" data-a="sobe" title="Subir">↑</button><button class="btn" data-a="desce" title="Descer">↓</button>
          <button class="btn" data-a="agora">▶ Agora</button><button class="btn" data-a="proximo">⏭ Próximo</button>
          <button class="btn v" data-a="remover">✕</button></div></li>`).join('')}</ul></div>`;
  $('#p-add').onclick = async () => {
    const pos = (itens.at(-1)?.posicao || 0) + 1;
    if (!erro((await sb.from('programacao').insert({ filme: $('#p-filme').value, posicao: pos })).error)) { toast('Adicionado', 'ok'); programacao(); }
  };
  $$('#fila li').forEach(li => $$('button', li).forEach(b => b.onclick = async () => {
    const id = li.dataset.id, ids = itens.map(i => i.id), k = ids.indexOf(id);
    let r;
    if (b.dataset.a === 'agora') r = await sb.rpc('prog_reproduzir_agora', { p_item: id });
    if (b.dataset.a === 'proximo') r = await sb.rpc('prog_definir_proximo', { p_item: id });
    if (b.dataset.a === 'remover') { if (!confirm('Remover da programação?')) return; r = await sb.from('programacao').delete().eq('id', id); }
    if (b.dataset.a === 'sobe' || b.dataset.a === 'desce') {
      const j = b.dataset.a === 'sobe' ? k - 1 : k + 1; if (j < 0 || j >= ids.length) return;
      [ids[k], ids[j]] = [ids[j], ids[k]]; r = await sb.rpc('prog_reordenar', { p_ids: ids });
    }
    if (!erro(r?.error)) programacao();
  }));
}

// ------------------------------------------------------------------ filmes (pastas + links)
st.pasta = 'Todas';
async function filmes() {
  const [{ data, error }, { data: cats }] = await Promise.all([
    sb.from('filmes').select('*').order('criado_em', { ascending: false }),
    sb.from('categorias').select('*').order('ordem'),
  ]);
  if (erro(error)) return;
  st.cats = cats || [];
  const conta = (n) => data.filter(f => (f.categoria || 'Outros') === n).length;
  const visiveis = st.pasta === 'Todas' ? data : data.filter(f => (f.categoria || 'Outros') === st.pasta);
  const icone = (n) => st.cats.find(c => c.nome === n)?.icone || '🎬';
  C.innerHTML = `
    <div class="linha-acoes"><button class="btn p" id="f-novo">+ Adicionar filme por link</button><button class="btn p" id="f-drive">📂 Importar pasta do Drive</button><button class="btn" id="f-archive">🔎 Buscar filmes gratuitos</button><button class="btn" id="f-pasta">+ Nova pasta</button></div>
    <div class="pastas">
      <button class="pasta ${st.pasta === 'Todas' ? 'ativa' : ''}" data-pasta="Todas">📁 Todas <small>${data.length}</small></button>
      ${st.cats.map(c => `<button class="pasta ${st.pasta === c.nome ? 'ativa' : ''}" data-pasta="${esc(c.nome)}">${esc(c.icone)} ${esc(c.nome)} <small>${conta(c.nome)}</small></button>`).join('')}
    </div>
    <div class="grade-filmes">${visiveis.map(f => `
      <div class="cartao-filme">
        <div class="poster" style="background-image:url('${esc(f.capa_url || 'icons/icon.svg')}')"><span class="tag">${esc(NOME_TIPO[f.origem] || f.origem)}</span></div>
        <b title="${esc(f.titulo)}">${esc(f.titulo)}</b>
        <small>${icone(f.categoria)} ${esc(f.categoria || 'Outros')} · ${dur(f.duracao_seg)}${f.status !== 'pronto' ? ' · ' + f.status : ''}</small>
        <div class="linha-acoes">
          <button class="btn p" data-agora="${f.id}" title="Trocar o filme da sala por este agora">▶ Passar agora</button>
          <button class="btn" data-fila="${f.id}" title="Adicionar ao fim da fila">+ Fila</button>
          <button class="btn" data-ed="${f.id}">Editar</button>
          <button class="btn v" data-del="${f.id}" title="Excluir">✕</button>
        </div>
      </div>`).join('') || '<p class="dica">Nenhum filme nesta pasta ainda. Clique em “Adicionar filme por link”.</p>'}</div>`;
  $('#f-novo').onclick = () => formFilme({ categoria: st.pasta !== 'Todas' ? st.pasta : 'Outros' });
  $('#f-archive').onclick = buscarInternetArchive;
  $('#f-drive').onclick = importarDrive;
  $('#f-pasta').onclick = () => modal(`<h3>Nova pasta</h3>
      <div class="form-grid"><label>Nome<input name="nome" required maxlength="30" placeholder="Ex: Filmes de herói"></label>
      <label>Ícone (emoji)<input name="icone" maxlength="4" value="🎬"></label></div>`, async (fm) => {
      const v = Object.fromEntries(new FormData(fm));
      if (erro((await sb.from('categorias').insert({ nome: v.nome.trim(), icone: v.icone || '🎬', ordem: 50 })).error)) return false;
      st.pasta = v.nome.trim(); filmes();
    });
  $$('[data-pasta]').forEach(b => b.onclick = () => { st.pasta = b.dataset.pasta; filmes(); });
  $$('[data-ed]').forEach(b => b.onclick = () => formFilme(data.find(f => f.id === b.dataset.ed)));
  $$('[data-fila]').forEach(b => b.onclick = async () => { if (await addFila(b.dataset.fila)) toast('Adicionado ao fim da fila', 'ok'); });
  $$('[data-agora]').forEach(b => b.onclick = async () => {
    const item = await addFila(b.dataset.agora); if (!item) return;
    if (!erro((await sb.rpc('prog_reproduzir_agora', { p_item: item })).error)) toast('Trocado! Todos na sala já estão vendo este filme.', 'ok');
  });
  $$('[data-del]').forEach(b => b.onclick = async () => {
    if (!confirm('Excluir este filme? Ele sai também da programação.')) return;
    if (!erro((await sb.from('filmes').delete().eq('id', b.dataset.del)).error)) { toast('Excluído', 'ok'); filmes(); }
  });
}


// Busca pública do Internet Archive. A presença de um item no catálogo não comprova direitos.
async function buscarInternetArchive() {
  const fm = modal(`
    <h3>Buscar filmes no Internet Archive</h3>
    <label class="todo">Título, tema ou palavra-chave
      <input name="q" required maxlength="100" placeholder="Ex.: silent comedy, animation">
    </label>
    <p class="dica">Confira os direitos e a permissão de incorporação na página original antes de publicar.</p>
    <div id="archive-resultados" class="archive-resultados todo"><p class="dica">Digite uma busca e clique em Buscar.</p></div>
    <div class="linha-acoes"><button type="button" class="btn p" id="archive-buscar">Buscar</button></div>`, async () => false);
  const area = $('#archive-resultados', fm);
  const buscar = async () => {
    const q = $('[name=q]', fm).value.trim();
    if (!q) { area.innerHTML = '<p class="dica">Digite o que deseja procurar.</p>'; return; }
    area.innerHTML = '<p class="dica">Consultando o catálogo…</p>';
    try {
      const params = new URLSearchParams({
        q: `(${q}) AND mediatype:movies`,
        fl: 'identifier,title,year,description,licenseurl,creator',
        rows: '20', page: '1', output: 'json'
      });
      const resp = await fetch(`https://archive.org/advancedsearch.php?${params}`);
      if (!resp.ok) throw new Error('O catálogo não respondeu.');
      const json = await resp.json();
      const docs = json?.response?.docs || [];
      if (!docs.length) { area.innerHTML = '<p class="dica">Nenhum resultado. Tente outras palavras, inclusive em inglês.</p>'; return; }
      area.innerHTML = docs.map((d, i) => {
        const id = String(d.identifier || '');
        const title = String(d.title || id);
        const desc = String(d.description || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').slice(0, 240);
        const license = String(d.licenseurl || '');
        return `<article class="archive-item">
          <img src="https://archive.org/services/img/${encodeURIComponent(id)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
          <div class="archive-meta"><b>${esc(title)}</b><small>${esc(String(d.year || ''))} ${d.creator ? '· ' + esc(String(d.creator)) : ''}</small>
          <p>${esc(desc || 'Sem descrição informada.')}</p>
          <small>${license ? 'Licença declarada: ' + esc(license) : '⚠️ Licença não informada no resultado.'}</small>
          <div class="linha-acoes">
            <a class="btn" href="https://archive.org/details/${encodeURIComponent(id)}" target="_blank" rel="noreferrer">Ver origem/licença</a>
            <button type="button" class="btn p" data-archive-add="${i}">Adicionar</button>
          </div></div></article>`;
      }).join('');
      $$('[data-archive-add]', area).forEach(b => b.onclick = () => {
        const d = docs[Number(b.dataset.archiveAdd)];
        const id = String(d.identifier || '');
        if (!/^[A-Za-z0-9_-]{3,120}$/.test(id)) return toast('Identificador inválido.', 'erro');
        $('#modal').close();
        formFilme({
          titulo: String(d.title || id),
          descricao: String(d.description || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').slice(0, 3000),
          fonte_url: `https://archive.org/details/${id}`,
          capa_url: `https://archive.org/services/img/${encodeURIComponent(id)}`,
          categoria: st.pasta !== 'Todas' ? st.pasta : 'Outros',
          licenca_tipo: d.licenseurl ? 'Licença declarada (verificar)' : 'Não informado',
          licenca_titular: String(d.creator || ''),
          licenca_detalhes: `Importado do Internet Archive. Licença declarada: ${d.licenseurl || 'não informada'}. Confirme os direitos e a permissão de incorporação na origem.`,
          origem: 'archive'
        });
      });
    } catch (e) {
      area.innerHTML = `<p class="dica">Falha ao consultar o catálogo: ${esc(e.message)}</p>`;
    }
  };
  $('#archive-buscar', fm).onclick = buscar;
  $('[name=q]', fm).addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); buscar(); } });
}

// --------------------------------------------- importar pasta do Google Drive
async function importarDrive() {
  const { analisarPasta, CHAVE_LS } = await import('./drive-import.js');
  const chaveSalva = localStorage.getItem(CHAVE_LS) || '';
  const cats = st.cats || [];
  const opc = (sel) => cats.map(c => `<option ${sel === c.nome ? 'selected' : ''}>${esc(c.nome)}</option>`).join('');
  const fm = modal(`
    <h3>Importar filmes de uma pasta do Drive</h3>
    <label class="todo">Link da pasta (compartilhada como “Qualquer pessoa com o link”)
      <input name="pasta" placeholder="https://drive.google.com/drive/folders/…"></label>
    <details class="todo" ${chaveSalva ? '' : 'open'}><summary>Chave da Google Drive API ${chaveSalva ? '✓ salva' : '(necessária, só uma vez)'}</summary>
      <label class="todo">Chave<input name="chave" value="${esc(chaveSalva)}" placeholder="AIza…" autocomplete="off"></label>
      <p class="dica">Grátis: console.cloud.google.com → crie um projeto → ative “Google Drive API” → Credenciais → Criar chave de API. Restrinja a chave ao seu site. Fica salva só neste navegador.</p>
    </details>
    <p class="dica">Pode ser a pasta de um filme (vídeo + capa), uma pasta com vários vídeos ou uma pasta com subpastas (uma por filme). Título, duração, capa, sinopse e gênero vêm sozinhos.</p>
    <div class="linha-acoes"><button type="button" class="btn p" id="dr-ler">Ler pasta</button></div>
    <p class="dica" id="dr-info"></p>
    <div id="dr-lista" class="archive-resultados todo"></div>`, async (f) => {
    const linhas = $$('[data-dr]', f).filter(l => $('[name=ok]', l).checked);
    const info = $('#dr-info', f);
    if (!st.drive?.length || !linhas.length) { info.textContent = 'Leia a pasta e marque ao menos um filme.'; return false; }
    let n = 0;
    for (const l of linhas) {
      const d = st.drive[+l.dataset.dr], min = parseFloat($('[name=min]', l).value);
      if (!(min > 0)) { info.textContent = `❌ Falta a duração de “${d.titulo}”.`; return false; }
      const categoria = $('[name=cat]', l).value;
      const reg = {
        titulo: $('[name=tit]', l).value.trim() || d.titulo, descricao: d.descricao, origem: 'drive', categoria,
        genero: d.genero || categoria, classificacao: 'L', idioma: 'Português', duracao_seg: Math.round(min * 60),
        capa_url: d.capa_url, fonte_url: d.fonte_url, legendas: [], licenca_tipo: 'Não informado', criado_por: st.uid,
      };
      info.textContent = `Salvando ${++n}/${linhas.length}…`;
      if (erro((await sb.from('filmes').insert(reg)).error)) return false;
    }
    toast(`${n} filme(s) importado(s)`, 'ok'); filmes();
  });
  $('button[value=ok]', fm).textContent = 'Importar marcados';
  const info = $('#dr-info', fm), lista = $('#dr-lista', fm);
  const ler = async () => {
    const chave = $('[name=chave]', fm).value.trim();
    if (chave) localStorage.setItem(CHAVE_LS, chave);
    lista.innerHTML = ''; st.drive = [];
    try {
      st.drive = await analisarPasta($('[name=pasta]', fm).value, chave, cats, (t) => info.textContent = t);
      const pad = st.pasta !== 'Todas' ? st.pasta : 'Outros';
      lista.innerHTML = st.drive.map((d, i) => `<article class="archive-item" data-dr="${i}">
        <img src="${esc(d.capa_url)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
        <div class="archive-meta"><label class="linha-check"><input type="checkbox" name="ok" checked style="width:auto"> <input name="tit" value="${esc(d.titulo)}"></label>
          <small>${esc(d.ano || '')}${d.genero ? ' · ' + esc(d.genero) : ''}</small>
          <p>${esc((d.descricao || 'Sem sinopse encontrada.').slice(0, 220))}</p>
          <div class="linha-acoes"><label>Minutos<input name="min" type="number" min="1" style="width:80px" value="${d.duracao_seg ? Math.round(d.duracao_seg / 60) : ''}"></label>
          <label>Pasta<select name="cat">${opc(d.categoria || pad)}</select></label></div>
          ${d.formato_ok ? '' : '<small>⚠️ MKV/AVI: o Drive pode não tocar no navegador; prefira MP4.</small>'}
        </div></article>`).join('');
      info.textContent = `✓ ${st.drive.length} filme(s) encontrado(s). Confira e clique em “Importar marcados”.`;
    } catch (e) { info.textContent = '❌ ' + e.message; }
  };
  $('#dr-ler', fm).onclick = ler;
  $('[name=pasta]', fm).addEventListener('paste', () => setTimeout(() => { if ($('[name=chave]', fm).value.trim()) ler(); }, 50));
}

async function addFila(filme) {
  const { data: ult } = await sb.from('programacao').select('posicao').order('posicao', { ascending: false }).limit(1);
  const r = await sb.from('programacao').insert({ filme, posicao: (ult?.[0]?.posicao || 0) + 1 }).select('id').single();
  return erro(r.error) ? null : r.data.id;
}

// descobre a duração do vídeo sozinho (segundos) — null se não conseguir
async function detectarDuracao(tipo, url) {
  if (tipo === 'youtube') {
    const YT = await carregarApiYouTube();
    return new Promise((ok) => {
      const div = document.createElement('div'); div.style.cssText = 'position:fixed;left:-9999px;width:320px;height:180px';
      const alvo = document.createElement('div'); div.appendChild(alvo); document.body.appendChild(div);
      let p, n = 0; const fim = (v) => { clearInterval(t); try { p?.destroy(); } catch { } div.remove(); ok(v); };
      const t = setInterval(() => { const d = p?.getDuration?.(); if (d > 0) fim(d); if (++n > 30) fim(null); }, 500);
      p = new YT.Player(alvo, { videoId: idYouTube(url), playerVars: { mute: 1, autoplay: 1, controls: 0 }, events: { onError: () => fim(null) } });
    });
  }
  if (tipo === 'link' || tipo === 'dash') return null;
  return new Promise(async (ok) => {
    const v = document.createElement('video'); v.muted = true; v.preload = 'metadata';
    const fim = (d) => { clearTimeout(t); v.removeAttribute('src'); v.load(); ok(d); };
    const t = setTimeout(() => fim(null), 15000);
    v.onloadedmetadata = () => fim(isFinite(v.duration) && v.duration > 0 ? v.duration : null);
    v.onerror = () => fim(null);
    if (tipo === 'hls' && !v.canPlayType('application/vnd.apple.mpegurl')) {
      const H = (await import('../vendor/hls.mjs')).default; const h = new H(); h.loadSource(url); h.attachMedia(v);
      v.addEventListener('loadedmetadata', () => h.destroy(), { once: true });
    } else v.src = tipo === 'drive' ? urlDriveDireto(idDrive(url)) : url;
  });
}

function formFilme(f = {}) {
  const leg = (f.legendas || []).map(l => `${l.lang}|${l.label}|${l.url}`).join('\n');
  const cats = (st.cats || []).map(c => `<option ${(f.categoria || 'Outros') === c.nome ? 'selected' : ''}>${esc(c.nome)}</option>`).join('');
  const minutos = f.duracao_seg ? Math.round(f.duracao_seg / 60) : '';
  const form = modal(`
    <h3>${f.id ? 'Editar filme' : 'Adicionar filme'}</h3>
    <div class="form-grid">
      <label class="todo"><span>Link do filme <span class="tag" id="f-tipo">—</span></span>
        <input name="fonte_url" placeholder="Cole aqui: YouTube, Internet Archive, Google Drive, .mp4, .m3u8 ou qualquer link" value="${esc(f.origem === 'upload' ? '' : f.fonte_url || '')}">
        <small class="dica">Google Drive: o arquivo precisa estar compartilhado como “Qualquer pessoa com o link”. YouTube: o vídeo precisa permitir incorporação.</small></label>
      <label class="todo linha-check"><input type="checkbox" name="usar_upload" ${f.origem === 'upload' ? 'checked' : ''} style="width:auto"> Prefiro enviar o arquivo (até 50 MB)</label>
      <label class="campo-up todo" hidden>Arquivo de vídeo<input name="arquivo" type="file" accept="video/mp4,video/webm,video/quicktime"></label>
      <label class="todo">Título<input name="titulo" required value="${esc(f.titulo || '')}"></label>
      <label>Pasta<select name="categoria">${cats}</select></label>
      <label>Duração (minutos)<span class="linha-dur"><input name="duracao" type="number" step="1" min="1" required value="${minutos}"><button type="button" class="btn" id="f-detectar">Detectar</button></span></label>
      <label class="todo">Capa (link da imagem)<input name="capa_url" value="${esc(f.capa_url || '')}" placeholder="https://… (YouTube e Drive preenchem sozinho)"></label>
      <div class="todo capa-prev"><img id="f-capa-prev" src="${esc(f.capa_url || 'icons/icon.svg')}" alt=""><label>…ou enviar imagem da capa<input name="capa_arq" type="file" accept="image/*"></label></div>
      <label class="todo">Descrição<textarea name="descricao">${esc(f.descricao || '')}</textarea></label>
      <label>Classificação<select name="classificacao">${['L', '10', '12', '14', '16', '18'].map(c => `<option ${f.classificacao === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      <label>Idioma<input name="idioma" value="${esc(f.idioma || 'Português')}"></label>
      <details class="todo"><summary>Legendas e licença (opcional)</summary><div class="form-grid">
        <label class="todo">Legendas WebVTT (uma por linha: idioma|nome|https://…/arquivo.vtt)<textarea name="legendas" placeholder="pt|Português|https://exemplo.com/pt.vtt">${esc(leg)}</textarea></label>
        <label>Tipo de licença<select name="licenca_tipo">${['Não informado', 'Domínio público', 'CC BY', 'CC BY-SA', 'CC0', 'Licença declarada (verificar)', 'Licenciado (contrato)', 'Produção própria'].map(c => `<option ${f.licenca_tipo === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
        <label>Titular dos direitos<input name="licenca_titular" value="${esc(f.licenca_titular || '')}"></label>
        <label>Validade da licença<input name="licenca_validade" type="date" value="${esc(f.licenca_validade || '')}"></label>
        <label class="todo">Detalhes da licença<textarea name="licenca_detalhes">${esc(f.licenca_detalhes || '')}</textarea></label>
      </div></details>
    </div>
    <p class="dica" id="f-validacao"></p>`, async (fm) => {
    const v = Object.fromEntries(new FormData(fm));
    const info = $('#f-validacao', fm);
    const upload = !!v.usar_upload;
    const url = (v.fonte_url || '').trim();
    if (!upload && !/^https:\/\//i.test(url)) { info.textContent = '❌ Cole um link começando com https://'; return false; }
    const origem = upload ? 'upload' : detectarTipo(url);
    const reg = {
      titulo: v.titulo.trim(), descricao: v.descricao, origem, categoria: v.categoria, classificacao: v.classificacao, idioma: v.idioma,
      duracao_seg: Math.round(parseFloat(v.duracao) * 60), licenca_tipo: v.licenca_tipo || 'Não informado', licenca_titular: v.licenca_titular,
      licenca_validade: v.licenca_validade || null, licenca_detalhes: v.licenca_detalhes, capa_url: v.capa_url || null,
      legendas: (v.legendas || '').split('\n').map(l => l.trim()).filter(Boolean).map(l => { const [lang, label, u] = l.split('|'); return { lang, label, url: u }; }),
      fonte_url: upload ? null : url, genero: v.categoria,
    };
    if (v.capa_arq?.size) {
      const caminho = `${crypto.randomUUID()}-${v.capa_arq.name.replace(/[^\w.]/g, '_')}`;
      const up = await sb.storage.from('capas').upload(caminho, v.capa_arq, { contentType: v.capa_arq.type });
      if (erro(up.error)) return false;
      reg.capa_url = urlPublica('capas', caminho);
    }
    // links de arquivo (HLS/DASH/MP4) passam pela checagem do servidor; YouTube/Drive/páginas tocam direto no telão
    if (['hls', 'dash', 'mp4'].includes(origem)) {
      info.textContent = 'Verificando o link…';
      const { data: val, error: e2 } = await sb.functions.invoke('validar-fonte', { body: { url: reg.fonte_url, origem } });
      if (e2 || !val?.ok) { info.textContent = '❌ ' + (val?.motivo || e2?.message || 'Link inválido'); return false; }
      if (val.aviso) toast(val.aviso);
    }
    if (upload && !f.arquivo_path) {
      if (!v.arquivo?.size) { info.textContent = 'Escolha o arquivo de vídeo.'; return false; }
      const caminho = `originais/${crypto.randomUUID()}-${v.arquivo.name.replace(/[^\w.]/g, '_')}`;
      info.textContent = `Enviando ${(v.arquivo.size / 1e6).toFixed(0)} MB… não feche esta janela.`;
      const up = await sb.storage.from('filmes').upload(caminho, v.arquivo, { contentType: v.arquivo.type, upsert: false });
      if (up.error) { info.textContent = '❌ ' + up.error.message + ' (o plano grátis do Supabase aceita arquivos de até 50 MB)'; return false; }
      reg.arquivo_path = caminho;
    }
    const r = f.id ? await sb.from('filmes').update(reg).eq('id', f.id) : await sb.from('filmes').insert({ ...reg, criado_por: st.uid });
    if (r.error) { info.textContent = '❌ ' + r.error.message; return false; }
    st.pasta = reg.categoria; toast('Filme salvo na pasta ' + reg.categoria, 'ok'); filmes();
  });
  const campo = $('[name=fonte_url]', form), capa = $('[name=capa_url]', form), tit = $('[name=titulo]', form), durc = $('[name=duracao]', form);
  const prev = $('#f-capa-prev', form), info = $('#f-validacao', form);
  capa.oninput = () => prev.src = capa.value || 'icons/icon.svg';
  const detectar = async () => {
    const url = campo.value.trim(); if (!/^https:\/\//i.test(url)) return;
    const tipo = detectarTipo(url);
    info.textContent = 'Detectando duração…';
    const d = await detectarDuracao(tipo, url).catch(() => null);
    if (d) { durc.value = Math.max(1, Math.round(d / 60)); info.textContent = '✓ Duração detectada'; }
    else info.textContent = tipo === 'link' ? 'Esse tipo de link não informa a duração: digite em minutos.' : 'Não consegui detectar a duração; digite em minutos.';
  };
  const analisar = async () => {
    const url = campo.value.trim(), tipo = detectarTipo(url);
    $('#f-tipo', form).textContent = url ? NOME_TIPO[tipo] : '—';
    if (!/^https:\/\//i.test(url)) return;
    if (tipo === 'archive') {
      const id = idArchive(url);
      if (id) {
        if (!capa.value) { capa.value = `https://archive.org/services/img/${encodeURIComponent(id)}`; prev.src = capa.value; }
        if (!tit.value) tit.value = id;
        info.textContent = 'Player oficial do Internet Archive. Informe a duração manualmente e confira os direitos na origem.';
      }
    }
    if (tipo === 'youtube') {
      const id = idYouTube(url);
      if (!capa.value) { capa.value = capaYouTube(id); prev.src = capa.value; }
      if (!tit.value) fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(url)).then(r => r.ok ? r.json() : null).then(j => { if (j?.title && !tit.value) tit.value = j.title; }).catch(() => { });
    }
    if (tipo === 'drive' && !capa.value) { capa.value = capaDrive(idDrive(url)); prev.src = capa.value; }
    if (!durc.value && tipo !== 'archive') detectar();
  };
  campo.addEventListener('change', analisar); campo.addEventListener('paste', () => setTimeout(analisar, 50));
  $('#f-detectar', form).onclick = detectar;
  const up = $('[name=usar_upload]', form);
  const troca = () => { $('.campo-up', form).hidden = !up.checked; campo.closest('label').hidden = up.checked; };
  up.onchange = troca; troca();
  if (campo.value) $('#f-tipo', form).textContent = NOME_TIPO[detectarTipo(campo.value)];
}

// ------------------------------------------------------------------ usuários
async function usuarios() {
  const { data, error } = await sb.rpc('perfis_admin');
  if (erro(error)) return;
  const { data: bans } = await sb.from('banimentos').select('usuario, tipo, ate, revogado_em');
  const ativo = (id) => (bans || []).find(b => b.usuario === id && !b.revogado_em && (b.tipo !== 'temporario' || new Date(b.ate) > new Date()));
  const onl = new Set(st.online.map(o => o.id));
  C.innerHTML = `<input class="busca" id="busca" placeholder="Buscar apelido ou e-mail…">
    <div class="card"><table><thead><tr><th>Apelido</th><th>E-mail</th><th>Papel</th><th>Cadastro</th><th>Último acesso</th><th>Situação</th><th></th></tr></thead><tbody id="tb">
    ${data.map(u => { const b = ativo(u.id); return `<tr data-q="${esc((u.apelido || '') + ' ' + (u.email || '')).toLowerCase()}">
      <td><b>${esc(u.apelido || '—')}</b> ${onl.has(u.id) ? '<span class="tag verde">online</span>' : ''}</td><td>${esc(u.email)}</td>
      <td>${u.papel === 'owner' ? '<span class="tag roxo">👑 owner</span>' : u.papel === 'moderador' ? '<span class="tag verde">🛡️ moderador</span>' : 'espectador'}</td><td>${dataBR(u.criado_em)}</td><td>${dataBR(u.ultimo_acesso)}</td>
      <td>${b ? `<span class="tag verm">${b.tipo}</span>` : '<span class="tag verde">ativo</span>'}</td>
      <td class="linha-acoes">${u.papel !== 'owner' ? `<button class="btn" data-modr="${u.id}" data-ativo="${u.papel === 'moderador' ? '0' : '1'}" data-nome="${esc(u.apelido || u.email)}">${u.papel === 'moderador' ? 'Remover moderador' : '🛡️ Tornar moderador'}</button><button class="btn" data-exp="${u.id}" data-nome="${esc(u.apelido || u.email)}">Expulsar</button><button class="btn v" data-ban="${u.id}" data-nome="${esc(u.apelido || u.email)}">Banir</button>` : ''}</td></tr>`; }).join('')}
    </tbody></table></div>`;
  $('#busca').oninput = (e) => $$('#tb tr').forEach(tr => tr.hidden = !tr.dataset.q.includes(e.target.value.toLowerCase()));
  $$('[data-ban]').forEach(b => b.onclick = () => formBan(b.dataset.ban, b.dataset.nome));
  $$('[data-exp]').forEach(b => b.onclick = () => expulsar(b.dataset.exp, b.dataset.nome));
  $$('[data-modr]').forEach(b => b.onclick = async () => {
    const ativo = b.dataset.ativo === '1';
    if (!confirm(ativo ? `Tornar ${b.dataset.nome} moderador? Ele poderá silenciar, expulsar e banir temporariamente nas salas.` : `Tirar ${b.dataset.nome} da moderação?`)) return;
    const { error } = await sb.rpc('definir_moderador', { p_alvo: b.dataset.modr, p_ativo: ativo });
    if (erro(error)) return;
    avisar(b.dataset.modr, 'papel');
    toast(ativo ? b.dataset.nome + ' agora é moderador 🛡️' : b.dataset.nome + ' deixou de ser moderador', 'ok'); ir(st.secao);
  });
}

// Expulsar: tira a pessoa da sala agora; ela só pode voltar depois de 10 minutos.
async function expulsar(usuario, nome) {
  if (!confirm(`Expulsar ${nome} da sala? A pessoa poderá voltar em 10 minutos.`)) return;
  const reg = { usuario, tipo: 'temporario', motivo: 'Expulso da sala pelo dono', criado_por: st.uid, ate: new Date(Date.now() + 10 * 60e3).toISOString() };
  if (erro((await sb.from('banimentos').insert(reg)).error)) return;
  avisar(usuario, 'expulsar');
  toast(nome + ' foi expulso', 'ok'); ir(st.secao);
}

function formBan(usuario, nome) {
  const form = modal(`<h3>Banir ${esc(nome)}</h3>
    <label>Modalidade<select name="tipo"><option value="temporario">Banimento temporário</option><option value="permanente">Banimento permanente</option><option value="suspensao">Suspensão preventiva (análise)</option></select></label>
    <label class="c-dur">Duração<select name="horas"><option value="1">1 hora</option><option value="24">24 horas</option><option value="72">3 dias</option><option value="168" selected>7 dias</option><option value="720">30 dias</option></select></label>
    <label>Motivo<textarea name="motivo" required minlength="3"></textarea></label>
    <p class="dica">O bloqueio vale para a identidade da conta Google (não só o e-mail). A pessoa é desconectada na hora.</p>`, async (fm) => {
    const v = Object.fromEntries(new FormData(fm));
    const reg = { usuario, tipo: v.tipo, motivo: v.motivo, criado_por: st.uid, ate: v.tipo === 'temporario' ? new Date(Date.now() + v.horas * 3600e3).toISOString() : null };
    if (erro((await sb.from('banimentos').insert(reg)).error)) return false;
    avisar(usuario, 'banir');
    toast('Banimento aplicado', 'ok'); ir(st.secao);
  });
  const t = $('[name=tipo]', form); t.onchange = () => $('.c-dur', form).hidden = t.value !== 'temporario';
}

// ------------------------------------------------------------------ mensagens
async function mensagens() {
  const { data, error } = await sb.from('mensagens').select('id, usuario, texto, removida, criado_em, perfis(apelido)').order('criado_em', { ascending: false }).limit(200);
  if (erro(error)) return;
  C.innerHTML = `<div class="card"><table><thead><tr><th>Quando</th><th>Autor</th><th>Mensagem</th><th></th></tr></thead><tbody>
    ${data.map(m => `<tr style="${m.removida ? 'opacity:.45' : ''}"><td>${dataBR(m.criado_em)}</td><td>${esc(m.perfis?.apelido)}</td><td>${esc(m.texto)}</td>
    <td class="linha-acoes">${m.removida ? '<span class="tag">removida</span>' : `<button class="btn v" data-rm="${m.id}">Remover</button>`}
    <button class="btn" data-ban="${m.usuario}" data-nome="${esc(m.perfis?.apelido)}">Banir autor</button></td></tr>`).join('')}</tbody></table></div>`;
  $$('[data-rm]').forEach(b => b.onclick = async () => { if (!erro((await sb.from('mensagens').update({ removida: true }).eq('id', b.dataset.rm)).error)) mensagens(); });
  $$('[data-ban]').forEach(b => b.onclick = () => formBan(b.dataset.ban, b.dataset.nome));
}

// ------------------------------------------------------------------ denúncias
async function denuncias() {
  const { data, error } = await sb.from('denuncias').select('*, denunciante_p:perfis!denuncias_denunciante_fkey(apelido), denunciado_p:perfis!denuncias_denunciado_fkey(apelido), mensagens(texto)').order('criado_em', { ascending: false });
  if (erro(error)) return;
  const cor = { aberta: 'verm', analisando: 'amar', resolvida: 'verde', descartada: '' };
  C.innerHTML = `<div class="card"><table><thead><tr><th>Quando</th><th>Denunciado</th><th>Por</th><th>Motivo</th><th>Status</th><th></th></tr></thead><tbody>
    ${data.map(d => `<tr><td>${dataBR(d.criado_em)}</td><td><b>${esc(d.denunciado_p?.apelido)}</b></td><td>${esc(d.denunciante_p?.apelido)}</td>
      <td>${esc(d.motivo)}${(d.mensagens?.texto || d.texto_mensagem) ? `<div class="dica">“${esc(d.mensagens?.texto || d.texto_mensagem)}”</div>` : ''}</td><td><span class="tag ${cor[d.status]}">${d.status}</span></td>
      <td class="linha-acoes">${['aberta', 'analisando'].includes(d.status) ? `
        <button class="btn" data-st="analisando" data-id="${d.id}">Analisar</button>
        <button class="btn ok" data-st="resolvida" data-id="${d.id}">Resolver</button>
        <button class="btn" data-st="descartada" data-id="${d.id}">Descartar</button>
        <button class="btn" data-exp="${d.denunciado}" data-nome="${esc(d.denunciado_p?.apelido)}">Expulsar</button>
        <button class="btn v" data-ban="${d.denunciado}" data-nome="${esc(d.denunciado_p?.apelido)}">Banir</button>` : ''}</td></tr>`).join('') || '<tr><td colspan=6 class="dica">Nenhuma denúncia.</td></tr>'}</tbody></table></div>`;
  $$('[data-st]').forEach(b => b.onclick = async () => {
    const fim = ['resolvida', 'descartada'].includes(b.dataset.st);
    if (!erro((await sb.from('denuncias').update({ status: b.dataset.st, ...(fim ? { resolvido_por: st.uid, resolvido_em: new Date().toISOString() } : {}) }).eq('id', b.dataset.id)).error)) { denuncias(); badge(); }
  });
  $$('[data-ban]').forEach(b => b.onclick = () => formBan(b.dataset.ban, b.dataset.nome));
  $$('[data-exp]').forEach(b => b.onclick = () => expulsar(b.dataset.exp, b.dataset.nome));
  $$('[data-modr]').forEach(b => b.onclick = async () => {
    const ativo = b.dataset.ativo === '1';
    if (!confirm(ativo ? `Tornar ${b.dataset.nome} moderador? Ele poderá silenciar, expulsar e banir temporariamente nas salas.` : `Tirar ${b.dataset.nome} da moderação?`)) return;
    const { error } = await sb.rpc('definir_moderador', { p_alvo: b.dataset.modr, p_ativo: ativo });
    if (erro(error)) return;
    avisar(b.dataset.modr, 'papel');
    toast(ativo ? b.dataset.nome + ' agora é moderador 🛡️' : b.dataset.nome + ' deixou de ser moderador', 'ok'); ir(st.secao);
  });
}

// ------------------------------------------------------------------ banimentos
async function banimentos() {
  const { data, error } = await sb.from('banimentos').select('*, alvo:perfis!banimentos_usuario_fkey(apelido)').order('criado_em', { ascending: false });
  if (erro(error)) return;
  const { data: sinais } = await sb.from('sinais_acesso').select('usuario, dispositivo').limit(5000);
  // reincidência: aparelhos compartilhados com contas banidas
  const banidos = new Set(data.filter(b => !b.revogado_em && b.tipo === 'permanente').map(b => b.usuario));
  const porDisp = {}; (sinais || []).forEach(s => (porDisp[s.dispositivo] ||= new Set()).add(s.usuario));
  const suspeitos = new Set();
  Object.values(porDisp).forEach(us => { if ([...us].some(u => banidos.has(u))) us.forEach(u => { if (!banidos.has(u)) suspeitos.add(u); }); });
  const vigente = (b) => !b.revogado_em && (b.tipo !== 'temporario' || new Date(b.ate) > new Date());
  C.innerHTML = `
    ${suspeitos.size ? `<div class="card"><h3>⚠️ Possível reincidência</h3><p class="dica">${suspeitos.size} conta(s) usaram o mesmo aparelho que uma conta banida permanentemente. Elas recebem suspensão preventiva automática para você analisar.</p></div>` : ''}
    <div class="card"><h3>Histórico</h3><table><thead><tr><th>Quando</th><th>Usuário</th><th>Tipo</th><th>Motivo</th><th>Até</th><th>Situação</th><th></th></tr></thead><tbody>
    ${data.map(b => `<tr><td>${dataBR(b.criado_em)}</td><td><b>${esc(b.alvo?.apelido || '—')}</b></td><td>${b.tipo}</td><td>${esc(b.motivo)}</td><td>${b.ate ? dataBR(b.ate) : '—'}</td>
      <td>${vigente(b) ? '<span class="tag verm">vigente</span>' : b.revogado_em ? '<span class="tag">revogado</span>' : '<span class="tag">expirado</span>'}</td>
      <td>${vigente(b) ? `<button class="btn" data-rev="${b.id}">Revogar</button>` : ''}</td></tr>`).join('') || '<tr><td colspan=7 class="dica">Nenhum banimento.</td></tr>'}</tbody></table></div>`;
  $$('[data-rev]').forEach(b => b.onclick = async () => {
    if (!erro((await sb.from('banimentos').update({ revogado_em: new Date().toISOString(), revogado_por: st.uid }).eq('id', b.dataset.rev)).error)) { toast('Revogado', 'ok'); banimentos(); }
  });
}

// ------------------------------------------------------------------ moderação (bans + silenciamentos ativos)
async function moderacao() {
  const agora = new Date().toISOString();
  const [bans, sils, log] = await Promise.all([
    sb.from('banimentos').select('id, usuario, tipo, motivo, ate, criado_em, alvo:perfis!banimentos_usuario_fkey(apelido)').is('revogado_em', null).or('ate.is.null,ate.gt.' + agora).order('criado_em', { ascending: false }),
    sb.from('silenciamentos').select('id, usuario, tipo, motivo, ate, criado_em, alvo:perfis!silenciamentos_usuario_fkey(apelido)').is('revogado_em', null).or('ate.is.null,ate.gt.' + agora).order('criado_em', { ascending: false }),
    sb.from('auditoria').select('criado_em, acao, dados').or('acao.like.MODERAR_%,acao.eq.REVOGAR,acao.like.AJUDA_%').order('criado_em', { ascending: false }).limit(100),
  ]);
  if (erro(bans.error)) return;
  const semSil = !!sils.error;   // migration 007 ainda não aplicada
  const nomes = { voz: '🎙️ Voz', texto: '💬 Mensagens', ajuda: '🆘 Pedidos de ajuda' };
  const linha = (r, tab, tipo) => `<tr><td><b>${esc(r.alvo?.apelido || '—')}</b></td><td>${tipo}</td><td>${esc(r.motivo || '—')}</td><td>${r.ate ? dataBR(r.ate) : 'até revogar'}</td><td>${dataBR(r.criado_em)}</td>
    <td><button class="btn" data-rev="${r.id}" data-tab="${tab}" data-alvo="${r.usuario}">Revogar</button></td></tr>`;
  C.innerHTML = `
    <div class="card"><h3>⛔ Banimentos vigentes (site inteiro)</h3><table><thead><tr><th>Usuário</th><th>Tipo</th><th>Motivo</th><th>Até</th><th>Desde</th><th></th></tr></thead><tbody>
      ${bans.data.map(b => linha(b, 'banimentos', b.tipo)).join('') || '<tr><td colspan=6 class="dica">Ninguém banido agora.</td></tr>'}</tbody></table></div>
    <div class="card"><h3>🔇 Silenciamentos vigentes</h3>${semSil ? '<p class="dica">Disponível depois de aplicar a migration 007.</p>' : `<table><thead><tr><th>Usuário</th><th>O quê</th><th>Motivo</th><th>Até</th><th>Desde</th><th></th></tr></thead><tbody>
      ${sils.data.map(x => linha(x, 'silenciamentos', nomes[x.tipo])).join('') || '<tr><td colspan=6 class="dica">Ninguém silenciado agora.</td></tr>'}</tbody></table>`}</div>
    <div class="card"><h3>🧾 Histórico de moderação</h3><table><thead><tr><th>Quando</th><th>Ação</th><th>Alvo</th><th>Sala</th><th>Motivo</th><th>Até</th></tr></thead><tbody>
      ${(log.data || []).map(a => `<tr><td>${dataBR(a.criado_em)}</td><td><span class="tag roxo">${esc(a.acao)}</span></td><td class="dica">${esc(String(a.dados?.target_id || '').slice(0, 8))}</td><td>${esc(a.dados?.sala ? nomeSala(a.dados.sala) : '—')}</td><td>${esc(a.dados?.motivo || '—')}</td><td>${a.dados?.ate ? dataBR(a.dados.ate) : '—'}</td></tr>`).join('') || '<tr><td colspan=6 class="dica">Sem ações ainda.</td></tr>'}</tbody></table></div>`;
  $$('[data-rev]').forEach(b => b.onclick = async () => {
    if (!confirm('Revogar esta punição?')) return;
    if (erro((await sb.rpc('revogar_moderacao', { p_tabela: b.dataset.tab, p_id: b.dataset.rev })).error)) return;
    avisar(b.dataset.alvo, 'revogar'); toast('Revogado', 'ok'); moderacao();
  });
}

// ------------------------------------------------------------------ pedidos de ajuda (últimos 30 min)
let canalAjuda = null;
async function ajuda() {
  const { data, error } = await sb.from('pedidos_ajuda').select('id, usuario, sala, criado_em, status, perfis!pedidos_ajuda_usuario_fkey(apelido, avatar)')
    .gt('criado_em', new Date(Date.now() - 30 * 60e3).toISOString()).order('criado_em', { ascending: false });
  if (error) { C.innerHTML = '<p class="dica">Pedidos de ajuda ficam disponíveis depois de aplicar a migration 007.</p>'; return; }
  const pend = data.filter(p => p.status === 'pendente').length;
  $('#badge-ajuda').textContent = pend || '';
  C.innerHTML = `<div class="card"><h3>🆘 Pedidos dos últimos 30 minutos</h3><table><thead><tr><th>Quando</th><th>Quem</th><th>Sala</th><th>Situação</th><th></th></tr></thead><tbody>
    ${data.map(p => `<tr><td>${dataBR(p.criado_em)}</td><td><b>${esc(p.perfis?.apelido || '—')}</b></td><td>${esc(nomeSala(p.sala, st.salas.get(p.sala)?.titulo))}</td>
      <td><span class="tag ${p.status === 'pendente' ? 'amar' : ''}">${p.status}</span></td>
      <td class="linha-acoes">${p.status === 'pendente' ? `<button class="btn p" data-ir="${p.id}" data-sala="${esc(p.sala)}">Ir para a sala</button><button class="btn" data-ign="${p.id}">Ignorar</button>` : ''}
      <button class="btn" data-pausa="${p.usuario}" data-sala="${esc(p.sala)}" title="Pausar pedidos desta pessoa por 1 hora">Pausar 1 h</button></td></tr>`).join('') || '<tr><td colspan=5 class="dica">Nenhum pedido.</td></tr>'}</tbody></table></div>`;
  $$('[data-ir]').forEach(b => b.onclick = async () => { if (!erro((await sb.rpc('atender_pedido_ajuda', { p_id: b.dataset.ir, p_status: 'atendido' })).error)) location.href = urlSala(b.dataset.sala); });
  $$('[data-ign]').forEach(b => b.onclick = async () => { if (!erro((await sb.rpc('atender_pedido_ajuda', { p_id: b.dataset.ign, p_status: 'ignorado' })).error)) ajuda(); });
  $$('[data-pausa]').forEach(b => b.onclick = async () => { if (!erro((await sb.rpc('moderar', { p_alvo: b.dataset.pausa, p_acao: 'silenciar_ajuda', p_minutos: 60, p_motivo: null, p_sala: b.dataset.sala })).error)) toast('Pedidos pausados por 1 h', 'ok'); });
  if (!canalAjuda) canalAjuda = sb.channel('ajuda-painel').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pedidos_ajuda' }, () => {
    toast('🆘 Novo pedido de ajuda'); if (st.secao === 'ajuda') ajuda(); else $('#badge-ajuda').textContent = (+$('#badge-ajuda').textContent || 0) + 1;
  }).subscribe();
}

// ------------------------------------------------------------------ Câmeras das Salas
// Cada sala com gente ganha uma miniatura AO VIVO: a própria sala 3D aberta num quadro pequeno
// (index.html?observar=<sala>&mini=1), vista da câmera de segurança do fundo, com o filme passando
// no mesmo ponto, sem som e sem o criador aparecer. Para não pesar, no máximo MAX_AO_VIVO ao vivo e só
// as que estão visíveis na tela; as outras usam o desenho esquemático leve.
// "Assistir ao vivo" abre a sala inteira nesse modo, com a opção de ouvir a conversa.
const MAX_PREVIAS = 12, MAX_AO_VIVO = 4, ATUALIZA_MS = 5000;
const SEM_PREVIA = { youtube: 1, drive: 1, link: 1, archive: 1 };
const capas = new Map();
let camTimer = null, camObs = null;
const urlObservar = (sala, mini) => 'index.html?observar=' + encodeURIComponent(sala) + (mini ? '&mini=1' : '');
function pararCameras() { clearInterval(camTimer); camTimer = null; camObs?.disconnect(); camObs = null; }
async function cameras() {
  C.innerHTML = `<p class="dica">Câmeras ao vivo de cada sala: a sala 3D de verdade, com as pessoas e o filme passando, vista da câmera do fundo. Ninguém vê você. Toque em <b>Assistir ao vivo</b> para abrir em tela cheia e ouvir a conversa.</p><div class="grade-cameras" id="cams"></div>`;
  pararCameras();
  camObs = new IntersectionObserver((es) => es.forEach(e => { e.target.dataset.visivel = e.isIntersecting ? '1' : ''; ligarAoVivo(); }));
  desenharCameras();
  camTimer = setInterval(() => { if (!document.hidden) desenharCameras(true); }, ATUALIZA_MS);
}
// liga o quadro ao vivo nas primeiras salas visíveis e desliga nas outras (libera memória e rede)
function ligarAoVivo() {
  const cams = [...document.querySelectorAll('#cams .cam')];
  let n = 0;
  cams.forEach(c => {
    const quer = c.dataset.visivel === '1' && n < MAX_AO_VIVO; if (quer) n++;
    const fr = c.querySelector('iframe');
    if (quer && !fr) {
      const f = document.createElement('iframe');
      f.src = urlObservar(c.dataset.sala, true); f.title = 'Câmera ao vivo'; f.setAttribute('allow', 'autoplay');
      f.setAttribute('tabindex', '-1'); f.className = 'cam-vivo-quadro';
      c.querySelector('.cam-tela').prepend(f); c.classList.add('ao-vivo');
    } else if (!quer && fr) { fr.remove(); c.classList.remove('ao-vivo'); }
  });
}
function desenharCameras(soMiniaturas = false) {
  const box = $('#cams'); if (!box) return;
  const salas = [...st.salas.values()].filter(s => s.pessoas.size).sort((a, b) => b.pessoas.size - a.pessoas.size);
  if (!soMiniaturas) {
    // atualiza sem recriar os quadros que já estão ao vivo
    const vivas = new Set(salas.map(s => s.sala));
    box.querySelectorAll('.cam').forEach(c => { if (!vivas.has(c.dataset.sala)) { camObs?.unobserve(c); c.remove(); } });
    box.querySelector('.cam-vazia')?.remove();
    salas.forEach((s, i) => {
      let c = box.querySelector(`.cam[data-sala="${CSS.escape(s.sala)}"]`);
      if (!c) {
        c = document.createElement('div'); c.className = 'cam'; c.dataset.sala = s.sala;
        c.innerHTML = `<div class="cam-tela">${i < MAX_PREVIAS ? '<canvas width="320" height="180"></canvas>' : '<div class="cam-sem">Miniatura pausada (muitas salas)</div>'}<span class="cam-rec">● REC</span></div>
          <div class="cam-info"><b></b><small class="cam-linha"></small><small class="cam-fonte"></small>
          <div class="linha-acoes"><a class="btn p" data-assistir>👁 Assistir ao vivo</a><a class="btn" data-entrar>Entrar na sala</a></div></div>`;
        camObs?.observe(c);
      }
      box.appendChild(c);   // mantém a ordem (mais gente primeiro)
      c.querySelector('canvas')?.setAttribute('aria-label', 'Miniatura da ' + nomeSala(s.sala, s.titulo));
      c.querySelector('.cam-info b').textContent = nomeSala(s.sala, s.titulo);
      c.querySelector('.cam-linha').innerHTML = `<span class="cam-vivo">● ao vivo</span> · ${s.pessoas.size} espectador${s.pessoas.size > 1 ? 'es' : ''}${s.titulo && s.sala === 'sala-principal' ? ' · ' + esc(s.titulo) : ''}`;
      c.querySelector('.cam-fonte').textContent = [...s.pessoas.values()].map(p => p.apelido).filter(Boolean).slice(0, 6).join(', ');
      c.querySelector('[data-assistir]').href = urlObservar(s.sala, false);
      c.querySelector('[data-entrar]').href = urlSala(s.sala);
    });
    if (!salas.length) box.innerHTML = '<div class="card cam-vazia"><p class="dica">Nenhuma sala com gente agora.</p></div>';
    ligarAoVivo();
  }
  box.querySelectorAll('.cam:not(.ao-vivo)').forEach(c => {   // salas sem quadro ao vivo: desenho leve
    const s = st.salas.get(c.dataset.sala), cv = c.querySelector('canvas');
    if (s && cv) miniatura(cv, s);
  });
}
function miniatura(cv, s) {
  const g = cv.getContext('2d'), W = cv.width, H = cv.height;
  g.fillStyle = '#0b0710'; g.fillRect(0, 0, W, H);
  // telão
  const tx = 40, ty = 12, tw = W - 80, th = 64;
  g.fillStyle = '#000'; g.fillRect(tx, ty, tw, th);
  let img = s.capa && capas.get(s.capa);
  if (s.capa && !img) { img = new Image(); img.referrerPolicy = 'no-referrer'; img.src = s.capa; img.onload = () => miniatura(cv, s); capas.set(s.capa, img); }
  if (img?.complete && img.naturalWidth) { g.globalAlpha = .55; g.drawImage(img, tx, ty, tw, th); g.globalAlpha = 1; }
  g.strokeStyle = '#ff2d55'; g.lineWidth = 2; g.strokeRect(tx, ty, tw, th);
  g.fillStyle = '#fff'; g.font = 'bold 11px system-ui'; g.textAlign = 'center';
  g.fillText((s.titulo || nomeSala(s.sala)).slice(0, 40), W / 2, ty + th / 2);
  g.font = '9px system-ui'; g.fillStyle = '#cfc6dd';
  g.fillText(SEM_PREVIA[s.fonte] ? 'prévia indisponível' : 'capa', W / 2, ty + th / 2 + 14);
  // poltronas (3 blocos por lado do corredor) e avatares por ordem de chegada
  const pessoas = [...s.pessoas.values()].sort((a, b) => (b.papel === 'owner') - (a.papel === 'owner') || (a.desde || 0) - (b.desde || 0));
  const filas = 4, porFila = 12, sx = 26, sy = 92, dx = (W - 2 * sx) / porFila, dy = 20;
  let k = 0;
  for (let f = 0; f < filas; f++) for (let c = 0; c < porFila; c++) {
    const x = sx + c * dx + dx / 2 + (c >= porFila / 2 ? 6 : -6), y = sy + f * dy;
    g.fillStyle = '#5b1424'; g.fillRect(x - 7, y - 6, 14, 12);
    const p = pessoas[k++];
    if (p) {
      g.fillStyle = /^#[0-9a-f]{3,8}$/i.test(p.cor || '') ? p.cor : '#7c3aed';
      g.beginPath(); g.arc(x, y - 2, 6, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff'; g.font = 'bold 8px system-ui'; g.fillText(String(p.apelido || '?')[0].toUpperCase(), x, y + 1);
    }
  }
  if (pessoas.length > filas * porFila) { g.fillStyle = '#fff'; g.font = '10px system-ui'; g.fillText('+' + (pessoas.length - filas * porFila), W - 16, H - 6); }
}

// ------------------------------------------------------------------ acessos / auditoria
async function acessos() {
  const { data, error } = await sb.from('acessos').select('criado_em, plataforma, perfis(apelido)').order('criado_em', { ascending: false }).limit(300);
  if (erro(error)) return;
  C.innerHTML = `<div class="card"><table><thead><tr><th>Quando</th><th>Usuário</th><th>Plataforma</th></tr></thead><tbody>
    ${data.map(a => `<tr><td>${dataBR(a.criado_em)}</td><td>${esc(a.perfis?.apelido || '—')}</td><td>${esc(a.plataforma)}</td></tr>`).join('')}</tbody></table></div>`;
}
async function auditoria() {
  const { data, error } = await sb.from('auditoria').select('*').order('criado_em', { ascending: false }).limit(300);
  if (erro(error)) return;
  C.innerHTML = `<div class="card"><table><thead><tr><th>Quando</th><th>Ação</th><th>Tabela</th><th>Registro</th><th>Detalhes</th></tr></thead><tbody>
    ${data.map(a => `<tr><td>${dataBR(a.criado_em)}</td><td><span class="tag roxo">${esc(a.acao)}</span></td><td>${esc(a.tabela)}</td><td class="dica">${esc((a.registro || '').slice(0, 8))}</td>
    <td class="dica">${esc(JSON.stringify(a.dados || '').slice(0, 140))}</td></tr>`).join('')}</tbody></table></div>`;
}

// ------------------------------------------------------------------ configurações
async function anuncios() {
  const { data, error } = await sb.from('anuncios_parede').select('posicao,tipo,url');
  if (st.secao !== 'anuncios') return;
  if (error) {
    if (error.code === 'PGRST205') {
      C.innerHTML = '<p class="dica">Ative os anúncios no Supabase aplicando a migração 011_anuncios_parede.sql.</p>';
      return;
    }
    throw error;
  }
  const tipos = { auto: 'Automático', foto: 'Foto', video: 'Vídeo', pagina: 'Página incorporável' };
  const formatos = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif',
    'video/mp4': 'mp4', 'video/webm': 'webm',
  };
  const paineis = new Map(data.map(registro => [registro.posicao, registro]));
  C.innerHTML = `<p class="dica">Os painéis são numerados do telão para o fundo, olhando da plateia. Para exibir só a foto ou o vídeo, envie o arquivo original ou use um link direto. Players incorporados, como o do YouTube, podem mostrar a marca da plataforma. Para limpar um painel, apague o link e salve.</p>
    ${POSICOES_ANUNCIOS.map((nome, i) => {
      const posicao = i + 1;
      const { tipo, url } = paineis.get(posicao) || {};
      return `<form class="card" data-posicao="${posicao}">
        <h3>${nome}</h3>
        <div class="form-grid">
          <label>Tipo<select name="tipo">${Object.entries(tipos).map(([id, rotulo]) =>
            `<option value="${id}" ${tipo === id ? 'selected' : ''}>${rotulo}</option>`).join('')}</select></label>
          <label>Link<input type="url" name="url" maxlength="2048" placeholder="https://…" value="${esc(url || '')}"></label>
          <label>Ou envie um arquivo<input type="file" name="arquivo" accept="${Object.keys(formatos).join(',')}"></label>
        </div>
        <div class="linha-acoes"><button class="btn p" type="submit">Salvar</button><span role="status"></span></div>
      </form>`;
    }).join('')}`;
  $$('form[data-posicao]', C).forEach(form => form.onsubmit = async e => {
    e.preventDefault();
    const campos = new FormData(form);
    const valor = campos.get('url').trim();
    const arquivo = campos.get('arquivo');
    const enviando = !!arquivo?.name;
    const extensao = enviando ? formatos[arquivo.type] : null;
    let url = valor ? urlAnuncio(valor) : null;
    let tipo = campos.get('tipo');
    if (enviando && !extensao) return toast('Escolha uma foto JPEG, PNG, WebP, GIF ou AVIF, ou um vídeo MP4 ou WebM.', 'erro');
    if (!enviando && valor && !url) return toast('Use um link HTTP ou HTTPS válido, sem credenciais.', 'erro');

    const botao = $('button[type=submit]', form);
    const status = $('[role=status]', form);
    botao.disabled = true;
    status.textContent = 'Salvando…';
    try {
      if (enviando) {
        tipo = arquivo.type.startsWith('image/') ? 'foto' : 'video';
        const bucket = tipo === 'foto' ? 'capas' : 'filmes';
        const caminho = `anuncios/${crypto.randomUUID()}.${extensao}`;
        status.textContent = 'Enviando arquivo…';
        const { error: erroUpload } = await sb.storage.from(bucket).upload(caminho, arquivo, { contentType: arquivo.type });
        if (erroUpload) throw erroUpload;
        url = urlAnuncio(urlPublica(bucket, caminho));
        if (!url) throw new Error('O armazenamento não retornou um link público válido.');
        form.elements.url.value = url.href;
        form.elements.tipo.value = tipo;
        form.elements.arquivo.value = '';
        status.textContent = 'Salvando…';
      }
      const { error } = await sb.from('anuncios_parede')
        .update({ tipo, url: url?.href ?? null })
        .eq('posicao', Number(form.dataset.posicao)).select('posicao').single();
      if (error) throw error;
      status.textContent = url ? 'Anúncio salvo.' : 'Painel limpo.';
    } catch (error) {
      status.textContent = 'Falha ao salvar.';
      erro(error);
    } finally {
      botao.disabled = false;
    }
  });
}

async function config() {
  const { data: c, error } = await sb.from('configuracoes').select('*').eq('id', 1).single();
  if (erro(error)) return;
  C.innerHTML = `<form class="card" id="f-cfg"><h3>Configurações gerais do cinema</h3><div class="form-grid">
    <label>Nome do cinema<input name="nome_cinema" value="${esc(c.nome_cinema)}"></label>
    <label>Slogan<input name="slogan" value="${esc(c.slogan)}"></label>
    <label class="todo">Mensagem de boas-vindas<textarea name="boas_vindas">${esc(c.boas_vindas)}</textarea></label>
    <label>Chat ativo<select name="chat_ativo"><option value="true" ${c.chat_ativo ? 'selected' : ''}>Sim</option><option value="false" ${!c.chat_ativo ? 'selected' : ''}>Não</option></select></label>
    <label>Intervalo mínimo entre mensagens (s)<input name="intervalo_chat_seg" type="number" min="0" max="60" value="${c.intervalo_chat_seg}"></label>
    <label>Lotação máxima<input name="lotacao" type="number" min="10" max="500" value="${c.lotacao}"></label>
    <label class="todo">Palavras bloqueadas no chat (separe por vírgula)<input name="palavras" value="${esc((c.palavras_bloqueadas || []).join(', '))}"></label>
    </div><div class="linha-acoes" style="margin-top:12px"><button class="btn p">Salvar</button></div></form>`;
  $('#f-cfg').onsubmit = async (e) => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(e.target));
    const reg = { nome_cinema: v.nome_cinema, slogan: v.slogan, boas_vindas: v.boas_vindas, chat_ativo: v.chat_ativo === 'true',
      intervalo_chat_seg: +v.intervalo_chat_seg, lotacao: +v.lotacao, palavras_bloqueadas: v.palavras.split(',').map(s => s.trim()).filter(Boolean) };
    if (!erro((await sb.from('configuracoes').update(reg).eq('id', 1)).error)) toast('Configurações salvas', 'ok');
  };
}

badge();
ir(SECOES[location.hash.slice(1)] ? location.hash.slice(1) : 'dashboard');
