// Texturas procedurais das salas temáticas (desenhadas em canvas: nada para baixar, leves no celular).
// Pisos e paredes são em tons de cinza: a cor vem do material, então a mesma textura serve para a transição de cores.
import * as THREE from 'three';

const cache = new Map();
function canvas(n) { const c = document.createElement('canvas'); c.width = c.height = n; return [c, c.getContext('2d')]; }
function aleatorio(semente) { let s = semente >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function paraTextura(cv, { repetir = true, cor = true } = {}) {
  const t = new THREE.CanvasTexture(cv);
  if (cor) t.colorSpace = THREE.SRGBColorSpace;
  if (repetir) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
function granulado(g, n, rnd, qtd, min, max, tam = 1) {
  for (let i = 0; i < qtd; i++) {
    const v = Math.floor(min + rnd() * (max - min));
    g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(rnd() * n, rnd() * n, tam, tam);
  }
}

// ---------------------------------------------------------------- superfícies (tons de cinza)
const SUPERFICIES = {
  // carpete de cinema com losangos discretos
  carpete(g, n, rnd) {
    g.fillStyle = '#c8c8c8'; g.fillRect(0, 0, n, n);
    granulado(g, n, rnd, n * n / 3, 150, 235);
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = n / 64;
    const p = n / 4;
    for (let i = -1; i < 5; i++) { g.beginPath(); g.moveTo(i * p, 0); g.lineTo(i * p + n, n); g.stroke(); g.beginPath(); g.moveTo(i * p + n, 0); g.lineTo(i * p, n); g.stroke(); }
  },
  // carpete gasto com manchas (terror)
  manchado(g, n, rnd) {
    g.fillStyle = '#b4b4b4'; g.fillRect(0, 0, n, n);
    granulado(g, n, rnd, n * n / 3, 120, 210);
    for (let i = 0; i < 9; i++) {
      const x = rnd() * n, y = rnd() * n, r = n * (0.05 + rnd() * 0.12);
      const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(40,40,40,.55)'); gr.addColorStop(1, 'rgba(40,40,40,0)');
      g.fillStyle = gr; g.fillRect(0, 0, n, n);
    }
  },
  // grade luminosa (ficção científica)
  grade(g, n, rnd) {
    g.fillStyle = '#7a7a7a'; g.fillRect(0, 0, n, n);
    granulado(g, n, rnd, n * n / 6, 100, 140);
    g.strokeStyle = '#f0f0f0'; g.lineWidth = n / 128;
    for (let i = 0; i <= 4; i++) { const p = i * n / 4; g.beginPath(); g.moveTo(p, 0); g.lineTo(p, n); g.moveTo(0, p); g.lineTo(n, p); g.stroke(); }
    g.fillStyle = '#ffffff'; for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) g.fillRect(i * n / 4 - n / 128, j * n / 4 - n / 128, n / 64, n / 64);
  },
  // chapa de aço antiderrapante (ação)
  chapa(g, n, rnd) {
    g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, n, n);
    granulado(g, n, rnd, n * n / 4, 120, 180);
    const p = n / 8;
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
      g.save(); g.translate(i * p + p / 2, j * p + p / 2); g.rotate((i + j) % 2 ? Math.PI / 4 : -Math.PI / 4);
      g.fillStyle = '#d6d6d6'; g.fillRect(-p * 0.32, -p * 0.07, p * 0.64, p * 0.14);
      g.fillStyle = '#5a5a5a'; g.fillRect(-p * 0.32, p * 0.05, p * 0.64, p * 0.04); g.restore();
    }
  },
  // assoalho de tábuas
  madeira(g, n, rnd) {
    const linhas = 8, h = n / linhas;
    for (let i = 0; i < linhas; i++) {
      const base = 150 + rnd() * 60; g.fillStyle = `rgb(${base},${base},${base})`; g.fillRect(0, i * h, n, h);
      g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 1;
      for (let k = 0; k < 7; k++) { g.beginPath(); const y = i * h + rnd() * h; g.moveTo(0, y); g.bezierCurveTo(n / 3, y + rnd() * 6 - 3, 2 * n / 3, y + rnd() * 6 - 3, n, y); g.stroke(); }
      g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(0, i * h, n, Math.max(1, n / 256));
      const corte = rnd() * n; g.fillRect(corte, i * h, Math.max(1, n / 256), h);
    }
  },
  // pedras (aventura/fantasia)
  pedra(g, n, rnd) {
    g.fillStyle = '#5a5a5a'; g.fillRect(0, 0, n, n);
    const f = 4, h = n / f;
    for (let j = 0; j < f; j++) for (let i = -1; i < f; i++) {
      const x = i * h + (j % 2) * h / 2, y = j * h, v = 140 + rnd() * 70;
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.beginPath(); g.roundRect ? g.roundRect(x + 3, y + 3, h - 6, h - 6, h / 8) : g.rect(x + 3, y + 3, h - 6, h - 6); g.fill();
    }
    granulado(g, n, rnd, n * n / 5, 90, 200);
  },
  // concreto
  concreto(g, n, rnd) {
    g.fillStyle = '#a0a0a0'; g.fillRect(0, 0, n, n);
    granulado(g, n, rnd, n * n / 2, 120, 190);
    for (let i = 0; i < 6; i++) { const x = rnd() * n, y = rnd() * n, r = n * (0.1 + rnd() * 0.2); const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(0,0,0,.15)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, n, n); }
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 2; g.strokeRect(0, 0, n, n);
  },
  // estrelinhas (animação)
  estrelas(g, n, rnd) {
    g.fillStyle = '#b0b0b0'; g.fillRect(0, 0, n, n);
    granulado(g, n, rnd, n * n / 6, 150, 200);
    for (let i = 0; i < 14; i++) estrela(g, rnd() * n, rnd() * n, n * (0.02 + rnd() * 0.03), '#ffffff');
  },
  // confete (comédia)
  confete(g, n, rnd) {
    g.fillStyle = '#b8b8b8'; g.fillRect(0, 0, n, n);
    granulado(g, n, rnd, n * n / 6, 160, 210);
    for (let i = 0; i < 70; i++) { const v = rnd() < 0.5 ? 255 : 90; g.fillStyle = `rgb(${v},${v},${v})`; g.save(); g.translate(rnd() * n, rnd() * n); g.rotate(rnd() * 6); g.fillRect(-n / 90, -n / 200, n / 45, n / 100); g.restore(); }
  },
  // floral discreto (romance)
  floral(g, n, rnd) {
    g.fillStyle = '#b0b0b0'; g.fillRect(0, 0, n, n);
    granulado(g, n, rnd, n * n / 3, 150, 200);
    g.strokeStyle = 'rgba(255,255,255,.4)'; g.lineWidth = n / 170;
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) arabesco(g, (i + 0.5) * n / 2, (j + 0.5) * n / 2, n / 5);
  },
  // tecido acústico
  tecido(g, n, rnd) {
    g.fillStyle = '#bdbdbd'; g.fillRect(0, 0, n, n);
    for (let y = 0; y < n; y += 2) { const v = 170 + rnd() * 40; g.fillStyle = `rgba(${v},${v},${v},.6)`; g.fillRect(0, y, n, 1); }
    for (let x = 0; x < n; x += 2) { const v = 150 + rnd() * 40; g.fillStyle = `rgba(${v},${v},${v},.35)`; g.fillRect(x, 0, 1, n); }
  },
  // damasco de veludo (romance/drama)
  damasco(g, n, rnd) {
    SUPERFICIES.tecido(g, n, rnd);
    g.fillStyle = 'rgba(255,255,255,.28)'; g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = n / 120;
    for (const [x, y] of [[n / 2, n / 2], [0, 0], [n, 0], [0, n], [n, n]]) arabesco(g, x, y, n / 3.2, true);
  },
  // metal escovado com rebites
  metal(g, n, rnd) {
    g.fillStyle = '#a8a8a8'; g.fillRect(0, 0, n, n);
    for (let y = 0; y < n; y++) { const v = 150 + rnd() * 50; g.fillStyle = `rgba(${v},${v},${v},.5)`; g.fillRect(0, y, n, 1); }
    g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(0, 0, n, n / 128); g.fillRect(0, 0, n / 128, n);
    for (const p of [0.06, 0.94]) for (let k = 0; k < 6; k++) {
      const x = p * n, y = (k + 0.5) * n / 6;
      const gr = g.createRadialGradient(x - 2, y - 2, 0, x, y, n / 60); gr.addColorStop(0, '#fff'); gr.addColorStop(1, '#555');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, n / 60, 0, 7); g.fill();
      g.beginPath(); g.arc(y, x, n / 60, 0, 7); g.fill();
    }
  },
  // circuitos (painéis de ficção científica; também vira mapa de brilho)
  circuito(g, n, rnd) {
    g.fillStyle = '#202020'; g.fillRect(0, 0, n, n);
    g.strokeStyle = '#ffffff'; g.lineWidth = n / 170; g.fillStyle = '#ffffff';
    for (let i = 0; i < 26; i++) {
      let x = Math.round(rnd() * 8) * n / 8, y = Math.round(rnd() * 8) * n / 8;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 3; k++) { if (rnd() < 0.5) x += (rnd() < 0.5 ? -1 : 1) * n / 8; else y += (rnd() < 0.5 ? -1 : 1) * n / 8; g.lineTo(x, y); }
      g.stroke(); g.beginPath(); g.arc(x, y, n / 80, 0, 7); g.fill();
    }
  },
  // listras de circo (comédia)
  listras(g, n) {
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#ffffff' : '#9a9a9a'; g.fillRect(i * n / 8, 0, n / 8, n); }
  },
  // camuflagem
  camuflagem(g, n, rnd) {
    g.fillStyle = '#a5a5a5'; g.fillRect(0, 0, n, n);
    for (const v of [80, 130, 190]) for (let i = 0; i < 10; i++) {
      g.fillStyle = `rgb(${v},${v},${v})`; g.beginPath();
      const x = rnd() * n, y = rnd() * n; const r = n * (0.05 + rnd() * 0.08);
      for (let a = 0; a < 7; a += 0.7) { const rr = r * (0.6 + rnd() * 0.6); g.lineTo(x + Math.cos(a) * rr * 1.6, y + Math.sin(a) * rr); }
      g.fill();
    }
  },
  // ripas de madeira (documentário)
  ripas(g, n, rnd) {
    for (let i = 0; i < 10; i++) { const v = 150 + rnd() * 50; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(i * n / 10, 0, n / 10, n); g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(i * n / 10, 0, 2, n); }
    granulado(g, n, rnd, n * n / 6, 120, 200);
  },
};

function estrela(g, x, y, r, cor) {
  g.fillStyle = cor; g.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  g.closePath(); g.fill();
}
function arabesco(g, x, y, r, preencher) {
  g.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2;
    g.moveTo(x, y); g.bezierCurveTo(x + Math.cos(a - 0.6) * r, y + Math.sin(a - 0.6) * r, x + Math.cos(a + 0.6) * r, y + Math.sin(a + 0.6) * r, x, y);
  }
  preencher ? g.fill() : g.stroke();
  g.beginPath(); g.arc(x, y, r * 0.12, 0, 7); g.stroke();
}

export function texturaSuperficie(tipo, tam = 512) {
  const chave = tipo + tam;
  if (cache.has(chave)) return cache.get(chave);
  const [cv, g] = canvas(tam);
  SUPERFICIES[tipo](g, tam, aleatorio(tipo.length * 7919 + tam));
  const t = paraTextura(cv);
  cache.set(chave, t);
  return t;
}
// cópia com repetição própria (a imagem é a mesma: não ocupa memória de novo)
export function comRepeticao(tex, rx, ry) {
  if (!tex) return null;
  const t = tex.clone(); t.repeat.set(rx, ry); t.needsUpdate = true; return t;
}

// ---------------------------------------------------------------- brilhos e partículas
export function texturaBrilho(cor = '#ffffff', suave = true) {
  const chave = 'brilho' + cor + suave;
  if (cache.has(chave)) return cache.get(chave);
  const [cv, g] = canvas(64);
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, cor); gr.addColorStop(suave ? 0.25 : 0.6, cor); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.globalAlpha = 1; g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  // canal alfa: o centro opaco some nas bordas
  const id = g.getImageData(0, 0, 64, 64);
  for (let i = 0; i < 64 * 64; i++) { const x = i % 64 - 31.5, y = Math.floor(i / 64) - 31.5; const d = Math.min(1, Math.hypot(x, y) / 32); id.data[i * 4 + 3] = Math.round(255 * Math.pow(1 - d, suave ? 2 : 0.8)); }
  g.putImageData(id, 0, 0);
  const t = paraTextura(cv, { repetir: false }); cache.set(chave, t); return t;
}
// degradê vertical para fachos de luz (alfa)
export function texturaFacho() {
  if (cache.has('facho')) return cache.get('facho');
  const cv = document.createElement('canvas'); cv.width = 8; cv.height = 128; const g = cv.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, '#fff'); gr.addColorStop(0.3, '#666'); gr.addColorStop(1, '#000');
  g.fillStyle = gr; g.fillRect(0, 0, 8, 128);
  const t = paraTextura(cv, { repetir: false, cor: false }); cache.set('facho', t); return t;
}
// névoa rasteira
export function texturaNevoa() {
  if (cache.has('nevoa')) return cache.get('nevoa');
  const [cv, g] = canvas(256); const rnd = aleatorio(42);
  for (let i = 0; i < 40; i++) {
    const x = rnd() * 256, y = 128 + (rnd() - 0.5) * 120, r = 30 + rnd() * 60;
    const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  }
  const t = paraTextura(cv); t.wrapT = THREE.ClampToEdgeWrapping; cache.set('nevoa', t); return t;
}
// listras de persiana (luz entrando pela janela — suspense/policial)
export function texturaPersiana() {
  if (cache.has('persiana')) return cache.get('persiana');
  const [cv, g] = canvas(256);
  for (let i = 0; i < 9; i++) {
    const gr = g.createLinearGradient(0, i * 28, 0, i * 28 + 18); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, i * 28 + 4, 256, 18);
  }
  const m = g.createRadialGradient(128, 128, 30, 128, 128, 140);
  m.addColorStop(0, 'rgba(0,0,0,0)'); m.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out'; g.fillStyle = m; g.fillRect(0, 0, 256, 256);
  const t = paraTextura(cv, { repetir: false }); cache.set('persiana', t); return t;
}

// ---------------------------------------------------------------- quadros (pinturas)
// cada pintura é uma função (g, w, h) que desenha em cores; o atlas junta várias numa textura só
export function atlasQuadros(pinturas, w = 256, h = 320) {
  const chave = 'atlas:' + pinturas.map(p => p.name).join(',') + w;
  if (cache.has(chave)) return cache.get(chave);
  const col = Math.min(4, pinturas.length), lin = Math.ceil(pinturas.length / col);
  const cv = document.createElement('canvas'); cv.width = col * w; cv.height = lin * h; const g = cv.getContext('2d');
  const rects = [];
  pinturas.forEach((p, i) => {
    const x = (i % col) * w, y = Math.floor(i / col) * h;
    g.save(); g.translate(x, y); g.beginPath(); g.rect(0, 0, w, h); g.clip(); p(g, w, h, aleatorio(i * 131 + 7)); g.restore();
    // envelhecimento leve (vinheta)
    const v = g.createRadialGradient(x + w / 2, y + h / 2, Math.min(w, h) * 0.3, x + w / 2, y + h / 2, Math.max(w, h) * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.45)'); g.fillStyle = v; g.fillRect(x, y, w, h);
    rects.push({ u0: x / cv.width, v0: 1 - (y + h) / cv.height, u1: (x + w) / cv.width, v1: 1 - y / cv.height });
  });
  const tex = paraTextura(cv, { repetir: false });
  const r = { tex, rects }; cache.set(chave, r); return r;
}

const ceu = (g, w, h, cores) => { const gr = g.createLinearGradient(0, 0, 0, h); cores.forEach((c, i) => gr.addColorStop(i / (cores.length - 1), c)); g.fillStyle = gr; g.fillRect(0, 0, w, h); };
const lua = (g, x, y, r, cor, brilho) => { g.save(); g.shadowColor = brilho || cor; g.shadowBlur = r; g.fillStyle = cor; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.restore(); };
const silhueta = (g, cor, pts) => { g.fillStyle = cor; g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); g.fill(); };
const montanhas = (g, w, h, cor, base, amp, rnd) => { g.fillStyle = cor; g.beginPath(); g.moveTo(0, h); for (let x = 0; x <= w; x += w / 8) g.lineTo(x, base - rnd() * amp); g.lineTo(w, h); g.fill(); };
const coracao = (g, x, y, s, cor) => { g.fillStyle = cor; g.beginPath(); g.moveTo(x, y + s * 0.3); g.bezierCurveTo(x, y, x - s / 2, y, x - s / 2, y + s * 0.3); g.bezierCurveTo(x - s / 2, y + s * 0.6, x, y + s * 0.8, x, y + s); g.bezierCurveTo(x, y + s * 0.8, x + s / 2, y + s * 0.6, x + s / 2, y + s * 0.3); g.bezierCurveTo(x + s / 2, y, x, y, x, y + s * 0.3); g.fill(); };
const arvoreSeca = (g, x, y, h, cor) => { g.strokeStyle = cor; g.lineCap = 'round'; const galho = (x, y, a, l, e) => { if (e < 1) return; const x2 = x + Math.cos(a) * l, y2 = y + Math.sin(a) * l; g.lineWidth = e; g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke(); galho(x2, y2, a - 0.45, l * 0.72, e * 0.65); galho(x2, y2, a + 0.4, l * 0.7, e * 0.65); }; galho(x, y, -Math.PI / 2, h * 0.35, h * 0.06); };

export const PINTURAS = {
  // terror
  retrato(g, w, h) {
    ceu(g, w, h, ['#1a0f14', '#07040a']);
    g.fillStyle = '#0a0608'; g.beginPath(); g.ellipse(w / 2, h * 0.62, w * 0.42, h * 0.5, 0, Math.PI, 0); g.fill();   // cabelo
    g.fillStyle = '#c9c2b8'; g.beginPath(); g.ellipse(w / 2, h * 0.45, w * 0.17, h * 0.2, 0, 0, 7); g.fill();       // rosto pálido
    g.fillStyle = '#0a0608'; g.beginPath(); g.ellipse(w / 2, h * 0.3, w * 0.24, h * 0.12, 0, Math.PI, 0); g.fill();
    g.fillRect(w * 0.3, h * 0.3, w * 0.08, h * 0.45); g.fillRect(w * 0.62, h * 0.3, w * 0.08, h * 0.45);
    for (const x of [0.43, 0.57]) { g.fillStyle = '#100608'; g.beginPath(); g.ellipse(w * x, h * 0.43, w * 0.04, h * 0.025, 0, 0, 7); g.fill(); lua(g, w * x, h * 0.43, w * 0.012, '#ff2020', '#ff0000'); }
    g.fillStyle = '#2a0a0a'; g.fillRect(w * 0.46, h * 0.53, w * 0.08, h * 0.008);
  },
  casaAssombrada(g, w, h, rnd) {
    ceu(g, w, h, ['#140a24', '#3a1a3a', '#120812']);
    lua(g, w * 0.7, h * 0.25, w * 0.13, '#e8e0c8', '#fff3c0');
    montanhas(g, w, h, '#0b060c', h * 0.8, h * 0.08, rnd);
    silhueta(g, '#060306', [[w * 0.2, h * 0.8], [w * 0.2, h * 0.5], [w * 0.32, h * 0.38], [w * 0.44, h * 0.5], [w * 0.44, h * 0.42], [w * 0.5, h * 0.36], [w * 0.56, h * 0.42], [w * 0.56, h * 0.8]]);
    g.fillStyle = '#ffcf6a'; g.fillRect(w * 0.27, h * 0.56, w * 0.05, h * 0.05); g.fillRect(w * 0.48, h * 0.48, w * 0.04, h * 0.05);
    arvoreSeca(g, w * 0.82, h * 0.85, h * 0.6, '#050305');
    g.fillStyle = '#050305'; for (let i = 0; i < 5; i++) { const x = w * (0.1 + rnd() * 0.6), y = h * (0.1 + rnd() * 0.2); g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 6, y - 6, x + 12, y); g.quadraticCurveTo(x + 18, y - 6, x + 24, y); g.quadraticCurveTo(x + 12, y + 3, x, y); g.fill(); }
  },
  corredor(g, w, h) {
    g.fillStyle = '#0a0809'; g.fillRect(0, 0, w, h);
    const cx = w / 2, cy = h * 0.48;
    for (let i = 0; i < 9; i++) { const s = 1 - i / 9; g.strokeStyle = `rgba(160,140,120,${0.25 * s})`; g.strokeRect(cx - w * 0.5 * s, cy - h * 0.5 * s, w * s, h * s); }
    const gr = g.createRadialGradient(cx, cy, 2, cx, cy, w * 0.25); gr.addColorStop(0, 'rgba(200,220,255,.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = '#000'; g.beginPath(); g.ellipse(cx, cy - h * 0.03, w * 0.025, h * 0.03, 0, 0, 7); g.fill(); g.fillRect(cx - w * 0.03, cy, w * 0.06, h * 0.1);
  },
  luaDeSangue(g, w, h, rnd) {
    ceu(g, w, h, ['#1a0306', '#3a0a0e', '#0a0204']);
    lua(g, w * 0.5, h * 0.35, w * 0.2, '#b01818', '#ff2020');
    montanhas(g, w, h, '#070203', h * 0.82, h * 0.1, rnd);
    for (let i = 0; i < 6; i++) arvoreSeca(g, w * (0.08 + i * 0.17), h, h * (0.35 + rnd() * 0.2), '#050102');
  },
  // romance
  porDoSol(g, w, h, rnd) {
    ceu(g, w, h, ['#3a1450', '#c2406a', '#ff9a6a', '#ffd38a']);
    lua(g, w * 0.5, h * 0.62, w * 0.2, '#ffe2a0', '#ffb070');
    g.fillStyle = '#3a1a2c'; g.fillRect(0, h * 0.68, w, h * 0.32);
    for (let i = 0; i < 8; i++) { g.fillStyle = `rgba(255,200,150,${0.3 - i * 0.03})`; g.fillRect(w * 0.35 + rnd() * 10, h * (0.7 + i * 0.03), w * (0.3 - i * 0.02), 2); }
    g.fillStyle = '#1a0a14';
    for (const [x, inc] of [[0.44, 0.08], [0.56, -0.08]]) { g.save(); g.translate(w * x, h * 0.68); g.rotate(inc); g.beginPath(); g.ellipse(0, -h * 0.17, w * 0.03, h * 0.03, 0, 0, 7); g.fill(); g.fillRect(-w * 0.03, -h * 0.14, w * 0.06, h * 0.14); g.restore(); }
    coracao(g, w * 0.5, h * 0.36, w * 0.09, 'rgba(255,90,120,.85)');
  },
  rosas(g, w, h, rnd) {
    ceu(g, w, h, ['#2a0a12', '#4a1020']);
    for (let i = 0; i < 9; i++) {
      const x = w * (0.2 + rnd() * 0.6), y = h * (0.2 + rnd() * 0.6), r = w * (0.07 + rnd() * 0.05);
      g.fillStyle = '#2f5a2a'; g.beginPath(); g.ellipse(x + r, y + r * 0.6, r * 0.6, r * 0.25, 0.5, 0, 7); g.fill();
      for (let k = 5; k > 0; k--) { g.fillStyle = `hsl(${348 + k}, 75%, ${28 + k * 6}%)`; g.beginPath(); g.arc(x + Math.cos(k * 2.4) * r * 0.12, y + Math.sin(k * 2.4) * r * 0.12, r * k / 5, 0, 7); g.fill(); }
    }
  },
  paris(g, w, h) {
    ceu(g, w, h, ['#2a1a40', '#a04a7a', '#f2a0a0']);
    for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(255,240,220,.6)'; g.fillRect(Math.random() * w, Math.random() * h * 0.4, 1.5, 1.5); }
    const x = w / 2, b = h * 0.92, t = h * 0.15;
    silhueta(g, '#1a0e1c', [[x - w * 0.2, b], [x - w * 0.04, h * 0.45], [x - w * 0.012, t], [x + w * 0.012, t], [x + w * 0.04, h * 0.45], [x + w * 0.2, b], [x + w * 0.1, b], [x, h * 0.72], [x - w * 0.1, b]]);
    g.fillStyle = '#ffd38a'; for (let i = 0; i < 12; i++) g.fillRect(x - w * 0.03 + (i % 3) * w * 0.02, h * (0.45 + Math.floor(i / 3) * 0.08), 2, 2);
    g.fillStyle = '#140a14'; g.fillRect(0, b, w, h - b);
  },
  coracoes(g, w, h) {
    ceu(g, w, h, ['#4a0f22', '#7a1a36']);
    coracao(g, w * 0.5, h * 0.25, w * 0.5, '#e8436a');
    coracao(g, w * 0.5, h * 0.33, w * 0.32, '#ff8aa6');
    g.strokeStyle = '#ffd38a'; g.lineWidth = 4; g.beginPath(); g.moveTo(w * 0.1, h * 0.8); g.lineTo(w * 0.9, h * 0.2); g.stroke();
  },
  // documentário
  montanha(g, w, h, rnd) { ceu(g, w, h, ['#d8c8a8', '#a89070']); montanhas(g, w, h, '#6a5a44', h * 0.55, h * 0.2, rnd); montanhas(g, w, h, '#4a3e30', h * 0.75, h * 0.15, rnd); },
  oceano(g, w, h) { ceu(g, w, h, ['#e0d4b8', '#b8a888']); g.fillStyle = '#7a6a54'; g.fillRect(0, h * 0.55, w, h * 0.45); g.strokeStyle = 'rgba(240,230,210,.5)'; for (let i = 0; i < 12; i++) { g.beginPath(); g.moveTo(0, h * (0.58 + i * 0.035)); for (let x = 0; x <= w; x += 16) g.lineTo(x, h * (0.58 + i * 0.035) + Math.sin(x / 10 + i) * 2); g.stroke(); } lua(g, w * 0.3, h * 0.3, w * 0.08, '#fff6e0'); },
  cidade(g, w, h, rnd) { ceu(g, w, h, ['#cfc0a0', '#9a8a6c']); for (let i = 0; i < 12; i++) { const bw = w / 10, bh = h * (0.2 + rnd() * 0.5), x = i * w / 12; g.fillStyle = `rgb(${70 + rnd() * 30},${60 + rnd() * 25},${45 + rnd() * 20})`; g.fillRect(x, h - bh, bw, bh); g.fillStyle = 'rgba(240,220,170,.5)'; for (let k = 0; k < bh / 14; k++) g.fillRect(x + 4, h - bh + 6 + k * 14, bw - 8, 3); } },
  floresta(g, w, h, rnd) { ceu(g, w, h, ['#d4c8a8', '#8a7a5c']); for (let i = 0; i < 14; i++) { const x = rnd() * w, b = h * (0.7 + rnd() * 0.3), a = h * (0.3 + rnd() * 0.3); silhueta(g, `rgba(${50 + rnd() * 30},${45 + rnd() * 25},${30 + rnd() * 15},.9)`, [[x, b - a], [x - a * 0.25, b], [x + a * 0.25, b]]); } },
  // drama (preto e branco)
  perfil(g, w, h) {
    ceu(g, w, h, ['#d8d8d8', '#6a6a6a']);
    silhueta(g, '#1a1a1a', [[w * 0.2, h], [w * 0.22, h * 0.7], [w * 0.3, h * 0.6], [w * 0.36, h * 0.52], [w * 0.38, h * 0.45], [w * 0.44, h * 0.42], [w * 0.42, h * 0.38], [w * 0.46, h * 0.34], [w * 0.44, h * 0.28], [w * 0.44, h * 0.2], [w * 0.35, h * 0.1], [w * 0.2, h * 0.12], [w * 0.12, h * 0.25], [w * 0.12, h * 0.6], [w * 0.05, h]]);
  },
  janelaChuva(g, w, h, rnd) {
    ceu(g, w, h, ['#3a3a3a', '#8a8a8a']);
    g.strokeStyle = 'rgba(230,230,230,.35)'; for (let i = 0; i < 60; i++) { const x = rnd() * w, y = rnd() * h; g.beginPath(); g.moveTo(x, y); g.lineTo(x - 3, y + 12); g.stroke(); }
    g.fillStyle = '#151515'; g.fillRect(w * 0.48, 0, w * 0.04, h); g.fillRect(0, h * 0.48, w, h * 0.04); g.lineWidth = 10; g.strokeStyle = '#151515'; g.strokeRect(0, 0, w, h);
  },
  palcoVazio(g, w, h) {
    g.fillStyle = '#0e0e0e'; g.fillRect(0, 0, w, h);
    const gr = g.createRadialGradient(w / 2, h * 0.75, 4, w / 2, h * 0.75, w * 0.45); gr.addColorStop(0, '#e8e8e8'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(240,240,240,.12)'; silhueta(g, 'rgba(240,240,240,.12)', [[w * 0.45, 0], [w * 0.55, 0], [w * 0.8, h * 0.8], [w * 0.2, h * 0.8]]);
    g.fillStyle = '#2a2a2a'; g.fillRect(w * 0.47, h * 0.62, w * 0.06, h * 0.14);
  },
  // aventura
  mapaTesouro(g, w, h, rnd) {
    g.fillStyle = '#d9c08a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(120,80,30,${rnd() * 0.15})`; g.fillRect(rnd() * w, rnd() * h, 3, 3); }
    g.fillStyle = '#b89a5a'; g.beginPath(); for (let a = 0; a < 7; a += 0.5) g.lineTo(w / 2 + Math.cos(a) * w * (0.28 + rnd() * 0.08), h / 2 + Math.sin(a) * h * (0.25 + rnd() * 0.06)); g.fill();
    g.setLineDash([6, 6]); g.strokeStyle = '#7a2a1a'; g.lineWidth = 3; g.beginPath(); g.moveTo(w * 0.3, h * 0.65); g.bezierCurveTo(w * 0.4, h * 0.3, w * 0.6, h * 0.7, w * 0.66, h * 0.4); g.stroke(); g.setLineDash([]);
    g.lineWidth = 5; g.beginPath(); g.moveTo(w * 0.62, h * 0.36); g.lineTo(w * 0.7, h * 0.44); g.moveTo(w * 0.7, h * 0.36); g.lineTo(w * 0.62, h * 0.44); g.stroke();
    g.strokeStyle = '#5a3a1a'; g.lineWidth = 2; g.beginPath(); g.arc(w * 0.18, h * 0.18, w * 0.09, 0, 7); g.stroke(); silhueta(g, '#5a3a1a', [[w * 0.18, h * 0.08], [w * 0.2, h * 0.18], [w * 0.18, h * 0.28], [w * 0.16, h * 0.18]]);
  },
  templo(g, w, h, rnd) {
    ceu(g, w, h, ['#ffb060', '#d86a3a', '#4a2a2a']);
    lua(g, w * 0.5, h * 0.45, w * 0.16, '#ffe0a0');
    montanhas(g, w, h, '#2a3a20', h * 0.7, h * 0.15, rnd);
    for (let i = 0; i < 5; i++) { g.fillStyle = '#3a2a1a'; g.fillRect(w * (0.3 + i * 0.02), h * (0.45 + i * 0.05), w * (0.4 - i * 0.04), h * 0.05); }
    g.fillStyle = '#1a3a1a'; for (let i = 0; i < 20; i++) { g.beginPath(); g.arc(rnd() * w, h * (0.8 + rnd() * 0.2), 10 + rnd() * 14, 0, 7); g.fill(); }
  },
  navio(g, w, h) {
    ceu(g, w, h, ['#ffcf8a', '#f08a5a', '#3a4a6a']);
    g.fillStyle = '#1e2c44'; g.fillRect(0, h * 0.68, w, h * 0.32);
    silhueta(g, '#1a1010', [[w * 0.2, h * 0.66], [w * 0.8, h * 0.66], [w * 0.7, h * 0.76], [w * 0.28, h * 0.76]]);
    g.fillStyle = '#1a1010'; g.fillRect(w * 0.49, h * 0.2, 4, h * 0.46);
    silhueta(g, '#f2e6cc', [[w * 0.51, h * 0.24], [w * 0.72, h * 0.42], [w * 0.51, h * 0.6]]); silhueta(g, '#e6d8bc', [[w * 0.48, h * 0.28], [w * 0.3, h * 0.5], [w * 0.48, h * 0.6]]);
  },
  // fantasia
  dragao(g, w, h, rnd) {
    ceu(g, w, h, ['#1a1a4a', '#5a3a7a', '#f2a07a']);
    montanhas(g, w, h, '#1a1428', h * 0.75, h * 0.25, rnd);
    silhueta(g, '#120c1a', [[w * 0.3, h * 0.35], [w * 0.45, h * 0.3], [w * 0.55, h * 0.12], [w * 0.52, h * 0.3], [w * 0.7, h * 0.28], [w * 0.62, h * 0.34], [w * 0.75, h * 0.38], [w * 0.5, h * 0.38], [w * 0.4, h * 0.42]]);
    g.fillStyle = '#ffcf6a'; g.fillRect(w * 0.16, h * 0.62, w * 0.03, h * 0.06); g.fillRect(w * 0.13, h * 0.58, w * 0.09, h * 0.02);
  },
  castelo(g, w, h) {
    ceu(g, w, h, ['#0e1840', '#3a4a8a', '#8a7ab0']);
    for (let i = 0; i < 60; i++) { g.fillStyle = 'rgba(255,255,255,.7)'; g.fillRect(Math.random() * w, Math.random() * h * 0.5, 1.5, 1.5); }
    const b = h * 0.85; g.fillStyle = '#141a30';
    for (const [x, tw, th] of [[0.2, 0.1, 0.45], [0.42, 0.16, 0.6], [0.7, 0.1, 0.4]]) { g.fillRect(w * x, b - h * th, w * tw, h * th); silhueta(g, '#141a30', [[w * (x - 0.02), b - h * th], [w * (x + tw / 2), b - h * (th + 0.15)], [w * (x + tw + 0.02), b - h * th]]); }
    g.fillRect(w * 0.15, b - h * 0.25, w * 0.7, h * 0.25); g.fillRect(0, b, w, h - b);
    g.fillStyle = '#ffd77a'; for (const [x, y] of [[0.24, 0.55], [0.48, 0.45], [0.52, 0.6], [0.74, 0.6]]) g.fillRect(w * x, h * y, 5, 8);
  },
  cristalMagico(g, w, h) {
    ceu(g, w, h, ['#0a1a2a', '#1a3a4a']);
    const gr = g.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w * 0.45); gr.addColorStop(0, 'rgba(120,255,220,.8)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    silhueta(g, '#7affd8', [[w / 2, h * 0.18], [w * 0.62, h * 0.45], [w / 2, h * 0.8], [w * 0.38, h * 0.45]]);
    silhueta(g, 'rgba(255,255,255,.6)', [[w / 2, h * 0.18], [w * 0.55, h * 0.45], [w / 2, h * 0.8]]);
  },
  // ficção científica
  planeta(g, w, h) {
    g.fillStyle = '#03030c'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(255,255,255,${Math.random()})`; g.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5); }
    const gr = g.createRadialGradient(w * 0.42, h * 0.42, 4, w / 2, h / 2, w * 0.3); gr.addColorStop(0, '#9af0ff'); gr.addColorStop(0.6, '#3a5aff'); gr.addColorStop(1, '#0a0a3a'); g.fillStyle = gr; g.beginPath(); g.arc(w / 2, h / 2, w * 0.3, 0, 7); g.fill();
    g.strokeStyle = 'rgba(200,160,255,.8)'; g.lineWidth = 4; g.beginPath(); g.ellipse(w / 2, h / 2, w * 0.45, h * 0.07, -0.3, 0, 7); g.stroke();
  },
  nebulosa(g, w, h, rnd) {
    g.fillStyle = '#050510'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 18; i++) { const x = rnd() * w, y = rnd() * h, r = 30 + rnd() * 80; const gr = g.createRadialGradient(x, y, 0, x, y, r); const c = rnd() < 0.5 ? '170,60,255' : '0,200,255'; gr.addColorStop(0, `rgba(${c},.35)`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }
    for (let i = 0; i < 70; i++) { g.fillStyle = '#fff'; g.fillRect(rnd() * w, rnd() * h, 1.5, 1.5); }
  },
  // ação
  explosao(g, w, h, rnd) {
    ceu(g, w, h, ['#1a0a04', '#3a1404']);
    for (let i = 0; i < 25; i++) { const x = w / 2 + (rnd() - 0.5) * w * 0.5, y = h * 0.5 + (rnd() - 0.5) * h * 0.4, r = 20 + rnd() * 50; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,240,180,.9)'); gr.addColorStop(0.4, 'rgba(255,120,20,.6)'); gr.addColorStop(1, 'rgba(60,10,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }
    g.fillStyle = '#0a0604'; g.fillRect(0, h * 0.82, w, h * 0.18);
  },
  velocidade(g, w, h, rnd) {
    ceu(g, w, h, ['#0a1020', '#14243a']);
    for (let i = 0; i < 40; i++) { g.strokeStyle = rnd() < 0.5 ? 'rgba(31,163,255,.7)' : 'rgba(255,90,31,.7)'; g.lineWidth = 1 + rnd() * 3; const y = rnd() * h; g.beginPath(); g.moveTo(rnd() * w * 0.4, y); g.lineTo(w, y + (rnd() - 0.5) * 10); g.stroke(); }
    silhueta(g, '#05070c', [[w * 0.15, h * 0.62], [w * 0.35, h * 0.5], [w * 0.7, h * 0.5], [w * 0.88, h * 0.6], [w * 0.88, h * 0.68], [w * 0.15, h * 0.68]]);
    for (const x of [0.3, 0.75]) { g.fillStyle = '#111'; g.beginPath(); g.arc(w * x, h * 0.68, w * 0.06, 0, 7); g.fill(); }
  },
  // comédia
  mascaraRiso(g, w, h) {
    ceu(g, w, h, ['#ffd23f', '#ff9f1c']);
    g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(w / 2, h / 2, w * 0.3, h * 0.32, 0, 0, 7); g.fill();
    g.fillStyle = '#222'; for (const x of [0.4, 0.6]) { g.beginPath(); g.ellipse(w * x, h * 0.42, w * 0.06, h * 0.035, 0, Math.PI, 0); g.fill(); }
    g.beginPath(); g.ellipse(w / 2, h * 0.58, w * 0.15, h * 0.1, 0, 0, Math.PI); g.fill();
    g.fillStyle = '#f25c54'; g.beginPath(); g.ellipse(w / 2, h * 0.63, w * 0.07, h * 0.04, 0, 0, Math.PI); g.fill();
  },
  bananas(g, w, h) {
    ceu(g, w, h, ['#3ddc97', '#1b9aaa']);
    for (let i = 0; i < 3; i++) { g.save(); g.translate(w * (0.3 + i * 0.2), h * (0.35 + i * 0.12)); g.rotate(-0.4 + i * 0.3); g.strokeStyle = '#ffe14d'; g.lineWidth = w * 0.07; g.lineCap = 'round'; g.beginPath(); g.arc(0, -w * 0.25, w * 0.25, Math.PI * 0.25, Math.PI * 0.75); g.stroke(); g.restore(); }
  },
  claquete(g, w, h) {
    ceu(g, w, h, ['#ff70a6', '#ff9770']);
    g.fillStyle = '#222'; g.fillRect(w * 0.2, h * 0.42, w * 0.6, h * 0.38);
    g.save(); g.translate(w * 0.2, h * 0.42); g.rotate(-0.25); g.fillStyle = '#222'; g.fillRect(0, -h * 0.1, w * 0.6, h * 0.1);
    for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? '#ffd23f' : '#fff'; silhueta(g, i % 2 ? '#ffd23f' : '#fff', [[i * w * 0.1, -h * 0.1], [(i + 0.5) * w * 0.1, -h * 0.1], [(i + 1) * w * 0.1, 0], [(i + 0.5) * w * 0.1, 0]]); }
    g.restore(); g.fillStyle = '#fff'; g.font = `bold ${Math.round(h * 0.07)}px system-ui`; g.fillText('CENA 1', w * 0.28, h * 0.62); g.fillText('TAKE 99', w * 0.28, h * 0.72);
  },
  // animação
  arcoIris(g, w, h) {
    ceu(g, w, h, ['#8ad8ff', '#d8f4ff']);
    ['#ff595e', '#ffca3a', '#8ac926', '#1982c4', '#6a4c93'].forEach((c, i) => { g.strokeStyle = c; g.lineWidth = w * 0.06; g.beginPath(); g.arc(w / 2, h * 0.75, w * (0.42 - i * 0.06), Math.PI, 0); g.stroke(); });
    for (const [x, y] of [[0.15, 0.75], [0.85, 0.75]]) for (let k = 0; k < 4; k++) { g.fillStyle = '#fff'; g.beginPath(); g.arc(w * x + (k - 1.5) * w * 0.06, h * y - (k % 2) * h * 0.03, w * 0.06, 0, 7); g.fill(); }
  },
  foguete(g, w, h) {
    ceu(g, w, h, ['#3a2a8a', '#8a5ad8']);
    for (let i = 0; i < 30; i++) estrela(g, Math.random() * w, Math.random() * h, 3 + Math.random() * 4, '#fff7a8');
    g.save(); g.translate(w / 2, h / 2); g.rotate(0.4);
    g.fillStyle = '#ff595e'; g.beginPath(); g.moveTo(0, -h * 0.28); g.quadraticCurveTo(w * 0.12, -h * 0.1, w * 0.08, h * 0.15); g.lineTo(-w * 0.08, h * 0.15); g.quadraticCurveTo(-w * 0.12, -h * 0.1, 0, -h * 0.28); g.fill();
    g.fillStyle = '#8ad8ff'; g.beginPath(); g.arc(0, -h * 0.06, w * 0.04, 0, 7); g.fill();
    g.fillStyle = '#ffca3a'; g.beginPath(); g.moveTo(-w * 0.06, h * 0.15); g.lineTo(0, h * 0.32); g.lineTo(w * 0.06, h * 0.15); g.fill(); g.restore();
  },
  // suspense / policial
  olhoFechadura(g, w, h) {
    g.fillStyle = '#0a0c10'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#c8d4e0'; g.beginPath(); g.arc(w / 2, h * 0.4, w * 0.18, 0, 7); g.fill(); silhueta(g, '#c8d4e0', [[w * 0.42, h * 0.45], [w * 0.58, h * 0.45], [w * 0.64, h * 0.8], [w * 0.36, h * 0.8]]);
    g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(w / 2, h * 0.42, w * 0.12, h * 0.06, 0, 0, 7); g.fill();
    g.fillStyle = '#2a5a8a'; g.beginPath(); g.arc(w / 2, h * 0.42, w * 0.05, 0, 7); g.fill(); g.fillStyle = '#000'; g.beginPath(); g.arc(w / 2, h * 0.42, w * 0.022, 0, 7); g.fill();
  },
  escadaEspiral(g, w, h) {
    g.fillStyle = '#e8e8e8'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) { const r = w * 0.48 * (1 - i / 28); g.strokeStyle = `rgba(20,20,20,${0.25 + i / 40})`; g.lineWidth = 6 * (1 - i / 30); g.beginPath(); g.arc(w / 2, h / 2, r, i * 0.4, i * 0.4 + 4.5); g.stroke(); }
    g.fillStyle = '#000'; g.beginPath(); g.arc(w / 2, h / 2, w * 0.05, 0, 7); g.fill();
  },
  quadroEvidencias(g, w, h, rnd) {
    g.fillStyle = '#a07850'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(60,30,10,${rnd() * 0.25})`; g.fillRect(rnd() * w, rnd() * h, 2, 2); }
    const pts = [];
    for (let i = 0; i < 5; i++) {
      const x = w * (0.08 + (i % 2) * 0.45 + rnd() * 0.05), y = h * (0.06 + i * 0.18);
      g.save(); g.translate(x, y); g.rotate((rnd() - 0.5) * 0.3);
      g.fillStyle = '#f4f0e6'; g.fillRect(0, 0, w * 0.38, h * 0.2);
      g.fillStyle = ['#3a4a5a', '#5a4a3a', '#2a2a2a'][i % 3]; g.fillRect(w * 0.03, h * 0.02, w * 0.32, h * 0.13);
      g.fillStyle = '#d8d0c0'; g.beginPath(); g.arc(w * 0.19, h * 0.065, w * 0.05, 0, 7); g.fill(); g.fillRect(w * 0.12, h * 0.1, w * 0.14, h * 0.05);
      g.restore(); pts.push([x + w * 0.19, y + 4]);
      g.fillStyle = '#d02020'; g.beginPath(); g.arc(x + w * 0.19, y + 4, 4, 0, 7); g.fill();
    }
    g.strokeStyle = '#d02020'; g.lineWidth = 2; g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.lineTo(pts[0][0], pts[0][1]); g.stroke();
  },
  digital(g, w, h) {
    g.fillStyle = '#e8e4da'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#1a2a4a'; g.lineWidth = 2.5;
    for (let i = 0; i < 16; i++) { g.beginPath(); g.ellipse(w / 2, h / 2, w * (0.04 + i * 0.022), h * (0.05 + i * 0.022), 0, Math.PI * (0.1 + (i % 3) * 0.05), Math.PI * (2.0 - (i % 2) * 0.1)); g.stroke(); }
    g.fillStyle = '#1a2a4a'; g.font = `bold ${Math.round(h * 0.06)}px monospace`; g.fillText('CASO Nº 0427', w * 0.08, h * 0.94);
  },
  // guerra
  mapaTatico(g, w, h, rnd) {
    g.fillStyle = '#c8bc96'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(80,70,40,.5)'; g.lineWidth = 1; for (let i = 0; i < 9; i++) { g.beginPath(); for (let x = 0; x <= w; x += 8) g.lineTo(x, h * (i / 9) + Math.sin(x / 30 + i) * 10); g.stroke(); }
    g.strokeStyle = 'rgba(0,0,0,.25)'; for (let i = 1; i < 6; i++) { g.beginPath(); g.moveTo(i * w / 6, 0); g.lineTo(i * w / 6, h); g.moveTo(0, i * h / 6); g.lineTo(w, i * h / 6); g.stroke(); }
    g.strokeStyle = '#a02020'; g.lineWidth = 4; g.beginPath(); g.moveTo(w * 0.15, h * 0.8); g.quadraticCurveTo(w * 0.4, h * 0.4, w * 0.75, h * 0.3); g.stroke();
    silhueta(g, '#a02020', [[w * 0.75, h * 0.24], [w * 0.84, h * 0.29], [w * 0.74, h * 0.36]]);
    g.fillStyle = '#2a3a8a'; for (let i = 0; i < 4; i++) g.fillRect(w * (0.2 + rnd() * 0.6), h * (0.2 + rnd() * 0.6), 12, 8);
  },
  avioes(g, w, h) {
    ceu(g, w, h, ['#8a8a70', '#c8b890', '#6a5a44']);
    for (const [x, y, s] of [[0.3, 0.3, 1], [0.6, 0.45, 0.8], [0.45, 0.6, 0.6]]) { g.save(); g.translate(w * x, h * y); g.scale(s, s); silhueta(g, '#2a2a22', [[-w * 0.15, 0], [w * 0.15, 0], [w * 0.17, h * 0.01], [-w * 0.15, h * 0.015]]); silhueta(g, '#2a2a22', [[-w * 0.02, 0], [w * 0.04, 0], [-w * 0.06, -h * 0.08], [-w * 0.09, -h * 0.08]]); silhueta(g, '#2a2a22', [[-w * 0.02, h * 0.01], [w * 0.04, h * 0.01], [-w * 0.06, h * 0.09], [-w * 0.09, h * 0.09]]); g.restore(); }
  },
};
