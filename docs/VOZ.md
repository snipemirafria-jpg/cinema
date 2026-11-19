# Conversa por voz por sala

## Como funciona hoje (conexão direta, P2P)
- `js/voz.js`: `GerenciadorVoz` (um por página) + `TransporteP2P`.
- O áudio vai **direto entre os aparelhos** (WebRTC, só áudio). O Supabase Realtime só faz a apresentação
  (presença e sinais de conexão) no canal `voz-<id da sala>`. Nenhum áudio passa pelo Supabase.
- Cada sala tem seu canal; quem está em outra sala não recebe nada. Ao trocar de sala, o canal anterior
  é fechado, as conexões e o microfone são liberados e só então o novo canal abre.
- Entra com o microfone desligado; o navegador só pede o microfone no toque em "Meu microfone".
- Mute do criador: lido de `silenciados_ativos()` (migração 007) e avisado pelo canal global.

## Limites da conexão direta
- **Até 8 pessoas por sala** (`MAX_PARTICIPANTES`). Em malha, cada pessoa envia o áudio para cada outra:
  com 8 pessoas são 7 envios por aparelho, o que pesa em celular e em 4G.
- Só servidores STUN públicos (Google). Em algumas redes 4G/corporativas (NAT simétrico) a conexão não
  fecha e aparece "sem conexão (rede)". Um servidor TURN resolve; ele tem custo de banda.
- O mute do criador é aplicado pelo app. Um app adulterado poderia continuar enviando áudio para os outros.
  Só um servidor de mídia (SFU) consegue travar isso no servidor.
- A sala precisa estar em HTTPS para o microfone funcionar.

## Como trocar para LiveKit (quando passar de 8 pessoas ou se o 4G falhar muito)
1. Criar um projeto no LiveKit Cloud (ou servidor próprio) e guardar `LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET`
   **só** nos segredos do Supabase (nunca no site).
2. Criar a Edge Function `voz-token`: valida o usuário logado, confere que não está banido nem silenciado
   (`silenciado(uid,'voz')`), e devolve um token curto (ex.: 10 min) para a sala `cine-room-<id da sala>`,
   com `canPublish = false` para quem estiver silenciado.
3. Criar `TransporteLiveKit` em `js/voz.js` com os mesmos métodos do `TransporteP2P`
   (`conectar`, `desconectar`, `anunciar`, `definirFaixa`, eventos `aoCanal`/`aoStream`/`aoSemStream`).
4. Trocar o transporte no `GerenciadorVoz` (opção `transporte`). A interface (`js/voz-ui.js`) não muda.
5. Para desligar a voz por completo: remover a chamada `iniciarVozUI` em `js/main.js` (`iniciarVozEModeracao`).

## Testes
- `tests/teste-voz.html` + `tests/mock-supa-voz.js`: duas ou mais abas com Supabase simulado e microfone falso.
