// CineOnline VR — módulo independente (Cinema VR + Vídeos 360°).
// Usa o Three.js que o projeto já tem (vendor/three). Não mexe no player, no Supabase,
// nos avatares nem na sala 3D: só lê o filme da sessão (window.CineOnline) e silencia
// a sala enquanto o VR está aberto. Ao sair, tudo volta como estava, sem recarregar.
import * as THREE from 'three';
import { detectarTipo, idYouTube, idArchive, idDrive, urlDriveDireto, urlDrivePreview, MidiaYouTube, MidiaIframe } from '../../js/fontes.js';
import { CSS3DRenderer, CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';

const MOBILE = matchMedia('(pointer:coarse)').matches || innerWidth < 760;
const CHAVE = 'cineonline-vr-ajustes';
const PADRAO = { tela: 16, dist: 14, sep: 0, escala: 1, distorcao: 0.22, volume: 1, oculos: true };
const aj = Object.assign({}, PADRAO, JSON.parse(localStorage.getItem(CHAVE) || '{}'));
const salvar = () => localStorage.setItem(CHAVE, JSON.stringify(aj));
const $ = (s, r = document) => r.querySelector(s);

function carregarDash() {
  if (window.dashjs) return Promise.resolve(window.dashjs);
  return new Promise((ok, erro) => {
    const s = document.createElement('script'); s.src = new URL('../../vendor/dash.all.min.js', import.meta.url).href;
    s.onload = () => ok(window.dashjs); s.onerror = erro; document.head.appendChild(s);
  });
}
const duracaoDe = (m) => { const d = m?.duration ?? m?.p?.getDuration?.(); return isFinite(d) && d > 0 ? d : NaN; };

// ----------------------------------------------------------------- formato do vídeo
// Identifica o formato pelo nome (_360, _TB, _LR, _SBS…) e pela proporção da imagem.
export function identificarFormato(largura, altura, nome = '') {
  const n = (nome || '').toLowerCase();
  const r = largura / altura;
  const perto = (x, y, tol = 0.06) => Math.abs(x - y) <= y * tol;
  const dica360 = /360|equirect|vr180|_mono/.test(n);
  const dicaTB = /(^|[^a-z])(tb|ou|top.?bottom|over.?under)([^a-z]|$)/.test(n);
  const dicaLR = /(^|[^a-z])(lr|sbs|side.?by.?side|3d)([^a-z]|$)/.test(n);
  if (perto(r, 2)) return dicaLR && !dica360 ? { tipo: 'plano', estereo: 'lr' } : { tipo: '360', estereo: 'mono' };
  if (perto(r, 1) && (dica360 || dicaTB)) return { tipo: '360', estereo: 'tb' };
  if (perto(r, 4)) return { tipo: '360', estereo: 'lr' };
  if (perto(r, 1) && !dica360) return { tipo: 'plano', estereo: dicaTB ? 'tb' : 'mono' };
  if (perto(r, 32 / 9) || (dicaLR && r > 2.6)) return { tipo: 'plano', estereo: 'lr' };
  return { tipo: 'plano', estereo: dicaTB ? 'tb' : 'mono' };
}

// ----------------------------------------------------------------- sensores
export async function verificarDispositivo() {
  const info = { https: isSecureContext, webxr: false, orientacaoApi: 'DeviceOrientationEvent' in window, giroscopio: false, precisaPermissao: false, celular: MOBILE };
  try { info.webxr = !!(navigator.xr && await navigator.xr.isSessionSupported('immersive-vr')); } catch { }
  info.precisaPermissao = typeof DeviceOrientationEvent?.requestPermission === 'function';
  if (info.orientacaoApi && !info.precisaPermissao) info.giroscopio = await testarGiroscopio(1200);
  return info;
}
function testarGiroscopio(ms) {
  return new Promise((ok) => {
    const f = (e) => { if (e.alpha != null || e.beta != null) { fim(true); } };
    const fim = (v) => { removeEventListener('deviceorientation', f); clearTimeout(t); ok(v); };
    addEventListener('deviceorientation', f);
    const t = setTimeout(() => fim(false), ms);
  });
}

// orientação do celular -> quaternion da câmera (mesmo cálculo do antigo DeviceOrientationControls)
const _zee = new THREE.Vector3(0, 0, 1), _eul = new THREE.Euler(), _q0 = new THREE.Quaternion(), _q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
function quaternionDoSensor(q, alpha, beta, gamma, orient) {
  _eul.set(beta, alpha, -gamma, 'YXZ');
  q.setFromEuler(_eul); q.multiply(_q1); q.multiply(_q0.setFromAxisAngle(_zee, -orient));
}

// ----------------------------------------------------------------- utilidades 3D
function ajustarUV(geo, ox, oy, sx, sy) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, ox + uv.getX(i) * sx, oy + uv.getY(i) * sy);
  uv.needsUpdate = true; return geo;
}
// metade de cada olho: esquerda/cima = olho esquerdo (camada 1), direita/baixo = olho direito (camada 2)
function partesEstereo(estereo) {
  if (estereo === 'lr') return [[0, 0, 0.5, 1, 1], [0.5, 0, 0.5, 1, 2]];
  if (estereo === 'tb') return [[0, 0.5, 1, 0.5, 1], [0, 0, 1, 0.5, 2]];
  return [[0, 0, 1, 1, 0]];
}

const VERT = 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }';
const FRAG = `uniform sampler2D t; uniform float k1, escala; varying vec2 vUv;
void main(){ vec2 p=(vUv-0.5)*2.0/escala; float r2=dot(p,p); vec2 d=p*(1.0+k1*r2+k1*0.5*r2*r2)/(1.0+k1*1.5); vec2 uv=d*0.5+0.5;
 if(uv.x<0.0||uv.y<0.0||uv.x>1.0||uv.y>1.0) gl_FragColor=vec4(0.,0.,0.,1.); else gl_FragColor=texture2D(t,uv);
 #include <colorspace_fragment>
}`;

// ----------------------------------------------------------------- cena: Cinema VR
function criarSalaCinema() {
  const g = new THREE.Group();
  const L = 24, A = 11, C = 34;
  const parede = new THREE.MeshStandardMaterial({ color: 0x5a3a4a, roughness: 0.95 });
  const veludo = new THREE.MeshStandardMaterial({ color: 0x7a1a2c, roughness: 0.8 });
  const chao = new THREE.Mesh(new THREE.PlaneGeometry(L, C), new THREE.MeshStandardMaterial({ color: 0x2e1c24, roughness: 1 }));
  chao.rotation.x = -Math.PI / 2; chao.position.z = -C / 2 + 8; g.add(chao);
  const teto = chao.clone(); teto.rotation.x = Math.PI / 2; teto.position.y = A; teto.material = parede; g.add(teto);
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(C, A), veludo);
    p.rotation.y = -s * Math.PI / 2; p.position.set(s * L / 2, A / 2, -C / 2 + 8); g.add(p);
    for (let i = 0; i < 5; i++) {   // arandelas nas paredes
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.25), new THREE.MeshBasicMaterial({ color: 0xffb070 }));
      l.position.set(s * (L / 2 - 0.06), 4.2, 6 - i * 6); g.add(l);
    }
  }
  const fundo = new THREE.Mesh(new THREE.PlaneGeometry(L, A), parede); fundo.position.set(0, A / 2, 8); fundo.rotation.y = Math.PI; g.add(fundo);
  const frente = new THREE.Mesh(new THREE.PlaneGeometry(L, A), new THREE.MeshStandardMaterial({ color: 0x050305 })); frente.position.set(0, A / 2, -C + 8 + 0.02); g.add(frente);
  // poltronas (instanciadas: 1 desenho para todas)
  const assento = new THREE.BoxGeometry(0.9, 0.5, 0.8); assento.translate(0, 0.25, 0);
  const encosto = new THREE.BoxGeometry(0.9, 1.0, 0.18); encosto.translate(0, 0.75, 0.38);
  const matPolt = new THREE.MeshStandardMaterial({ color: 0x7a1424, roughness: 0.7 });
  const filas = 9, porFila = 16, n = filas * porFila;
  const iA = new THREE.InstancedMesh(assento, matPolt, n), iE = new THREE.InstancedMesh(encosto, matPolt, n);
  const m = new THREE.Matrix4(); let k = 0;
  for (let f = 0; f < filas; f++) for (let c = 0; c < porFila; c++) {
    const x = (c - (porFila - 1) / 2) * 1.05 + (c >= porFila / 2 ? 0.8 : -0.8);
    m.makeTranslation(x, 0, 4.5 - f * 1.5); iA.setMatrixAt(k, m); iE.setMatrixAt(k, m); k++;
  }
  g.add(iA, iE);
  // luzes de corredor
  for (let i = 0; i < 10; i++) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.12), new THREE.MeshBasicMaterial({ color: 0x5b8cff }));
    l.position.set(0, 0.03, 4 - i * 1.5); g.add(l);
  }
  g.add(new THREE.AmbientLight(0x3a2630, 1.6));
  g.add(new THREE.HemisphereLight(0x504060, 0x100808, 0.8));
  // sanca de luz no teto e placa de saída no fundo: dá para ver o teto e a parte de trás da sala
  for (const s of [-1, 1]) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, C - 4), new THREE.MeshBasicMaterial({ color: 0x6a3cff }));
    f.position.set(s * (L / 2 - 1.2), A - 0.05, -C / 2 + 8); g.add(f);
  }
  const saida = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.45), new THREE.MeshBasicMaterial({ color: 0x18c964 }));
  saida.position.set(L / 2 - 3, 3.2, 7.98); saida.rotation.y = Math.PI; g.add(saida);
  const porta = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 2.6), new THREE.MeshStandardMaterial({ color: 0x2a1a12 }));
  porta.position.set(L / 2 - 3, 1.3, 7.98); porta.rotation.y = Math.PI; g.add(porta);
  const cabine = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5), new THREE.MeshBasicMaterial({ color: 0xbfd0ff }));
  cabine.position.set(0, 8.5, 7.98); cabine.rotation.y = Math.PI; g.add(cabine);   // janela da cabine de projeção
  const luzTela = new THREE.PointLight(0xbfd0ff, 30, 40, 1.6); luzTela.position.set(0, 5, -12); g.add(luzTela);
  g.userData.luzTela = luzTela;
  return g;
}

// ----------------------------------------------------------------- interface
const CSS = `
#vr-raiz{position:fixed;inset:0;z-index:80;background:#05030a;color:#f4eefc;font-family:inherit;touch-action:none;user-select:none;-webkit-user-select:none}
#vr-raiz[hidden]{display:none}
#vr-raiz canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
.vr-tela{position:absolute;inset:0;overflow:auto;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:calc(20px + env(safe-area-inset-top,0px)) 18px calc(20px + env(safe-area-inset-bottom,0px));background:radial-gradient(ellipse at 50% 0%,#2b1145 0%,#0b0710 60%);animation:vrEntra .35s ease;touch-action:auto}
.vr-tela[hidden]{display:none}
@keyframes vrEntra{from{opacity:0;transform:scale(.98)}to{opacity:1;transform:none}}
.vr-tela h1{margin:0;font-size:clamp(28px,7vw,48px);letter-spacing:.06em}
.vr-tela h1 span{color:#a78bfa}
.vr-tela h2{margin:0;font-size:22px}
.vr-tela p{margin:0;opacity:.85;text-align:center;max-width:520px;line-height:1.45}
.vr-botoes{display:flex;flex-wrap:wrap;gap:12px;justify-content:center;width:100%;max-width:560px}
.vr-b{flex:1 1 220px;border:0;border-radius:16px;padding:18px 16px;font:inherit;font-weight:700;font-size:17px;color:#fff;cursor:pointer;background:linear-gradient(135deg,#7c3aed,#c026d3);box-shadow:0 8px 30px rgba(124,58,237,.35);transition:transform .15s}
.vr-b:active{transform:scale(.97)} .vr-b.sec{background:#221830;box-shadow:none;border:1px solid rgba(255,255,255,.12)}
.vr-b small{display:block;font-weight:400;font-size:12.5px;opacity:.85;margin-top:4px}
.vr-b[disabled]{opacity:.45;cursor:not-allowed}
.vr-info{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;font-size:13px}
.vr-info span{background:#1d1428;border:1px solid rgba(255,255,255,.1);border-radius:999px;padding:6px 11px}
.vr-aviso{background:#3a1f06;border:1px solid #f59e0b55;color:#fde68a;border-radius:12px;padding:10px 14px;font-size:14px;max-width:560px;text-align:center}
.vr-aviso[hidden]{display:none}
.vr-campo{width:100%;max-width:560px;display:flex;gap:8px}
.vr-campo input{flex:1;min-width:0;background:#221830;border:1px solid rgba(255,255,255,.12);border-radius:12px;color:#fff;padding:12px;font:inherit}
.vr-fechar{position:absolute;top:calc(12px + env(safe-area-inset-top,0px));right:12px;background:#30343d;color:#fff;border:0;border-radius:10px;padding:9px 14px;font:inherit;cursor:pointer}
.vr-controles{position:absolute;left:50%;bottom:calc(10px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);display:flex;flex-wrap:wrap;gap:6px;justify-content:center;align-items:center;max-width:min(96vw,980px);background:rgba(10,6,16,.86);border:1px solid rgba(255,255,255,.1);border-radius:16px;padding:8px 10px;transition:opacity .3s;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
.vr-controles.oculto{opacity:0;pointer-events:none}
.vr-controles button{background:#2a1f3a;color:#fff;border:0;border-radius:10px;min-width:42px;height:40px;padding:0 10px;font:inherit;font-size:15px;cursor:pointer}
.vr-controles button.ativo{background:#7c3aed}
.vr-controles label{display:flex;align-items:center;gap:4px;font-size:12px;opacity:.9}
.vr-controles input[type=range]{width:78px;accent-color:#a78bfa}
.vr-tempo{font-size:12px;opacity:.85;min-width:86px;text-align:center}
.vr-msg{position:absolute;top:calc(12px + env(safe-area-inset-top,0px));left:50%;transform:translateX(-50%);background:rgba(10,6,16,.85);border-radius:10px;padding:8px 14px;font-size:14px;max-width:90vw;text-align:center;transition:opacity .4s}
.vr-msg[hidden]{display:none}
.vr-divisor{position:absolute;top:0;bottom:0;left:50%;width:2px;margin-left:-1px;background:#000;pointer-events:none}
.vr-divisor[hidden]{display:none}
.vr-css{position:absolute;top:0;left:0;overflow:hidden;pointer-events:none;transform-origin:50% 50%}
.vr-css .tela-html video{object-fit:contain}
.vr-css .midia-iframe{pointer-events:auto}
#vr-botao span{white-space:nowrap}
`;

class ExperienciaVR {
  constructor() {
    this.raiz = null; this.info = null; this.ativo = false;
  }

  montar() {
    if (this.raiz) return;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const r = this.raiz = document.createElement('div'); r.id = 'vr-raiz'; r.hidden = true;
    r.innerHTML = `
      <section class="vr-tela" data-t="inicio">
        <button class="vr-fechar" data-sair>✕ Voltar</button>
        <h1>CINE<span>ONLINE</span> VR</h1>
        <p>Entre em uma nova experiência de cinema.</p>
        <div class="vr-info" data-info><span>🔎 Verificando o aparelho…</span></div>
        <div class="vr-aviso" data-aviso hidden></div>
        <div class="vr-botoes">
          <button class="vr-b" data-ir="cinema">🎬 CINEMA VR<small>Telão gigante numa sala escura</small></button>
          <button class="vr-b" data-ir="360">🌐 VÍDEOS 360°<small>Olhe em volta com o celular</small></button>
        </div>
        <label class="vr-info"><span><input type="checkbox" data-oculos> Usar óculos (VR Box / Cardboard): tela dividida</span></label>
      </section>
      <section class="vr-tela" data-t="fonte" hidden>
        <button class="vr-fechar" data-voltar>← Voltar</button>
        <h2 data-titulo>Escolha o vídeo</h2>
        <p data-explica></p>
        <div class="vr-botoes">
          <button class="vr-b" data-fonte="sessao">🍿 Filme da sessão agora<small data-sessao-info>—</small></button>
          <button class="vr-b sec" data-fonte="arquivo">📁 Vídeo do celular<small>MP4 / WebM salvo no aparelho</small></button>
        </div>
        <div class="vr-campo"><input data-link type="url" placeholder="Ou cole um link de vídeo (.mp4, .webm, .m3u8)"><button class="vr-b sec" style="flex:0 0 auto" data-fonte="link">Abrir</button></div>
        <input type="file" accept="video/*" data-arquivo hidden>
        <div class="vr-aviso" data-aviso2 hidden></div>
      </section>
      <canvas data-canvas hidden></canvas>
      <div class="vr-divisor" data-divisor hidden></div>
      <div class="vr-msg" data-msg hidden></div>
      <div class="vr-controles" data-ctl hidden>
        <button data-c="voltar10" title="Voltar 10 s">⏪</button>
        <button data-c="play" title="Reproduzir / pausar">⏸</button>
        <button data-c="avancar10" title="Avançar 10 s">⏩</button>
        <span class="vr-tempo" data-tempo>0:00</span>
        <button data-c="aovivo" title="Voltar ao ponto da sessão" hidden>🔴 Ao vivo</button>
        <label title="Volume">🔊<input type="range" min="0" max="1" step="0.05" data-r="volume"></label>
        <button data-c="estereo" data-so-textura title="Formato do filme: 2D, 3D lado a lado ou 3D em cima/embaixo">2D</button>
        <label data-so-cinema title="Tamanho da tela">📐<input type="range" min="8" max="22" step="1" data-r="tela"></label>
        <label data-so-cinema title="Distância da tela">↔<input type="range" min="6" max="24" step="1" data-r="dist"></label>
        <label data-so-oculos title="Separação entre os olhos">👀<input type="range" min="-60" max="60" step="2" data-r="sep"></label>
        <label data-so-oculos title="Escala da imagem">🔍<input type="range" min="0.6" max="1.3" step="0.02" data-r="escala"></label>
        <label data-so-oculos title="Correção das lentes">◎<input type="range" min="0" max="0.5" step="0.02" data-r="distorcao"></label>
        <button data-c="oculos" title="Tela dividida (óculos)">🥽</button>
        <button data-c="centro" title="Centralizar a visão">🎯</button>
        <button data-c="xr" title="Abrir em WebXR" hidden>XR</button>
        <button data-c="sair" title="Sair do VR">✕ Sair</button>
      </div>`;
    document.body.appendChild(r);
    this.canvas = $('[data-canvas]', r);
    $('[data-oculos]', r).checked = aj.oculos;
    $('[data-oculos]', r).onchange = (e) => { aj.oculos = e.target.checked; salvar(); };
    r.addEventListener('click', (e) => this._clique(e));
    $('[data-arquivo]', r).onchange = (e) => { const f = e.target.files?.[0]; if (f) this.abrir({ url: URL.createObjectURL(f), nome: f.name, local: true }); e.target.value = ''; };
    for (const inp of r.querySelectorAll('[data-r]')) {
      inp.value = aj[inp.dataset.r];
      inp.oninput = () => { aj[inp.dataset.r] = +inp.value; salvar(); this._aplicarAjustes(); this._mostrarControles(); };
    }
  }

  // ------------------------------------------------------------ fluxo
  async entrar() {
    this.montar();
    this.raiz.hidden = false; this._tela('inicio');
    this.info = await verificarDispositivo();
    const i = this.info, chips = [];
    chips.push(i.webxr ? '✅ WebXR disponível' : '➖ Sem WebXR: modo tela dividida');
    chips.push(i.giroscopio ? '✅ Giroscópio' : i.precisaPermissao ? '🔐 Giroscópio pede permissão' : '⚠️ Sem giroscópio');
    chips.push(i.https ? '🔒 HTTPS' : '⚠️ Sem HTTPS');
    $('[data-info]', this.raiz).innerHTML = chips.map(c => `<span>${c}</span>`).join('');
    const av = $('[data-aviso]', this.raiz);
    if (!i.giroscopio && !i.precisaPermissao) { av.hidden = false; av.textContent = 'Este aparelho não enviou dados de giroscópio. Você ainda pode usar o VR: arraste o dedo na tela (ou o mouse) para olhar em volta.'; }
    else av.hidden = true;
  }

  _tela(nome) { for (const s of this.raiz.querySelectorAll('.vr-tela')) s.hidden = s.dataset.t !== nome; }

  _clique(e) {
    const b = e.target.closest('button'); if (!b) { if (this.ativo) this._mostrarControles(); return; }
    if (b.hasAttribute('data-sair')) return this.sair();
    if (b.hasAttribute('data-voltar')) return this._tela('inicio');
    if (b.dataset.ir) return this._escolherFonte(b.dataset.ir);
    if (b.dataset.fonte) return this._fonte(b.dataset.fonte);
    if (b.dataset.c) return this._comando(b.dataset.c);
  }

  _escolherFonte(modo) {
    this.modo = modo;
    this._tela('fonte');
    $('[data-titulo]', this.raiz).textContent = modo === 'cinema' ? '🎬 Cinema VR' : '🌐 Vídeos 360°';
    $('[data-explica]', this.raiz).textContent = modo === 'cinema'
      ? 'Assista a um filme comum num telão gigante. Filmes 3D lado a lado ou em cima/embaixo mostram uma imagem para cada olho.'
      : 'Use um vídeo gravado em 360° (equirretangular, proporção 2:1; ou 3D 360° em cima/embaixo). Filmes comuns não viram 360°.';
    const s = this._fonteSessao();
    const bs = $('[data-fonte="sessao"]', this.raiz);
    bs.disabled = !s.ok; $('[data-sessao-info]', this.raiz).textContent = s.ok ? s.titulo : s.motivo;
    $('[data-aviso2]', this.raiz).hidden = true;
  }

  _fonteSessao() {
    const p = window.CineOnline?.player;
    const f = p?.estado?.filme;
    if (!p || !f) return { ok: false, motivo: 'Nenhum filme passando na sala agora' };
    let { tipo, url } = p.fonteDe(f);
    if (tipo === 'link') tipo = detectarTipo(url);
    return { ok: true, titulo: f.titulo, url, tipo, nome: f.titulo + ' ' + url, sessao: true };
  }

  _fonte(qual) {
    if (qual === 'arquivo') return $('[data-arquivo]', this.raiz).click();
    if (qual === 'link') {
      const url = $('[data-link]', this.raiz).value.trim();
      if (!/^https?:\/\//i.test(url)) return this._aviso2('Cole um link que comece com http:// ou https://');
      return this.abrir({ url, nome: url, tipo: detectarTipo(url) });
    }
    if (qual === 'sessao') { const s = this._fonteSessao(); if (s.ok) this.abrir(s); }
  }

  _aviso2(t) { const a = $('[data-aviso2]', this.raiz); a.hidden = false; a.textContent = t; }

  // ------------------------------------------------------------ abrir vídeo
  // Cinema VR: qualquer filme que o player do CineOnline toca. Vídeo direto (MP4/WebM/HLS/DASH,
  // upload, Internet Archive) vira textura do telão; YouTube, Drive e páginas viram um player
  // HTML posto sobre o telão em 3D (um para cada olho na tela dividida).
  // Vídeos 360°: só vídeo direto, e só se o formato for 360° de verdade.
  async abrir(fonte) {
    this._aviso2('Carregando o vídeo…');
    this.fonte = fonte;
    let tipo = fonte.local ? 'mp4' : (fonte.tipo && fonte.tipo !== 'link' ? fonte.tipo : detectarTipo(fonte.url));
    if (tipo === 'upload') tipo = 'mp4';
    let url = fonte.url;
    if (tipo === 'archive') {   // o Archive libera o arquivo MP4 do filme: vira textura (melhor imagem e lentes corrigidas)
      const mp4 = await this._mp4DoArchive(url);
      if (mp4) { tipo = 'mp4'; url = mp4; }
    }
    if (['mp4', 'hls', 'dash'].includes(tipo)) {
      const erro = await this._carregarTextura(url, tipo);
      if (!erro) {
        const v = this.video;
        if (this.modo === '360') {
          const fmt = identificarFormato(v.videoWidth, v.videoHeight, fonte.nome);
          if (fmt.tipo !== '360') {
            const dims = `${v.videoWidth}×${v.videoHeight}`; this._limparVideo();
            return this._aviso2(`⚠️ Este vídeo não é 360° (${dims}). Vídeos 360° têm proporção 2:1 (ou 1:1 em 3D). Filmes comuns abrem no Cinema VR.`);
          }
          this.formato = fmt;
        } else this.formato = { tipo: 'plano', estereo: aj.estereo || 'mono' };   // Cinema VR: filme comum, sem deformação
        if (fonte.sessao) { try { v.currentTime = window.CineOnline.player.posicaoAlvo(); } catch { } }
        return this._iniciarCena('textura');
      }
      if (this.modo === '360') return this._aviso2('⚠️ ' + erro);
      if (tipo !== 'mp4') return this._aviso2('⚠️ ' + erro);
      tipo = 'video-livre';            // MP4 de site sem CORS: toca num <video> comum sobre o telão
    }
    if (this.modo === '360') return this._aviso2('⚠️ Vídeos 360° precisam ser um arquivo de vídeo (MP4, WebM ou HLS). Players do YouTube e de outros sites não giram em 360° aqui. Filmes comuns abrem no Cinema VR.');
    if (tipo === 'drive') { const id = idDrive(url); tipo = 'video-livre'; url = urlDriveDireto(id); this._reservaIframe = urlDrivePreview(id); }
    else if (tipo === 'archive') { tipo = 'iframe'; const e = new URL(`https://archive.org/embed/${encodeURIComponent(idArchive(url))}`); e.searchParams.set('autoplay', '1'); url = e.toString(); }
    else if (tipo === 'youtube') url = idYouTube(url);
    else if (tipo !== 'video-livre') tipo = 'iframe';
    this.html = { tipo, url };
    this.formato = { tipo: 'plano', estereo: 'mono' };
    return this._iniciarCena('html');
  }

  async _mp4DoArchive(u) {
    try {
      const id = idArchive(u); if (!id) return null;
      const r = await fetch(`https://archive.org/metadata/${encodeURIComponent(id)}`); const d = await r.json();
      const fs = (d.files || []).filter(f => /\.mp4$/i.test(f.name));
      if (!fs.length) return null;
      const pref = fs.find(f => /h\.264|512kb|mpeg4/i.test(f.format || '')) || fs[0];
      return `https://archive.org/download/${encodeURIComponent(id)}/${pref.name.split('/').map(encodeURIComponent).join('/')}`;
    } catch { return null; }
  }

  // vídeo com CORS -> textura WebGL. Devolve null se deu certo, ou a mensagem de erro.
  async _carregarTextura(url, tipo) {
    const v = this.video = window.__vrv = document.createElement('video');
    v.crossOrigin = 'anonymous'; v.playsInline = true; v.setAttribute('webkit-playsinline', ''); v.preload = 'auto'; v.loop = false;
    v.volume = aj.volume;
    try {
      if (tipo === 'hls' && !v.canPlayType('application/vnd.apple.mpegurl')) {
        const H = (await import('../../vendor/hls.mjs')).default;
        if (!H.isSupported()) throw new Error('HLS não suportado neste navegador.');
        this.hls = new H({ maxBufferLength: 20, enableWorker: true }); this.hls.loadSource(url); this.hls.attachMedia(v);
        if (MOBILE) this.hls.on(H.Events.MANIFEST_PARSED, (_, d) => { let cap = -1; d.levels.forEach((l, i) => { if ((l.height || 0) <= 1080) cap = i; }); if (cap >= 0) this.hls.autoLevelCapping = cap; });
      } else if (tipo === 'dash') {
        const d = await carregarDash(); this.dash = d.MediaPlayer().create(); this.dash.initialize(v, url, false);
      } else v.src = url;
      await new Promise((ok, erro) => {
        const pronto = () => { if (v.videoWidth > 0) ok(); };
        v.addEventListener('loadedmetadata', pronto); v.addEventListener('loadeddata', pronto); v.addEventListener('resize', pronto);
        v.addEventListener('error', () => erro(new Error('O vídeo não abriu (link inválido ou indisponível).')), { once: true });
        setTimeout(() => erro(new Error('O vídeo demorou demais para responder.')), 20000);
      });
      return null;
    } catch (e) { this._limparVideo(); return e.message; }
  }

  // ------------------------------------------------------------ renderização
  async _iniciarCena(tipoTela) {
    this.tipoTela = tipoTela;
    this._tela('nenhuma');
    for (const s of this.raiz.querySelectorAll('.vr-tela')) s.hidden = true;
    this.ativo = true;
    // pausa a sala 3D principal (economiza bateria/memória) e silencia o filme da sala
    const C = window.CineOnline;
    this._salaEstavaMuda = C?.player ? C.player.mutado : true;
    try { C?.player?.silenciar(); } catch { }
    try { C?.cinema?.renderer.setAnimationLoop(null); } catch { }

    const c = this.canvas; c.hidden = false;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas: c, antialias: !MOBILE, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(devicePixelRatio, MOBILE ? 1.5 : 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.xr.enabled = true;
    const cena = this.cena = new THREE.Scene();
    cena.background = new THREE.Color(0x000000);
    const cab = this.cabeca = new THREE.PerspectiveCamera(this.modo === '360' ? 80 : 75, 1, 0.05, 200);
    const rig = this.rig = new THREE.Group(); rig.add(cab); cena.add(rig);
    cab.layers.enable(1);   // modo sem óculos: mostra o olho esquerdo
    this.olhoE = new THREE.PerspectiveCamera(90, 1, 0.05, 200); this.olhoE.layers.enable(1);
    this.olhoD = new THREE.PerspectiveCamera(90, 1, 0.05, 200); this.olhoD.layers.enable(2);

    if (tipoTela === 'textura') {
      const tex = this.textura = new THREE.VideoTexture(this.video);
      tex.colorSpace = THREE.SRGBColorSpace; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
    }
    const tex = this.textura;

    if (this.modo === '360') {
      for (const [ox, oy, sx, sy, camada] of partesEstereo(this.formato.estereo)) {
        const g = ajustarUV(new THREE.SphereGeometry(50, MOBILE ? 48 : 64, MOBILE ? 32 : 48), ox, oy, sx, sy);
        g.scale(-1, 1, 1);
        const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex }));
        m.rotation.y = -Math.PI / 2;     // centro do vídeo fica à frente
        m.layers.set(camada); cena.add(m);
      }
      rig.position.set(0, 0, 0);
    } else {
      cena.add(this.sala = criarSalaCinema());
      this.telas = [];
      if (tipoTela === 'textura') this._criarTelas();
      const moldura = this.moldura = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x000000 }));
      cena.add(moldura);
      rig.position.set(0, 1.25, 0);   // sentado numa poltrona do meio
    }
    // pós-processamento dos óculos: cada olho vai para uma textura e passa pela correção da lente
    this.rt = new THREE.WebGLRenderTarget(16, 16, { samples: MOBILE ? 0 : 4 });
    this.matLente = new THREE.ShaderMaterial({ uniforms: { t: { value: this.rt.texture }, k1: { value: aj.distorcao }, escala: { value: aj.escala } }, vertexShader: VERT, fragmentShader: FRAG, depthTest: false });
    this.quadCena = new THREE.Scene(); this.quadCam = new THREE.Camera();
    this.quadCena.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.matLente));

    this._aplicarAjustes();
    this._ligarSensores();
    this._ligarToque();
    if (tipoTela === 'textura') this._ligarVideo();
    else {
      this._montarOlhosHtml();
      this._tSync = setInterval(() => this._sincronizarOlhos(), 700);
    }
    this._redimensionar = () => this._tamanho(); addEventListener('resize', this._redimensionar);
    this._tamanho();
    const xrb = $('[data-c="xr"]', this.raiz); xrb.hidden = !this.info?.webxr || tipoTela !== 'textura';   // player HTML não aparece no WebXR
    for (const el of this.raiz.querySelectorAll('[data-so-textura]')) el.hidden = tipoTela !== 'textura' || this.modo !== 'cinema';
    const semControle = tipoTela === 'html' && this.html.tipo === 'iframe';
    for (const c of ['play', 'voltar10', 'avancar10', 'aovivo']) $(`[data-c="${c}"]`, this.raiz).hidden = semControle || (c === 'aovivo' && !this.fonte?.sessao);
    this._atualizarEstereo();
    for (const el of this.raiz.querySelectorAll('[data-so-cinema]')) el.hidden = this.modo !== 'cinema';
    $('[data-ctl]', this.raiz).hidden = false;
    this._mostrarControles();
    if (aj.oculos) await this._telaCheia();
    this._atualizarOculos();
    r.setAnimationLoop((t, frame) => this._loop(t, frame));
    if (tipoTela === 'textura') {
      try { await this.video.play(); } catch { this.video.muted = true; try { await this.video.play(); this._msg('Toque em ▶ para ligar o som.'); } catch { this._msg('Toque em ▶ para começar.'); } }
    } else if (semControle) this._msg('Este filme usa o player do próprio site: toque no telão para dar play.', 5000);
    this._atualizarPlay();
    if (!this.giro) this._msg(this.info?.precisaPermissao ? 'Toque na tela para liberar o giroscópio, ou arraste para olhar em volta.' : 'Sem giroscópio: arraste o dedo para olhar em volta.');
  }

  get midia() { return this.tipoTela === 'html' ? this.olhosHtml?.[0]?.m : this.video; }

  // telão com textura (2D ou 3D: uma imagem por olho)
  _criarTelas() {
    for (const m of this.telas || []) { this.cena.remove(m); m.geometry.dispose(); m.material.dispose(); }
    this.telas = [];
    for (const [ox, oy, sx, sy, camada] of partesEstereo(this.formato.estereo)) {
      const g = ajustarUV(new THREE.PlaneGeometry(1, 1), ox, oy, sx, sy);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: this.textura, toneMapped: false }));
      m.layers.set(camada); this.cena.add(m); this.telas.push(m);
    }
  }
  _atualizarEstereo() {
    const b = $('[data-c="estereo"]', this.raiz); if (b) b.textContent = { mono: '2D', lr: '3D ⇆', tb: '3D ⇅' }[this.formato?.estereo || 'mono'];
  }

  // players HTML (YouTube, Drive, vídeo sem CORS, páginas) sobre o telão: um por olho
  _criarHtml(principal) {
    const { tipo, url } = this.html;
    const pos = this.fonte?.sessao ? (() => { try { return window.CineOnline.player.posicaoAlvo(); } catch { return 0; } })() : 0;
    let m, el;
    if (tipo === 'youtube') {
      m = new MidiaYouTube(url, pos, {
        erro: (t) => principal && this._msg('⚠️ ' + t, 6000),
        pronto: () => { if (principal) { m.muted = false; try { m.p.setVolume(aj.volume * 100); } catch { } } },
      });
      el = m.el;
    } else if (tipo === 'video-livre') {
      const v = m = el = document.createElement('video');
      v.playsInline = true; v.setAttribute('webkit-playsinline', ''); v.preload = 'auto'; v.muted = !principal; v.volume = aj.volume; v.src = url;
      v.addEventListener('loadedmetadata', () => { if (pos) try { v.currentTime = pos; } catch { } this._aplicarAjustes(); }, { once: true });
      if (principal) v.addEventListener('error', () => this._trocarParaIframe(), { once: true });
      v.play().catch(() => { v.muted = true; v.play().catch(() => { }); });
    } else { m = new MidiaIframe(url); el = m.el; }
    const caixa = document.createElement('div'); caixa.className = 'tela-html';
    caixa.style.width = '1280px'; caixa.style.height = '720px'; caixa.appendChild(el);
    return { m, obj: new CSS3DObject(caixa), caixa };
  }
  _montarOlhosHtml() {
    this.olhosHtml ||= [];
    const n = aj.oculos ? 2 : 1;
    while (this.olhosHtml.length > n) this._destruirOlho(this.olhosHtml.pop());
    while (this.olhosHtml.length < n) {
      const cont = document.createElement('div'); cont.className = 'vr-css';
      this.raiz.insertBefore(cont, $('[data-divisor]', this.raiz));
      const css = new CSS3DRenderer({ element: cont }); const cena = new THREE.Scene();
      const it = this._criarHtml(this.olhosHtml.length === 0); cena.add(it.obj);
      this.olhosHtml.push({ cont, css, cena, ...it });
    }
    this._aplicarAjustes(); this._tamanho();
  }
  _destruirOlho(o) {
    try { if (o.m instanceof HTMLVideoElement) { o.m.pause(); o.m.removeAttribute('src'); o.m.load(); } else o.m.destruir?.(); } catch { }
    o.cont.remove();
  }
  _trocarParaIframe() {
    if (!this._reservaIframe || !this.olhosHtml) return this._msg('⚠️ Este vídeo não abriu.', 5000);
    this.html = { tipo: 'iframe', url: this._reservaIframe }; this._reservaIframe = null;
    while (this.olhosHtml.length) this._destruirOlho(this.olhosHtml.pop());
    this._montarOlhosHtml();
    for (const c of ['play', 'voltar10', 'avancar10', 'aovivo']) $(`[data-c="${c}"]`, this.raiz).hidden = true;
    this._msg('Este filme usa o player do próprio site: toque no telão para dar play.', 5000);
  }
  // o olho direito segue o esquerdo (o esquerdo tem o som)
  _sincronizarOlhos() {
    const [a, b] = this.olhosHtml || []; if (!b || this.html?.tipo === 'iframe') return;
    try {
      if (a.m.paused !== b.m.paused) a.m.paused ? b.m.pause() : b.m.play();
      const d = a.m.currentTime - b.m.currentTime;
      if (Math.abs(d) > 0.35) b.m.currentTime = a.m.currentTime + (a.m.paused ? 0 : 0.15);
      if (!b.m.muted) b.m.muted = true;
    } catch { }
  }
  _htmlVisivel(o, cam) {   // o CSS 3D se desenha errado quando o telão fica atrás da câmera: esconde nesse caso
    const w = o.caixa.offsetWidth / 2, h = o.caixa.offsetHeight / 2, v = new THREE.Vector3();
    for (const [x, y] of [[-w, -h], [w, -h], [-w, h], [w, h]]) {
      v.set(x, y, 0).applyMatrix4(o.obj.matrixWorld).applyMatrix4(cam.matrixWorldInverse);
      if (v.z > -0.3) return false;
    }
    return true;
  }
  _renderHtml(i, cam, desloc) {
    const o = this.olhosHtml?.[i]; if (!o) return;
    const vis = this._htmlVisivel(o, cam);
    o.cont.style.visibility = vis ? 'visible' : 'hidden';
    o.cont.style.transform = aj.oculos ? `translateX(${desloc}px) scale(${aj.escala})` : '';
    if (vis) o.css.render(o.cena, cam);
  }

  _aplicarAjustes() {
    if (this.video) this.video.volume = aj.volume;
    const m0 = this.olhosHtml?.[0]?.m;
    if (m0) { if (m0 instanceof HTMLVideoElement) m0.volume = aj.volume; else try { m0.p?.setVolume(aj.volume * 100); } catch { } }
    // no player HTML a correção de lente fica em 0 para a sala e o telão continuarem alinhados
    if (this.matLente) { this.matLente.uniforms.k1.value = this.tipoTela === 'html' ? 0 : aj.distorcao; this.matLente.uniforms.escala.value = aj.escala; }
    if (this.telas && (this.video || this.olhosHtml)) {
      const ar = this._proporcao();
      const w = aj.tela, h = w / ar, y = Math.max(1.25 + h * 0.12, 0.6 + h / 2);   // borda de baixo acima das poltronas
      for (const m of this.telas) { m.scale.set(w, h, 1); m.position.set(0, y, -aj.dist); }
      this.moldura.scale.set(w + 0.4, h + 0.4, 1); this.moldura.position.set(0, y, -aj.dist - 0.02);
      this.sala.userData.luzTela.position.set(0, y, -aj.dist + 2);
      for (const o of this.olhosHtml || []) {
        const W = 1280, Hpx = Math.round(W / ar);
        o.caixa.style.height = Hpx + 'px';
        o.obj.position.set(0, y, -aj.dist + 0.01); o.obj.scale.setScalar(w / W); o.obj.updateMatrixWorld(true);
      }
    }
  }
  _proporcao() {
    if (this.tipoTela === 'html') { const m = this.olhosHtml?.[0]?.m; return m instanceof HTMLVideoElement && m.videoWidth ? m.videoWidth / m.videoHeight : 16 / 9; }
    const v = this.video; let ar = (v.videoWidth || 16) / (v.videoHeight || 9);
    if (this.formato?.estereo === 'lr') ar /= 2; if (this.formato?.estereo === 'tb') ar *= 2;
    return ar;
  }

  _tamanho() {
    if (!this.renderer || this.renderer.xr.isPresenting) return;
    const w = this.raiz.clientWidth, h = this.raiz.clientHeight;
    this.renderer.setSize(w, h, false);
    this.cabeca.aspect = w / h; this.cabeca.updateProjectionMatrix();
    const pr = this.renderer.getPixelRatio();
    this.rt.setSize(Math.round(w / 2 * pr), Math.round(h * pr));
    for (const o of [this.olhoE, this.olhoD]) { o.aspect = (w / 2) / h; o.updateProjectionMatrix(); }
    (this.olhosHtml || []).forEach((o, i) => {
      const ow = aj.oculos ? w / 2 : w; o.css.setSize(ow, h); o.cont.style.left = (aj.oculos ? i * w / 2 : 0) + 'px';
    });
  }

  _loop() {
    const r = this.renderer; if (!r) return;
    this._atualizarTempo();
    if (r.xr.isPresenting) { r.render(this.cena, this.cabeca); return; }
    // orientação: giroscópio (se houver) + arrasto
    const q = this.cabeca.quaternion;
    if (this.giro && this._ori) {
      quaternionDoSensor(q, this._ori.a, this._ori.b, this._ori.g, this._ori.o);
      this.rig.rotation.set(0, this._yaw, 0);
    } else {
      this.rig.rotation.set(0, 0, 0);
      _eul.set(this._pitch, this._yaw, 0, 'YXZ'); q.setFromEuler(_eul);
    }
    this.cabeca.updateMatrixWorld(true);
    if (!aj.oculos) { r.setScissorTest(false); r.setRenderTarget(null); r.render(this.cena, this.cabeca); this._renderHtml(0, this.cabeca, 0); return; }
    const W = this.raiz.clientWidth, H = this.raiz.clientHeight, meia = W / 2, ipd = 0.064;
    const olhos = [[this.olhoE, -1, 0], [this.olhoD, 1, meia]];
    for (const [olho, lado, x] of olhos) {
      olho.position.set(lado * ipd / 2, 0, 0).applyMatrix4(this.cabeca.matrixWorld);
      olho.quaternion.copy(this.cabeca.getWorldQuaternion(new THREE.Quaternion()));
      olho.updateMatrixWorld(true);
      r.setRenderTarget(this.rt); r.setScissorTest(false); r.clear(); r.render(this.cena, olho);
      r.setRenderTarget(null);
      const desloc = -lado * aj.sep;   // separação: aproxima/afasta as duas imagens do centro
      r.setScissorTest(true); r.setScissor(x, 0, meia, H);
      r.setViewport(x + desloc, 0, meia, H);
      if (lado === -1) r.clear();
      r.render(this.quadCena, this.quadCam);
      this._renderHtml(lado === -1 ? 0 : 1, olho, desloc);
    }
    r.setScissorTest(false); r.setViewport(0, 0, W, H);
  }

  // ------------------------------------------------------------ sensores e toque
  _ligarSensores() {
    this._yaw = 0; this._pitch = 0; this.giro = false;
    this._aoOrientar = (e) => {
      if (e.alpha == null && e.beta == null) return;
      const D = THREE.MathUtils.DEG2RAD;
      const o = (screen.orientation?.angle ?? window.orientation ?? 0) * D;
      this._ori = { a: (e.alpha || 0) * D, b: (e.beta || 0) * D, g: (e.gamma || 0) * D, o };
      if (!this.giro) { this.giro = true; this._centralizar(); }
    };
    addEventListener('deviceorientation', this._aoOrientar);
  }
  async _pedirPermissaoGiro() {
    if (typeof DeviceOrientationEvent?.requestPermission !== 'function' || this._permPedida) return;
    this._permPedida = true;
    try { const s = await DeviceOrientationEvent.requestPermission(); if (s !== 'granted') this._msg('Giroscópio negado: arraste para olhar em volta.'); } catch { }
  }
  _centralizar() {
    if (this.giro && this._ori) {   // gira o "mundo" para que a frente seja para onde o celular aponta agora
      const q = new THREE.Quaternion(); quaternionDoSensor(q, this._ori.a, this._ori.b, this._ori.g, this._ori.o);
      const e = new THREE.Euler().setFromQuaternion(q, 'YXZ'); this._yaw = -e.y;
    } else { this._yaw = 0; this._pitch = 0; }
  }
  _ligarToque() {
    const c = this.canvas; let ant = null;
    this._ptrDown = (e) => { ant = { x: e.clientX, y: e.clientY, t: Date.now(), mov: 0 }; this._pedirPermissaoGiro(); };
    this._ptrMove = (e) => {
      if (!ant) return;
      const dx = e.clientX - ant.x, dy = e.clientY - ant.y; ant.x = e.clientX; ant.y = e.clientY; ant.mov += Math.abs(dx) + Math.abs(dy);
      const k = (aj.oculos ? 2 : 1) * 0.005;
      this._yaw += dx * k; if (!this.giro) this._pitch = THREE.MathUtils.clamp(this._pitch + dy * k, -1.4, 1.4);
    };
    this._ptrUp = () => { if (ant && ant.mov < 10) this._mostrarControles(); ant = null; };
    c.addEventListener('pointerdown', this._ptrDown); addEventListener('pointermove', this._ptrMove); addEventListener('pointerup', this._ptrUp);
    this._tecla = (e) => {
      if (!this.ativo) return;
      if (e.key === ' ') { e.preventDefault(); this._comando('play'); }
      else if (e.key === 'ArrowLeft') this._comando('voltar10'); else if (e.key === 'ArrowRight') this._comando('avancar10');
      else if (e.key === 'Escape') this.sair();
    };
    addEventListener('keydown', this._tecla);
  }
  _ligarVideo() {
    const v = this.video;
    for (const ev of ['play', 'pause', 'ended']) v.addEventListener(ev, () => this._atualizarPlay());
    v.addEventListener('waiting', () => this._msg('Carregando…', 1500));
  }

  // ------------------------------------------------------------ comandos
  _comando(c) {
    const v = this.midia; this._mostrarControles();
    if (!v && ['play', 'voltar10', 'avancar10', 'aovivo'].includes(c)) return;
    if (c === 'play') { if (v.paused) { v.muted = false; Promise.resolve(v.play()).catch(() => { }); } else v.pause(); setTimeout(() => this._atualizarPlay(), 300); }
    else if (c === 'voltar10') v.currentTime = Math.max(0, v.currentTime - 10);
    else if (c === 'avancar10') v.currentTime = Math.min((duracaoDe(v) || 1e9) - 0.5, v.currentTime + 10);
    else if (c === 'estereo') {
      const ordem = ['mono', 'lr', 'tb']; aj.estereo = ordem[(ordem.indexOf(this.formato.estereo) + 1) % 3]; salvar();
      this.formato = { tipo: 'plano', estereo: aj.estereo }; this._criarTelas(); this._aplicarAjustes(); this._atualizarEstereo();
      this._msg({ mono: 'Filme 2D (normal)', lr: 'Filme 3D lado a lado', tb: 'Filme 3D em cima/embaixo' }[aj.estereo], 1500);
    }
    else if (c === 'aovivo') { try { v.currentTime = window.CineOnline.player.posicaoAlvo(); v.play(); this._msg('De volta ao ponto da sessão.'); } catch { } }
    else if (c === 'centro') { this._centralizar(); this._msg('Visão centralizada.', 1200); }
    else if (c === 'oculos') { aj.oculos = !aj.oculos; salvar(); if (this.tipoTela === 'html') this._montarOlhosHtml(); this._atualizarOculos(); if (aj.oculos) this._telaCheia(); }
    else if (c === 'xr') this._iniciarXR();
    else if (c === 'sair') this.sair();
  }
  _atualizarOculos() {
    $('[data-c="oculos"]', this.raiz).classList.toggle('ativo', aj.oculos);
    $('[data-divisor]', this.raiz).hidden = !aj.oculos;
    for (const el of this.raiz.querySelectorAll('[data-so-oculos]')) el.hidden = !aj.oculos;
    this._tamanho();
  }
  _atualizarPlay() { const b = $('[data-c="play"]', this.raiz), m = this.midia; if (b && m) b.textContent = m.paused ? '▶' : '⏸'; }
  _atualizarTempo() {
    const v = this.midia; if (!v || (this._tUlt && performance.now() - this._tUlt < 500)) return; this._tUlt = performance.now();
    const f = (s) => { s = Math.max(0, s | 0); const h = s / 3600 | 0, m = (s % 3600) / 60 | 0, ss = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(ss).padStart(2, '0'); };
    const d = duracaoDe(v);
    $('[data-tempo]', this.raiz).textContent = this.html?.tipo === 'iframe' ? '' : f(v.currentTime) + (d ? ' / ' + f(d) : '');
    this._atualizarPlay();
  }
  _mostrarControles() {
    const ctl = $('[data-ctl]', this.raiz); ctl.classList.remove('oculto');
    clearTimeout(this._tCtl); this._tCtl = setTimeout(() => { if (this.midia && !this.midia.paused) ctl.classList.add('oculto'); }, 4000);
  }
  _msg(t, ms = 3500) { const m = $('[data-msg]', this.raiz); m.hidden = false; m.textContent = t; clearTimeout(this._tMsg); this._tMsg = setTimeout(() => m.hidden = true, ms); }

  async _telaCheia() {
    try { if (!document.fullscreenElement) await this.raiz.requestFullscreen?.({ navigationUI: 'hide' }); } catch { }
    try { await screen.orientation?.lock?.('landscape'); } catch { }   // nem todo navegador deixa travar
  }

  async _iniciarXR() {
    try {
      const s = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor'] });
      this.renderer.xr.setReferenceSpaceType('local');
      await this.renderer.xr.setSession(s);
      s.addEventListener('select', () => this._comando('play'));   // toque/botão dos óculos = play/pausa
      s.addEventListener('end', () => { this._tamanho(); });
    } catch (e) { this._msg('Não foi possível abrir o WebXR: ' + (e.message || e)); }
  }

  // ------------------------------------------------------------ sair
  _limparVideo() {
    try { this.hls?.destroy(); } catch { } this.hls = null;
    try { this.dash?.reset(); } catch { } this.dash = null;
    if (this.video) { this.video.pause(); if (this.fonte?.local) URL.revokeObjectURL(this.fonte.url); this.video.removeAttribute('src'); this.video.load(); }
    this.video = null;
  }
  async sair() {
    const estava = this.ativo; this.ativo = false;
    try { await this.renderer?.xr.getSession()?.end(); } catch { }
    this.renderer?.setAnimationLoop(null);
    this._limparVideo();
    clearInterval(this._tSync);
    while (this.olhosHtml?.length) this._destruirOlho(this.olhosHtml.pop());
    this.olhosHtml = null; this.html = null; this._reservaIframe = null;
    if (this.cena) this.cena.traverse(o => { o.geometry?.dispose(); if (o.material) { o.material.map = null; o.material.dispose(); } });
    this.textura?.dispose(); this.textura = null; this.rt?.dispose(); this.matLente?.dispose();
    this.renderer?.dispose(); this.renderer?.forceContextLoss?.(); this.renderer = null;
    // o canvas perde o contexto: troca por um novo para a próxima entrada
    if (this.canvas) { const n = document.createElement('canvas'); n.dataset.canvas = ''; n.hidden = true; this.canvas.replaceWith(n); this.canvas = n; }
    removeEventListener('deviceorientation', this._aoOrientar); removeEventListener('resize', this._redimensionar);
    removeEventListener('pointermove', this._ptrMove); removeEventListener('pointerup', this._ptrUp); removeEventListener('keydown', this._tecla);
    try { if (document.fullscreenElement) await document.exitFullscreen(); } catch { }
    try { screen.orientation?.unlock?.(); } catch { }
    if (this.raiz) { this.raiz.hidden = true; $('[data-ctl]', this.raiz).hidden = true; $('[data-divisor]', this.raiz).hidden = true; }
    this.cena = null; this.sala = null; this.telas = null;
    if (estava) {   // devolve a sala 3D e o som do filme da sessão como estavam
      const C = window.CineOnline;
      try { C?.cinema?.renderer.setAnimationLoop(C.cinema._loop); } catch { }
      try { if (C?.player && !this._salaEstavaMuda) C.player.ativarSom(); } catch { }
      try { C?.player?.atualizar?.(); } catch { }
    }
  }
}

export const vr = new ExperienciaVR();
