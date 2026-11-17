# 🎬 Cine Online

Cinema virtual 3D (Three.js) com login Google, chat em tempo real, programação contínua sincronizada pelo servidor e painel do criador. Backend: **Supabase** (PostgreSQL + Auth + Realtime + Storage). Frontend estático (PWA) publicado no **GitHub Pages** — funciona em Android, iOS e PC (dá para “Adicionar à tela inicial”).

## Estrutura
```
index.html            app dos espectadores (login, perfil, sala 3D)
admin.html            painel do criador (somente OWNER)
js/                   código (ES modules, sem build)
  config.js           URL e chave pública (anon) do Supabase
  cinema3d.js         sala 3D, telão, poltronas, avatares
  avatar.js           avatares 3D (corpo, cabelo, cores, pose sentada)
  player.js           player sincronizado (MP4, HLS, DASH, upload)
  main.js             fluxo do app, chat, presença
  admin.js            painel do criador
supabase/migrations/  esquema do banco + segurança (RLS) + auditoria
supabase/functions/   Edge Function validar-fonte (proteção SSRF)
scripts/              conversor HLS (roda no GitHub Actions)
assets/               modelos 3D (CC0), capas
vendor/               three.js, supabase-js, hls.js, dash.js (cópias locais)
```

## Como editar
É só HTML/CSS/JS — sem build. Edite pelo próprio GitHub (tecla `.` abre o editor) ou clone e rode um servidor local:
```
python3 -m http.server 8080
```
Abra http://localhost:8080. Cada push na branch `main` republica o site automaticamente (GitHub Actions → Pages).

## Supabase
- Projeto: `mbunkvouhdveruyezuof` (região São Paulo).
- O esquema completo está em `supabase/migrations/001_cine_online.sql` (pode rodar de novo no SQL Editor; é idempotente).
- Login Google: Authentication → Providers → Google (Client ID/Secret do Google Cloud). Em Authentication → URL Configuration, a Site URL e Redirect URLs devem incluir o endereço do GitHub Pages.
- O e-mail do OWNER fica em `privado.config` (chave `owner_email`). Só o primeiro login **Google verificado** com esse e-mail vira OWNER — nenhum usuário consegue se promover pelo navegador.

## Segurança (resumo)
- RLS em todas as tabelas; papel e identidade Google não podem ser alterados pelo usuário.
- Banimentos (temporário, permanente, suspensão preventiva) ligados ao **identificador da conta Google** (`sub`), não ao e-mail.
- Reincidência: um ID aleatório do aparelho (sem fingerprint invasivo) liga contas novas a contas banidas → suspensão preventiva para análise.
- Toda ação administrativa vai para a tabela `auditoria`.
- Endereços de vídeo validados no banco e na Edge Function (bloqueia IPs internos/SSRF e links de páginas que não são vídeo).

## Créditos e licenças
- Avatares: Quaternius — Universal Base Characters (CC0).
- Poltronas: Grab3D (CC0).
- Filmes de exemplo: Blender Foundation (CC BY 3.0) — Big Buck Bunny, Sintel, Tears of Steel.
