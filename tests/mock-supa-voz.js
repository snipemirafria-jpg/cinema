// Supabase simulado para testes de voz: presença e broadcast entre abas via BroadcastChannel.
export function criarSbFalso() {
  const canais = new Set();
  const sb = {
    channel(nome, opts = {}) {
      const key = opts.config?.presence?.key || crypto.randomUUID();
      const bc = new BroadcastChannel('mock-' + nome); const pres = {}; const ouvintes = []; let meu = null, fechado = false;
      const disparar = (tipo, ev, arg) => ouvintes.filter(o => o.tipo === tipo && (!o.ev || o.ev === ev)).forEach(o => o.cb(arg));
      bc.onmessage = ({ data: d }) => {
        if (fechado) return;
        if (d.k === 'track') { pres[d.key] = [d.payload]; disparar('presence', 'sync'); }
        else if (d.k === 'leave') { delete pres[d.key]; disparar('presence', 'sync'); }
        else if (d.k === 'ola') { if (meu) bc.postMessage({ k: 'track', key, payload: meu }); }
        else if (d.k === 'bc') disparar('broadcast', d.event, { payload: d.payload });
      };
      const c = {
        nome, on(tipo, f, cb) { ouvintes.push({ tipo, ev: f?.event, cb }); return c; },
        subscribe(cb) { setTimeout(() => { cb?.('SUBSCRIBED'); bc.postMessage({ k: 'ola' }); }, 30); return c; },
        track(p) { meu = p; pres[key] = [p]; bc.postMessage({ k: 'track', key, payload: p }); setTimeout(() => disparar('presence', 'sync'), 0); return Promise.resolve('ok'); },
        untrack() { meu = null; delete pres[key]; bc.postMessage({ k: 'leave', key }); return Promise.resolve('ok'); },
        presenceState() { return { ...pres }; },
        send(m) { bc.postMessage({ k: 'bc', event: m.event, payload: m.payload }); return Promise.resolve('ok'); },
        _fechar() { if (fechado) return; if (meu) bc.postMessage({ k: 'leave', key }); fechado = true; bc.close(); canais.delete(c); },
      };
      canais.add(c); return c;
    },
    removeChannel(c) { c?._fechar?.(); return Promise.resolve('ok'); },
    rpc: async (fn) => ({ data: fn === 'silenciados_ativos' ? (window.__silenciados || []) : null, error: null }),
    _canaisAbertos: () => canais.size,
  };
  return sb;
}
