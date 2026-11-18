// Sala de cinema 3D: telão, poltronas vermelhas, neon, avatares sentados com nomes.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { CSS3DRenderer, CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
import { criarAvatar, poseSentado, animarOcioso } from './avatar.js';
import { esc } from './supa.js';
import { SalaTematica } from './temas-sala.js';

const ASSETS = new URL('../assets/', import.meta.url).href;
const MOBILE = matchMedia('(pointer:coarse)').matches || innerWidth < 760;

// Geometria da sala (a plateia olha para +Z, onde fica o telão)
const TELA = { z: 15.5, y: 5.6, w: 17.6, h: 7.4 };
const SALA = { L: 26, A: 13, zFundo: -16 };   // largura, altura e parede do fundo (usado para prender a câmera)
const FILEIRAS = 10;
const BLOCOS_POR_LADO = 3;     // cada bloco = 3 poltronas
const PASSO_FILA = 1.35;
const DEGRAU = 0.38;
const LARG_BLOCO = 1.774;
const CORREDOR = 1.6;

// No celular troca materiais PBR (pesados) por Lambert, bem mais leves na GPU.
function baratear(raiz) {
  if (!MOBILE) return;
  raiz.traverse(o => {
    if (!o.isMesh) return;
    const troca = m => {
      if (!m || !(m.isMeshStandardMaterial || m.isMeshPhysicalMaterial)) return m;
      if (m.userData._lambert) return m.userData._lambert;
      const l = new THREE.MeshLambertMaterial({ color: m.color, map: m.map, emissive: m.emissive, emissiveMap: m.emissiveMap,
        emissiveIntensity: m.emissiveIntensity, transparent: m.transparent, opacity: m.opacity, side: m.side, alphaTest: m.alphaTest });
      m.userData._lambert = l; return l;
    };
    o.material = Array.isArray(o.material) ? o.material.map(troca) : troca(o.material);
    o.castShadow = o.receiveShadow = false;
  });
}

export class Cinema {
  constructor(canvas, camadaRotulos, video) {
    this.canvas = canvas;
    this.video = video;
    this.avatares = new Map();      // id -> {wrap, rotulo, cfgKey, assento}
    this.relogio = new THREE.Clock();
    this.meuId = null;
    this.modo = 'poltrona';

    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !MOBILE, powerPreference: MOBILE ? 'default' : 'high-performance' });
    r.setPixelRatio(Math.min(devicePixelRatio, MOBILE ? 1 : 2));
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
    this.cenaHtml = new THREE.Scene();

    this.cena = new THREE.Scene();
    this.cena.background = new THREE.Color('#06030a');
    this.cena.fog = new THREE.Fog('#06030a', 22, 48);

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 120);
    this.camera.position.set(0, 7, -10);
    this.controles = new OrbitControls(this.camera, canvas);
    this.controles.enableDamping = true;
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
    baratear(this.cena);
    // salas temáticas: a mesma sala, com cores, texturas, luz e decoração do gênero do filme
    this.tema = new SalaTematica(this, { MOBILE, baratear, TELA, SALA, FILEIRAS, zFila: (i) => this._zFila(i), yFila: (i) => this._yFila(i) });
    this._redimensionar = this._redimensionar.bind(this);
    addEventListener('resize', this._redimensionar);
    this._redimensionar();
    this.prontoPoltronas = this._montarPoltronas();
    this._loop = this._loop.bind(this);
    this.renderer.setAnimationLoop(this._loop);
  }

  // ------------------------------------------------------------------ sala
  _montarSala() {
    const c = this.cena;
    const { L, A, zFundo } = SALA, P = 34;
    const mat = (cor, rough = 0.85, extra = {}) => new THREE.MeshStandardMaterial({ color: cor, roughness: rough, ...extra });

    // piso (carpete) e degraus da plateia
    const M = this._m;
    const piso = new THREE.Mesh(new THREE.PlaneGeometry(L, P), M.piso = mat('#1a0b10', 0.95));
    piso.rotation.x = -Math.PI / 2; piso.position.z = 0; piso.receiveShadow = true; c.add(piso);
    const degrauMat = M.degrau = mat('#3a1520', 0.95);
    const bordaMat = M.borda = new THREE.MeshBasicMaterial({ color: '#ff3355' });
    M.neonA = new THREE.MeshBasicMaterial({ color: '#ff1f3d' });
    M.neonB = new THREE.MeshBasicMaterial({ color: '#ff1f3d' });
    for (let i = 0; i < FILEIRAS; i++) {
      const z = this._zFila(i), y = this._yFila(i);
      if (y <= 0) continue;
      const d = new THREE.Mesh(new THREE.BoxGeometry(L - 0.2, y, PASSO_FILA), degrauMat);
      d.position.set(0, y / 2, z - 0.1); d.receiveShadow = true; c.add(d);
      // fitinha de luz no degrau do corredor
      for (const x of [-CORREDOR / 2 - 0.05, CORREDOR / 2 + 0.05]) {
        const led = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, PASSO_FILA * 0.9), bordaMat);
        led.position.set(x, y + 0.02, z - 0.1); c.add(led);
      }
    }
    // degraus traseiros até a parede
    const ultimoY = this._yFila(FILEIRAS - 1);
    const fundoPlat = new THREE.Mesh(new THREE.BoxGeometry(L - 0.2, ultimoY, 6), degrauMat);
    fundoPlat.position.set(0, ultimoY / 2, this._zFila(FILEIRAS - 1) - PASSO_FILA / 2 - 3); c.add(fundoPlat);

    // paredes com painéis acústicos
    const paredeMat = M.parede = mat('#4a1220', 0.9, { emissive: '#1a0308' });
    const painelMat = M.painel = mat('#5c1626', 0.75, { emissive: '#220509' });
    for (const lado of [-1, 1]) {
      const parede = new THREE.Mesh(new THREE.PlaneGeometry(P, A), paredeMat);
      parede.position.set(lado * L / 2, A / 2, 0); parede.rotation.y = -lado * Math.PI / 2; c.add(parede);
      for (let k = 0; k < 7; k++) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.15, 5.5, 3.2), painelMat);
        p.position.set(lado * (L / 2 - 0.08), 5.2, -12 + k * 4.2); c.add(p);
        // neon vertical vermelho entre painéis
        const neon = new THREE.Mesh(new THREE.BoxGeometry(0.06, 7, 0.08), k % 2 ? M.neonB : M.neonA);
        neon.position.set(lado * (L / 2 - 0.1), 5.6, -14.1 + k * 4.2); c.add(neon);
      }
      // faixa de neon no topo
      const faixa = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, P), M.faixa ||= new THREE.MeshBasicMaterial({ color: '#ff2a48' }));
      faixa.position.set(lado * (L / 2 - 0.15), A - 1.2, 0); c.add(faixa);
      // arandelas
      for (let k = 0; k < 4; k++) {
        const ar = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 0.5, 12, 1, true), M.arandela ||= new THREE.MeshBasicMaterial({ color: '#ffb36b', side: THREE.DoubleSide }));
        ar.position.set(lado * (L / 2 - 0.3), 8.6, -10 + k * 6); c.add(ar);
      }
    }
    const fundo = new THREE.Mesh(new THREE.PlaneGeometry(L, A), paredeMat);
    fundo.position.set(0, A / 2, zFundo); c.add(fundo);
    const frente = new THREE.Mesh(new THREE.PlaneGeometry(L, A), M.frente = mat('#0d0508'));
    frente.position.set(0, A / 2, TELA.z + 0.6); frente.rotation.y = Math.PI; c.add(frente);

    // teto com luzinhas
    const teto = new THREE.Mesh(new THREE.PlaneGeometry(L, P), M.teto = mat('#0c0609', 1));
    teto.rotation.x = Math.PI / 2; teto.position.y = A; c.add(teto);
    const luz = new THREE.Mesh(new THREE.CircleGeometry(0.09, 10), M.luzTeto = new THREE.MeshBasicMaterial({ color: '#ffe2c4' }));
    luz.rotation.x = Math.PI / 2;
    const luzes = new THREE.InstancedMesh(luz.geometry, luz.material, 60);
    const m = new THREE.Matrix4(); let n = 0;
    for (let x = -10; x <= 10 && n < 60; x += 4) for (let z = -14; z <= 12 && n < 60; z += 2.6) {
      m.makeRotationX(Math.PI / 2).setPosition(x + (Math.random() - 0.5) * 0.4, A - 0.02, z); luzes.setMatrixAt(n++, m);
    }
    luzes.count = n; c.add(luzes);
    // sanca com neon em volta do teto
    const sanca = new THREE.Mesh(new THREE.TorusGeometry(1, 0.02, 4, 4), M.sanca = new THREE.MeshBasicMaterial({ color: '#ff2a48' }));
    sanca.scale.set(L * 0.36, P * 0.36, 1); sanca.rotation.set(Math.PI / 2, 0, Math.PI / 4); sanca.position.y = A - 0.6; c.add(sanca);

    // logo na parede do fundo (como na referência)
    const logo = new THREE.Mesh(new THREE.PlaneGeometry(6, 2.4), new THREE.MeshBasicMaterial({ map: this._texturaLogo(), transparent: true }));
    logo.position.set(0, 9.5, zFundo + 0.05); c.add(logo);

    // logo nas paredes laterais (esquerda e direita), viradas para a plateia
    const texLogo = logo.material.map;
    for (const lado of [-1, 1]) {
      const l = new THREE.Mesh(new THREE.PlaneGeometry(7, 2.8), new THREE.MeshBasicMaterial({ map: texLogo, transparent: true, toneMapped: false }));
      l.position.set(lado * (L / 2 - 0.25), 10.1, 1); l.rotation.y = -lado * Math.PI / 2; c.add(l);
    }

    // cortinas laterais do telão
    const cortinaMat = M.cortina = new THREE.MeshStandardMaterial({ color: '#7a0a16', roughness: 0.7, side: THREE.DoubleSide });
    for (const lado of [-1, 1]) {
      const g = new THREE.PlaneGeometry(3.2, A - 1, MOBILE ? 16 : 40, 1);
      const pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 7) * 0.18);
      g.computeVertexNormals();
      const cort = new THREE.Mesh(g, cortinaMat);
      cort.position.set(lado * (TELA.w / 2 + 1.6), (A - 1) / 2, TELA.z - 0.3); cort.rotation.y = Math.PI; c.add(cort);
    }
    // palco
    const palco = new THREE.Mesh(new THREE.BoxGeometry(L, 0.9, 2.2), M.palco = mat('#14070b'));
    palco.position.set(0, 0.45, TELA.z - 0.9); c.add(palco);
    const ledPalco = new THREE.Mesh(new THREE.BoxGeometry(L, 0.04, 0.04), M.ledPalco = new THREE.MeshBasicMaterial({ color: '#ff2a48' }));
    ledPalco.position.set(0, 0.9, TELA.z - 2); c.add(ledPalco);

    // iluminação
    c.add(this._l.hemi = new THREE.HemisphereLight('#ffc2cc', '#1a0810', 1.1));
    const ambiente = this._l.amb = new THREE.AmbientLight('#3a1420', 1.2); c.add(ambiente);
    if (MOBILE) ambiente.intensity = 2.2;
    for (const lado of (MOBILE ? [] : [-1, 1])) {
      const pl = new THREE.PointLight('#ff2040', 60, 22, 1.4);
      pl.position.set(lado * 10, 7, 0); c.add(pl); this._l.pontos.push(pl);
      const pl2 = new THREE.PointLight('#ff2040', 45, 20, 1.4);
      pl2.position.set(lado * 10, 6, 10); c.add(pl2); this._l.pontos.push(pl2);
    }
    if (!MOBILE) { const fundoLuz = new THREE.PointLight('#ffb070', 14, 14, 1.8); fundoLuz.position.set(0, 9, zFundo + 3); c.add(fundoLuz); this._l.fundo = fundoLuz; }
    // luz do telão (cor varia com o filme)
    this.luzTela = new THREE.SpotLight('#9ab6ff', 60, 40, Math.PI / 3.2, 0.8, 1.2);
    this.luzTela.position.set(0, TELA.y, TELA.z - 1);
    this.luzTela.target.position.set(0, 0, -6);
    this.luzTela.castShadow = !MOBILE;
    this.luzTela.shadow.mapSize.set(1024, 1024);
    c.add(this.luzTela, this.luzTela.target);
  }

  _texturaLogo() {
    const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 410;
    const g = cv.getContext('2d');
    g.shadowColor = '#ff2a48'; g.shadowBlur = 28;
    g.fillStyle = '#ff3355';
    // rolo de filme
    g.beginPath(); g.arc(205, 205, 150, 0, Math.PI * 2); g.lineWidth = 26; g.strokeStyle = '#ff3355'; g.stroke();
    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; g.beginPath(); g.arc(205 + Math.cos(a) * 82, 205 + Math.sin(a) * 82, 36, 0, Math.PI * 2); g.fill(); }
    g.font = 'bold 150px system-ui, sans-serif'; g.textBaseline = 'middle';
    g.fillStyle = '#ffffff'; g.fillText('Cine', 380, 150);
    g.fillStyle = '#ff3355'; g.fillText('Online', 380, 300);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  }

  // ------------------------------------------------------------------ telão
  _montarTela() {
    const c = this.cena;
    const moldura = new THREE.Mesh(new THREE.BoxGeometry(TELA.w + 0.6, TELA.h + 0.6, 0.2), new THREE.MeshStandardMaterial({ color: '#050305', roughness: 0.5 }));
    moldura.position.set(0, TELA.y, TELA.z + 0.12); c.add(moldura);
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

    // amostrador de cor média do vídeo para tingir a luz da sala
    this._cvCor = document.createElement('canvas'); this._cvCor.width = 8; this._cvCor.height = 8;
    this._ctxCor = this._cvCor.getContext('2d', { willReadFrequently: true });
  }

  // coloca um elemento HTML (iframe/video) exatamente sobre o telão; null remove
  mostrarNaTela(el) {
    if (this.objTela) { this.cenaHtml.remove(this.objTela); this.objTela.element.remove(); this.objTela = null; }
    if (!el) return;
    const W = 1280, H = Math.round(W * TELA.h / TELA.w);
    const caixa = document.createElement('div'); caixa.className = 'tela-html';
    caixa.style.width = W + 'px'; caixa.style.height = H + 'px';
    caixa.appendChild(el);
    const o = this.objTela = new CSS3DObject(caixa);
    o.position.set(0, TELA.y, TELA.z - 0.03); o.rotation.y = Math.PI; o.scale.setScalar(TELA.w / W);
    this.cenaHtml.add(o);
    this.materialTela.map = null; this.materialTela.color.set('#000000'); this.materialTela.needsUpdate = true;
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
  _zFila(i) { return 6.5 - i * PASSO_FILA; }
  _yFila(i) { return i * DEGRAU; }

  async _montarPoltronas() {
    const gltf = await new GLTFLoader().loadAsync(ASSETS + 'models/seat.glb');
    const modelo = gltf.scene;
    modelo.updateMatrixWorld(true);
    const blocos = [];
    for (let i = 0; i < FILEIRAS; i++) {
      // fileiras do fundo um pouco mais largas, como num cinema real
      const porLado = BLOCOS_POR_LADO + (i >= 5 ? 1 : 0);
      for (const lado of [-1, 1]) {
        for (let b = 0; b < porLado; b++) {
          const x = lado * (CORREDOR / 2 + LARG_BLOCO / 2 + b * (LARG_BLOCO + 0.02));
          // leve curvatura das fileiras em direção ao telão
          const z = this._zFila(i) - Math.pow(Math.abs(x) / 10, 2) * 1.2;
          const y = this._yFila(i);
          const rotY = -x * 0.012;
          blocos.push({ x, y, z, rotY });
          for (let s = 0; s < 3; s++) {
            const off = (s - 1) * (LARG_BLOCO / 3);
            this.assentos.push({
              fila: i, pos: new THREE.Vector3(x + Math.cos(rotY) * off, y, z - Math.sin(rotY) * off), rotY,
              prioridade: Math.abs(i - 3.5) * 1.3 + Math.abs(x + off) * 0.35,
            });
          }
        }
      }
    }
    // InstancedMesh por sub-malha (poucas chamadas de desenho → leve no celular)
    const mBloco = new THREE.Matrix4();
    modelo.traverse((o) => {
      if (!o.isMesh) return;
      const inst = new THREE.InstancedMesh(o.geometry, o.material, blocos.length);
      inst.castShadow = false; inst.receiveShadow = true;
      blocos.forEach((b, k) => {
        mBloco.compose(new THREE.Vector3(b.x, b.y, b.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, b.rotY, 0)), new THREE.Vector3(1, 1, 1));
        inst.setMatrixAt(k, mBloco.clone().multiply(o.matrixWorld));
      });
      baratear(inst); this.cena.add(inst);
      this._matsPoltrona.push(inst.material);
    });
    this.tema?.registrarPoltronas(this._matsPoltrona);
    this.assentos.sort((a, b) => a.prioridade - b.prioridade);
    return true;
  }

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
          this._sentar(reg, reg.assento);
          reg.rotulo = this._criarRotulo(reg.dados);
          wrap.add(reg.rotulo);
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
    if (reg.rotulo) reg.rotulo.position.set(0, 1.55 - (w.position.y - assento.pos.y), 0);
    if (reg.dados?.id === this.meuId && this.modo === 'poltrona') this.focarEm(reg.dados.id);
  }

  _criarRotulo(p) {
    const div = document.createElement('div');
    div.className = 'rotulo3d';
    div.innerHTML = `<div class="balao" hidden></div><div class="nome"></div>`;
    const obj = new CSS2DObject(div);
    obj.position.set(0, 1.5, 0);
    obj.center.set(0.5, 1);
    this._atualizarRotulo(obj, p);
    div.addEventListener('click', () => this.aoClicarPessoa?.(p.id));
    return obj;
  }
  _atualizarRotulo(obj, p) {
    const div = obj.element;
    div.classList.toggle('owner', p.papel === 'owner');
    div.classList.toggle('eu', p.id === this.meuId);
    div.querySelector('.nome').innerHTML = `${p.papel === 'owner' ? '👑 ' : ''}${esc(p.apelido || 'Convidado')}<i></i>`;
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
    this.avatares.delete(id);
  }

  // ------------------------------------------------------------------ câmera
  focarEm(id, ja = false) {
    const reg = this.avatares.get(id);
    if (!reg?.wrap) return;
    this.modo = 'poltrona';
    const p = reg.wrap.position;
    // visão em primeira pessoa: câmera nos olhos do próprio personagem, olhando para o telão
    const olhos = new THREE.Vector3(p.x, reg.assento.pos.y + 1.22, p.z + 0.12);
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
    if (this._regFP && this._regFP !== reg) this._regFP.wrap && (this._regFP.wrap.visible = true);
    this._regFP = sim ? reg : null;
    if (reg?.wrap) reg.wrap.visible = !sim;
    this.controles.minDistance = sim ? 0.01 : 1.2;
    this.controles.maxDistance = sim ? 0.05 : 20;
    this.controles.enableZoom = !sim;
    this.controles.rotateSpeed = (MOBILE ? 0.5 : 0.7) * (sim ? -0.6 : 1);
    this.controles.maxPolarAngle = sim ? Math.PI * 0.8 : Math.PI * 0.62;
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
    const w = this.canvas.clientWidth || innerWidth, h = this.canvas.clientHeight || innerHeight;
    this.renderer.setSize(w, h, false);
    this.css.setSize(w, h);
    this.css3d?.setSize(w, h);
    this.camera.aspect = w / h;
    if (this.modo === 'poltrona') {   // 90° de campo de visão horizontal (limitado no celular em pé)
      this.camera.fov = Math.min(100, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(45)) / (w / h))));
    } else this.camera.fov = w / h < 0.8 ? 72 : 55;
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
  _animar(t) {
    if (!MOBILE && (this._f = (this._f || 0) + 1) % 20 === 0) this._corDoVideo();
    for (const reg of this.avatares.values()) if (reg.wrap) animarOcioso(reg.wrap, t, reg.wrap.userData.semente);
    this.tema?.animar(t);
  }

  // muda o ambiente da sala para o gênero do filme (null = sala original do CineOnline)
  aplicarTema(filme) { this.tema?.aplicar(filme); }
  animar() {
    this.relogio.getDelta();
    this._animar(this.relogio.elapsedTime);
  }

  _loop() {
    if (MOBILE) {                       // celular: ~30 fps e pausa com a aba escondida
      const agora = performance.now();
      if (document.hidden || agora - (this._ult || 0) < 32) return;
      this._ult = agora;
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
    this._animar(t);
    this.renderer.render(this.cena, this.camera);
    this.css.render(this.cena, this.camera);
    if (this.objTela) this.css3d.render(this.cenaHtml, this.camera);
  }

  interromperCamera() { this._alvoCam = null; }

  destruir() {
    this.renderer.setAnimationLoop(null);
    this.tema?.destruir();
    removeEventListener('resize', this._redimensionar);
    this.renderer.dispose();
  }
}
