// CineOnline VR — módulo independente (Cinema VR + Vídeos 360°).
// Cinema VR: usa a PRÓPRIA sala 3D (window.CineOnline.cinema): mesma cena, mesmo renderer,
// mesmo telão e o filme da sessão. O canvas da sala entra na tela do VR, a câmera vai para os
// olhos do personagem do usuário (na poltrona dele) e a cena é desenhada em tela dividida.
// Ao sair, o canvas volta para #tela-cinema e a sala continua de onde estava, sem recarregar.
// Vídeos 360°: esfera panorâmica com renderer próprio (não mexe na sala).
import * as THREE from 'three';
import { detectarTipo, idYouTube, idArchive, idDrive, urlDriveDireto, urlDrivePreview, MidiaYouTube, MidiaIframe } from '../../js/fontes.js';
import { CSS3DRenderer, CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';

// iPhone/iPad (o iPad recente se apresenta como Mac, mas tem tela de toque)
const IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const MOBILE = IOS || matchMedia('(pointer:coarse)').matches || innerWidth < 760;
const CHAVE = 'cineonline-vr-ajustes';
const PADRAO = { sep: 0, escala: 1, distorcao: 0.22, volume: 1, oculos: true };
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
  const info = { https: isSecureContext, webxr: false, orientacaoApi: 'DeviceOrientationEvent' in window, giroscopio: false, precisaPermissao: false, celular: MOBILE, ios: IOS };
  try { info.webxr = !!(navigator.xr && await navigator.xr.isSessionSupported('immersive-vr')); } catch { }
  info.precisaPermissao = typeof window.DeviceOrientationEvent?.requestPermission === 'function';
  // no iPhone/iPad nada chega antes da permissão; nos outros (Android, e Chrome que também tem requestPermission) testa direto
  if (info.orientacaoApi && (!info.precisaPermissao || !IOS)) info.giroscopio = await testarGiroscopio(1200);
  if (info.giroscopio) info.precisaPermissao = false;
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
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;

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
.vr-tela .vr-b[data-giro]{flex-basis:100%;background:linear-gradient(135deg,#0ea5e9,#6366f1)}
#vr-botao span{white-space:nowrap}
`;

const pegarPlayer = () => window.CineOnline?.player || null;
const pegarSala = () => window.CineOnline?.cinema || null;
// devolve um elemento ao lugar exato de onde saiu
function voltarAoLugar(el, lugar) {
  if (!el || !lugar?.pai) return;
  if (lugar.prox && lugar.prox.parentNode === lugar.pai) lugar.pai.insertBefore(el, lugar.prox);
  else lugar.pai.appendChild(el);
}

class ExperienciaVR {
  constructor() {
    this.raiz = null; this.info = null; this.ativo = false;
    this._permGiro = null; this._permEstado = null;   // a permissão do giroscópio (iPhone) é pedida uma vez só
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
          <button class="vr-b" data-giro hidden>📱 Ativar movimento VR<small>Libera o giroscópio: olhe em volta virando o celular</small></button>
          <button class="vr-b" data-ir="cinema">🎬 CINEMA VR<small>A sua sala, vista da sua poltrona</small></button>
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
        <label data-so-oculos title="Separação entre os olhos">👀<input type="range" min="-60" max="60" step="2" data-r="sep"></label>
        <label data-so-oculos title="Escala da imagem">🔍<input type="range" min="0.6" max="1.3" step="0.02" data-r="escala"></label>
        <label data-so-oculos title="Correção das lentes">◎<input type="range" min="0" max="0.5" step="0.02" data-r="distorcao"></label>
        <button data-c="oculos" title="Tela dividida (óculos)">🥽</button>
        <button data-c="giro" data-giro2 title="Liberar o giroscópio (iPhone/iPad)" hidden>📱 Ativar movimento VR</button>
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
    this._atualizarBotaoGiro();
    this.info = await verificarDispositivo();
    const i = this.info, chips = [];
    chips.push(i.webxr ? '✅ WebXR disponível' : '➖ Sem WebXR: modo tela dividida');
    chips.push(i.giroscopio || this._permEstado === 'granted' ? '✅ Giroscópio' : i.precisaPermissao ? '🔐 Giroscópio pede permissão' : '⚠️ Sem giroscópio');
    chips.push(i.https ? '🔒 HTTPS' : '⚠️ Sem HTTPS');
    $('[data-info]', this.raiz).innerHTML = chips.map(c => `<span>${c}</span>`).join('');
    const av = $('[data-aviso]', this.raiz);
    if (!i.https && (i.precisaPermissao || i.celular)) { av.hidden = false; av.textContent = '⚠️ Sem HTTPS o celular não libera o giroscópio. Abra o site pelo endereço https://. Você ainda pode arrastar o dedo para olhar em volta.'; }
    else if (!i.giroscopio && !i.precisaPermissao) { av.hidden = false; av.textContent = 'Este aparelho não enviou dados de giroscópio. Você ainda pode usar o VR: arraste o dedo na tela (ou o mouse) para olhar em volta.'; }
    else av.hidden = true;
    this._atualizarBotaoGiro();
  }

  _tela(nome) { for (const s of this.raiz.querySelectorAll('.vr-tela')) s.hidden = s.dataset.t !== nome; }

  // Tudo que precisa de toque válido (permissão do iOS) é chamado direto aqui, sem await antes.
  _clique(e) {
    const b = e.target.closest('button');
    if (!b) {
      if (this.ativo && !e.target.closest('.vr-controles, input, label')) { this._pedirPermissaoGiro(); this._mostrarControles(); }
      return;
    }
    if (b.hasAttribute('data-giro') || b.dataset.c === 'giro') { this._pedirPermissaoGiro(); this._mostrarControles(); return; }
    if (b.hasAttribute('data-sair')) return this.sair();
    if (b.hasAttribute('data-voltar')) return this._tela('inicio');
    if (b.dataset.ir) { this._pedirPermissaoGiro(); return this._escolherFonte(b.dataset.ir); }
    if (b.dataset.fonte) return this._fonte(b.dataset.fonte);
    if (b.dataset.c) return this._comando(b.dataset.c);
  }

  // ------------------------------------------------------------ giroscópio do iPhone/iPad
  // só pede quando o aparelho tem o pedido (iOS 13+) e ainda não chegou nenhum dado do giroscópio
  _precisaPermissao() { return typeof window.DeviceOrientationEvent?.requestPermission === 'function' && !this._giroVisto && !this.info?.giroscopio; }
  _pedirPermissaoGiro() {
    if (this._permGiro) return this._permGiro;
    if (!this._precisaPermissao()) return null;           // já pedida: o iOS só aceita uma vez por página
    let pedido;
    try { pedido = DeviceOrientationEvent.requestPermission(); }   // direto no toque (click), nunca no pointerdown
    catch (e) { pedido = Promise.reject(e); }
    try { if (typeof window.DeviceMotionEvent?.requestPermission === 'function') DeviceMotionEvent.requestPermission().catch(() => { }); } catch { }
    this._permGiro = Promise.resolve(pedido).then((s) => {
      this._permEstado = s;
      if (s === 'granted') this._msg('✅ Movimento liberado: vire o celular para olhar em volta.', 2500);
      else this._msg('Giroscópio negado. Para liberar: feche esta aba, abra o site de novo e toque em "Permitir" (ou Ajustes › Safari › Movimento e Orientação). Enquanto isso, arraste o dedo para olhar em volta.', 8000);
      this._atualizarBotaoGiro();
      return s;
    }, (e) => {
      this._permEstado = 'erro'; this._permGiro = null;   // erro (não foi um "não" da pessoa): deixa tentar de novo no próximo toque
      this._msg(isSecureContext ? 'Não foi possível liberar o giroscópio (' + (e?.message || e) + '). Toque em 📱 Ativar movimento VR.' : '⚠️ Sem HTTPS o iPhone não libera o giroscópio. Abra o site pelo endereço https://.', 6000);
      this._atualizarBotaoGiro();
      return 'erro';
    });
    return this._permGiro;
  }
  _atualizarBotaoGiro() {
    if (!this.raiz) return;
    const mostrar = this._precisaPermissao() && this._permEstado !== 'granted' && this._permEstado !== 'denied';
    $('[data-giro]', this.raiz).hidden = !mostrar;
    $('[data-giro2]', this.raiz).hidden = !mostrar;
  }

  _escolherFonte(modo) {
    this.modo = modo;
    this._tela('fonte');
    $('[data-titulo]', this.raiz).textContent = modo === 'cinema' ? '🎬 Cinema VR' : '🌐 Vídeos 360°';
    $('[data-explica]', this.raiz).textContent = modo === 'cinema'
      ? 'Você fica na sua poltrona, na mesma sala, com o mesmo telão e o mesmo filme. Pausar e avançar valem só para você.'
      : 'Use um vídeo gravado em 360° (equirretangular, proporção 2:1; ou 3D 360° em cima/embaixo). Filmes comuns não viram 360°.';
    const s = this._fonteSessao();
    const bs = $('[data-fonte="sessao"]', this.raiz);
    bs.disabled = !s.ok; $('[data-sessao-info]', this.raiz).textContent = s.ok ? s.titulo : s.motivo;
    $('[data-aviso2]', this.raiz).hidden = true;
    const semSala = modo === 'cinema' && !pegarSala();
    for (const el of this.raiz.querySelectorAll('[data-fonte]')) if (semSala) el.disabled = true; else if (el.dataset.fonte !== 'sessao') el.disabled = false;
    if (semSala) this._aviso2('O Cinema VR usa a sala de cinema: entre na sala e toque em 🥽 VR.');
  }

  _fonteSessao() {
    const p = pegarPlayer();
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
  // Cinema VR + filme da sessão: usa o próprio player da sala (nada é baixado de novo).
  // Cinema VR + outro vídeo: vídeo direto vira imagem do telão da sala; YouTube/Drive/páginas
  // viram um player HTML posto sobre o telão (um para cada olho na tela dividida).
  // Vídeos 360°: só vídeo direto, e só se o formato for 360° de verdade.
  async abrir(fonte) {
    this.fonte = fonte;
    if (this.modo === 'cinema' && fonte.sessao) {
      const p = pegarPlayer();
      this._salaEstavaMuda = p ? p.mutado : true;
      try { if (p?.mutado) p.ativarSom(); } catch { }   // ainda dentro do toque: o navegador deixa ligar o som
      this.formato = { tipo: 'plano', estereo: aj.estereo || 'mono' };
      return this._iniciarCena('sala');
    }
    this._aviso2('Carregando o vídeo…');
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
        } else this.formato = { tipo: 'plano', estereo: aj.estereo || 'mono' };
        if (fonte.sessao) { try { v.currentTime = pegarPlayer().posicaoAlvo(); } catch { } }
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

  // ------------------------------------------------------------ montagem da cena
  // tipoTela: 'sala' (filme da sessão no player da sala), 'textura' (vídeo próprio como imagem) ou 'html' (player de site)
  async _iniciarCena(tipoTela) {
    this.tipoTela = tipoTela;
    for (const s of this.raiz.querySelectorAll('.vr-tela')) s.hidden = true;
    this.ativo = true;
    const p = pegarPlayer();
    if (tipoTela !== 'sala') {   // vídeo próprio: o filme da sala fica mudo enquanto isso
      if (this._salaEstavaMuda === undefined) this._salaEstavaMuda = p ? p.mutado : true;
      try { p?.silenciar(); } catch { }
    }

    // câmeras: cabeça (sem óculos) e um olho de cada lado (tela dividida)
    const cab = this.cabeca = new THREE.PerspectiveCamera(this.modo === '360' ? 80 : 75, 1, 0.05, 200);
    const rig = this.rig = new THREE.Group(); rig.add(cab);
    cab.layers.enable(1);   // modo sem óculos: mostra o olho esquerdo dos filmes 3D
    this.olhoE = new THREE.PerspectiveCamera(90, 1, 0.05, 200); this.olhoE.layers.enable(1);
    this.olhoD = new THREE.PerspectiveCamera(90, 1, 0.05, 200); this.olhoD.layers.enable(2);

    if (tipoTela === 'textura') {
      const tex = this.textura = new THREE.VideoTexture(this.video);
      tex.colorSpace = THREE.SRGBColorSpace; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
    }
    if (this.modo === '360') this._criarCena360();
    else this._emprestarSala();
    const r = this.r;

    // pós-processamento dos óculos: cada olho vai para uma textura e passa pela correção da lente
    const meiaPrecisao = r.capabilities.isWebGL2 && (r.extensions.has('EXT_color_buffer_half_float') || r.extensions.has('EXT_color_buffer_float'));
    this.rt = new THREE.WebGLRenderTarget(16, 16, { samples: MOBILE ? 0 : 4, type: meiaPrecisao ? THREE.HalfFloatType : THREE.UnsignedByteType });
    this.matLente = new THREE.ShaderMaterial({ uniforms: { t: { value: this.rt.texture }, k1: { value: aj.distorcao }, escala: { value: aj.escala } }, vertexShader: VERT, fragmentShader: FRAG, depthTest: false });
    this.quadCena = new THREE.Scene(); this.quadCam = new THREE.Camera();
    this.quadCena.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.matLente));

    if (this.modo === 'cinema') this._configurarTela();
    this._aplicarAjustes();
    this._ligarSensores();
    this._ligarToque();
    if (tipoTela === 'textura') this._ligarVideo();
    this._tSync = setInterval(() => this._sincronizarOlhos(), 700);
    this._redimensionar = () => this._tamanho(); addEventListener('resize', this._redimensionar);
    this._tamanho();
    $('[data-ctl]', this.raiz).hidden = false;
    this._atualizarBotoes();
    this._atualizarBotaoGiro();
    this._mostrarControles();
    if (aj.oculos) await this._telaCheia();
    if (!this.ativo) return;
    this._atualizarOculos();
    r.setAnimationLoop((t, frame) => this._loop(t, frame));
    if (tipoTela === 'textura') {
      try { await this.video.play(); } catch { this.video.muted = true; try { await this.video.play(); this._msg('Toque em ▶ para ligar o som.'); } catch { this._msg('Toque em ▶ para começar.'); } }
    } else if (this._semControle()) this._msg('Este filme usa o player do próprio site: toque no telão para dar play.', 5000);
    this._atualizarPlay();
    if (!this.giro) this._msg(this._permEstado === 'granted' ? 'Vire o celular para olhar em volta (ou arraste o dedo).'
      : this._permEstado === 'denied' ? 'Giroscópio negado. Para liberar: feche esta aba, abra o site de novo e toque em "Permitir". Por enquanto, arraste o dedo para olhar em volta.'
      : this._precisaPermissao() ? 'Toque em 📱 Ativar movimento VR (ou na tela) para liberar o giroscópio, ou arraste para olhar em volta.'
      : 'Sem giroscópio: arraste o dedo para olhar em volta.');
  }

  // Vídeos 360°: renderer e cena próprios (a sala não é usada)
  _criarCena360() {
    this.emprestada = false;
    const c = this.canvas; c.hidden = false;
    const r = this.r = new THREE.WebGLRenderer({ canvas: c, antialias: !MOBILE, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(devicePixelRatio, MOBILE ? 1.5 : 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.xr.enabled = true;
    const cena = this.cenaVR = new THREE.Scene();
    cena.background = new THREE.Color(0x000000);
    cena.add(this.rig);
    for (const [ox, oy, sx, sy, camada] of partesEstereo(this.formato.estereo)) {
      const g = ajustarUV(new THREE.SphereGeometry(50, MOBILE ? 48 : 64, MOBILE ? 32 : 48), ox, oy, sx, sy);
      g.scale(-1, 1, 1);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: this.textura }));
      m.rotation.y = -Math.PI / 2;     // centro do vídeo fica à frente
      m.layers.set(camada); cena.add(m);
    }
    this.rig.position.set(0, 0, 0);
    this._yawBase = 0;
  }

  // Cinema VR: pega emprestados o canvas, o renderer e a cena da sala original
  _emprestarSala() {
    const cin = this.cin = pegarSala();
    this.emprestada = true;
    cin.renderer.setAnimationLoop(null);            // a sala para de se desenhar sozinha
    cin.controles.enabled = false;                  // os controles da sala não reagem ao toque no VR
    cin.interromperCamera?.();
    const css3d = cin.css3d.domElement;
    this._lugarCanvas = { pai: cin.canvas.parentNode, prox: cin.canvas.nextSibling };
    this._lugarCss3d = { pai: css3d.parentNode, prox: css3d.nextSibling };
    this.raiz.insertBefore(cin.canvas, this.canvas);
    this.raiz.insertBefore(css3d, $('[data-divisor]', this.raiz));
    css3d.classList.add('vr-css');
    this.canvas.hidden = true;
    this.r = cin.renderer;
    this.cenaVR = cin.cena;
    cin.cena.add(this.rig);
    this._yawBase = Math.PI;                         // a plateia olha para +Z (onde fica o telão)
    this._sentarNaPoltrona();
  }

  // câmera nos olhos do personagem do usuário, na poltrona dele (o próprio corpo fica escondido)
  _sentarNaPoltrona() {
    const cin = this.cin; if (!cin) return;
    const reg = cin.avatares.get(cin.meuId);
    if (reg?.wrap && reg.assento) {
      const p = reg.wrap.position;
      this.rig.position.set(p.x, reg.assento.pos.y + 1.22, p.z + 0.12);
      if (this._regEu !== reg) { this._regEu = reg; this._avatarVisivel = reg.wrap.visible; }
      reg.wrap.visible = false;
      this._naPoltrona = true;
    } else if (!this._naPoltrona) {
      this.rig.position.copy(cin.camera.position);   // personagem ainda carregando: fica onde a câmera da sala estava
    }
  }

  // o que aparece no telão da sala durante o VR
  _configurarTela() {
    const cin = this.cin, p = pegarPlayer();
    this._destruirOlhosHtml();
    this._limparTelasEstereo();
    if (this.tipoTela === 'sala') {
      this._chaveSessao = p?.m;
      if (p && p.modo !== 'textura' && cin.objTela) {
        // player de site da sessão: o olho esquerdo é o próprio player da sala; o direito, uma cópia muda e sincronizada
        this.html = this._htmlDaSessao();
        this.olhosHtml = [this._olhoDaSala()];
        this._montarOlhosHtml();
      } else { this.html = null; this._criarTelasEstereo(cin.texturaVideo); }
    } else if (this.tipoTela === 'textura') {
      this._mapaAntes ||= { map: cin.materialTela.map, cor: cin.materialTela.color.getHex() };
      cin.materialTela.map = this.textura; cin.materialTela.color.set('#ffffff'); cin.materialTela.needsUpdate = true;
      this._criarTelasEstereo(this.textura);
    } else {
      this.olhosHtml = [];
      this._montarOlhosHtml();
    }
    // o player de site da sala só aparece quando é ele o filme do VR
    const usaSala = this.olhosHtml?.[0]?.emprestado;
    cin.css3d.domElement.style.display = usaSala ? '' : 'none';
  }

  _olhoDaSala() {
    const cin = this.cin;
    return {
      emprestado: true, css: cin.css3d, cena: cin.cenaHtml, cont: cin.css3d.domElement,
      get obj() { return cin.objTela; }, get caixa() { return cin.objTela?.element; }, get m() { return pegarPlayer()?.m; },
    };
  }
  _htmlDaSessao() {
    const p = pegarPlayer(), m = p?.m; if (!m) return null;
    if (m === p.vLivre || m instanceof HTMLVideoElement) return { tipo: 'video-livre', url: m.currentSrc || m.src };
    if (m instanceof MidiaYouTube) { let id = null; try { id = m.p?.getVideoData?.().video_id; } catch { } return { tipo: 'youtube', url: id || idYouTube(p.fonteDe(p.estado.filme).url) }; }
    if (m.el?.tagName === 'IFRAME') return { tipo: 'iframe', url: m.el.src };
    return null;
  }

  // filmes 3D (lado a lado / em cima-embaixo): uma imagem por olho, por cima do telão da sala
  _criarTelasEstereo(tex) {
    this._limparTelasEstereo();
    const est = this.formato?.estereo || 'mono';
    if (est === 'mono' || !tex) return;
    const t = this.cin.tela, { width, height } = t.geometry.parameters;
    for (const [ox, oy, sx, sy, camada] of partesEstereo(est)) {
      const g = ajustarUV(new THREE.PlaneGeometry(width, height), ox, oy, sx, sy);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
      m.position.copy(t.position); m.position.z -= 0.01; m.rotation.copy(t.rotation);
      m.layers.set(camada); this.cin.cena.add(m); this.telas.push(m);
    }
  }
  _limparTelasEstereo() {
    for (const m of this.telas || []) { m.removeFromParent(); m.geometry.dispose(); m.material.dispose(); }
    this.telas = [];
  }
  _atualizarEstereo() {
    const b = $('[data-c="estereo"]', this.raiz); if (b) b.textContent = { mono: '2D', lr: '3D ⇆', tb: '3D ⇅' }[this.formato?.estereo || 'mono'];
  }

  get midia() {
    if (this.tipoTela === 'sala') return pegarPlayer()?.m;
    return this.tipoTela === 'html' ? this.olhosHtml?.[0]?.m : this.video;
  }
  _semControle() { return !!this.midia?.semControle || (this.tipoTela === 'html' && this.html?.tipo === 'iframe'); }
  _usaTextura() { return this.tipoTela === 'textura' || (this.tipoTela === 'sala' && !this.html); }

  _atualizarBotoes() {
    const xrb = $('[data-c="xr"]', this.raiz); xrb.hidden = !this.info?.webxr || !this._usaTextura();   // player HTML não aparece no WebXR
    for (const el of this.raiz.querySelectorAll('[data-so-textura]')) el.hidden = !this._usaTextura() || this.modo !== 'cinema';
    const semControle = this._semControle();
    for (const c of ['play', 'voltar10', 'avancar10', 'aovivo']) $(`[data-c="${c}"]`, this.raiz).hidden = semControle || (c === 'aovivo' && !this.fonte?.sessao);
    this._atualizarEstereo();
  }

  // a sessão trocou de filme (ou de player) enquanto o VR estava aberto
  _vigiarSessao() {
    if (this.tipoTela !== 'sala') return;
    const agora = performance.now(); if (agora - (this._tVigia || 0) < 1000) return; this._tVigia = agora;
    if (!this._naPoltrona) this._sentarNaPoltrona();
    const p = pegarPlayer();
    if (p && p.m !== this._chaveSessao) {
      p.controleLocal = false;
      this._configurarTela(); this._aplicarAjustes(); this._tamanho(); this._atualizarBotoes(); this._atualizarPlay();
    }
  }

  // players HTML (YouTube, Drive, vídeo sem CORS, páginas) sobre o telão
  _criarHtml(principal) {
    const { tipo, url } = this.html;
    const sessao = this.tipoTela === 'sala';
    const pos = this.fonte?.sessao ? (() => { try { return sessao ? pegarPlayer().m.currentTime : pegarPlayer().posicaoAlvo(); } catch { return 0; } })() : 0;
    let m, el;
    if (tipo === 'youtube') {
      m = new MidiaYouTube(url, pos, {
        erro: (t) => principal && this._msg('⚠️ ' + t, 6000),
        pronto: () => { if (principal) { m.muted = false; try { m.p.setVolume(aj.volume * 100); } catch { } } },
      });
      el = m.el;
    } else if (tipo === 'video-livre') {
      const v = m = el = document.createElement('video');
      v.className = 'midia-video';
      v.playsInline = true; v.setAttribute('webkit-playsinline', ''); v.preload = 'auto'; v.muted = !principal; v.volume = aj.volume; v.src = url;
      v.addEventListener('loadedmetadata', () => { if (pos) try { v.currentTime = pos; } catch { } }, { once: true });
      if (principal) v.addEventListener('error', () => this._trocarParaIframe(), { once: true });
      v.play().catch(() => { v.muted = true; v.play().catch(() => { }); });
    } else { m = new MidiaIframe(url); el = m.el; }
    // mesma caixa e mesmo lugar do player do telão da sala (Cinema.mostrarNaTela)
    const t = this.cin.tela, { width, height } = t.geometry.parameters;
    const W = 1280, H = Math.round(W * height / width);
    const caixa = document.createElement('div'); caixa.className = 'tela-html';
    caixa.style.width = W + 'px'; caixa.style.height = H + 'px'; caixa.appendChild(el);
    const obj = new CSS3DObject(caixa);
    obj.position.copy(t.position); obj.position.z -= 0.03; obj.rotation.copy(t.rotation); obj.scale.setScalar(width / W);
    obj.updateMatrixWorld(true);
    return { m, obj, caixa };
  }
  _montarOlhosHtml() {
    if (!this.html) return;
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
    if (!o || o.emprestado) return;    // o player da sala nunca é destruído pelo VR
    try { if (o.m instanceof HTMLVideoElement) { o.m.pause(); o.m.removeAttribute('src'); o.m.load(); } else o.m.destruir?.(); } catch { }
    o.cont.remove();
  }
  _destruirOlhosHtml() {
    while (this.olhosHtml?.length) this._destruirOlho(this.olhosHtml.pop());
    this.olhosHtml = null;
  }
  _trocarParaIframe() {
    if (!this._reservaIframe || !this.olhosHtml) return this._msg('⚠️ Este vídeo não abriu.', 5000);
    this.html = { tipo: 'iframe', url: this._reservaIframe }; this._reservaIframe = null;
    this._destruirOlhosHtml(); this.olhosHtml = [];
    this._montarOlhosHtml();
    this._atualizarBotoes();
    this._msg('Este filme usa o player do próprio site: toque no telão para dar play.', 5000);
  }
  // o olho direito segue o esquerdo (o esquerdo tem o som)
  _sincronizarOlhos() {
    const [a, b] = this.olhosHtml || []; if (!a || !b || this.html?.tipo === 'iframe') return;
    try {
      const am = a.m, bm = b.m; if (!am || !bm) return;
      if (am.paused !== bm.paused) am.paused ? bm.pause() : Promise.resolve(bm.play()).catch(() => { });
      const d = am.currentTime - bm.currentTime;
      if (Math.abs(d) > 0.35) bm.currentTime = am.currentTime + (am.paused ? 0 : 0.15);
      if (!bm.muted) bm.muted = true;
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
    if (!o.obj || !o.caixa) { o.cont.style.visibility = 'hidden'; return; }
    const vis = this._htmlVisivel(o, cam);
    o.cont.style.visibility = vis ? 'visible' : 'hidden';
    o.cont.style.transform = aj.oculos ? `translateX(${desloc}px) scale(${aj.escala})` : '';
    if (vis) o.css.render(o.cena, cam);
  }

  _aplicarAjustes() {
    if (this.video) this.video.volume = aj.volume;
    const m0 = this.midia;
    if (m0 && this.tipoTela !== 'textura') { if (m0 instanceof HTMLVideoElement) m0.volume = aj.volume; else try { m0.p?.setVolume(aj.volume * 100); } catch { } }
    // no player HTML a correção de lente fica em 0 para a sala e o telão continuarem alinhados
    if (this.matLente) { this.matLente.uniforms.k1.value = this.olhosHtml?.length ? 0 : aj.distorcao; this.matLente.uniforms.escala.value = aj.escala; }
  }

  _tamanho() {
    if (!this.r || this.r.xr.isPresenting || !this.ativo) return;
    const w = this.raiz.clientWidth, h = this.raiz.clientHeight; if (!w || !h) return;
    this.r.setSize(w, h, false);
    this.cabeca.aspect = w / h; this.cabeca.updateProjectionMatrix();
    const pr = this.r.getPixelRatio();
    this.rt.setSize(Math.round(w / 2 * pr), Math.round(h * pr));
    for (const o of [this.olhoE, this.olhoD]) { o.aspect = (w / 2) / h; o.updateProjectionMatrix(); }
    (this.olhosHtml || []).forEach((o, i) => {
      const ow = aj.oculos ? w / 2 : w; o.css.setSize(ow, h); o.cont.style.left = (aj.oculos ? i * w / 2 : 0) + 'px';
    });
  }

  _loop() {
    const r = this.r; if (!r || !this.ativo) return;
    if (this.emprestada) { this.cin.animar(); this._vigiarSessao(); }   // personagens e luz continuam animados
    this._atualizarTempo();
    if (r.xr.isPresenting) { r.render(this.cenaVR, this.cabeca); return; }
    // orientação: giroscópio (se houver) + arrasto, a partir da frente da poltrona (_yawBase)
    const q = this.cabeca.quaternion;
    if (this.giro && this._ori) {
      quaternionDoSensor(q, this._ori.a, this._ori.b, this._ori.g, this._ori.o);
      this.rig.rotation.set(0, this._yawBase + this._yaw, 0);
    } else {
      this.rig.rotation.set(0, this._yawBase, 0);
      _eul.set(this._pitch, this._yaw, 0, 'YXZ'); q.setFromEuler(_eul);
    }
    this.rig.updateMatrixWorld(true);
    const W = this.raiz.clientWidth, H = this.raiz.clientHeight;
    if (!aj.oculos) {
      r.setRenderTarget(null); r.setScissorTest(false); r.setViewport(0, 0, W, H);
      r.render(this.cenaVR, this.cabeca); this._renderHtml(0, this.cabeca, 0); return;
    }
    const meia = W / 2, ipd = 0.064;
    const olhos = [[this.olhoE, -1, 0], [this.olhoD, 1, meia]];
    for (const [olho, lado, x] of olhos) {
      olho.position.set(lado * ipd / 2, 0, 0).applyMatrix4(this.cabeca.matrixWorld);
      olho.quaternion.copy(this.cabeca.getWorldQuaternion(_qOlho));
      olho.updateMatrixWorld(true);
      r.setRenderTarget(this.rt); r.setScissorTest(false); r.clear(); r.render(this.cenaVR, olho);
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
    this._yaw = 0; this._pitch = 0; this.giro = false; this._ori = null;
    this._aoOrientar = (e) => {
      if (e.alpha == null && e.beta == null) return;
      const D = THREE.MathUtils.DEG2RAD;
      const o = (screen.orientation?.angle ?? window.orientation ?? 0) * D;
      this._ori = { a: (e.alpha || 0) * D, b: (e.beta || 0) * D, g: (e.gamma || 0) * D, o };
      if (!this.giro || this._recalibrar) { this.giro = true; this._recalibrar = false; this._centralizar(); }
      if (!this._giroVisto) { this._giroVisto = true; this._atualizarBotaoGiro(); }
    };
    addEventListener('deviceorientation', this._aoOrientar);
    // celular girado entre em pé e deitado: recalibra a frente
    this._aoGirarTela = () => { this._recalibrar = true; setTimeout(() => this._tamanho(), 250); };
    addEventListener('orientationchange', this._aoGirarTela);
    try { screen.orientation?.addEventListener?.('change', this._aoGirarTela); } catch { }
  }
  _centralizar() {
    if (this.giro && this._ori) {   // gira o "mundo" para que a frente (o telão) seja para onde o celular aponta agora
      const q = new THREE.Quaternion(); quaternionDoSensor(q, this._ori.a, this._ori.b, this._ori.g, this._ori.o);
      const e = new THREE.Euler().setFromQuaternion(q, 'YXZ'); this._yaw = -e.y;
    } else { this._yaw = 0; this._pitch = 0; }
  }
  _ligarToque() {
    let ant = null;
    this._ptrDown = (e) => {
      if (e.target.closest?.('.vr-controles, .vr-tela, .midia-iframe')) return;
      ant = { x: e.clientX, y: e.clientY, t: Date.now(), mov: 0 };
    };
    this._ptrMove = (e) => {
      if (!ant) return;
      const dx = e.clientX - ant.x, dy = e.clientY - ant.y; ant.x = e.clientX; ant.y = e.clientY; ant.mov += Math.abs(dx) + Math.abs(dy);
      const k = (aj.oculos ? 2 : 1) * 0.005;
      this._yaw += dx * k; if (!this.giro) this._pitch = THREE.MathUtils.clamp(this._pitch + dy * k, -1.4, 1.4);
    };
    this._ptrUp = () => { ant = null; };
    this.raiz.addEventListener('pointerdown', this._ptrDown); addEventListener('pointermove', this._ptrMove); addEventListener('pointerup', this._ptrUp);
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
  // No filme da sessão, pausar e avançar valem só para você (o player da sala para de corrigir);
  // "🔴 Ao vivo" volta ao ponto da sessão e devolve a sincronia.
  _controleLocal(sim) { if (this.tipoTela === 'sala') { const p = pegarPlayer(); if (p) p.controleLocal = sim; } }
  _comando(c) {
    const v = this.midia; this._mostrarControles();
    if (!v && ['play', 'voltar10', 'avancar10', 'aovivo'].includes(c)) return;
    if (c === 'play') { this._controleLocal(true); if (v.paused) { v.muted = false; Promise.resolve(v.play()).catch(() => { }); } else v.pause(); setTimeout(() => this._atualizarPlay(), 300); }
    else if (c === 'voltar10') { this._controleLocal(true); v.currentTime = Math.max(0, v.currentTime - 10); }
    else if (c === 'avancar10') { this._controleLocal(true); v.currentTime = Math.min((duracaoDe(v) || 1e9) - 0.5, v.currentTime + 10); }
    else if (c === 'estereo') {
      const ordem = ['mono', 'lr', 'tb']; aj.estereo = ordem[(ordem.indexOf(this.formato.estereo) + 1) % 3]; salvar();
      this.formato = { tipo: 'plano', estereo: aj.estereo };
      this._criarTelasEstereo(this.tipoTela === 'textura' ? this.textura : this.cin?.texturaVideo); this._atualizarEstereo();
      this._msg({ mono: 'Filme 2D (normal)', lr: 'Filme 3D lado a lado', tb: 'Filme 3D em cima/embaixo' }[aj.estereo], 1500);
    }
    else if (c === 'aovivo') {
      try {
        const p = pegarPlayer();
        v.currentTime = p.posicaoAlvo(); Promise.resolve(v.play()).catch(() => { });
        this._controleLocal(false);
        this._msg('De volta ao ponto da sessão.');
      } catch { }
    }
    else if (c === 'centro') { this._centralizar(); this._msg('Visão centralizada.', 1200); }
    else if (c === 'oculos') { aj.oculos = !aj.oculos; salvar(); if (this.html) this._montarOlhosHtml(); this._atualizarOculos(); if (aj.oculos) this._telaCheia(); }
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
    $('[data-tempo]', this.raiz).textContent = this._semControle() ? '' : f(v.currentTime) + (d ? ' / ' + f(d) : '');
    this._atualizarPlay();
  }
  _mostrarControles() {
    const ctl = $('[data-ctl]', this.raiz); if (!ctl) return; ctl.classList.remove('oculto');
    clearTimeout(this._tCtl); this._tCtl = setTimeout(() => { if (this.midia && !this.midia.paused) ctl.classList.add('oculto'); }, 4000);
  }
  _msg(t, ms = 3500) { if (!this.raiz) return; const m = $('[data-msg]', this.raiz); m.hidden = false; m.textContent = t; clearTimeout(this._tMsg); this._tMsg = setTimeout(() => m.hidden = true, ms); }

  async _telaCheia() {
    try { if (!document.fullscreenElement) await this.raiz.requestFullscreen?.({ navigationUI: 'hide' }); } catch { }
    try { await screen.orientation?.lock?.('landscape'); } catch { }   // nem todo navegador deixa travar
  }

  async _iniciarXR() {
    try {
      const s = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor'] });
      this.r.xr.enabled = true;
      this.r.xr.setReferenceSpaceType('local');
      await this.r.xr.setSession(s);
      s.addEventListener('select', () => this._comando('play'));   // toque/botão dos óculos = play/pausa
      s.addEventListener('end', () => { if (this.emprestada && this.r) this.r.xr.enabled = false; this._tamanho(); });
    } catch (e) { this._msg('Não foi possível abrir o WebXR: ' + (e.message || e)); }
  }

  // ------------------------------------------------------------ sair
  _limparVideo() {
    try { this.hls?.destroy(); } catch { } this.hls = null;
    try { this.dash?.reset(); } catch { } this.dash = null;
    if (this.video) { this.video.pause(); if (this.fonte?.local) URL.revokeObjectURL(this.fonte.url); this.video.removeAttribute('src'); this.video.load(); }
    this.video = null;
  }

  // devolve canvas, renderer, cena, telão, controles e o próprio personagem à sala original
  _devolverSala() {
    const cin = this.cin; if (!cin) return;
    const r = cin.renderer;
    r.setAnimationLoop(null);
    r.setRenderTarget(null); r.setScissorTest(false); r.xr.enabled = false;
    this.rig?.removeFromParent();
    this._limparTelasEstereo();
    if (this._mapaAntes) { cin.materialTela.map = this._mapaAntes.map; cin.materialTela.color.setHex(this._mapaAntes.cor); cin.materialTela.needsUpdate = true; this._mapaAntes = null; }
    if (this._regEu?.wrap) this._regEu.wrap.visible = this._avatarVisivel ?? true;
    this._regEu = null; this._naPoltrona = false;
    const css3d = cin.css3d.domElement;
    css3d.classList.remove('vr-css');
    for (const k of ['left', 'transform', 'visibility', 'display']) css3d.style[k] = '';
    voltarAoLugar(css3d, this._lugarCss3d);         // primeiro a camada do telão (o canvas volta antes dela)
    voltarAoLugar(cin.canvas, this._lugarCanvas);  // o canvas volta para #tela-cinema
    this._lugarCss3d = this._lugarCanvas = null;
    cin.controles.enabled = true;
    cin._redimensionar();
    cin.relogio.getDelta();
    r.setAnimationLoop(cin._loop);
    this.cin = null;
  }

  async sair() {
    const estava = this.ativo; this.ativo = false;
    try { await this.r?.xr.getSession()?.end(); } catch { }
    this.r?.setAnimationLoop(null);
    const tipoTela = this.tipoTela;
    this._limparVideo();
    clearInterval(this._tSync);
    this._destruirOlhosHtml();
    this.html = null; this._reservaIframe = null;
    removeEventListener('deviceorientation', this._aoOrientar); removeEventListener('resize', this._redimensionar);
    removeEventListener('orientationchange', this._aoGirarTela); try { screen.orientation?.removeEventListener?.('change', this._aoGirarTela); } catch { }
    this.raiz?.removeEventListener('pointerdown', this._ptrDown);
    removeEventListener('pointermove', this._ptrMove); removeEventListener('pointerup', this._ptrUp); removeEventListener('keydown', this._tecla);
    if (this.emprestada) this._devolverSala();
    else if (this.r) {   // 360°: renderer próprio é descartado
      if (this.cenaVR) this.cenaVR.traverse(o => { o.geometry?.dispose(); if (o.material) { o.material.map = null; o.material.dispose(); } });
      this.r.dispose(); this.r.forceContextLoss?.();
      // o canvas perde o contexto: troca por um novo para a próxima entrada
      if (this.canvas) { const n = document.createElement('canvas'); n.dataset.canvas = ''; n.hidden = true; this.canvas.replaceWith(n); this.canvas = n; }
    }
    this.textura?.dispose(); this.textura = null; this.rt?.dispose(); this.matLente?.dispose();
    this.r = null; this.cenaVR = null; this.rig = null; this.emprestada = false;
    try { if (document.fullscreenElement) await document.exitFullscreen(); } catch { }
    try { screen.orientation?.unlock?.(); } catch { }
    if (this.raiz) { this.raiz.hidden = true; $('[data-ctl]', this.raiz).hidden = true; $('[data-divisor]', this.raiz).hidden = true; for (const s of this.raiz.querySelectorAll('.vr-tela')) s.hidden = s.dataset.t !== 'inicio'; }
    if (estava) {   // devolve a sincronia e o som do filme da sessão
      const p = pegarPlayer();
      if (p) {
        p.controleLocal = false;
        try { if (tipoTela !== 'sala' && !this._salaEstavaMuda) p.ativarSom(); } catch { }
        try { p._corrigir?.(true); } catch { }
      }
    }
    this._salaEstavaMuda = undefined; this.tipoTela = null;
  }
}

const _qOlho = new THREE.Quaternion();
export const vr = new ExperienciaVR();
window.__vr = vr;   // usado pelos testes (tests/teste-vr-sala.html)
