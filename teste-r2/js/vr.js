// Modo VR da Sessão Juntos.
// Usa a MESMA cena, os MESMOS objetos e o MESMO player da sala 3D: só muda a câmera e a forma de desenhar.
//  - WebXR (headsets): o WebGLRenderer do Three.js cuida das vistas dos olhos e da pose da cabeça.
//  - Cardboard (celular em óculos VR Box): sistema separado; duas câmeras com perspectiva própria (StereoCamera),
//    orientação pelo giroscópio (só rotação, sem rastreamento de posição) ou arrastando o dedo.
import * as THREE from 'three';
import { MidiaYouTube } from './fontes.js';

export const ESTADOS = { NORMAL: 'NORMAL', CHECANDO: 'VR_CHECKING', WEBXR: 'VR_WEBXR', CARDBOARD: 'VR_CARDBOARD', SAINDO: 'VR_EXITING', ERRO: 'VR_ERROR' };

const QUALIDADE = {   // resolução de desenho por nível (o vídeo em si não é alterado)
  baixa: { ratio: 0.75, xr: 0.6 },
  media: { ratio: 1, xr: 0.8 },
  alta: { ratio: 1.5, xr: 1 },
};
const MOBILE = matchMedia('(pointer:coarse)').matches || innerWidth < 760;

// objetos reaproveitados (nada é criado dentro do loop)
const _zee = new THREE.Vector3(0, 0, 1), _euler = new THREE.Euler(), _q0 = new THREE.Quaternion();
const _q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));   // câmera olhando para o "fundo" do aparelho
const _qYaw = new THREE.Quaternion(), _eixoY = new THREE.Vector3(0, 1, 0), _qDisp = new THREE.Quaternion(), _qAlvo = new THREE.Quaternion();
const _eTmp = new THREE.Euler(0, 0, 0, 'YXZ'), _v = new THREE.Vector3();
const _v4 = new THREE.Vector4(), _mInv = new THREE.Matrix4(), _mTela = new THREE.Matrix4();

// matrix3d que leva o retângulo W×H (canto 0,0) para o quadrilátero p0..p3 (homografia, como o telão projetado)
function matrizQuad(W, H, p) {
  const [x0, y0, x1, y1, x2, y2, x3, y3] = p;
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3, dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  let g = 0, h = 0;
  if (Math.abs(dx3) > 1e-9 || Math.abs(dy3) > 1e-9) {
    const den = dx1 * dy2 - dy1 * dx2;
    g = (dx3 * dy2 - dy3 * dx2) / den; h = (dx1 * dy3 - dy1 * dx3) / den;
  }
  const a = (x1 - x0 + g * x1) / W, b = (x3 - x0 + h * x3) / H, d = (y1 - y0 + g * y1) / W, e = (y3 - y0 + h * y3) / H;
  return `matrix3d(${a},${d},0,${g / W},${b},${e},0,${h / H},0,0,1,0,${x0},${y0},0,1)`;
}
// inverso da lente (mesma fórmula do shader): ponto da imagem sem lente -> ponto visto na tela
function desfazerLente(qx, qy, k1, k2, esc) {
  let px = qx / esc, py = qy / esc;
  for (let i = 0; i < 10; i++) { const r2 = px * px + py * py, f = esc * (1 + k1 * r2 + k2 * r2 * r2); px = qx / f; py = qy / f; }
  return [px, py];
}
// teclas que controles Bluetooth (VR Box) mandam quando estão no modo teclado/mídia
const TECLAS = { ArrowLeft: 'esquerda', ArrowRight: 'direita', ArrowUp: 'cima', ArrowDown: 'baixo', Enter: 'ok', ' ': 'ok', MediaPlayPause: 'ok', Select: 'ok', Escape: 'voltar', Backspace: 'voltar', GoBack: 'voltar', BrowserBack: 'voltar' };

// Lente do óculos de celular (VR Box/Cardboard): distorção em barril que compensa a lente de aumento.
// Um único alvo de renderização reaproveitado para os dois olhos (sem cópias extras de cena ou vídeo).
const SHADER_LENTE = {
  uniforms: { tDiffuse: { value: null }, k1: { value: 0.22 }, k2: { value: 0.24 }, escala: { value: 0.78 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float k1, k2, escala; varying vec2 vUv;
    void main(){
      vec2 p = vUv * 2.0 - 1.0;
      float r2 = dot(p, p);
      vec2 q = p * (1.0 + k1 * r2 + k2 * r2 * r2) * escala;
      if (abs(q.x) > 1.0 || abs(q.y) > 1.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
      vec4 c = texture2D(tDiffuse, q * 0.5 + 0.5);
      float borda = smoothstep(1.0, 0.92, max(abs(q.x), abs(q.y)));
      gl_FragColor = vec4(c.rgb * borda, 1.0);
    }`,
};

export class ModoVR {
  constructor(cinema, player, { aviso } = {}) {
    this.c = cinema; this.player = player; this.aviso = aviso || (() => { });
    this.estado = ESTADOS.NORMAL;
    this.ativo = false;
    this.qualidade = localStorage.getItem('vr-qualidade') || (MOBILE ? 'media' : 'alta');
    this.ipd = +localStorage.getItem('vr-ipd') || 0.064;
    this.distancia = 0;    // metros a mais (+ mais perto do telão)
    this.tamanho = 1;      // escala aparente do telão
    this.stereo = new THREE.StereoCamera();
    this.lente = localStorage.getItem('vr-lente') !== '0';
    this.rig = new THREE.Group(); this.rig.name = 'vr-rig';
    this._orient = this._orient.bind(this);
    this._arrastar = this._arrastar.bind(this);
    this._toque = this._toque.bind(this);
    this._tecla = this._tecla.bind(this);
    this._padLigou = () => this.aviso('🎮 Controle conectado: joystick escolhe o botão, A aperta, B esconde.');
    this._padAntes = {};
    this._fimXR = this._fimXR.bind(this);
    this._recentrarXR = this._recentrarXR.bind(this);
  }

  // ---------------------------------------------------------------- detecção (capacidade real, não modelo)
  async detectar() {
    const r = { webxr: false, cardboard: false, giroscopio: false, motivoXR: '' };
    if (!window.isSecureContext) r.motivoXR = 'Precisa de HTTPS.';
    else if (!navigator.xr) r.motivoXR = 'Este navegador não tem WebXR.';
    else {
      try { r.webxr = await navigator.xr.isSessionSupported('immersive-vr'); if (!r.webxr) r.motivoXR = 'Nenhum óculos VR compatível encontrado.'; }
      catch { r.motivoXR = 'O navegador recusou o WebXR.'; }
    }
    r.giroscopio = 'DeviceOrientationEvent' in window;
    r.cardboard = MOBILE && !!this.c.renderer.getContext();   // tela de toque + WebGL: dá para dividir a tela
    return r;
  }

  // ---------------------------------------------------------------- comum
  _podeEntrar() {
    if (this.estado !== ESTADOS.NORMAL && this.estado !== ESTADOS.ERRO) return false;
    return true;
  }

  // posição de espectador: a poltrona do próprio avatar (a mesma da visão normal), olhando para o telão
  _prepararAssento() {
    const c = this.c;
    this._salvo = {
      pos: c.camera.position.clone(), quat: c.camera.quaternion.clone(), alvo: c.controles.target.clone(),
      fov: c.camera.fov, ratio: c.renderer.getPixelRatio(), modo: c.modo, controles: c.controles.enabled,
      telaEscala: c.tela.scale.clone(), legY: c.legendaMesh?.position.y,
    };
    if (c.meuId && c.avatares.get(c.meuId)?.wrap) c.focarEm(c.meuId);
    c.interromperCamera();
    this.olhos = c.camera.position.clone();
    _v.copy(c.controles.target).sub(this.olhos); _v.y = 0;
    if (_v.lengthSq() < 1e-6) _v.set(0, 0, 1);
    this.direcao = _v.clone().normalize();                        // para onde o telão está (no plano)
    this.yawTelao = Math.atan2(-this.direcao.x, -this.direcao.z); // giro Y que faz a câmera olhar para o telão
    c.controles.enabled = false;
    document.body.classList.add('em-vr');
  }

  _posicaoOlhos(alvo) {
    alvo.copy(this.olhos).addScaledVector(this.direcao, this.distancia);
    alvo.z = Math.min(alvo.z, this.c.TELA.z - 2.5);   // nunca atravessa o telão
    return alvo;
  }

  // Fontes em iframe (YouTube, Drive pelo player do Drive, Internet Archive, sites) não podem virar textura WebGL
  // (proteção de origem do navegador). No VR o telão mostra um aviso; o som e a sincronia continuam no player original.
  _conferirFonte() {
    this._ytConferir();
    let modo = this.player?.modo || 'textura';
    if (this._yt) modo = 'yt-olhos';   // Cardboard + YouTube: um player por olho cobre o telão
    if (modo === this._modoFonte) return;
    this._modoFonte = modo;
    const m = this.c.materialTela;
    if (modo === 'yt-olhos') {
      if (this._texAviso && m.map === this._texAviso) { m.map = null; m.color.set('#000000'); m.needsUpdate = true; }
      return;
    }
    if (modo === 'textura') {
      if (this._texAviso) { m.map = this._mapAntes; m.color.copy(this._corAntes); m.needsUpdate = true; }
      if (!this.player.v.paused) this.c.mostrarVideo(true);
      return;
    }
    if (!this._texAviso) {
      const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 430;
      const g = cv.getContext('2d');
      g.fillStyle = '#0b0710'; g.fillRect(0, 0, 1024, 430);
      g.fillStyle = '#ff2a48'; g.font = 'bold 54px system-ui,sans-serif'; g.textAlign = 'center';
      g.fillText('🎬 Sessão Juntos', 512, 120);
      g.fillStyle = '#fff'; g.font = 'bold 40px system-ui,sans-serif';
      g.fillText('Este filme não pode aparecer no VR', 512, 215);
      g.fillStyle = '#c9c0d8'; g.font = '30px system-ui,sans-serif';
      g.fillText('YouTube, Drive e sites protegem o vídeo.', 512, 280);
      g.fillText('O som continua. Saia do VR para ver a imagem.', 512, 330);
      this._texAviso = new THREE.CanvasTexture(cv); this._texAviso.colorSpace = THREE.SRGBColorSpace;
      this._mapAntes = m.map; this._corAntes = m.color.clone();
    }
    m.map = this._texAviso; m.color.set('#ffffff'); m.needsUpdate = true;
    this.aviso(this.estado === ESTADOS.WEBXR && modo === 'youtube'
      ? 'No óculos VR (WebXR) o YouTube não aparece no telão: o som continua. No modo celular (Cardboard) ele aparece.'
      : 'Este filme vem de Drive/Archive/site e não aparece dentro do VR. O som continua; para ver a imagem, saia do VR.');
  }

  // ------------------------------------------------ YouTube nos dois olhos (só Cardboard)
  // O YouTube não vira textura, então cada olho recebe um player posto exatamente sobre o telão daquele olho:
  // o da esquerda é o player original (com som e sincronia da sala); o da direita é uma cópia muda que segue o tempo dele.
  _ytConferir() {
    const m = this.player?.m;
    const pode = this.estado === ESTADOS.CARDBOARD && this.player?.modo === 'youtube' && this.c.objTela && m?.id;
    if (!pode) { if (this._yt) this._ytParar(); return; }
    if (this._yt?.main === m) return;
    if (this._yt) this._ytParar();
    const caixaE = this.c.objTela.element;
    const W = parseFloat(caixaE.style.width) || 1280, H = parseFloat(caixaE.style.height) || 720;
    const dir = document.createElement('div'); dir.className = 'vr-olho-dir';
    const caixaD = document.createElement('div'); caixaD.className = 'vr-tela-dir';
    caixaD.style.cssText = `position:absolute;left:0;top:0;width:${W}px;height:${H}px;transform-origin:0 0;visibility:hidden`;
    dir.appendChild(caixaD); document.body.appendChild(dir);
    const yt2 = new MidiaYouTube(m.id, m.currentTime, {});
    caixaD.appendChild(yt2.el);
    document.body.classList.add('vr-yt');
    this._yt = { main: m, yt2, caixaE, caixaD, dir, W, H, estiloE: caixaE.getAttribute('style'), taxa: 1, espera: performance.now() + 1500, rel: {} };
  }
  _ytParar() {
    const y = this._yt; if (!y) return;
    this._yt = null;
    try { y.yt2.destruir(); } catch { }
    y.dir.remove();
    if (y.caixaE.isConnected) y.caixaE.setAttribute('style', y.estiloE);   // o CSS3D da sala volta a posicionar como antes
    document.body.classList.remove('vr-yt');
    this._modoFonte = null;
  }
  // coloca cada player sobre o telão como cada olho o vê (mesma câmera do olho e, se ligada, mesma lente)
  _ytDesenhar() {
    const y = this._yt, c = this.c; if (!y) return;
    const m = this._w / 2, h = this._h, T = c.TELA;
    const u = this._matLente?.uniforms || SHADER_LENTE.uniforms;
    c.tela.updateMatrixWorld();
    for (const [cam, el] of [[this.stereo.cameraL, y.caixaE], [this.stereo.cameraR, y.caixaD]]) {
      _mTela.copy(cam.projectionMatrix).multiply(_mInv.copy(cam.matrixWorld).invert()).multiply(c.tela.matrixWorld);
      const pts = []; let atras = false;
      for (const [s, t] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
        _v4.set((s - 0.5) * T.w, (0.5 - t) * T.h, 0, 1).applyMatrix4(_mTela);
        if (_v4.w <= 0.05) { atras = true; break; }
        let qx = _v4.x / _v4.w, qy = _v4.y / _v4.w;
        if (this.lente) [qx, qy] = desfazerLente(qx, qy, u.k1.value, u.k2.value, u.escala.value);
        pts.push((qx * 0.5 + 0.5) * m, (0.5 - qy * 0.5) * h);
      }
      const st = el.style;
      if (atras) { st.setProperty('visibility', 'hidden', 'important'); continue; }
      st.setProperty('visibility', 'visible', 'important');
      st.setProperty('position', 'absolute', 'important'); st.setProperty('left', '0', 'important'); st.setProperty('top', '0', 'important');
      st.setProperty('width', y.W + 'px', 'important'); st.setProperty('height', y.H + 'px', 'important');
      st.setProperty('transform-origin', '0 0', 'important');
      st.setProperty('transform', matrizQuad(y.W, y.H, pts), 'important');
    }
  }
  // tempo estimado entre as leituras do YouTube (a API só atualiza o tempo de tempos em tempos)
  _ytTempo(chave, bruto, taxa, agora) {
    const r = this._yt.rel[chave] || (this._yt.rel[chave] = {});
    if (bruto !== r.b) { r.b = bruto; r.t = agora; }
    return bruto + Math.min(agora - r.t, 400) / 1000 * taxa;
  }
  _ytSincronizar() {
    const y = this._yt, p = y?.yt2.p; if (!y || !y.yt2.pronto || !p?.getCurrentTime) return;
    const agora = performance.now();
    const pausar = y.main.paused || this.player.emAnuncio || y.main.carregando;
    if (pausar) { if (y.yt2._estado === 1) p.pauseVideo(); y.rel = {}; return; }
    if (y.yt2._estado !== 1 && y.yt2._estado !== 3) { p.playVideo(); return; }
    if (y.yt2.anuncio || y.yt2._estado === 3 || agora < y.espera) return;
    const t1 = this._ytTempo('a', y.main.currentTime, 1, agora), t2 = this._ytTempo('b', p.getCurrentTime(), y.taxa, agora);
    const d = t1 - t2, ad = Math.abs(d);
    if (!y.taxas) y.taxas = p.getAvailablePlaybackRates?.() || [1];
    const fino = y.taxas.includes(1.25) && y.taxas.includes(0.75);
    if (ad > (fino ? 0.5 : 0.12)) {   // muito longe: pula direto para o tempo do olho esquerdo
      p.seekTo(t1 + 0.08, true); y.espera = agora + 1200; y.rel = {};
      if (y.taxa !== 1) { p.setPlaybackRate(1); y.taxa = 1; }
      return;
    }
    if (!fino) return;
    let alvo = y.taxa;
    if (ad > 0.03) alvo = d > 0 ? 1.25 : 0.75;   // ajuste fino: acelera ou freia por alguns instantes
    else if (ad < 0.01) alvo = 1;
    if (alvo !== y.taxa) { p.setPlaybackRate(alvo); y.taxa = alvo; }
  }

  // ------------------------------------------------ controle Bluetooth (gamepad ou teclado)
  _tecla(e) {
    const a = TECLAS[e.key]; if (!a) return;
    e.preventDefault(); this.aoControle?.(a);
  }
  _lerControle() {
    const pads = navigator.getGamepads?.(); if (!pads) return;
    const agora = {};
    for (const g of pads) {
      if (!g || !g.connected) continue;
      const b = (i) => !!g.buttons[i]?.pressed, ax = (i) => g.axes[i] || 0;
      agora.esquerda ||= ax(0) < -0.6 || b(14); agora.direita ||= ax(0) > 0.6 || b(15);
      agora.cima ||= ax(1) < -0.6 || b(12); agora.baixo ||= ax(1) > 0.6 || b(13);
      agora.ok ||= b(0) || b(2) || b(4) || b(5) || b(6) || b(7) || b(9);
      agora.voltar ||= b(1) || b(3) || b(8);
    }
    for (const a of ['esquerda', 'direita', 'cima', 'baixo', 'ok', 'voltar']) {
      if (agora[a] && !this._padAntes[a]) this.aoControle?.(a);
      this._padAntes[a] = !!agora[a];
    }
  }

  _restaurarTela() {
    const m = this.c.materialTela;
    if (this._texAviso) {
      if (m.map === this._texAviso) { m.map = this._mapAntes; m.color.copy(this._corAntes); m.needsUpdate = true; }
      this._texAviso.dispose(); this._texAviso = null;
    }
    this._modoFonte = null;
    if (this.player?.modo === 'textura' && !this.player.v.paused) this.c.mostrarVideo(true);
  }

  // tamanho aparente do telão: escala só o quadro (telão, moldura, brilho e legenda), devolvido ao sair
  ajustarTamanho(d) {
    this.tamanho = THREE.MathUtils.clamp(+(this.tamanho + d).toFixed(2), 0.8, 1.2);
    for (const o of this.c.objetosTela) o.scale.set(this.tamanho, this.tamanho, 1);
    if (this.c.legendaMesh) this.c.legendaMesh.position.y = this.c.TELA.y - (this.c.TELA.h / 2 - 0.9) * this.tamanho;
    this._mostrarValores();
  }
  ajustarDistancia(d) {
    this.distancia = THREE.MathUtils.clamp(this.distancia + d, -2, 6);
    if (this.estado === ESTADOS.WEBXR) this._posicaoOlhos(this.rig.position);
    this._mostrarValores();
  }
  ajustarIPD(d) {
    this.ipd = THREE.MathUtils.clamp(+(this.ipd + d).toFixed(3), 0.05, 0.075);
    localStorage.setItem('vr-ipd', this.ipd);
    this._mostrarValores();
  }
  _mostrarValores() { this.aoValores?.({ ipd: Math.round(this.ipd * 1000), tamanho: Math.round(this.tamanho * 100), distancia: this.distancia }); }

  // ---------------------------------------------------------------- WebXR
  async entrarWebXR() {
    if (!this._podeEntrar()) return false;
    this.estado = ESTADOS.CHECANDO;
    const r = this.c.renderer;
    try {
      const sessao = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor'] });
      this._prepararAssento();
      r.xr.enabled = true;
      r.xr.setFramebufferScaleFactor(QUALIDADE[this.qualidade].xr);
      r.xr.setReferenceSpaceType('local');           // origem = cabeça no início: assento fica à altura dos olhos
      // a câmera vai para dentro de um "suporte" na poltrona; o runtime aplica a pose da cabeça por cima
      this._posicaoOlhos(this.rig.position);
      this.rig.rotation.set(0, this.yawTelao, 0);
      this.c.cena.add(this.rig);
      this.c.camera.position.set(0, 0, 0); this.c.camera.quaternion.identity();
      this.rig.add(this.c.camera);
      sessao.addEventListener('end', this._fimXR);
      this._sessao = sessao;
      await r.xr.setSession(sessao);
      this._controles = [r.xr.getController(0), r.xr.getController(1)];
      this._controles.forEach(ct => ct.addEventListener('squeeze', this._recentrarXR));
      this.estado = ESTADOS.WEBXR; this.ativo = true;
      this._modoFonte = null; this._conferirFonte();
      return true;
    } catch (e) {
      console.warn('WebXR', e);
      this._sessao = null;
      this._restaurar();
      this.estado = ESTADOS.ERRO;
      this.aviso('Não foi possível entrar no VR: ' + (e?.message || 'o aparelho recusou a sessão') + '. O cinema normal continua.');
      this.estado = ESTADOS.NORMAL;
      return false;
    }
  }

  // girar o suporte para o telão voltar à frente do olhar atual (sem tocar na pose real do headset)
  _recentrarXR() {
    if (this.estado !== ESTADOS.WEBXR) return;
    const cam = this.c.renderer.xr.getCamera();
    _eTmp.setFromQuaternion(cam.quaternion, 'YXZ');
    const yawCabecaLocal = _eTmp.y - this.rig.rotation.y;
    this.rig.rotation.y = this.yawTelao - yawCabecaLocal;
  }

  _fimXR() {   // a sessão terminou (botão sair, botão do headset, perda de foco do sistema)
    if (this._sessao) this._sessao.removeEventListener('end', this._fimXR);
    this._sessao = null;
    this._controles?.forEach(ct => ct.removeEventListener('squeeze', this._recentrarXR));
    this._controles = null;
    this.estado = ESTADOS.SAINDO;
    this._restaurar();
    this.estado = ESTADOS.NORMAL;
    this.aoSair?.();
  }

  // ---------------------------------------------------------------- Cardboard
  // pedirSensor: chamar DENTRO do toque do usuário (exigência do iPhone)
  async pedirPermissaoSensor() {
    const D = window.DeviceOrientationEvent;
    if (!D) return 'sem-sensor';
    if (typeof D.requestPermission === 'function') {
      try { return (await D.requestPermission()) === 'granted' ? 'ok' : 'negado'; } catch { return 'negado'; }
    }
    return 'ok';
  }

  async entrarCardboard(permissao) {
    if (!this._podeEntrar()) return false;
    this.estado = ESTADOS.CHECANDO;
    try {
      this._prepararAssento();
      document.body.classList.add('em-cardboard');
      const el = document.documentElement;
      try { if (!document.fullscreenElement && el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' }); } catch { }
      try { await screen.orientation?.lock?.('landscape'); } catch { }
      this._yaw = 0; this._pitch = 0; this._offsetYaw = null; this._temSensor = false;
      this._usarSensor = permissao === 'ok';
      if (this._usarSensor) addEventListener('deviceorientation', this._orient);
      // sem sensor (ou permissão negada): olhar arrastando o dedo
      this.c.canvas.addEventListener('pointerdown', this._arrastar);
      this.c.canvas.addEventListener('pointermove', this._arrastar);
      addEventListener('pointerup', this._arrastar);
      addEventListener('pointerdown', this._toque, true);
      addEventListener('keydown', this._tecla);
      addEventListener('gamepadconnected', this._padLigou);
      this._padAntes = {};
      this._fsSaiu = () => { if (!document.fullscreenElement && this.estado === ESTADOS.CARDBOARD) this.sairCardboard(); };
      if (document.fullscreenElement) document.addEventListener('fullscreenchange', this._fsSaiu);
      this._semSensorTimer = this._usarSensor ? setTimeout(() => {
        if (!this._temSensor) this.aviso('O giroscópio não respondeu neste aparelho. Arraste o dedo na tela para olhar em volta.');
      }, 2500) : null;
      if (!this._usarSensor) this.aviso(permissao === 'negado' ? 'Sem permissão para os sensores: arraste o dedo para olhar em volta.' : 'Este aparelho não tem sensor de movimento: arraste o dedo para olhar em volta.');
      this.c.renderer.setPixelRatio(Math.min(devicePixelRatio, QUALIDADE[this.qualidade].ratio));
      this.c.camera.fov = this.lente ? 90 : 80;   // a lente amplia o centro; um campo maior compensa
      this._fpsT = 0; this._fpsN = 0; this._fpsBaixoSeg = 0;
      this.estado = ESTADOS.CARDBOARD; this.ativo = true;
      this.redimensionar();
      this.c.camera.position.copy(this._posicaoOlhos(_v));
      this.c.camera.quaternion.setFromEuler(_eTmp.set(0, this.yawTelao, 0, 'YXZ'));
      this._modoFonte = null; this._conferirFonte();
      return true;
    } catch (e) {
      console.warn('Cardboard', e);
      this.sairCardboard();
      this.aviso('Não foi possível abrir o modo Cardboard. O cinema normal continua.');
      return false;
    }
  }

  _orient(e) {
    if (e.alpha == null && e.beta == null) return;
    this._temSensor = true;
    const ori = THREE.MathUtils.degToRad(screen.orientation?.angle ?? window.orientation ?? 0);
    _euler.set(THREE.MathUtils.degToRad(e.beta || 0), THREE.MathUtils.degToRad(e.alpha || 0), -THREE.MathUtils.degToRad(e.gamma || 0), 'YXZ');
    _qDisp.setFromEuler(_euler).multiply(_q1).multiply(_q0.setFromAxisAngle(_zee, -ori));
    if (this._offsetYaw === null) this.recentralizar();   // 1ª leitura: telão à frente (uma vez, sem girar sozinho)
    this._novo = true;
  }

  _arrastar(e) {
    if (e.type === 'pointerdown') { this._px = e.clientX; this._py = e.clientY; return; }
    if (e.type === 'pointerup') { this._px = null; return; }
    if (this._px == null || this._temSensor) return;
    this._yaw += (e.clientX - this._px) * 0.004; this._pitch = THREE.MathUtils.clamp(this._pitch + (e.clientY - this._py) * 0.004, -1.3, 1.3);
    this._px = e.clientX; this._py = e.clientY;
  }

  _toque() { this.aoToque?.(); }

  recentralizar() {
    if (this.estado === ESTADOS.WEBXR) return this._recentrarXR();
    if (this._temSensor) {
      _eTmp.setFromQuaternion(_qDisp, 'YXZ');
      this._offsetYaw = this.yawTelao - _eTmp.y;
    } else { this._yaw = 0; this._pitch = 0; }
  }

  sairCardboard() {
    if (this.estado !== ESTADOS.CARDBOARD && this.estado !== ESTADOS.CHECANDO) return;
    this.estado = ESTADOS.SAINDO;
    removeEventListener('deviceorientation', this._orient);
    this.c.canvas.removeEventListener('pointerdown', this._arrastar);
    this.c.canvas.removeEventListener('pointermove', this._arrastar);
    removeEventListener('pointerup', this._arrastar);
    removeEventListener('pointerdown', this._toque, true);
    removeEventListener('keydown', this._tecla);
    removeEventListener('gamepadconnected', this._padLigou);
    if (this._fsSaiu) document.removeEventListener('fullscreenchange', this._fsSaiu);
    clearTimeout(this._semSensorTimer);
    try { screen.orientation?.unlock?.(); } catch { }
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => { });
    this._restaurar();
    this.estado = ESTADOS.NORMAL;
    this.aoSair?.();
  }

  // ---------------------------------------------------------------- saída comum
  async sair() {
    if (this.estado === ESTADOS.WEBXR && this._sessao) { this.estado = ESTADOS.SAINDO; try { await this._sessao.end(); } catch { this._fimXR(); } return; }
    if (this.estado === ESTADOS.CARDBOARD) this.sairCardboard();
  }

  _restaurar() {
    const c = this.c, r = c.renderer, s = this._salvo;
    this.ativo = false;
    if (this.rig.parent) { this.rig.remove(c.camera); c.cena.remove(this.rig); }
    r.xr.enabled = false;
    r.setScissorTest(false);
    this._ytParar();
    this._liberarLente();
    this._restaurarTela();
    if (s) {
      for (const o of c.objetosTela) o.scale.copy(s.telaEscala);
      if (c.legendaMesh && s.legY != null) c.legendaMesh.position.y = s.legY;
      r.setPixelRatio(s.ratio);
      if (s.modo === 'geral') c.visaoGeral(true);   // volta a mostrar o próprio avatar e os limites da visão geral
      c.camera.position.copy(s.pos); c.camera.quaternion.copy(s.quat); c.camera.fov = s.fov;
      c.controles.target.copy(s.alvo); c.controles.enabled = s.controles;
    }
    this.tamanho = 1; this.distancia = 0; this._salvo = null;
    document.body.classList.remove('em-vr', 'em-cardboard');
    c._redimensionar();        // canvas, proporção e campo de visão do modo normal
    c.controles.update();
  }

  // ---------------------------------------------------------------- desenho (chamado pelo loop único da sala)
  redimensionar() {
    if (this.estado !== ESTADOS.CARDBOARD) return;
    const w = this.c.canvas.clientWidth || innerWidth, h = this.c.canvas.clientHeight || innerHeight;
    this.c.renderer.setSize(w, h, false);
    this.c.camera.aspect = (w / 2) / h;
    this.c.camera.updateProjectionMatrix();
    this._w = w; this._h = h;
  }

  quadro(dt) {
    this._conta = (this._conta || 0) + 1;
    if (this._conta % 30 === 0) this._conferirFonte();
    const c = this.c, r = c.renderer;
    if (this.estado === ESTADOS.WEBXR) { r.render(c.cena, c.camera); return; }
    if (this.estado !== ESTADOS.CARDBOARD) return;
    // orientação: giroscópio (com centralização) ou dedo — nunca os dois ao mesmo tempo
    if (this._temSensor) {
      _qYaw.setFromAxisAngle(_eixoY, this._offsetYaw || 0);
      _qAlvo.copy(_qYaw).multiply(_qDisp);
      c.camera.quaternion.slerp(_qAlvo, this._novo ? 0.6 : 1);   // suaviza o ruído do sensor sem atrasar o olhar
      this._novo = false;
    } else {
      c.camera.quaternion.setFromEuler(_eTmp.set(-this._pitch, this.yawTelao - this._yaw, 0, 'YXZ'));
    }
    this._posicaoOlhos(c.camera.position);   // só rotação: a posição fica na poltrona (sem 6DoF)
    c.camera.updateMatrixWorld();
    this.stereo.eyeSep = this.ipd;
    this.stereo.aspect = 1;   // a câmera já tem a proporção de meia tela
    this.stereo.update(c.camera);
    const w = this._w, h = this._h, m = w / 2;
    if (this.lente) {
      this._garantirLente();
      for (const [cam, x] of [[this.stereo.cameraL, 0], [this.stereo.cameraR, m]]) {
        r.setRenderTarget(this._rt); r.clear(); r.render(c.cena, cam);
        r.setRenderTarget(null);
        r.setScissorTest(true); r.setScissor(x, 0, m, h); r.setViewport(x, 0, m, h);
        r.render(this._cenaLente, this._camLente);
      }
    } else {
      r.setScissorTest(true);
      r.setScissor(0, 0, m, h); r.setViewport(0, 0, m, h); r.render(c.cena, this.stereo.cameraL);
      r.setScissor(m, 0, m, h); r.setViewport(m, 0, m, h); r.render(c.cena, this.stereo.cameraR);
    }
    r.setScissorTest(false); r.setViewport(0, 0, w, h);
    if (this._yt) { this._ytDesenhar(); if (this._conta % 4 === 0) this._ytSincronizar(); }
    this._lerControle();
    this._medirDesempenho(dt);
  }

  _garantirLente() {
    const r = this.c.renderer, pr = r.getPixelRatio();
    const W = Math.round(this._w / 2 * pr), H = Math.round(this._h * pr);
    if (!this._rt) {
      this._rt = new THREE.WebGLRenderTarget(W, H, { colorSpace: THREE.SRGBColorSpace, depthBuffer: true });
      this._matLente = new THREE.ShaderMaterial({ ...SHADER_LENTE, uniforms: THREE.UniformsUtils.clone(SHADER_LENTE.uniforms), depthTest: false, depthWrite: false, toneMapped: false });
      this._matLente.uniforms.tDiffuse.value = this._rt.texture;
      this._cenaLente = new THREE.Scene();
      this._cenaLente.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this._matLente));
      this._camLente = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    } else if (this._rt.width !== W || this._rt.height !== H) this._rt.setSize(W, H);
  }
  _liberarLente() {
    if (!this._rt) return;
    this._rt.dispose(); this._matLente.dispose(); this._cenaLente.children[0].geometry.dispose();
    this._rt = this._matLente = this._cenaLente = this._camLente = null;
  }
  alternarLente() { this.lente = !this.lente; localStorage.setItem('vr-lente', this.lente ? '1' : '0'); if (!this.lente) this._liberarLente(); this.c.camera.fov = this.lente ? 90 : 80; this.redimensionar(); return this.lente; }

  // qualidade adaptativa: se ficar abaixo de ~24 fps por 4 s seguidos, baixa a resolução um nível
  _medirDesempenho(dt) {
    this._fpsT += dt; this._fpsN++;
    if (this._fpsT < 1) return;
    const fps = this._fpsN / this._fpsT; this._fpsT = 0; this._fpsN = 0;
    this._fpsBaixoSeg = fps < 24 ? this._fpsBaixoSeg + 1 : 0;
    if (this._fpsBaixoSeg >= 4 && this.qualidade !== 'baixa') {
      this.definirQualidade(this.qualidade === 'alta' ? 'media' : 'baixa');
      this._fpsBaixoSeg = 0;
      this.aviso('Qualidade do VR reduzida para manter a imagem fluida.');
    }
  }

  definirQualidade(q) {
    if (!QUALIDADE[q]) return;
    this.qualidade = q; localStorage.setItem('vr-qualidade', q);
    if (this.estado === ESTADOS.CARDBOARD) { this.c.renderer.setPixelRatio(Math.min(devicePixelRatio, QUALIDADE[q].ratio)); this.redimensionar(); }
    this.aoQualidade?.(q);
  }
}
