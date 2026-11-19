import { observarQualidade } from './qualidade-video.js';
import { controlesAnuncio } from './anuncio-youtube.js';
import { carregarFilmesR2 } from './catalogo-r2.js';
// Fluxo do app dos espectadores: login Google → perfil → sala 3D.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { sb, configurado, COLS_PERFIL, idDispositivo, plataforma, esc, toast } from './supa.js';
import { OPCOES, normalizarAvatar, criarAvatar, poseEmPe, preCarregar } from './avatar.js';
import './tela-limpa.js';   // botão que esconde/mostra todos os botões da tela (remova esta linha para desligar)

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const estado = { sessao: null, perfil: null, owner: false, cinema: null, player: null, canal: null, pessoas: new Map(), voz: null, mod: null };

// Criador observando uma sala pelo painel (Câmeras das Salas): ?observar=<sala>[&mini=1].
// Entra sem aparecer (não marca presença), vê da câmera de segurança da sala e pode ouvir a conversa.
const PEDIDO_OBS = (() => {
  const q = new URLSearchParams(location.search), s = q.get('observar');
  return s && /^(sala-principal|netmovies-[a-z0-9-]{1,80})$/i.test(s) ? { sala: s, mini: q.get('mini') === '1' } : null;
})();
if (PEDIDO_OBS?.mini) document.body.classList.add('obs-mini');
const visivel = () => !estado.observando;

function mostrar(id) {
  $$('.tela').forEach(t => t.hidden = t.id !== id);
  $('#carregando').classList.add('some');
}

// ------------------------------------------------------------------ início
async function iniciar() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  if (!configurado) { $('#aviso-config').hidden = false; mostrar('tela-login'); return; }
  preCarregar();
  const { data: { session } } = await sb.auth.getSession();
  sb.auth.onAuthStateChange((ev, s) => {
    if (ev === 'SIGNED_OUT') location.reload();
    if (ev === 'SIGNED_IN' && !estado.sessao && s) { estado.sessao = s; entrar(); }
  });
  if (!session) { mostrar('tela-login'); return; }
  estado.sessao = session;
  entrar();
}

async function entrar() {
  if (estado._entrando) return; estado._entrando = true;
  if (PEDIDO_OBS) {   // só o criador observa; para qualquer outra pessoa o link abre a sala normal
    const { data: dono } = await sb.rpc('eh_owner');
    if (dono) {
      estado.owner = true; estado.observando = PEDIDO_OBS;
      const { data: perfil } = await sb.rpc('meu_perfil');
      estado.perfil = perfil || { apelido: 'Criador' };
      return abrirCinema();
    }
    document.body.classList.remove('obs-mini');
    history.replaceState(null, '', location.pathname);
  }
  const { data: st, error } = await sb.rpc('registrar_acesso', { p_dispositivo: idDispositivo(), p_plataforma: plataforma() });
  if (error) { toast('Erro ao entrar: ' + error.message, 'erro'); mostrar('tela-login'); estado._entrando = false; return; }
  if (st.banido) return telaBanido(st);
  estado.owner = !!st.owner;
  estado.moderador = !estado.owner && !!st.moderador;
  const { data: perfil } = await sb.rpc('meu_perfil');
  estado.perfil = perfil;
  if (!perfil?.cadastro_completo) return abrirPerfil(true);
  abrirCinema();
}

function telaBanido(st) {
  const tipos = { temporario: 'Banimento temporário', permanente: 'Banimento permanente', suspensao: 'Conta suspensa para análise' };
  $('#banido-texto').innerHTML = `<b>${tipos[st.tipo] || 'Bloqueado'}</b><br>Motivo: ${esc(st.motivo)}` +
    (st.ate ? `<br>Até: ${new Date(st.ate).toLocaleString('pt-BR')}` : '');
  mostrar('tela-banido');
}

// ------------------------------------------------------------------ login
$$('[data-acao="login"]').forEach(b => b.addEventListener('click', async () => {
  if (!configurado) return toast('Configure o Supabase primeiro', 'erro');
  const volta = new URL('./', location.href).href + location.search;   // mantém o filme do NetMovies, se houver
  const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: volta, queryParams: { prompt: 'select_account' } } });
  if (error) toast(error.message, 'erro');
}));
async function loginEmail(criar) {
  if (!configurado) return toast('Configure o Supabase primeiro', 'erro');
  const email = $('#em-email').value.trim(), password = $('#em-senha').value;
  if (!email || password.length < 6) return toast('Digite e-mail e senha (mín. 6)', 'erro');
  const r = criar ? await sb.auth.signUp({ email, password, options: { emailRedirectTo: new URL('./', location.href).href + location.search } })
                  : await sb.auth.signInWithPassword({ email, password });
  if (r.error) {
    const m = r.error.message;
    return toast(/Invalid login/i.test(m) ? 'E-mail ou senha incorretos' : /already registered/i.test(m) ? 'Esse e-mail já tem conta, clique em Entrar' : m, 'erro');
  }
  if (criar && !r.data.session) return toast('Conta criada! Confirme pelo e-mail e depois entre.', 'ok');
  location.reload();
}
$('#form-email')?.addEventListener('submit', e => { e.preventDefault(); loginEmail(false); });
$('#em-criar')?.addEventListener('click', () => loginEmail(true));
$$('[data-acao="sair"]').forEach(b => b.addEventListener('click', sair));
async function sair() { try { estado.voz?.destruir(); estado.mod?.destruir(); } catch { } await sb.auth.signOut(); location.reload(); }

// ------------------------------------------------------------------ perfil
let preview = null;
async function abrirPerfil(primeiraVez) {
  mostrar('tela-perfil');
  $('#perfil-titulo').textContent = primeiraVez ? 'Complete seu perfil' : 'Meu perfil';
  $('#perfil-voltar').hidden = primeiraVez;
  const p = estado.perfil || {};
  const cfg = normalizarAvatar(p.avatar);
  $('#apelido').value = p.apelido || '';
  let genero = p.genero || (cfg.base === 'female' ? 'feminino' : 'masculino');
  const marcarGenero = () => $$('#seg-genero button').forEach(b => b.classList.toggle('sel', b.dataset.v === genero));
  marcarGenero();
  $$('#seg-genero button').forEach(b => b.onclick = () => {
    genero = b.dataset.v; marcarGenero();
    if (genero !== 'outro') { cfg.base = genero === 'feminino' ? 'female' : 'male'; montar(); atualizarPreview(); }
  });

  const linhas = [
    ['Corpo', 'base', OPCOES.base.map(o => [o.id, o.nome])],
    ['Cabelo', 'cabelo', OPCOES.cabelo.map(o => [o.id, o.nome])],
    ['Barba', 'barba', OPCOES.barba.map(o => [o.id, o.nome])],
    ['Cor cabelo', 'cabeloCor', OPCOES.cabeloCor],
    ['Pele', 'pele', OPCOES.pele],
    ['Olhos', 'olhos', OPCOES.olhos],
    ['Roupa', 'roupa', OPCOES.roupa],
    ['Calça', 'calca', OPCOES.calca],
  ];
  function montar() {
    $('#opcoes-avatar').innerHTML = linhas.map(([rot, chave, itens]) => `
      <div class="linha-op"><span>${rot}</span><div class="itens">${itens.map(it => Array.isArray(it)
        ? `<button type="button" data-k="${chave}" data-v="${it[0]}" class="${cfg[chave] === it[0] ? 'sel' : ''}">${it[1]}</button>`
        : `<button type="button" class="cor ${cfg[chave] === it ? 'sel' : ''}" data-k="${chave}" data-v="${it}" style="background:${it}" aria-label="${it}"></button>`).join('')}</div></div>`).join('');
    $$('#opcoes-avatar button').forEach(b => b.onclick = () => { cfg[b.dataset.k] = b.dataset.v; montar(); atualizarPreview(); });
  }
  montar();

  if (!preview) preview = criarPreview($('#preview3d'));
  async function atualizarPreview() { preview.mostrar(await criarAvatar(cfg)); }
  atualizarPreview();

  // verificação de apelido único
  let tApelido;
  $('#apelido').oninput = () => {
    clearTimeout(tApelido);
    const v = $('#apelido').value.trim();
    $('#apelido-ok').textContent = '';
    if (!/^[A-Za-z0-9_.]{3,20}$/.test(v)) return;
    tApelido = setTimeout(async () => {
      const { data } = await sb.from('perfis').select('id').ilike('apelido', v.replace(/[_%]/g, '\\$&')).neq('id', estado.sessao.user.id).limit(1);
      $('#apelido-ok').textContent = data?.length ? '❌' : '✅';
    }, 350);
  };
  $('#apelido').oninput();

  $('#perfil-voltar').onclick = () => abrirCinema();
  $('#form-perfil').onsubmit = async (e) => {
    e.preventDefault();
    const apelido = $('#apelido').value.trim();
    $('#btn-salvar-perfil').disabled = true;
    const { error } = await sb.from('perfis').update({ apelido, genero, avatar: cfg, cadastro_completo: true }).eq('id', estado.sessao.user.id);
    $('#btn-salvar-perfil').disabled = false;
    if (error) return toast(error.code === '23505' ? 'Esse apelido já existe. Escolha outro.' : error.message, 'erro');
    estado.perfil = { ...estado.perfil, apelido, genero, avatar: cfg, cadastro_completo: true };
    toast('Perfil salvo!', 'ok');
    estado.canal?.track(meuEstadoPresenca());
    abrirCinema();
  };
}

function criarPreview(canvas) {
  const leve = matchMedia('(pointer:coarse)').matches || innerWidth < 760;
  const r = new THREE.WebGLRenderer({ canvas, antialias: !leve, alpha: true });
  r.setPixelRatio(Math.min(devicePixelRatio, leve ? 1.25 : 2)); r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping;
  const cena = new THREE.Scene();
  cena.add(new THREE.HemisphereLight('#ffffff', '#3a2a55', 1.6));
  const d = new THREE.DirectionalLight('#ffffff', 2.2); d.position.set(2, 4, 3); cena.add(d);
  const aro = new THREE.DirectionalLight('#a78bfa', 2); aro.position.set(-3, 2, -3); cena.add(aro);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.75, 0.06, 48), new THREE.MeshStandardMaterial({ color: '#1e1532', emissive: '#4c1d95', emissiveIntensity: 0.4 }));
  base.position.y = -0.03; cena.add(base);
  const anel = new THREE.Mesh(new THREE.TorusGeometry(0.74, 0.012, 8, 64), new THREE.MeshBasicMaterial({ color: '#a78bfa' }));
  anel.rotation.x = Math.PI / 2; cena.add(anel);
  const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 50); cam.position.set(0, 1.25, 4.2);
  const ctl = new OrbitControls(cam, canvas); ctl.target.set(0, 0.95, 0); ctl.enablePan = false; ctl.minDistance = 1.5; ctl.maxDistance = 6; ctl.autoRotate = true; ctl.autoRotateSpeed = 1.2;
  let atual = null;
  function tam() { const w = canvas.clientWidth, h = canvas.clientHeight; if (!w) return; r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }
  addEventListener('resize', tam);
  r.setAnimationLoop(() => { if (document.hidden || !canvas.offsetParent) return; tam(); ctl.update(); r.render(cena, cam); });   // só desenha quando a tela de perfil está visível
  return { mostrar(av) { if (atual) cena.remove(atual); atual = av; poseEmPe(av); cena.add(av); } };
}

// ------------------------------------------------------------------ cinema
async function abrirCinema() {
  mostrar('tela-cinema');
  $('#menu-painel').hidden = !estado.owner;                 // painel: só o criador
  if ($('#menu-moderar')) $('#menu-moderar').hidden = !estado.moderador;   // moderador: ícone 🛡️
  $('#eu-nome').textContent = selo(estado.owner ? 'owner' : estado.moderador ? 'moderador' : '') + (estado.perfil.apelido || '');
  if (estado.cinema) { estado.cinema.focarEm(estado.sessao.user.id); return; }

  const [{ Cinema }, { PlayerSincronizado }] = await Promise.all([import('./cinema3d.js'), import('./player.js')]);
  // NetMovies: ?netmovies=<filme> abre a sala própria daquele filme (quem abrir o mesmo filme entra junto)
  const obs = estado.observando;
  if (obs) document.body.classList.add('observando');
  const idFilme = obs ? (obs.sala.startsWith('netmovies-') ? obs.sala.slice(10) : null) : new URLSearchParams(location.search).get('netmovies');
  if (idFilme) {
    try { estado.sala = await (await import('./sala-filme.js')).prepararSalaFilme(idFilme); } catch (e) { console.warn(e); }
    if (!estado.sala) { toast('Esse filme não está disponível. Voltando para a sala principal.', 'erro'); history.replaceState(null, '', location.pathname); }
  }
  const video = $('#video');
  const cinema = estado.cinema = new Cinema($('#cena3d'), $('#rotulos'), video);
  cinema.meuId = obs ? null : estado.sessao.user.id;
  if (obs) {
    cinema.modoCamera();
    if (obs.mini) { cinema.fpsMax = 12; cinema.renderer.setPixelRatio(0.6); cinema.renderer.shadowMap.enabled = false; cinema._redimensionar(); }
  }
  cinema.aoClicarPessoa = (id, ev) => id !== cinema.meuId && ((estado.owner || estado.moderador) && estado.mod ? estado.mod.abrirMenu(id, ev) : abrirDenuncia(id));
  cinema.controles.addEventListener('start', () => cinema.interromperCamera());

  let atualizarControleAnuncio;
  const eventosPlayer = {
    aoMudarFilme: (f) => {
      $('#sem-filme').hidden = !!f;
      $('#titulo-filme').textContent = f ? f.titulo : 'Sem filme agora';
      cinema.aplicarTema(f);   // sala temática pelo gênero do filme (sem gênero = sala original)
      estado.mod?.atualizarSala(infoSalaAtual());   // aba Câmeras do criador: título/capa/fonte do telão
      if (f) { cinema.mostrarCapa(f.capa_url); } else cinema.mostrarVideo(false);
      cinema.legenda('');
      if ($('#gaveta-programacao').hidden === false) carregarProgramacao();
    },
    aoLegenda: (t) => cinema.legenda(t),
    aoModo: (modo, el) => { cinema.mostrarNaTela(el); atualizarControleAnuncio?.(modo); },
    aoEstado: (s, msg) => {
      if (s === 'tocando' && player.modo === 'textura') cinema.mostrarVideo(true);
      if (s === 'erro' && msg) toast(msg, 'erro');
      if (s === 'bloqueado' && !player.filmeVR) $('#toque-iniciar').hidden = false;
      if (s === 'erro' && player.filmeVR && estado.vr?.ativo) estado.vr.sair();
    },
  };
  const player = estado.player = estado.sala ? estado.sala.criarPlayer(video, eventosPlayer) : new PlayerSincronizado(video, eventosPlayer);
  if (!obs?.mini) {
    const leitura = observarQualidade(video);
    $('#medir-video').onclick = () => {
      $('#qualidade-video').textContent = player.modo === 'textura' && video.currentSrc ? leitura() : 'Diagnóstico disponível durante um filme reproduzido no player de vídeo direto.';
    };
  }
  if (estado.sala) marcarSalaFilme();
  $('#toque-iniciar').onclick = () => { $('#toque-iniciar').hidden = true; player.ativarSom(); $('#btn-som').textContent = '🔊'; };
  $('#btn-som').onclick = () => {
    if (player.mutado) { player.ativarSom(); $('#btn-som').textContent = '🔊'; }
    else { player.silenciar(); $('#btn-som').textContent = '🔇 Ativar som'; }
  };
  atualizarControleAnuncio = controlesAnuncio(cinema, player, { botao: $('#btn-pular-anuncio'), aviso: $('#aviso-anuncio'), barra: $('#controles-anuncio') });
  atualizarControleAnuncio(player.modo);
  // navegadores só liberam som após um toque do usuário
  $('#toque-iniciar').hidden = !!obs?.mini;
  if (!estado.sala) player.atualizar();      // na sala do filme, o início vem de quem já está assistindo

  if (visivel()) { cinema.atualizarPessoas([meuEstadoPresenca()]); $('#qtd-online').textContent = 1; }   // eu apareço mesmo antes da conexão em tempo real
  conectarSala();
  if (obs?.mini) return;      // miniatura do painel: só a sala e o filme, sem chat, menus nem voz
  iniciarChat();
  configurarMenu();
  if (obs) iniciarObservador();
  else iniciarVozEModeracao();
}

async function iniciarObservador() {
  try {
    const { iniciarObservacao } = await import('./observar.js');
    const eu = { id: estado.sessao.user.id, apelido: estado.perfil.apelido || 'Criador', cor: estado.perfil.avatar?.roupa || '#7c3aed' };
    estado.voz = iniciarObservacao({ sb, sala: salaAtual(), eu, cinema: estado.cinema, toast, esc });
  } catch (e) { console.warn('observação indisponível', e); }
}

const salaAtual = () => estado.sala ? estado.sala.canal : 'sala-principal';
function infoSalaAtual() {
  const f = estado.player?.estado?.filme || estado.sala?.filme;
  return { titulo: f?.titulo || '', capa: f?.capa_url || '', fonte: f?.origem || '' };
}

// Conversa por voz + moderação do criador + Pedir ajuda. Carregados à parte:
// se algo aqui falhar, o cinema, o player e o chat continuam funcionando.
async function iniciarVozEModeracao() {
  const eu = { id: estado.sessao.user.id, apelido: estado.perfil.apelido, cor: estado.perfil.avatar?.roupa || '#7c3aed', desde: estado._desde };
  try {
    const { iniciarVozUI } = await import('./voz-ui.js');
    estado.voz = iniciarVozUI({ sb, sala: salaAtual(), eu, player: estado.player, toast, esc, aoFala: falando => { estado.cinema.falando = falando; } });
  } catch (e) { console.warn('voz indisponível', e); }
  try {
    const { iniciarModeracao } = await import('./moderacao.js');
    estado.mod = iniciarModeracao({ sb, sala: salaAtual(), eu, owner: estado.owner, moderador: !!estado.moderador, canalSala: estado.canal, nomeDe, toast, esc, gv: estado.voz, infoSala: infoSalaAtual });
  } catch (e) { console.warn('moderação indisponível', e); }
}

function meuEstadoPresenca() {
  return { id: estado.sessao.user.id, apelido: estado.perfil.apelido, avatar: estado.perfil.avatar, papel: estado.owner ? 'owner' : estado.moderador ? 'moderador' : 'espectador', desde: estado._desde || (estado._desde = Date.now()), ...(estado.sala?.presenca() || {}) };
}

// sala de um filme do NetMovies: título, botão de voltar para a sala principal
function marcarSalaFilme() {
  $('#titulo-filme').textContent = estado.sala.filme.titulo;
  document.title = estado.sala.filme.titulo + ' · Sessão Juntos';
  const b = document.createElement('button');
  b.className = 'chip'; b.id = 'btn-sala-principal'; b.title = 'Voltar para a sala principal'; b.textContent = '⬅ Sala principal';
  b.onclick = () => { location.href = location.pathname; };
  $('.hud-dir').prepend(b);
}

function conectarSala() {
  const canal = estado.canal = sb.channel(estado.sala ? estado.sala.canal : 'sala-principal', { config: { presence: { key: estado.sessao.user.id } } });
  let conectado = false;
  const reacoes = ['❤️','😂','👏','😮','🍿'];
  const ultima = new Map();
  const podeReagir = id => !estado.mod?.textoSilenciado(id);
  function exibirReacao(id, emoji) {
    if (!estado.pessoas.has(id) || !reacoes.includes(emoji) || !podeReagir(id)) return false;
    const agora = performance.now();
    if (agora - (ultima.get(id) ?? -Infinity) < 3000) return false;
    ultima.set(id, agora);
    if (localStorage.getItem('cine-ocultar-reacoes') !== '1' && !document.body.classList.contains('tela-limpa')) estado.cinema.reagir(id,emoji);
    return true;
  }
  canal.on('broadcast', {event:'reacao'}, ({payload}) => {
    if (payload?.id !== estado.sessao.user.id) exibirReacao(payload?.id,payload?.emoji);
  });
  const opcoes = $('#reacoes-rapidas');
  if (visivel()) {
    for (const emoji of reacoes) {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = emoji;
      b.onclick = () => {
        if (!conectado) return toast('Aguarde a conexão com a sala.');
        const id = estado.sessao.user.id;
        if (!podeReagir(id)) return toast('Seu chat está silenciado.');
        if (!exibirReacao(id,emoji)) return toast('Aguarde três segundos entre reações.');
        canal.send({type:'broadcast',event:'reacao',payload:{id,emoji}});
      };
      opcoes.append(b);
    }
  }
  const ocultar = $('#ocultar-reacoes');
  ocultar.checked = localStorage.getItem('cine-ocultar-reacoes') === '1';
  ocultar.onchange = () => localStorage.setItem('cine-ocultar-reacoes',ocultar.checked ? '1' : '0');
  $('#convidar-sala').onclick = async () => {
    const url = new URL(location.pathname, location.origin);
    if (estado.sala) url.searchParams.set('netmovies',estado.sala.id);
    try {
      if (navigator.share) await navigator.share({title:'Sessão Juntos',url:url.href});
      else { await navigator.clipboard.writeText(url.href); toast('Link da sala copiado.'); }
    } catch (e) { if (e.name !== 'AbortError') window.prompt('Copie o link desta sala',url.href); }
  };
  estado.cinema.aoPose = pose => { if (conectado && visivel() && estado.pessoas.size > 1) canal.send({type:'broadcast',event:'pose',payload:pose}); };
  canal.on('broadcast', {event:'pose'}, ({payload}) => {
    if (payload?.id !== estado.sessao.user.id && estado.pessoas.has(payload?.id)) estado.cinema.receberPose(payload);
  });
  canal.on('presence', { event: 'sync' }, () => {
    const st = canal.presenceState();
    const lista = Object.values(st).map(arr => arr[0]).filter(Boolean);
    if (visivel() && !lista.some(p => p.id === estado.sessao.user.id)) lista.push(meuEstadoPresenca());
    estado.pessoas = new Map(lista.map(p => [p.id, p]));
    for (const id of ultima.keys()) if (!estado.pessoas.has(id)) ultima.delete(id);
    $('#qtd-online').textContent = lista.length;
    estado.cinema.atualizarPessoas(lista);
    if (!$('#gaveta-pessoas').hidden) desenharPessoas();
    if (estado.sala) estado.sala.aoSync(lista, estado.sessao.user.id).then(mudou => mudou && visivel() && canal.track(meuEstadoPresenca()));
  });
  if (estado.sala) {   // chat ao vivo só desta sala
    canal.on('broadcast', { event: 'chat' }, ({ payload }) => payload?.usuario && adicionarMsg({ ...payload, sala: true, texto: String(payload.texto || '').slice(0, 300) }, true));
    estado.sala.esperar(() => visivel() && canal.track(meuEstadoPresenca()));
  }
  canal.on('broadcast', { event: 'moderacao' }, ({ payload }) => {
    if (payload?.alvo !== estado.sessao.user.id) return;
    if (['silenciar_voz', 'silenciar_texto', 'silenciar_ajuda', 'revogar'].includes(payload.acao)) estado.voz?.atualizarSilenciados();   // mutes: confere no banco
    else location.reload();                                                                                                          // ban/expulsão
  });
  canal.subscribe(async (s) => { conectado = s === 'SUBSCRIBED'; if (conectado && visivel()) await canal.track(meuEstadoPresenca()); });
}

// ------------------------------------------------------------------ chat
const EMOJIS = ['😀', '😂', '😍', '😮', '😢', '😡', '👏', '🔥', '🍿', '🎬', '❤️', '👍', '👎', '🤯', '😴', '🎉'];
async function iniciarChat() {
  $('#emojis').innerHTML = EMOJIS.map(e => `<button type="button">${e}</button>`).join('');
  $('#btn-emoji').onclick = () => $('#emojis').hidden = !$('#emojis').hidden;
  $$('#emojis button').forEach(b => b.onclick = () => { $('#chat-input').value += b.textContent; $('#emojis').hidden = true; $('#chat-input').focus(); });

  if (estado.sala) return iniciarChatSala();
  const { data } = await sb.from('mensagens').select('id, usuario, texto, criado_em').gt('criado_em', new Date(Date.now() - VIDA_MSG).toISOString()).order('criado_em', { ascending: false }).limit(30);
  (data || []).reverse().forEach(m => adicionarMsg(m, false));
  sb.channel('chat')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensagens' }, ({ new: m }) => adicionarMsg(m, true))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'mensagens' }, ({ new: m }) => { if (m.removida) document.querySelector(`[data-msg="${m.id}"]`)?.remove(); })
    .subscribe();

  $('#chat-form').onsubmit = async (e) => {
    e.preventDefault();
    const texto = $('#chat-input').value.trim();
    if (!texto) return;
    $('#chat-input').value = '';
    const { error } = await sb.from('mensagens').insert({ texto, usuario: estado.sessao.user.id });
    if (error) { toast(error.message.replace(/^.*?: /, ''), 'erro'); $('#chat-input').value = texto; }
  };
}

// chat da sala de um filme: vai só para quem está nela (não fica salvo)
function iniciarChatSala() {
  $('#chat-form').onsubmit = (e) => {
    e.preventDefault();
    const texto = $('#chat-input').value.trim().slice(0, 300);
    if (!texto) return;
    if (estado.mod?.textoSilenciado(estado.sessao.user.id)) return toast('Você foi silenciado no chat pelo criador.', 'erro');
    $('#chat-input').value = '';
    const m = { id: 'sala-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7), usuario: estado.sessao.user.id, texto, sala: true };
    estado.canal?.send({ type: 'broadcast', event: 'chat', payload: m });
    adicionarMsg(m, true);
  };
}

// cada mensagem some sozinha 1 minuto depois de enviada (o banco também apaga)
const VIDA_MSG = 60e3;

const nomesCache = new Map();
async function nomeDe(id) {
  if (estado.pessoas.has(id)) return estado.pessoas.get(id);
  if (nomesCache.has(id)) return nomesCache.get(id);
  const { data } = await sb.from('perfis').select('id, apelido, papel').eq('id', id).maybeSingle();
  nomesCache.set(id, data || { apelido: '???' });
  return nomesCache.get(id);
}

async function adicionarMsg(m, aoVivo) {
  if (document.querySelector(`[data-msg="${m.id}"]`)) return;
  if (m.usuario !== estado.sessao.user.id && estado.mod?.textoSilenciado(m.usuario)) return;   // silenciado pelo criador: não aparece
  const p = await nomeDe(m.usuario);
  const el = document.createElement('div');
  el.className = 'msg'; el.dataset.msg = m.id;
  el.innerHTML = `<b class="${p.papel === 'owner' ? 'owner' : p.papel === 'moderador' ? 'moderador' : ''}">${selo(p.papel)}${esc(p.apelido)}:</b> ${esc(m.texto)}` +
    (m.usuario !== estado.sessao.user.id ? ` <button class="denunciar" title="Denunciar">⚑</button>` : '');
  el.querySelector('.denunciar')?.addEventListener('click', () => abrirDenuncia(m.usuario, m.sala ? null : m.id));
  const lista = $('#chat-lista');
  const resta = VIDA_MSG - (m.criado_em ? Date.now() - new Date(m.criado_em).getTime() : 0);
  if (resta <= 0) return;
  setTimeout(() => { el.classList.add('sumindo'); setTimeout(() => el.remove(), 600); }, Math.min(resta, VIDA_MSG));
  lista.appendChild(el);
  while (lista.children.length > 60) lista.firstChild.remove();
  lista.scrollTop = lista.scrollHeight;
  if (aoVivo) estado.cinema?.balao(m.usuario, m.texto);
}

// ------------------------------------------------------------------ denúncias
async function abrirDenuncia(id, msgId = null) {
  const p = await nomeDe(id);
  $('#denuncia-nome').textContent = p.apelido;
  $('#denuncia-motivo').value = ''; $('#denuncia-detalhe').value = '';
  const dlg = $('#modal-denuncia');
  dlg.showModal();
  dlg.onclose = async () => {
    if (dlg.returnValue !== 'ok' || !$('#denuncia-motivo').value) return;
    const motivo = $('#denuncia-motivo').value + ($('#denuncia-detalhe').value ? ' — ' + $('#denuncia-detalhe').value : '');
    const { error } = await sb.from('denuncias').insert({ denunciante: estado.sessao.user.id, denunciado: id, mensagem: msgId, motivo });
    toast(error ? error.message : 'Denúncia enviada. Obrigado!', error ? 'erro' : 'ok');
  };
}

// ------------------------------------------------------------------ menu e gavetas
function configurarMenu() {
  const fecharGavetas = () => $$('.gaveta').forEach(g => g.hidden = true);
  $$('[data-fechar]').forEach(b => b.onclick = fecharGavetas);
  $('#btn-pessoas').onclick = () => { const g = $('#gaveta-pessoas'); const abrir = g.hidden; fecharGavetas(); g.hidden = !abrir; if (abrir) desenharPessoas(); };
  $('#btn-eu').onclick = () => abrirPerfil(false);
  $$('#menu-lateral button').forEach(b => b.onclick = () => {
    $$('#menu-lateral button').forEach(x => x.classList.toggle('ativo', x === b));
    const ir = b.dataset.ir;
    if (ir === 'sala') { fecharGavetas(); $('#chat').classList.remove('oculto'); estado.cinema.focarEm(estado.sessao.user.id); }
    if (ir === 'perfil') abrirPerfil(false);
    if (ir === 'chat') { $('#chat').classList.toggle('oculto'); $('#chat-input').focus(); }
    if (ir === 'pessoas') { fecharGavetas(); $('#gaveta-pessoas').hidden = false; desenharPessoas(); estado.cinema.visaoGeral(); }
    if (ir === 'programacao') { fecharGavetas(); $('#gaveta-programacao').hidden = false; carregarProgramacao(); }
    if (ir === 'vr') { fecharGavetas(); abrirVR(); b.classList.remove('ativo'); $('[data-ir="sala"]').classList.add('ativo'); }
    if (ir === 'painel') location.href = 'admin.html';
    if (ir === 'moderar') { fecharGavetas(); $('#gaveta-pessoas').hidden = false; desenharPessoas(); toast('🛡️ Toque em “Moderar” ao lado de uma pessoa, ou no avatar dela na sala.'); }
    if (ir === 'sair') sair();
  });
}

// ------------------------------------------------------------------ modo VR (js/vr.js)
// Carregado só quando a pessoa toca em VR: o cinema normal não muda nada.
async function abrirVR() {
  if (!estado.cinema || !estado.player) return;
  const { ModoVR } = await import('./vr.js');
  const vr = estado.vr || (estado.vr = estado.cinema.vr = new ModoVR(estado.cinema, estado.player, { aviso: (t) => toast(t) }));
  if (vr.estado !== 'NORMAL' && vr.estado !== 'VR_ERROR') return;   // já entrando/saindo: ignora toque duplo
  const dlg = $('#modal-vr'), opcoes = $('#vr-opcoes');
  $('#vr-qualidade').value = vr.qualidade;
  $('#vr-qualidade').onchange = (e) => vr.definirQualidade(e.target.value);
  opcoes.innerHTML = '<p class="dica" role="status">Verificando os modos disponíveis…</p>';
  dlg.showModal();
  const cap = await vr.detectar();
  if (!dlg.open) return;
  opcoes.replaceChildren();
  if (cap.cardboard) {
    const escolher = document.createElement('button');
    escolher.type = 'button'; escolher.className = 'vr-op'; escolher.dataset.modo = 'cardboard';
    escolher.innerHTML = 'VR Box / Cardboard<small>Escolher um filme do CineOnline sem anúncios.</small>';
    opcoes.append(escolher);
    escolher.onclick = async () => {
      opcoes.innerHTML = '<p role="status">Carregando filmes do R2…</p>';
      let filmes;
      try { filmes = await carregarFilmesR2(sb); }
      catch {
        opcoes.innerHTML = '<p role="status">Não foi possível carregar o acervo.</p>';
        escolher.textContent = 'Tentar novamente'; opcoes.append(escolher); return;
      }
      if (!dlg.open) return;
      if (!filmes.length) { opcoes.innerHTML = '<p role="status">Nenhum filme disponível no R2 agora.</p>'; return; }
      opcoes.innerHTML = '<label class="vr-qual">Filme sem anúncios<select id="vr-filme"></select></label><button type="button" class="vr-op" id="vr-assistir">Assistir em VR Box</button>';
      const lista = opcoes.querySelector('select');
      for (const [i, filme] of filmes.entries()) {
        const minutos = Math.round(filme.duracao_seg / 60);
        lista.add(new Option(filme.titulo + (minutos ? ' · ' + minutos + ' min' : ''), i));
      }
      lista.focus();
      $('#vr-assistir').onclick = async () => {
        const filme = filmes[lista.selectedIndex];
        const permissao = vr.pedirPermissaoSensor();
        if (!estado.player.iniciarFilmeVR(filme)) return;
        dlg.close();
        const ok = await vr.entrarCardboard(permissao);
        if (ok && !estado.player.v.error) mostrarControlesVR(vr);
        else { if (ok) await vr.sair(); estado.player.sairFilmeVR(); }
      };
    };
  }
  if (cap.webxr) {
    const headset = document.createElement('button');
    headset.type = 'button'; headset.className = 'vr-op sec';
    headset.innerHTML = 'Óculos VR (WebXR)<small>Entrar na sessão da sala com o headset.</small>';
    opcoes.append(headset);
    headset.onclick = async () => {
      dlg.close();
      estado.player.ativarSom();
      if (await vr.entrarWebXR()) mostrarControlesVR(vr);
    };
  }
  if (!cap.cardboard && !cap.webxr) opcoes.textContent = 'O modo VR está indisponível neste aparelho.';
}


function mostrarControlesVR(vr) {
  const ui = $('#vr-ui'), cardboard = vr.estado === 'VR_CARDBOARD';
  ui.querySelectorAll('.vr-lado + .vr-lado').forEach(x => x.remove());
  if (cardboard) ui.appendChild(ui.querySelector('.vr-lado').cloneNode(true));   // uma barra para cada olho
  ui.hidden = false; $('#vr-divisor').hidden = !cardboard;
  let t, foco = 0;
  const revelar = () => { ui.classList.remove('some'); clearTimeout(t); t = setTimeout(() => ui.classList.add('some'), 4000); };
  const botoesDe = (lado) => [...lado.querySelectorAll('[data-vr]')].filter(b => cardboard || !b.classList.contains('so-cardboard'));
  const marcar = () => ui.querySelectorAll('.vr-lado').forEach(l => botoesDe(l).forEach((b, i) => b.classList.toggle('foco', i === foco)));
  // controle Bluetooth: joystick escolhe o botão, A aperta, B esconde, cima centraliza
  vr.aoControle = (a) => {
    const n = botoesDe(ui.querySelector('.vr-lado')).length;
    if (ui.classList.contains('some') && a !== 'voltar' && a !== 'cima') { marcar(); revelar(); return; }
    if (a === 'esquerda') foco = (foco - 1 + n) % n;
    if (a === 'direita') foco = (foco + 1) % n;
    if (a === 'cima') vr.recentralizar();
    if (a === 'ok') botoesDe(ui.querySelector('.vr-lado'))[foco]?.click();
    if (a === 'voltar') { clearTimeout(t); ui.classList.add('some'); return; }
    if (vr.ativo) { marcar(); revelar(); }
  };
  vr.aoToque = revelar;
  vr.aoValores = ({ ipd, tamanho, distancia }) => { const txt = `Telão ${tamanho}% · distância ${distancia > 0 ? '+' : ''}${distancia.toFixed(1)} m${vr.estado === 'VR_CARDBOARD' ? ` · olhos ${ipd} mm` : ''}`; $$('#vr-ui .vr-valores').forEach(x => x.textContent = txt); revelar(); };
  vr.aoValores({ ipd: Math.round(vr.ipd * 1000), tamanho: 100, distancia: 0 });
  const acoes = {
    reproducao: () => {
      const video = estado.player.v;
      if (video.paused || video.ended) estado.player.ativarSom();
      else video.pause();
    },
    centro: () => vr.recentralizar(), perto: () => vr.ajustarDistancia(0.5), longe: () => vr.ajustarDistancia(-0.5),
    menor: () => vr.ajustarTamanho(-0.05), maior: () => vr.ajustarTamanho(0.05),
    'ipd-': () => vr.ajustarIPD(-0.002), 'ipd+': () => vr.ajustarIPD(0.002),
    lente: () => toast(vr.alternarLente() ? 'Lente do óculos ligada' : 'Lente do óculos desligada'),
    sair: () => vr.sair(),
  };
  $$('#vr-ui [data-vr]').forEach(b => b.onclick = (e) => { e.stopPropagation(); acoes[b.dataset.vr]?.(); revelar(); });
  const video = estado.player.v;
  const atualizarReproducao = () => {
    for (const b of ui.querySelectorAll('[data-vr="reproducao"]')) {
      b.textContent = video.paused || video.ended ? '▶' : 'Ⅱ';
      b.setAttribute('aria-label', b.title = video.paused || video.ended ? 'Reproduzir filme' : 'Pausar filme');
    }
  };
  const eventos = ['playing', 'pause', 'ended'];
  if (cardboard) { eventos.forEach(ev => video.addEventListener(ev, atualizarReproducao)); atualizarReproducao(); }
  vr.aoSair = () => {
    eventos.forEach(ev => video.removeEventListener(ev, atualizarReproducao));
    clearTimeout(t); ui.hidden = true; ui.classList.remove('some'); $('#vr-divisor').hidden = true;
    vr.aoToque = vr.aoValores = vr.aoSair = vr.aoControle = null;
    $$('#vr-ui [data-vr]').forEach(b => { b.onclick = null; b.classList.remove('foco'); });
    ui.querySelectorAll('.vr-lado + .vr-lado').forEach(x => x.remove());
  };
  revelar();
}

function selo(papel) { return papel === 'owner' ? '👑 ' : papel === 'moderador' ? '🛡️ ' : ''; }
function ordemPapel(papel) { return papel === 'owner' ? 2 : papel === 'moderador' ? 1 : 0; }

function desenharPessoas() {
  const lista = [...estado.pessoas.values()].sort((a, b) => ordemPapel(b.papel) - ordemPapel(a.papel) || String(a.apelido).localeCompare(b.apelido));
  $('#lista-pessoas').innerHTML = lista.map(p => `
    <li><span class="n"><span class="bolinha" style="background:${esc(p.avatar?.roupa || '#7c3aed')}">${esc((p.apelido || '?')[0].toUpperCase())}</span>
      ${selo(p.papel)}${esc(p.apelido)}${p.id === estado.sessao.user.id ? ' (você)' : ''}</span>
      ${p.id !== estado.sessao.user.id ? ((estado.owner || (estado.moderador && p.papel !== 'moderador')) && estado.mod && p.papel !== 'owner' ? `<button data-mod="${p.id}" aria-label="Moderar ${esc(p.apelido)}">Moderar</button>` : `<button data-den="${p.id}">Denunciar</button>`) : ''}</li>`).join('');
  $$('[data-den]').forEach(b => b.onclick = () => abrirDenuncia(b.dataset.den));
  $$('[data-mod]').forEach(b => b.onclick = (e) => estado.mod.abrirMenu(b.dataset.mod, e));
}

async function carregarProgramacao() {
  const [{ data: itens }, st] = await Promise.all([
    sb.from('programacao').select('id, posicao, filmes(titulo, capa_url, duracao_seg, genero, classificacao)').order('posicao'),
    Promise.resolve(estado.player?.estado),
  ]);
  const atual = st?.item;
  const min = (s) => `${Math.floor(s / 3600) ? Math.floor(s / 3600) + 'h ' : ''}${Math.round((s % 3600) / 60)}min`;
  $('#lista-programacao').innerHTML = (itens || []).map(i => `
    <div class="prog-item ${i.id === atual ? 'atual' : ''}">
      <img src="${esc(i.filmes?.capa_url || 'icons/icon.svg')}" alt="" loading="lazy">
      <div><b>${esc(i.filmes?.titulo)}</b><small>${esc(i.filmes?.genero || '')} · ${min(i.filmes?.duracao_seg || 0)} · ${esc(i.filmes?.classificacao || 'L')}</small>
      ${i.id === atual ? '<small style="color:#ff2d55">● Passando agora</small>' : ''}</div>
    </div>`).join('') || '<p>Nenhum filme programado.</p>';
}

iniciar();
