// Player sincronizado: todos veem o mesmo ponto do filme (o servidor manda).
import { sb, urlPublica } from './supa.js';
import { detectarTipo, idYouTube, idDrive, idArchive, urlDriveDireto, urlDrivePreview, MidiaYouTube, MidiaIframe } from './fontes.js';

let Hls = null;
const LEVE = matchMedia('(pointer:coarse)').matches || innerWidth < 760;   // celular: corrige o sincronismo com mais folga (menos travadinhas)
async function carregarHls() { if (!Hls) Hls = (await import('../vendor/hls.mjs')).default; return Hls; }
function carregarDash() {
  if (window.dashjs) return Promise.resolve(window.dashjs);
  return new Promise((ok, erro) => {
    const s = document.createElement('script'); s.src = new URL('../vendor/dash.all.min.js', import.meta.url).href;
    s.onload = () => ok(window.dashjs); s.onerror = erro; document.head.appendChild(s);
  });
}

export class PlayerSincronizado {
  constructor(video, { aoMudarFilme, aoLegenda, aoEstado, aoModo } = {}) {
    this.v = video;            // <video crossorigin> cujo quadro vira textura do telão 3D
    this.m = video;            // mídia ativa (video, video livre, YouTube ou iframe)
    this.modo = 'textura';
    this.aoMudarFilme = aoMudarFilme; this.aoLegenda = aoLegenda; this.aoEstado = aoEstado; this.aoModo = aoModo;
    // <video> sem crossorigin: toca links sem CORS (Drive, sites comuns), mostrado como elemento no telão
    const vl = this.vLivre = document.createElement('video');
    vl.className = 'midia-video'; vl.playsInline = true; vl.setAttribute('webkit-playsinline', ''); vl.muted = true; vl.preload = 'auto';
    vl.addEventListener('playing', () => this.aoEstado?.('tocando'));
    vl.addEventListener('waiting', () => this.aoEstado?.('carregando'));
    vl.addEventListener('ended', () => setTimeout(() => this.atualizar(), 800));
    vl.addEventListener('error', () => this._falhaLivre?.());
    this.estado = null; this.offset = 0; this.itemAtual = null; this.hls = null; this.dash = null;
    this._tick = setInterval(() => this._corrigir(), 1500);
    this._poll = setInterval(() => this.atualizar(), 30000);
    video.addEventListener('ended', () => setTimeout(() => this.atualizar(), 800));
    video.addEventListener('error', () => { if (this.m === this.v && this._semCors) return this._semCors(); this.aoEstado?.('erro'); });
    video.addEventListener('playing', () => this.aoEstado?.('tocando'));
    video.addEventListener('waiting', () => this.aoEstado?.('carregando'));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.atualizar(); });
    this.canal = sb.channel('estado-cinema')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'estado_cinema' }, () => this.atualizar())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'programacao' }, () => this.atualizar())
      .subscribe();
  }

  async atualizar() {
    const t0 = Date.now();
    const { data, error } = await sb.rpc('agora_passando');
    if (error) { console.warn(error); return; }
    const t1 = Date.now();
    this.offset = new Date(data.agora).getTime() - (t0 + t1) / 2;   // relógio do servidor
    this.estado = data;
    if (!data.filme) { this._parar(); this.itemAtual = null; this.aoMudarFilme?.(null, data); return; }
    if (data.item !== this.itemAtual || data.iniciado_em !== this._iniciado) {
      const trocou = data.item !== this.itemAtual;
      this.itemAtual = data.item; this._iniciado = data.iniciado_em;
      if (trocou) { await this._carregar(data.filme); this.aoMudarFilme?.(data.filme, data); }
    }
    this._corrigir(true);
  }

  posicaoAlvo() {
    if (!this.estado?.filme) return 0;
    if (this.estado.pausado) return 0;
    const agora = Date.now() + this.offset;
    return Math.max(0, (agora - new Date(this.estado.iniciado_em).getTime()) / 1000);
  }

  fonteDe(f) {
    if (f.origem === 'upload') {
      if (f.hls_path) return { tipo: 'hls', url: urlPublica('filmes', f.hls_path) };
      return { tipo: 'mp4', url: urlPublica('filmes', f.arquivo_path) };
    }
    return { tipo: f.origem, url: f.fonte_url };
  }

  _parar() {
    this.hls?.destroy(); this.hls = null;
    this.dash?.reset(); this.dash = null;
    this.v.removeAttribute('src'); this.v.load();
    this.vLivre.removeAttribute('src'); this.vLivre.load();
    if (this.m !== this.v && this.m !== this.vLivre) this.m.destroy?.(), this.m.destruir?.();
    this._semCors = null; this._falhaLivre = null;
    this._usar('textura', this.v);
  }

  _usar(modo, midia) {
    const mudo = this.m?.muted ?? true;
    this.m = midia; this.modo = modo;
    try { midia.muted = mudo; } catch { }
    this.aoModo?.(modo, modo === 'textura' ? null : midia.el || midia);
  }

  get mutado() { return this.m.muted; }
  silenciar() { this.m.muted = true; }

  // toca um link sem CORS num <video> comum mostrado direto no telão
  _tocarLivre(url, reserva) {
    this._falhaLivre = reserva || (() => this.aoEstado?.('erro'));
    this.vLivre.src = url;
    this._usar('elemento', this.vLivre);
    this.vLivre.currentTime = this.posicaoAlvo();
    this.tocar();
  }

  async _carregar(f) {
    this._parar();
    let { tipo, url } = this.fonteDe(f);
    if (tipo === 'link') tipo = detectarTipo(url);
    const v = this.v;
    if (tipo === 'archive') {
      const id = idArchive(url);
      if (!id) { this.aoEstado?.('erro', 'Identificador do Internet Archive inválido.'); return; }
      // Player oficial incorporado. A posição não pode ser sincronizada com precisão pelo site.
      const embed = new URL(`https://archive.org/embed/${encodeURIComponent(id)}`);
      embed.searchParams.set('autoplay', '1');
      this._usar('iframe', new MidiaIframe(embed.toString()));
      return;
    }
    if (tipo === 'youtube') {
      const yt = new MidiaYouTube(idYouTube(url), this.posicaoAlvo(), {
        tocando: () => this.aoEstado?.('tocando'), carregando: () => this.aoEstado?.('carregando'),
        fim: () => setTimeout(() => this.atualizar(), 800), erro: (msg) => this.aoEstado?.('erro', msg),
        pronto: () => this._corrigir(true),
      });
      this._usar('youtube', yt);
      return;
    }
    if (tipo === 'drive') {
      const id = idDrive(url);
      // 1º: arquivo direto (sincroniza); se o Drive recusar, mostra o player do próprio Drive
      this._tocarLivre(urlDriveDireto(id), () => this._usar('iframe', new MidiaIframe(urlDrivePreview(id))));
      return;
    }
    if (tipo === 'link') { this._usar('iframe', new MidiaIframe(url)); return; }
    if (tipo === 'mp4') this._semCors = () => { this._semCors = null; v.removeAttribute('src'); this._tocarLivre(url); };
    [...v.querySelectorAll('track')].forEach(t => t.remove());
    if (tipo === 'hls') {
      // hls.js primeiro (MSE / ManagedMediaSource no iOS 17.1+): o quadro pode virar textura do telão 3D.
      // HLS nativo do iPhone toca o som mas deixa o telão preto no WebGL, então ele fica só de reserva.
      const H = await carregarHls();
      if (H.isSupported()) {
        const leve = matchMedia('(pointer:coarse)').matches || innerWidth < 760;
        v.disableRemotePlayback = true;      // exigido pelo ManagedMediaSource do iOS
        this.hls = new H({ maxBufferLength: leve ? 20 : 30, capLevelToPlayerSize: false, enableWorker: true });
        if (leve) this.hls.on(H.Events.MANIFEST_PARSED, (_, d) => {   // celular: no máximo 720p (o telão 3D não precisa de mais)
          let cap = -1; d.levels.forEach((l, i) => { if ((l.height || 0) <= 720) cap = i; });
          if (cap >= 0) this.hls.autoLevelCapping = cap;
        });
        this.hls.loadSource(url); this.hls.attachMedia(v);
      } else v.src = url;
    } else if (tipo === 'dash') {
      const d = await carregarDash();
      this.dash = d.MediaPlayer().create(); this.dash.initialize(v, url, false);
    } else {
      v.src = url;
    }
    // legendas (WebVTT)
    for (const [i, l] of (f.legendas || []).entries()) {
      const tr = document.createElement('track');
      tr.kind = 'subtitles'; tr.label = l.label || l.lang; tr.srclang = l.lang || 'pt'; tr.src = l.url;
      if (i === 0) tr.default = true;
      v.appendChild(tr);
    }
    setTimeout(() => {
      for (const tt of v.textTracks) {
        tt.mode = 'hidden';
        tt.oncuechange = () => this.aoLegenda?.([...(tt.activeCues || [])].map(c => c.text).join('\n'));
      }
    }, 500);
    v.currentTime = this.posicaoAlvo();
    this.tocar();
  }

  tocar() { return Promise.resolve(this.m.play()).catch(() => this.aoEstado?.('bloqueado')); }

  ativarSom() { this.m.muted = false; try { this.m.volume = 1; } catch { } return this.tocar(); }

  _corrigir(forcar = false) {
    const v = this.m;
    if (v.semControle) return;
    if (!this.estado?.filme || v.readyState < 1) return;
    if (this.estado.pausado) { if (!v.paused) v.pause(); return; }
    const alvo = this.posicaoAlvo();
    const dur = this.estado.filme.duracao_seg;
    if (alvo >= dur + 1) { this.atualizar(); return; }
    const dif = alvo - v.currentTime;
    if (Math.abs(dif) > (LEVE ? 6 : 3) || forcar && Math.abs(dif) > 1) { try { v.currentTime = alvo; } catch { } v.playbackRate = 1; }
    else if (Math.abs(dif) > (LEVE ? 1 : 0.4)) v.playbackRate = dif > 0 ? 1.05 : 0.95;
    else v.playbackRate = 1;
    if (v.paused && !document.hidden) this.tocar();
  }

  destruir() { clearInterval(this._tick); clearInterval(this._poll); this._parar(); sb.removeChannel(this.canal); }
}
