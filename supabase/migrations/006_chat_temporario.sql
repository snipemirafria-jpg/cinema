-- Chat temporário: cada mensagem some 1 minuto depois de enviada.
-- A denúncia guarda uma cópia do texto, para o dono ainda ver o que foi dito.
alter table public.denuncias add column if not exists texto_mensagem text;

create or replace function public.tg_denuncia_copiar_texto() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.mensagem is not null and new.texto_mensagem is null then
    select texto into new.texto_mensagem from public.mensagens where id = new.mensagem;
  end if;
  return new;
end $$;
drop trigger if exists tg_denuncia_copiar_texto on public.denuncias;
create trigger tg_denuncia_copiar_texto before insert on public.denuncias
  for each row execute function public.tg_denuncia_copiar_texto();

create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'apagar-chat-1min';
select cron.schedule('apagar-chat-1min', '* * * * *',
  $$delete from public.mensagens where criado_em < now() - interval '1 minute'$$);
