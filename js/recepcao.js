import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { AmbienteCinema, TELA, MOBILE, baratear } from './ambiente-cinema.js';

class Recepcao extends AmbienteCinema {
  constructor(canvas) {
    super();
    this._m = {}; this._l = {pontos:[]}; this.assentos = []; this._matsPoltrona = [];
    this.cena = new THREE.Scene();
    this.cena.background = new THREE.Color('#09060b');
    const renderer = new THREE.WebGLRenderer({canvas,antialias:!MOBILE,powerPreference:'low-power'});
    renderer.setPixelRatio(Math.min(devicePixelRatio,MOBILE ? 1 : 1.5));
    this._montarSala();
    baratear(this.cena);
    const moldura = new THREE.Mesh(new THREE.BoxGeometry(TELA.w+0.42,TELA.h+0.42,0.18),new THREE.MeshBasicMaterial({color:0x211923}));
    moldura.position.set(0,TELA.y,TELA.z+0.12);
    const painel = new THREE.Mesh(new THREE.PlaneGeometry(TELA.w,TELA.h),new THREE.MeshBasicMaterial({color:0x989196}));
    painel.rotation.y = Math.PI; painel.position.set(0,TELA.y,TELA.z);
    this.cena.add(moldura,painel);
    const camera = new THREE.PerspectiveCamera(55,1,0.1,80);
    camera.position.set(0,5.8,-7);
    const controles = new OrbitControls(camera,canvas);
    controles.target.set(0,TELA.y,TELA.z); controles.enablePan = false; controles.enableZoom = false;
    controles.minAzimuthAngle = Math.PI-0.32; controles.maxAzimuthAngle = -Math.PI+0.32;
    controles.minPolarAngle = Math.PI*0.42; controles.maxPolarAngle = Math.PI*0.52;
    controles.update();
    const desenhar = () => renderer.render(this.cena,camera);
    const ajustar = () => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      camera.aspect = w/h;
      camera.fov = Math.max(48,THREE.MathUtils.radToDeg(2*Math.atan(0.46/camera.aspect)));
      camera.updateProjectionMatrix(); renderer.setSize(w,h,false); desenhar();
    };
    this.aoMudarAmbiente = desenhar;
    controles.addEventListener('change',desenhar);
    addEventListener('resize',ajustar);
    ajustar();
    this._montarPoltronas().then(desenhar).catch(e=>console.warn('Poltronas da recepção',e));
    canvas.classList.add('pronta');
    canvas.addEventListener('webglcontextlost',() => canvas.classList.remove('pronta'));
    canvas.addEventListener('webglcontextrestored',() => { ajustar(); canvas.classList.add('pronta'); });
  }
}
export function abrirRecepcao() { return new Recepcao(document.getElementById('recepcao')); }
