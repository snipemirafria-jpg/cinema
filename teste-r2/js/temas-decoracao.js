// Decoração 3D de cada sala temática. Tudo é montado sobre a MESMA sala da Sessão Juntos:
// os objetos ficam nos painéis das paredes, nos corredores laterais, no teto e nas pontas do palco,
// sem cobrir o telão, as poltronas, as cortinas nem a logo.
// Cada tema devolve "camadas" (paredes, piso, teto, palco, particulas) para que filmes com dois gêneros
// misturem as camadas dos dois temas.
// Desempenho: geometrias repetidas são fundidas (poucas chamadas de desenho) e só são criadas quando o tema
// aparece pela primeira vez; depois ficam guardadas.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { atlasQuadros, PINTURAS, texturaBrilho, texturaFacho, texturaNevoa, texturaPersiana, texturaSuperficie } from './temas-texturas.js';

// medidas da sala (iguais às de cinema3d.js)
const L = 26, A = 13, Z_FUNDO = -16;
const TELA = { z: 15.5, y: 5.6, w: 17.6, h: 7.4 };
const PAINEIS_Z = [-12, -7.8, -3.6, 0.6, 4.8, 9];           // centro dos painéis acústicos das paredes
const ENTRE_Z = [-9.9, -5.7, -1.5, 2.7, 6.9, 11.1];          // vãos entre os painéis (onde ficam os neons)
const LADOS = [-1, 1];
const CORREDOR_X = 11.4;                                     // corredor lateral (entre as poltronas e a parede)

// altura do piso em cada ponto da plateia (degraus)
export function alturaPiso(z) {
  if (z < -12.3) return 0;
  if (z < -6.3) return 3.42;
  return Math.max(0, Math.min(9, Math.round((6.4 - z) / 1.35))) * 0.38;
}

// ---------------------------------------------------------------- utilidades
const _o = new THREE.Object3D();
function colocar(geo, x, y, z, rx = 0, ry = 0, rz = 0, s = 1) {
  _o.position.set(x, y, z); _o.rotation.set(rx, ry, rz); _o.scale.setScalar(s); _o.updateMatrix();
  return geo.applyMatrix4(_o.matrix);
}
function juntar(geos) {
  const lista = geos.filter(Boolean).map(g => {
    const n = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k);
    if (!n.attributes.uv) n.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
    return n;
  });
  const m = mergeGeometries(lista, false);
  lista.forEach(g => g.dispose());
  return m;
}
const naParedeRotY = (lado) => -lado * Math.PI / 2;           // plano virado para dentro da sala
const std = (cor, o = {}) => new THREE.MeshStandardMaterial({ color: cor, roughness: o.r ?? 0.6, metalness: o.m ?? 0, emissive: o.e ?? '#000000', emissiveIntensity: o.ei ?? 1, map: o.map ?? null, side: o.lados ? THREE.DoubleSide : THREE.FrontSide, flatShading: !!o.flat });
const brilhante = (cor, o = {}) => new THREE.MeshBasicMaterial({ color: cor, toneMapped: false, transparent: !!o.op, opacity: o.op ?? 1, side: o.lados ? THREE.DoubleSide : THREE.FrontSide });
const aditivo = (cor, o = {}) => new THREE.MeshBasicMaterial({ color: cor, map: o.map ?? null, alphaMap: o.alpha ?? null, transparent: true, opacity: o.op ?? 1, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, fog: o.fog ?? true });
function malha(geo, mat, sombra = false) { const m = new THREE.Mesh(geo, mat); m.castShadow = sombra; m.receiveShadow = sombra; return m; }

function brilho(cor, tam, op = 0.8) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: texturaBrilho('#ffffff'), color: cor, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  s.scale.setScalar(tam); return s;
}

// ---------------------------------------------------------------- peças reutilizáveis

// quadros nos painéis: um atlas de pinturas + molduras fundidas = 2 chamadas de desenho para todos
function quadros({ pinturas, cor = '#c9a24a', estilo = 'simples', metal = 0.6, w = 2.2, h = 2.8, y = 5.3, painel = [0, 1, 2, 3, 4, 5], q }) {
  const atlas = atlasQuadros(pinturas, q.tex > 256 ? 256 : 192, q.tex > 256 ? 320 : 240);
  const telas = [], bordas = [];
  let i = 0;
  for (const lado of LADOS) for (const k of painel) {
    const z = PAINEIS_Z[k], x = lado * (L / 2 - 0.2), ry = naParedeRotY(lado);
    const r = atlas.rects[i++ % atlas.rects.length];
    const p = new THREE.PlaneGeometry(w, h); const uv = p.attributes.uv;
    for (let n = 0; n < uv.count; n++) uv.setXY(n, uv.getX(n) ? r.u1 : r.u0, uv.getY(n) ? r.v1 : r.v0);
    telas.push(colocar(p, x - lado * 0.06, y, z, 0, ry));
    const t = estilo === 'ornado' ? 0.2 : 0.12, d = 0.12;
    const ex = new THREE.Vector3(Math.cos(ry), 0, -Math.sin(ry));   // eixo "largura" do quadro na parede
    const peca = (gx, gy, comp, alt) => { const b = new THREE.BoxGeometry(comp, alt, d); return colocar(b, x - lado * 0.05 + ex.x * gx, y + gy, z + ex.z * gx, 0, ry); };
    bordas.push(peca(0, h / 2 + t / 2, w + 2 * t, t), peca(0, -h / 2 - t / 2, w + 2 * t, t), peca(-w / 2 - t / 2, 0, t, h), peca(w / 2 + t / 2, 0, t, h));
    if (estilo === 'ornado') {
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) bordas.push(colocar(new THREE.SphereGeometry(0.17, 10, 8), x - lado * 0.08 + ex.x * sx * (w / 2 + t / 2), y + sy * (h / 2 + t / 2), z + ex.z * sx * (w / 2 + t / 2)));
      bordas.push(colocar(new THREE.ConeGeometry(0.22, 0.4, 4), x - lado * 0.08, y + h / 2 + t + 0.2, z, 0, ry));
    }
  }
  const g = new THREE.Group();
  g.add(malha(juntar(telas), new THREE.MeshStandardMaterial({ map: atlas.tex, roughness: 0.75, emissive: '#ffffff', emissiveMap: atlas.tex, emissiveIntensity: 0.18 })));
  g.add(malha(juntar(bordas), std(cor, { r: 0.35, m: metal }), true));
  return g;
}

// chama que tremula (cone + brilho); devolve o grupo e a animação
function chama(cor = '#ffae42', tam = 1) {
  const g = new THREE.Group();
  const c = malha(new THREE.ConeGeometry(0.06 * tam, 0.22 * tam, 8), aditivo(cor, { op: 0.95 }));
  c.position.y = 0.11 * tam; g.add(c);
  const b = brilho(cor, 0.9 * tam, 0.55); b.position.y = 0.12 * tam; g.add(b);
  const sem = Math.random() * 10;
  g.userData.animar = (t) => { const f = 0.85 + 0.15 * Math.sin(t * 13 + sem) * Math.sin(t * 7.3 + sem * 2); c.scale.set(1, f, 1); b.material.opacity = 0.4 + 0.2 * f; };
  return g;
}

// facho de luz volumétrico (cone aditivo), apontando de "de" para "para"
function facho(cor, de, para, raio = 1.6, op = 0.16) {
  const dir = para.clone().sub(de), comp = dir.length();
  const geo = new THREE.CylinderGeometry(0.12, raio, comp, 24, 1, true); geo.translate(0, -comp / 2, 0);
  const m = malha(geo, aditivo(cor, { alpha: texturaFacho(), op, fog: false }));
  m.position.copy(de); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.normalize());
  m.renderOrder = 5;
  return m;
}

// partículas leves (pó, vagalumes, pétalas, confete, faíscas)
function particulas({ n, caixa, cor = '#ffffff', tam = 0.08, vel = [0, 0.05, 0], ondula = 0.3, cores = null, op = 0.8, aditiva = true, q }) {
  n = Math.round(n * q.part); if (!n) return null;
  const pos = new Float32Array(n * 3), base = new Float32Array(n * 3), fase = new Float32Array(n);
  const [x0, x1, y0, y1, z0, z1] = caixa;
  for (let i = 0; i < n; i++) { base[i * 3] = x0 + Math.random() * (x1 - x0); base[i * 3 + 1] = y0 + Math.random() * (y1 - y0); base[i * 3 + 2] = z0 + Math.random() * (z1 - z0); fase[i] = Math.random() * 100; }
  pos.set(base);
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  if (cores) { const c = new Float32Array(n * 3), tmp = new THREE.Color(); for (let i = 0; i < n; i++) { tmp.set(cores[i % cores.length]); c.set([tmp.r, tmp.g, tmp.b], i * 3); } geo.setAttribute('color', new THREE.BufferAttribute(c, 3)); }
  const mat = new THREE.PointsMaterial({ color: cores ? '#ffffff' : cor, vertexColors: !!cores, size: tam, map: texturaBrilho('#ffffff', aditiva), transparent: true, opacity: op, depthWrite: false, blending: aditiva ? THREE.AdditiveBlending : THREE.NormalBlending, sizeAttenuation: true, toneMapped: false });
  const p = new THREE.Points(geo, mat); p.frustumCulled = false;
  const H = y1 - y0;
  p.userData.animar = (t) => {
    for (let i = 0; i < n; i++) {
      const f = fase[i], k = i * 3;
      let y = base[k + 1] + vel[1] * (t + f);
      y = y0 + (((y - y0) % H) + H) % H;
      pos[k] = base[k] + vel[0] * t + Math.sin(t * 0.7 + f) * ondula;
      pos[k + 1] = y;
      pos[k + 2] = base[k + 2] + vel[2] * t + Math.cos(t * 0.5 + f) * ondula;
    }
    geo.attributes.position.needsUpdate = true;
  };
  return p;
}

// varal de luzinhas (catenária) ao longo das paredes laterais
function varalLuzes(cor, q, alturas = [11.4], pisca = true) {
  const pts = [];
  for (const lado of LADOS) for (const yb of alturas) for (let k = 0; k < 6; k++) {
    const za = PAINEIS_Z[k] - 2.1, zb = PAINEIS_Z[k] + 2.1;
    for (let i = 0; i <= 10; i++) { const s = i / 10; pts.push(new THREE.Vector3(lado * (L / 2 - 0.35), yb - Math.sin(s * Math.PI) * 0.7, za + (zb - za) * s)); }
  }
  const geo = juntar(pts.map(p => colocar(new THREE.SphereGeometry(0.06, 6, 4), p.x, p.y, p.z)));
  const m = malha(geo, brilhante(cor));
  const g = new THREE.Group(); g.add(m);
  if (q.nivel !== 'baixa') { const pp = particulas({ n: pts.length, caixa: [0, 0, 0, 0.001, 0, 0], cor, tam: 0.45, vel: [0, 0, 0], ondula: 0, op: 0.5, q: { part: 1 } }); pp.geometry.attributes.position.array.set(pts.flatMap(p => [p.x, p.y, p.z])); pp.userData.animar = (t) => { pp.material.opacity = pisca ? 0.35 + 0.2 * Math.sin(t * 2.2) : 0.45; }; g.add(pp); }
  return g;
}

// bandeirinhas (comédia/animação)
function bandeirinhas(cores, y = 11.2) {
  const geos = [], porCor = cores.map(() => []);
  let n = 0;
  for (const lado of LADOS) for (let k = 0; k < 6; k++) {
    const za = PAINEIS_Z[k] - 2.1, zb = PAINEIS_Z[k] + 2.1;
    for (let i = 0; i < 9; i++) {
      const s = (i + 0.5) / 9, z = za + (zb - za) * s, yy = y - Math.sin(s * Math.PI) * 0.6;
      const tri = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, -0.22), new THREE.Vector3(0, 0, 0.22), new THREE.Vector3(0, -0.5, 0)]);
      tri.setIndex([0, 1, 2]); tri.computeVertexNormals();
      porCor[n++ % cores.length].push(colocar(tri, lado * (L / 2 - 0.4), yy, z));
    }
    const fio = new THREE.CylinderGeometry(0.01, 0.01, 4.2, 4); geos.push(colocar(fio, lado * (L / 2 - 0.4), y - 0.3, PAINEIS_Z[k], Math.PI / 2));
  }
  const g = new THREE.Group();
  porCor.forEach((lista, i) => g.add(malha(juntar(lista), std(cores[i], { r: 0.8, lados: true }))));
  g.add(malha(juntar(geos), std('#222')));
  return g;
}

// nuvens fofas
function nuvem(escala = 1) {
  const geos = [];
  for (let i = 0; i < 7; i++) geos.push(colocar(new THREE.SphereGeometry(0.5 + Math.random() * 0.4, 14, 10), (i - 3) * 0.45, Math.sin(i) * 0.15 + (i % 2) * 0.2, (Math.random() - 0.5) * 0.4));
  const m = malha(juntar(geos), std('#ffffff', { r: 0.95, e: '#d8e6ff', ei: 0.25 }));
  m.scale.setScalar(escala); return m;
}

// estrela 3D (extrudada)
function geoEstrela(r = 0.5, prof = 0.15) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; i ? s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  return new THREE.ExtrudeGeometry(s, { depth: prof, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2 });
}
function geoCoracao(s = 0.5, prof = 0.12) {
  const h = new THREE.Shape(); h.moveTo(0, -s);
  h.bezierCurveTo(s * 1.2, -s * 0.2, s * 0.9, s * 0.8, 0, s * 0.35); h.bezierCurveTo(-s * 0.9, s * 0.8, -s * 1.2, -s * 0.2, 0, -s);
  return new THREE.ExtrudeGeometry(h, { depth: prof, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2 });
}

// pontos dos corredores laterais (piso)
function corredor(lista = [-10.5, -4.5, 1.5, 9.5]) { const r = []; for (const lado of LADOS) for (const z of lista) r.push({ lado, x: lado * CORREDOR_X, z, y: alturaPiso(z) }); return r; }

// ---------------------------------------------------------------- temas

function terror(q) {
  const c = {};
  c.paredes = quadros({ pinturas: [PINTURAS.retrato, PINTURAS.casaAssombrada, PINTURAS.corredor, PINTURAS.luaDeSangue], cor: '#2a1d14', estilo: 'ornado', metal: 0.3, q });
  // candelabros de ferro com velas nos corredores
  c.piso = new THREE.Group();
  const ferro = std('#16120f', { r: 0.45, m: 0.8 }), cera = std('#d8cfb8', { r: 0.9 });
  const pes = [], velas = [], chamas = [];
  for (const p of corredor(q.nivel === 'baixa' ? [-4.5, 9.5] : undefined)) {
    const perfil = [[0.35, 0], [0.3, 0.05], [0.08, 0.15], [0.06, 1.4], [0.12, 1.5], [0.05, 1.6], [0.05, 1.9]].map(([x, y]) => new THREE.Vector2(x, y));
    pes.push(colocar(new THREE.LatheGeometry(perfil, 10), p.x, p.y, p.z));
    pes.push(colocar(new THREE.TorusGeometry(0.42, 0.03, 6, 20, Math.PI), p.x, p.y + 1.9, p.z, 0, Math.PI / 2, Math.PI));
    for (const dz of [-0.42, 0, 0.42]) {
      const hv = dz ? 0.35 : 0.5, yv = p.y + 1.9 + (dz ? 0 : 0.1);
      velas.push(colocar(new THREE.CylinderGeometry(0.05, 0.05, hv, 8), p.x, yv + hv / 2, p.z + dz));
      const f = chama('#ffb347', 1); f.position.set(p.x, yv + hv, p.z + dz); chamas.push(f);
    }
  }
  c.piso.add(malha(juntar(pes), ferro, true), malha(juntar(velas), cera));
  chamas.forEach(f => c.piso.add(f));
  // teias nos cantos de cima
  c.teto = new THREE.Group();
  const teia = [];
  for (const [x, z, sx, sz] of [[-L / 2, TELA.z - 0.6, 1, -1], [L / 2, TELA.z - 0.6, -1, -1], [-L / 2, Z_FUNDO + 0.1, 1, 1], [L / 2, Z_FUNDO + 0.1, -1, 1]]) {
    const R = 2.4;
    for (let i = 0; i <= 6; i++) { const a = i / 6 * Math.PI / 2; teia.push(new THREE.Vector3(x, A - 0.05, z), new THREE.Vector3(x + sx * Math.cos(a) * R, A - 0.05 - Math.sin(a) * R, z)); }
    for (let r = 0.5; r <= R; r += 0.45) for (let i = 0; i < 6; i++) { const a1 = i / 6 * Math.PI / 2, a2 = (i + 1) / 6 * Math.PI / 2; teia.push(new THREE.Vector3(x + sx * Math.cos(a1) * r, A - 0.05 - Math.sin(a1) * r, z + sz * 0.02), new THREE.Vector3(x + sx * Math.cos(a2) * r * 0.92, A - 0.05 - Math.sin(a2) * r * 0.92, z + sz * 0.02)); }
  }
  c.teto.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(teia), new THREE.LineBasicMaterial({ color: '#8a8a8a', transparent: true, opacity: 0.45 })));
  // névoa rasteira (planos que deslizam) + poeira
  c.particulas = new THREE.Group();
  if (q.nivel !== 'baixa') {
    const nv = texturaNevoa();
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(26, 6), new THREE.MeshBasicMaterial({ map: nv.clone(), color: '#8a7aa0', transparent: true, opacity: 0.35, depthWrite: false, fog: false }));
      m.material.map.needsUpdate = true; m.rotation.x = -Math.PI / 2; m.position.set(0, 0.35 + i * 0.25, TELA.z - 3 - i * 0.3);
      const sem = i * 1.7; m.userData.animar = (t) => { m.material.map.offset.x = t * 0.012 + sem; m.material.opacity = 0.25 + 0.08 * Math.sin(t * 0.4 + sem); };
      c.particulas.add(m);
    }
    const po = particulas({ n: 90, caixa: [-12, 12, 1, 11, -14, 13], cor: '#c8b8ff', tam: 0.06, vel: [0, -0.03, 0], ondula: 0.4, op: 0.5, q }); if (po) c.particulas.add(po);
  }
  c.luzes = corredor([-4.5, 9.5]).map(p => ({ pos: [p.x, p.y + 2.4, p.z], cor: '#ff9a3a', int: 6, dist: 7, tremer: true }));
  return c;
}

function acao(q) {
  const c = {};
  // placas metálicas com setas de LED que "correm" em direção ao telão
  c.paredes = new THREE.Group();
  const placa = [], faixas = [], setas = [];
  const metal = std('#3a3f48', { r: 0.35, m: 0.85, map: texturaSuperficie('metal', q.tex) });
  for (const lado of LADOS) for (const k of [0, 1, 2, 3, 4, 5]) {
    const z = PAINEIS_Z[k], x = lado * (L / 2 - 0.22), ry = naParedeRotY(lado);
    placa.push(colocar(new THREE.BoxGeometry(2.8, 1.3, 0.08), x, 3.6, z, 0, ry));
    faixas.push(colocar(new THREE.PlaneGeometry(2.8, 0.25), x - lado * 0.05, 3.05, z, 0, ry));
    for (let s = 0; s < 3; s++) {
      const sh = new THREE.Shape([[-0.3, 0.3], [0, 0], [-0.3, -0.3], [-0.15, -0.3], [0.15, 0], [-0.15, 0.3]].map(([a, b]) => new THREE.Vector2(a, b)));
      const g = new THREE.ShapeGeometry(sh); g.rotateY(Math.PI / 2 * (lado < 0 ? 1 : -1)); if (lado < 0) g.scale(1, 1, -1); // seta aponta para +z (telão)
      setas.push({ geo: colocar(g, x - lado * 0.06, 3.7, z - 0.7 + s * 0.65), ordem: s });
    }
  }
  c.paredes.add(malha(juntar(placa), metal, true));
  const listra = texturaSuperficie('listras', 128).clone(); listra.repeat.set(3, 1); listra.needsUpdate = true;
  c.paredes.add(malha(juntar(faixas), new THREE.MeshBasicMaterial({ map: listra, color: '#ffb000' })));
  const matsSeta = [0, 1, 2].map(() => brilhante('#ff5a1f', { lados: true }));
  [0, 1, 2].forEach(o => c.paredes.add(malha(juntar(setas.filter(s => s.ordem === o).map(s => s.geo)), matsSeta[o])));
  c.paredes.userData.animar = (t) => { const f = Math.floor(t * 4) % 3; matsSeta.forEach((m, i) => m.color.set(i === f ? '#ffd0a0' : '#ff5a1f')); };
  // caixotes e tambores nos corredores
  c.piso = new THREE.Group();
  const madeira = std('#6b4a2b', { r: 0.8, map: texturaSuperficie('madeira', q.tex) }), tambor = std('#a0221a', { r: 0.4, m: 0.6 }), aro = std('#1a1a1a', { r: 0.4, m: 0.8 });
  const cx = [], tb = [], ar = [];
  for (const p of corredor(q.nivel === 'baixa' ? [-4.5, 9.5] : [-10.5, -4.5, 1.5, 9.5])) {
    cx.push(colocar(new THREE.BoxGeometry(1, 1, 1), p.x - p.lado * 0.2, p.y + 0.5, p.z, 0, 0.2));
    cx.push(colocar(new THREE.BoxGeometry(0.8, 0.8, 0.8), p.x - p.lado * 0.15, p.y + 1.4, p.z + 0.05, 0, -0.3));
    tb.push(colocar(new THREE.CylinderGeometry(0.33, 0.33, 1.05, 16), p.x + p.lado * 0.25, p.y + 0.525, p.z + 1.0));
    for (const yy of [0.2, 0.85]) ar.push(colocar(new THREE.TorusGeometry(0.335, 0.025, 6, 20), p.x + p.lado * 0.25, p.y + yy, p.z + 1.0, Math.PI / 2));
  }
  c.piso.add(malha(juntar(cx), madeira, true), malha(juntar(tb), tambor, true), malha(juntar(ar), aro));
  // treliça de iluminação no teto + fachos que varrem a plateia
  c.teto = new THREE.Group();
  const tr = [];
  for (const z of [-6, 4]) { for (const y of [11.2, 11.8]) for (const dz of [-0.3, 0.3]) tr.push(colocar(new THREE.BoxGeometry(L - 1, 0.06, 0.06), 0, y, z + dz)); for (let x = -12; x <= 12; x += 1) tr.push(colocar(new THREE.BoxGeometry(0.04, 0.85, 0.04), x, 11.5, z, 0.5 * (x % 2 ? 1 : -1))); }
  c.teto.add(malha(juntar(tr), std('#2a2d33', { r: 0.4, m: 0.9 })));
  if (q.nivel !== 'baixa') {
    const fachos = [['#ff5a1f', -8], ['#1fa3ff', 8]].map(([cor, x]) => { const f = facho(cor, new THREE.Vector3(x, 11.4, 4), new THREE.Vector3(x * 0.3, 0, -4), 2.2, 0.13); c.teto.add(f); return f; });
    c.teto.userData.animar = (t) => fachos.forEach((f, i) => { const a = Math.sin(t * 0.6 + i * Math.PI) * 0.45; f.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(Math.sin(a) - (i ? 0.3 : -0.3), -1, Math.cos(t * 0.4 + i) * 0.5 - 0.4).normalize()); });
  }
  // faixa de advertência na frente do palco
  c.palco = new THREE.Group();
  const lis = texturaSuperficie('listras', 128).clone(); lis.repeat.set(30, 1); lis.rotation = 0.6; lis.needsUpdate = true;
  const fx = malha(new THREE.PlaneGeometry(L - 0.4, 0.3), new THREE.MeshBasicMaterial({ map: lis, color: '#ffb000' })); fx.position.set(0, 0.6, TELA.z - 2.01); fx.rotation.y = Math.PI; c.palco.add(fx);
  c.particulas = particulas({ n: 70, caixa: [-11, 11, 0.9, 6, 12.8, 14.8], cor: '#ff8a2a', tam: 0.07, vel: [0, 0.6, 0], ondula: 0.15, op: 0.9, q });
  c.luzes = [{ pos: [-8, 10, 4], cor: '#ff5a1f', int: 10, dist: 16 }, { pos: [8, 10, 4], cor: '#1fa3ff', int: 10, dist: 16 }];
  return c;
}

function scifi(q) {
  const c = {};
  // colmeias hexagonais com bordas luminosas nos painéis
  c.paredes = new THREE.Group();
  const hex = [], bordas = [];
  for (const lado of LADOS) for (const k of [0, 1, 2, 3, 4, 5]) {
    const z0 = PAINEIS_Z[k], x = lado * (L / 2 - 0.25);
    for (let i = 0; i < 7; i++) {
      const col = i % 3, lin = Math.floor(i / 3);
      if (lin === 2 && col !== 1) continue;
      const zz = z0 + (col - 1) * 0.92, yy = 4 + lin * 0.8 + (col % 2) * 0.4;
      hex.push(colocar(new THREE.CylinderGeometry(0.5, 0.5, 0.12, 6), x, yy, zz, 0, 0, Math.PI / 2));
      bordas.push(colocar(new THREE.TorusGeometry(0.47, 0.025, 4, 6), x - lado * 0.07, yy, zz, 0, naParedeRotY(lado), Math.PI / 6));
    }
  }
  c.paredes.add(malha(juntar(hex), std('#1a2238', { r: 0.25, m: 0.8 }), true));
  const matBorda = brilhante('#00e5ff'); c.paredes.add(malha(juntar(bordas), matBorda));
  c.paredes.userData.animar = (t) => matBorda.color.setHSL(0.52 + 0.05 * Math.sin(t * 0.8), 1, 0.5 + 0.08 * Math.sin(t * 2));
  // consoles com telas e colunas de luz
  c.piso = new THREE.Group();
  const cons = [], telas = [], pilares = [];
  for (const p of corredor(q.nivel === 'baixa' ? [1.5] : [-4.5, 1.5, 9.5])) {
    cons.push(colocar(new THREE.BoxGeometry(0.7, 1, 1.4), p.x, p.y + 0.5, p.z));
    telas.push(colocar(new THREE.PlaneGeometry(1.3, 0.6), p.x - p.lado * 0.36, p.y + 1.25, p.z, 0, naParedeRotY(p.lado), 0));
    pilares.push(colocar(new THREE.CylinderGeometry(0.05, 0.05, 6, 8), p.x + p.lado * 0.9, p.y + 3, p.z + 1.6));
  }
  c.piso.add(malha(juntar(cons), std('#141a2a', { r: 0.3, m: 0.8 }), true));
  const tTela = atlasQuadros([PINTURAS.planeta, PINTURAS.nebulosa], 192, 96).tex;
  c.piso.add(malha(juntar(telas), new THREE.MeshBasicMaterial({ map: tTela, toneMapped: false, side: THREE.DoubleSide })));
  c.piso.add(malha(juntar(pilares), brilhante('#8a4dff')));
  // anéis holográficos girando sobre a plateia
  c.teto = new THREE.Group();
  const aneis = [];
  for (const [z, r] of [[-8, 2.4], [-1, 3], [6, 2.2]]) {
    const a = malha(new THREE.TorusGeometry(r, 0.04, 6, 64), aditivo('#00e5ff', { op: 0.75 })); a.position.set(0, 10.8, z); a.rotation.x = Math.PI / 2;
    const b = malha(new THREE.TorusGeometry(r * 0.75, 0.02, 4, 48), aditivo('#b07bff', { op: 0.6 })); b.position.copy(a.position); b.rotation.x = Math.PI / 2;
    c.teto.add(a, b); aneis.push([a, b]);
  }
  c.teto.userData.animar = (t) => aneis.forEach(([a, b], i) => { a.rotation.y = Math.sin(t * 0.5 + i) * 0.25; a.rotation.z = t * 0.2 + i; b.rotation.z = -t * 0.35; b.rotation.x = Math.PI / 2 + Math.sin(t * 0.7 + i) * 0.2; });
  c.particulas = particulas({ n: 160, caixa: [-12, 12, 1, 12, -15, 14], cor: '#7fe9ff', tam: 0.05, vel: [0, 0.04, 0], ondula: 0.25, op: 0.7, q });
  c.luzes = [{ pos: [-10, 6, -2], cor: '#00e5ff', int: 8, dist: 14 }, { pos: [10, 6, 6], cor: '#8a4dff', int: 8, dist: 14 }];
  return c;
}

function romance(q) {
  const c = {};
  c.paredes = quadros({ pinturas: [PINTURAS.porDoSol, PINTURAS.rosas, PINTURAS.paris, PINTURAS.coracoes], cor: '#c9a24a', estilo: 'ornado', metal: 0.9, q });
  c.paredes.add(varalLuzes('#ffd9a0', q));
  // lustres dourados com cristais
  c.teto = new THREE.Group();
  const ouro = std('#d4af37', { r: 0.25, m: 1 });
  for (const z of q.nivel === 'baixa' ? [-2] : [-8, 3]) {
    const g = new THREE.Group(); g.position.set(0, 10.6, z);
    const perfil = [[0.02, 2.2], [0.05, 1.2], [0.25, 1.0], [0.1, 0.8], [0.4, 0.5], [0.15, 0.2], [0.02, 0]].map(([x, y]) => new THREE.Vector2(x, y));
    const partes = [new THREE.LatheGeometry(perfil, 12)];
    const cristais = [], chamas = [];
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2;
      partes.push(colocar(new THREE.TorusGeometry(0.6, 0.025, 6, 16, Math.PI), Math.cos(a) * 0.6, 0.5, Math.sin(a) * 0.6, 0, -a, Math.PI));
      partes.push(colocar(new THREE.CylinderGeometry(0.06, 0.04, 0.1, 8), Math.cos(a) * 1.2, 0.55, Math.sin(a) * 1.2));
      cristais.push(colocar(new THREE.OctahedronGeometry(0.07), Math.cos(a) * 1.0, 0.2, Math.sin(a) * 1.0, 0, 0, 0, 1));
      const f = chama('#ffcf8a', 0.9); f.position.set(Math.cos(a) * 1.2, 0.6, Math.sin(a) * 1.2); chamas.push(f);
    }
    g.add(malha(juntar(partes), ouro, true), malha(juntar(cristais), std('#ffffff', { r: 0.05, m: 0.2, e: '#ffe0f0', ei: 0.6 })));
    chamas.forEach(f => g.add(f)); const bl = brilho('#ffb38a', 4, 0.35); bl.position.y = 0.5; g.add(bl);
    c.teto.add(g);
  }
  // vasos com rosas nos corredores
  c.piso = new THREE.Group();
  const vasos = [], rosas = [], folhas = [];
  for (const p of corredor(q.nivel === 'baixa' ? [1.5] : [-4.5, 1.5, 9.5])) {
    const perfil = [[0, 0], [0.22, 0], [0.32, 0.25], [0.2, 0.75], [0.14, 0.9], [0.22, 1.05]].map(([x, y]) => new THREE.Vector2(x, y));
    vasos.push(colocar(new THREE.LatheGeometry(perfil, 16), p.x, p.y, p.z));
    for (let i = 0; i < 9; i++) {
      const a = i * 2.4, r = 0.12 + (i % 3) * 0.08;
      rosas.push(colocar(new THREE.DodecahedronGeometry(0.09, 0), p.x + Math.cos(a) * r, p.y + 1.25 + (i % 3) * 0.08, p.z + Math.sin(a) * r));
      folhas.push(colocar(new THREE.ConeGeometry(0.04, 0.25, 4), p.x + Math.cos(a) * r * 1.3, p.y + 1.1, p.z + Math.sin(a) * r * 1.3, 0.6, a));
    }
  }
  c.piso.add(malha(juntar(vasos), std('#f2ede4', { r: 0.25, m: 0.1 }), true), malha(juntar(rosas), std('#b0123a', { r: 0.6, flat: true })), malha(juntar(folhas), std('#2f6a2a', { r: 0.7 })));
  c.particulas = particulas({ n: 70, caixa: [-12, 12, 1, 11, -14, 13], cores: ['#ff8aa6', '#ffd38a', '#ff5a7a'], tam: 0.12, vel: [0, -0.15, 0], ondula: 0.6, op: 0.75, aditiva: false, q });
  c.luzes = [{ pos: [0, 9.5, -8], cor: '#ffb38a', int: 7, dist: 12 }, { pos: [0, 9.5, 3], cor: '#ff8aa6', int: 7, dist: 12 }];
  return c;
}

function comedia(q) {
  const c = {};
  c.paredes = quadros({ pinturas: [PINTURAS.mascaraRiso, PINTURAS.bananas, PINTURAS.claquete], cor: '#ff3d7f', estilo: 'simples', metal: 0.1, w: 2.2, h: 2.6, q });
  c.teto = bandeirinhas(['#ffd23f', '#3ddc97', '#ff595e', '#1982c4', '#ff70a6']);
  // cachos de balões amarrados nos corredores
  c.piso = new THREE.Group();
  const cores = ['#ff595e', '#ffca3a', '#8ac926', '#1982c4', '#ff70a6'];
  const porCor = cores.map(() => []), fios = [], pesos = [];
  for (const p of corredor(q.nivel === 'baixa' ? [1.5] : [-4.5, 1.5, 9.5])) {
    for (let i = 0; i < 5; i++) {
      const a = i * 1.26, bx = p.x + Math.cos(a) * 0.35, bz = p.z + Math.sin(a) * 0.35, by = p.y + 2.6 + (i % 2) * 0.45;
      const b = new THREE.SphereGeometry(0.32, 14, 10); b.scale(1, 1.18, 1); porCor[i].push(colocar(b, bx, by, bz));
      const fio = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(p.x, p.y + 0.15, p.z), new THREE.Vector3(bx, by - 0.38, bz)]); fios.push(fio);
    }
    pesos.push(colocar(new THREE.CylinderGeometry(0.12, 0.16, 0.18, 10), p.x, p.y + 0.09, p.z));
  }
  const baloes = porCor.map((l, i) => malha(juntar(l), new THREE.MeshStandardMaterial({ color: cores[i], roughness: 0.2, metalness: 0.1 })));
  baloes.forEach(b => c.piso.add(b));
  c.piso.add(new THREE.LineSegments(juntarLinhas(fios), new THREE.LineBasicMaterial({ color: '#dddddd' })), malha(juntar(pesos), std('#ffd23f', { r: 0.3, m: 0.6 })));
  c.piso.userData.animar = (t) => baloes.forEach((b, i) => { b.position.y = Math.sin(t * 1.2 + i) * 0.06; });
  // baldes gigantes de pipoca nas pontas do palco
  c.palco = new THREE.Group();
  for (const lado of LADOS) {
    const g = new THREE.Group(); g.position.set(lado * 11.8, 0.9, TELA.z - 1.2);
    const tex = texturaSuperficie('listras', 128).clone(); tex.repeat.set(2, 1); tex.needsUpdate = true;
    const balde = malha(new THREE.CylinderGeometry(0.6, 0.45, 1.3, 16, 1, true), new THREE.MeshStandardMaterial({ map: tex, color: '#ff4040', roughness: 0.5, side: THREE.DoubleSide })); balde.position.y = 0.65;
    const pip = []; for (let i = 0; i < 40; i++) { const a = Math.random() * 6.28, r = Math.random() * 0.5; pip.push(colocar(new THREE.IcosahedronGeometry(0.1 + Math.random() * 0.05, 0), Math.cos(a) * r, 1.3 + Math.random() * 0.3 * (1 - r), Math.sin(a) * r)); }
    g.add(balde, malha(juntar(pip), std('#fff4d0', { r: 0.9, flat: true }))); c.palco.add(g);
  }
  c.particulas = particulas({ n: 110, caixa: [-12, 12, 0.5, 12, -14, 13], cores: ['#ff595e', '#ffca3a', '#8ac926', '#1982c4', '#ff70a6'], tam: 0.09, vel: [0, -0.4, 0], ondula: 0.3, op: 0.9, aditiva: false, q });
  c.luzes = [{ pos: [-9, 9, 0], cor: '#ffd23f', int: 8, dist: 16 }, { pos: [9, 9, 6], cor: '#ff70a6', int: 8, dist: 16 }];
  return c;
}
function juntarLinhas(lista) { const pts = []; for (const g of lista) { const p = g.attributes.position; for (let i = 0; i < p.count; i++) pts.push(new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i))); } return new THREE.BufferGeometry().setFromPoints(pts); }

function animacao(q) {
  const c = {};
  // estrelas 3D coloridas nos painéis
  c.paredes = new THREE.Group();
  const cores = ['#ffca3a', '#ff70a6', '#70d6ff', '#8ac926'];
  const porCor = cores.map(() => []);
  let n = 0;
  for (const lado of LADOS) for (const k of [0, 1, 2, 3, 4, 5]) for (const [dz, yy, s] of [[-0.6, 6.2, 0.7], [0.7, 4.6, 0.5], [-0.2, 3.3, 0.35]]) {
    const g = geoEstrela(s, 0.12); g.rotateY(naParedeRotY(lado)); porCor[n++ % 4].push(colocar(g, lado * (L / 2 - 0.3), yy, PAINEIS_Z[k] + dz));
  }
  const mats = cores.map(cc => std(cc, { r: 0.35, e: cc, ei: 0.25 }));
  porCor.forEach((l, i) => c.paredes.add(malha(juntar(l), mats[i], true)));
  c.paredes.add(quadros({ pinturas: [PINTURAS.arcoIris, PINTURAS.foguete], cor: '#70d6ff', w: 1.6, h: 1.3, y: 8.4, painel: [0, 2, 4, 5], metal: 0.1, q }));
  c.paredes.userData.animar = (t) => mats.forEach((m, i) => { m.emissiveIntensity = 0.2 + 0.2 * (0.5 + 0.5 * Math.sin(t * 2 + i * 1.6)); });
  // nuvens que passeiam pelo teto
  c.teto = new THREE.Group();
  const nuvens = [];
  for (let i = 0; i < (q.nivel === 'baixa' ? 3 : 6); i++) { const nv = nuvem(0.9 + Math.random() * 0.6); nv.position.set(-9 + i * 3.6, 10.6 + Math.random() * 0.8, -12 + (i * 5.3) % 24); c.teto.add(nv); nuvens.push(nv); }
  c.teto.userData.animar = (t) => nuvens.forEach((nv, i) => { nv.position.x = ((-11 + i * 3.6 + t * 0.25) % 22 + 22) % 22 - 11; nv.position.y += Math.sin(t + i) * 0.0015; });
  // blocos de brinquedo nos corredores
  c.piso = new THREE.Group();
  const blocos = cores.map(() => []);
  let b = 0;
  for (const p of corredor(q.nivel === 'baixa' ? [1.5] : [-4.5, 1.5, 9.5])) for (const [dx, dy, dz, r] of [[0, 0.35, 0, 0.1], [0.15, 0.35, 0.75, -0.2], [0.05, 1.05, 0.35, 0.4]]) blocos[b++ % 4].push(colocar(new THREE.BoxGeometry(0.7, 0.7, 0.7), p.x + dx * -p.lado, p.y + dy, p.z + dz, 0, r));
  blocos.forEach((l, i) => c.piso.add(malha(juntar(l), std(cores[i], { r: 0.3 }), true)));
  // lápis de cor gigantes nas pontas do palco
  c.palco = new THREE.Group();
  for (const lado of LADOS) for (let i = 0; i < 3; i++) {
    const g = new THREE.Group(); const cor = cores[(i + (lado > 0 ? 1 : 0)) % 4];
    const corpo = malha(new THREE.CylinderGeometry(0.15, 0.15, 2.2, 6), std(cor, { r: 0.4 })); corpo.position.y = 1.1;
    const ponta = malha(new THREE.ConeGeometry(0.15, 0.4, 6), std('#f2d7a0')); ponta.position.y = 2.4;
    const grafite = malha(new THREE.ConeGeometry(0.05, 0.14, 6), std(cor)); grafite.position.y = 2.55;
    g.add(corpo, ponta, grafite); g.position.set(lado * (11.4 + i * 0.4), 0.9, TELA.z - 1.4 + i * 0.25); g.rotation.z = lado * (0.1 + i * 0.08); c.palco.add(g);
  }
  c.particulas = particulas({ n: 90, caixa: [-12, 12, 1, 12, -14, 13], cores: ['#fff7a8', '#ffffff', '#ff9ad8'], tam: 0.1, vel: [0, 0.05, 0], ondula: 0.5, op: 0.85, q });
  c.luzes = [{ pos: [-9, 9, 0], cor: '#70d6ff', int: 8, dist: 16 }, { pos: [9, 9, 6], cor: '#ff70a6', int: 8, dist: 16 }];
  return c;
}

function aventura(q) {
  const c = {};
  c.paredes = quadros({ pinturas: [PINTURAS.mapaTesouro, PINTURAS.templo, PINTURAS.navio], cor: '#5a3a1e', estilo: 'simples', metal: 0.1, q });
  // tochas entre os painéis
  const ferro = std('#2a2420', { r: 0.5, m: 0.8 });
  const sup = [], chamas = [];
  for (const lado of LADOS) for (const z of ENTRE_Z) {
    const x = lado * (L / 2 - 0.35);
    sup.push(colocar(new THREE.CylinderGeometry(0.07, 0.04, 0.8, 8), x, 7.2, z, 0, 0, lado * 0.5));
    sup.push(colocar(new THREE.CylinderGeometry(0.14, 0.08, 0.22, 8, 1, true), x - lado * 0.2, 7.6, z));
    if (q.nivel !== 'baixa' || z > 0) { const f = chama('#ff9a2a', 1.6); f.position.set(x - lado * 0.2, 7.65, z); chamas.push(f); }
  }
  c.paredes.add(malha(juntar(sup), ferro)); chamas.forEach(f => c.paredes.add(f));
  // baús e barris nos corredores
  c.piso = new THREE.Group();
  const madeira = std('#6b4423', { r: 0.8, map: texturaSuperficie('madeira', q.tex) }), dourado = std('#d4a72c', { r: 0.3, m: 1 });
  const caixas = [], tampas = [], ferragens = [], barris = [];
  for (const p of corredor(q.nivel === 'baixa' ? [1.5] : [-4.5, 1.5, 9.5])) {
    caixas.push(colocar(new THREE.BoxGeometry(0.8, 0.55, 1.2), p.x, p.y + 0.275, p.z));
    const tampa = new THREE.CylinderGeometry(0.4, 0.4, 1.2, 12, 1, false, 0, Math.PI); tampas.push(colocar(tampa, p.x, p.y + 0.55, p.z, Math.PI / 2, 0, Math.PI / 2));
    for (const dz of [-0.45, 0.45]) ferragens.push(colocar(new THREE.BoxGeometry(0.84, 0.6, 0.06), p.x, p.y + 0.3, p.z + dz));
    ferragens.push(colocar(new THREE.BoxGeometry(0.1, 0.16, 0.06), p.x - p.lado * 0.42, p.y + 0.5, p.z, 0, Math.PI / 2));
    const perfil = []; for (let i = 0; i <= 8; i++) { const s = i / 8; perfil.push(new THREE.Vector2(0.32 + Math.sin(s * Math.PI) * 0.07, s * 1)); }
    barris.push(colocar(new THREE.LatheGeometry(perfil, 14), p.x + p.lado * 0.2, p.y, p.z + 1.3));
  }
  c.piso.add(malha(juntar(caixas), madeira, true), malha(juntar(tampas), madeira, true), malha(juntar(ferragens), dourado), malha(juntar(barris), madeira, true));
  // lanternas penduradas
  c.teto = new THREE.Group();
  for (const [x, z] of [[-6, -6], [6, -6], [-6, 4], [6, 4]].slice(0, q.nivel === 'baixa' ? 2 : 4)) {
    const g = new THREE.Group(); g.position.set(x, 9.8, z);
    g.add(malha(new THREE.CylinderGeometry(0.01, 0.01, 3.2, 4), ferro).translateY(1.7));
    g.add(malha(new THREE.CylinderGeometry(0.22, 0.26, 0.5, 6, 1, true), std('#2a2420', { r: 0.5, m: 0.8, lados: true })));
    g.add(malha(new THREE.SphereGeometry(0.15, 10, 8), brilhante('#ffc070')), brilho('#ffb050', 2.2, 0.55));
    c.teto.add(g);
  }
  c.particulas = particulas({ n: 90, caixa: [-12, 12, 1, 11, -14, 13], cor: '#ffd890', tam: 0.05, vel: [0.02, 0.02, 0], ondula: 0.5, op: 0.6, q });
  c.luzes = corredor([-4.5, 9.5]).map(p => ({ pos: [p.lado * (L / 2 - 1), 7.6, p.z + 2], cor: '#ff9a2a', int: 7, dist: 9, tremer: true }));
  return c;
}

function fantasia(q) {
  const c = {};
  c.paredes = quadros({ pinturas: [PINTURAS.dragao, PINTURAS.castelo, PINTURAS.cristalMagico], cor: '#8a6a2a', estilo: 'ornado', metal: 0.8, q });
  // estandartes com brasão entre os painéis
  const brasao = atlasQuadros([function brasao(g, w, h) {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#2a1a5a'); gr.addColorStop(1, '#14103a'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = '#d4af37'; g.fillRect(0, 0, w, h * 0.04); g.fillRect(0, h * 0.96, w, h * 0.04);
    g.beginPath(); g.moveTo(w * 0.25, h * 0.3); g.lineTo(w * 0.75, h * 0.3); g.lineTo(w * 0.75, h * 0.55); g.quadraticCurveTo(w * 0.75, h * 0.75, w * 0.5, h * 0.82); g.quadraticCurveTo(w * 0.25, h * 0.75, w * 0.25, h * 0.55); g.closePath(); g.fill();
    g.fillStyle = '#3fd0a0'; g.beginPath(); g.moveTo(w * 0.5, h * 0.36); g.lineTo(w * 0.62, h * 0.52); g.lineTo(w * 0.5, h * 0.7); g.lineTo(w * 0.38, h * 0.52); g.fill();
  }], 128, 320);
  const est = [];
  for (const lado of LADOS) for (const z of ENTRE_Z) {
    const pg = new THREE.PlaneGeometry(1.1, 3.2, 1, 8); const pos = pg.attributes.position;
    for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); pos.setZ(i, Math.sin(y * 2) * 0.06); if (y < -1.5 && Math.abs(pos.getX(i)) < 0.1) pos.setY(i, y - 0.25); }
    pg.computeVertexNormals(); est.push(colocar(pg, lado * (L / 2 - 0.3), 9.9, z, 0, naParedeRotY(lado)));
  }
  c.paredes.add(malha(juntar(est), new THREE.MeshStandardMaterial({ map: brasao.tex, roughness: 0.8, side: THREE.DoubleSide })));
  // cristais luminosos nos corredores
  c.piso = new THREE.Group();
  const cr1 = [], cr2 = [];
  for (const p of corredor(q.nivel === 'baixa' ? [1.5] : [-10.5, -4.5, 1.5, 9.5])) for (let i = 0; i < 5; i++) {
    const g = new THREE.OctahedronGeometry(0.25 + (i % 3) * 0.12, 0); g.scale(0.6, 2.2, 0.6);
    (i % 2 ? cr1 : cr2).push(colocar(g, p.x + Math.cos(i * 1.3) * 0.35, p.y + 0.5 + (i % 3) * 0.15, p.z + Math.sin(i * 1.3) * 0.35, Math.cos(i) * 0.3, i, Math.sin(i * 2) * 0.35));
  }
  const m1 = std('#3fd0a0', { r: 0.1, m: 0.1, e: '#3fd0a0', ei: 0.7, flat: true }), m2 = std('#a06aff', { r: 0.1, m: 0.1, e: '#a06aff', ei: 0.7, flat: true });
  c.piso.add(malha(juntar(cr1), m1, true), malha(juntar(cr2), m2, true));
  c.piso.userData.animar = (t) => { m1.emissiveIntensity = 0.5 + 0.3 * Math.sin(t * 1.4); m2.emissiveIntensity = 0.5 + 0.3 * Math.sin(t * 1.1 + 2); };
  // orbes flutuantes
  c.teto = new THREE.Group();
  const orbes = [];
  for (let i = 0; i < (q.nivel === 'baixa' ? 3 : 7); i++) {
    const g = new THREE.Group(); const cor = ['#ffd27a', '#7affd8', '#c49aff'][i % 3];
    g.add(malha(new THREE.SphereGeometry(0.16, 12, 10), brilhante(cor)), brilho(cor, 1.8, 0.6));
    g.position.set(-9 + i * 3, 10 + (i % 2), -12 + (i * 4.1) % 24); c.teto.add(g); orbes.push(g);
  }
  c.teto.userData.animar = (t) => orbes.forEach((o, i) => { o.position.y = 10.2 + Math.sin(t * 0.8 + i) * 0.5; o.position.x += Math.sin(t * 0.3 + i) * 0.003; });
  c.particulas = particulas({ n: 120, caixa: [-12, 12, 0.6, 9, -14, 13], cores: ['#d8ff7a', '#ffe27a', '#7affd8'], tam: 0.09, vel: [0, 0.03, 0], ondula: 0.8, op: 0.9, q });
  c.luzes = [{ pos: [-11, 3, 1.5], cor: '#3fd0a0', int: 6, dist: 8 }, { pos: [11, 3, -4.5], cor: '#a06aff', int: 6, dist: 8 }];
  return c;
}

function drama(q) {
  const c = {};
  c.paredes = quadros({ pinturas: [PINTURAS.perfil, PINTURAS.janelaChuva, PINTURAS.palcoVazio], cor: '#141414', estilo: 'simples', metal: 0.2, w: 2, h: 2.6, q });
  // aletas art déco de latão ao lado dos neons
  const lat = [];
  for (const lado of LADOS) for (const z of ENTRE_Z) for (const dz of [-0.25, 0.25]) lat.push(colocar(new THREE.BoxGeometry(0.08, 5.5, 0.12), lado * (L / 2 - 0.15), 5.6, z + dz));
  c.paredes.add(malha(juntar(lat), std('#b08d57', { r: 0.3, m: 1 })));
  // máscaras de teatro douradas acima das cortinas
  c.palco = new THREE.Group();
  const ouro = std('#d4af37', { r: 0.25, m: 1 });
  for (const [lado, triste] of [[-1, false], [1, true]]) {
    const s = new THREE.Shape();
    s.absellipse(0, 0, 0.7, 0.9, 0, Math.PI * 2, false, 0);
    for (const ox of [-0.27, 0.27]) { const o = new THREE.Path(); o.absellipse(ox, 0.2, 0.15, 0.09, 0, Math.PI * 2, true, 0); s.holes.push(o); }
    const b = new THREE.Path();
    if (triste) { b.moveTo(-0.3, -0.55); b.quadraticCurveTo(0, -0.15, 0.3, -0.55); b.quadraticCurveTo(0, -0.33, -0.3, -0.55); }
    else { b.moveTo(-0.32, -0.25); b.quadraticCurveTo(0, -0.7, 0.32, -0.25); b.quadraticCurveTo(0, -0.45, -0.32, -0.25); }
    s.holes.push(b);
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.06, bevelSegments: 3, curveSegments: 16 });
    const m = malha(geo, ouro, true); m.position.set(lado * 10.4, 11.2, TELA.z - 0.75); m.rotation.set(0, Math.PI, lado * -0.25); c.palco.add(m);
  }
  // abajures de pé nos corredores
  c.piso = new THREE.Group();
  const pes = [], cups = [], brilhos = [];
  for (const p of corredor(q.nivel === 'baixa' ? [1.5] : [-4.5, 1.5, 9.5])) {
    pes.push(colocar(new THREE.CylinderGeometry(0.03, 0.03, 1.7, 6), p.x, p.y + 0.85, p.z), colocar(new THREE.CylinderGeometry(0.25, 0.28, 0.05, 16), p.x, p.y + 0.025, p.z));
    cups.push(colocar(new THREE.CylinderGeometry(0.22, 0.38, 0.45, 18, 1, true), p.x, p.y + 1.85, p.z));
    const b = brilho('#ffd9a0', 2, 0.45); b.position.set(p.x, p.y + 1.8, p.z); brilhos.push(b);
  }
  c.piso.add(malha(juntar(pes), std('#b08d57', { r: 0.3, m: 1 })), malha(juntar(cups), std('#f2e2c4', { r: 0.9, e: '#ffcf8a', ei: 0.6, lados: true })));
  brilhos.forEach(b => c.piso.add(b));
  // facho do projetor (vindo do fundo) com poeira
  c.teto = new THREE.Group();
  if (q.nivel !== 'baixa') c.teto.add(facho('#fff2d8', new THREE.Vector3(0, 10.4, Z_FUNDO + 0.4), new THREE.Vector3(0, TELA.y, TELA.z), 4.6, 0.07));
  c.particulas = particulas({ n: 110, caixa: [-3, 3, 7, 10.5, -14, 13], cor: '#fff2d8', tam: 0.04, vel: [0, -0.02, 0], ondula: 0.3, op: 0.6, q });
  c.luzes = [{ pos: [-11, 2.6, 1.5], cor: '#ffcf8a', int: 4, dist: 6 }, { pos: [11, 2.6, 1.5], cor: '#ffcf8a', int: 4, dist: 6 }];
  return c;
}

function documentario(q) {
  const c = {};
  c.paredes = quadros({ pinturas: [PINTURAS.montanha, PINTURAS.oceano, PINTURAS.cidade, PINTURAS.floresta], cor: '#2a2420', estilo: 'simples', metal: 0.1, w: 2.4, h: 1.8, q });
  // globos terrestres nos corredores
  c.piso = new THREE.Group();
  const mapa = atlasQuadros([function mundo(g, w, h, rnd) {
    g.fillStyle = '#3a6a8a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#c8b27a';
    for (const [x, y, rx, ry] of [[0.22, 0.35, 0.1, 0.14], [0.28, 0.68, 0.06, 0.16], [0.52, 0.32, 0.08, 0.1], [0.55, 0.62, 0.07, 0.14], [0.75, 0.35, 0.14, 0.12], [0.85, 0.72, 0.05, 0.05]]) { g.beginPath(); for (let a = 0; a < 7; a += 0.4) g.lineTo(w * (x + Math.cos(a) * rx * (0.8 + rnd() * 0.4)), h * (y + Math.sin(a) * ry * (0.8 + rnd() * 0.4))); g.fill(); }
  }], 256, 128);
  const globos = [];
  for (const p of corredor(q.nivel === 'baixa' ? [1.5] : [-4.5, 9.5])) {
    const g = new THREE.Group(); g.position.set(p.x, p.y, p.z);
    const perfil = [[0.3, 0], [0.28, 0.06], [0.05, 0.12], [0.04, 1.0]].map(([x, y]) => new THREE.Vector2(x, y));
    g.add(malha(new THREE.LatheGeometry(perfil, 12), std('#5a3a1e', { r: 0.5 })));
    const arco = malha(new THREE.TorusGeometry(0.5, 0.02, 6, 32, Math.PI), std('#b08d57', { r: 0.3, m: 1 })); arco.position.y = 1.45; arco.rotation.set(0, Math.PI / 2, 0.4); g.add(arco);
    const esf = malha(new THREE.SphereGeometry(0.45, 24, 16), new THREE.MeshStandardMaterial({ map: mapa.tex, roughness: 0.5 })); esf.position.y = 1.45; esf.rotation.z = 0.4; g.add(esf); globos.push(esf);
    c.piso.add(g);
  }
  c.piso.userData.animar = (t) => globos.forEach(e => { e.rotation.y = t * 0.15; });
  // câmeras antigas de cinema no palco
  c.palco = new THREE.Group();
  const preto = std('#1a1a1a', { r: 0.4, m: 0.6 });
  for (const lado of LADOS) {
    const g = new THREE.Group(); g.position.set(lado * 11.6, 0.9, TELA.z - 1.3); g.rotation.y = Math.PI + lado * 0.5;
    for (let i = 0; i < 3; i++) { const p = malha(new THREE.CylinderGeometry(0.025, 0.025, 1.6, 6), std('#6a4a2a')); p.position.set(Math.cos(i * 2.1) * 0.3, 0.75, Math.sin(i * 2.1) * 0.3); p.rotation.set(Math.sin(i * 2.1) * 0.2, 0, -Math.cos(i * 2.1) * 0.2); g.add(p); }
    const corpo = malha(new THREE.BoxGeometry(0.45, 0.4, 0.6), preto, true); corpo.position.y = 1.7; g.add(corpo);
    for (const dz of [-0.2, 0.25]) { const r = malha(new THREE.CylinderGeometry(0.28, 0.28, 0.08, 20), preto); r.rotation.x = Math.PI / 2; r.rotation.y = Math.PI / 2; r.position.set(0, 2.15 + (dz > 0 ? 0.05 : 0), dz); g.add(r); }
    const lente = malha(new THREE.CylinderGeometry(0.09, 0.11, 0.3, 14), preto); lente.rotation.x = Math.PI / 2; lente.position.set(0, 1.7, 0.42); g.add(lente);
    c.palco.add(g);
  }
  c.teto = new THREE.Group();
  if (q.nivel !== 'baixa') c.teto.add(facho('#fff6e0', new THREE.Vector3(0, 10.4, Z_FUNDO + 0.4), new THREE.Vector3(0, TELA.y, TELA.z), 4.6, 0.06));
  c.particulas = particulas({ n: 100, caixa: [-3, 3, 7, 10.5, -14, 13], cor: '#fff6e0', tam: 0.04, vel: [0, -0.02, 0], ondula: 0.3, op: 0.55, q });
  c.luzes = [];
  return c;
}

function suspense(q) {
  const c = {};
  // luz de persiana projetada nas paredes + relógios com ponteiros andando
  c.paredes = new THREE.Group();
  const pers = texturaPersiana();
  for (const lado of LADOS) for (const k of [1, 4]) {
    const m = malha(new THREE.PlaneGeometry(3, 3.4), aditivo('#9fc4ff', { map: pers, op: 0.35 }));
    m.position.set(lado * (L / 2 - 0.2), 5.4, PAINEIS_Z[k]); m.rotation.set(0, naParedeRotY(lado), lado * 0.18); c.paredes.add(m);
  }
  const ponteiros = [];
  const face = atlasQuadros([function relogio(g, w, h) {
    g.fillStyle = '#e8e4da'; g.fillRect(0, 0, w, h); g.fillStyle = '#1a1a1a';
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; g.save(); g.translate(w / 2 + Math.sin(a) * w * 0.4, h / 2 - Math.cos(a) * h * 0.4); g.rotate(a); g.fillRect(-2, -8, 4, i % 3 ? 10 : 18); g.restore(); }
  }], 256, 256);
  for (const lado of LADOS) for (const k of [0, 2, 3, 5]) {
    const g = new THREE.Group(); g.position.set(lado * (L / 2 - 0.25), 5.3, PAINEIS_Z[k]); g.rotation.y = naParedeRotY(lado);
    g.add(malha(new THREE.CircleGeometry(0.9, 32), new THREE.MeshStandardMaterial({ map: face.tex, roughness: 0.6 })));
    const aro = malha(new THREE.TorusGeometry(0.92, 0.07, 8, 40), std('#2a2f36', { r: 0.3, m: 0.9 })); g.add(aro);
    const h = malha(new THREE.BoxGeometry(0.06, 0.5, 0.02), std('#111')); h.geometry.translate(0, 0.22, 0.03); const m = malha(new THREE.BoxGeometry(0.04, 0.75, 0.02), std('#111')); m.geometry.translate(0, 0.33, 0.04);
    const sg = malha(new THREE.BoxGeometry(0.015, 0.8, 0.02), std('#b01818')); sg.geometry.translate(0, 0.32, 0.05);
    g.add(h, m, sg); c.paredes.add(g); ponteiros.push([h, m, sg, Math.random() * 100]);
  }
  c.paredes.userData.animar = (t) => ponteiros.forEach(([h, m, s, f]) => { const tt = t + f; s.rotation.z = -Math.floor(tt) / 60 * Math.PI * 2; m.rotation.z = -tt / 3600 * Math.PI * 2 * 20; h.rotation.z = -tt / 43200 * Math.PI * 2 * 20; });
  // lâmpadas penduradas que balançam
  c.teto = new THREE.Group();
  const lamp = [];
  for (const lado of LADOS) for (const z of q.nivel === 'baixa' ? [0] : [-9, -2, 5]) {
    const g = new THREE.Group(); g.position.set(lado * 10.4, A, z);
    const fio = malha(new THREE.CylinderGeometry(0.008, 0.008, 3, 4), std('#111')); fio.position.y = -1.5;
    const bulbo = malha(new THREE.SphereGeometry(0.12, 12, 10), brilhante('#ffe6b0')); bulbo.position.y = -3.1;
    const b = brilho('#ffd890', 1.6, 0.5); b.position.y = -3.1;
    g.add(fio, bulbo, b); c.teto.add(g); lamp.push(g);
  }
  c.teto.userData.animar = (t) => lamp.forEach((g, i) => { g.rotation.z = Math.sin(t * 0.9 + i) * 0.06; g.rotation.x = Math.cos(t * 0.7 + i) * 0.04; });
  c.particulas = particulas({ n: 80, caixa: [-12, 12, 1, 11, -14, 13], cor: '#9fb7c9', tam: 0.05, vel: [0, -0.02, 0], ondula: 0.3, op: 0.45, q });
  c.luzes = [{ pos: [-10, 9, 5], cor: '#ffd890', int: 3, dist: 6 }, { pos: [10, 9, -2], cor: '#ffd890', int: 3, dist: 6 }];
  return c;
}

function policial(q) {
  const c = {};
  c.paredes = quadros({ pinturas: [PINTURAS.quadroEvidencias, PINTURAS.digital, PINTURAS.olhoFechadura], cor: '#3a2a1a', estilo: 'simples', metal: 0.1, w: 2.4, h: 2.8, q });
  // fita de isolamento cruzando dois painéis de cada lado
  const fita = atlasQuadros([function fita(g, w, h) { g.fillStyle = '#ffd400'; g.fillRect(0, 0, w, h); g.fillStyle = '#111'; g.font = `bold ${Math.round(h * 0.62)}px system-ui`; g.textBaseline = 'middle'; g.fillText('POLICIAL · NÃO ULTRAPASSE · POLICIAL ·', 6, h / 2); }], 1024, 64);
  const fitas = [];
  for (const lado of LADOS) for (const k of [1, 4]) for (const inc of [0.6, -0.6]) fitas.push(colocar(new THREE.PlaneGeometry(4.2, 0.28), lado * (L / 2 - 0.32), 5.3, PAINEIS_Z[k], 0, naParedeRotY(lado), inc));
  c.paredes.add(malha(juntar(fitas), new THREE.MeshBasicMaterial({ map: fita.tex, side: THREE.DoubleSide })));
  // giroflex nas pontas do palco
  c.palco = new THREE.Group();
  const giros = [];
  for (const lado of LADOS) {
    const g = new THREE.Group(); g.position.set(lado * 11.8, 0.9, TELA.z - 1.3);
    g.add(malha(new THREE.BoxGeometry(1.4, 0.18, 0.4), std('#1a1a1a', { r: 0.4, m: 0.6 })).translateY(0.09));
    const v = malha(new THREE.BoxGeometry(0.6, 0.22, 0.34), brilhante('#ff1a1a', { op: 0.95 })); v.position.set(-0.35, 0.3, 0);
    const a = malha(new THREE.BoxGeometry(0.6, 0.22, 0.34), brilhante('#1a5aff', { op: 0.95 })); a.position.set(0.35, 0.3, 0);
    const bv = brilho('#ff2a2a', 3, 0.6); bv.position.copy(v.position); const ba = brilho('#2a6aff', 3, 0.6); ba.position.copy(a.position);
    g.add(v, a, bv, ba); c.palco.add(g); giros.push([bv, ba]);
  }
  c.palco.userData.animar = (t) => giros.forEach(([bv, ba]) => { const f = Math.sin(t * 9) > 0; bv.material.opacity = f ? 0.8 : 0.1; ba.material.opacity = f ? 0.1 : 0.8; });
  // marcadores de evidência amarelos no corredor
  c.piso = new THREE.Group();
  const tendas = [];
  for (const p of corredor([-10.5, -4.5, 1.5, 9.5])) tendas.push(colocar(new THREE.ConeGeometry(0.16, 0.3, 3), p.x, p.y + 0.15, p.z, 0, 0.3));
  c.piso.add(malha(juntar(tendas), std('#ffd400', { r: 0.5, flat: true })));
  c.particulas = particulas({ n: 60, caixa: [-12, 12, 1, 11, -14, 13], cor: '#a8b8d8', tam: 0.05, vel: [0, -0.02, 0], ondula: 0.3, op: 0.4, q });
  c.luzes = [{ pos: [-11.8, 2, TELA.z - 2], cor: '#ff1a1a', int: 10, dist: 12, sirene: 0 }, { pos: [11.8, 2, TELA.z - 2], cor: '#1a5aff', int: 10, dist: 12, sirene: 1 }];
  return c;
}

function guerra(q) {
  const c = {};
  c.paredes = quadros({ pinturas: [PINTURAS.mapaTatico, PINTURAS.avioes], cor: '#3a3a2a', estilo: 'simples', metal: 0.5, w: 2.4, h: 2, q });
  // luminárias industriais com grade entre os painéis
  const grade = [], bulbos = [];
  for (const lado of LADOS) for (const z of ENTRE_Z.filter((_, i) => i % 2 === 0)) {
    const x = lado * (L / 2 - 0.35);
    grade.push(colocar(new THREE.CylinderGeometry(0.2, 0.2, 0.35, 8, 1, true), x, 8, z));
    for (let i = 0; i < 4; i++) grade.push(colocar(new THREE.TorusGeometry(0.2, 0.012, 4, 12), x, 7.85 + i * 0.1, z, Math.PI / 2));
    bulbos.push(colocar(new THREE.SphereGeometry(0.11, 10, 8), x, 8, z));
  }
  c.paredes.add(malha(juntar(grade), new THREE.MeshStandardMaterial({ color: '#2a2a22', roughness: 0.5, metalness: 0.8, wireframe: true })), malha(juntar(bulbos), brilhante('#ffb347')));
  // sacos de areia e caixas de munição
  c.piso = new THREE.Group();
  const sacos = [], caixas = [];
  for (const p of corredor(q.nivel === 'baixa' ? [1.5] : [-4.5, 1.5, 9.5])) {
    for (let lin = 0; lin < 3; lin++) for (let i = 0; i < 3 - lin; i++) { const s = new THREE.SphereGeometry(0.3, 10, 6); s.scale(1, 0.45, 1.6); sacos.push(colocar(s, p.x, p.y + 0.12 + lin * 0.25, p.z - 0.5 + i * 0.95 + lin * 0.45, 0, (i % 2) * 0.1)); }
    caixas.push(colocar(new THREE.BoxGeometry(0.5, 0.35, 0.9), p.x - p.lado * 0.1, p.y + 0.175, p.z + 1.7, 0, 0.15));
  }
  c.piso.add(malha(juntar(sacos), std('#8a7a5a', { r: 0.95, flat: true }), true), malha(juntar(caixas), std('#4a5233', { r: 0.6, m: 0.3 }), true));
  c.palco = new THREE.Group();
  const sp = [];
  for (const lado of LADOS) for (let i = 0; i < 4; i++) { const s = new THREE.SphereGeometry(0.3, 10, 6); s.scale(1.6, 0.45, 1); sp.push(colocar(s, lado * (10.6 + i * 0.85), 1.05 + (i % 2) * 0.05, TELA.z - 2.2)); }
  c.palco.add(malha(juntar(sp), std('#8a7a5a', { r: 0.95, flat: true })));
  // holofote varrendo
  c.teto = new THREE.Group();
  if (q.nivel !== 'baixa') { const f = facho('#fff2c8', new THREE.Vector3(0, 12.6, -14), new THREE.Vector3(0, 0, 0), 2.4, 0.1); c.teto.add(f); c.teto.userData.animar = (t) => f.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(Math.sin(t * 0.35) * 0.9, -0.9, 1).normalize()); }
  c.particulas = particulas({ n: 90, caixa: [-12, 12, 0.5, 8, -14, 13], cor: '#c8b890', tam: 0.12, vel: [0.03, 0.02, 0], ondula: 0.6, op: 0.3, aditiva: false, q });
  c.luzes = [{ pos: [-11.5, 8, -9.9], cor: '#ffb347', int: 5, dist: 8 }, { pos: [11.5, 8, 2.7], cor: '#ffb347', int: 5, dist: 8 }];
  return c;
}

export const CONSTRUTORES = { terror, acao, scifi, romance, comedia, animacao, aventura, fantasia, drama, documentario, suspense, policial, guerra };
export const CAMADAS = ['paredes', 'piso', 'teto', 'palco', 'particulas'];
