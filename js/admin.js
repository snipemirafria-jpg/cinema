// Painel do criador (OWNER). Toda permissão é garantida no banco (RLS + funções),
// esta tela só organiza as ferramentas.
import { sb, esc, toast, urlPublica } from './supa.js';

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

// ------------------------------------------------------------------ filmes
async function filmes() {
  const { data, error } = await sb.from('filmes').select('*').order('criado_em', { ascending: false });
  if (erro(error)) return;
  const { data: procs } = await sb.from('processamentos').select('filme, status, log').order('criado_em', { ascending: false });
  const proc = Object.fromEntries((procs || []).reverse().map(p => [p.filme, p]));
  C.innerHTML = `<div class="linha-acoes"><button class="btn p" id="f-novo">+ Novo filme</button></div>
    <div class="card"><table><thead><tr><th></th><th>Título</th><th>Origem</th><th>Duração</th><th>Licença</th><th>Status</th><th></th></tr></thead><tbody>
    ${data.map(f => `<tr><td><img class="capa" src="${esc(f.capa_url || 'icons/icon.svg')}"></td><td><b>${esc(f.titulo)}</b><div class="dica">${esc(f.genero || '')} · ${esc(f.classificacao || '')} · ${esc(f.idioma || '')}</div></td>
      <td><span class="tag">${f.origem.toUpperCase()}</span></td><td>${dur(f.duracao_seg)}</td><td>${esc(f.licenca_tipo)}</td>
      <td><span class="tag ${f.status === 'pronto' ? 'verde' : f.status === 'erro' ? 'verm' : 'amar'}">${f.status}</span>${proc[f.id] && f.origem === 'upload' ? `<div class="dica">HLS: ${proc[f.id].status}</div>` : ''}</td>
      <td class="linha-acoes"><button class="btn" data-ed="${f.id}">Editar</button><button class="btn v" data-del="${f.id}">Excluir</button></td></tr>`).join('')}
    </tbody></table></div>`;
  $('#f-novo').onclick = () => formFilme();
  $$('[data-ed]').forEach(b => b.onclick = () => formFilme(data.find(f => f.id === b.dataset.ed)));
  $$('[data-del]').forEach(b => b.onclick = async () => {
    if (!confirm('Excluir este filme? Ele sai também da programação.')) return;
    if (!erro((await sb.from('filmes').delete().eq('id', b.dataset.del)).error)) { toast('Excluído', 'ok'); filmes(); }
  });
}

function formFilme(f = {}) {
  const leg = (f.legendas || []).map(l => `${l.lang}|${l.label}|${l.url}`).join('\n');
  const form = modal(`
    <h3>${f.id ? 'Editar filme' : 'Novo filme'}</h3>
    <div class="form-grid">
      <label class="todo">Título<input name="titulo" required value="${esc(f.titulo || '')}"></label>
      <label class="todo">Descrição<textarea name="descricao">${esc(f.descricao || '')}</textarea></label>
      <label>Origem<select name="origem">
        ${[['hls', 'Fonte HLS (.m3u8)'], ['dash', 'Fonte MPEG-DASH (.mpd)'], ['mp4', 'Endereço de vídeo (.mp4/.webm)'], ['upload', 'Upload de arquivo']].map(([v, n]) => `<option value="${v}" ${f.origem === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="campo-url">Endereço do vídeo<input name="fonte_url" type="url" placeholder="https://…" value="${esc(f.fonte_url || '')}"></label>
      <label class="campo-up" hidden>Arquivo de vídeo<input name="arquivo" type="file" accept="video/mp4,video/webm,video/quicktime"></label>
      <label>Duração (minutos)<input name="duracao" type="number" step="0.1" min="0.1" required value="${f.duracao_seg ? (f.duracao_seg / 60).toFixed(1) : ''}"></label>
      <label>Capa (URL https)<input name="capa_url" value="${esc(f.capa_url || '')}" placeholder="https://… ou envie abaixo"></label>
      <label>…ou enviar capa<input name="capa_arq" type="file" accept="image/*"></label>
      <label>Gênero<input name="genero" value="${esc(f.genero || '')}"></label>
      <label>Classificação<select name="classificacao">${['L', '10', '12', '14', '16', '18'].map(c => `<option ${f.classificacao === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      <label>Idioma<input name="idioma" value="${esc(f.idioma || '')}"></label>
      <label class="todo">Legendas WebVTT (uma por linha: idioma|nome|https://…/arquivo.vtt)<textarea name="legendas" placeholder="pt|Português|https://exemplo.com/pt.vtt">${esc(leg)}</textarea></label>
      <label>Tipo de licença<select name="licenca_tipo" required>${['Domínio público', 'CC BY', 'CC BY 3.0', 'CC BY-SA', 'CC0', 'Licenciado (contrato)', 'Produção própria'].map(c => `<option ${f.licenca_tipo === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      <label>Titular dos direitos<input name="licenca_titular" value="${esc(f.licenca_titular || '')}"></label>
      <label>Validade da licença<input name="licenca_validade" type="date" value="${esc(f.licenca_validade || '')}"></label>
      <label class="todo">Detalhes da licença<textarea name="licenca_detalhes">${esc(f.licenca_detalhes || '')}</textarea></label>
    </div>
    <p class="dica" id="f-validacao"></p>`, async (fm) => {
    const v = Object.fromEntries(new FormData(fm));
    const reg = {
      titulo: v.titulo.trim(), descricao: v.descricao, origem: v.origem, genero: v.genero, classificacao: v.classificacao, idioma: v.idioma,
      duracao_seg: Math.round(parseFloat(v.duracao) * 60), licenca_tipo: v.licenca_tipo, licenca_titular: v.licenca_titular,
      licenca_validade: v.licenca_validade || null, licenca_detalhes: v.licenca_detalhes, capa_url: v.capa_url || null,
      legendas: v.legendas.split('\n').map(l => l.trim()).filter(Boolean).map(l => { const [lang, label, url] = l.split('|'); return { lang, label, url }; }),
      fonte_url: v.origem === 'upload' ? null : v.fonte_url.trim(),
    };
    const info = $('#f-validacao', fm);
    // capa enviada
    if (v.capa_arq?.size) {
      const caminho = `${crypto.randomUUID()}-${v.capa_arq.name.replace(/[^\w.]/g, '_')}`;
      const up = await sb.storage.from('capas').upload(caminho, v.capa_arq, { contentType: v.capa_arq.type });
      if (erro(up.error)) return false;
      reg.capa_url = urlPublica('capas', caminho);
    }
    // validação do endereço no servidor (SSRF, tipo de conteúdo, CORS)
    if (reg.fonte_url) {
      info.textContent = 'Validando endereço no servidor…';
      const { data: val, error: e2 } = await sb.functions.invoke('validar-fonte', { body: { url: reg.fonte_url, origem: reg.origem } });
      if (e2 || !val?.ok) { info.textContent = '❌ ' + (val?.motivo || e2?.message || 'Endereço inválido'); return false; }
      if (val.aviso) toast(val.aviso);
    }
    if (v.origem === 'upload' && !f.arquivo_path) {
      if (!v.arquivo?.size) { info.textContent = 'Escolha o arquivo de vídeo.'; return false; }
      const caminho = `originais/${crypto.randomUUID()}-${v.arquivo.name.replace(/[^\w.]/g, '_')}`;
      info.textContent = `Enviando ${(v.arquivo.size / 1e6).toFixed(0)} MB… não feche esta janela.`;
      const up = await sb.storage.from('filmes').upload(caminho, v.arquivo, { contentType: v.arquivo.type, upsert: false });
      if (up.error) { info.textContent = '❌ ' + up.error.message + ' (o plano grátis do Supabase aceita arquivos de até 50 MB)'; return false; }
      reg.arquivo_path = caminho;
    }
    const r = f.id ? await sb.from('filmes').update(reg).eq('id', f.id) : await sb.from('filmes').insert({ ...reg, criado_por: st.uid });
    if (r.error) { info.textContent = '❌ ' + r.error.message; return false; }
    toast('Filme salvo', 'ok'); filmes();
  });
  const sel = $('[name=origem]', form);
  const troca = () => { $('.campo-url', form).hidden = sel.value === 'upload'; $('.campo-up', form).hidden = sel.value !== 'upload'; };
  sel.onchange = troca; troca();
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
      <td>${u.papel !== 'owner' ? `<button class="btn v" data-ban="${u.id}" data-nome="${esc(u.apelido || u.email)}">Banir</button>` : ''}</td></tr>`; }).join('')}
    </tbody></table></div>`;
  $('#busca').oninput = (e) => $$('#tb tr').forEach(tr => tr.hidden = !tr.dataset.q.includes(e.target.value.toLowerCase()));
  $$('[data-ban]').forEach(b => b.onclick = () => formBan(b.dataset.ban, b.dataset.nome));
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
        <button class="btn v" data-ban="${d.denunciado}" data-nome="${esc(d.denunciado_p?.apelido)}">Banir</button>` : ''}</td></tr>`).join('') || '<tr><td colspan=6 class="dica">Nenhuma denúncia.</td></tr>'}</tbody></table></div>`;
  $$('[data-st]').forEach(b => b.onclick = async () => {
    const fim = ['resolvida', 'descartada'].includes(b.dataset.st);
    if (!erro((await sb.from('denuncias').update({ status: b.dataset.st, ...(fim ? { resolvido_por: st.uid, resolvido_em: new Date().toISOString() } : {}) }).eq('id', b.dataset.id)).error)) { denuncias(); badge(); }
  });
  $$('[data-ban]').forEach(b => b.onclick = () => formBan(b.dataset.ban, b.dataset.nome));
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
