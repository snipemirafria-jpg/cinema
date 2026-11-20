// Reserva os pedidos válidos antes de distribuir os lugares restantes.
export function distribuirAssentos(pessoas, total) {
  const ordem = [...pessoas].sort((a, b) => (a.desde || 0) - (b.desde || 0) || String(a.id).localeCompare(String(b.id)));
  const lugares = new Map();
  const ocupados = new Set();
  for (const p of ordem) {
    const i = p.assento;
    if (!Number.isInteger(i) || i < 0 || i >= total || ocupados.has(i)) continue;
    lugares.set(p.id, i);
    ocupados.add(i);
  }
  let livre = 0;
  for (const p of ordem) {
    if (lugares.has(p.id)) continue;
    while (ocupados.has(livre)) livre++;
    if (livre >= total) break;
    lugares.set(p.id, livre++);
  }
  return lugares;
}
