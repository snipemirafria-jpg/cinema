// Painel do criador (OWNER). Toda permissão é garantida no banco (RLS + funções),
// esta tela só organiza as ferramentas.
import { sb, esc, toast, urlPublica } from './supa.js';
import { detectarTipo, NOME_TIPO, idYouTube, idDrive, urlDriveDireto, capaYouTube, capaDrive, carregarApiYouTube } from './fontes.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const C = $('#conteudo');
const st = { online: [], secao: 'dashboard', uid: null };
const dataBR = (d) => d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
const dur = (s) => { s = +s || 0; const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60); return (h ? h + 'h ' : '') + m + 'min'; };
const erro = (e) => { if (e) { toast(e.message || String(e), 'erro'); return true; } return false; };

// ------------------------------------------------------------------ acesso
const { data: { session } } = await sb.auth.getSession();
if (!session) location.href = './';
st.uid = session.user.id;
const { data: ehOwner } = await sb.rpc('eh_owner');
if (!ehOwner) { $('#bloqueio').textContent = 'Acesso restrito ao proprietário do Cine Online.'; throw new Error('sem permissão'); }
$('#bloqueio').hidden = true; $('#layout').hidden = false;
$('#eu').textContent = '👑 ' + (session.user.email || '');

// presença: observa a sala sem aparecer nela
const canal = sb.channel('sala-principal');
canal.on('presence', { event: 'sync' }, () => {
  st.online = Object.values(canal.presenceState()).map(a => a[0]).filter(Boolean);
  if (st.secao === 'dashboard') $('#n-online') && ($('#n-online').textContent = st.online.length, $('#n-assistindo').textContent = st.online.length);
}).subscribe();

// ------------------------------------------------------------------ navegação
const SECOES = { dashboard, programacao, filmes, usuarios, mensagens, denuncias, banimentos, acessos, auditoria, config };
$$('nav button').forEach(b => b.onclick = () => ir(b.dataset.sec));
$('#menu-mob').onclick = () => $('#lateral').classList.toggle('aberta');
function ir(sec) {
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
    <div class="linha-acoes"><button class="btn p" id="f-novo">+ Adicionar filme por link</button><button class="btn" id="f-pasta">+ Nova pasta</button></div>
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
        <input name="fonte_url" placeholder="Cole aqui: YouTube, Google Drive, .mp4, .m3u8 ou qualquer link" value="${esc(f.origem === 'upload' ? '' : f.fonte_url || '')}">
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
        <label>Tipo de licença<select name="licenca_tipo">${['Não informado', 'Domínio público', 'CC BY', 'CC BY-SA', 'CC0', 'Licenciado (contrato)', 'Produção própria'].map(c => `<option ${f.licenca_tipo === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
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
    if (tipo === 'youtube') {
      const id = idYouTube(url);
      if (!capa.value) { capa.value = capaYouTube(id); prev.src = capa.value; }
      if (!tit.value) fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(url)).then(r => r.ok ? r.json() : null).then(j => { if (j?.title && !tit.value) tit.value = j.title; }).catch(() => { });
    }
    if (tipo === 'drive' && !capa.value) { capa.value = capaDrive(idDrive(url)); prev.src = capa.value; }
    if (!durc.value) detectar();
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
      <td>${u.papel === 'owner' ? '<span class="tag roxo">👑 owner</span>' : 'espectador'}</td><td>${dataBR(u.criado_em)}</td><td>${dataBR(u.ultimo_acesso)}</td>
      <td>${b ? `<span class="tag verm">${b.tipo}</span>` : '<span class="tag verde">ativo</span>'}</td>
      <td class="linha-acoes">${u.papel !== 'owner' ? `<button class="btn" data-exp="${u.id}" data-nome="${esc(u.apelido || u.email)}">Expulsar</button><button class="btn v" data-ban="${u.id}" data-nome="${esc(u.apelido || u.email)}">Banir</button>` : ''}</td></tr>`; }).join('')}
    </tbody></table></div>`;
  $('#busca').oninput = (e) => $$('#tb tr').forEach(tr => tr.hidden = !tr.dataset.q.includes(e.target.value.toLowerCase()));
  $$('[data-ban]').forEach(b => b.onclick = () => formBan(b.dataset.ban, b.dataset.nome));
  $$('[data-exp]').forEach(b => b.onclick = () => expulsar(b.dataset.exp, b.dataset.nome));
}

// Expulsar: tira a pessoa da sala agora; ela só pode voltar depois de 10 minutos.
async function expulsar(usuario, nome) {
  if (!confirm(`Expulsar ${nome} da sala? A pessoa poderá voltar em 10 minutos.`)) return;
  const reg = { usuario, tipo: 'temporario', motivo: 'Expulso da sala pelo dono', criado_por: st.uid, ate: new Date(Date.now() + 10 * 60e3).toISOString() };
  if (erro((await sb.from('banimentos').insert(reg)).error)) return;
  canal.send({ type: 'broadcast', event: 'moderacao', payload: { alvo: usuario } });
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
    canal.send({ type: 'broadcast', event: 'moderacao', payload: { alvo: usuario } });
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
      <td>${esc(d.motivo)}${d.mensagens ? `<div class="dica">“${esc(d.mensagens.texto)}”</div>` : ''}</td><td><span class="tag ${cor[d.status]}">${d.status}</span></td>
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
