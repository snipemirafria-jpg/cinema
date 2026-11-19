import * as THREE from 'three';
import { CSS3DObject, CSS3DRenderer } from 'three/addons/renderers/CSS3DRenderer.js';
import { montarMidiaAnuncio, urlAnuncio } from './midia-anuncio.js';

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
    this.paineis.set(registro.posicao, { janela, objeto, parar, url: registro.url, tipo: registro.tipo });
  }

  remover(posicao) {
    const { janela, objeto, parar } = this.paineis.get(posicao);
    parar();
    janela.removeFromParent();
    objeto.removeFromParent();
    this.paineis.delete(posicao);
  }

  mostrar(visivel) {
    if (this.camada.hidden === !visivel) return;
    this.camada.hidden = !visivel;
    for (const { janela } of this.paineis.values()) janela.visible = visivel;
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
