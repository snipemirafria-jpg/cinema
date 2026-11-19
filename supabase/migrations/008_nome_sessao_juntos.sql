-- Troca o nome exibido do cinema para "Sessão Juntos" (2026-11-18).
alter table configuracoes alter column nome_cinema set default 'Sessão Juntos';
alter table configuracoes alter column boas_vindas set default 'Bem-vindo à Sessão Juntos! Respeite todos na sala.';
update configuracoes set nome_cinema = 'Sessão Juntos' where nome_cinema in ('Cine Online','CineOnline');
update configuracoes set boas_vindas = replace(replace(boas_vindas,'Cine Online','Sessão Juntos'),'CineOnline','Sessão Juntos');
