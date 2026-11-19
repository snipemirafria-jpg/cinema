// Convites antigos e retornos de autenticação continuam chegando à sessão correta.
const url = new URL(location.href);
const retorno = ['netmovies','observar','code','token_hash','error'].some(k => url.searchParams.has(k))
  || /(?:^#|&)(access_token|error|refresh_token)=/.test(url.hash);
if (retorno) {
  const sessao = new URL('sessao.html',url);
  sessao.search = url.search; sessao.hash = url.hash;
  location.replace(sessao.href);
} else {
  import('./recepcao.js').then(m => m.abrirRecepcao()).catch(e => console.warn('Recepção estática',e));
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}
