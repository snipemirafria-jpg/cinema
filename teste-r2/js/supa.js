import { createClient } from '../vendor/supabase.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const configurado = !SUPABASE_URL.includes('SEU-PROJETO');
export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
  realtime: { params: { eventsPerSecond: 10 } },
});

export const COLS_PERFIL = 'id, apelido, genero, avatar, papel, cadastro_completo, criado_em, ultimo_acesso';

export function urlPublica(bucket, path) {
  return sb.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

// identificador aleatório do aparelho (não é fingerprint: só um UUID salvo localmente)
export function idDispositivo() {
  let id = localStorage.getItem('cine_disp');
  if (!id) { id = crypto.randomUUID(); localStorage.setItem('cine_disp', id); }
  return id;
}

export function plataforma() {
  const ua = navigator.userAgent;
  const so = /Android/i.test(ua) ? 'Android' : /iPhone|iPad|iPod/i.test(ua) ? 'iOS' : /Mac/i.test(ua) ? 'macOS' : /Win/i.test(ua) ? 'Windows' : /Linux/i.test(ua) ? 'Linux' : 'Outro';
  const app = matchMedia('(display-mode: standalone)').matches ? 'app' : 'navegador';
  return `${so} · ${app}`;
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function toast(msg, tipo = 'info') {
  const el = document.createElement('div');
  el.className = 'toast ' + tipo; el.textContent = msg;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => el.classList.add('sai'), 3200);
  setTimeout(() => el.remove(), 3700);
}
