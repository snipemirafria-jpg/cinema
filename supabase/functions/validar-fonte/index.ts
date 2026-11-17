// Edge Function: valida um endereço de vídeo antes de cadastrar o filme.
// - só o OWNER pode chamar
// - só https, porta padrão, sem credenciais na URL
// - resolve o DNS e recusa IPs internos (proteção contra SSRF)
// - não segue redirecionamentos para outro host sem validar de novo
// - confere se o conteúdo é realmente vídeo/manifesto (não aceita página HTML)
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

function ipPrivado(ip: string): boolean {
  if (ip.includes(":")) {
    const l = ip.toLowerCase();
    return l === "::1" || l === "::" || l.startsWith("fc") || l.startsWith("fd") || l.startsWith("fe80") || l.startsWith("::ffff:");
  }
  const [a, b] = ip.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224 || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19));
}

async function hostSeguro(host: string): Promise<string | null> {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.startsWith("[")) return "Use um domínio, não um IP.";
  if (/(^localhost$)|\.(local|internal|lan|localdomain|intranet|corp|home)$/i.test(host)) return "Domínio interno não permitido.";
  const ips: string[] = [];
  for (const t of ["A", "AAAA"] as const) { try { ips.push(...await Deno.resolveDns(host, t)); } catch { /* sem registro */ } }
  if (!ips.length) return "Domínio não encontrado.";
  if (ips.some(ipPrivado)) return "O domínio aponta para um endereço interno.";
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: owner } = await sb.rpc("eh_owner");
    if (!owner) return json({ ok: false, motivo: "Sem permissão." }, 403);

    const { url, origem } = await req.json();
    let u: URL;
    try { u = new URL(url); } catch { return json({ ok: false, motivo: "Endereço inválido." }); }
    if (u.protocol !== "https:") return json({ ok: false, motivo: "Use um endereço https://" });
    if (u.username || u.password) return json({ ok: false, motivo: "Endereço com credenciais não é permitido." });
    if (u.port && u.port !== "443") return json({ ok: false, motivo: "Porta não permitida." });

    let atual = u;
    let resp: Response | null = null;
    for (let i = 0; i < 4; i++) {
      const prob = await hostSeguro(atual.hostname);
      if (prob) return json({ ok: false, motivo: prob });
      resp = await fetch(atual, { method: "GET", redirect: "manual", headers: { Range: "bytes=0-2047", Origin: "https://cine-online.app" }, signal: AbortSignal.timeout(8000) });
      if (resp.status >= 300 && resp.status < 400 && resp.headers.get("location")) {
        atual = new URL(resp.headers.get("location")!, atual);
        if (atual.protocol !== "https:") return json({ ok: false, motivo: "Redirecionamento para endereço inseguro." });
        await resp.body?.cancel();
        continue;
      }
      break;
    }
    if (!resp || !resp.ok) return json({ ok: false, motivo: `O servidor do vídeo respondeu ${resp?.status ?? "erro"}.` });
    const tipo = (resp.headers.get("content-type") || "").toLowerCase();
    const corpo = new Uint8Array(await resp.arrayBuffer()).slice(0, 2048);
    const texto = new TextDecoder().decode(corpo);
    if (tipo.includes("text/html") || /^\s*<!doctype html|^\s*<html/i.test(texto)) {
      return json({ ok: false, motivo: "Esse link é uma página, não um arquivo de vídeo." });
    }
    if (origem === "hls" && !texto.startsWith("#EXTM3U")) return json({ ok: false, motivo: "Não é um manifesto HLS válido (.m3u8)." });
    if (origem === "dash" && !/<MPD[\s>]/.test(texto)) return json({ ok: false, motivo: "Não é um manifesto MPEG-DASH válido (.mpd)." });
    if (origem === "mp4" && !(tipo.startsWith("video/") || tipo.includes("octet-stream") || texto.includes("ftyp") || corpo[0] === 0x1a)) {
      return json({ ok: false, motivo: "O endereço não parece ser um arquivo de vídeo." });
    }
    const cors = resp.headers.get("access-control-allow-origin");
    return json({ ok: true, tipo, aviso: cors ? null : "Atenção: o servidor não envia CORS; o vídeo pode não aparecer no telão 3D." });
  } catch (e) {
    return json({ ok: false, motivo: "Falha ao validar: " + (e as Error).message });
  }
});
