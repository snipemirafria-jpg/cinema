// Modo VR da Sessão Juntos.
// Usa a MESMA cena, os MESMOS objetos e o MESMO player da sala 3D: só muda a câmera e a forma de desenhar.
//  - WebXR (headsets): o WebGLRenderer do Three.js cuida das vistas dos olhos e da pose da cabeça.
//  - Cardboard (celular em óculos VR Box): sistema separado; duas câmeras com perspectiva própria (StereoCamera),
//    orientação pelo giroscópio (só rotação, sem rastreamento de posição) ou arrastando o dedo.
import * as THREE from 'three';

export const ESTADOS = { NORMAL: 'NORMAL', CHECANDO: 'VR_CHECKING', WEBXR: 'VR_WEBXR', CARDBOARD: 'VR_CARDBOARD', SAINDO: 'VR_EXITING', ERRO: 'VR_ERROR' };

const QUALIDADE = {   // resolução de desenho por nível (o vídeo em si não é alterado)
  baixa: { ratio: 0.6, xr: 0.6 },
  media: { ratio: 1, xr: 0.8 },
  alta: { ratio: 1.5, xr: 1 },
};
const MOBILE = matchMedia('(pointer:coarse)').matches || innerWidth < 760;

// objetos reaproveitados (nada é criado dentro do loop)
const _zee = new THREE.Vector3(0, 0, 1), _euler = new THREE.Euler(), _q0 = new THREE.Quaternion();
const _q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));   // câmera olhando para o "fundo" do aparelho
const _qYaw = new THREE.Quaternion(), _eixoY = new THREE.Vector3(0, 1, 0), _qDisp = new THREE.Quaternion(), _qAlvo = new THREE.Quaternion();
const _eTmp = new THREE.Euler(0, 0, 0, 'YXZ'), _v = new THREE.Vector3();
// teclas que controles Bluetooth (VR Box) mandam quando estão no modo teclado/mídia
const TECLAS = { ArrowLeft: 'esquerda', ArrowRight: 'direita', ArrowUp: 'cima', ArrowDown: 'baixo', Enter: 'ok', ' ': 'ok', MediaPlayPause: 'ok', Select: 'ok', Escape: 'voltar', Backspace: 'voltar', GoBack: 'voltar', BrowserBack: 'voltar' };

// Lente do óculos de celular (VR Box/Cardboard): distorção em barril que compensa a lente de aumento.
// O par inteiro ocupa uma textura. A lente compõe os dois olhos em uma passagem.
const SHADER_LENTE = {
  uniforms: { tDiffuse: { value: null }, k1: { value: 0.22 }, k2: { value: 0.24 }, escala: { value: 0.78 }, divisao: { value: 0.5 }, meioTexel: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float k1, k2, escala, divisao, meioTexel; varying vec2 vUv;
    void main(){
      float inicio = vUv.x < divisao ? 0.0 : divisao;
      float largura = vUv.x < divisao ? divisao : 1.0 - divisao;
      vec2 p = vec2((vUv.x - inicio) / largura, vUv.y) * 2.0 - 1.0;
      float r2 = dot(p, p);
      vec2 q = p * (1.0 + k1 * r2 + k2 * r2 * r2) * escala;
      if (abs(q.x) > 1.0 || abs(q.y) > 1.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
      vec2 uv = q * 0.5 + 0.5;
      uv.x = clamp(inicio + uv.x * largura, inicio + meioTexel, inicio + largura - meioTexel);
      vec4 c = texture2D(tDiffuse, uv);
      float borda = 1.0 - smoothstep(0.92, 1.0, max(abs(q.x), abs(q.y)));
      gl_FragColor = vec4(c.rgb * borda, 1.0);
      #include <colorspace_fragment>
    }`,
};

export class ModoVR {
  constructor(cinema, player, { aviso } = {}) {
    this.c = cinema; this.player = player; this.aviso = aviso || (() => { });
    this.estado = ESTADOS.NORMAL;
    this.ativo = false;
    const qualidade = localStorage.getItem('vr-qualidade');
    this.qualidade = Object.hasOwn(QUALIDADE, qualidade) ? qualidade : (MOBILE ? 'media' : 'alta');
    this.ipd = +localStorage.getItem('vr-ipd') || 0.064;
    this.distancia = 0;    // metros a mais (+ mais perto do telão)
    this.tamanho = 1;      // escala aparente do telão
    this.stereo = new THREE.StereoCamera();
    this.par = new THREE.ArrayCamera([this.stereo.cameraL, this.stereo.cameraR]);
    this.par.matrixAutoUpdate = this.par.matrixWorldAutoUpdate = false;
    this.par.layers.mask = this.stereo.cameraL.layers.mask | this.stereo.cameraR.layers.mask;
    for (const olho of this.par.cameras) olho.viewport = new THREE.Vector4();
    this._buffer = new THREE.Vector2();
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
    r.cardboard = !!this.c.renderer.getContext();
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
    const modo = this.player?.modo || 'textura';
    if (modo === this._modoFonte) return;
    this._modoFonte = modo;
    const m = this.c.materialTela;
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
    this.aviso('Para ver este filme, volte à sala. No VR Box você pode escolher os filmes do CineOnline.');
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
    if (this.estado === ESTADOS.CARDBOARD) this._projecaoPar();
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
    if (!this._podeEntrar() || !this.player?.podeEntrarCardboard()) return false;
    this.estado = ESTADOS.CHECANDO;
    try {
      this._prepararAssento();
      document.body.classList.add('em-cardboard');
      const el = document.documentElement;
      try { if (!document.fullscreenElement && el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' }); } catch { }
      try { await screen.orientation?.lock?.('landscape'); } catch { }
      this._yaw = 0; this._pitch = 0; this._offsetYaw = null; this._temSensor = false;
      permissao = await permissao;
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
      this.c.renderer.setPixelRatio(this._resolucaoPreferida());
      this.c.camera.fov = this.lente ? 90 : 80;   // a lente amplia o centro; um campo maior compensa
      this._tempoAmostra = this._quadrosAmostra = this._amostrasLentas = 0;
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
    this.player.sairFilmeVR();
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
    this.c.renderer.getDrawingBufferSize(this._buffer);
    const meio = Math.floor(this._buffer.x / 2);
    this.stereo.cameraL.viewport.set(0, 0, meio, this._buffer.y);
    this.stereo.cameraR.viewport.set(meio, 0, this._buffer.x - meio, this._buffer.y);
    this._projecaoPar();
    if (this._rt) this._garantirLente();
  }

  _projecaoPar() {
    const cam = this.c.camera;
    // Inclui as duas pirâmides de visão na seleção de objetos, inclusive na borda próxima.
    const p = this.par.projectionMatrix.copy(cam.projectionMatrix);
    const margem = this.ipd * 0.5 * (1 / cam.near + 1 / cam.focus);
    p.elements[0] = 1 / (1 / p.elements[0] + margem);
    this.par.projectionMatrixInverse.copy(p).invert();
  }

  quadro(dt) {
    this._conferirFonte();
    const c = this.c, r = c.renderer;
    if (this.estado === ESTADOS.WEBXR) { r.render(c.cena, c.camera); c.atualizarMeuOlhar?.(r.xr.getCamera()); return; }
    if (this.estado !== ESTADOS.CARDBOARD) return;
    // orientação: giroscópio (com centralização) ou dedo — nunca os dois ao mesmo tempo
    if (this._temSensor) {
      _qYaw.setFromAxisAngle(_eixoY, this._offsetYaw || 0);
      _qAlvo.copy(_qYaw).multiply(_qDisp);
      c.camera.quaternion.slerp(_qAlvo, 1 - Math.exp(-55 * Math.min(dt, 0.1)));
    } else {
      c.camera.quaternion.setFromEuler(_eTmp.set(-this._pitch, this.yawTelao - this._yaw, 0, 'YXZ'));
    }
    this._posicaoOlhos(c.camera.position);   // só rotação: a posição fica na poltrona (sem 6DoF)
    c.camera.updateMatrixWorld();
    c.atualizarMeuOlhar?.(c.camera);
    this.stereo.eyeSep = this.ipd;
    this.stereo.aspect = 1;   // a câmera já tem a proporção de meia tela
    this.stereo.update(c.camera);
    this.par.matrixWorld.copy(c.camera.matrixWorld);
    this.par.matrixWorldInverse.copy(c.camera.matrixWorldInverse);
    for (const olho of this.par.cameras) olho.matrixWorldInverse.copy(olho.matrixWorld).invert();
    // Uma travessia da sala e uma atualização da VideoTexture para o par inteiro.
    if (this.lente) {
      if (!this._rt) this._garantirLente();
      r.setRenderTarget(this._rt);
      r.render(c.cena, this.par);
      r.setRenderTarget(null);
      r.render(this._cenaLente, this._camLente);
    } else {
      r.render(c.cena, this.par);
      r.setViewport(0, 0, this._w, this._h);
    }
    if (!this.ativo) return;
    this._lerControle();
    this._medirDesempenho(dt);
  }

  _garantirLente() {
    const { x: W, y: H } = this._buffer;
    if (!this._rt) {
      this._rt = new THREE.WebGLRenderTarget(W, H, { colorSpace: THREE.SRGBColorSpace, depthBuffer: true });
      this._matLente = new THREE.ShaderMaterial({ ...SHADER_LENTE, uniforms: THREE.UniformsUtils.clone(SHADER_LENTE.uniforms), depthTest: false, depthWrite: false, toneMapped: false });
      this._matLente.uniforms.tDiffuse.value = this._rt.texture;
      this._cenaLente = new THREE.Scene();
      this._cenaLente.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this._matLente));
      this._camLente = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    } else if (this._rt.width !== W || this._rt.height !== H) this._rt.setSize(W, H);
    this._matLente.uniforms.divisao.value = this.stereo.cameraL.viewport.z / W;
    this._matLente.uniforms.meioTexel.value = 0.5 / W;
  }
  _liberarLente() {
    if (!this._rt) return;
    this._rt.dispose(); this._matLente.dispose(); this._cenaLente.children[0].geometry.dispose();
    this._rt = this._matLente = this._cenaLente = this._camLente = null;
  }
  alternarLente() { this.lente = !this.lente; localStorage.setItem('vr-lente', this.lente ? '1' : '0'); if (!this.lente) this._liberarLente(); this.c.camera.fov = this.lente ? 90 : 80; this.redimensionar(); return this.lente; }

  _resolucaoPreferida() {
    const limite = this.qualidade === 'alta' ? devicePixelRatio : this._salvo.ratio;
    return Math.min(devicePixelRatio, QUALIDADE[this.qualidade].ratio, limite);
  }

  // Reduz só a resolução desta sessão. O relógio e a qualidade do filme seguem no player.
  _medirDesempenho(dt) {
    if (dt > 1 || dt <= 0) { this._tempoAmostra = this._quadrosAmostra = this._amostrasLentas = 0; return; }
    this._tempoAmostra += dt; this._quadrosAmostra++;
    if (this._tempoAmostra < 1) return;
    const fps = this._quadrosAmostra / this._tempoAmostra;
    this._quadrosAmostra = this._tempoAmostra = 0;
    this._amostrasLentas = fps < 42 ? this._amostrasLentas + 1 : 0;
    if (this._amostrasLentas < 2) return;
    this._amostrasLentas = 0;
    const r = this.c.renderer, atual = r.getPixelRatio();
    const proxima = Math.max(0.5, +(atual * 0.8).toFixed(2));
    if (proxima >= atual) return;
    r.setPixelRatio(proxima); this.redimensionar();
  }

  definirQualidade(q) {
    if (!QUALIDADE[q]) return;
    this.qualidade = q; localStorage.setItem('vr-qualidade', q);
    if (this.estado === ESTADOS.CARDBOARD) { this.c.renderer.setPixelRatio(this._resolucaoPreferida()); this.redimensionar(); }
    this.aoQualidade?.(q);
  }
}
