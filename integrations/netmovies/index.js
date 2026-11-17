// Módulo NetMovies — independente do resto do CineOnline.
// Só acrescenta um botão no menu lateral e um painel por cima da sala; não toca em
// Supabase, login, avatares, cinema 3D nem na sessão sincronizada.
// Para remover de vez: apague a linha <script ... integrations/netmovies/index.js> do index.html.
import { NETMOVIES_ENABLED } from './config.js';

const BASE = new URL('./', import.meta.url);

async function iniciar() {
  if (!NETMOVIES_ENABLED) return;
  const menu = document.getElementById('menu-lateral');
  if (!menu || document.getElementById('netmovies-botao')) return;
  await import('./netmovies-catalog.js');

  const estilo = document.createElement('style');
  estilo.textContent = `
    #netmovies-painel{position:fixed;inset:0;z-index:50;background:rgba(5,3,9,.92);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);overflow-y:auto;padding:calc(16px + env(safe-area-inset-top,0px)) 16px calc(16px + env(safe-area-inset-bottom,0px))}
    #netmovies-painel[hidden]{display:none}
    #netmovies-painel .nm-topo{max-width:1100px;margin:0 auto 10px;display:flex;justify-content:flex-end}
    #netmovies-painel .nm-fechar{background:#30343d;color:#fff;border:0;border-radius:10px;padding:9px 14px;font:inherit;cursor:pointer}
    #netmovies-painel netmovies-catalog{max-width:1100px;margin:0 auto;--cine-panel:#140d1c;--cine-card:#1d1428;--cine-input:#221830;--cine-border:rgba(255,255,255,.1);--cine-accent:#7c3aed}
  `;
  document.head.appendChild(estilo);

  const painel = document.createElement('div');
  painel.id = 'netmovies-painel'; painel.hidden = true;
  painel.innerHTML = '<div class="nm-topo"><button type="button" class="nm-fechar">✕ Voltar para a sala</button></div>';
  const catalogo = document.createElement('netmovies-catalog');
  catalogo.setAttribute('catalog', new URL('catalogo-netmovies.json', BASE).href);
  painel.appendChild(catalogo);
  document.body.appendChild(painel);

  const fechar = () => {
    catalogo.closePlayer?.();          // para o vídeo ao sair
    painel.hidden = true;
  };
  painel.querySelector('.nm-fechar').addEventListener('click', fechar);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !painel.hidden && !catalogo.dialog?.open) fechar(); });

  const botao = document.createElement('button');
  botao.id = 'netmovies-botao'; botao.type = 'button'; botao.title = 'NetMovies — Filmes gratuitos';
  botao.innerHTML = '🍿<span>NetMovies</span>';
  botao.addEventListener('click', (e) => { e.stopPropagation(); painel.hidden = false; });
  const antes = menu.querySelector('[data-ir="painel"]') || menu.querySelector('[data-ir="sair"]');
  menu.insertBefore(botao, antes);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
else iniciar();
