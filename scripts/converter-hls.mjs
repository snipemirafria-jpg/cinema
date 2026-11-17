// Converte os vídeos enviados por upload em HLS adaptativo (360p/720p/1080p).
// Roda no GitHub Actions (grátis em repositório público) a cada 15 minutos.
// Requer os segredos do repositório: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.
import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, createWriteStream, rmSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: jobs } = await sb.from('processamentos').select('id, filme, filmes(id, arquivo_path)').eq('status', 'pendente').limit(2);
for (const job of jobs || []) {
  const f = job.filmes;
  await sb.from('processamentos').update({ status: 'executando', atualizado_em: new Date() }).eq('id', job.id);
  await sb.from('filmes').update({ status: 'processando' }).eq('id', f.id);
  const pasta = `/tmp/${f.id}`; rmSync(pasta, { recursive: true, force: true }); mkdirSync(pasta, { recursive: true });
  try {
    const { data: url } = sb.storage.from('filmes').getPublicUrl(f.arquivo_path);
    const r = await fetch(url.publicUrl);
    await pipeline(Readable.fromWeb(r.body), createWriteStream(`${pasta}/original`));
    const variantes = [['360', '640', '800k'], ['720', '1280', '2800k'], ['1080', '1920', '5000k']];
    for (const [h, , br] of variantes) {
      mkdirSync(`${pasta}/${h}p`);
      execFileSync('ffmpeg', ['-y', '-i', `${pasta}/original`, '-vf', `scale=-2:${h}`, '-c:v', 'libx264', '-preset', 'veryfast', '-b:v', br,
        '-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-hls_time', '6', '-hls_playlist_type', 'vod',
        '-hls_segment_filename', `${pasta}/${h}p/seg_%04d.ts`, `${pasta}/${h}p/index.m3u8`], { stdio: 'inherit' });
    }
    const master = '#EXTM3U\n' + variantes.map(([h, w, br]) => `#EXT-X-STREAM-INF:BANDWIDTH=${parseInt(br) * 1000 + 128000},RESOLUTION=${w}x${h}\n${h}p/index.m3u8`).join('\n') + '\n';
    const base = `hls/${f.id}`;
    await sb.storage.from('filmes').upload(`${base}/master.m3u8`, new Blob([master]), { contentType: 'application/vnd.apple.mpegurl', upsert: true });
    for (const [h] of variantes) for (const arq of readdirSync(`${pasta}/${h}p`)) {
      const tipo = arq.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t';
      const { error } = await sb.storage.from('filmes').upload(`${base}/${h}p/${arq}`, readFileSync(`${pasta}/${h}p/${arq}`), { contentType: tipo, upsert: true });
      if (error) throw error;
    }
    await sb.from('filmes').update({ hls_path: `${base}/master.m3u8`, status: 'pronto' }).eq('id', f.id);
    await sb.from('processamentos').update({ status: 'concluido', atualizado_em: new Date() }).eq('id', job.id);
  } catch (e) {
    console.error(e);
    await sb.from('filmes').update({ status: 'pronto' }).eq('id', f.id);     // continua tocando o arquivo original
    await sb.from('processamentos').update({ status: 'erro', log: String(e).slice(0, 2000), atualizado_em: new Date() }).eq('id', job.id);
  }
}
