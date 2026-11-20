import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
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


export { TELA, SALA, MOBILE, FILEIRAS, baratear };
export class AmbienteCinema {
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
    const guias = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 0.03, PASSO_FILA * 0.9), bordaMat, (FILEIRAS - 1) * 2);
    const deslocamento = new THREE.Matrix4(); let guia = 0;
    for (let i = 0; i < FILEIRAS; i++) {
      const z = this._zFila(i), y = this._yFila(i);
      if (y <= 0) continue;
      const d = new THREE.Mesh(new THREE.BoxGeometry(L - 0.2, y, PASSO_FILA), degrauMat);
      d.position.set(0, y / 2, z - 0.1); d.receiveShadow = true; c.add(d);
      // fitinha de luz no degrau do corredor
      for (const x of [-CORREDOR / 2 - 0.05, CORREDOR / 2 + 0.05]) {
        guias.setMatrixAt(guia++, deslocamento.makeTranslation(x, y + 0.02, z - 0.1));
      }
    }
    guias.count = guia; c.add(guias);
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
    const logo = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 1.6), new THREE.MeshBasicMaterial({ map: this._texturaLogo(), transparent: true, toneMapped: false }));
    logo.position.set(0, 9.5, zFundo + 0.05); c.add(logo);

    // logo nas paredes laterais (esquerda e direita), viradas para a plateia
    const texLogo = logo.material.map;
    for (const lado of [-1, 1]) {
      const l = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 1.69), new THREE.MeshBasicMaterial({ map: texLogo, transparent: true, toneMapped: false }));
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
    // logo 2D da Sessão Juntos (icons/logo-2d.webp: rolo de filme + nome + slogan).
    // Enquanto a imagem carrega (ou se falhar), desenha uma versão simples no canvas.
    const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 228;
    const g = cv.getContext('2d');
    g.shadowColor = '#ff2a48'; g.shadowBlur = 20;
    g.beginPath(); g.arc(110, 114, 80, 0, Math.PI * 2); g.lineWidth = 14; g.strokeStyle = '#ff3355'; g.stroke();
    g.fillStyle = '#ff3355';
    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; g.beginPath(); g.arc(110 + Math.cos(a) * 44, 114 + Math.sin(a) * 44, 19, 0, Math.PI * 2); g.fill(); }
    g.font = 'bold 96px system-ui, sans-serif'; g.textBaseline = 'middle';
    g.fillStyle = '#ffffff'; g.fillText('Sessão', 230, 114);
    g.fillStyle = '#ff3355'; g.fillText('Juntos', 230 + g.measureText('Sessão ').width, 114);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    const img = new Image();
    img.onload = () => {
      g.shadowBlur = 0; g.clearRect(0, 0, cv.width, cv.height);
      const k = Math.min(cv.width / img.width, cv.height / img.height);
      const w = img.width * k, h = img.height * k;
      g.drawImage(img, (cv.width - w) / 2, (cv.height - h) / 2, w, h);
      t.needsUpdate = true; this.aoMudarAmbiente?.();
    };
    img.src = 'icons/logo-2d.webp';
    return t;
  }

  _zFila(i) { return 6.5 - i * PASSO_FILA; }
  _yFila(i) { return i * DEGRAU; }

  async _montarPoltronas() {
    const modeloLeve = /Android/i.test(navigator.userAgent);
    const arquivo = modeloLeve ? 'seat-mobile.glb' : 'seat.glb';
    const gltf = await new GLTFLoader().loadAsync(ASSETS + 'models/' + arquivo);
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

}
