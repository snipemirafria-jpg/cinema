// Reconhece qualquer link de filme: YouTube, Google Drive, HLS, DASH, MP4 ou página qualquer.
export function idYouTube(u) {
  try {
    const url = new URL(u);
    const h = url.hostname.replace(/^www\.|^m\./, '');
    if (h === 'youtu.be') return url.pathname.slice(1).split('/')[0] || null;
    if (/youtube(-nocookie)?\.com$/.test(h)) {
      if (url.searchParams.get('v')) return url.searchParams.get('v');
      const m = url.pathname.match(/\/(embed|shorts|live|v)\/([\w-]{6,})/);
      return m ? m[2] : null;
    }
  } catch { }
  return null;
}

export function idArchive(u) {
  try {
    const url = new URL(u);
    if (!/(^|\.)archive\.org$/i.test(url.hostname)) return null;
    const m = url.pathname.match(/^\/(details|embed)\/([A-Za-z0-9_-]{3,120})/);
    return m ? m[2] : null;
  } catch { return null; }
}

export function idDrive(u) {
  try {
    const url = new URL(u);
    if (!/(^|\.)google\.com$/.test(url.hostname) || !/drive|docs/.test(url.hostname)) return null;
    const m = url.pathname.match(/\/d\/([\w-]{10,})/);
    return m ? m[1] : url.searchParams.get('id');
  } catch { }
  return null;
}

// tipo a partir do link colado pelo dono
export function detectarTipo(u) {
  u = (u || '').trim();
  if (idYouTube(u)) return 'youtube';
  if (idArchive(u)) return 'archive';
  if (idDrive(u)) return 'drive';
  if (/\.m3u8(\?|#|$)/i.test(u)) return 'hls';
  if (/\.mpd(\?|#|$)/i.test(u)) return 'dash';
  if (/\.(mp4|webm|m4v|mov|ogv)(\?|#|$)/i.test(u)) return 'mp4';
  return 'link';
}

export const NOME_TIPO = { archive: 'Internet Archive', youtube: 'YouTube', drive: 'Google Drive', hls: 'HLS', dash: 'DASH', mp4: 'Vídeo direto', link: 'Link', upload: 'Upload' };

export const urlDriveDireto = (id) => `https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=download&confirm=t`;
export const urlDrivePreview = (id) => `https://drive.google.com/file/d/${encodeURIComponent(id)}/preview`;
export const capaYouTube = (id) => `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`;
export const capaDrive = (id) => `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w800`;

// ---------------------------------------------------------------- YouTube
let apiYT = null;
export function carregarApiYouTube() {
  if (apiYT) return apiYT;
  apiYT = new Promise((ok) => {
    if (window.YT?.Player) return ok(window.YT);
    const ant = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { ant?.(); ok(window.YT); };
    const s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api'; document.head.appendChild(s);
  });
  return apiYT;
}

// Faz um player do YouTube se comportar como um <video> (currentTime, paused, play…)
export class MidiaYouTube {
  // O YouTube liga legendas automáticas quando o vídeo começa mudo; desliga sempre.
  semLegenda() {
    const tirar = () => { try { this.p.setOption('captions', 'track', {}); this.p.setOption('cc', 'track', {}); this.p.unloadModule('captions'); this.p.unloadModule('cc'); } catch { } };
    tirar(); [300, 1000, 2500, 5000].forEach(ms => setTimeout(tirar, ms));   // o YouTube religa a legenda logo depois de começar
  }
  constructor(id, inicio, eventos = {}) {
    this.id = id;
    this.el = document.createElement('div'); this.el.className = 'midia-yt';
    const alvo = document.createElement('div'); this.el.appendChild(alvo);
    this.pronto = false; this._mudo = true; this._estado = -1; this.eventos = eventos;
    carregarApiYouTube().then(YT => {
      if (this.encerrado) return;
      this.p = new YT.Player(alvo, {
        videoId: id, width: '100%', height: '100%',
        playerVars: { autoplay: 1, mute: 1, controls: 0, fs: 0, playsinline: 1, rel: 0, modestbranding: 1, disablekb: 1, iv_load_policy: 3, cc_load_policy: 0, cc_lang_pref: 'none', hl: 'pt', start: Math.floor(inicio || 0) },
        events: {
          onReady: () => { if (this.encerrado) return; this.pronto = true; this.muted = this._mudo; this.semLegenda(); this.p.playVideo(); this._vigiarAnuncio(); eventos.pronto?.(); },
          onStateChange: (e) => {
            if (this.encerrado) return;
            this._estado = e.data;
            if (e.data === 1) { this.semLegenda(); eventos.tocando?.(); }
            if (e.data === 2) eventos.pausa?.();
            if (e.data === 3) eventos.carregando?.();
            if (e.data === 0) eventos.fim?.();
          },
          onError: (e) => eventos.erro?.(e.data === 101 || e.data === 150 ? 'O dono deste vídeo não permite exibir fora do YouTube.' : 'Vídeo do YouTube indisponível.'),
        },
      });
    });
  }
  // Detecta anúncio: o YouTube diz "tocando" mas o tempo do filme fica parado (a API não avisa de anúncio).
  // Quando o tempo volta a andar normalmente, o anúncio acabou.
  _vigiarAnuncio() {
    this.anuncio = false; let ultimo = null, amostra = 0, parado = 0, andando = 0;
    this._vigia = setInterval(() => {
      if (!this.pronto || document.hidden) { ultimo = null; andando = parado = 0; return; }
      let t; try { t = this.p.getCurrentTime(); } catch { return; }
      const delta = ultimo == null ? null : t - ultimo; ultimo = t;
      const agora = performance.now();
      const intervalo = (agora - amostra) / 1000;
      amostra = agora;
      if (delta == null || intervalo > 2.5) return;
      if (!this.anuncio && (delta < -1 || delta > intervalo + 2)) this.eventos.salto?.();
      if (this._estado === 1 && Math.abs(delta) < 0.05) { parado++; andando = 0; }
      else if (delta > 0.5 && delta < 2.5) { andando++; parado = 0; }
      else { parado = 0; andando = 0; }
      if (!this.anuncio && parado >= 2) { this.anuncio = true; this.eventos.anuncio?.(true); }
      else if (this.anuncio && andando >= 2) { this.anuncio = false; this.eventos.anuncio?.(false); }
    }, 1000);
  }
  get readyState() { return this.pronto ? 4 : 0; }
  get currentTime() { return this.pronto ? this.p.getCurrentTime() : 0; }
  set currentTime(t) { if (this.pronto) this.p.seekTo(t, true); }
  get paused() { return !this.pronto || this._estado === 2 || this._estado === -1 || this._estado === 5; }
  get playbackRate() { return 1; }
  set playbackRate(_) { }
  get muted() { return this._mudo; }
  set muted(m) { this._mudo = m; if (this.pronto) m ? this.p.mute() : (this.p.unMute(), this.p.setVolume(this._vol ?? 100), this.semLegenda()); }
  set volume(v) { this._vol = Math.round(Math.min(1, Math.max(0, +v || 0)) * 100); if (this.pronto && !this._mudo) this.p.setVolume(this._vol); }
  play() { if (this.pronto) this.p.playVideo(); return Promise.resolve(); }
  pause() { if (this.pronto) this.p.pauseVideo(); }
  get carregando() { return this._estado === 3; }
  destruir() { this.encerrado = true; clearInterval(this._vigia); if (this.anuncio) this.eventos.anuncio?.(false); try { this.p?.destroy(); } catch { } this.el.remove(); }
}

// Página qualquer (sem controle de tempo): mostrada como está no telão.
export class MidiaIframe {
  constructor(url) {
    this.el = document.createElement('iframe');
    this.el.className = 'midia-iframe';
    this.el.src = url;
    this.el.allow = 'autoplay; fullscreen; encrypted-media; picture-in-picture';
    this.el.referrerPolicy = 'no-referrer';
    this.el.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation');
    this.semControle = true;
  }
  get readyState() { return 4; } get currentTime() { return 0; } set currentTime(_) { }
  get paused() { return false; } get playbackRate() { return 1; } set playbackRate(_) { }
  get muted() { return false; } set muted(_) { } set volume(_) { }
  play() { return Promise.resolve(); } pause() { }
  destruir() { this.el.remove(); }
}
