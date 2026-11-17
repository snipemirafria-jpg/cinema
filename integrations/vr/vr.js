// CineOnline VR — módulo independente (Cinema VR + Vídeos 360°).
// Usa o Three.js que o projeto já tem (vendor/three). Não mexe no player, no Supabase,
// nos avatares nem na sala 3D: só lê o filme da sessão (window.CineOnline) e silencia
// a sala enquanto o VR está aberto. Ao sair, tudo volta como estava, sem recarregar.
import * as THREE from 'three';
import { detectarTipo } from '../../js/fontes.js';

const MOBILE = matchMedia('(pointer:coarse)').matches || innerWidth < 760;
const CHAVE = 'cineonline-vr-ajustes';
const PADRAO = { tela: 16, dist: 14, sep: 0, escala: 1, distorcao: 0.22, volume: 1, oculos: true };
const aj = Object.assign({}, PADRAO, JSON.parse(localStorage.getItem(CHAVE) || '{}'));
const salvar = () => localStorage.setItem(CHAVE, JSON.stringify(aj));
const $ = (s, r = document) => r.querySelector(s);

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
  const parede = new THREE.MeshStandardMaterial({ color: 0x1a0e14, roughness: 0.95 });
  const veludo = new THREE.MeshStandardMaterial({ color: 0x4a0d18, roughness: 0.8 });
  const chao = new THREE.Mesh(new THREE.PlaneGeometry(L, C), new THREE.MeshStandardMaterial({ color: 0x120a0e, roughness: 1 }));
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
  g.add(new THREE.AmbientLight(0x2a1a22, 0.6));
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
    if (!['mp4', 'hls'].includes(tipo)) {
      const nomes = { youtube: 'YouTube', archive: 'Internet Archive', drive: 'Google Drive', link: 'página externa', dash: 'DASH' };
      return { ok: false, motivo: `Filme do ${nomes[tipo] || tipo}: esse player não pode ser levado para o VR` };
    }
    return { ok: true, titulo: f.titulo, url, tipo, nome: f.titulo + ' ' + url, sessao: true };
  }

  _fonte(qual) {
    if (qual === 'arquivo') return $('[data-arquivo]', this.raiz).click();
    if (qual === 'link') {
      const url = $('[data-link]', this.raiz).value.trim();
      if (!/^https?:\/\//i.test(url)) return this._aviso2('Cole um link que comece com http:// ou https://');
      return this.abrir({ url, nome: url, tipo: /\.m3u8(\?|#|$)/i.test(url) ? 'hls' : 'mp4' });
    }
    if (qual === 'sessao') { const s = this._fonteSessao(); if (s.ok) this.abrir(s); }
  }

  _aviso2(t) { const a = $('[data-aviso2]', this.raiz); a.hidden = false; a.textContent = t; }

  // ------------------------------------------------------------ abrir vídeo
  async abrir(fonte) {
    this._aviso2('Carregando o vídeo…');
    const v = this.video = window.__vrv = document.createElement('video');
    v.crossOrigin = 'anonymous'; v.playsInline = true; v.setAttribute('webkit-playsinline', ''); v.preload = 'auto'; v.loop = false;
    v.volume = aj.volume;
    this.fonte = fonte;
    try {
      if (fonte.tipo === 'hls' && !v.canPlayType('application/vnd.apple.mpegurl')) {
        const H = (await import('../../vendor/hls.mjs')).default;
        if (!H.isSupported()) throw new Error('HLS não suportado');
        this.hls = new H({ maxBufferLength: 20, enableWorker: true }); this.hls.loadSource(fonte.url); this.hls.attachMedia(v);
        if (MOBILE) this.hls.on(H.Events.MANIFEST_PARSED, (_, d) => { let cap = -1; d.levels.forEach((l, i) => { if ((l.height || 0) <= 1080) cap = i; }); if (cap >= 0) this.hls.autoLevelCapping = cap; });
      } else v.src = fonte.url;
      await new Promise((ok, erro) => {
        const pronto = () => { if (v.videoWidth > 0) ok(); };
        v.addEventListener('loadedmetadata', pronto); v.addEventListener('loadeddata', pronto); v.addEventListener('resize', pronto);
        v.addEventListener('error', () => erro(new Error('O vídeo não abriu (link inválido ou o site não permite uso em 3D/CORS).')), { once: true });
        setTimeout(() => erro(new Error('O vídeo demorou demais para responder.')), 20000);
      });
    } catch (e) { this._limparVideo(); return this._aviso2('⚠️ ' + e.message); }

    const fmt = this.formato = identificarFormato(v.videoWidth, v.videoHeight, fonte.nome);
    if (this.modo === '360' && fmt.tipo !== '360') {
      const dims = `${v.videoWidth}×${v.videoHeight}`; this._limparVideo();
      return this._aviso2(`⚠️ Este vídeo não é 360° (${dims}). Vídeos 360° têm proporção 2:1 (ou 1:1 em 3D). Abra-o no Cinema VR.`);
    }
    if (this.modo === 'cinema' && fmt.tipo === '360') {
      this._msg('Este vídeo parece ser 360°: abrindo no modo 360°.'); this.modo = '360';
    }
    // posição: filme da sessão começa no mesmo ponto da sala
    if (fonte.sessao) { try { v.currentTime = window.CineOnline.player.posicaoAlvo(); } catch { } }
    await this._iniciarCena();
  }

  // ------------------------------------------------------------ renderização
  async _iniciarCena() {
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

    const tex = this.textura = new THREE.VideoTexture(this.video);
    tex.colorSpace = THREE.SRGBColorSpace; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;

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
      for (const [ox, oy, sx, sy, camada] of partesEstereo(this.formato.estereo)) {
        const g = ajustarUV(new THREE.PlaneGeometry(1, 1), ox, oy, sx, sy);
        const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
        m.layers.set(camada); cena.add(m); this.telas.push(m);
      }
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
    this._ligarVideo();
    this._redimensionar = () => this._tamanho(); addEventListener('resize', this._redimensionar);
    this._tamanho();
    const xrb = $('[data-c="xr"]', this.raiz); xrb.hidden = !this.info?.webxr;
    $('[data-c="aovivo"]', this.raiz).hidden = !this.fonte?.sessao;
    for (const el of this.raiz.querySelectorAll('[data-so-cinema]')) el.hidden = this.modo !== 'cinema';
    $('[data-ctl]', this.raiz).hidden = false;
    this._mostrarControles();
    if (aj.oculos) await this._telaCheia();
    this._atualizarOculos();
    r.setAnimationLoop((t, frame) => this._loop(t, frame));
    try { await this.video.play(); } catch { this.video.muted = true; try { await this.video.play(); this._msg('Toque em 🔊 para ligar o som.'); } catch { this._msg('Toque em ▶ para começar.'); } }
    this._atualizarPlay();
    if (!this.giro) this._msg(this.info?.precisaPermissao ? 'Toque na tela para liberar o giroscópio, ou arraste para olhar em volta.' : 'Sem giroscópio: arraste o dedo para olhar em volta.');
  }

  _aplicarAjustes() {
    if (this.video) this.video.volume = aj.volume;
    if (this.matLente) { this.matLente.uniforms.k1.value = aj.distorcao; this.matLente.uniforms.escala.value = aj.escala; }
    if (this.telas && this.video) {
      const ar = this._proporcao();
      const w = aj.tela, h = w / ar, y = Math.max(1.25 + h * 0.12, 0.6 + h / 2);   // borda de baixo acima das poltronas
      for (const m of this.telas) { m.scale.set(w, h, 1); m.position.set(0, y, -aj.dist); }
      this.moldura.scale.set(w + 0.4, h + 0.4, 1); this.moldura.position.set(0, y, -aj.dist - 0.02);
      this.sala.userData.luzTela.position.set(0, y, -aj.dist + 2);
    }
  }
  _proporcao() {
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
    if (!aj.oculos) { r.setScissorTest(false); r.setRenderTarget(null); r.render(this.cena, this.cabeca); return; }
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
    const v = this.video; this._mostrarControles();
    if (c === 'play') { if (v.paused) { v.muted = false; v.play().catch(() => { }); } else v.pause(); }
    else if (c === 'voltar10') v.currentTime = Math.max(0, v.currentTime - 10);
    else if (c === 'avancar10') v.currentTime = Math.min((v.duration || 1e9) - 0.5, v.currentTime + 10);
    else if (c === 'aovivo') { try { v.currentTime = window.CineOnline.player.posicaoAlvo(); v.play(); this._msg('De volta ao ponto da sessão.'); } catch { } }
    else if (c === 'centro') { this._centralizar(); this._msg('Visão centralizada.', 1200); }
    else if (c === 'oculos') { aj.oculos = !aj.oculos; salvar(); this._atualizarOculos(); if (aj.oculos) this._telaCheia(); }
    else if (c === 'xr') this._iniciarXR();
    else if (c === 'sair') this.sair();
  }
  _atualizarOculos() {
    $('[data-c="oculos"]', this.raiz).classList.toggle('ativo', aj.oculos);
    $('[data-divisor]', this.raiz).hidden = !aj.oculos;
    for (const el of this.raiz.querySelectorAll('[data-so-oculos]')) el.hidden = !aj.oculos;
    this._tamanho();
  }
  _atualizarPlay() { const b = $('[data-c="play"]', this.raiz); if (b && this.video) b.textContent = this.video.paused ? '▶' : '⏸'; }
  _atualizarTempo() {
    const v = this.video; if (!v || (this._tUlt && performance.now() - this._tUlt < 500)) return; this._tUlt = performance.now();
    const f = (s) => { s = Math.max(0, s | 0); const h = s / 3600 | 0, m = (s % 3600) / 60 | 0, ss = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(ss).padStart(2, '0'); };
    $('[data-tempo]', this.raiz).textContent = f(v.currentTime) + (isFinite(v.duration) ? ' / ' + f(v.duration) : '');
  }
  _mostrarControles() {
    const ctl = $('[data-ctl]', this.raiz); ctl.classList.remove('oculto');
    clearTimeout(this._tCtl); this._tCtl = setTimeout(() => { if (this.video && !this.video.paused) ctl.classList.add('oculto'); }, 4000);
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
    if (this.video) { this.video.pause(); if (this.fonte?.local) URL.revokeObjectURL(this.fonte.url); this.video.removeAttribute('src'); this.video.load(); }
    this.video = null;
  }
  async sair() {
    const estava = this.ativo; this.ativo = false;
    try { await this.renderer?.xr.getSession()?.end(); } catch { }
    this.renderer?.setAnimationLoop(null);
    this._limparVideo();
    if (this.cena) this.cena.traverse(o => { o.geometry?.dispose(); if (o.material) { o.material.map = null; o.material.dispose(); } });
    this.textura?.dispose(); this.rt?.dispose(); this.matLente?.dispose();
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
