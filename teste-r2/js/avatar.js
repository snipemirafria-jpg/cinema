// Avatares 3D (Quaternius Universal Base Characters — CC0)
// Monta corpo + cabelo + cores de pele/roupa/olhos e aplica poses (em pé / sentado).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const BASE = new URL('../assets/', import.meta.url).href;
const loader = new GLTFLoader();
const cache = new Map();

export const OPCOES = {
  base: [
    { id: 'male', nome: 'Masculino' },
    { id: 'female', nome: 'Feminino' },
  ],
  cabelo: [
    { id: 'simpleparted', nome: 'Repartido' },
    { id: 'buzzed', nome: 'Raspado' },
    { id: 'long', nome: 'Longo' },
    { id: 'buns', nome: 'Coques' },
    { id: 'buzzedfemale', nome: 'Curtinho' },
    { id: 'nenhum', nome: 'Careca' },
  ],
  barba: [{ id: 'nao', nome: 'Sem barba' }, { id: 'sim', nome: 'Com barba' }],
  pele: ['#f3d2b8', '#e0ac8a', '#c68e6b', '#a06a48', '#7a4a2f', '#4f2e1c'],
  cabeloCor: ['#1a120c', '#3b2414', '#6b4423', '#b07a3c', '#d9b26a', '#9b2d20', '#d6d6d6', '#7a3fd1'],
  olhos: ['#3a2416', '#6b4a2a', '#2f6db3', '#3c8a4a', '#7a7f87'],
  roupa: ['#151515', '#f2f2f2', '#c1121f', '#1d4ed8', '#16a34a', '#7c3aed', '#f59e0b', '#ec4899'],
  calca: ['#1f2937', '#111111', '#2b4a7a', '#6b5b45', '#e5e7eb'],
};

export const AVATAR_PADRAO = {
  base: 'male', cabelo: 'simpleparted', barba: 'nao',
  pele: '#c68e6b', cabeloCor: '#2b1a10', olhos: '#3a2416', roupa: '#151515', calca: '#1f2937',
};

export function normalizarAvatar(a) {
  const r = { ...AVATAR_PADRAO, ...(a || {}) };
  if (!OPCOES.base.some(o => o.id === r.base)) r.base = 'male';
  if (!OPCOES.cabelo.some(o => o.id === r.cabelo)) r.cabelo = 'simpleparted';
  for (const k of ['pele', 'cabeloCor', 'olhos', 'roupa', 'calca']) {
    if (!/^#[0-9a-fA-F]{6}$/.test(r[k] || '')) r[k] = AVATAR_PADRAO[k];
  }
  return r;
}

function carregar(nome) {
  if (!cache.has(nome)) {
    cache.set(nome, loader.loadAsync(BASE + 'models/' + nome + '.glb').then(g => g.scene));
  }
  return cache.get(nome);
}

export function preCarregar() {
  return Promise.all(['avatar_male', 'avatar_female', 'hair_simpleparted'].map(carregar)).catch(() => {});
}

// ---------- roupa via shader (pinta tronco/braços/pernas sobre a pele) ----------
function aplicarRoupa(material, limites, cores) {
  const m = material.clone();
  m.userData.uniforms = {
    uRoupa: { value: new THREE.Color(cores.roupa) },
    uCalca: { value: new THREE.Color(cores.calca) },
    uPele: { value: new THREE.Color(cores.pele) },
    uLim: { value: new THREE.Vector4(limites.pescoco, limites.quadril, limites.tornozelo, limites.punho) },
    uCentro: { value: limites.centroX },
  };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, m.userData.uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBind;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBind = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vBind;
        uniform vec3 uRoupa; uniform vec3 uCalca; uniform vec3 uPele; uniform vec4 uLim; uniform float uCentro;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          float y = vBind.y; float ax = abs(vBind.x - uCentro);
          vec3 base = diffuseColor.rgb;
          float lum = dot(base, vec3(0.299,0.587,0.114));
          // tom de pele: mantém o sombreado da textura e troca a cor
          vec3 pele = uPele * (0.55 + lum * 1.25);
          vec3 cor = pele;
          float tecidoSombra = 0.75 + lum * 0.6;
          bool tronco = y < uLim.x && y > uLim.y - 0.02 && ax < uLim.w;
          bool perna = y <= uLim.y + 0.02 && y > uLim.z;
          bool pe = y <= uLim.z;
          if (tronco) cor = uRoupa * tecidoSombra;
          if (perna) cor = uCalca * tecidoSombra;
          if (pe) cor = vec3(0.93) * tecidoSombra;
          diffuseColor.rgb = cor;
        }`);
  };
  m.customProgramCacheKey = () => 'roupa-v1';
  return m;
}

function limitesDoCorpo(root) {
  root.updateMatrixWorld(true);
  const pos = (n) => { const b = root.getObjectByName(n); return b ? b.getWorldPosition(new THREE.Vector3()) : null; };
  // converte posições de mundo para o espaço local do mesh (bind) — o mesh fica na origem
  const neck = pos('neck_01'), pelvis = pos('pelvis'), foot = pos('foot_l'), hand = pos('hand_l'), lower = pos('lowerarm_l');
  const inv = new THREE.Matrix4();
  let mesh = null; root.traverse(o => { if (o.isSkinnedMesh && !mesh && o.name !== 'Eyes' && o.name !== 'Eyebrows') mesh = o; });
  root.traverse(o => { if (o.isSkinnedMesh && /Super|Retopo/i.test(o.name + o.geometry?.name)) mesh = o; });
  inv.copy(mesh.matrixWorld).invert();
  const L = (v) => v.clone().applyMatrix4(inv);
  const n = L(neck), p = L(pelvis), f = L(foot), h = L(hand), lo = L(lower);
  return {
    pescoco: n.y + (n.y - p.y) * 0.04,
    quadril: p.y - (n.y - p.y) * 0.12,
    tornozelo: f.y + (p.y - f.y) * 0.06,
    punho: Math.abs(h.x - n.x) - Math.abs(h.x - lo.x) * 0.15,
    centroX: n.x,
  };
}

// ---------- cabelo (rigged no osso da cabeça) ----------
function anexarCabelo(corpo, cenaCabelo, cor) {
  const clone = SkeletonUtils.clone(cenaCabelo);
  const ossos = {}; corpo.traverse(o => { if (o.isBone) ossos[o.name] = o; });
  const meshes = []; clone.traverse(o => { if (o.isSkinnedMesh) meshes.push(o); });
  for (const sm of meshes) {
    const bones = sm.skeleton.bones.map(b => ossos[b.name] || b);
    const sk = new THREE.Skeleton(bones, sm.skeleton.boneInverses);
    const novo = new THREE.SkinnedMesh(sm.geometry, sm.material.clone());
    novo.material.color = new THREE.Color(cor).multiplyScalar(1.6);
    novo.name = 'cabelo';
    novo.bind(sk, sm.bindMatrix);
    novo.frustumCulled = false;
    novo.castShadow = true;
    corpo.add(novo);
  }
}

// ---------- montagem ----------
export async function criarAvatar(cfg) {
  const a = normalizarAvatar(cfg);
  const baseScene = await carregar('avatar_' + a.base);
  const root = SkeletonUtils.clone(baseScene);
  root.userData.cfg = a;
  const lim = limitesDoCorpo(root);
  root.traverse(o => {
    if (!o.isMesh) return;
    o.frustumCulled = false;
    o.castShadow = true;
    const nome = (o.material?.name || '');
    if (/Superhero/i.test(nome)) o.material = aplicarRoupa(o.material, lim, a);
    else if (/Eye/i.test(nome)) { o.material = o.material.clone(); o.material.color = new THREE.Color(a.olhos).lerp(new THREE.Color('#ffffff'), 0.25); }
    else if (/Hair/i.test(nome)) { o.material = o.material.clone(); o.material.color = new THREE.Color(a.cabeloCor).multiplyScalar(1.6); }
  });
  const pedidos = [];
  if (a.cabelo !== 'nenhum') pedidos.push(carregar('hair_' + a.cabelo).then(c => anexarCabelo(root, c, a.cabeloCor)));
  if (a.barba === 'sim') pedidos.push(carregar('hair_beard').then(c => anexarCabelo(root, c, a.cabeloCor)));
  await Promise.all(pedidos.map(p => p.catch(() => {})));

  // normaliza altura para ~1,75 m
  const box = new THREE.Box3().setFromObject(root);
  const altura = box.max.y - box.min.y || 1;
  const wrap = new THREE.Group();
  wrap.add(root);
  root.scale.setScalar(1.75 / altura);
  root.position.y = -box.min.y * (1.75 / altura);
  wrap.userData.corpo = root;
  wrap.userData.frente = direcaoFrente(root);
  return wrap;
}

function direcaoFrente(root) {
  root.updateMatrixWorld(true);
  const f = root.getObjectByName('foot_l').getWorldPosition(new THREE.Vector3());
  const b = root.getObjectByName('ball_l').getWorldPosition(new THREE.Vector3());
  const d = b.sub(f); d.y = 0;
  return d.lengthSq() > 1e-8 ? d.normalize() : new THREE.Vector3(0, 0, 1);
}

// Gira um osso para que a direção (osso -> filho) aponte para alvo (direção em mundo)
function mirar(osso, filho, alvo) {
  osso.updateWorldMatrix(true, true);
  const p = osso.getWorldPosition(new THREE.Vector3());
  const c = filho.getWorldPosition(new THREE.Vector3());
  const atual = c.sub(p).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(atual, alvo.clone().normalize());
  const wq = osso.getWorldQuaternion(new THREE.Quaternion());
  const nova = q.multiply(wq);
  const pq = osso.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
  osso.quaternion.copy(pq.multiply(nova));
  osso.updateWorldMatrix(false, true);
}

// Pose sentada (feita em mundo, independente do eixo dos ossos)
export function poseSentado(wrap) {
  const root = wrap.userData.corpo;
  const B = (n) => root.getObjectByName(n);
  const frente = wrap.userData.frente.clone().applyQuaternion(wrap.getWorldQuaternion(new THREE.Quaternion()));
  const baixo = new THREE.Vector3(0, -1, 0);
  const lado = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), frente).normalize();
  for (const s of ['l', 'r']) {
    const sinal = s === 'l' ? 1 : -1;
    mirar(B('thigh_' + s), B('calf_' + s), frente.clone().multiplyScalar(1).add(lado.clone().multiplyScalar(0.08 * sinal)).add(new THREE.Vector3(0, -0.05, 0)));
    mirar(B('calf_' + s), B('foot_' + s), baixo.clone().add(frente.clone().multiplyScalar(0.18)));
    mirar(B('upperarm_' + s), B('lowerarm_' + s), baixo.clone().add(frente.clone().multiplyScalar(0.35)).add(lado.clone().multiplyScalar(0.18 * sinal)));
    mirar(B('lowerarm_' + s), B('hand_' + s), frente.clone().add(new THREE.Vector3(0, -0.15, 0)).add(lado.clone().multiplyScalar(0.05 * sinal)));
  }
  // abaixa o corpo: quadril na altura do assento
  root.updateMatrixWorld(true);
  const pelvis = B('pelvis').getWorldPosition(new THREE.Vector3());
  const base = wrap.getWorldPosition(new THREE.Vector3());
  wrap.userData.alturaQuadril = pelvis.y - base.y;
}

export function poseEmPe(wrap) {
  const root = wrap.userData.corpo;
  const B = (n) => root.getObjectByName(n);
  const frente = wrap.userData.frente.clone().applyQuaternion(wrap.getWorldQuaternion(new THREE.Quaternion()));
  const baixo = new THREE.Vector3(0, -1, 0);
  const lado = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), frente).normalize();
  for (const s of ['l', 'r']) {
    const sinal = s === 'l' ? 1 : -1;
    mirar(B('upperarm_' + s), B('lowerarm_' + s), baixo.clone().add(lado.clone().multiplyScalar(0.12 * sinal)));
    mirar(B('lowerarm_' + s), B('hand_' + s), baixo.clone().add(frente.clone().multiplyScalar(0.12)).add(lado.clone().multiplyScalar(0.04 * sinal)));
  }
}

// Leve "respiração" / balanço de cabeça para dar vida
export function animarOcioso(wrap, t, semente = 0) {
  const head = wrap.userData._head || (wrap.userData._head = wrap.userData.corpo.getObjectByName('Head'));
  const sp = wrap.userData._sp || (wrap.userData._sp = wrap.userData.corpo.getObjectByName('spine_03'));
  if (!head) return;
  if (!head.userData.q0) head.userData.q0 = head.quaternion.clone();
  if (sp && !sp.userData.q0) sp.userData.q0 = sp.quaternion.clone();
  const yaw = Math.sin(t * 0.35 + semente * 7.1) * 0.12;
  const pitch = Math.sin(t * 0.5 + semente * 3.3) * 0.04;
  head.quaternion.copy(head.userData.q0).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0)));
  if (sp) sp.quaternion.copy(sp.userData.q0).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.sin(t * 1.4 + semente) * 0.01, 0, 0)));
}
