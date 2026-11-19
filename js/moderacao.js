// Moderação do criador dentro da sala, "Pedir ajuda" e o canal global da Sessão Juntos.
//
// Segurança: tudo que pune ou lê dados de moderação passa pelo banco (RLS + funções moderar(),
// revogar_moderacao(), atender_pedido_ajuda(), que conferem eh_owner()). Os avisos em tempo real
// (broadcast "moderacao") são só um "atualize agora": quem recebe sempre confere no banco
// (recarrega e o registrar_acesso() decide o ban; silenciados_ativos() decide os mutes).

export const CANAL_GLOBAL = 'cine-global';
const COOLDOWN_AJUDA_MS = 2 * 60e3;
const JANELA_AJUDA_MS = 30 * 60e3;
const MUTES = ['silenciar_voz', 'silenciar_texto', 'silenciar_ajuda', 'revogar'];

export const nomeSala = (sala, titulo) => sala === 'sala-principal' ? 'Sala principal' : (titulo || String(sala).replace(/^netmovies-/, 'Sala do filme ').replace(/-/g, ' '));
export const urlSala = (sala) => {
  const base = location.pathname.replace(/admin\.html$/, '');
  return sala === 'sala-principal' ? base : base + '?netmovies=' + encodeURIComponent(String(sala).replace(/^netmovies-/, ''));
};

export function iniciarModeracao({ sb, sala, eu, owner, canalSala, nomeDe, toast, esc, gv, infoSala }) {
  const $ = (s, el = document) => el.querySelector(s);
  const hora = (d) => new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const api = { textoSilenciado: (uid) => !!gv?.usuarioSilenciado(uid, 'texto'), abrirMenu, atualizarSala, destruir };
  const timers = [];

  // ------------------------------------------------ canal global: presença leve (para a aba Câmeras) + avisos
  const pkey = crypto.randomUUID();
  const global = sb.channel(CANAL_GLOBAL, { config: { presence: { key: pkey }, broadcast: { self: false } } });
  let info = { ...(infoSala?.() || {}) };
  const presenca = () => ({ id: eu.id, apelido: eu.apelido, cor: eu.cor, papel: owner ? 'owner' : 'espectador', sala, ...info, desde: eu.desde });
  function atualizarSala(dados) { info = { ...info, ...dados }; global.track(presenca()); }
  const aoAviso = ({ payload }) => {
    if (payload?.alvo !== eu.id) return;
    if (MUTES.includes(payload.acao)) { gv?.atualizarSilenciados(); toast(payload.acao === 'revogar' ? 'O criador desfez uma restrição sua.' : 'O criador aplicou uma restrição na sua conta.'); }
    else location.reload();                         // ban/expulsão: o servidor decide na volta
  };
  global.on('broadcast', { event: 'moderacao' }, aoAviso);
  global.subscribe((s) => { if (s === 'SUBSCRIBED') global.track(presenca()); });

  // lista de silenciados vem do banco; atualiza de tempos em tempos
  gv?.atualizarSilenciados();
  timers.push(setInterval(() => { if (!document.hidden && !gv?.conectado) gv?.atualizarSilenciados(); }, 60e3));

  function avisar(alvo, acao) {
    const msg = { type: 'broadcast', event: 'moderacao', payload: { alvo, acao } };
    canalSala?.send(msg); global.send(msg);
  }

  // ------------------------------------------------ Pedir ajuda (todos, menos o criador)
  if (!owner) {
    const b = document.createElement('button');
    b.dataset.ir = 'ajuda'; b.id = 'menu-ajuda'; b.title = 'Pedir ajuda ao criador'; b.setAttribute('aria-label', 'Pedir ajuda ao criador');
    b.innerHTML = '🆘<span>Ajuda</span>';
    $('#menu-lateral [data-ir="sair"]').before(b);
    b.addEventListener('click', async (e) => {
      e.stopImmediatePropagation();
      const ate = +localStorage.getItem('cine_ajuda_ate') || 0;
      if (Date.now() < ate) return toast(`Pedido já enviado. Você pode pedir de novo às ${hora(ate)}.`);
      b.disabled = true;
      const { error } = await sb.from('pedidos_ajuda').insert({ usuario: eu.id, sala });
      b.disabled = false;
      if (error) return toast(error.message.replace(/^.*?: /, ''), 'erro');
      localStorage.setItem('cine_ajuda_ate', String(Date.now() + COOLDOWN_AJUDA_MS));
      toast('Pedido de ajuda enviado ao criador. 🙌', 'ok');
    }, true);
  }

  // ------------------------------------------------ menu de moderação no avatar/nome (só criador)
  let menu = null;
  function fecharMenu() { menu?.remove(); menu = null; removeEventListener('keydown', escMenu); document.removeEventListener('pointerdown', foraMenu, true); }
  const escMenu = (e) => e.key === 'Escape' && fecharMenu();
  const foraMenu = (e) => { if (menu && !menu.contains(e.target)) fecharMenu(); };

  async function abrirMenu(alvo, ev) {
    if (!owner || !alvo || alvo === eu.id) return;
    fecharMenu();
    const p = await nomeDe(alvo);
    if (p?.papel === 'owner') return toast('O criador não pode ser moderado.');
    menu = document.createElement('div');
    menu.className = 'mod-menu'; menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', 'Moderar ' + (p?.apelido || ''));
    menu.innerHTML = `<header><b>${esc(p?.apelido || '?')}</b><button class="fechar" aria-label="Fechar">✕</button></header>
      <div class="mod-estado" id="mod-estado">Carregando estado…</div>
      <label class="mod-motivo">Motivo (opcional)<input maxlength="300" id="mod-motivo" placeholder="Ex.: ofensas no chat"></label>
      <div class="mod-grupo"><span>Voz</span><button data-a="silenciar_voz" data-m="10">10 min</button><button data-a="silenciar_voz" data-m="60">1 h</button><button data-a="silenciar_voz">Até eu liberar</button></div>
      <div class="mod-grupo"><span>Mensagens</span><button data-a="silenciar_texto" data-m="10">10 min</button><button data-a="silenciar_texto" data-m="60">1 h</button><button data-a="silenciar_texto">Até eu liberar</button></div>
      <div class="mod-grupo"><span>Pedidos de ajuda</span><button data-a="silenciar_ajuda" data-m="60">Pausar 1 h</button></div>
      <hr>
      <button class="mod-grave" data-a="expulsar">🚪 Expulsar agora (volta em 10 min)</button>
      <div class="mod-grupo grave"><span>Banir do site</span><button data-a="banir_temp" data-m="10">10 min</button><button data-a="banir_temp" data-m="60">1 h</button><button data-a="banir_temp" data-m="1440">24 h</button><button data-a="banir_temp" data-m="10080">7 dias</button></div>
      <button class="mod-perigo" data-a="banir_perm">⛔ Banir permanentemente</button>`;
    document.body.appendChild(menu);
    // posição: perto do toque, sem sair da tela (no celular vira folha embaixo)
    const x = ev?.clientX ?? innerWidth / 2, y = ev?.clientY ?? innerHeight / 2, r = menu.getBoundingClientRect();
    if (innerWidth > 560) { menu.style.left = Math.max(8, Math.min(x, innerWidth - r.width - 8)) + 'px'; menu.style.top = Math.max(8, Math.min(y, innerHeight - r.height - 8)) + 'px'; }
    else menu.classList.add('folha');
    $('.fechar', menu).onclick = fecharMenu;
    addEventListener('keydown', escMenu); setTimeout(() => document.addEventListener('pointerdown', foraMenu, true));
    menu.querySelectorAll('[data-a]').forEach(b => b.onclick = () => executar(alvo, p, b.dataset.a, b.dataset.m ? +b.dataset.m : null));
    menu.querySelector('[data-a]')?.focus();
    estadoAlvo(alvo);
  }

  async function estadoAlvo(alvo) {
    const box = menu && $('#mod-estado', menu); if (!box) return;
    const agora = new Date().toISOString();
    const { data, error } = await sb.from('silenciamentos').select('id, tipo, ate').eq('usuario', alvo).is('revogado_em', null).or('ate.is.null,ate.gt.' + agora);
    if (!menu) return;
    if (error) { box.textContent = 'Estado indisponível (migration 007 ainda não aplicada?).'; return; }
    const nomes = { voz: 'Voz', texto: 'Mensagens', ajuda: 'Pedidos de ajuda' };
    box.innerHTML = data.length ? data.map(s => `<div>${nomes[s.tipo]} silenciado ${s.ate ? 'até ' + hora(s.ate) : 'até liberar'} <button data-rev="${s.id}">Desfazer</button></div>`).join('') : 'Sem restrições ativas.';
    box.querySelectorAll('[data-rev]').forEach(b => b.onclick = async () => {
      const { error: e } = await sb.rpc('revogar_moderacao', { p_tabela: 'silenciamentos', p_id: b.dataset.rev });
      if (e) return toast(e.message, 'erro');
      avisar(alvo, 'revogar'); toast('Restrição desfeita', 'ok'); estadoAlvo(alvo);
    });
  }

  async function executar(alvo, p, acao, minutos) {
    const nome = p?.apelido || 'esta pessoa';
    const motivo = $('#mod-motivo', menu)?.value.trim() || null;
    if (acao === 'expulsar' && !confirm(`Expulsar ${nome} agora? A pessoa poderá voltar em 10 minutos.`)) return;
    if (acao === 'banir_perm' && !(await confirmarPermanente(nome))) return;
    const { error } = await sb.rpc('moderar', { p_alvo: alvo, p_acao: acao, p_minutos: minutos, p_motivo: motivo, p_sala: sala });
    if (error) return toast(error.message, 'erro');
    avisar(alvo, acao);
    const txt = { expulsar: 'foi expulso', banir_temp: 'foi banido temporariamente', banir_perm: 'foi banido permanentemente', silenciar_voz: 'teve a voz silenciada', silenciar_texto: 'teve as mensagens silenciadas', silenciar_ajuda: 'teve os pedidos de ajuda pausados' };
    toast(`${nome} ${txt[acao]}`, 'ok');
    if (acao.startsWith('silenciar')) { gv?.atualizarSilenciados(); estadoAlvo(alvo); } else fecharMenu();
  }

  function confirmarPermanente(nome) {
    return new Promise((ok) => {
      const d = document.createElement('dialog');
      d.className = 'modal mod-confirmar';
      d.innerHTML = `<form method="dialog"><h3>⛔ Banir ${esc(nome)} para sempre?</h3>
        <p class="dica">A conta fica bloqueada em toda a Sessão Juntos até você desfazer em Painel → Moderação.</p>
        <div class="acoes"><button value="nao" class="btn-sec">Cancelar</button><button value="sim" class="btn-perigo">Banir permanentemente</button></div></form>`;
      document.body.appendChild(d);
      d.onclose = () => { ok(d.returnValue === 'sim'); d.remove(); };
      d.showModal();
    });
  }

  // ------------------------------------------------ pedidos de ajuda chegando (só criador)
  let canalAjuda = null;
  if (owner) {
    const caixa = document.createElement('div');
    caixa.className = 'ajuda-notifs'; caixa.id = 'ajuda-notifs'; caixa.setAttribute('aria-live', 'polite');
    document.body.appendChild(caixa);
    const mostrar = async (r) => {
      if (!r || r.status !== 'pendente' || Date.now() - new Date(r.criado_em) > JANELA_AJUDA_MS || $(`[data-pedido="${r.id}"]`, caixa)) return;
      const p = r.perfis || await nomeDe(r.usuario);
      const el = document.createElement('div');
      el.className = 'ajuda-card'; el.dataset.pedido = r.id; el.setAttribute('role', 'alert');
      const cor = p?.avatar?.roupa || '#7c3aed';
      el.innerHTML = `<span class="bolinha" style="background:${esc(cor)}">${esc((p?.apelido || '?')[0].toUpperCase())}</span>
        <div><b>${esc(p?.apelido || '?')}</b> pediu ajuda<small>${esc(nomeSala(r.sala))} · ${hora(r.criado_em)}</small>
        <div class="ajuda-acoes"><button data-ir>Ir para a sala</button><button data-ign>Ignorar</button><button data-pausa title="Pausar pedidos desta pessoa por 1 hora">Pausar 1 h</button></div></div>
        <button class="fechar" data-x aria-label="Fechar aviso">✕</button>`;
      caixa.prepend(el);
      while (caixa.children.length > 3) caixa.lastChild.remove();
      const fim = setTimeout(() => el.remove(), Math.max(1000, JANELA_AJUDA_MS - (Date.now() - new Date(r.criado_em))));
      const sai = () => { clearTimeout(fim); el.remove(); };
      $('[data-x]', el).onclick = sai;
      $('[data-ign]', el).onclick = async () => { const { error } = await sb.rpc('atender_pedido_ajuda', { p_id: r.id, p_status: 'ignorado' }); if (error) toast(error.message, 'erro'); sai(); };
      $('[data-pausa]', el).onclick = async () => { const { error } = await sb.rpc('moderar', { p_alvo: r.usuario, p_acao: 'silenciar_ajuda', p_minutos: 60, p_motivo: null, p_sala: r.sala }); toast(error ? error.message : 'Pedidos dessa pessoa pausados por 1 h', error ? 'erro' : 'ok'); };
      $('[data-ir]', el).onclick = async () => {
        const { error } = await sb.rpc('atender_pedido_ajuda', { p_id: r.id, p_status: 'atendido' });
        if (error) return toast(error.message, 'erro');
        sai();
        if (r.sala === sala) return toast('Você já está nessa sala.');
        location.href = urlSala(r.sala);                // teletransporte: a página troca de sala e limpa a anterior (voz, canais)
      };
    };
    sb.from('pedidos_ajuda').select('id, usuario, sala, criado_em, status, perfis!pedidos_ajuda_usuario_fkey(apelido, avatar)')
      .eq('status', 'pendente').gt('criado_em', new Date(Date.now() - JANELA_AJUDA_MS).toISOString()).order('criado_em', { ascending: false }).limit(10)
      .then(({ data }) => (data || []).reverse().forEach(mostrar));
    canalAjuda = sb.channel('ajuda-owner')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pedidos_ajuda' }, ({ new: r }) => mostrar(r))
      .subscribe();
  }

  function destruir() {
    fecharMenu(); timers.forEach(clearInterval);
    try { sb.removeChannel(global); } catch { }
    if (canalAjuda) try { sb.removeChannel(canalAjuda); } catch { }
  }
  return api;
}
