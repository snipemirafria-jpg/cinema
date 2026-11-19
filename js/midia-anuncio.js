import { capaDrive, carregarDash, carregarHls, detectarTipo, idArchive, idDrive, idYouTube, urlDriveDireto } from './fontes.js';

export const POSICOES_ANUNCIOS = [
  'Esquerda 1', 'Esquerda 2', 'Esquerda 3',
  'Direita 1', 'Direita 2', 'Direita 3',
];

export function urlAnuncio(valor) {
  try {
    const url = new URL(valor);
    if (url.href.length <= 2048 && ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) return url;
  } catch { }
  return null;
}

function embedAnuncio(url, fonte) {
  if (fonte === 'youtube') {
    const id = idYouTube(url.href);
    return new URL(`https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&mute=1&loop=1&playlist=${encodeURIComponent(id)}&controls=0&playsinline=1`);
  }
  if (fonte === 'archive') return new URL(`https://archive.org/embed/${idArchive(url.href)}`);
  if (['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'].includes(url.hostname)) {
    const id = url.pathname.match(/^\/(?:video\/)?(\d+)\/?$/)?.[1];
    if (id) {
      const embed = new URL(`https://player.vimeo.com/video/${id}?autoplay=1&muted=1&loop=1&controls=0`);
      if (url.searchParams.has('h')) embed.searchParams.set('h', url.searchParams.get('h'));
      return embed;
    }
  }
  return url;
}

export function montarMidiaAnuncio(caixa, tipo, url) {
  let parar = () => {};
  let removido = false;
  const falha = () => {
    if (removido) return;
    parar();
    parar = () => {};
    caixa.textContent = 'Mídia indisponível';
  };
  const fonte = detectarTipo(url.href);
  const vimeo = /(^|\.)vimeo\.com$/.test(url.hostname);
  const drive = fonte === 'drive' ? idDrive(url.href) : null;
  const linkDrive = (link) => {
    const destino = new URL(link);
    const chave = url.searchParams.get('resourcekey');
    if (chave) destino.searchParams.set('resourcekey', chave);
    return destino.href;
  };
  function montarFoto() {
    const img = document.createElement('img');
    img.alt = '';
    img.referrerPolicy = 'no-referrer';
    img.onerror = drive ? () => {
      img.onerror = falha;
      img.src = linkDrive(capaDrive(drive));
    } : falha;
    caixa.replaceChildren(img);
    parar = () => { img.onerror = null; img.removeAttribute('src'); };
    img.src = drive ? linkDrive(urlDriveDireto(drive)) : url.href;
  }
  if (tipo === 'foto' || (tipo === 'auto' && /\.(avif|gif|jpe?g|png|svg|webp|bmp|ico)$/i.test(url.pathname))) {
    montarFoto();
  } else if (drive || (tipo !== 'pagina' && (['mp4', 'hls', 'dash'].includes(fonte) || (tipo === 'video' && fonte === 'link' && !vimeo)))) {
    const video = document.createElement('video');
    video.defaultMuted = video.muted = video.loop = video.autoplay = video.playsInline = true;
    video.disableRemotePlayback = true;
    video.onerror = drive && tipo !== 'video' ? () => {
      parar();
      montarFoto();
    } : falha;
    caixa.replaceChildren(video);
    let hls, dash;
    parar = () => {
      hls?.destroy();
      dash?.reset();
      video.onerror = null;
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
    if (fonte === 'hls' && !video.canPlayType('application/vnd.apple.mpegurl')) {
      carregarHls().then(Hls => {
        if (removido) return;
        if (!Hls.isSupported()) return falha();
        hls = new Hls({ capLevelToPlayerSize: true, maxBufferLength: 12 });
        hls.on(Hls.Events.ERROR, (_, erro) => { if (erro.fatal) falha(); });
        hls.attachMedia(video);
        hls.loadSource(url.href);
      }).catch(falha);
    } else if (fonte === 'dash') {
      carregarDash().then(lib => {
        if (removido) return;
        dash = lib.MediaPlayer().create();
        dash.updateSettings({ streaming: { abr: { limitBitrateByPortal: true } } });
        dash.initialize(video, url.href, true);
      }).catch(falha);
    } else {
      video.src = drive ? linkDrive(urlDriveDireto(drive)) : url.href;
    }
  } else {
    const iframe = document.createElement('iframe');
    const embed = embedAnuncio(url, fonte);
    iframe.title = 'Anúncio da sala';
    iframe.tabIndex = -1;
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    iframe.sandbox.add('allow-scripts');
    if (['https://www.youtube-nocookie.com', 'https://player.vimeo.com', 'https://archive.org'].includes(embed.origin) && embed.href !== url.href) {
      iframe.sandbox.add('allow-same-origin');
      if (embed.hostname === 'www.youtube-nocookie.com' || embed.hostname === 'player.vimeo.com') {
        iframe.allow = 'autoplay';
      }
    }
    caixa.replaceChildren(iframe);
    iframe.src = embed.href;
  }
  return () => { removido = true; parar(); caixa.replaceChildren(); };
}
