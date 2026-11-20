// Salas temáticas da Sessão Juntos.
// A sala é sempre a MESMA (arquitetura, telão, poltronas, cortinas e logo): o tema muda cores e texturas
// dos materiais, a iluminação, a cor do tecido das poltronas e acrescenta decoração 3D do gênero.
// A troca é suave: as luzes baixam como no início de uma sessão, a decoração troca e as luzes voltam.
// Nada da sala é recriado: só materiais e luzes que já existem são ajustados.
import * as THREE from 'three';
import { texturaSuperficie, comRepeticao } from './temas-texturas.js';
import { CONSTRUTORES, CAMADAS } from './temas-decoracao.js';

// ---------------------------------------------------------------- gêneros → temas
const GENEROS = [
  ['terror', /terror|horror|sobrenatural|zumbi/],
  ['suspense', /suspense|thriller|misterio/],
  ['policial', /policial|crime|detetive|gangster|mafia|investiga/],
  ['guerra', /guerra|militar|\bwar\b|combate/],
  ['scifi', /ficcao|sci-?fi|cientific|espacial|futur|cyberpunk|alien/],
  ['acao', /\bacao|super-?heroi|artes marciais|esporte|corrida|luta/],
  ['fantasia', /fantasia|magia|conto de fadas|medieval/],
  ['aventura', /aventura|faroeste|western|pirata|expedic/],
  ['animacao', /animacao|anime|desenho|infantil|familia|kids|crianca/],
  ['comedia', /comedia|parodia|humor|stand-?up|musical|besteirol/],
  ['romance', /romance|romant|amor/],
  ['documentario', /document|natureza|historia real/],
  ['drama', /drama|biografi|historic|epico/],
];
const sem = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// devolve os temas do filme, na ordem em que os gêneros aparecem (o primeiro é o principal)
export function temasDoFilme(filme) {
  if (!filme) return [];
  const textos = [filme.genero, filme.generos, filme.categoria].flat().filter(Boolean).join(',');
  const saida = [];
  for (const parte of sem(textos).split(/[,;/|·]+/)) {
    for (const [tema, re] of GENEROS) if (re.test(parte) && !saida.includes(tema)) { saida.push(tema); break; }
  }
  return saida.slice(0, 3);
}

// ---------------------------------------------------------------- paletas
// PADRAO = valores exatos da sala original da Sessão Juntos
const PADRAO = {
  fundo: '#06030a', nevoa: '#06030a', nevoaPerto: 22, nevoaLonge: 48,
  parede: '#4a1220', paredeEm: '#1a0308', painel: '#5c1626', painelEm: '#220509', piso: '#1a0b10', degrau: '#3a1520',
  teto: '#0c0609', frente: '#0d0508', palco: '#14070b', cortina: '#7a0a16',
  neonA: '#ff1f3d', neonB: '#ff1f3d', faixa: '#ff2a48', sanca: '#ff2a48', ledPalco: '#ff2a48', borda: '#ff3355', brilho: '#ff2a48',
  arandela: '#ffb36b', luzTeto: '#ffe2c4',
  ceu: '#ffc2cc', chao: '#1a0810', hemi: 1, amb: '#3a1420', ambM: 1, pontual: '#ff2040', pontualM: 1, fundoLuz: '#ffb070',
  tecido: '#c0303a', detalhe: '#d89a40', poltrona: 0,
  sup: { piso: null, parede: null, painel: null, painelBrilho: null, palco: null },
  anim: null,
};
const TEMAS = {
  terror: {
    fundo: '#020103', nevoa: '#050208', nevoaPerto: 12, nevoaLonge: 38,
    parede: '#22121a', paredeEm: '#080206', painel: '#2a1520', painelEm: '#0a0307', piso: '#2a2226', degrau: '#2a1a20',
    teto: '#050305', frente: '#050204', palco: '#0a0507', cortina: '#3a0610',
    neonA: '#9a0c1e', neonB: '#5a1d9a', faixa: '#7a0a18', sanca: '#4a1a8a', ledPalco: '#9a0c1e', borda: '#7a0a18', brilho: '#6a0a20',
    arandela: '#ff8a3a', luzTeto: '#6a5a80',
    ceu: '#6a5a8a', chao: '#050308', hemi: 0.45, amb: '#1a1030', ambM: 0.55, pontual: '#8a0f22', pontualM: 0.7, fundoLuz: '#5a2a8a',
    tecido: '#3a0c14', detalhe: '#2b221c', poltrona: 1,
    sup: { piso: 'manchado', parede: 'tecido', painel: 'damasco' }, anim: 'tremor',
  },
  acao: {
    fundo: '#050608', nevoa: '#07080b', nevoaPerto: 20, nevoaLonge: 46,
    parede: '#2a2e36', paredeEm: '#06070a', painel: '#3a3f4a', painelEm: '#0a0b0e', piso: '#3a3c42', degrau: '#2a2c32',
    teto: '#0a0b0e', frente: '#08090b', palco: '#121418', cortina: '#2a1a14',
    neonA: '#ff4a1f', neonB: '#1fa3ff', faixa: '#ff6a1f', sanca: '#1fa3ff', ledPalco: '#ff6a1f', borda: '#ffb000', brilho: '#ff5a1f',
    arandela: '#ffd0a0', luzTeto: '#e8f0ff',
    ceu: '#ffd2b0', chao: '#0a0c10', hemi: 0.9, amb: '#20242c', ambM: 0.9, pontual: '#ff5a1f', pontualM: 1.1, fundoLuz: '#1fa3ff',
    tecido: '#22252c', detalhe: '#ff6a00', poltrona: 1,
    sup: { piso: 'chapa', parede: 'concreto', painel: 'metal' }, anim: 'pulso',
  },
  scifi: {
    fundo: '#02030a', nevoa: '#03050c', nevoaPerto: 18, nevoaLonge: 46,
    parede: '#141a30', paredeEm: '#04081a', painel: '#1a2340', painelEm: '#00a8c8', piso: '#1a2234', degrau: '#141a2a',
    teto: '#04060e', frente: '#03040a', palco: '#0a0e1a', cortina: '#14204a',
    neonA: '#00e5ff', neonB: '#8a4dff', faixa: '#00e5ff', sanca: '#8a4dff', ledPalco: '#00e5ff', borda: '#00e5ff', brilho: '#00b8ff',
    arandela: '#9ae8ff', luzTeto: '#b8f4ff',
    ceu: '#8fb4ff', chao: '#05060c', hemi: 0.8, amb: '#101a3a', ambM: 1, pontual: '#2a7bff', pontualM: 1, fundoLuz: '#8a4dff',
    tecido: '#1a2c5a', detalhe: '#c0c8d8', poltrona: 1,
    sup: { piso: 'grade', parede: 'tecido', painel: 'circuito', painelBrilho: 'circuito' }, anim: 'onda',
  },
  romance: {
    fundo: '#0a0306', nevoa: '#12060a', nevoaPerto: 22, nevoaLonge: 50,
    parede: '#4a1a28', paredeEm: '#14040a', painel: '#6a1e34', painelEm: '#1a050c', piso: '#3a1820', degrau: '#4a1a26',
    teto: '#12060a', frente: '#0e0408', palco: '#1a080e', cortina: '#6a0a24',
    neonA: '#ff7fa8', neonB: '#ffcf7a', faixa: '#ffb0c4', sanca: '#ffcf7a', ledPalco: '#ff7fa8', borda: '#ffcf7a', brilho: '#ff7fa8',
    arandela: '#ffd9a0', luzTeto: '#ffe8d0',
    ceu: '#ffd0d8', chao: '#1a0a10', hemi: 1.05, amb: '#3a1a24', ambM: 1.1, pontual: '#ff6f91', pontualM: 0.8, fundoLuz: '#ffcf8a',
    tecido: '#7a1430', detalhe: '#c9a24a', poltrona: 1,
    sup: { piso: 'floral', parede: 'damasco', painel: 'damasco' }, anim: 'respira',
  },
  comedia: {
    fundo: '#0a0614', nevoa: '#0c0818', nevoaPerto: 26, nevoaLonge: 56,
    parede: '#2b2a7a', paredeEm: '#0a0820', painel: '#e89a14', painelEm: '#2a1a00', piso: '#4a2a6a', degrau: '#3a2a5a',
    teto: '#100c22', frente: '#0c0a18', palco: '#1a1430', cortina: '#c0142a',
    neonA: '#ffd23f', neonB: '#3ddc97', faixa: '#ff70a6', sanca: '#3ddc97', ledPalco: '#ffd23f', borda: '#ffd23f', brilho: '#ffd23f',
    arandela: '#fff2c0', luzTeto: '#fff6d8',
    ceu: '#fff3d6', chao: '#1a1030', hemi: 1.35, amb: '#3a2a5a', ambM: 1.4, pontual: '#ffb347', pontualM: 1, fundoLuz: '#ff70a6',
    tecido: '#2f6fe0', detalhe: '#ffd23f', poltrona: 1,
    sup: { piso: 'confete', parede: 'tecido', painel: 'listras' }, anim: 'arcoiris',
  },
  animacao: {
    fundo: '#0a0a20', nevoa: '#0c0c26', nevoaPerto: 26, nevoaLonge: 56,
    parede: '#30387a', paredeEm: '#0a0c24', painel: '#3a6ad8', painelEm: '#0a1440', piso: '#4a3a8a', degrau: '#3a3478',
    teto: '#10123a', frente: '#0c0e2a', palco: '#161a40', cortina: '#7a2a9a',
    neonA: '#ff70a6', neonB: '#70d6ff', faixa: '#ffca3a', sanca: '#70d6ff', ledPalco: '#ff70a6', borda: '#ffca3a', brilho: '#70d6ff',
    arandela: '#fff2c0', luzTeto: '#ffffff',
    ceu: '#ffffff', chao: '#1a1a40', hemi: 1.45, amb: '#3a3a6a', ambM: 1.5, pontual: '#ff9ad8', pontualM: 1, fundoLuz: '#70d6ff',
    tecido: '#4361ee', detalhe: '#ffd166', poltrona: 1,
    sup: { piso: 'estrelas', parede: 'tecido', painel: 'tecido' }, anim: 'arcoiris',
  },
  aventura: {
    fundo: '#060403', nevoa: '#0a0705', nevoaPerto: 20, nevoaLonge: 48,
    parede: '#4a3a2a', paredeEm: '#120a04', painel: '#5a4630', painelEm: '#140c04', piso: '#5a4a38', degrau: '#4a3a2a',
    teto: '#0e0a06', frente: '#0a0704', palco: '#1a120a', cortina: '#5a3a14',
    neonA: '#ffb347', neonB: '#e07a2a', faixa: '#ffb347', sanca: '#e07a2a', ledPalco: '#ffb347', borda: '#ffb347', brilho: '#ffb347',
    arandela: '#ffcf7a', luzTeto: '#ffe2b0',
    ceu: '#ffe2a8', chao: '#140e08', hemi: 1, amb: '#2a2014', ambM: 1.1, pontual: '#ff9a2a', pontualM: 0.9, fundoLuz: '#ffb347',
    tecido: '#7a4a1e', detalhe: '#c9a24a', poltrona: 1,
    sup: { piso: 'madeira', parede: 'pedra', painel: 'madeira' }, anim: 'tremor',
  },
  fantasia: {
    fundo: '#03050a', nevoa: '#060a12', nevoaPerto: 18, nevoaLonge: 46,
    parede: '#2a3446', paredeEm: '#060a14', painel: '#3a3a52', painelEm: '#0a0a1a', piso: '#3a3a4a', degrau: '#2a2a3a',
    teto: '#06060e', frente: '#05050a', palco: '#10101e', cortina: '#2a1a6a',
    neonA: '#ffc04d', neonB: '#3fd0a0', faixa: '#ffc04d', sanca: '#a06aff', ledPalco: '#3fd0a0', borda: '#ffc04d', brilho: '#3fd0a0',
    arandela: '#ffd27a', luzTeto: '#e0d0ff',
    ceu: '#ffe2a8', chao: '#0a140e', hemi: 0.95, amb: '#1a2a30', ambM: 1.1, pontual: '#3fd0a0', pontualM: 0.9, fundoLuz: '#a06aff',
    tecido: '#2a2a6a', detalhe: '#d4af37', poltrona: 1,
    sup: { piso: 'pedra', parede: 'pedra', painel: 'damasco' }, anim: 'respira',
  },
  drama: {
    fundo: '#040304', nevoa: '#08060a', nevoaPerto: 22, nevoaLonge: 50,
    parede: '#2a1e24', paredeEm: '#0a0608', painel: '#3a2a30', painelEm: '#0e080a', piso: '#2a2024', degrau: '#30242a',
    teto: '#080608', frente: '#060405', palco: '#100c0e', cortina: '#4a0e1c',
    neonA: '#e8c48a', neonB: '#b08d57', faixa: '#e8c48a', sanca: '#b08d57', ledPalco: '#e8c48a', borda: '#b08d57', brilho: '#e8c48a',
    arandela: '#ffd9a0', luzTeto: '#ffe8cc',
    ceu: '#ffe6cc', chao: '#120a0c', hemi: 0.85, amb: '#2a1c20', ambM: 0.9, pontual: '#ffcf9a', pontualM: 0.6, fundoLuz: '#ffcf9a',
    tecido: '#4a1424', detalhe: '#b08d57', poltrona: 1,
    sup: { piso: 'carpete', parede: 'damasco', painel: 'tecido' }, anim: null,
  },
  documentario: {
    fundo: '#050403', nevoa: '#0a0806', nevoaPerto: 24, nevoaLonge: 52,
    parede: '#3a342c', paredeEm: '#0a0806', painel: '#4a4236', painelEm: '#0e0c08', piso: '#4a3e30', degrau: '#3a3228',
    teto: '#0a0806', frente: '#080604', palco: '#14100c', cortina: '#3a2e1e',
    neonA: '#e0c9a6', neonB: '#8fb3c9', faixa: '#e0c9a6', sanca: '#8fb3c9', ledPalco: '#e0c9a6', borda: '#e0c9a6', brilho: '#e0c9a6',
    arandela: '#fff0d0', luzTeto: '#fff4e0',
    ceu: '#fff4e0', chao: '#100e0c', hemi: 1, amb: '#2a2620', ambM: 1, pontual: '#ffd8a0', pontualM: 0.6, fundoLuz: '#e0c9a6',
    tecido: '#3c4a3e', detalhe: '#8a7a64', poltrona: 1,
    sup: { piso: 'madeira', parede: 'ripas', painel: 'tecido' }, anim: null,
  },
  suspense: {
    fundo: '#010204', nevoa: '#02040a', nevoaPerto: 14, nevoaLonge: 40,
    parede: '#1a222c', paredeEm: '#03050a', painel: '#202a36', painelEm: '#04060c', piso: '#20262e', degrau: '#1a2028',
    teto: '#030508', frente: '#020306', palco: '#080b10', cortina: '#14202e',
    neonA: '#4fa3ff', neonB: '#9fb7c9', faixa: '#4fa3ff', sanca: '#2f6fb0', ledPalco: '#4fa3ff', borda: '#4fa3ff', brilho: '#2f6fb0',
    arandela: '#cfe0ff', luzTeto: '#9ab0c8',
    ceu: '#9ab0c8', chao: '#030507', hemi: 0.55, amb: '#0e1620', ambM: 0.65, pontual: '#2f6fb0', pontualM: 0.7, fundoLuz: '#4fa3ff',
    tecido: '#1c2a3c', detalhe: '#6b7785', poltrona: 1,
    sup: { piso: 'concreto', parede: 'tecido', painel: 'tecido' }, anim: 'respira',
  },
  policial: {
    fundo: '#020306', nevoa: '#04060c', nevoaPerto: 18, nevoaLonge: 44,
    parede: '#1c2230', paredeEm: '#04060c', painel: '#262e3e', painelEm: '#05070e', piso: '#262a32', degrau: '#1e222a',
    teto: '#04050a', frente: '#030408', palco: '#0a0c12', cortina: '#1a2240',
    neonA: '#ff1a2a', neonB: '#1a5aff', faixa: '#ffd400', sanca: '#1a5aff', ledPalco: '#ffd400', borda: '#ffd400', brilho: '#1a5aff',
    arandela: '#e0e8ff', luzTeto: '#c8d4e8',
    ceu: '#a8b8d8', chao: '#04050a', hemi: 0.7, amb: '#141a2a', ambM: 0.8, pontual: '#3a4aa0', pontualM: 0.8, fundoLuz: '#1a5aff',
    tecido: '#1a2238', detalhe: '#8a94a8', poltrona: 1,
    sup: { piso: 'concreto', parede: 'concreto', painel: 'tecido' }, anim: 'sirene',
  },
  guerra: {
    fundo: '#040403', nevoa: '#080806', nevoaPerto: 16, nevoaLonge: 42,
    parede: '#3a3e2a', paredeEm: '#080a04', painel: '#4a5036', painelEm: '#0a0c06', piso: '#3e3c34', degrau: '#34342a',
    teto: '#080806', frente: '#060604', palco: '#121208', cortina: '#3a3e1e',
    neonA: '#ffb347', neonB: '#d4a017', faixa: '#ffb347', sanca: '#d4a017', ledPalco: '#ffb347', borda: '#d4a017', brilho: '#ffb347',
    arandela: '#ffcf8a', luzTeto: '#ffe8c0',
    ceu: '#e8d9b0', chao: '#0a0a07', hemi: 0.8, amb: '#22251a', ambM: 0.9, pontual: '#ffaa55', pontualM: 0.6, fundoLuz: '#ffb347',
    tecido: '#3d4430', detalhe: '#6b5a3a', poltrona: 1,
    sup: { piso: 'concreto', parede: 'camuflagem', painel: 'metal' }, anim: 'tremor',
  },
};
const CHAVES_COR = Object.keys(PADRAO).filter(k => typeof PADRAO[k] === 'string');
const CHAVES_NUM = Object.keys(PADRAO).filter(k => typeof PADRAO[k] === 'number');

function paleta(lista) {
  const p = { ...PADRAO, sup: { ...PADRAO.sup } };
  if (!lista.length) return p;
  const pesos = lista.length === 1 ? [1] : lista.length === 2 ? [0.68, 0.32] : [0.58, 0.27, 0.15];
  const temas = lista.map(t => ({ ...PADRAO, ...TEMAS[t] }));
  const cor = new THREE.Color(), tmp = new THREE.Color();
  for (const k of CHAVES_COR) { cor.set(temas[0][k]).multiplyScalar(pesos[0]); for (let i = 1; i < temas.length; i++) cor.add(tmp.set(temas[i][k]).multiplyScalar(pesos[i])); p[k] = '#' + cor.getHexString(); }
  for (const k of CHAVES_NUM) p[k] = temas.reduce((s, t, i) => s + t[k] * pesos[i], 0);
  // dois gêneros: o segundo neon da sala ganha a cor do segundo tema (mistura equilibrada)
  if (temas[1]) { p.neonB = temas[1].neonA; p.sanca = temas[1].neonA; }
  p.sup = { ...temas[0].sup };
  p.anim = temas[0].anim;
  return p;
}

// ---------------------------------------------------------------- qualidade gráfica
const NIVEIS = { alta: { tex: 512, part: 1, luzes: 4 }, media: { tex: 512, part: 0.55, luzes: 0 }, baixa: { tex: 256, part: 0, luzes: 0 } };
const ROTULO = { auto: 'Auto', alta: 'Alta', media: 'Média', baixa: 'Leve' };
function lerPreferencia() { try { return localStorage.getItem('cine-graficos') || 'auto'; } catch { return 'auto'; } }
function nivelAuto(visualPC) {
  if (visualPC) return 'alta';
  const fraco = (navigator.hardwareConcurrency || 4) <= 4 || (navigator.deviceMemory || 4) <= 2;
  return fraco ? 'baixa' : 'media';
}

// sombreador das poltronas: troca só o tecido vermelho e a madeira da textura original, preservando o relevo
const TROCA_POLTRONA = `
#ifdef USE_MAP
  vec4 sdc = texture2D( map, vMapUv );
  vec3 cc = sdc.rgb;
  float lum = dot( cc, vec3( 0.2126, 0.7152, 0.0722 ) );
  float gr = cc.g / max( cc.r, 0.001 );
  float vermelho = smoothstep( 0.30, 0.18, gr ) * smoothstep( 0.10, 0.25, cc.r - cc.b );
  float madeira = smoothstep( 0.30, 0.42, gr ) * smoothstep( 0.80, 0.62, gr ) * smoothstep( 0.15, 0.30, cc.r - cc.b );
  vec3 tecido = uTecido * clamp( lum / 0.19, 0.25, 1.8 );
  vec3 det = uDetalhe * clamp( lum / 0.45, 0.25, 1.6 );
  cc = mix( cc, mix( mix( cc, tecido, vermelho ), det, madeira ), uMixPoltrona );
  diffuseColor *= vec4( cc, sdc.a );
#endif
`;

export class SalaTematica {
  constructor(cin, ctx) {
    this.cin = cin; this.ctx = ctx;
    const preferencia = lerPreferencia();
    this.preferencia = Object.hasOwn(ROTULO, preferencia) ? preferencia : 'auto';
    this.nivel = this.preferencia === 'auto' ? nivelAuto(ctx.VISUAL_PC) : this.preferencia;
    this.decor = new Map();                     // tema -> camadas (criadas uma vez, guardadas)
    this.ativo = [];                            // temas visíveis agora
    this.chave = 'padrao';
    this.atual = this._numeros(paleta([]));
    this.alvo = this.atual;
    this.uPoltrona = { uTecido: { value: new THREE.Color(PADRAO.tecido) }, uDetalhe: { value: new THREE.Color(PADRAO.detalhe) }, uMixPoltrona: { value: 0 } };
    this.luzesExtras = [];
    this._montarLuzes();
    this._t0 = performance.now();
    this._instalarBotao();
  }

  // pontos de luz fixos (só na qualidade alta): criados uma vez para não recompilar materiais ao trocar de tema
  _montarLuzes() {
    for (const l of this.luzesExtras) l.removeFromParent();
    this.luzesExtras = [];
    const n = NIVEIS[this.nivel].luzes;
    for (let i = 0; i < n; i++) { const l = new THREE.PointLight('#ffffff', 0, 10, 1.6); l.visible = true; this.cin.cena.add(l); this.luzesExtras.push(l); }
  }

  registrarPoltronas(mats) {
    this.matsPoltrona = mats;
    for (const m of mats) {
      m.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, this.uPoltrona);
        sh.fragmentShader = 'uniform vec3 uTecido;\nuniform vec3 uDetalhe;\nuniform float uMixPoltrona;\n' + sh.fragmentShader.replace('#include <map_fragment>', TROCA_POLTRONA);
      };
      m.customProgramCacheKey = () => 'poltrona-tematica';
      m.needsUpdate = true;
    }
  }

  // ---------------------------------------------------------------- aplicar tema
  aplicar(filme) {
    const lista = temasDoFilme(filme);
    const chave = lista.join('+') || 'padrao';
    this.filme = filme;
    if (chave === this.chave && !this._forcar) return;
    this._forcar = false;
    this.chave = chave; this.temas = lista;
    this.alvo = this._numeros(paleta(lista));
    this.supAlvo = this.alvo.sup;
    for (const t of lista) this._decorDe(t);   // prepara (só na primeira vez) antes de mostrar
    this._trans = { t0: performance.now(), dur: this.nivel === 'baixa' ? 900 : 1800, de: this.atual, trocado: false };
    document.documentElement.dataset.temaSala = chave;
    window.dispatchEvent(new CustomEvent('cine:tema', { detail: { temas: lista, chave } }));
  }

  _numeros(p) {
    const o = { sup: p.sup, anim: p.anim };
    for (const k of CHAVES_COR) o[k] = new THREE.Color(p[k]);
    for (const k of CHAVES_NUM) o[k] = p[k];
    return o;
  }

  _decorDe(tema) {
    if (this.decor.has(tema)) return this.decor.get(tema);
    const q = { ...NIVEIS[this.nivel], nivel: this.nivel };
    const c = CONSTRUTORES[tema](q);
    const raiz = new THREE.Group(); raiz.name = 'tema-' + tema; raiz.visible = false;
    const animados = [];
    for (const k of CAMADAS) {
      if (!c[k]) continue;
      c[k].name = k; raiz.add(c[k]);
    }
    raiz.traverse(o => { if (o.userData.animar) animados.push(o); });
    this.ctx.baratear(raiz);
    if (this.ctx.MOBILE) raiz.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = false; });
    this.cin.cena.add(raiz);
    const d = { raiz, camadas: c, animados, luzes: c.luzes || [] };
    this.decor.set(tema, d);
    return d;
  }

  // qual tema mostra cada camada: a do principal; se ele não tem, a do segundo gênero
  _mostrarDecoracao() {
    for (const [t, d] of this.decor) {
      d.raiz.visible = this.temas.includes(t);
      if (!d.raiz.visible) continue;
      for (const k of CAMADAS) {
        const dono = this.temas.find(x => this.decor.get(x)?.camadas[k]);
        if (d.camadas[k]) d.camadas[k].visible = dono === t;
      }
    }
    this.animados = this.temas.flatMap(t => {
      const d = this.decor.get(t); return d ? d.animados.filter(o => { let p = o; while (p && p !== d.raiz) { if (!p.visible) return false; p = p.parent; } return true; }) : [];
    });
    // luzes extras (qualidade alta)
    const pedidos = this.temas.flatMap(t => this.decor.get(t)?.luzes || []);
    this.luzesExtras.forEach((l, i) => {
      const p = pedidos[i];
      if (!p) { l.intensity = 0; l.userData = {}; return; }
      l.position.set(...p.pos); l.color.set(p.cor); l.distance = p.dist; l.userData = { base: p.int, tremer: p.tremer, sirene: p.sirene };
    });
  }

  _texturas(sup) {
    const M = this.cin._m, real = (m) => m?.userData?._lambert || m;
    const tamanho = NIVEIS[this.nivel].tex;
    const por = (mat, tipo, rx, ry, campo = 'map') => {
      const m = real(mat); if (!m) return;
      const antes = m[campo];
      if (tipo ? antes?.userData?.tipo === tipo && antes.image.width === tamanho : !antes) return;
      const nova = tipo ? comRepeticao(texturaSuperficie(tipo, tamanho), rx, ry) : null;
      if (nova) {
        nova.userData.tipo = tipo;
        nova.anisotropy = Math.min(4, this.cin.renderer.capabilities.getMaxAnisotropy());
      }
      const mudouPresenca = !!antes !== !!nova;
      antes?.dispose?.();
      m[campo] = nova;
      if (mudouPresenca) m.needsUpdate = true;
    };
    por(M.piso, sup.piso, 13, 17);
    por(M.degrau, sup.piso, 12, 1);
    por(M.parede, sup.parede, 8, 3);
    por(M.painel, sup.painel, 1.5, 2.6);
    por(M.palco, sup.palco || sup.piso, 12, 1);
    por(M.painel, sup.painelBrilho, 1.5, 2.6, 'emissiveMap');
  }

  _aplicarValores(p, escurecer) {
    const cin = this.cin, M = cin._m, Lz = cin._l, real = (m) => m?.userData?._lambert || m;
    const cor = (mat, c, campo = 'color') => { const m = real(mat); if (m && m[campo]) m[campo].copy(c); };
    cin.cena.background.copy(p.fundo);
    cin.cena.fog.color.copy(p.nevoa); cin.cena.fog.near = p.nevoaPerto; cin.cena.fog.far = p.nevoaLonge;
    cor(M.parede, p.parede); cor(M.parede, p.paredeEm, 'emissive');
    cor(M.painel, p.painel); cor(M.painel, p.painelEm, 'emissive');
    cor(M.piso, p.piso); cor(M.degrau, p.degrau); cor(M.teto, p.teto); cor(M.frente, p.frente); cor(M.palco, p.palco); cor(M.cortina, p.cortina);
    const neon = (k) => { const c = p[k].clone().multiplyScalar(0.25 + 0.75 * escurecer); return c; };
    for (const k of ['neonA', 'neonB', 'faixa', 'sanca', 'ledPalco', 'borda', 'brilho', 'arandela', 'luzTeto']) cor(M[k], neon(k));
    const f = escurecer;
    Lz.hemi.color.copy(p.ceu); Lz.hemi.groundColor.copy(p.chao); Lz.hemi.intensity = 1.1 * p.hemi * f;
    Lz.amb.color.copy(p.amb); Lz.amb.intensity = (this.ctx.VISUAL_PC ? 1.2 : 2.2) * p.ambM * f;
    Lz.pontos.forEach((l, i) => { l.color.copy(p.pontual); l.intensity = (i % 2 ? 45 : 60) * p.pontualM * f; });
    if (Lz.fundo) { Lz.fundo.color.copy(p.fundoLuz); Lz.fundo.intensity = 14 * f; }
    this.uPoltrona.uTecido.value.copy(p.tecido); this.uPoltrona.uDetalhe.value.copy(p.detalhe); this.uPoltrona.uMixPoltrona.value = p.poltrona;
    this._escurecer = f;
  }

  _misturar(a, b, k) {
    const o = { sup: k < 0.5 ? a.sup : b.sup, anim: k < 0.5 ? a.anim : b.anim };
    for (const c of CHAVES_COR) o[c] = a[c].clone().lerp(b[c], k);
    for (const c of CHAVES_NUM) o[c] = a[c] + (b[c] - a[c]) * k;
    return o;
  }

  // ---------------------------------------------------------------- animação (chamada pela sala)
  animar(t) {
    const agora = performance.now();
    if (this._trans) {
      const tr = this._trans, k = Math.min(1, (agora - tr.t0) / tr.dur);
      const e = k * k * (3 - 2 * k);
      const escurecer = 1 - 0.78 * Math.sin(Math.PI * k);          // luzes baixam e voltam, como no cinema
      if (!tr.trocado && k >= 0.5) { tr.trocado = true; this._texturas(this.alvo.sup); this._mostrarDecoracao(); }
      this.atual = this._misturar(tr.de, this.alvo, e);
      this._aplicarValores(this.atual, escurecer);
      this._fadeDecor(k);
      if (k >= 1) { this._trans = null; this.atual = this.alvo; this._aplicarValores(this.alvo, 1); this._fadeDecor(1); }
    }
    this._medirDesempenho(agora);
    if (this.nivel === 'baixa' && !this._trans) return;
    const tt = (agora - this._t0) / 1000;
    for (const o of this.animados || []) o.userData.animar(tt);
    this._animarLuzes(tt);
  }

  // decoração nova cresce suavemente no lugar (sem trocar transparência dos materiais)
  _fadeDecor(k) {
    const s = k < 0.5 ? 1 : Math.min(1, 0.6 + (k - 0.5) * 0.8);
    for (const t of this.temas || []) { const d = this.decor.get(t); if (d) for (const c of CAMADAS) if (d.camadas[c]?.visible && c !== 'particulas') d.camadas[c].position.y = (1 - s) * -0.6; }
  }

  _animarLuzes(t) {
    const p = this.atual, M = this.cin._m, real = (m) => m?.userData?._lambert || m;
    const anim = p.anim, f = this._escurecer ?? 1;
    if (anim && !this._trans) {
      const a = real(M.neonA), b = real(M.neonB);
      if (anim === 'sirene') { const s = Math.sin(t * 6) > 0; a.color.copy(p.neonA).multiplyScalar(s ? 1 : 0.15); b.color.copy(p.neonB).multiplyScalar(s ? 0.15 : 1); }
      else if (anim === 'pulso') { const v = 0.55 + 0.45 * Math.abs(Math.sin(t * 2.4)); a.color.copy(p.neonA).multiplyScalar(v); b.color.copy(p.neonB).multiplyScalar(1.45 - v); }
      else if (anim === 'tremor') { const v = Math.random() < 0.015 ? 0.25 : 0.85 + 0.15 * Math.sin(t * 17) * Math.sin(t * 5.3); a.color.copy(p.neonA).multiplyScalar(v); }
      else if (anim === 'respira') { const v = 0.75 + 0.25 * Math.sin(t * 0.9); a.color.copy(p.neonA).multiplyScalar(v); b.color.copy(p.neonB).multiplyScalar(1.5 - v); }
      else if (anim === 'onda') { const v = 0.7 + 0.3 * Math.sin(t * 1.6); a.color.copy(p.neonA).multiplyScalar(v); b.color.copy(p.neonB).multiplyScalar(1.7 - v); }
      else if (anim === 'arcoiris') { a.color.setHSL((t * 0.05) % 1, 0.9, 0.55); b.color.setHSL((t * 0.05 + 0.5) % 1, 0.9, 0.55); }
    }
    for (const l of this.luzesExtras) {
      const u = l.userData; if (!u.base) continue;
      let v = u.base * f;
      if (u.tremer) v *= 0.8 + 0.2 * Math.sin(t * 13 + l.id) * Math.sin(t * 7.1);
      if (u.sirene !== undefined) v *= ((Math.sin(t * 9) > 0) === (u.sirene === 0)) ? 1 : 0.05;
      l.intensity = v;
    }
  }

  // aparelho lento na qualidade automática: baixa um nível uma vez (sem travar a sessão)
  _medirDesempenho(agora) {
    if (this.preferencia !== 'auto' || this.nivel === 'baixa') return;
    const m = this._fps ||= { ult: agora, soma: 0, n: 0, desde: agora };
    const dt = agora - m.ult; m.ult = agora;
    if (agora - m.desde < 5000 || dt > 500) return;   // ignora o começo e abas escondidas
    m.soma += dt; m.n++;
    if (m.n >= 150) {
      const media = m.soma / m.n; m.soma = 0; m.n = 0;
      if (media > 45) this.definirQualidade(this.nivel === 'alta' ? 'media' : 'baixa', true);
    }
  }

  definirQualidade(nivel, automatico = false) {
    if (!automatico) { this.preferencia = nivel; try { localStorage.setItem('cine-graficos', nivel); } catch { } }
    const novo = nivel === 'auto' ? nivelAuto(this.ctx.VISUAL_PC) : nivel;
    const anterior = this.nivel;
    this.nivel = novo;
    this._atualizarBotao();
    if (novo === anterior) return;
    this._fps = null;
    // refaz só a decoração (a sala continua a mesma)
    for (const d of this.decor.values()) { d.raiz.removeFromParent(); d.raiz.traverse(o => { o.geometry?.dispose?.(); }); }
    this.decor.clear();
    this._montarLuzes();
    this._forcar = true; const f = this.filme; this.chave = null; this.aplicar(f);
  }

  // botão "✨ Gráficos" no menu lateral da sala (Auto → Alta → Média → Leve)
  _instalarBotao() {
    const menu = document.getElementById('menu-lateral');
    if (!menu || document.getElementById('graficos-botao')) return;
    const b = this.botao = document.createElement('button');
    b.id = 'graficos-botao'; b.type = 'button'; b.title = 'Qualidade gráfica da sala 3D';
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const ordem = ['auto', 'alta', 'media', 'baixa'];
      this.definirQualidade(ordem[(ordem.indexOf(this.preferencia) + 1) % ordem.length]);
    });
    const antes = menu.querySelector('[data-ir="painel"]') || menu.querySelector('[data-ir="sair"]');
    menu.insertBefore(b, antes);
    this._atualizarBotao();
  }
  _atualizarBotao() { if (this.botao) this.botao.innerHTML = `✨<span>${ROTULO[this.preferencia]}${this.preferencia === 'auto' ? ' · ' + ROTULO[this.nivel] : ''}</span>`; }

  destruir() {
    for (const d of this.decor.values()) d.raiz.removeFromParent();
    this.decor.clear(); this.botao?.remove();
  }
}
