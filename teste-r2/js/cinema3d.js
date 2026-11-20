// Sala de cinema 3D: telão, poltronas vermelhas, neon, avatares sentados com nomes.
import * as THREE from 'three';
import { AmbienteCinema, TELA, SALA, MOBILE, FILEIRAS, baratear } from './ambiente-cinema.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { CSS3DRenderer, CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
import { criarAvatar, poseSentado, animarOcioso, corpoPOV } from './avatar.js';
import { esc } from './supa.js';
import { SalaTematica } from './temas-sala.js';

// Android: mantém o filme em camada 2D independente e economiza GPU na sala WebGL.
// ?gpu=normal permite comparar a renderização antiga, sem mexer nas configurações da conta.
const ANDROID_LEVE = /Android/i.test(navigator.userAgent) && new URLSearchParams(location.search).get('gpu') !== 'normal';

export class Cinema extends AmbienteCinema {
  constructor(canvas, camadaRotulos, video) {
    super();
    this.canvas = canvas;
    this.video = video;
    this.avatares = new Map();      // id -> {wrap, rotulo, cfgKey, assento}
    this.relogio = new THREE.Clock();
    this.meuId = null;
    this.modo = 'poltrona';

    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !MOBILE, powerPreference: MOBILE ? 'default' : 'high-performance' });
    r.setPixelRatio(Math.min(devicePixelRatio, ANDROID_LEVE ? 0.65 : MOBILE ? 1 : 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = MOBILE ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = !MOBILE;
    r.shadowMap.type = THREE.PCFSoftShadowMap;

    this.css = new CSS2DRenderer({ element: camadaRotulos });
    // camada para vídeos que não viram textura (YouTube, Drive, sites): o elemento HTML é posto em cima do telão em 3D
    const camadaTela = document.createElement('div'); camadaTela.className = 'camada-tela';
    canvas.after(camadaTela);
    this.css3d = new CSS3DRenderer({ element: camadaTela });
    // O iframe do YouTube em CSS3D pode prejudicar a composição de vídeo no Chrome Android.
    // Esta camada alternativa conserva o player original, mas elimina a transformação 3D do iframe.
    this.camadaPlana = document.createElement('div');
    this.camadaPlana.className = 'camada-tela-plana';
    camadaTela.after(this.camadaPlana);
    this.cenaHtml = new THREE.Scene();
    this._telaPlana = false;
    this._planaUltima = '';

    this.cena = new THREE.Scene();
    this.cena.background = new THREE.Color('#06030a');
    this.cena.fog = new THREE.Fog('#06030a', 22, 48);

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 120);
    this.camera.position.set(0, 7, -10);
    this.controles = new OrbitControls(this.camera, canvas);
    this.controles.enableDamping = true;
    this._movendoAte = 0;
    const registrarMovimento = () => { this._movendoAte = performance.now() + 250; };
    this.controles.addEventListener('start', registrarMovimento);
    this.controles.addEventListener('change', registrarMovimento);
    this.controles.enablePan = false;
    this.controles.minDistance = 1.2;
    this.controles.maxDistance = 20;
    this.controles.maxPolarAngle = Math.PI * 0.62;
    this.controles.target.set(0, 3.5, 8);
    this.controles.rotateSpeed = MOBILE ? 0.5 : 0.7;

    this.assentos = [];
    this._m = {}; this._l = { pontos: [] };     // materiais e luzes da sala que os temas podem ajustar
    this._matsPoltrona = [];
    this._montarSala();
    this._montarTela();
    this._montarCameraSeguranca();
    baratear(this.cena);
    // salas temáticas: a mesma sala, com cores, texturas, luz e decoração do gênero do filme
    this.tema = new SalaTematica(this, { MOBILE, baratear, TELA, SALA, FILEIRAS, zFila: (i) => this._zFila(i), yFila: (i) => this._yFila(i) });
    this._redimensionar = this._redimensionar.bind(this);
    addEventListener('resize', this._redimensionar);
    this._redimensionar();
    this.prontoPoltronas = this._montarPoltronas();
    this._ultimoCheckQuadros = 0;
    this._loop = this._loop.bind(this);
    this.renderer.setAnimationLoop(this._loop);
  }

  // ------------------------------------------------------------------ sala
  // câmera de segurança no canto direito do fundo (visto de quem olha para o telão), com luz vermelha piscando.
  // É de onde o criador assiste ao vivo quando abre a sala pelo painel (modoCamera).
  _montarCameraSeguranca() {
    const { L, A, zFundo } = SALA;
    const g = new THREE.Group();
    const corpoMat = new THREE.MeshStandardMaterial({ color: '#d9d9de', roughness: 0.45, metalness: 0.3 });
    const pretoMat = new THREE.MeshStandardMaterial({ color: '#141418', roughness: 0.6, metalness: 0.4 });
    const suporte = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.12), pretoMat); suporte.position.set(0, 0.25, 0); g.add(suporte);
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.06, 0.34), pretoMat); base.position.set(0, 0.5, 0); g.add(base);
    const cabeca = new THREE.Group(); cabeca.position.set(0, 0.25, 0.05); g.add(cabeca);
    const corpo = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.3, 0.75), corpoMat); corpo.position.z = 0.28; cabeca.add(corpo);
    const aba = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.85), corpoMat); aba.position.set(0, 0.18, 0.32); cabeca.add(aba);
    const lente = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.06, 20), pretoMat); lente.rotation.x = Math.PI / 2; lente.position.z = 0.67; cabeca.add(lente);
    const vidro = new THREE.Mesh(new THREE.CircleGeometry(0.075, 20), new THREE.MeshBasicMaterial({ color: '#1d3b66' })); vidro.position.z = 0.705; cabeca.add(vidro);
    const led = this._ledCamera = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), new THREE.MeshBasicMaterial({ color: '#ff1a1a' }));
    led.position.set(0.11, 0.08, 0.66); cabeca.add(led);
    const brilho = this._brilhoCamera = new THREE.PointLight('#ff2020', 0.6, 1.6, 2); brilho.position.copy(led.position); cabeca.add(brilho);
    // presa na parede do fundo, no alto, inclinada para a plateia e o telão
    g.scale.setScalar(1.6);
    g.position.set(-(L / 2 - 0.5), A - 2.6, zFundo + 0.3);
    const alvo = new THREE.Vector3(-2, TELA.y - 1.5, TELA.z);
    this.cena.add(g);
    g.updateMatrixWorld(true);
    cabeca.lookAt(alvo);
    this.camSeguranca = { grupo: g, cabeca, alvo };
  }
  // visão do criador observando: da câmera de segurança, girando no lugar (arrastar = olhar em volta)
  modoCamera() {
    this.modo = 'camera';
    this._primeiraPessoa(false);
    const { L, A, zFundo } = SALA;
    const pos = new THREE.Vector3(-(L / 2 - 1.0), A - 2.4, zFundo + 1.5);
    const dir = this.camSeguranca.alvo.clone().sub(pos).normalize();
    this._alvoCam = { pos, alvo: pos.clone().add(dir.multiplyScalar(0.05)) };
    this.controles.minDistance = 0.01; this.controles.maxDistance = 0.05; this.controles.enableZoom = false;
    this.controles.rotateSpeed = (MOBILE ? 0.5 : 0.7) * -0.6; this.controles.maxPolarAngle = Math.PI * 0.8;
    this._pularCamera();
    this._redimensionar();
  }

  // ------------------------------------------------------------------ telão
  _montarTela() {
    const c = this.cena;
    const moldura = new THREE.Mesh(new THREE.BoxGeometry(TELA.w + 0.6, TELA.h + 0.6, 0.2), new THREE.MeshStandardMaterial({ color: '#050305', roughness: 0.5 }));
    moldura.position.set(0, TELA.y, TELA.z + 0.12); c.add(moldura);
    this.TELA = TELA;
    const brilho = new THREE.Mesh(new THREE.PlaneGeometry(TELA.w + 1.4, TELA.h + 1.4), this._m.brilho = new THREE.MeshBasicMaterial({ color: '#ff2a48', transparent: true, opacity: 0.18 }));
    brilho.position.set(0, TELA.y, TELA.z + 0.24); brilho.rotation.y = Math.PI; c.add(brilho);

    this.texturaVideo = new THREE.VideoTexture(this.video);
    this.texturaVideo.colorSpace = THREE.SRGBColorSpace;
    this.texturaVideo.minFilter = THREE.LinearFilter;
    this.texturaVideo.generateMipmaps = false;
    this.materialTela = new THREE.MeshBasicMaterial({ color: '#111', toneMapped: false });
    this.tela = new THREE.Mesh(new THREE.PlaneGeometry(TELA.w, TELA.h), this.materialTela);
    this.tela.position.set(0, TELA.y, TELA.z); this.tela.rotation.y = Math.PI;
    c.add(this.tela);

    // legendas desenhadas sobre o telão
    this.cvLegenda = document.createElement('canvas'); this.cvLegenda.width = 1600; this.cvLegenda.height = 220;
    this.texLegenda = new THREE.CanvasTexture(this.cvLegenda); this.texLegenda.colorSpace = THREE.SRGBColorSpace;
    const leg = new THREE.Mesh(new THREE.PlaneGeometry(TELA.w * 0.9, TELA.w * 0.9 * 220 / 1600), new THREE.MeshBasicMaterial({ map: this.texLegenda, transparent: true, toneMapped: false }));
    leg.position.set(0, TELA.y - TELA.h / 2 + 0.9, TELA.z - 0.02); leg.rotation.y = Math.PI; c.add(leg);
    this.legendaMesh = leg;
    this.objetosTela = [moldura, brilho, this.tela];   // o modo VR pode ajustar o tamanho aparente do telão

    // amostrador de cor média do vídeo para tingir a luz da sala
    this._cvCor = document.createElement('canvas'); this._cvCor.width = 8; this._cvCor.height = 8;
    this._ctxCor = this._cvCor.getContext('2d', { willReadFrequently: true });
  }

  // coloca um elemento HTML (iframe/video) exatamente sobre o telão; null remove
  mostrarNaTela(el) {
    if (this.objTela) { this.cenaHtml.remove(this.objTela); this.objTela.element.remove(); this.objTela = null; }
    this._telaPlana = false;
    this._planaUltima = '';
    this._projecaoPlana = null;
    this.camadaPlana.style.display = '';
    if (!el) return;
    const W = 1280, H = Math.round(W * TELA.h / TELA.w);
    const caixa = document.createElement('div'); caixa.className = 'tela-html';
    caixa.style.width = W + 'px'; caixa.style.height = H + 'px';
    caixa.appendChild(el);
    const o = this.objTela = new CSS3DObject(caixa);
    o.position.set(0, TELA.y, TELA.z - 0.03); o.rotation.y = Math.PI; o.scale.setScalar(TELA.w / W);
    this.cenaHtml.add(o);
    this._telaPlana = ANDROID_LEVE && el.classList.contains('midia-yt');
    if (this._telaPlana) this.camadaPlana.appendChild(caixa);
    this.materialTela.map = null; this.materialTela.color.set('#000000'); this.materialTela.needsUpdate = true;
  }

  // Projeta a posição do telão na tela como um retângulo 2D com corte nos cantos.
  // O vídeo segue na mesma sala e o mesmo player sincronizado, mas sem transformar o iframe em 3D.
  _atualizarTelaPlana() {
    const caixa = this.objTela?.element;
    if (!this._telaPlana || !caixa || caixa.parentElement !== this.camadaPlana) return;
    const w = this.canvas.clientWidth || innerWidth, h = this.canvas.clientHeight || innerHeight;
    if (!w || !h) return;
    this.camera.updateMatrixWorld();
    this.tela.updateWorldMatrix(true, false);
    const proj = this.camera.projectionMatrix, vista = this.camera.matrixWorldInverse, tela = this.tela.matrixWorld;
    const anterior = this._projecaoPlana;
    if (anterior && anterior.w === w && anterior.h === h && anterior.proj.equals(proj) &&
        anterior.vista.equals(vista) && anterior.tela.equals(tela)) return;
    const cache = this._projecaoPlana ??= { proj: new THREE.Matrix4(), vista: new THREE.Matrix4(), tela: new THREE.Matrix4() };
    cache.w = w; cache.h = h;
    cache.proj.copy(proj); cache.vista.copy(vista); cache.tela.copy(tela);
    const pts = [];
    for (const [x, y] of [[-TELA.w / 2, TELA.h / 2], [TELA.w / 2, TELA.h / 2], [TELA.w / 2, -TELA.h / 2], [-TELA.w / 2, -TELA.h / 2]]) {
      const p = new THREE.Vector3(x, y, 0).applyMatrix4(this.tela.matrixWorld);
      const cam = p.clone().applyMatrix4(this.camera.matrixWorldInverse);
      if (cam.z >= -0.05) { caixa.style.visibility = 'hidden'; return; }
      p.project(this.camera);
      pts.push([(p.x * 0.5 + 0.5) * w, (0.5 - p.y * 0.5) * h]);
    }
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const x0 = Math.min(...xs), y0 = Math.min(...ys), x1 = Math.max(...xs), y1 = Math.max(...ys);
    const rw = x1 - x0, rh = y1 - y0;
    if (!(rw > 1 && rh > 1 && rw < w * 8 && rh < h * 8 && x1 > 0 && x0 < w && y1 > 0 && y0 < h)) {
      caixa.style.visibility = 'hidden'; return;
    }
    const chave = pts.flat().map(v => Math.round(v)).join(',');
    if (this._planaUltima === chave && caixa.style.visibility === 'visible') return;
    this._planaUltima = chave;
    caixa.style.left = x0 + 'px';
    caixa.style.top = y0 + 'px';
    caixa.style.width = rw + 'px';
    caixa.style.height = rh + 'px';
    // Só recorta o polígono, sem distorcer a camada de vídeo nem forçar CSS3D.
    caixa.style.clipPath = 'polygon(' + pts.map(([x,y]) => ((x-x0)/rw*100).toFixed(2) + '% ' + ((y-y0)/rh*100).toFixed(2) + '%').join(',') + ')';
    caixa.style.visibility = 'visible';
  }

  mostrarVideo(sim) {
    if (this.objTela) return;
    this.materialTela.map = sim ? this.texturaVideo : null;
    this.materialTela.color.set(sim ? '#ffffff' : '#111111');
    this.materialTela.needsUpdate = true;
  }

  mostrarCapa(url) {
    if (!url || this.objTela) return;
    new THREE.TextureLoader().load(url, (t) => {
      if (this.materialTela.map === this.texturaVideo && !this.video.paused) return;
      t.colorSpace = THREE.SRGBColorSpace; this.materialTela.map = t; this.materialTela.color.set('#ffffff'); this.materialTela.needsUpdate = true;
    });
  }

  legenda(texto) {
    const g = this.cvLegenda.getContext('2d');
    g.clearRect(0, 0, 1600, 220);
    if (texto) {
      g.font = 'bold 64px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      const linhas = texto.replace(/<[^>]+>/g, '').split('\n').slice(-2);
      linhas.forEach((l, i) => {
        const y = 220 - (linhas.length - i) * 80 + 30;
        const w = g.measureText(l).width;
        g.fillStyle = 'rgba(0,0,0,.65)'; g.fillRect(800 - w / 2 - 20, y - 38, w + 40, 76);
        g.fillStyle = '#fff'; g.fillText(l, 800, y);
      });
    }
    this.texLegenda.needsUpdate = true;
  }

  // ------------------------------------------------------------------ poltronas
  // ------------------------------------------------------------------ espectadores
  // lista: [{id, apelido, avatar, papel, desde}] — ordem estável igual em todos os aparelhos
  async atualizarPessoas(lista) {
    await this.prontoPoltronas;
    const ordenada = [...lista].sort((a, b) => (a.desde || 0) - (b.desde || 0) || String(a.id).localeCompare(String(b.id)));
    const vivos = new Set();
    for (let i = 0; i < ordenada.length && i < this.assentos.length; i++) {
      const p = ordenada[i]; vivos.add(p.id);
      const assento = this.assentos[i];
      const cfgKey = JSON.stringify(p.avatar || {});
      let reg = this.avatares.get(p.id);
      if (reg && (reg.cfgKey !== cfgKey)) { this._remover(p.id); reg = null; }
      if (!reg) {
        reg = { carregando: true, cfgKey, assento, dados: p };
        this.avatares.set(p.id, reg);
        criarAvatar(p.avatar).then((wrap) => {
          if (this.avatares.get(p.id) !== reg) return;
          reg.wrap = wrap; reg.carregando = false;
          wrap.userData.semente = Math.random();
          baratear(wrap); this.cena.add(wrap);

          reg.rotulo = this._criarRotulo(reg.dados);
          wrap.add(reg.rotulo);
          this._sentar(reg, reg.assento);
          if (p.id === this.meuId && this.modo === 'poltrona') this.focarEm(p.id);
        }).catch(e => console.warn('avatar', e));
      } else {
        reg.dados = p;
        if (reg.assento !== assento) { reg.assento = assento; if (reg.wrap) this._sentar(reg, assento); }
        if (reg.rotulo) this._atualizarRotulo(reg.rotulo, p);
      }
    }
    for (const id of [...this.avatares.keys()]) if (!vivos.has(id)) this._remover(id);
  }

  _sentar(reg, assento) {
    const w = reg.wrap;
    w.position.copy(assento.pos);
    w.rotation.set(0, assento.rotY, 0);
    w.updateMatrixWorld(true);
    if (!w.userData.sentado) { poseSentado(w); w.userData.sentado = true; }
    // quadril na altura do assento (≈0,46 m do piso da fileira) e encostado
    const quadril = w.userData.alturaQuadril ?? 0.9;
    w.position.y = assento.pos.y + 0.5 - quadril;
    w.position.z -= 0.06;
    if (reg.rotulo) reg.rotulo.position.set(w.userData.olhos.x, w.userData.topo + 0.12, w.userData.olhos.z);
    if (reg.dados?.id === this.meuId && this.modo === 'poltrona') this.focarEm(reg.dados.id);
  }

  _criarRotulo(p) {
    const div = document.createElement('div');
    div.className = 'rotulo3d';
    div.innerHTML = `<span class="reacao-avatar" hidden></span><div class="balao" hidden></div><div class="fala" hidden>◖))) Falando</div><div class="nome"></div>`;
    const obj = new CSS2DObject(div);
    obj.position.set(0, 1.5, 0);
    obj.center.set(0.5, 1);
    this._atualizarRotulo(obj, p);
    div.addEventListener('click', (e) => this.aoClicarPessoa?.(p.id, e));
    return obj;
  }
  _atualizarRotulo(obj, p) {
    const div = obj.element;
    div.classList.toggle('owner', p.papel === 'owner');
    div.classList.toggle('moderador', p.papel === 'moderador');
    div.classList.toggle('eu', p.id === this.meuId);
    div.querySelector('.nome').innerHTML = `${p.papel === 'owner' ? '👑 ' : p.papel === 'moderador' ? '🛡️ ' : ''}${esc(p.apelido || 'Convidado')}<i></i>`;
  }

  reagir(id, emoji) {
    const reg = this.avatares.get(id);
    const n = reg?.rotulo?.element.querySelector('.reacao-avatar');
    if (!n) return;
    n.textContent = emoji; n.hidden = false;
    clearTimeout(reg.tReacao); reg.tReacao = setTimeout(() => { n.hidden = true; },2000);
  }

  balao(id, texto) {
    const reg = this.avatares.get(id);
    if (!reg?.rotulo) return;
    const b = reg.rotulo.element.querySelector('.balao');
    b.textContent = texto; b.hidden = false;
    clearTimeout(reg.tBalao);
    reg.tBalao = setTimeout(() => { b.hidden = true; }, 6000);
  }

  _remover(id) {
    const reg = this.avatares.get(id);
    if (!reg) return;
    if (reg.wrap) { reg.rotulo?.removeFromParent(); reg.rotulo?.element.remove(); this.cena.remove(reg.wrap); }
    reg.placa?.material.map.dispose(); reg.placa?.material.dispose();
    clearTimeout(reg.tReacao);
    this.avatares.delete(id);
  }

  // ------------------------------------------------------------------ câmera
  focarEm(id, ja = false) {
    const reg = this.avatares.get(id);
    if (!reg?.wrap) return;
    this.modo = 'poltrona';
    const p = reg.wrap.position;
    // visão em primeira pessoa: câmera nos olhos do próprio personagem, olhando para o telão
    const olhos = reg.wrap.localToWorld(reg.wrap.userData.olhos.clone().addScaledVector(reg.wrap.userData.frente, 0.035));
    const dir = new THREE.Vector3(p.x * 0.4, TELA.y - 0.6, TELA.z).sub(olhos).normalize();
    this._alvoCam = { pos: olhos, alvo: olhos.clone().add(dir.multiplyScalar(0.05)) };
    this._primeiraPessoa(true, reg);
    this._pularCamera();   // em primeira pessoa entra direto nos olhos
  }
  visaoGeral(ja = false) {
    this.modo = 'geral';
    this._primeiraPessoa(false);
    this._alvoCam = { pos: new THREE.Vector3(7, 9, -13), alvo: new THREE.Vector3(0, 3.2, TELA.z - 3) };
    if (ja) this._pularCamera();
  }
  // liga/desliga a primeira pessoa: esconde o próprio corpo, gira a cabeça no lugar e usa 90° de visão
  _primeiraPessoa(sim, reg) {
    if (this._regFP && this._regFP !== reg && this._regFP.wrap) {
      corpoPOV(this._regFP.wrap,false); this._regFP.rotulo.visible = true;
    }
    this._regFP = sim ? reg : null;
    if (reg?.wrap) { corpoPOV(reg.wrap,sim); reg.rotulo.visible = !sim; }
    this.controles.minDistance = sim ? 0.01 : 1.2;
    this.controles.maxDistance = sim ? 0.05 : 20;
    this.controles.enableZoom = !sim;
    this.controles.rotateSpeed = (MOBILE ? 0.5 : 0.7) * (sim ? -0.6 : 1);
    this.controles.maxPolarAngle = sim ? Math.PI * 0.96 : Math.PI * 0.62;
    this._redimensionar();
  }
  _pularCamera() {
    this.camera.position.copy(this._alvoCam.pos); this.controles.target.copy(this._alvoCam.alvo); this._alvoCam = null;
  }

  // a câmera nunca sai da sala (paredes, teto, chão e telão)
  _limitarCamera() {
    const c = this.camera.position, t = this.controles.target;
    const caixa = (v, folga) => {
      v.x = THREE.MathUtils.clamp(v.x, -SALA.L / 2 + folga, SALA.L / 2 - folga);
      v.y = THREE.MathUtils.clamp(v.y, 0.9, SALA.A - folga);
      v.z = THREE.MathUtils.clamp(v.z, SALA.zFundo + folga, TELA.z - 1.2);
    };
    caixa(c, 0.7); caixa(t, 0.3);
  }

  _redimensionar() {
    if (this.renderer.xr.isPresenting) return;            // durante o WebXR o próprio runtime define o tamanho
    if (this.vr?.ativo) return this.vr.redimensionar();    // Cardboard: tela dividida
    const w = this.canvas.clientWidth || innerWidth, h = this.canvas.clientHeight || innerHeight;
    this.renderer.setSize(w, h, false);
    this.css.setSize(w, h);
    this.css3d?.setSize(w, h);
    this.camera.aspect = w / h;
    if (this.modo === 'poltrona') {   // 90° de campo de visão horizontal (limitado no celular em pé)
      this.camera.fov = Math.min(100, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(45)) / (w / h))));
    } else this.camera.fov = this.modo === 'camera' ? 68 : w / h < 0.8 ? 72 : 55;
    this.camera.updateProjectionMatrix();
  }

  _corDoVideo() {
    const v = this.video;
    if (v.readyState < 2 || v.paused) return;
    try {
      this._ctxCor.drawImage(v, 0, 0, 8, 8);
      const d = this._ctxCor.getImageData(0, 0, 8, 8).data;
      let r = 0, g = 0, b = 0;
      for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
      const n = d.length / 4;
      const cor = new THREE.Color(r / n / 255, g / n / 255, b / n / 255);
      const lum = (cor.r + cor.g + cor.b) / 3;
      this.luzTela.color.lerp(cor.clone().multiplyScalar(1 / Math.max(lum, 0.15)), 0.3);
      this.luzTela.intensity = 25 + lum * 120;
    } catch { /* fonte sem CORS: mantém a luz padrão */ }
  }

  // anima o que se mexe na sala (personagens e luz do telão), sem câmera e sem desenhar.
  // Usado pelo _loop da sala.
  atualizarMeuOlhar(camera) {
    const reg = this.avatares.get(this.meuId), agora = performance.now();
    if (!reg?.wrap || !this.aoPose || agora < (this._proximaPose || 0)) return;
    this._proximaPose = agora + 180;
    const dir = camera.getWorldDirection(new THREE.Vector3()), frente = reg.wrap.userData.frente.clone().applyQuaternion(reg.wrap.quaternion);
    const angulo = Math.atan2(dir.x,dir.z) - Math.atan2(frente.x,frente.z);
    const yaw = Math.round(THREE.MathUtils.clamp(Math.atan2(Math.sin(angulo),Math.cos(angulo)), -1.3,1.3)*20)/20;
    const pitch = Math.round(THREE.MathUtils.clamp(Math.asin(dir.y),-0.9,0.9)*20)/20;
    const pose = {id:this.meuId,pov:this.modo === 'poltrona',yaw,pitch,falando:!!this.falando};
    const chave = JSON.stringify(pose);
    if (chave === this._poseAnterior && agora < this._repetirPose) return;
    this._poseAnterior = chave; this._repetirPose = agora + 2200;
    this.receberPose(pose); this.aoPose(pose);
  }

  receberPose(p) {
    const reg = this.avatares.get(p?.id);
    if (!reg?.wrap || !Number.isFinite(p.yaw) || !Number.isFinite(p.pitch)) return;
    reg.wrap.userData.olhar = p.pov === true ? {yaw:THREE.MathUtils.clamp(p.yaw,-1.3,1.3),pitch:THREE.MathUtils.clamp(p.pitch,-0.9,0.9)} : null;
    reg.falando = p.falando === true;
    reg.rotulo.element.querySelector('.fala').hidden = !reg.falando;
    reg.expira = performance.now()+5500;
  }

  _nomeVR(reg) {
    if (!reg.placa) {
      const cv = document.createElement('canvas'); cv.width = 384; cv.height = 96;
      const map = new THREE.CanvasTexture(cv); map.colorSpace = THREE.SRGBColorSpace;
      reg.placa = new THREE.Sprite(new THREE.SpriteMaterial({map,transparent:true,depthWrite:false,toneMapped:false}));
      reg.placa.center.set(0.5,0); reg.placa.scale.set(0.96,0.24,1); reg.wrap.add(reg.placa);
    }
    reg.placa.visible = true; reg.placa.position.copy(reg.rotulo.position);
    const nome = reg.dados.apelido || 'Convidado', chave = nome + (reg.falando ? '/voz' : '');
    if (reg.placaTexto === chave) return;
    reg.placaTexto = chave;
    const tex = reg.placa.material.map, g = tex.image.getContext('2d');
    g.clearRect(0,0,384,96); g.textAlign = 'center'; g.font = 'bold 34px sans-serif';
    const largura = Math.min(384,g.measureText(nome).width+24);
    g.fillStyle = '#17111e'; g.fillRect((384-largura)/2,48,largura,48);
    g.fillStyle = 'white'; g.fillText(nome,192,83,360);
    if (reg.falando) { g.fillStyle = '#68ffc1'; g.fillText('Falando',192,36); }
    tex.needsUpdate = true;
  }

  _animar(t) {
    if (!MOBILE && (this._f = (this._f || 0) + 1) % 20 === 0) this._corDoVideo();
    for (const reg of this.avatares.values()) if (reg.wrap) {
      if (reg.expira && performance.now() > reg.expira) {
        reg.expira = 0; reg.wrap.userData.olhar = null; reg.falando = false;
        reg.rotulo.element.querySelector('.fala').hidden = true;
      }
      animarOcioso(reg.wrap,t,reg.wrap.userData.semente);
      if (this.vr?.ativo && reg !== this._regFP) this._nomeVR(reg);
      else if (reg.placa) reg.placa.visible = false;
    }
    this.tema?.animar(t);
    if (this._ledCamera) { const on = (t % 1.2) < 0.6; this._ledCamera.visible = on; this._brilhoCamera.intensity = on ? 0.6 : 0; }
  }

  // muda o ambiente da sala para o gênero do filme (null = sala original da Sessão Juntos)
  aplicarTema(filme) { this.tema?.aplicar(filme); }
  animar() {
    this.relogio.getDelta();
    this._animar(this.relogio.elapsedTime);
  }

  _loop() {
    // modo VR: o mesmo loop e a mesma cena; o módulo VR só troca a câmera e a forma de desenhar
    if (this.vr?.ativo) {
      const dt = Math.min(this.relogio.getDelta(), 0.1);
      this._animar(this.relogio.elapsedTime);
      this.vr.quadro(dt);
      return;
    }
    if (document.hidden || this.anuncioAmpliado) return;
    if (MOBILE && performance.now() - this._ultimoCheckQuadros > 6000) {
      this._ultimoCheckQuadros = performance.now();
      const q = this.video.getVideoPlaybackQuality?.();
      if (q && this._qualidadeAnterior) {
        const total = q.totalVideoFrames - this._qualidadeAnterior.totalVideoFrames;
        const perdidos = q.droppedVideoFrames - this._qualidadeAnterior.droppedVideoFrames;
        if (total > 50 && perdidos / total > 0.06 && !this._modoEconomiaVideo) {
          this._modoEconomiaVideo = true;
          this.renderer.setPixelRatio(Math.min(this.renderer.getPixelRatio(), 0.6));
          this._redimensionar();
          console.info('[CineOnline] Modo leve ativado: perda de quadros no Android');
        }
      }
      if (q) this._qualidadeAnterior = { totalVideoFrames: q.totalVideoFrames, droppedVideoFrames: q.droppedVideoFrames };
    }
    if (MOBILE || this.fpsMax) {        // celular: taxa adaptativa quando decodificação do vídeo perde quadros
      const agora = performance.now();
      const salaParada = this._telaPlana && !this._alvoCam && agora > this._movendoAte;
      const fps = this.fpsMax || (ANDROID_LEVE ? (salaParada ? 15 : 30) : this._modoEconomiaVideo ? 30 : 60);
      const intervalo = 1000 / fps;
      if (this._proximoQuadro != null && agora + 0.5 < this._proximoQuadro) return;
      const anterior = this._proximoQuadro ?? agora;
      this._proximoQuadro = anterior + intervalo;
      if (this._proximoQuadro <= agora) this._proximoQuadro = agora + intervalo;
    }
    const dt = Math.min(this.relogio.getDelta(), 0.1);
    const t = this.relogio.elapsedTime;
    if (this._alvoCam) {
      this.camera.position.lerp(this._alvoCam.pos, 1 - Math.pow(0.02, dt));
      this.controles.target.lerp(this._alvoCam.alvo, 1 - Math.pow(0.02, dt));
      if (this.camera.position.distanceTo(this._alvoCam.pos) < 0.02) this._alvoCam = null;
    }
    this.controles.update();
    this._limitarCamera();
    this.atualizarMeuOlhar(this.camera);
    this._animar(t);
    this.renderer.render(this.cena, this.camera);
    this.css.render(this.cena, this.camera);
    if (this.objTela) {
      if (this._telaPlana) this._atualizarTelaPlana();
      else this.css3d.render(this.cenaHtml, this.camera);
    }
  }

  interromperCamera() { this._alvoCam = null; }

  destruir() {
    this.renderer.setAnimationLoop(null);
    this.tema?.destruir();
    removeEventListener('resize', this._redimensionar);
    this.camadaPlana.remove();
    this.renderer.dispose();
  }
}
