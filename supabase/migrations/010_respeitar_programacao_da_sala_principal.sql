-- 010: respeitar a programação escolhida pelo criador na sala principal.
-- Corrige 005, que descartava todos os vídeos YouTube e deixava a sessão vazia.
CREATE OR REPLACE FUNCTION public.agora_passando()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  e public.estado_cinema;
  itens record;
  v_ids uuid[]; v_dur int[]; v_n int; v_idx int; v_total bigint;
  v_elapsed double precision; v_inicio timestamptz;
  v_prox uuid; f public.filmes;
begin
  select * into e from public.estado_cinema where id = 1 for update;
  select array_agg(p.id order by p.posicao), array_agg(fi.duracao_seg order by p.posicao)
    into v_ids, v_dur
  from public.programacao p join public.filmes fi on fi.id = p.filme
  -- A sala principal exibe somente os filmes explicitamente adicionados pelo criador
  -- à fila, independentemente de virem de MP4, R2 ou do canal próprio no YouTube.
  where fi.status = 'pronto';
  v_n := coalesce(array_length(v_ids,1),0);
  if v_n = 0 then
    return jsonb_build_object('agora', now(), 'filme', null);
  end if;

  v_idx := array_position(v_ids, e.item_atual);
  if v_idx is null or e.iniciado_em is null then
    v_idx := 1; v_inicio := now();
  else
    v_inicio := e.iniciado_em;
  end if;

  if not e.pausado then
    v_elapsed := extract(epoch from now() - v_inicio);
    select sum(x) into v_total from unnest(v_dur) x;
    -- pula ciclos inteiros da fila de uma vez
    if v_elapsed > v_dur[v_idx] + v_total then
      v_inicio := v_inicio + make_interval(secs => floor((v_elapsed - v_dur[v_idx]) / v_total) * v_total);
      v_elapsed := extract(epoch from now() - v_inicio);
    end if;
    while v_elapsed >= v_dur[v_idx] loop
      v_inicio := v_inicio + make_interval(secs => v_dur[v_idx]);
      v_elapsed := v_elapsed - v_dur[v_idx];
      v_idx := (v_idx % v_n) + 1;
    end loop;
  end if;

  if e.item_atual is distinct from v_ids[v_idx] or e.iniciado_em is distinct from v_inicio then
    update public.estado_cinema set item_atual = v_ids[v_idx], iniciado_em = v_inicio, atualizado_em = now() where id = 1;
  end if;

  select fi.* into f from public.programacao p join public.filmes fi on fi.id = p.filme where p.id = v_ids[v_idx];
  v_prox := v_ids[(v_idx % v_n) + 1];

  return jsonb_build_object(
    'agora', now(),
    'item', v_ids[v_idx],
    'iniciado_em', v_inicio,
    'pausado', e.pausado,
    'posicao_seg', case when e.pausado then 0 else extract(epoch from now() - v_inicio) end,
    'filme', jsonb_build_object('id', f.id, 'titulo', f.titulo, 'descricao', f.descricao, 'capa_url', f.capa_url,
       'duracao_seg', f.duracao_seg, 'genero', f.genero, 'classificacao', f.classificacao, 'idioma', f.idioma,
       'legendas', f.legendas, 'origem', f.origem, 'fonte_url', f.fonte_url, 'arquivo_path', f.arquivo_path, 'hls_path', f.hls_path),
    'proximo_item', v_prox
  );
end $function$
;

-- Reinicia o item já selecionado no painel, pois a reprodução estava bloqueada.
update public.estado_cinema e
set iniciado_em = now(), pausado = false, atualizado_em = now()
where e.id = 1 and e.item_atual in (
  select p.id from public.programacao p
  join public.filmes f on f.id = p.filme
  where f.status = 'pronto'
);
