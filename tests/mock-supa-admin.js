// Supabase simulado para abrir o painel do criador (admin.html) sem banco: tabelas e RPCs com dados de exemplo.
const agora = Date.now(), iso = (min) => new Date(agora + min * 60000).toISOString();
const TABELAS = {
  silenciamentos: [{ id: 's1', usuario: 'u2', tipo: 'voz', motivo: 'gritando', ate: iso(30), criado_em: iso(-5), alvo: { apelido: 'Bia' } }],
  banimentos: [{ id: 'b1', usuario: 'u3', tipo: 'expulsao', motivo: 'spam', ate: iso(8), criado_em: iso(-2), alvo: { apelido: 'Caio' } }],
  pedidos_ajuda: [{ id: 'p1', usuario: 'u4', sala: 'sala-principal', criado_em: iso(-1), status: 'pendente', perfis: { apelido: 'Duda', avatar: {} } }],
  auditoria: [{ criado_em: iso(-5), acao: 'MODERAR_SILENCIAR_VOZ', tabela: 'silenciamentos', registro: 's1', dados: { alvo: 'u2' } }],
  configuracoes: [{ id: 1, nome_cinema: 'Sessão Juntos', slogan: '', boas_vindas: '', chat_ativo: true, intervalo_chat_seg: 2, lotacao: 120, palavras_bloqueadas: [] }],
};
export const chamadas = window.__chamadas = [];
function consulta(t) {
  let dados = TABELAS[t] || [], unico = false;
  const q = new Proxy({}, { get(_, k) {
    if (k === 'then') return (ok, ruim) => Promise.resolve({ data: unico ? dados[0] ?? null : dados, error: null, count: dados.length }).then(ok, ruim);
    if (k === 'single' || k === 'maybeSingle') return () => { unico = true; return q; };
    return (...a) => { if (['update', 'insert', 'delete', 'upsert'].includes(k)) chamadas.push({ tabela: t, op: k, a }); return q; };
  } });
  return q;
}
const PRESENCA = {
  a: [{ id: 'u1', apelido: 'Ana', cor: '#e11d48', sala: 'sala-principal', titulo: 'Filme da sessão', capa: '', fonte: 'mp4', desde: 1 }],
  b: [{ id: 'u2', apelido: 'Bia', cor: '#2563eb', sala: 'sala-principal', desde: 2 }],
  c: [{ id: 'u3', apelido: 'Caio', cor: '#16a34a', sala: 'sala-terror', titulo: 'Terror', fonte: 'youtube', desde: 3 }],
};
export const sb = {
  auth: { getSession: async () => ({ data: { session: { user: { id: 'dono', email: 'dono@teste' } } } }), onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; } },
  from: consulta,
  rpc: async (fn, args) => { chamadas.push({ rpc: fn, args }); return { data: fn === 'eh_owner' ? true : fn === 'agora_passando' ? { filme: null } : [], error: null }; },
  channel(nome) {
    const ouv = [];
    const c = { on(t, f, cb) { ouv.push({ t, ev: f?.event, cb }); return c; },
      subscribe(cb) { setTimeout(() => { cb?.('SUBSCRIBED'); ouv.filter(o => o.t === 'presence').forEach(o => o.cb()); }, 50); return c; },
      presenceState: () => (nome.includes('global') ? PRESENCA : {}), track() {}, untrack() {}, send(m) { chamadas.push({ canal: nome, send: m }); } };
    return c;
  },
  removeChannel() {},
  storage: { from: () => ({ getPublicUrl: (p) => ({ data: { publicUrl: '/' + p } }), upload: async () => ({ error: null }) }) },
};
export const configurado = true;
export const COLS_PERFIL = 'id, apelido';
export function urlPublica(b, p) { return '/' + p; }
export function idDispositivo() { return 'teste'; }
export function plataforma() { return 'teste'; }
export function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
export function toast(msg, tipo = 'info') { const el = document.createElement('div'); el.className = 'toast ' + tipo; el.textContent = msg; document.getElementById('toasts')?.appendChild(el); (window.__toasts ||= []).push(msg); }
