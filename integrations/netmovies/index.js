// Módulo de fornecedores de filmes gratuitos (NetMovies, Capivara Filmes...) — independente do resto da Sessão Juntos.
// Acrescenta um botão por fornecedor em Outras salas. "Assistir" abre a sala
// própria do filme (js/sala-filme.js); a sala principal e o Supabase continuam iguais.
// Para remover de vez: apague a linha <script ... integrations/netmovies/index.js> do sessao.html.
// Fornecedores: lista FORNECEDORES em ./config.js.
import { NETMOVIES_ENABLED, FORNECEDORES } from './config.js';

const BASE = new URL('./', import.meta.url);

async function iniciar() {
  const lista = document.getElementById('catalogos-salas');
  const status = document.getElementById('status-salas');
  if (!lista) return;

  const estilo = document.createElement('style');
  estilo.textContent = `
    .fornecedor-painel{position:fixed;inset:0;z-index:50;background:rgba(5,3,9,.92);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);overflow-y:auto;padding:calc(16px + env(safe-area-inset-top,0px)) 16px calc(16px + env(safe-area-inset-bottom,0px))}
    .fornecedor-painel[hidden]{display:none}
    .fornecedor-painel .nm-topo{max-width:1100px;margin:0 auto 10px;display:flex;justify-content:flex-end}
    .fornecedor-painel .nm-fechar{background:#30343d;color:#fff;border:0;border-radius:10px;padding:9px 14px;font:inherit;cursor:pointer}
    .fornecedor-painel netmovies-catalog{max-width:1100px;margin:0 auto;--cine-panel:#140d1c;--cine-card:#1d1428;--cine-input:#221830;--cine-border:rgba(255,255,255,.1);--cine-accent:#7c3aed}
  `;
  document.head.appendChild(estilo);

  for (const f of NETMOVIES_ENABLED ? FORNECEDORES : []) {
    // fornecedor sem nenhum filme ainda: não mostra o botão
    try { const d = await (await fetch(new URL(f.catalogo, BASE))).json(); if (!(d.items || d).length) continue; } catch { continue; }
    const painel = document.createElement('div');
    painel.className = 'fornecedor-painel';
    painel.id = f.id === 'netmovies' ? 'netmovies-painel' : `fornecedor-${f.id}-painel`;
    painel.hidden = true;
    painel.innerHTML = '<div class="nm-topo"><button type="button" class="nm-fechar">✕ Voltar para a sala</button></div>';
    const catalogo = document.createElement('netmovies-catalog');
    catalogo.setAttribute('catalog', new URL(f.catalogo, BASE).href);

    // "Assistir" abre a sala 3D própria do filme: quem abrir o mesmo filme entra junto com quem já está vendo
    catalogo.addEventListener('netmovies-assistir', (e) => {
      if (!document.getElementById('tela-cinema')) return;     // fora do app: usa o player do catálogo
      e.preventDefault();
      const url = new URL(location.href); url.search = ''; url.hash = '';
      url.searchParams.set('netmovies', e.detail.id);
      location.href = url.toString();
    });
    document.body.appendChild(painel);

    const fechar = () => { catalogo.closePlayer?.(); painel.hidden = true; };
    painel.querySelector('.nm-fechar').addEventListener('click', fechar);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !painel.hidden && !catalogo.dialog?.open) fechar(); });

    const botao = document.createElement('button');
    botao.id = f.id === 'netmovies' ? 'netmovies-botao' : `fornecedor-${f.id}-botao`;
    botao.type = 'button'; botao.title = `${f.nome} — Filmes gratuitos (com anúncios)`;
    botao.className = 'chip';
    botao.innerHTML = `${f.icone}<span>${f.nome}</span>`;
    botao.addEventListener('click', async e => {
      e.stopPropagation(); painel.hidden = false;
      try {
        await import('./netmovies-catalog.js');
        if (!catalogo.isConnected && !painel.hidden) painel.appendChild(catalogo);
      } catch { painel.hidden = true; botao.title = 'Falha ao abrir. Toque para tentar novamente.'; }
    });
    lista.appendChild(botao);
  }
  status.hidden = lista.childElementCount > 0;
  status.textContent = 'Nenhum catálogo de salas disponível no momento.';
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
else iniciar();
