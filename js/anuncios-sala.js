import * as THREE from 'three';
import { CSS3DObject, CSS3DRenderer } from 'three/addons/renderers/CSS3DRenderer.js';
import { montarMidiaAnuncio, urlAnuncio } from './midia-anuncio.js';
import { idYouTube } from './fontes.js';

const LOGO_2D = new URL('../icons/logo-2d.webp', import.meta.url).href;
const PROPORCAO = 3.1 / 5.4;   // largura / altura do quadro da parede

class AnunciosSala {
  constructor(cinema) {
    this.cinema = cinema;
    this.paineis = new Map();
    this.cena = new THREE.Scene();
    this.camada = document.createElement('div');
    this.camada.className = 'camada-anuncios';
    this.camada.inert = true;
    this.camada.setAttribute('aria-hidden', 'true');
    cinema.canvas.before(this.camada);
    this.renderer = new CSS3DRenderer({ element: this.camada });
    this.redimensionar(cinema.canvas.clientWidth, cinema.canvas.clientHeight);

    // A janela transparente fica na profundidade da parede. Avatares e objetos
    // mais próximos continuam aparecendo na frente da mídia, que fica atrás do canvas.
    this.geometria = new THREE.PlaneGeometry(3.1, 5.4);
    this.material = new THREE.MeshBasicMaterial({
      color: 0x000000, transparent: true, opacity: 0,
      blending: THREE.NoBlending, fog: false, toneMapped: false,
    });
  }

  atualizar(registro) {
    const atual = this.paineis.get(registro.posicao);
    if (atual?.url === registro.url && atual?.tipo === registro.tipo) return;
    if (atual) this.remover(registro.posicao);

    const ancora = this.cinema.paineisAnuncios[registro.posicao - 1];
    const url = urlAnuncio(registro.url);
    if (!ancora || !url) return;

    const janela = new THREE.Mesh(this.geometria, this.material);
    janela.position.copy(ancora.painel.position);
    janela.position.x -= ancora.lado * 0.08;
    janela.rotation.y = -ancora.lado * Math.PI / 2;
    janela.visible = !this.camada.hidden;
    this.cinema.cena.add(janela);

    const caixa = document.createElement('div');
    caixa.className = 'midia-anuncio';
    const objeto = new CSS3DObject(caixa);
    objeto.position.copy(janela.position);
    objeto.rotation.copy(janela.rotation);
    objeto.scale.setScalar(0.01);
    this.cena.add(objeto);
    const parar = montarMidiaAnuncio(caixa, registro.tipo, url);

    // Cópia em WebGL do anúncio, usada só no modo VR (o óculos desenha a cena duas vezes e não vê a camada HTML).
    const espelho = new THREE.Mesh(this.geometria, new THREE.MeshBasicMaterial({ color: 0x111111, fog: false, toneMapped: false }));
    espelho.position.copy(janela.position);
    espelho.position.x -= ancora.lado * 0.012;
    espelho.rotation.copy(janela.rotation);
    espelho.visible = this.camada.hidden;
    this.cinema.cena.add(espelho);

    const painel = { janela, objeto, parar, caixa, espelho, url: registro.url, tipo: registro.tipo };
    this.paineis.set(registro.posicao, painel);
    if (this.camada.hidden) this._ligarEspelho(painel);
  }

  // ---------------------------------------------------------------- modo VR
  _aplicarTextura(painel, tex, largura, altura) {
    if (![...this.paineis.values()].includes(painel)) { tex.dispose(); return; }   // o anúncio mudou enquanto carregava
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(8, this.cinema.renderer.capabilities.getMaxAnisotropy());
    const a = largura / altura;               // preenche o quadro inteiro (corta as sobras, como "cover")
    if (a > PROPORCAO) { tex.repeat.set(PROPORCAO / a, 1); tex.offset.set((1 - PROPORCAO / a) / 2, 0); }
    else { tex.repeat.set(1, a / PROPORCAO); tex.offset.set(0, (1 - a / PROPORCAO) / 2); }
    const m = painel.espelho.material;
    m.map?.dispose(); m.map = tex; m.color.set(0xffffff); m.needsUpdate = true;
  }

  _imagemEspelho(painel, src, reserva = true) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => {
      const tex = new THREE.Texture(img); tex.needsUpdate = true;
      this._aplicarTextura(painel, tex, img.naturalWidth, img.naturalHeight);
    };
    img.onerror = () => { if (reserva) this._reserva(painel); };   // servidor sem CORS: mostra a marca
    img.src = src;
  }

  // Quadro escuro com a logo 2D inteira no meio (para mídias que o VR não consegue desenhar).
  _reserva(painel) {
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement('canvas'); cv.width = 620; cv.height = 1080;
      const g = cv.getContext('2d');
      const fundo = g.createLinearGradient(0, 0, 0, 1080); fundo.addColorStop(0, '#2a0a18'); fundo.addColorStop(1, '#0b0710');
      g.fillStyle = fundo; g.fillRect(0, 0, 620, 1080);
      const w = 540, h = w * img.naturalHeight / img.naturalWidth;
      g.drawImage(img, 40, 540 - h / 2, w, h);
      this._aplicarTextura(painel, new THREE.CanvasTexture(cv), 620, 1080);
    };
    img.src = LOGO_2D;
  }

  _ligarEspelho(painel) {
    painel.domVideo = painel.caixa.querySelector('video');
    if (painel.vrVideo) { painel.domVideo?.pause(); painel.vrVideo.play().catch(() => { }); return; }
    if (painel.espelho.material.map) return;
    const img = painel.caixa.querySelector('img');
    const iframe = painel.caixa.querySelector('iframe');
    const v = painel.domVideo;
    if (img?.currentSrc || img?.src) return this._imagemEspelho(painel, img.currentSrc || img.src);
    if (v && (v.currentSrc || v.src) && !(v.currentSrc || v.src).startsWith('blob:')) {
      const vv = painel.vrVideo = document.createElement('video');
      vv.crossOrigin = 'anonymous';
      vv.defaultMuted = vv.muted = vv.loop = vv.playsInline = true;
      vv.onloadeddata = () => {
        if (painel.espelho.material.map) return;
        this._aplicarTextura(painel, new THREE.VideoTexture(vv), vv.videoWidth || 9, vv.videoHeight || 16);
      };
      vv.onerror = () => { painel.vrVideo = null; vv.removeAttribute('src'); painel.domVideo = null; v.play().catch(() => { }); this._reserva(painel); };
      vv.src = v.currentSrc || v.src;
      vv.currentTime = v.currentTime || 0;
      v.pause();
      vv.play().catch(() => { });
      return;
    }
    const yt = iframe && /youtube/.test(iframe.src) ? idYouTube(painel.url) : null;
    if (yt) this._imagemEspelho(painel, `https://i.ytimg.com/vi/${encodeURIComponent(yt)}/hqdefault.jpg`);
    else this._reserva(painel);
  }

  _desligarEspelho(painel) {
    painel.vrVideo?.pause();
    painel.domVideo?.play().catch(() => { });
  }

  _liberarEspelho(painel) {
    if (painel.vrVideo) { painel.vrVideo.pause(); painel.vrVideo.removeAttribute('src'); painel.vrVideo.load(); }
    painel.espelho.removeFromParent();
    painel.espelho.material.map?.dispose();
    painel.espelho.material.dispose();
  }

  remover(posicao) {
    const painel = this.paineis.get(posicao);
    const { janela, objeto, parar } = painel;
    this._liberarEspelho(painel);
    parar();
    janela.removeFromParent();
    objeto.removeFromParent();
    this.paineis.delete(posicao);
  }

  mostrar(visivel) {
    if (this.camada.hidden === !visivel) return;
    this.camada.hidden = !visivel;
    for (const painel of this.paineis.values()) {
      painel.janela.visible = visivel;
      painel.espelho.visible = !visivel;          // no VR a camada HTML some; entra a cópia em WebGL
      if (visivel) this._desligarEspelho(painel); else this._ligarEspelho(painel);
    }
  }

  redimensionar(w, h) {
    this.renderer.setSize(w, h);
  }

  renderizar(camera) {
    if (!this.paineis.size) return;
    this.mostrar(true);
    this.renderer.render(this.cena, camera);
  }

  destruir() {
    this.pararAtualizacoes?.();
    for (const posicao of this.paineis.keys()) this.remover(posicao);
    this.camada.remove();
    this.material.dispose();
    this.geometria.dispose();
  }
}

export function acompanharAnuncios(sb, cinema) {
  const anuncios = cinema.anuncios = new AnunciosSala(cinema);
  let consulta = 0;
  let ativo = true;
  async function carregar() {
    const pedido = ++consulta;
    const { data, error } = await sb.from('anuncios_parede').select('posicao,tipo,url');
    if (!ativo || pedido !== consulta) return;
    if (error) {
      if (error.code !== 'PGRST205') console.warn('Anúncios da sala indisponíveis', error.message);
      return;
    }
    for (const registro of data) anuncios.atualizar(registro);
  }
  const canal = sb.channel('anuncios-parede')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'anuncios_parede' }, carregar)
    .subscribe(status => { if (status === 'SUBSCRIBED') carregar(); });
  carregar();
  anuncios.pararAtualizacoes = () => { ativo = false; sb.removeChannel(canal); };
}
