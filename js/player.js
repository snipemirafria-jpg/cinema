// Player sincronizado: todos veem o mesmo ponto do filme (o servidor manda).
import { sb, urlPublica } from './supa.js';

let Hls = null;
async function carregarHls() { if (!Hls) Hls = (await import('../vendor/hls.mjs')).default; return Hls; }
function carregarDash() {
  if (window.dashjs) return Promise.resolve(window.dashjs);
  return new Promise((ok, erro) => {
    const s = document.createElement('script'); s.src = new URL('../vendor/dash.all.min.js', import.meta.url).href;
    s.onload = () => ok(window.dashjs); s.onerror = erro; document.head.appendChild(s);
  });
}

export class PlayerSincronizado {
  constructor(video, { aoMudarFilme, aoLegenda, aoEstado } = {}) {
    this.v = video;
    this.aoMudarFilme = aoMudarFilme; this.aoLegenda = aoLegenda; this.aoEstado = aoEstado;
    this.estado = null; this.offset = 0; this.itemAtual = null; this.hls = null; this.dash = null;
    this._tick = setInterval(() => this._corrigir(), 1500);
    this._poll = setInterval(() => this.atualizar(), 30000);
    video.addEventListener('ended', () => setTimeout(() => this.atualizar(), 800));
    video.addEventListener('error', () => this.aoEstado?.('erro'));
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
  }

  async _carregar(f) {
    this._parar();
    const { tipo, url } = this.fonteDe(f);
    const v = this.v;
    [...v.querySelectorAll('track')].forEach(t => t.remove());
    if (tipo === 'hls') {
      if (v.canPlayType('application/vnd.apple.mpegurl')) v.src = url;         // Safari/iOS nativo
      else {
        const H = await carregarHls();
        if (H.isSupported()) { this.hls = new H({ maxBufferLength: 30, capLevelToPlayerSize: false }); this.hls.loadSource(url); this.hls.attachMedia(v); }
        else v.src = url;
      }
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

  tocar() { return this.v.play().catch(() => this.aoEstado?.('bloqueado')); }

  ativarSom() { this.v.muted = false; this.v.volume = 1; return this.tocar(); }

  _corrigir(forcar = false) {
    const v = this.v;
    if (!this.estado?.filme || v.readyState < 1) return;
    if (this.estado.pausado) { if (!v.paused) v.pause(); return; }
    const alvo = this.posicaoAlvo();
    const dur = this.estado.filme.duracao_seg;
    if (alvo >= dur + 1) { this.atualizar(); return; }
    const dif = alvo - v.currentTime;
    if (Math.abs(dif) > 3 || forcar && Math.abs(dif) > 1) { try { v.currentTime = alvo; } catch { } v.playbackRate = 1; }
    else if (Math.abs(dif) > 0.4) v.playbackRate = dif > 0 ? 1.05 : 0.95;
    else v.playbackRate = 1;
    if (v.paused && !document.hidden) this.tocar();
  }

  destruir() { clearInterval(this._tick); clearInterval(this._poll); this._parar(); sb.removeChannel(this.canal); }
}
