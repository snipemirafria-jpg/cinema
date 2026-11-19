// Convites antigos e retornos de autenticação continuam chegando à sessão correta.
const url = new URL(location.href);
const sessao = new URL('sessao.html', url);
sessao.search = url.search;
sessao.hash = url.hash;
location.replace(sessao.href);
