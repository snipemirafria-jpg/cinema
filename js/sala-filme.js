// Salas por filme (NetMovies): cada filme do catálogo tem a sua própria sala 3D.
// Quem abre um filme entra na sala dele; se já tem gente assistindo, entra junto,
// no mesmo ponto do filme. A sala principal, a programação e o Supabase não mudam:
// a sala usa só um canal de tempo real (presença + chat ao vivo) com o nome do filme.
// Se ninguém estiver na sala, o próximo a entrar começa o filme do início.
import { sb } from './supa.js';
import { PlayerSincronizado } from './player.js';
import { NETMOVIES_ENABLED } from '../integrations/netmovies/config.js';

const CATALOGO = new URL('../integrations/netmovies/catalogo-netmovies.json', import.meta.url);

export async function prepararSalaFilme(id) {
  if (!NETMOVIES_ENABLED || !/^[a-z0-9-]{1,80}$/i.test(id || '')) return null;
  let it = null;
  try { it = (await (await fetch(CATALOGO)).json()).items.find(i => i.id === id); } catch { }
  if (!it) return null;
  const filme = {
    titulo: it.title, capa_url: it.poster, origem: 'link', fonte_url: it.watchUrl,
    duracao_seg: (it.durationMinutes || 120) * 60, genero: (it.genres || []).join(', '), item: 'netmovies-' + it.id,
  };
  return new SalaFilme(it.id, filme);
}

class SalaFilme {
  constructor(id, filme) {
    this.id = id; this.filme = filme;
    this.canal = 'netmovies-' + id;          // um canal de tempo real por filme
    this.inicio = null;                      // hora (relógio do servidor) em que a sessão desta sala começou
    this.decidido = false; this.player = null;
  }
  criarPlayer(video, eventos) { return this.player = new PlayerSalaFilme(video, this.filme, eventos); }
  presenca() { return this.inicio ? { sala: this.canal, inicio_sala: this.inicio } : { sala: this.canal }; }

  // chamado a cada sincronização de presença; devolve true quando o próprio estado precisa ser reenviado
  async aoSync(lista, meuId) {
    const p = this.player; if (!p) return false;
    await p.relogioPronto;
    const outros = lista.filter(x => x.id !== meuId && Number(x.inicio_sala) > 0).map(x => Number(x.inicio_sala));
    if (!this.decidido) {
      this.decidido = true; clearTimeout(this._espera);
      this._usar(outros.length ? Math.min(...outros) : p.agoraServidor());   // entra junto com quem já está assistindo
      return true;
    }
    // duas pessoas entraram ao mesmo tempo numa sala vazia: todos seguem a sessão mais antiga
    if (outros.length && Math.min(...outros) < this.inicio - 1500) { this._usar(Math.min(...outros)); return true; }
    return false;
  }
  // se a presença demorar, começa sozinho
  esperar(aoDecidir) {
    this._espera = setTimeout(async () => {
      if (this.decidido) return;
      await this.player.relogioPronto; this.decidido = true;
      this._usar(this.player.agoraServidor()); aoDecidir();
    }, 4000);
  }
  _usar(ms) { this.inicio = Math.round(ms); this.player.definirInicio(this.inicio); }
}

export class PlayerSalaFilme extends PlayerSincronizado {
  constructor(video, filme, eventos) {
    super(video, eventos);
    this.filme = filme; this.inicio = null; this.offset = 0;
    this.relogioPronto = this._relogio();
  }
  async _relogio() {   // acerta o relógio pelo servidor para todos verem o mesmo ponto
    try {
      const t0 = Date.now(); const { data } = await sb.rpc('agora_passando'); const t1 = Date.now();
      if (data?.agora) this.offset = new Date(data.agora).getTime() - (t0 + t1) / 2;
    } catch { }
  }
  agoraServidor() { return Date.now() + this.offset; }
  definirInicio(ms) { this.inicio = ms; this.atualizar(); }
  _duracao() {
    try { const d = this.m?.p?.getDuration?.(); if (d > 60) return d; } catch { }
    return this.filme.duracao_seg;
  }
  posicaoAlvo() {
    if (!this.inicio) return 0;
    const dur = this._duracao() + 3;                        // terminou: a sessão recomeça do início
    return (((this.agoraServidor() - this.inicio) / 1000) % dur + dur) % dur;
  }
  async atualizar() {
    if (!this.inicio) return;
    this.estado = { filme: { ...this.filme, duracao_seg: this._duracao() + 10 }, item: this.filme.item, iniciado_em: new Date(this.inicio).toISOString(), pausado: false };
    if (this.itemAtual !== this.filme.item) {
      this.itemAtual = this.filme.item;
      await this._carregar(this.estado.filme);
      this.aoMudarFilme?.(this.estado.filme, this.estado);
    }
    this._corrigir(true);
  }
  _corrigir(forcar = false) {
    super._corrigir(forcar);
    if (this.m?._estado === 0 && this.posicaoAlvo() < this._duracao() - 2) this.tocar();   // recomeço após o fim
  }
}
