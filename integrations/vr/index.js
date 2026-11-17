// Módulo VR do CineOnline — independente. Acrescenta o botão "🥽 Entrar no VR" no menu lateral.
// O código pesado (vr.js) só é baixado quando a pessoa toca no botão.
// Para desligar: VR_ENABLED = false em integrations/vr/config.js (ou apague a linha <script> do index.html).
import { VR_ENABLED } from './config.js';

function iniciar() {
  if (!VR_ENABLED) return;
  const menu = document.getElementById('menu-lateral');
  if (!menu || document.getElementById('vr-botao')) return;
  const b = document.createElement('button');
  b.id = 'vr-botao'; b.type = 'button'; b.title = 'Entrar no VR';
  b.innerHTML = '🥽<span>VR</span>';
  b.addEventListener('click', async (e) => {
    e.stopPropagation();
    const { vr } = await import('./vr.js');
    vr.entrar();
  });
  const antes = menu.querySelector('[data-ir="painel"]') || menu.querySelector('[data-ir="sair"]');
  menu.insertBefore(b, antes);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
else iniciar();
