// Painel da conversa por voz: botão 🎙️ no topo + gaveta com os controles individuais.
// Não mexe no player nem no 3D. Se a voz falhar, o resto da Sessão Juntos continua.
import { gerenciadorVoz } from './voz.js';

const ROTULO_ESTADO = {
  desconectado: 'Fora da conversa', conectando: 'Conectando…', conectado: 'Na conversa',
  reconectando: 'Reconectando…', erro: 'Erro na conversa', cheia: 'Conversa cheia',
};
const ROTULO_MIC = { desligado: 'mic desligado', ligado: 'mic ligado', 'sem-permissao': 'sem permissão do microfone', silenciado: 'silenciado pelo criador' };
const CHAVE_MSGS = 'cine_chat_oculto';

export function iniciarVozUI({ sb, sala, eu, player, toast, esc }) {
  const $ = (s) => document.querySelector(s);

  // botão no topo (antes de 👥)
  const chip = document.createElement('button');
  chip.className = 'chip'; chip.id = 'btn-voz'; chip.type = 'button';
  chip.setAttribute('aria-label', 'Conversa por voz'); chip.title = 'Conversa por voz';
  chip.innerHTML = '🎙️<i class="voz-ponto" aria-hidden="true"></i>';
  $('#btn-pessoas').before(chip);

  const g = document.createElement('aside');
  g.className = 'gaveta gaveta-voz'; g.id = 'gaveta-voz'; g.hidden = true;
  g.setAttribute('aria-label', 'Conversa por voz da sala');
  g.innerHTML = `
    <header><h3>🎙️ Conversa da sala</h3><button class="fechar" data-fechar aria-label="Fechar">✕</button></header>
    <div class="voz-corpo">
      <p class="voz-status" id="voz-status" role="status" aria-live="polite"></p>
      <button type="button" class="btn-primario voz-entrar" id="voz-entrar">Entrar na conversa</button>
      <div class="voz-botoes">
        <button type="button" id="voz-mic" aria-pressed="false"></button>
        <button type="button" id="voz-ouvir" aria-pressed="true"></button>
        <button type="button" id="voz-msgs" aria-pressed="true"></button>
        <button type="button" id="voz-sair" class="voz-sair">Sair da conversa</button>
      </div>
      <label class="voz-vol">Volume da conversa <input type="range" id="voz-vol" min="0" max="1" step="0.05" aria-label="Volume da conversa"></label>
      <label class="voz-vol">Volume do filme <input type="range" id="voz-vol-filme" min="0" max="1" step="0.05" aria-label="Volume do filme"></label>
      <ul class="voz-lista" id="voz-lista" aria-label="Participantes da conversa"></ul>
      <small class="dica-voz">Você entra com o microfone desligado. Só quem está nesta sala ouve você.</small>
    </div>`;
  $('#tela-cinema').appendChild(g);

  const gv = gerenciadorVoz({ sb, sala, eu, aviso: (t) => toast(t), aoMudar: () => desenhar() });

  // Mensagens: ocultar o chat só para mim (fica salvo neste aparelho)
  const msgsOcultas = () => localStorage.getItem(CHAVE_MSGS) === '1';
  const aplicarMsgs = () => document.body.classList.toggle('chat-oculto-local', msgsOcultas());
  aplicarMsgs();

  $('#voz-entrar').onclick = () => gv.entrar();
  $('#voz-mic').onclick = () => gv.alternarMic();
  $('#voz-ouvir').onclick = () => gv.alternarOuvir();
  $('#voz-msgs').onclick = () => { localStorage.setItem(CHAVE_MSGS, msgsOcultas() ? '0' : '1'); aplicarMsgs(); desenhar(); };
  $('#voz-sair').onclick = () => gv.sair();
  const vol = $('#voz-vol'); vol.value = gv.volume; vol.oninput = () => gv.definirVolume(vol.value);
  const volF = $('#voz-vol-filme'); volF.value = player?.volumeFilme ?? 1; volF.oninput = () => player?.definirVolume?.(volF.value);
  chip.onclick = () => {
    const abrir = g.hidden;
    document.querySelectorAll('.gaveta').forEach(x => x.hidden = true);
    g.hidden = !abrir; if (abrir) desenhar();
  };
  g.querySelector('[data-fechar]').onclick = () => g.hidden = true;

  let ouvintesAvisados = new Set();
  function desenhar() {
    const con = gv.conectado;
    // criador ouvindo pelo painel (js/observar.js): todos na conversa ficam sabendo
    const ouvintes = con ? gv.participantes.filter(p => p.ouvinte && !p.eu) : [];
    if (ouvintes.some(p => !ouvintesAvisados.has(p.pid))) toast('🎧 O criador está ouvindo a conversa');
    ouvintesAvisados = new Set(ouvintes.map(p => p.pid));
    chip.dataset.ouvinte = ouvintes.length ? '1' : '';
    chip.dataset.estado = gv.estado; chip.dataset.mic = gv.mic;
    chip.setAttribute('aria-label', 'Conversa por voz: ' + ROTULO_ESTADO[gv.estado] + (con ? ', ' + ROTULO_MIC[gv.mic] : ''));
    if (g.hidden) return;
    const sil = gv.meuSilencio('voz');
    $('#voz-status').textContent = ROTULO_ESTADO[gv.estado] + (con ? ' · ' + ROTULO_MIC[gv.mic] : '') +
      (sil ? ' · silenciado pelo criador' + (sil.ate ? ' até ' + new Date(sil.ate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '') : '') +
      (gv.detalhe && !con ? ' — ' + gv.detalhe : '') + (ouvintes.length ? ' · 🎧 o criador está ouvindo' : '');
    $('#voz-entrar').hidden = con;
    $('#voz-entrar').textContent = gv.estado === 'erro' || gv.estado === 'cheia' ? 'Tentar entrar de novo' : 'Entrar na conversa';
    const mic = $('#voz-mic');
    mic.textContent = gv.mic === 'ligado' ? '🎙️ Meu microfone: ligado' : gv.mic === 'silenciado' ? '🚫 Microfone silenciado' : gv.mic === 'sem-permissao' ? '⚠️ Microfone sem permissão' : '🔇 Meu microfone: desligado';
    mic.setAttribute('aria-pressed', String(gv.mic === 'ligado')); mic.disabled = gv.mic === 'silenciado';
    mic.classList.toggle('ligado', gv.mic === 'ligado');
    const ouv = $('#voz-ouvir');
    ouv.textContent = gv.ouvir ? '🔊 Ouvir vozes: ligado' : '🔈 Ouvir vozes: desligado';
    ouv.setAttribute('aria-pressed', String(gv.ouvir));
    const ms = $('#voz-msgs');
    ms.textContent = msgsOcultas() ? '💬 Mensagens: ocultas' : '💬 Mensagens: visíveis';
    ms.setAttribute('aria-pressed', String(!msgsOcultas()));
    $('#voz-sair').hidden = !con;
    const lista = gv.participantes;
    $('#voz-lista').innerHTML = !con ? '' : lista.length ? lista.map(p => {
      const silC = gv.usuarioSilenciado(p.id, 'voz'), fala = gv.falando(p.pid);
      const rede = p.eu ? '' : p.estadoPeer === 'falhou' ? ' · sem conexão (rede)' : p.estadoPeer === 'conectando' ? ' · conectando…' : '';
      if (p.ouvinte) return `<li class="ouvinte"><span class="n"><span class="bolinha" style="background:#f5b301">👑</span>
        <span>${esc(p.apelido || 'Criador')}${p.eu ? ' (você)' : ''}<small>criador · só ouvindo</small></span></span><span aria-hidden="true">🎧</span></li>`;
      return `<li class="${fala ? 'falando' : ''}"><span class="n"><span class="bolinha" style="background:${esc(p.cor || '#7c3aed')}">${esc((p.apelido || '?')[0].toUpperCase())}</span>
        <span>${esc(p.apelido || '?')}${p.eu ? ' (você)' : ''}<small>${silC ? 'silenciado pelo criador' : p.mic ? 'mic ligado' : 'mic desligado'}${fala ? ' · falando' : ''}${rede}</small></span></span>
        <span aria-hidden="true">${silC ? '🚫' : p.mic ? '🎙️' : '🔇'}</span></li>`;
    }).join('') : '<li>Conectando…</li>';
  }
  desenhar();
  return gv;
}
