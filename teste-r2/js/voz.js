// Conversa por voz em cada sala.
//
// Arquitetura (ver docs/VOZ.md):
//  - GerenciadorVoz: UM por página. Cuida do microfone, dos elementos <audio>, do indicador de fala,
//    dos controles (meu microfone, ouvir vozes, volume) e do silenciamento feito pelo criador.
//  - Transporte: quem leva o áudio. Hoje é TransporteP2P (WebRTC em malha, só áudio), com a
//    sinalização e a presença num canal do Supabase Realtime por sala ("voz-<id da sala>").
//    O áudio NUNCA passa pelo Supabase: vai direto entre os navegadores (STUN público do Google).
//    Para trocar por LiveKit (SFU) depois, basta escrever outro transporte com a mesma interface:
//      conectar(sala, eu) · desconectar() · definirFaixa(track|null) · anunciar(estado)
//      e chamar os ganchos aoParticipantes(lista) · aoStream(pid, stream) · aoSemStream(pid)
//      · aoPeerEstado(pid, estado) · aoCanal(estado, detalhe)
//
// Limites (malha P2P): cada pessoa envia o próprio áudio para cada outra, então a sala de voz
// aceita no máximo MAX_PARTICIPANTES. Sem servidor TURN, algumas redes 4G/NAT simétrico não
// conectam: o participante aparece como "sem conexão" e o resto continua funcionando.

export const MAX_PARTICIPANTES = 8;
export const ICE_SERVERS = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
const BACKOFF_MS = [1000, 2000, 4000, 8000, 15000];     // reconexão do canal: tentativas limitadas
const TENTATIVAS_ICE = 2;

export const nomeCanalVoz = (sala) => 'voz-' + String(sala).replace(/[^a-z0-9-]/gi, '').slice(0, 100);

// ------------------------------------------------------------------ transporte P2P
export class TransporteP2P {
  constructor(sb, { iceServers = ICE_SERVERS, max = MAX_PARTICIPANTES } = {}) {
    this.sb = sb; this.iceServers = iceServers; this.max = max;
    this.pid = crypto.randomUUID();               // id desta aba na voz (a mesma conta pode ter 2 abas)
    this.peers = new Map();                        // pid -> { pc, tr, iniciador, fila: [], tentativas }
    this.faixa = null; this.canal = null; this.eu = null; this.sala = null;
    this.ativo = false; this._tentativa = 0; this._tReconexao = null; this._desde = 0; this._estadoPresenca = {};
  }

  async conectar(sala, eu) {
    this.desconectar(true);
    this.sala = sala; this.eu = eu; this.ativo = true; this._desde = Date.now();
    this.pid = crypto.randomUUID();               // id novo a cada entrada: nenhum par antigo é reaproveitado
    this._abrirCanal();
  }

  _abrirCanal() {
    const canal = this.canal = this.sb.channel(nomeCanalVoz(this.sala), { config: { presence: { key: this.pid }, broadcast: { self: false } } });
    canal.on('presence', { event: 'sync' }, () => canal === this.canal && this._aoPresenca());
    canal.on('broadcast', { event: 'sinal' }, ({ payload }) => canal === this.canal && this._aoSinal(payload));
    canal.subscribe((s) => {
      if (canal !== this.canal || !this.ativo) return;
      if (s === 'SUBSCRIBED') {
        this._tentativa = 0; this.aoCanal?.('conectado');
        canal.track(this._presenca());
      } else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') this._reconectar(s);
    });
  }

  _reconectar(motivo) {
    if (!this.ativo || this._tReconexao) return;
    if (this._tentativa >= BACKOFF_MS.length) { this.aoCanal?.('erro', 'Não foi possível conectar à conversa (' + motivo + ').'); this.desconectar(); return; }
    const espera = BACKOFF_MS[this._tentativa++];
    this.aoCanal?.('reconectando');
    this._fecharPeers();
    const velho = this.canal; this.canal = null;
    try { this.sb.removeChannel(velho); } catch { }
    this._tReconexao = setTimeout(() => { this._tReconexao = null; if (this.ativo) { this.pid = crypto.randomUUID(); this._abrirCanal(); } }, espera);
  }

  desconectar(silencioso = false) {
    this.ativo = false;
    clearTimeout(this._tReconexao); this._tReconexao = null;
    this._fecharPeers();
    if (this.canal) { const c = this.canal; this.canal = null; try { c.untrack?.(); } catch { } try { this.sb.removeChannel(c); } catch { } }
    if (!silencioso) this.aoCanal?.('desconectado');
  }

  _fecharPeers() { for (const pid of [...this.peers.keys()]) this._fecharPeer(pid); }
  _fecharPeer(pid) {
    const p = this.peers.get(pid); if (!p) return;
    this.peers.delete(pid);
    p.pc.onicecandidate = p.pc.ontrack = p.pc.onconnectionstatechange = null;
    try { p.pc.close(); } catch { }
    this.aoSemStream?.(pid);
  }

  _presenca() { return { pid: this.pid, id: this.eu.id, apelido: this.eu.apelido, cor: this.eu.cor, desde: this._desde, ...this._estadoPresenca }; }
  anunciar(estado) {                              // estado simples e raro (ex.: { mic: true })
    this._estadoPresenca = { ...this._estadoPresenca, ...estado };
    if (this.canal && this.ativo) this.canal.track(this._presenca());
  }

  _aoPresenca() {
    const todos = Object.values(this.canal.presenceState()).map(a => a[0]).filter(x => x?.pid)
      .sort((a, b) => a.desde - b.desde || (a.pid < b.pid ? -1 : 1));
    const admitidos = todos.slice(0, this.max);
    if (!admitidos.some(x => x.pid === this.pid) && todos.some(x => x.pid === this.pid)) {
      this.aoCanal?.('cheia', `A conversa desta sala está cheia (máximo de ${this.max} pessoas na voz).`);
      this.desconectar(true); return;
    }
    const outros = admitidos.filter(x => x.pid !== this.pid);
    const vivos = new Set(outros.map(x => x.pid));
    for (const pid of [...this.peers.keys()]) if (!vivos.has(pid)) this._fecharPeer(pid);
    for (const x of outros) if (!this.peers.has(x.pid) && this.pid < x.pid) this._iniciar(x.pid);   // o menor id faz a oferta (sem colisão)
    this.aoParticipantes?.(admitidos.map(x => ({ ...x, eu: x.pid === this.pid, estadoPeer: x.pid === this.pid ? 'ok' : (this.peers.get(x.pid)?.estado || 'conectando') })));
  }

  _novoPeer(pid, iniciador) {
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    const p = { pc, tr: null, iniciador, fila: [], tentativas: 0, estado: 'conectando' };
    this.peers.set(pid, p);
    pc.onicecandidate = (e) => e.candidate && this._enviar(pid, { tipo: 'ice', cand: e.candidate.toJSON ? e.candidate.toJSON() : e.candidate });
    pc.ontrack = (e) => this.aoStream?.(pid, e.streams?.[0] || new MediaStream([e.track]));
    pc.onconnectionstatechange = () => {
      if (this.peers.get(pid) !== p) return;
      const s = pc.connectionState;
      if (s === 'connected') { p.tentativas = 0; this._estadoPeer(pid, p, 'ok'); }
      if (s === 'failed') {
        if (p.iniciador && p.tentativas < TENTATIVAS_ICE) { p.tentativas++; this._estadoPeer(pid, p, 'conectando'); this._oferta(pid, p, true); }
        else this._estadoPeer(pid, p, 'falhou');
      }
    };
    return p;
  }
  _estadoPeer(pid, p, estado) { if (p.estado !== estado) { p.estado = estado; this.aoPeerEstado?.(pid, estado); } }

  async _iniciar(pid) {
    const p = this._novoPeer(pid, true);
    p.tr = p.pc.addTransceiver('audio', { direction: 'sendrecv' });
    if (this.faixa) await p.tr.sender.replaceTrack(this.faixa).catch(() => { });
    await this._oferta(pid, p, false);
  }
  async _oferta(pid, p, reiniciarIce) {
    try {
      const o = await p.pc.createOffer(reiniciarIce ? { iceRestart: true } : undefined);
      if (this.peers.get(pid) !== p) return;
      await p.pc.setLocalDescription(o);
      this._enviar(pid, { tipo: 'oferta', sdp: p.pc.localDescription.sdp });
    } catch (e) { this._estadoPeer(pid, p, 'falhou'); }
  }

  async _aoSinal(m) {
    if (!m || m.para !== this.pid || !m.de || m.de === this.pid || !this.ativo) return;
    try {
      if (m.tipo === 'oferta') {
        let p = this.peers.get(m.de);
        if (!p) p = this._novoPeer(m.de, false);
        if (p.iniciador) return;                                 // regra do menor id: ignora oferta invertida
        await p.pc.setRemoteDescription({ type: 'offer', sdp: m.sdp });
        if (!p.tr) {
          p.tr = p.pc.getTransceivers().find(t => t.receiver.track?.kind === 'audio') || p.pc.getTransceivers()[0];
          if (p.tr) { p.tr.direction = 'sendrecv'; if (this.faixa) await p.tr.sender.replaceTrack(this.faixa).catch(() => { }); }
        }
        const a = await p.pc.createAnswer();
        await p.pc.setLocalDescription(a);
        this._enviar(m.de, { tipo: 'resposta', sdp: p.pc.localDescription.sdp });
        this._descarregar(p);
      } else if (m.tipo === 'resposta') {
        const p = this.peers.get(m.de); if (!p || !p.iniciador || p.pc.signalingState !== 'have-local-offer') return;
        await p.pc.setRemoteDescription({ type: 'answer', sdp: m.sdp });
        this._descarregar(p);
      } else if (m.tipo === 'ice') {
        const p = this.peers.get(m.de); if (!p) return;
        if (p.pc.remoteDescription) await p.pc.addIceCandidate(m.cand).catch(() => { });
        else if (p.fila.length < 50) p.fila.push(m.cand);
      }
    } catch (e) { const p = this.peers.get(m.de); if (p) this._estadoPeer(m.de, p, 'falhou'); }
  }
  _descarregar(p) { const f = p.fila; p.fila = []; f.forEach(c => p.pc.addIceCandidate(c).catch(() => { })); }
  _enviar(para, msg) { this.canal?.send({ type: 'broadcast', event: 'sinal', payload: { ...msg, de: this.pid, para } }); }

  async definirFaixa(track) {
    this.faixa = track || null;
    await Promise.all([...this.peers.values()].map(p => p.tr?.sender.replaceTrack(this.faixa).catch(() => { })));
  }
}

// ------------------------------------------------------------------ gerenciador (um por página)
let instancia = null;
export function gerenciadorVoz(opcoes) {
  if (!instancia) instancia = new GerenciadorVoz(opcoes);
  return instancia;
}

export class GerenciadorVoz {
  // opcoes: { sb, sala, eu: {id, apelido, cor}, transporte?, aoMudar?(gv), aviso?(texto) }
  constructor({ sb, sala, eu, transporte, aoMudar, aviso }) {
    if (instancia) throw new Error('GerenciadorVoz já existe: use gerenciadorVoz()');
    this.sb = sb; this.sala = sala; this.eu = eu; this.aoMudar = aoMudar; this.aviso = aviso || (() => { });
    this.t = transporte || new TransporteP2P(sb);
    this.estado = 'desconectado';        // desconectado | conectando | conectado | reconectando | erro | cheia
    this.mic = 'desligado';              // desligado | ligado | sem-permissao | silenciado
    this.ouvir = localStorage.getItem('cine_voz_ouvir') !== '0';
    this.volume = Math.min(1, Math.max(0, parseFloat(localStorage.getItem('cine_voz_volume') ?? '1') || 0));
    this.participantes = [];             // da presença da voz
    this.streams = new Map();            // pid -> MediaStream
    this.audios = new Map();             // pid -> <audio>
    this.medidores = new Map();          // pid -> { fonte, analisador, buf, falando, ate }
    this.silenciados = { voz: new Map(), texto: new Map() };   // usuario -> ate (null = até revogar)
    this.stream = null; this.ctx = null; this._tFala = null; this._tSil = null; this.detalhe = '';
    this.caixa = document.getElementById('voz-audios') || Object.assign(document.body.appendChild(document.createElement('div')), { id: 'voz-audios', hidden: true });

    const t = this.t;
    t.aoParticipantes = (l) => { this.participantes = l; this._aplicarSilencios(); this._mudou(); };
    t.aoStream = (pid, s) => this._anexar(pid, s);
    t.aoSemStream = (pid) => this._soltar(pid);
    t.aoPeerEstado = (pid, e) => { const x = this.participantes.find(p => p.pid === pid); if (x) x.estadoPeer = e; this._mudou(); };
    t.aoCanal = (e, msg) => {
      if (e === 'conectado') this.estado = 'conectado';
      else if (e === 'reconectando') this.estado = 'reconectando';
      else if (e === 'erro' || e === 'cheia') { this.estado = e; this.detalhe = msg || ''; this._liberarMic(); this._limparMidia(); if (msg) this.aviso(msg); }
      else if (e === 'desconectado' && this.estado !== 'erro' && this.estado !== 'cheia') this.estado = 'desconectado';
      this._mudou();
    };
    this._aoSair = () => this.destruir();
    addEventListener('pagehide', this._aoSair);
    instancia = this;
  }

  get conectado() { return ['conectando', 'conectado', 'reconectando'].includes(this.estado); }
  meuSilencio(tipo) { return this.silenciados[tipo].has(this.eu.id) ? { ate: this.silenciados[tipo].get(this.eu.id) } : null; }
  usuarioSilenciado(uid, tipo) { const m = this.silenciados[tipo]; if (!m.has(uid)) return false; const ate = m.get(uid); return !ate || new Date(ate) > new Date(); }

  async entrar() {
    if (this.conectado) return;
    this.estado = 'conectando'; this.detalhe = ''; this._mudou();
    try {
      this._contexto();
      await this.atualizarSilenciados();
      await this.t.conectar(this.sala, this.eu);
      this.t.anunciar({ mic: false });
      clearInterval(this._tFala); this._tFala = setInterval(() => this._medir(), 200);     // indicador de fala sem loop de animação
      clearInterval(this._tSil); this._tSil = setInterval(() => this.atualizarSilenciados(), 60000);
    } catch (e) { this.estado = 'erro'; this.detalhe = 'Voz indisponível: ' + (e.message || e); this.aviso(this.detalhe); this._mudou(); }
  }

  // Sair da conversa: só a voz. A sala, o chat e o filme continuam.
  sair() {
    this._liberarMic();
    this.t.desconectar();
    this._limparMidia();
    this.estado = 'desconectado'; this.participantes = []; this._mudou();
  }

  _limparMidia() {
    clearInterval(this._tFala); this._tFala = null; clearInterval(this._tSil); this._tSil = null;
    for (const pid of [...this.audios.keys()]) this._soltar(pid);
    this._soltarMedidor('eu');
  }

  destruir() {
    this.sair();
    if (this.ctx) { try { this.ctx.close(); } catch { } this.ctx = null; }
    removeEventListener('pagehide', this._aoSair);
    if (instancia === this) instancia = null;
  }

  // Troca de sala sem recarregar a página: sai do canal anterior antes de entrar no novo.
  async trocarSala(sala) {
    const estava = this.conectado;
    this.sair(); this.sala = sala;
    if (estava) await this.entrar();
  }

  // ---------------------------------------------------- microfone
  async ligarMic() {
    const s = this.meuSilencio('voz');
    if (s) { this.mic = 'silenciado'; this.aviso('Seu microfone foi silenciado pelo criador' + (s.ate ? ' até ' + new Date(s.ate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '') + '.'); this._mudou(); return false; }
    if (!this.conectado) await this.entrar();
    if (!this.conectado) return false;
    if (!navigator.mediaDevices?.getUserMedia) { this.mic = 'sem-permissao'; this.aviso('Este navegador não libera o microfone (é preciso HTTPS).'); this._mudou(); return false; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
      if (!this.conectado || this.meuSilencio('voz')) { stream.getTracks().forEach(t => t.stop()); return false; }
      this._liberarMic();
      this.stream = stream;
      const track = stream.getAudioTracks()[0];
      track.onended = () => { if (this.stream === stream) { this.desligarMic(); this.aviso('O microfone foi desconectado.'); } };   // fone removido, outro app pegou
      await this.t.definirFaixa(track);
      this._medidor('eu', stream);
      this.mic = 'ligado'; this.t.anunciar({ mic: true }); this._mudou();
      return true;
    } catch (e) {
      const negado = e?.name === 'NotAllowedError' || e?.name === 'SecurityError';
      this.mic = negado ? 'sem-permissao' : 'desligado';
      this.aviso(negado ? 'Permissão do microfone negada. Você ainda ouve a conversa; libere o microfone nas configurações do navegador.'
        : e?.name === 'NotFoundError' ? 'Nenhum microfone encontrado.' : e?.name === 'NotReadableError' ? 'O microfone está sendo usado por outro app.' : 'Não foi possível ligar o microfone.');
      this._mudou(); return false;
    }
  }
  desligarMic() { this._liberarMic(); if (this.mic === 'ligado') this.mic = 'desligado'; this.t.anunciar({ mic: false }); this._mudou(); }
  alternarMic() { return this.mic === 'ligado' ? this.desligarMic() : this.ligarMic(); }
  _liberarMic() {
    if (this.stream) { this.stream.getTracks().forEach(t => { t.onended = null; t.stop(); }); this.stream = null; }
    this._soltarMedidor('eu');
    this.t.definirFaixa(null);
  }

  // ---------------------------------------------------- ouvir / volume
  alternarOuvir() { this.ouvir = !this.ouvir; localStorage.setItem('cine_voz_ouvir', this.ouvir ? '1' : '0'); this._aplicarSilencios(); this._mudou(); }
  definirVolume(v) { this.volume = Math.min(1, Math.max(0, +v || 0)); localStorage.setItem('cine_voz_volume', String(this.volume)); this.audios.forEach(a => a.volume = this.volume); }

  // ---------------------------------------------------- silenciamento do criador (fonte: banco)
  async atualizarSilenciados() {
    try {
      const { data, error } = await this.sb.rpc('silenciados_ativos');
      if (error) return;                                     // sem a migration 007: a voz funciona sem o filtro
      const voz = new Map(), texto = new Map();
      (data || []).forEach(s => (s.tipo === 'voz' ? voz : s.tipo === 'texto' ? texto : new Map()).set(s.usuario, s.ate));
      this.silenciados = { voz, texto };
    } catch { return; }
    if (this.meuSilencio('voz')) { if (this.mic === 'ligado') this.aviso('Seu microfone foi silenciado pelo criador.'); this._liberarMic(); this.mic = 'silenciado'; this.t.anunciar?.({ mic: false }); }
    else if (this.mic === 'silenciado') this.mic = 'desligado';
    this._aplicarSilencios(); this._mudou();
  }

  _aplicarSilencios() {
    for (const [pid, a] of this.audios) {
      const uid = this.participantes.find(p => p.pid === pid)?.id;
      const recusar = uid && this.usuarioSilenciado(uid, 'voz');
      if (recusar) { if (a.srcObject) a.srcObject = null; }          // não toca a faixa de quem o criador silenciou
      else if (!a.srcObject && this.streams.get(pid)) { a.srcObject = this.streams.get(pid); a.play?.().catch(() => { }); }
      a.muted = !this.ouvir || !!recusar;
    }
  }

  // ---------------------------------------------------- áudio recebido
  _anexar(pid, stream) {
    this.streams.set(pid, stream);
    let a = this.audios.get(pid);
    if (!a) {
      a = document.createElement('audio');
      a.autoplay = true; a.playsInline = true; a.dataset.pid = pid;
      this.caixa.appendChild(a); this.audios.set(pid, a);
    }
    a.srcObject = stream; a.volume = this.volume;
    a.play?.().catch(() => { });
    this._medidor(pid, stream);
    this._aplicarSilencios(); this._mudou();
  }
  _soltar(pid) {
    const a = this.audios.get(pid);
    if (a) { a.pause?.(); a.srcObject = null; a.remove(); this.audios.delete(pid); }
    this.streams.delete(pid);
    this._soltarMedidor(pid);
  }

  // ---------------------------------------------------- indicador de fala (AudioContext, 5x por segundo)
  _contexto() {
    if (this.ctx || !(window.AudioContext || window.webkitAudioContext)) return this.ctx;
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { this.ctx = null; }
    return this.ctx;
  }
  _medidor(chave, stream) {
    this._soltarMedidor(chave);
    const ctx = this._contexto(); if (!ctx) return;
    try {
      ctx.resume?.().catch(() => { });
      const fonte = ctx.createMediaStreamSource(stream), analisador = ctx.createAnalyser();
      analisador.fftSize = 256; fonte.connect(analisador);
      this.medidores.set(chave, { fonte, analisador, buf: new Uint8Array(analisador.fftSize), falando: false, ate: 0 });
    } catch { }
  }
  _soltarMedidor(chave) {
    const m = this.medidores.get(chave); if (!m) return;
    try { m.fonte.disconnect(); } catch { }
    this.medidores.delete(chave);
  }
  _medir() {
    if (document.hidden) return;
    let mudou = false; const agora = performance.now();
    for (const [chave, m] of this.medidores) {
      m.analisador.getByteTimeDomainData(m.buf);
      let soma = 0; for (let i = 0; i < m.buf.length; i++) { const v = (m.buf[i] - 128) / 128; soma += v * v; }
      const alto = Math.sqrt(soma / m.buf.length) > 0.04;
      if (alto) m.ate = agora + 600;                          // segura o indicador para não piscar
      const falando = agora < m.ate && (chave !== 'eu' || this.mic === 'ligado');
      if (falando !== m.falando) { m.falando = falando; mudou = true; }
    }
    if (mudou) this._mudou();
  }
  falando(pid) { return !!this.medidores.get(pid === this.t.pid ? 'eu' : pid)?.falando; }

  // ---------------------------------------------------- diagnóstico (testes de vazamento)
  diagnostico() {
    return {
      estado: this.estado, mic: this.mic, peers: this.t.peers.size, audios: this.audios.size,
      elementosAudio: this.caixa.querySelectorAll('audio').length, medidores: this.medidores.size,
      faixasMic: this.stream ? this.stream.getTracks().filter(t => t.readyState === 'live').length : 0,
      canal: !!this.t.canal, timers: [this._tFala, this._tSil].filter(Boolean).length,
    };
  }

  _mudou() { try { this.aoMudar?.(this); } catch (e) { console.warn(e); } }
}
