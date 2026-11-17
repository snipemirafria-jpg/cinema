/* NetMovies catalog module - standalone, no changes to existing CineOnline files required.
   Usage: <netmovies-catalog catalog="./catalogo-netmovies.json"></netmovies-catalog>
   Or set window.NETMOVIES_CATALOG_URL before loading this script. */
(() => {
  const TAG = 'netmovies-catalog';
  if (customElements.get(TAG)) return;
  const styles = `
    :host{display:block;color:var(--cine-text,#f5f5f5);font-family:inherit}
    .wrap{background:var(--cine-panel,#111318);border:1px solid var(--cine-border,#292d36);border-radius:16px;padding:18px}
    .head{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-bottom:14px}
    h2{font-size:1.35rem;margin:0}.sub{opacity:.7;font-size:.88rem;margin:5px 0 0}
    .filters{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0 18px}
    input,select{background:var(--cine-input,#20242c);color:inherit;border:1px solid var(--cine-border,#363b46);border-radius:9px;padding:10px;min-width:0}
    input{flex:1;min-width:180px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(155px,1fr));gap:14px}
    .card{overflow:hidden;border-radius:12px;background:var(--cine-card,#1b1f27);border:1px solid var(--cine-border,#303541)}
    .poster{width:100%;aspect-ratio:16/9;object-fit:cover;display:block;background:#252a33}.fallback{display:flex;align-items:center;justify-content:center;font-size:2rem;background:linear-gradient(135deg,#2a1838,#14070b)}
    .info{padding:10px}.title{font-weight:700;line-height:1.3;min-height:2.5em}.meta{opacity:.72;font-size:.78rem;margin:7px 0}
    .tags{font-size:.75rem;opacity:.8;min-height:2em}.watch{width:100%;margin-top:9px;padding:10px;border:0;border-radius:8px;background:var(--cine-accent,#6d55d9);color:white;font-weight:700;cursor:pointer}
    .empty{padding:24px;text-align:center;opacity:.7}.credit{font-size:.75rem;opacity:.65;margin:16px 0 0}
    dialog{width:min(900px,94vw);padding:0;border:1px solid #444;border-radius:14px;background:#08090c;color:white}
    dialog::backdrop{background:#000c}.player{aspect-ratio:16/9;background:#000}.player iframe{width:100%;height:100%;border:0}
    .modalhead{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;gap:10px}.modalhead button{background:#30343d;color:white;border:0;border-radius:8px;padding:8px 12px;cursor:pointer}
    @media(max-width:480px){.wrap{padding:12px}.grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.info{padding:8px}}
  `;
  class NetMoviesCatalog extends HTMLElement {
    constructor(){super();this.attachShadow({mode:'open'});this.items=[];this.dialog=null;}
    async connectedCallback(){
      this.shadowRoot.innerHTML=`<style>${styles}</style><section class="wrap"><div class="head"><div><h2>NetMovies — Filmes gratuitos</h2><p class="sub">Filmes publicados no canal oficial NetMovies</p></div><span class="count"></span></div><div class="filters"><input type="search" placeholder="Buscar filme..." aria-label="Buscar filme"><select aria-label="Filtrar gênero"><option value="">Todos os gêneros</option></select></div><div class="grid"></div><p class="credit">Fonte e créditos: <a href="https://www.youtube.com/@netmovies" target="_blank" rel="noopener">Canal oficial NetMovies</a>. Reprodução incorporada do YouTube. Disponibilidade e anúncios dependem do YouTube.</p></section><dialog><div class="modalhead"><strong></strong><button type="button" class="close">Fechar</button></div><div class="player"></div></dialog>`;
      this.dialog=this.shadowRoot.querySelector('dialog');
      this.shadowRoot.querySelector('.close').addEventListener('click',()=>this.closePlayer());
      this.dialog.addEventListener('click',e=>{if(e.target===this.dialog)this.closePlayer();});
      this.shadowRoot.querySelector('input').addEventListener('input',()=>this.render());
      this.shadowRoot.querySelector('select').addEventListener('change',()=>this.render());
      const url=this.getAttribute('catalog')||window.NETMOVIES_CATALOG_URL||'./catalogo-netmovies.json';
      try{const res=await fetch(url);if(!res.ok)throw new Error('HTTP '+res.status);const data=await res.json();this.items=Array.isArray(data)?data:(data.items||[]);}
      catch(err){this.shadowRoot.querySelector('.grid').innerHTML='<p class="empty">Não foi possível carregar o catálogo. Confira o caminho do arquivo JSON.</p>';console.error('[NetMovies]',err);return;}
      const genres=[...new Set(this.items.flatMap(x=>x.genres||[]))].sort();
      const select=this.shadowRoot.querySelector('select');genres.forEach(g=>{const o=document.createElement('option');o.value=g;o.textContent=g;select.append(o);});
      this.render();
    }
    render(){
      const q=this.shadowRoot.querySelector('input').value.trim().toLocaleLowerCase('pt-BR');
      const genre=this.shadowRoot.querySelector('select').value;
      const filtered=this.items.filter(x=>(!q||x.title.toLocaleLowerCase('pt-BR').includes(q))&&(!genre||(x.genres||[]).includes(genre)));
      this.shadowRoot.querySelector('.count').textContent=`${filtered.length} filmes`;
      const grid=this.shadowRoot.querySelector('.grid');grid.replaceChildren();
      if(!filtered.length){grid.innerHTML='<p class="empty">Nenhum filme encontrado.</p>';return;}
      filtered.forEach(item=>{
        const card=document.createElement('article');card.className='card';
        const img=document.createElement('img');img.className='poster';img.loading='lazy';img.alt=`Capa de ${item.title}`;img.src=item.poster;img.onerror=()=>{const f=document.createElement('div');f.className='poster fallback';f.textContent='🎬';img.replaceWith(f);};
        const info=document.createElement('div');info.className='info';
        const title=document.createElement('div');title.className='title';title.textContent=item.title;
        const meta=document.createElement('div');meta.className='meta';meta.textContent=item.duration||'Duração não informada';
        const tags=document.createElement('div');tags.className='tags';tags.textContent=(item.genres||[]).join(' · ');
        const btn=document.createElement('button');btn.className='watch';btn.textContent='▶ Assistir';btn.addEventListener('click',()=>this.openPlayer(item));
        info.append(title,meta,tags,btn);card.append(img,info);grid.append(card);
      });
    }
    openPlayer(item){
      // o app pode assumir (ex.: abrir a sala 3D do filme); se ninguém assumir, toca aqui mesmo
      const ev=new CustomEvent('netmovies-assistir',{detail:item,bubbles:true,composed:true,cancelable:true});
      if(!this.dispatchEvent(ev))return;
      this.shadowRoot.querySelector('dialog strong').textContent=item.title;
      const frame=document.createElement('iframe');frame.src=item.embedUrl;frame.title=`Reprodutor: ${item.title}`;frame.allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';frame.allowFullscreen=true;frame.referrerPolicy='strict-origin-when-cross-origin';
      const player=this.shadowRoot.querySelector('.player');player.replaceChildren(frame);
      if(typeof this.dialog.showModal==='function')this.dialog.showModal();else this.dialog.setAttribute('open','');
    }
    closePlayer(){this.shadowRoot.querySelector('.player').replaceChildren();this.dialog.close?.();this.dialog.removeAttribute('open');}
  }
  customElements.define(TAG,NetMoviesCatalog);
})();
