// Criador observando uma sala ao vivo (aberto pelo painel: Câmeras das Salas → Assistir ao vivo).
// - Não aparece na sala: não marca presença no canal da sala nem no canal global.
// - Vê pela câmera de segurança do fundo da sala (ou visão livre), com o filme no mesmo ponto.
// - "Ouvir conversa": entra na voz da sala SÓ para ouvir (microfone nunca é pedido). Quem está na
//   conversa vê "👑 Criador ouvindo" na lista e recebe um aviso. É a única forma de ouvir a voz.
// Para desligar: remover a chamada iniciarObservador() em js/main.js.
import { gerenciadorVoz } from './voz.js';

export function iniciarObservacao({ sb, sala, eu, cinema, toast, esc }) {
  const barra = document.createElement('div');
  barra.className = 'obs-barra';
  barra.innerHTML = `
    <span class="obs-rec"><i aria-hidden="true"></i>Observando ao vivo · ninguém vê você</span>
    <button type="button" class="chip" id="obs-vista">🔭 Visão livre</button>
    <button type="button" class="chip" id="obs-ouvir" aria-pressed="false">🎧 Ouvir conversa</button>
    <span class="obs-voz" id="obs-voz" role="status" aria-live="polite"></span>
    <a class="chip" id="obs-sair" href="admin.html#cameras">✕ Sair</a>`;
  document.getElementById('tela-cinema').appendChild(barra);
  const $ = (s) => barra.querySelector(s);

  let livre = false;
  $('#obs-vista').onclick = () => {
    livre = !livre;
    if (livre) cinema.visaoGeral(true); else cinema.modoCamera();
    $('#obs-vista').textContent = livre ? '📹 Câmera da sala' : '🔭 Visão livre';
  };

  const gv = gerenciadorVoz({ sb, sala, eu: { ...eu, apelido: eu.apelido || 'Criador' }, aviso: (t) => toast(t), aoMudar: () => desenhar() });
  $('#obs-ouvir').onclick = async () => {
    if (gv.conectado) { gv.sair(); return desenhar(); }
    gv.ouvir = true;
    await gv.entrar();
    gv.t.anunciar({ mic: false, ouvinte: true });
    desenhar();
  };

  function desenhar() {
    const con = gv.conectado, b = $('#obs-ouvir');
    b.textContent = con ? '🎧 Ouvindo · parar' : '🎧 Ouvir conversa';
    b.setAttribute('aria-pressed', String(con));
    b.classList.toggle('ligado', con);
    const outros = gv.participantes.filter(p => !p.eu);
    const falando = outros.filter(p => gv.falando(p.pid)).map(p => esc(p.apelido || '?'));
    $('#obs-voz').innerHTML = !con ? '' : gv.estado !== 'conectado' ? 'conectando…'
      : outros.length ? `${outros.length} na conversa${falando.length ? ' · falando: ' + falando.join(', ') : ''}` : 'ninguém na conversa agora';
  }
  setInterval(() => gv.conectado && desenhar(), 700);   // atualiza "falando"
  desenhar();
  return gv;
}
