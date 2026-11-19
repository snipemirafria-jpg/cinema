// Botão "tela limpa": esconde todos os botões/painéis da sala e mostra de novo no segundo toque.
// Para desligar o recurso, remova a linha `import './tela-limpa.js'` em js/main.js.
const tela = document.getElementById('tela-cinema');
if (tela && !document.body.classList.contains('obs-mini')) {
  const b = document.createElement('button');
  b.type = 'button'; b.id = 'btn-tela-limpa';
  const atualizar = () => {
    const limpa = document.body.classList.contains('tela-limpa');
    b.textContent = limpa ? '👁' : '🙈';
    b.title = limpa ? 'Mostrar os botões (tecla H)' : 'Esconder os botões (tecla H)';
    b.setAttribute('aria-label', b.title);
    b.setAttribute('aria-pressed', String(limpa));
  };
  const alternar = () => { document.body.classList.toggle('tela-limpa'); atualizar(); };
  b.addEventListener('click', (e) => { e.stopPropagation(); alternar(); });
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'h' || e.key === 'H') && !e.ctrlKey && !e.metaKey && !e.altKey && !tela.hidden &&
        !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '') && !document.activeElement?.isContentEditable) alternar();
  });
  atualizar();
  tela.appendChild(b);
}
