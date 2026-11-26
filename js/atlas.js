// skyofsound: Every Noise at Once's genres as a living star map (Three.js), turning into Venn circles up close.
// Data: site/data/graph.json (scripts/build_graph.py). Positions: site/data/layout.json, computed once offline by
// scripts/layout_graph.js, so the map is the same at every zoom level and does not move.
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

// ---------------------------------------------------------------- settings
// Reduce motion follows the OS setting (no in-page switch: Aditya removed it as unnecessary).
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
document.documentElement.classList.toggle("calm", reduceMotion);
const small = matchMedia("(max-width: 720px)").matches;
const S = {
  size: 1, bloom: small ? 0.7 : 0.85, twinkle: !reduceMotion, dust: true,
  links: true, linkOp: 0.18, linkRank: 1, labels: 160, groupLabels: true,
  venn: 40, sparks: !reduceMotion, hoverPlay: false, lens: true,
};
const GROUP_COLORS = {
  "pop": "#00ffa6", "electronic": "#00b8ff", "hip hop": "#b700ff", "r&b": "#ff009d", "latin": "#00ffea",
  "reggae": "#00ff3c", "indie": "#ffffff", "rock": "#7700ff", "punk": "#ff0055", "metal": "#4400ff",
  "folk": "#00e5ff", "country": "#00ff88", "blues": "#00aaff", "jazz": "#e100ff", "classical": "#c2f0ff",
  "worship": "#00ffc8", "children": "#ff00ea",
};
// Data files are cached by the browser like scripts; bump DATA_V whenever a scripts/build_*.py output changes format,
// or old cached files get read with new code (happened once: clips.json changed from ids to [id, track]).
const DATA_V = 6;   // 4: artist rows carry a score + later-word aliases (2026-11-12)
const dataUrl = (path) => `data/${path}?v=${DATA_V}`;
const FOV = 50, MIN_DIST = 30, MAX_DIST = 9000, Z_DEPTH = 320;
const DEPTH = (oc, R) => (oc > 0 ? R * (0.14 + 0.8 * Math.min(oc, 0.7) / 0.7) : 0); // same rule as layout_graph.js
const TAU = Math.PI * 2;

// ---------------------------------------------------------------- dom
const $ = (id) => document.getElementById(id);
const canvas = $("sky"), labelLayer = $("labels"), tip = $("tip"), card = $("card");

// ---------------------------------------------------------------- three setup
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, small ? 1.5 : 2));
renderer.setClearColor(0x020202, 1);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(FOV, 1, 1, 80000);
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), S.bloom, 0.5, 0.18);
composer.addPass(bloom);
composer.addPass(new OutputPass());

let W = 1, H = 1, homeDist = 3300, started = false;
function resize() {
  W = innerWidth; H = innerHeight;
  renderer.setSize(W, H, false);
  composer.setSize(W, H);
  camera.aspect = W / H;
  camera.updateProjectionMatrix();
  homeDist = Math.max(3300, 3500 / (camera.aspect * 2 * Math.tan((FOV * Math.PI) / 360)));
  if (!started) { goal.dist = homeDist; cam.dist = homeDist * 1.3; }
  for (const m of [starMat, dustMat, nebulaMat]) if (m) m.uniforms.uScale.value = H / (2 * Math.tan((FOV * Math.PI) / 360));
  if (linkMat) linkMat.uniforms.uRes.value.set(W, H);
}

const uTime = { value: 0 };
const uFlat = { value: 1 };     // 1 = full 3D depth, 0 = flat (zoomed in / Venn)
const uVenn = { value: 0 };     // 0..1 Venn transition

// background: a dim, slowly shifting nebula painted in screen space
const skyMat = new THREE.ShaderMaterial({
  depthTest: false, depthWrite: false,
  uniforms: { uTime, uYaw: { value: 0 }, uTarget: { value: new THREE.Vector2() } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = position.xy*0.5+0.5; gl_Position = vec4(position.xy, 0.9999, 1.0); }`,
  fragmentShader: `
    varying vec2 vUv; uniform float uTime; uniform float uYaw; uniform vec2 uTarget;
    float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
    float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
      return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
    float fbm(vec2 p){ float v=0., a=.5; for(int i=0;i<5;i++){ v+=a*n(p); p=p*2.03+vec2(1.7,9.2); a*=.5; } return v; }
    void main(){
      vec2 p = vUv*vec2(2.2,1.4) + uTarget*0.00006 + vec2(uYaw*0.15, 0.);
      float a = fbm(p*1.3 + uTime*0.004), b = fbm(p*2.1 - uTime*0.003 + 4.0);
      vec3 col = vec3(0.012,0.008,0.035);
      col += vec3(0.20,0.08,0.42) * pow(a,3.0) * 0.20;
      col += vec3(0.02,0.22,0.35) * pow(b,4.0) * 0.16;
      float v = smoothstep(1.25, 0.25, length(vUv-0.5)*1.6);
      gl_FragColor = vec4(col*v, 1.0);
    }`,
});
const skyQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), skyMat);
skyQuad.frustumCulled = false; skyQuad.renderOrder = -10;
scene.add(skyQuad);

// distant background stars on a huge sphere: they turn with the camera, giving depth when the map tilts or spins
{
  const n = small ? 2500 : 5000, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const u = Math.random() * 2 - 1, t = Math.random() * TAU, r = 30000;
    pos.set([Math.sqrt(1 - u * u) * Math.cos(t) * r, Math.sqrt(1 - u * u) * Math.sin(t) * r, u * r - 4000], i * 3);
    const warm = Math.random();
    col.set(warm > 0.8 ? [1, 0.85, 0.7] : warm > 0.5 ? [0.75, 0.82, 1] : [0.9, 0.9, 1], i * 3);
    size[i] = Math.random() < 0.97 ? 0.6 + Math.random() * 1.1 : 1.8 + Math.random() * 1.6;
  }
  
  // Create 3D Spheres using InstancedMesh
  const sphereGeo = new THREE.SphereGeometry(1, 16, 16);
  const sphereMat = new THREE.MeshStandardMaterial({ 
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 0.8,
      roughness: 0.2,
      metalness: 0.8,
      transparent: true,
      opacity: 0.9
  });
  
  const pts = new THREE.InstancedMesh(sphereGeo, sphereMat, n); // 'n' is the number of nodes
  
  const dummy = new THREE.Object3D();
  for (let i = 0; i < n; i++) {
      dummy.position.set(pos[i*3], pos[i*3+1], pos[i*3+2]);
      
      // Scale based on original aSize logic but adjusted for 3D sphere volume
      let s = size[i] * 0.15; 
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      pts.setMatrixAt(i, dummy.matrix);
      
      pts.setColorAt(i, new THREE.Color(col[i*3], col[i*3+1], col[i*3+2]));
  }
  pts.instanceMatrix.needsUpdate = true;
  pts.instanceColor.needsUpdate = true;

  // We need to add some lighting since spheres need light to look 3D (StandardMaterial)
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);
  const dirLight = new THREE.DirectionalLight(0xffffff, 1);
  dirLight.position.set(100, 100, 500);
  scene.add(dirLight);
 pts.frustumCulled = false; pts.renderOrder = -9;
  scene.add(pts);
}

// ---------------------------------------------------------------- materials for the genre map
const STAR_VS = `
  attribute float aSize; attribute float aZ; attribute float aPhase; attribute float aDim; attribute float aIdx; attribute float aVen; attribute float aGroup;
  attribute vec3 color;
  uniform float uScale, uSize, uTime, uTwinkle, uHover, uSel, uFlatV, uVennV, uHoverGroup, uCur, uCurGlow;
  varying vec3 vC; varying float vA; varying float vSharp; varying float vSpike;
  void main(){
    vec3 p = vec3(position.xy, aZ*uFlatV);
    vec4 mv = modelViewMatrix*vec4(p,1.);
    float hov = (abs(aIdx-uHover)<0.5 || abs(aIdx-uSel)<0.5) ? 1.0 : 0.0;
    float hg = abs(aGroup-uHoverGroup)<0.5 ? 1.0 : 0.0;
    float tw = mix(1.0, 0.88 + 0.12*sin(uTime*(0.6+aPhase*1.2) + aPhase*40.0), uTwinkle);
    float cur = abs(aIdx-uCur)<0.5 ? uCurGlow : 0.0;   // the journey / drift stop the trail has reached
    float s = aSize*uSize*(1.0+hov*0.9+hg*0.35+cur*1.1)*mix(1.0, 0.45, aVen*uVennV);
    float px = s*13.0*uScale/(-mv.z);
    gl_PointSize = clamp(px, 2.2, 160.0);
    vSharp = smoothstep(3.0, 30.0, px);        // far = soft and blurred, near = crisp core (depth of field)
    vSpike = smoothstep(0.55, 1.0, aSize/3.2) * (1.0 - aVen*uVennV);
    vC = color; vA = tw*aDim*(1.0+hov*0.8+hg*0.9+cur*1.6);
    gl_Position = projectionMatrix*mv;
  }`;
const STAR_FS = `
  varying vec3 vC; varying float vA; varying float vSharp; varying float vSpike;
  void main(){
    vec2 uv = gl_PointCoord*2.0-1.0; float r = length(uv); if(r>1.0) discard;
    float core = exp(-r*r*mix(26.0, 90.0, vSharp));
    float halo = exp(-r*r*mix(5.0, 9.0, vSharp))*mix(0.16, 0.22, vSharp);
    float spikes = (exp(-abs(uv.x)*48.)*exp(-abs(uv.y)*2.6) + exp(-abs(uv.y)*48.)*exp(-abs(uv.x)*2.6))*vSpike*0.7;
    vec3 c = vC*vC;                                 // squared colour: more saturated glow, as in classic star renderers
    vec3 col = c*(halo + spikes) + mix(vC, vec3(1.0), 0.6)*core*1.15;
    gl_FragColor = vec4(col*vA, 1.0);
  }`;
let starMat, dustMat, nebulaMat;

// ---------------------------------------------------------------- data + scene objects
let N = 0, G = [], nodes = [], links = [], groupSize, groupOf, degree, zOff, colorOf, adj, pos, scr, vis;
let starGeo, linkGeo, dustGeo, nebGeo, dustAnchor, dustR, dustW, dustP, nebAnchor;
let hasPos = false, LAYOUT_R = 7, SIZE = null, popRank = null, byPop = [];
const hiddenGroups = new Set();
let routeKeep = null;                                   // journey stops shown even in faded groups
const tour = { on: false, run: 0, orbit: 0, ch: 0 };   // the narrated tour (see startTour)

async function load() {
  const layoutReq = fetch(dataUrl("layout.json")).then((r) => r.json());
  const res = await fetch(dataUrl("graph.json"));
  const data = await res.json();
  if (data.preview_prefix) PREFIX = data.preview_prefix;
  G = data.groups.map((g) => ({ ...g, color: new THREE.Color(GROUP_COLORS[g.name]) }));
  nodes = data.nodes; links = data.links; N = nodes.length;
  groupOf = new Int8Array(N); degree = new Int32Array(N); zOff = new Float32Array(N);
  colorOf = new Float32Array(N * 3);
  adj = new Map();
  for (let i = 0; i < N; i++) {
    groupOf[i] = nodes[i][2];
    const c = G[groupOf[i]].color, j = (Math.random() - 0.5) * 0.12;
    colorOf.set([Math.min(1, c.r + j), Math.min(1, c.g + j), Math.min(1, c.b + j)], i * 3);
    zOff[i] = (Math.random() + Math.random() + Math.random() - 1.5) / 1.5 * Z_DEPTH;
  }
  groupSize = new Int32Array(G.length);
  for (let i = 0; i < N; i++) groupSize[groupOf[i]]++;
  for (let k = 0; k < links.length; k++) {
    const [a, b] = links[k];
    degree[a]++; degree[b]++;
    adj.set(a * N + b, k);
  }
  pos = new Float32Array(N * 2); scr = new Float32Array(N * 3); vis = new Uint8Array(N);
  buildStars(); buildLinks(); buildDust(); buildNebula(); buildRings(); buildOverlap();
  buildUI();
  $("stats").textContent = "";                         // only used for "Loading…" and load errors

  const lay = await layoutReq;
  LAYOUT_R = lay.R; SIZE = Float32Array.from(lay.size);
  const ss = starGeo.attributes.aSize.array;
  for (let i = 0; i < N; i++) ss[i] = 0.35 + SIZE[i] * 0.95;          // star size follows popularity too
  starGeo.attributes.aSize.needsUpdate = true;
  for (let i = 0; i < N; i++) { pos[i * 2] = lay.x[i]; pos[i * 2 + 1] = lay.y[i]; }
  homePos = Float32Array.from(pos);
  for (let i = 0; i < N; i++) { const nb = nodes[i][6]; for (let k = 0; k < nb.length; k += 2) sharedMap.set(Math.min(i, nb[k]) * N + Math.max(i, nb[k]), nb[k + 1]); }
  hasPos = true; positionsDirty = true;
  readHash();
}

function buildStars() {
  starGeo = new THREE.BufferGeometry();
  const size = new Float32Array(N), phase = new Float32Array(N), dim = new Float32Array(N).fill(1), idx = new Float32Array(N), ven = new Float32Array(N);
  for (let i = 0; i < N; i++) { size[i] = 0.75 + Math.sqrt(degree[i]) * 0.36; phase[i] = Math.random(); idx[i] = i; }
  starGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3), 3).setUsage(THREE.DynamicDrawUsage));
  starGeo.setAttribute("color", new THREE.BufferAttribute(colorOf, 3));
  starGeo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  starGeo.setAttribute("aZ", new THREE.BufferAttribute(zOff, 1));
  starGeo.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));
  starGeo.setAttribute("aDim", new THREE.BufferAttribute(dim, 1));
  starGeo.setAttribute("aIdx", new THREE.BufferAttribute(idx, 1));
  starGeo.setAttribute("aVen", new THREE.BufferAttribute(ven, 1));
  starGeo.setAttribute("aGroup", new THREE.BufferAttribute(Float32Array.from(groupOf), 1));
  starMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    uniforms: { uScale: { value: 1 }, uSize: { value: S.size }, uTime, uTwinkle: { value: S.twinkle ? 1 : 0 },
      uHover: { value: -1 }, uHoverGroup: { value: -1 }, uSel: { value: -1 }, uCur: { value: -1 }, uCurGlow: { value: 0 }, uFlatV: uFlat, uVennV: uVenn },
    vertexShader: STAR_VS, fragmentShader: STAR_FS,
  });
  const pts = new THREE.Points(starGeo, starMat); pts.frustumCulled = false; pts.renderOrder = 5;
  scene.add(pts);
}

let linkMat, linkOrder, linkRank, rankCount, linkEnd;   // linkEnd[v] = the genre at line vertex v
// Links are ENAO "nearby" ties. All 10 per genre drive the physics, but only each genre's strongest few are drawn:
// a link's rank is its best position in either genre's ENAO list (1 = closest). Lines are sorted by rank so the
// "links per genre" setting is just a draw range; brighter = closer rank; lines that run long on screen fade out.
function buildLinks() {
  const rankMap = new Map();
  for (let i = 0; i < N; i++) { const nb = nodes[i][6]; for (let k = 0; k < nb.length; k += 2) rankMap.set(i * N + nb[k], k / 2 + 1); }
  const L = links.length;
  linkRank = new Int8Array(L);
  for (let k = 0; k < L; k++) {
    const [a, b] = links[k];
    linkRank[k] = Math.min(rankMap.get(a * N + b) ?? 99, rankMap.get(b * N + a) ?? 99);
  }
  linkOrder = Array.from({ length: L }, (_, k) => k).sort((p, q) => linkRank[p] - linkRank[q]);
  rankCount = new Int32Array(12);                       // rankCount[r] = links with rank <= r
  for (let k = 0; k < L; k++) for (let r = linkRank[k]; r <= 10; r++) rankCount[r]++;
  linkGeo = new THREE.BufferGeometry();
  const z = new Float32Array(L * 2), col = new Float32Array(L * 6), other = new Float32Array(L * 6), w = new Float32Array(L * 2);
  linkEnd = new Int32Array(L * 2);
  linkOrder.forEach((k, n) => {
    const [a, b] = links[k], r = linkRank[k];
    linkEnd[n * 2] = a; linkEnd[n * 2 + 1] = b;
    z[n * 2] = zOff[a]; z[n * 2 + 1] = zOff[b];
    col.set(colorOf.subarray(a * 3, a * 3 + 3), n * 6); col.set(colorOf.subarray(b * 3, b * 3 + 3), n * 6 + 3);
    other[n * 6 + 2] = zOff[b]; other[n * 6 + 5] = zOff[a];
    w[n * 2] = w[n * 2 + 1] = r === 1 ? 1 : r === 2 ? 0.72 : r === 3 ? 0.52 : Math.max(0.2, 0.52 - (r - 3) * 0.05);
  });
  linkGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(L * 6), 3).setUsage(THREE.DynamicDrawUsage));
  linkGeo.setAttribute("aOther", new THREE.BufferAttribute(other, 3).setUsage(THREE.DynamicDrawUsage));
  linkGeo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  linkGeo.setAttribute("aZ", new THREE.BufferAttribute(z, 1));
  linkGeo.setAttribute("aW", new THREE.BufferAttribute(w, 1));
  linkGeo.setAttribute("aDim", new THREE.BufferAttribute(new Float32Array(L * 2).fill(1), 1));   // group fading, per end
  linkGeo.setDrawRange(0, rankCount[S.linkRank] * 2);
  linkMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    uniforms: { uOp: { value: S.linkOp }, uFar: { value: 1 }, uFlatV: uFlat, uVennV: uVenn, uRes: { value: new THREE.Vector2(W, H) } },
    vertexShader: `attribute float aZ; attribute vec3 color; attribute vec3 aOther; attribute float aW; attribute float aDim;
      uniform float uFlatV; uniform vec2 uRes; varying vec3 vC; varying float vA;
      void main(){
        vec4 p = projectionMatrix*modelViewMatrix*vec4(position.xy, aZ*uFlatV, 1.);
        vec4 o = projectionMatrix*modelViewMatrix*vec4(aOther.xy, aOther.z*uFlatV, 1.);
        float len = length((p.xy/p.w - o.xy/o.w)*0.5*uRes);
        vA = aW*aDim*(1.0 - 0.85*smoothstep(uRes.y*0.22, uRes.y*0.6, len));     // long lines across the screen fade out
        vC = color; gl_Position = p; }`,
    fragmentShader: `varying vec3 vC; varying float vA; uniform float uOp; uniform float uFar; uniform float uVennV;
      void main(){ gl_FragColor = vec4(vC*uOp*uFar*vA*(1.0-uVennV*0.85), 1.); }`,
  });
  const ls = new THREE.LineSegments(linkGeo, linkMat); ls.frustumCulled = false; ls.renderOrder = 2;
  scene.add(ls);
}

// live star dust: motes orbiting each genre
function buildDust() {
  const per = small ? 1 : 3, M = N * per;
  dustAnchor = new Int32Array(M); dustR = new Float32Array(M); dustW = new Float32Array(M); dustP = new Float32Array(M);
  const z = new Float32Array(M), col = new Float32Array(M * 3), size = new Float32Array(M);
  for (let m = 0; m < M; m++) {
    const a = (dustAnchor[m] = m % N);
    dustR[m] = 4 + Math.random() * (10 + Math.sqrt(degree[a]) * 2.2);
    dustW[m] = (0.03 + Math.random() * 0.12) * (Math.random() < 0.5 ? -1 : 1);
    dustP[m] = Math.random() * TAU;
    z[m] = zOff[a] + (Math.random() - 0.5) * 18;
    col.set(colorOf.subarray(a * 3, a * 3 + 3), m * 3);
    size[m] = 0.18 + Math.random() * 0.3;
  }
  dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(M * 3), 3).setUsage(THREE.DynamicDrawUsage));
  dustGeo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  dustGeo.setAttribute("aZ", new THREE.BufferAttribute(z, 1));
  dustGeo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  dustMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    uniforms: { uScale: { value: 1 }, uFlatV: uFlat, uVennV: uVenn, uOn: { value: 1 } },
    vertexShader: `attribute float aZ; attribute float aSize; attribute vec3 color; uniform float uScale; uniform float uFlatV; varying vec3 vC; varying float vA;
      void main(){ vec4 mv = modelViewMatrix*vec4(position.xy, aZ*uFlatV, 1.);
        float px = aSize*9.0*uScale/(-mv.z); gl_PointSize = clamp(px, 1.0, 6.0);
        vA = clamp(px/2.5, 0.15, 0.7); vC = color; gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `varying vec3 vC; varying float vA; uniform float uOn; uniform float uVennV;
      void main(){ float r = length(gl_PointCoord-0.5)*2.; if(r>1.) discard; gl_FragColor = vec4(mix(vC,vec3(1.),0.4)*exp(-r*r*4.)*0.5*vA*uOn*(1.0-uVennV*0.5), 1.); }`,
  });
  const pts = new THREE.Points(dustGeo, dustMat); pts.frustumCulled = false; pts.renderOrder = 4;
  scene.add(pts);
}

// nebula clouds: huge soft sprites that ride on random genres, colouring each region like interstellar gas
function buildNebula() {
  const M = small ? 420 : 900;
  nebAnchor = new Int32Array(M);
  const z = new Float32Array(M), col = new Float32Array(M * 3), size = new Float32Array(M), rot = new Float32Array(M);
  for (let m = 0; m < M; m++) {
    const a = (nebAnchor[m] = Math.floor(Math.random() * N));
    z[m] = zOff[a] - 60;
    col.set(colorOf.subarray(a * 3, a * 3 + 3), m * 3);
    size[m] = 7 + Math.random() * 13;
    rot[m] = Math.random();
  }
  nebGeo = new THREE.BufferGeometry();
  nebGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(M * 3), 3).setUsage(THREE.DynamicDrawUsage));
  nebGeo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  nebGeo.setAttribute("aZ", new THREE.BufferAttribute(z, 1));
  nebGeo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  nebGeo.setAttribute("aRot", new THREE.BufferAttribute(rot, 1));
  nebulaMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    uniforms: { uScale: { value: 1 }, uFlatV: uFlat, uVennV: uVenn, uTime },
    vertexShader: `attribute float aZ; attribute float aSize; attribute float aRot; attribute vec3 color; uniform float uScale; uniform float uFlatV;
      varying vec3 vC; varying float vA; varying float vR;
      void main(){ vec4 mv = modelViewMatrix*vec4(position.xy, aZ*uFlatV, 1.);
        float px = aSize*30.0*uScale/(-mv.z); gl_PointSize = clamp(px, 2.0, 700.0);
        vA = smoothstep(20.0, 120.0, px) * (1.0 - smoothstep(500.0, 900.0, px)); vC = color; vR = aRot; gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `varying vec3 vC; varying float vA; varying float vR; uniform float uVennV; uniform float uTime;
      void main(){ vec2 uv = gl_PointCoord*2.-1.; float r = length(uv); if(r>1.) discard;
        float a = atan(uv.y, uv.x) + vR*6.28;
        float wisp = 0.75 + 0.25*sin(a*3.0 + r*5.0 + vR*20.0 + uTime*0.05);
        float g = exp(-r*r*3.2) * wisp;
        gl_FragColor = vec4(vC*vC*g*0.018*vA*(1.0-uVennV*0.6), 1.); }`,
  });
  const pts = new THREE.Points(nebGeo, nebulaMat); pts.frustumCulled = false; pts.renderOrder = 1;
  scene.add(pts);
}

// ---------------------------------------------------------------- Venn rings
const MAX_RINGS = 1600;
let rings, ringMat, ringColor, ringColor2, ringPhase, ringSel;
function buildRings() {
  const geo = new THREE.PlaneGeometry(2.9, 2.9);
  ringColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_RINGS * 3), 3);
  ringColor2 = new THREE.InstancedBufferAttribute(new Float32Array(MAX_RINGS * 3), 3);
  ringPhase = new THREE.InstancedBufferAttribute(new Float32Array(MAX_RINGS), 1);
  ringSel = new THREE.InstancedBufferAttribute(new Float32Array(MAX_RINGS), 1);
  geo.setAttribute("iAlpha", new THREE.InstancedBufferAttribute(new Float32Array(MAX_RINGS).fill(1), 1));
  geo.setAttribute("iColor", ringColor); geo.setAttribute("iColor2", ringColor2);
  geo.setAttribute("iPhase", ringPhase); geo.setAttribute("iSel", ringSel);
  ringMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime, uMouse: { value: new THREE.Vector2(1e9, 1e9) }, uPx: { value: 0.01 }, uAlpha: { value: 0 }, uSparks: { value: S.sparks ? 1 : 0 } },
    vertexShader: `
      attribute vec3 iColor; attribute vec3 iColor2; attribute float iPhase; attribute float iSel; attribute float iAlpha;
      uniform vec2 uMouse; uniform float uPx;
      varying vec2 vL; varying vec3 vC1; varying vec3 vC2; varying float vPh; varying float vMA; varying float vProx; varying float vSel; varying float vW; varying float vFade; varying float vA;
      void main(){
        vA = iAlpha;
        vL = position.xy; vC1 = iColor; vC2 = iColor2; vPh = iPhase; vSel = iSel;
        vec2 c = (instanceMatrix*vec4(0.,0.,0.,1.)).xy;
        float R = length(instanceMatrix[0].xyz);
        vec2 dm = uMouse - c; vMA = atan(dm.y, dm.x);
        float dn = length(dm)/R;
        vProx = exp(-max(dn-1.0, 0.0)*1.5) * (1.0 - 0.6*smoothstep(1.0, 0.0, dn));
        vW = uPx / R; vFade = smoothstep(2.5, 7.0, R / uPx);           // per circle: line width, hide while tiny
        gl_Position = projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);
      }`,
    fragmentShader: `
      #define PI 3.14159265
      #define TAU 6.2831853
      uniform float uTime; uniform float uPx; uniform float uAlpha; uniform float uSparks;
      varying vec2 vL; varying vec3 vC1; varying vec3 vC2; varying float vPh; varying float vMA; varying float vProx; varying float vSel; varying float vW; varying float vFade; varying float vA;
      void main(){
        float d = length(vL), ang = atan(vL.y, vL.x), w = min(vW, 0.12);
        float ring = exp(-pow((d-1.0)/(w*0.85), 2.0));
        float halo = exp(-pow((d-1.0)/(w*8.0), 2.0));
        vec3 col = mix(vC1, vC2, 0.5 + 0.5*sin(ang + vPh*TAU + uTime*0.12));     // gradient running round the outline
        float da = abs(mod(ang - vMA + PI, TAU) - PI);
        float streak = exp(-da*da/0.05)*vProx, tail = exp(-da*da/0.7)*vProx;  // light that follows the cursor
        float sp = 0.0;
        for (int k = 0; k < 3; k++) {                                          // sparks drifting along the line
          float fk = float(k), dir = mod(fk, 2.0)*2.0 - 1.0;
          float sa = vPh*TAU*(1.0 + fk*1.7) + uTime*(0.20 + 0.09*fk)*dir;
          float dk = abs(mod(ang - sa + PI, TAU) - PI);
          sp += exp(-dk*dk/0.0022) + 0.25*exp(-dk*dk/0.03);
        }
        sp *= uSparks;
        float inside = 1.0 - smoothstep(1.0 - w, 1.0 + w, d);
        float fill = inside*(0.035 + 0.09*pow(d, 7.0));                      // faint gas, adds up where circles overlap
        vec3 c = col*(ring*(0.32 + 2.0*streak + 0.35*tail + 1.1*sp) + halo*(0.035 + 0.45*streak + 0.2*sp) + fill)
               + vec3(1.0)*ring*(1.1*streak + 0.45*sp);
        c *= (1.0 + max(vSel, 0.0)*0.7) * (vSel < -0.5 ? 0.12 : 1.0);
        gl_FragColor = vec4(c*uAlpha*vFade*vA, 1.0);
      }`,
  });
  rings = new THREE.InstancedMesh(geo, ringMat, MAX_RINGS);
  rings.count = 0; rings.frustumCulled = false; rings.renderOrder = 6;
  scene.add(rings);
}

// ---------------------------------------------------------------- camera: eased goal values with inertia
const cam = { tx: 0, ty: 0, dist: 4200, tilt: 0.62, yaw: 0 };
const goal = { tx: 0, ty: 0, dist: 3300, tilt: 0.62, yaw: 0 };
const vel = { x: 0, y: 0 };
let lastInput = performance.now() - 10000, flying = false, follow = false;
function effectiveTilt() { return goal.tilt * (1 - 0.45 * vennT); }
function smoothstep(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
function viewH(d = cam.dist) { return 2 * d * Math.tan((FOV * Math.PI) / 360); }
// On phones the card is a bottom sheet over the lower part of the screen. sheetLift() is the world offset that puts a
// camera target in the middle of the strip still visible between the header and the sheet, instead of behind it.
function sheetLift() {
  if (innerWidth > 720 || card.hidden) return [0, 0];
  const sheet = Math.min(card.offsetHeight || 0, H * 0.6), head = 110, px = (sheet - head) / 2;
  if (px <= 0) return [0, 0];
  const wpp = viewH(goal.dist) / H;
  return [px * Math.sin(goal.yaw) * wpp, -px * Math.cos(goal.yaw) * wpp];
}
function liftGoal() { const [lx, ly] = sheetLift(); goal.tx += lx; goal.ty += ly; }

function updateCamera(dt) {
  if (!dragging) {
    goal.tx += vel.x * dt * 60; goal.ty += vel.y * dt * 60;
    goal.yaw += spin.yaw * dt * 60;
    goal.tilt = Math.max(0, Math.min(1.25, goal.tilt + spin.tilt * dt * 60));
    const damp = Math.pow(0.9, dt * 60); vel.x *= damp; vel.y *= damp; spin.yaw *= damp; spin.tilt *= damp;
  }
  if (follow && selected >= 0 && hasPos) { const [lx, ly] = sheetLift(); goal.tx = pos[selected * 2] + lx; goal.ty = pos[selected * 2 + 1] + ly; }
  const idle = performance.now() - lastInput;
  if (tour.on && tour.orbit && !reduceMotion) goal.yaw += tour.orbit * dt;
  const k = 1 - Math.exp(-dt * (flying ? (tour.on ? 1.25 : 3.2) : 9));
  cam.tx += (goal.tx - cam.tx) * k; cam.ty += (goal.ty - cam.ty) * k;
  cam.dist *= Math.pow(goal.dist / cam.dist, k);
  cam.yaw += (goal.yaw - cam.yaw) * k;
  const t = effectiveTilt();
  cam.tilt += (t - cam.tilt) * (1 - Math.exp(-dt * 5));
  if (flying && Math.abs(goal.dist / cam.dist - 1) < 0.01 && Math.hypot(goal.tx - cam.tx, goal.ty - cam.ty) < viewH() * 0.004) flying = false;
  const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), st = Math.sin(cam.tilt), ct = Math.cos(cam.tilt);
  camera.position.set(cam.tx + sy * st * cam.dist, cam.ty - cy * st * cam.dist, ct * cam.dist);
  camera.up.set(-sy, cy, 0);
  camera.lookAt(cam.tx, cam.ty, 0);
  camera.updateMatrixWorld();
  skyMat.uniforms.uYaw.value = cam.yaw; skyMat.uniforms.uTarget.value.set(cam.tx, cam.ty);
}

// world point on the z=0 plane under a screen point
const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), hit = new THREE.Vector3();
function worldAt(x, y) {
  ray.setFromCamera({ x: (x / W) * 2 - 1, y: -(y / H) * 2 + 1 }, camera);
  return ray.ray.intersectPlane(plane, hit) ? { x: hit.x, y: hit.y } : null;
}

// ---------------------------------------------------------------- per-frame geometry updates
let positionsDirty = false;
const tmpM = new THREE.Matrix4();
function writePositions() {
  const sp = starGeo.attributes.position.array;
  for (let i = 0; i < N; i++) { sp[i * 3] = pos[i * 2]; sp[i * 3 + 1] = pos[i * 2 + 1]; }
  starGeo.attributes.position.needsUpdate = true;
  if (S.links) {
    const lp = linkGeo.attributes.position.array, op = linkGeo.attributes.aOther.array, n0 = rankCount[S.linkRank];
    for (let n = 0; n < n0; n++) {
      const k = linkOrder[n], a = links[k][0], b = links[k][1], o = n * 6;
      const ax = pos[a * 2], ay = pos[a * 2 + 1], bx = pos[b * 2], by = pos[b * 2 + 1];
      lp[o] = ax; lp[o + 1] = ay; lp[o + 3] = bx; lp[o + 4] = by;
      op[o] = bx; op[o + 1] = by; op[o + 3] = ax; op[o + 4] = ay;
    }
    linkGeo.attributes.position.needsUpdate = true;
    linkGeo.attributes.aOther.needsUpdate = true;
  }
  const np = nebGeo.attributes.position.array;
  for (let m = 0; m < nebAnchor.length; m++) { const a = nebAnchor[m]; np[m * 3] = pos[a * 2]; np[m * 3 + 1] = pos[a * 2 + 1]; }
  nebGeo.attributes.position.needsUpdate = true;
}
function writeDust(t) {
  if (!S.dust) return;
  const dp = dustGeo.attributes.position.array, tt = reduceMotion ? 0 : t;
  for (let m = 0; m < dustAnchor.length; m++) {
    const a = dustAnchor[m], ang = dustP[m] + tt * dustW[m], r = dustR[m];
    dp[m * 3] = pos[a * 2] + Math.cos(ang) * r;
    dp[m * 3 + 1] = pos[a * 2 + 1] + Math.sin(ang) * r * 0.82;
  }
  dustGeo.attributes.position.needsUpdate = true;
}

// project every genre to the screen once per frame (labels, picking, Venn trigger)
function project() {
  const e = tmpM.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).elements;
  const f = uFlat.value;
  let count = 0;
  for (let i = 0; i < N; i++) {
    const x = pos[i * 2], y = pos[i * 2 + 1], z = zOff[i] * f;
    const w = e[3] * x + e[7] * y + e[11] * z + e[15];
    const cx = (e[0] * x + e[4] * y + e[8] * z + e[12]) / w, cy = (e[1] * x + e[5] * y + e[9] * z + e[13]) / w;
    scr[i * 3] = (cx * 0.5 + 0.5) * W; scr[i * 3 + 1] = (-cy * 0.5 + 0.5) * H; scr[i * 3 + 2] = w;
    const v = w > 0 && cx > -1.02 && cx < 1.02 && cy > -1.02 && cy < 1.02 && !faded(i);
    vis[i] = v ? 1 : 0;
    if (v) count++;
  }
  return count;
}

// ---------------------------------------------------------------- Venn mode
// Rings fade in long before the Venn threshold: faint small circles around the stars on screen that grow and brighten
// as you zoom, so you can see where the Venn circles come from. At the threshold the physics takes over the overlaps.
const PRE_RINGS = 1500;
let vennOn = false, vennT = 0, vennIds = [], vennCheck = 0, lastCount = N;
let ringIds = [], ringA = 0;
// each genre's circle radius in world units: size from ENAO's popularity order (layout.json)
const radiusOf = (i) => LAYOUT_R * SIZE[i];
function setRingAttrs(ids) {
  ids.forEach((i, n) => {
    const c = G[groupOf[i]].color, hsl = {}; c.getHSL(hsl);
    const c2 = new THREE.Color().setHSL((hsl.h + 0.12) % 1, Math.min(1, hsl.s * 0.9), Math.min(0.85, hsl.l + 0.12));
    ringColor.setXYZ(n, c.r, c.g, c.b); ringColor2.setXYZ(n, c2.r, c2.g, c2.b);
    ringPhase.setX(n, (i * 0.618) % 1);
    ringSel.setX(n, i === selected ? 1 : artistSet && !artistSet.has(i) ? -1 : 0);
  });
  ringColor.needsUpdate = ringColor2.needsUpdate = ringPhase.needsUpdate = ringSel.needsUpdate = true;
  rings.count = ids.length;
  ringIds = ids;
}
function enterVenn(count) {
  vennOn = true;
  setVennSet();
}
function setVennSet() {
  // the genres on screen; the layout is already the Venn layout, so nothing is moved here
  const ids = [], inSet = new Set();
  const add = (i) => { if (!inSet.has(i) && ids.length < MAX_RINGS && !faded(i)) { inSet.add(i); ids.push(i); } };
  for (let i = 0; i < N && ids.length < MAX_RINGS; i++) if (vis[i]) add(i);
  vennIds = ids;
  const ven = starGeo.attributes.aVen.array; ven.fill(0);
  for (const i of ids) ven[i] = 1;
  starGeo.attributes.aVen.needsUpdate = true;
  setRingAttrs(ids);
}
function exitVenn() {
  vennOn = false; vennIds = [];
  starGeo.attributes.aVen.array.fill(0); starGeo.attributes.aVen.needsUpdate = true;
}
function updateVenn(count) {
  lastCount = count;
  if (++vennCheck % 12 !== 0) return;
  // a focused genre gets the full Venn look as soon as its group is a decent size on screen
  if (!vennOn && count > 0 && count <= S.venn && cam.dist < 2600) enterVenn(count);
  else if (vennOn && (count > S.venn * 1.35 || count === 0)) exitVenn();
  else if (vennOn && vennCheck % 24 === 0) {
    const same = vennIds.filter((i) => vis[i]).length === count;
    if (!same) setVennSet();
  }
  if (!vennOn) {
    if (count > 0 && count <= PRE_RINGS) {
      const ids = [];
      for (let i = 0; i < N && ids.length < MAX_RINGS; i++) if (vis[i]) ids.push(i);
      if (ids.length !== ringIds.length || ids.some((v, n) => v !== ringIds[n])) setRingAttrs(ids);
    } else if (ringA < 0.01 && ringIds.length) { ringIds = []; rings.count = 0; }
  }
}
function writeRings(dt) {
  // target brightness: a faint Venn view from far out (by log of genres on screen), full strength in Venn view
  const c = Math.max(lastCount, S.venn), pre = lastCount <= PRE_RINGS ? Math.log(PRE_RINGS / c) / Math.log(PRE_RINGS / S.venn) : -1;
  const target = vennOn ? 1 : pre < 0 ? 0 : 0.12 + 0.33 * Math.pow(pre, 1.3);
  ringA += (target - ringA) * (1 - Math.exp(-dt * (reduceMotion ? 20 : 0.9)));     // slow, smooth fade
  ringMat.uniforms.uAlpha.value = ringA;
  if (!ringIds.length) return;
  const f = uFlat.value;
  for (let n = 0; n < ringIds.length; n++) {
    const i = ringIds[n];
    const r = radiusOf(i);
    tmpM.makeScale(r, r, 1).setPosition(pos[i * 2], pos[i * 2 + 1], zOff[i] * f);
    rings.setMatrixAt(n, tmpM);
  }
  rings.instanceMatrix.needsUpdate = true;
  ringMat.uniforms.uPx.value = viewH() / H;
}

// ---------------------------------------------------------------- labels (pooled DOM) + what can be hovered
// Only what is labelled can be hovered or clicked: group names when zoomed out, then the biggest genre names that fit,
// then every ring in Venn view. So navigation follows the scale and you can't skip levels from far away.
// Labels are HTML elements over the canvas. Each label keeps its own element (keyed by its text), so moving the
// camera only updates transforms and opacity; before, a shared pool handed elements to different genres every frame,
// rewriting text, classes and font sizes and making the browser redo style and layout - the stutter Aditya saw.
const pool = new Map(), keyCount = new Map();
let used = 0, hits = [], frameNo = 0;
const labelled = new Set();                          // genres the map labelled this frame
let LMUL = 1;                                        // map labels fade out under the overlap view
function lbl(cls, html, x, y, op, color, size, glow) {
  op *= LMUL;
  if (op < 0.01) return;
  const base = (cls.includes("group") ? "g|" : cls.includes("lens") ? "l|" : "") + html;
  const n = keyCount.get(base) || 0; keyCount.set(base, n + 1);
  const key = n ? `${base}#${n}` : base;               // same text twice in a frame: second copy gets its own element
  let el = pool.get(key);
  if (!el) { el = document.createElement("div"); el.innerHTML = html; labelLayer.appendChild(el); pool.set(key, el); }
  used++; el._f = frameNo;
  if (el._c !== cls) { el.className = "lbl " + cls; el._c = cls; }
  // write a style only when its value changed (each write can make the browser recompute styles)
  const tf = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
  if (el._t !== tf) { el.style.transform = tf; el._t = tf; }
  const o = op.toFixed(2); if (el._o !== o) { el.style.opacity = o; el._o = o; }
  const c = color || ""; if (el._col !== c) { el.style.color = c; el._col = c; }
  const fs = size ? size + "px" : ""; if (el._fs !== fs) { el.style.fontSize = fs; el._fs = fs; }
  if (glow && el._g !== glow) { el.style.setProperty("--glow", glow); el._g = glow; }
  if (el._hid) { el.style.display = ""; el._hid = false; }
}
function hideUnusedLabels() {
  for (const [k, el] of pool) {
    if (el._f === frameNo) continue;
    if (!el._hid) { el.style.display = "none"; el._hid = true; }
    if (pool.size > 700 && frameNo - el._f > 600) { el.remove(); pool.delete(k); }   // long unused: drop
  }
}
let groupCentre = [], gcTick = 0;
const groupNudge = [];   // per group: the smoothed {x, y} nudge that keeps names apart
const byDegree = [];   // filled in popularity order (name kept for brevity)
function computeGroupCentres() {
  // median position per group: robust against groups that scatter across the map
  // (z too: the label sits inside its group's cloud, so it moves with those stars instead of sliding over them)
  const xs = G.map(() => []), ys = G.map(() => []), zs = G.map(() => []);
  for (let i = 0; i < N; i += 2) { xs[groupOf[i]].push(pos[i * 2]); ys[groupOf[i]].push(pos[i * 2 + 1]); zs[groupOf[i]].push(zOff[i]); }
  const med = (a) => { a.sort((p, q) => p - q); return a[a.length >> 1] ?? 0; };
  groupCentre = G.map((g, k) => ({ x: med(xs[k]), y: med(ys[k]), z: med(zs[k]) }));
}
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const GROUP_FAR = 2300, GROUP_NEAR = 1500;
function drawLabels() {
  used = 0; hits = []; labelled.clear(); frameNo++; keyCount.clear();
  LMUL = 1 - ov.t;
  const e = tmpM.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).elements;
  const toScr = (x, y, z = 0) => {
    const w = e[3] * x + e[7] * y + e[11] * z + e[15];
    return [((e[0] * x + e[4] * y + e[8] * z + e[12]) / w * 0.5 + 0.5) * W, (-(e[1] * x + e[5] * y + e[9] * z + e[13]) / w * 0.5 + 0.5) * H, w];
  };
  // level 1: broad group names (white), the only clickable things when zoomed out
  const gOp = smoothstep(GROUP_NEAR, GROUP_FAR, cam.dist) * (1 - vennT);
  if (gOp > 0.01 && (S.groupLabels || gOp > 0.5)) {
    if (gcTick++ % 30 === 0) computeGroupCentres();
    // Names that would collide are nudged apart, sideways or up/down, whichever needs the smaller move (only up/down
    // stacked names into a column on narrow phone screens and pushed classical off its stars). The nudge starts from
    // last frame's and eases toward the new one, so moving the camera slides the names instead of making them hop.
    const gl = [], f = uFlat.value;
    G.forEach((g, k) => {
      if (hiddenGroups.has(k)) return;
      // solve from the true positions every frame (starting from last frame's nudge left names stuck where a zoom-out
      // had pushed them: nothing pulled them back once the crowding cleared); smoothing below keeps the motion gentle
      const [x, y, w] = toScr(groupCentre[k].x, groupCentre[k].y, groupCentre[k].z * f);
      if (w > 0) gl.push({ k, x0: x, y0: y, x, y, w: g.name.length * (small ? 9 : 13) + 20, h: small ? 22 : 30 });
    });
    for (let it = 0; it < 40; it++) for (let a = 0; a < gl.length; a++) for (let b = a + 1; b < gl.length; b++) {
      const A = gl[a], B = gl[b], ox = (A.w + B.w) / 2 - Math.abs(A.x - B.x), oy = (A.h + B.h) / 2 - Math.abs(A.y - B.y);
      if (ox <= 0 || oy <= 0) continue;
      if (ox * (A.h + B.h) < oy * (A.w + B.w)) { const s = (B.x0 >= A.x0 ? 1 : -1) * ox * 0.5; A.x -= s; B.x += s; }   // relative to label shape
      else { const s = (B.y0 >= A.y0 ? 1 : -1) * oy * 0.5; A.y -= s; B.y += s; }
    }
    const ease = reduceMotion ? 1 : 0.15;
    for (const L of gl) {
      const want = { x: L.x - L.x0, y: L.y - L.y0 }, had = groupNudge[L.k] ?? want;
      groupNudge[L.k] = { x: had.x + (want.x - had.x) * ease, y: had.y + (want.y - had.y) * ease };
      L.x = L.x0 + groupNudge[L.k].x; L.y = L.y0 + groupNudge[L.k].y;
    }
    for (const L of gl) {
      const hov = hovered && hovered.t === "g" && hovered.k === L.k;
      lbl("group", esc(G[L.k].name), L.x, L.y, gOp * (hov ? 1 : 0.9), "#fff", null, GROUP_COLORS[G[L.k].name]);
      if (gOp > 0.5) hits.push({ t: "g", k: L.k, x0: L.x - L.w / 2 - 6, x1: L.x + L.w / 2 + 6, y0: L.y - L.h / 2 - 8, y1: L.y + L.h / 2 + 8 });
    }
  }
  if (vennT > 0.3) {
    // level 3: names inside the Venn rings, shared-artist counts inside the overlaps
    const pxPerWorld = H / viewH();
    for (const i of vennIds) {
      const Rpx = radiusOf(i) * pxPerWorld;                          // each circle sizes its own label
      if (Rpx < 22) continue;
      const fs = Math.max(11, Math.min(26, Rpx * 0.16));
      lbl("venn", `${esc(nodes[i][0])}${Rpx > 60 ? `<small>${esc(G[groupOf[i]].name)}</small>` : ""}`, scr[i * 3], scr[i * 3 + 1], smoothstep(0.3, 0.8, vennT), i === selected ? "#fff" : "", fs);
    }
    if (S.lens) {
      for (let p = 0; p < vennIds.length; p++) for (let q = p + 1; q < vennIds.length; q++) {
        const a = vennIds[p], b = vennIds[q], sh = sharedOf(a, b);
        if (!sh) continue;
        const ra = radiusOf(a), rb = radiusOf(b);
        const dx = pos[b * 2] - pos[a * 2], dy = pos[b * 2 + 1] - pos[a * 2 + 1], d = Math.hypot(dx, dy);
        if (d >= (ra + rb) * 0.995) continue;
        if ((ra + rb - d) * pxPerWorld < 30) continue;                 // overlap too thin on screen to hold a label
        const t = (d + ra - rb) / 2 / d;                                // middle of the lens, for unequal circles
        const [x, y] = toScr(pos[a * 2] + dx * t, pos[a * 2 + 1] + dy * t);
        lbl("lens", `${sh} shared`, x, y, vennT * 0.9);
      }
    }
  }
  labelled.clear();
  if (vennT < 0.3 && S.labels > 0) {
    // level 2: genre names, biggest first, skipping collisions. As you zoom in, smaller genres win space: recursive.
    const op = smoothstep(GROUP_FAR, GROUP_NEAR, cam.dist) * (1 - vennT / 0.3);
    if (op > 0.02) {
      const boxes = [];
      let shown = 0, rank0 = 0;                                       // rank0 = most popular genre labelled in view
      for (const i of byDegree) {
        if (shown >= S.labels) break;
        if (!vis[i] || i === selected) continue;
        const x = scr[i * 3], y = scr[i * 3 + 1] - 12;
        // popularity sets the look, relative to what is on screen: the most popular genre in view is always large and
        // bright (so a niche area stays readable), less popular ones shrink and fade from there; the global rank still
        // counts a little so pop never looks the same as a niche top genre
        const rank = nodes[i][7];
        if (!rank0) rank0 = rank;
        const tRel = Math.max(0, 1 - Math.log(rank / rank0) / Math.log(250)), tAbs = 1 - Math.log(rank) / Math.log(N);
        const t = 0.7 * tRel + 0.3 * tAbs;
        const fs = Math.round(10 + 17 * Math.pow(t, 2.4));
        const w = nodes[i][0].length * fs * (rank <= 50 ? 0.6 : 0.56), h = fs + 4;
        if (boxes.some((b) => Math.abs(b[0] - x) < (b[2] + w) / 2 && Math.abs(b[1] - y) < (b[3] + h) / 2)) continue;
        boxes.push([x, y, w, h]); labelled.add(i);
        const hov = hovered && hovered.t === "n" && hovered.i === i;
        const tier = t > 0.8 ? "r1" : t > 0.62 ? "r2" : t > 0.45 ? "r3" : "r4";
        lbl(hov ? "hot" : tier, esc(nodes[i][0]), x, y, op * (hov ? 1 : 0.45 + 0.55 * Math.pow(t, 1.1)) * (artistSet && !artistSet.has(i) ? 0.3 : 1), "", fs);
        if (op > 0.5) hits.push({ t: "n", i, x0: x - w / 2 - 4, x1: x + w / 2 + 4, y0: y - h / 2 - 2, y1: scr[i * 3 + 1] + 8 });
        shown++;
      }
    }
  }
  if (jour.stops && vennT < 0.3) {
    const jb = [];                                     // stops close together: the later one goes under its star
    jour.stops.forEach((i, k) => {
      if (!vis[i] || labelled.has(i)) return;
      const cur = k === jour.cur, end = k === 0 || k === jour.stops.length - 1;
      const fs = cur ? 16 : end ? 14 : 13, w = nodes[i][0].length * fs * 0.58 + 8, x = scr[i * 3];
      let y = scr[i * 3 + 1] - 14;
      if (jb.some((b) => Math.abs(b[0] - x) < (b[2] + w) / 2 && Math.abs(b[1] - y) < fs + 4)) y = scr[i * 3 + 1] + 16;
      jb.push([x, y, w]);
      lbl("hot", esc(nodes[i][0]), x, y, cur || end ? 1 : 0.85, "", fs);
      labelled.add(i);
      hits.push({ t: "n", i, x0: x - w / 2, x1: x + w / 2, y0: y - 10, y1: y + 24 });
    });
  }
  if (artistSel && vennT < 0.3) {
    for (const i of artistSel.g.slice(0, 40)) {
      if (!vis[i] || labelled.has(i)) continue;        // already named by the map: don't write it twice
      const x = scr[i * 3], y = scr[i * 3 + 1] - 14, w = nodes[i][0].length * 7.5 + 8;
      lbl("hot", esc(nodes[i][0]), x, y, 1, "", 13);
      hits.push({ t: "n", i, x0: x - w / 2, x1: x + w / 2, y0: y - 10, y1: y + 24 });
    }
  }
  if (selected >= 0 && vennT < 0.5 && vis[selected]) {
    const x = scr[selected * 3], y = scr[selected * 3 + 1] - 18, w = nodes[selected][0].length * 8 + 8;
    lbl("", `<b>${esc(nodes[selected][0])}</b>`, x, y, 1, "#fff", 14);
    if (vennT < 0.3) hits.push({ t: "n", i: selected, x0: x - w / 2, x1: x + w / 2, y0: y - 10, y1: y + 26 });
  }
  LMUL = 1; ovLabels();
  hideUnusedLabels();
}


// ---------------------------------------------------------------- shared artists between genres
let homePos = null, sharedMap = new Map();
function sharedOf(a, b) { return sharedMap.get(Math.min(a, b) * N + Math.max(a, b)) ?? 0; }
function overlapDepth(a, b, shared, ra = radiusOf(a), rb = radiusOf(b)) {
  const oc = shared / Math.min(nodes[a][3], nodes[b][3]);
  return shared > 0 ? Math.min(ra, rb) * (0.14 + 0.8 * Math.min(oc, 0.7) / 0.7) : 0;
}

// ---------------------------------------------------------------- overlap view (a separate screen)
// The map shows sound (ENAO's rankings), so most genres that share artists are not drawn overlapping there. The
// overlap view is its own screen: the map fades out behind a veil, the chosen genre sits in the middle and every ENAO
// neighbour sharing 3+ artists fades in already in place, overlapping it as deep as the shared-artist share says
// (same rule as the map); 1-2 shared sit faintly just touching. Neighbours overlap each other only where they share
// artists too. Clicking a neighbour walks there (cross-fade); ← steps back along the trail; Esc / Map returns to the map.
const ovScene = new THREE.Scene(), ovCam = new THREE.PerspectiveCamera(FOV, 1, 1, 400000);
// the overlap view has its own camera: drag = orbit in 3D, shift/right-drag = pan, scroll/pinch = zoom, 0 = reset.
// World units are pixels at the default distance, so the layout code can think in screen pixels.
const ovView = { tx: 0, ty: 0, dist: 1000, tilt: 0.28, yaw: 0 }, ovGoal = { ...ovView }, ovSpin = { yaw: 0, tilt: 0 };
const ovDist0 = () => H / 2 / Math.tan((FOV * Math.PI) / 360);
function ovResetView(keepAngles) {
  ovGoal.tx = 0; ovGoal.ty = 0; ovGoal.dist = ovDist0();
  if (!keepAngles) { ovGoal.tilt = 0.28; ovGoal.yaw = 0; Object.assign(ovView, ovGoal); ovView.dist = ovDist0() * 1.15; }
}
function ovCamUpdate(dt) {
  if (!ovDrag) {
    ovGoal.yaw += ovSpin.yaw * dt * 60;
    ovGoal.tilt = Math.max(0, Math.min(1.25, ovGoal.tilt + ovSpin.tilt * dt * 60));
    const damp = Math.pow(0.9, dt * 60); ovSpin.yaw *= damp; ovSpin.tilt *= damp;
  }
  const k = 1 - Math.exp(-dt * 8);
  ovView.tx += (ovGoal.tx - ovView.tx) * k; ovView.ty += (ovGoal.ty - ovView.ty) * k;
  ovView.dist *= Math.pow(ovGoal.dist / ovView.dist, k);
  ovView.yaw += (ovGoal.yaw - ovView.yaw) * k; ovView.tilt += (ovGoal.tilt - ovView.tilt) * k;
  const cy = Math.cos(ovView.yaw), sy = Math.sin(ovView.yaw), st = Math.sin(ovView.tilt), ct = Math.cos(ovView.tilt);
  ovCam.aspect = W / H; ovCam.updateProjectionMatrix();
  ovCam.position.set(ovView.tx + sy * st * ovView.dist, ovView.ty - cy * st * ovView.dist, ct * ovView.dist);
  ovCam.up.set(-sy, cy, 0); ovCam.lookAt(ovView.tx, ovView.ty, 0); ovCam.updateMatrixWorld();
}
const ovWpp = () => (2 * ovView.dist * Math.tan((FOV * Math.PI) / 360)) / H;   // world units per pixel
function ovWorldAt(x, y) {
  ray.setFromCamera({ x: (x / W) * 2 - 1, y: -(y / H) * 2 + 1 }, ovCam);
  return ray.ray.intersectPlane(plane, hit) ? { x: hit.x, y: hit.y } : null;
}
const ovV = new THREE.Vector3();
function ovToScr(x, y) { ovV.set(x, y, 0).project(ovCam); return [(ovV.x * 0.5 + 0.5) * W, (-ovV.y * 0.5 + 0.5) * H, ovV.z]; }
let ovDrag = null;
const ovPass = new RenderPass(ovScene, ovCam);
ovPass.clear = false; ovPass.enabled = false;
const ov = { open: false, t: 0, content: 0, contentTarget: 1, time: 0, c: -1, pending: -1, trail: [], L: null, scale: 1, ox: 0, oy: 0, pair: null };
let ovMesh, ovMat, ovVeil, ovA = {};
function buildOverlap() {
  ovVeil = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    transparent: true, depthTest: false, depthWrite: false, uniforms: { uA: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = position.xy; gl_Position = vec4(position.xy, 0., 1.); }`,
    fragmentShader: `varying vec2 vUv; uniform float uA;
      void main(){ float v = 0.82 + 0.18*smoothstep(1.4, 0.2, length(vUv)); gl_FragColor = vec4(vec3(0.012,0.008,0.03)*v, uA); }`,
  }));
  ovVeil.frustumCulled = false; ovVeil.renderOrder = -1;
  ovScene.add(ovVeil);
  const geo = new THREE.PlaneGeometry(2.9, 2.9), M = 32;
  for (const [k, n] of [["iColor", 3], ["iColor2", 3], ["iPhase", 1], ["iSel", 1], ["iAlpha", 1]]) {
    ovA[k] = new THREE.InstancedBufferAttribute(new Float32Array(M * n), n);
    geo.setAttribute(k, ovA[k]);
  }
  ovMat = ringMat.clone();
  ovMat.uniforms.uTime = uTime;
  ovMat.uniforms.uMouse = { value: new THREE.Vector2(1e9, 1e9) };
  ovMat.uniforms.uPx = { value: 1 };                  // one world unit = one pixel in this view
  ovMat.uniforms.uAlpha = { value: 0 };
  ovMat.uniforms.uSparks = ringMat.uniforms.uSparks;
  ovMesh = new THREE.InstancedMesh(geo, ovMat, M);
  ovMesh.count = 0; ovMesh.frustumCulled = false;
  ovScene.add(ovMesh);
  composer.insertPass(ovPass, 1);
}
function ringColours(i) {
  const c = G[groupOf[i]].color, hsl = {}; c.getHSL(hsl);
  return [c, new THREE.Color().setHSL((hsl.h + 0.12) % 1, Math.min(1, hsl.s * 0.9), Math.min(0.85, hsl.l + 0.12))];
}
function layoutOverlap(c) {
  // Petal layout around the centre genre. Every neighbour must overlap the centre, so with many neighbours they would
  // pile on top of each other. Instead the centre circle is enlarged just enough that all neighbours fit evenly round
  // its rim (in the same order as their directions on the map). Each still overlaps the centre by the shared-artist
  // depth measured against the smaller circle, so overlaps stay true; sizes here are only roughly the map's.
  const nb = nodes[c][6], rc0 = radiusOf(c), list = [];
  for (let k = 0; k < nb.length; k += 2) if (nb[k + 1] > 0) list.push({ j: nb[k], sh: nb[k + 1] });
  const strong = list.filter((x) => x.sh >= 3).sort((p, q) => q.sh - p.sh).slice(0, 14);
  const weak = list.filter((x) => x.sh < 3).sort((p, q) => q.sh - p.sh).slice(0, 8);
  const items = [...strong.map((x) => ({ ...x, kind: 1 })), ...weak.map((x) => ({ ...x, kind: 2 }))];
  for (const it of items) {
    it.r = Math.min(radiusOf(it.j), rc0 * 1.6);
    it.mapA = Math.atan2(homePos[it.j * 2 + 1] - homePos[c * 2 + 1], homePos[it.j * 2] - homePos[c * 2]);
  }
  const distFor = (it, rc) => (it.kind === 1 ? rc + it.r - overlapDepth(c, it.j, it.sh, rc, it.r) : rc + it.r + rc * 0.05);
  const widthFor = (it, rc) => 2 * Math.asin(Math.min(1, (it.r * 1.1) / distFor(it, rc)));   // angle each one needs
  // smallest centre size (at least the real one) at which all neighbours fit round it with a little room to spare
  let lo = rc0, hi = rc0 * 12;
  const fits = (rc) => items.reduce((sum, it) => sum + widthFor(it, rc), 0) <= Math.PI * 2 * 0.94;
  if (!fits(lo)) { for (let n = 0; n < 40; n++) { const mid = (lo + hi) / 2; if (fits(mid)) hi = mid; else lo = mid; } lo = hi; }
  const rc = lo;
  // spread them evenly round the rim, keeping their map order and starting from the first one's map direction
  items.sort((p, q) => p.mapA - q.mapA);
  const widths = items.map((it) => widthFor(it, rc)), spare = (Math.PI * 2 - widths.reduce((a, b) => a + b, 0)) / Math.max(1, items.length);
  let at = items.length ? items[0].mapA - widths[0] / 2 : 0;
  items.forEach((it, n) => { it.d = distFor(it, rc); it.a = at + widths[n] / 2; at += widths[n] + spare; });
  const P = (it) => [Math.cos(it.a) * it.d, Math.sin(it.a) * it.d];
  for (let n = 0; n < 300; n++) {                  // small final nudge: neighbours touch only where they share 10+
    for (let p = 0; p < items.length; p++) for (let q = p + 1; q < items.length; q++) {
      const A = items[p], B = items[q], sh = A.kind === 1 && B.kind === 1 ? sharedOf(A.j, B.j) : 0;
      const want = A.r + B.r - (sh >= 10 ? overlapDepth(A.j, B.j, sh, A.r, B.r) * 0.9 : -rc0 * 0.04);
      const [ax, ay] = P(A), [bx, by] = P(B), dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy);
      if (d >= want) continue;
      const push = (want - d) * 0.2, side = Math.cos(A.a) * dy - Math.sin(A.a) * dx >= 0 ? 1 : -1;
      A.a -= (side * push) / A.d; B.a += (side * push) / B.d;
    }
  }
  const out = [{ j: c, x: 0, y: 0, r: rc, kind: 0, sh: 0 }, ...items.map((it) => { const [x, y] = P(it); return { j: it.j, x, y, r: it.r, kind: it.kind, sh: it.sh }; })];
  let ext = 0; for (const o of out) ext = Math.max(ext, Math.hypot(o.x, o.y) + o.r);
  return { items: out, ext, nStrong: strong.length, nWeak: weak.length, grown: rc / rc0 };
}

function ovFrame() {
  // screen frame for the view: leave room for the card on the right (desktop) and the header on top
  const phone = innerWidth <= 720;
  const cardW = !card.hidden && !phone ? 340 + 32 : 0, top = phone ? 190 : 150;
  const bottom = phone ? (card.hidden ? 70 : Math.min(card.offsetHeight, H * 0.6) + 16) : 70;   // phone: above the sheet
  const aw = W - cardW - 48, ah = H - top - bottom;
  ov.scale = (Math.min(aw, ah) * 0.5) / (ov.L.ext || 1);
  ov.ox = -cardW / 2; ov.oy = (bottom - top) / 2;
}
function ovShow(c, keepAngles = true) {
  ov.c = c; ov.L = layoutOverlap(c); ov.time = 0;
  ovResetView(keepAngles);
  const L = ov.L.items;
  L.forEach((o, n) => {
    const [c1, c2] = ringColours(o.j);
    ovA.iColor.setXYZ(n, c1.r, c1.g, c1.b); ovA.iColor2.setXYZ(n, c2.r, c2.g, c2.b);
    ovA.iPhase.setX(n, (o.j * 0.618) % 1);
  });
  for (const k of ["iColor", "iColor2", "iPhase"]) ovA[k].needsUpdate = true;
  ov.pair = null; ovSel();
  ovMesh.count = L.length;
  $("ov-title").textContent = nodes[c][0];
  $("ov-back").disabled = !ov.trail.length;
  select(c, "none");
}
function openOverlap(c) {
  if (c < 0) return;
  showTip("overlap", 2600);                            // once the circles have faded in
  ov.open = true; ov.trail = []; ov.content = 0; ov.contentTarget = 1;
  ovShow(c, false);
  $("ov-head").hidden = false; requestAnimationFrame(() => $("ov-head").classList.add("on"));
  document.body.classList.add("overlap-open");
  tip.hidden = true;
}
function closeOverlap(returnToGenre = true) {
  if (!ov.open) return;
  ovHoverJ = -1; if (player.byHover) stopClip();
  ov.open = false; ov.pair = null;
  $("ov-head").classList.remove("on");
  setTimeout(() => { if (!ov.open) $("ov-head").hidden = true; }, 400);
  document.body.classList.remove("overlap-open");
  if (returnToGenre && ov.c >= 0) select(ov.c, "deep");   // back on the map, centred on wherever the walk ended
}
function walkTo(j, back = false) {
  if (j === ov.c || ov.pending >= 0) return;
  if (!back) ov.trail.push(ov.c);
  ov.pending = j; ov.contentTarget = 0;              // fade out, then rebuild around j and fade in
}
function ovPick(x, y) {
  if (!ov.L || ov.content < 0.5) return -1;
  const w = ovWorldAt(x, y);
  if (!w) return -1;
  const mx = w.x, my = w.y;
  let best = -1, bd = Infinity;
  ov.L.items.forEach((o, n) => {
    const cx = ov.ox + o.x * ov.scale, cy = ov.oy + o.y * ov.scale, r = o.r * ov.scale, d = Math.hypot(mx - cx, my - cy);
    if (d < r && d / r < bd) { bd = d / r; best = n; }
  });
  return best;
}
// ---- who is in both: click where two circles overlap to list the artists both genre pages share
// (site/data/shared/<s>.json, built by scripts/build_shared.py, loaded per 64 genres the first time it is needed)
const sharedShards = new Map();
function loadShared(a, b) {
  const lo = Math.min(a, b), hi = Math.max(a, b), s = Math.floor(lo / 64);
  if (!sharedShards.has(s)) sharedShards.set(s, fetch(dataUrl(`shared/${s}.json`)).then((r) => (r.ok ? r.json() : null)).catch(() => null));
  return sharedShards.get(s).then((d) => (d ? (d.p[`${lo}_${hi}`] || []).map((k) => d.a[k]) : null));
}
function ovLens(x, y) {
  // the overlap under the pointer: the two circles it is inside of (closest to their centres first) that share artists
  if (!ov.L || ov.content < 0.5) return null;
  const w = ovWorldAt(x, y);
  if (!w) return null;
  const inside = [];
  ov.L.items.forEach((o, n) => {
    const r = o.r * ov.scale, d = Math.hypot(w.x - (ov.ox + o.x * ov.scale), w.y - (ov.oy + o.y * ov.scale));
    if (d < r) inside.push({ o, f: d / r });
  });
  inside.sort((p, q) => p.f - q.f);
  for (let p = 0; p < inside.length; p++) for (let q = p + 1; q < inside.length; q++) {
    let A = inside[p].o, B = inside[q].o;
    if (B.j === ov.c) [A, B] = [B, A];                 // the centre genre always comes first
    const sh = sharedOf(A.j, B.j);
    if (sh > 0) return { a: A.j, b: B.j, sh };
  }
  return null;
}
function ovSel() {
  // a chosen overlap lights its two circles and dims the rest; otherwise the centre is the selected one
  const P = ov.pair;
  ov.L?.items.forEach((o, n) => ovA.iSel.setX(n, P ? (o.j === P.a || o.j === P.b ? 1 : -1) : o.kind === 0 ? 1 : 0));
  ovA.iSel.needsUpdate = true;
}
function openPair(lens) {
  if (ov.pair && ov.pair.a === lens.a && ov.pair.b === lens.b) return;
  const P = (ov.pair = { ...lens, list: null });
  showTip("share", 2500);
  ovSel(); renderCard(); writeHash();
  loadShared(P.a, P.b).then((list) => { if (ov.pair !== P) return; P.list = list || []; renderCard(); });
}
function closePair() { if (!ov.pair) return; ov.pair = null; ovSel(); renderCard(); writeHash(); }

function ovUpdate(dt) {
  const target = ov.open ? 1 : 0;
  ov.t += (target - ov.t) * (1 - Math.exp(-dt * (reduceMotion ? 30 : 4.5)));
  if (!ov.open && ov.t < 0.003) ov.t = 0;
  ovPass.enabled = ov.t > 0;
  if (!ovPass.enabled) return;
  ov.content += (ov.contentTarget - ov.content) * (1 - Math.exp(-dt * (ov.contentTarget ? 6 : 14)));
  if (ov.pending >= 0 && ov.content < 0.03) {
    const j = ov.pending; ov.pending = -1; ov.content = 0; ov.contentTarget = 1;
    ovShow(j);
  }
  ov.time += dt;
  ovVeil.material.uniforms.uA.value = 0.93 * ov.t;
  ovCamUpdate(dt);
  if (!ov.L) return;
  ovFrame();
  const L = ov.L.items;
  L.forEach((o, n) => {
    // staggered reveal: centre first, then neighbours from most to least shared; faint ones stay faint
    const delay = n === 0 ? 0 : 0.18 + n * 0.08, a = Math.min(1, Math.max(0, (ov.time - delay) / 0.55));
    ovA.iAlpha.setX(n, (reduceMotion ? 1 : a * a * (3 - 2 * a)) * (o.kind === 2 ? 0.32 : 1));
    tmpM.makeScale(o.r * ov.scale, o.r * ov.scale, 1).setPosition(ov.ox + o.x * ov.scale, ov.oy + o.y * ov.scale, 0);
    ovMesh.setMatrixAt(n, tmpM);
  });
  ovA.iAlpha.needsUpdate = true; ovMesh.instanceMatrix.needsUpdate = true;
  ovMat.uniforms.uAlpha.value = ov.t * ov.content;
  ovMat.uniforms.uPx.value = ovWpp();
  const mw = mouse.x >= 0 ? ovWorldAt(mouse.x, mouse.y) : null;
  ovMat.uniforms.uMouse.value.set(mw ? mw.x : 1e9, mw ? mw.y : 1e9);
}
function ovLabels() {
  if (!ov.L || ov.t < 0.02) return;
  const L = ov.L.items, k = ov.t * ov.content;
  const wx = (o) => ov.ox + o.x * ov.scale, wy = (o) => ov.oy + o.y * ov.scale, ppw = 1 / ovWpp();
  const at = (o) => ovToScr(wx(o), wy(o));
  // phones: circles too small for a name inside get it just outside, pointing away from the centre; busiest first,
  // and a name that would overlap one already placed is skipped (pinch in to see the rest)
  const phone = innerWidth <= 720, outside = [], boxes = [];
  const [cx0, cy0] = at(L[0]);
  L.forEach((o, n) => {
    const a = ovA.iAlpha.getX(n), rpx = o.r * ov.scale * ppw;
    if (phone && o.kind === 1 && rpx < 30) { outside.push({ o, n, a, rpx }); return; }
    if (rpx < 18) return;
    const [x, y] = at(o), fs = Math.max(11, Math.min(o.kind === 0 ? 34 : 24, rpx * (o.kind === 0 ? 0.2 : 0.17)));
    if (phone) boxes.push([x, y, Math.min(nodes[o.j][0].length * fs * 0.6, fs * 9), fs * (o.kind ? 2.4 : 1.3)]);   // keep outside names clear
    const out = ov.pair && o.j !== ov.pair.a && o.j !== ov.pair.b ? 0.3 : 1;
    lbl(o.kind === 0 ? "venn ovc" : "venn", `${esc(nodes[o.j][0])}${rpx > 40 && o.kind ? `<small>${o.sh} shared</small>` : ""}`, x, y, k * out * Math.min(1, a * 1.6), "", fs);
  });
  outside.sort((p, q) => q.o.sh - p.o.sh).forEach(({ o, a, rpx }) => {
    const [x, y] = at(o), name = nodes[o.j][0], w = name.length * 6.3 + 8, h = 15;
    let dx = x - cx0, dy = y - cy0; const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
    const lx = x + dx * (rpx + 6 + w / 2 * Math.abs(dx)), ly = y + dy * (rpx + 6 + h / 2 * Math.abs(dy));
    if (boxes.some((b) => Math.abs(b[0] - lx) < (b[2] + w) / 2 && Math.abs(b[1] - ly) < (b[3] + h) / 2)) return;
    boxes.push([lx, ly, w, h]);
    lbl("ovs", esc(name), lx, ly, k * Math.min(1, a * 1.6), "", 0);
  });
  // shared counts between neighbours (10+), placed inside their overlap
  for (let p = 0; p < L.length; p++) for (let q = p + 1; q < L.length; q++) {
    const A = L[p], B = L[q];
    if (A.kind === 2 || B.kind === 2) continue;
    if (p === 0) continue;                             // centre counts already sit under each neighbour's name
    const sh = sharedOf(A.j, B.j);
    if (sh < 10) continue;                             // only strong neighbour-to-neighbour overlaps, to keep it legible
    const ra = A.r * ov.scale, rb = B.r * ov.scale, dx = (B.x - A.x) * ov.scale, dy = (B.y - A.y) * ov.scale, d = Math.hypot(dx, dy);
    if (d >= ra + rb || (ra + rb - d) * ppw < 26) continue;
    const t = (d + ra - rb) / 2 / d, [lx, ly] = ovToScr(wx(A) + dx * t, wy(A) + dy * t);
    lbl("lens", `${sh} shared`, lx, ly, k * Math.min(ovA.iAlpha.getX(p), ovA.iAlpha.getX(q)) * 0.95);
  }
}

// ---------------------------------------------------------------- audio: ENAO's 30 s Spotify preview clips
// The same clips Every Noise at Once plays (2023 snapshot links on Spotify's CDN; they may stop working). One clip at
// a time, faded in and out. Card ▶ buttons play the genre or an example artist; in the overlap view hovering a circle
// plays it; on the map, hover-to-play is a setting (off by default). Browsers only allow sound after one click.
const audioEl = new Audio();
audioEl.preload = "none";
let PREFIX = "https://p.scdn.co/mp3-preview/", artistClips = null;
const player = { id: null, byHover: false, muted: false, hoverTimer: 0, stopTimer: 0, fade: 0 };
try { player.muted = localStorage.getItem("ga-muted") === "1"; } catch {}
// clip volume: half by default so a clip starting on a click doesn't blast; Settings → Sound has a slider (remembered)
player.vol = 0.5;
try { const v = parseFloat(localStorage.getItem("ga-vol")); if (v >= 0 && v <= 1) player.vol = v; } catch {}
function fadeTo(target, ms, done) {
  cancelAnimationFrame(player.fade);
  const from = audioEl.volume, t0 = performance.now();
  const step = (now) => {
    const k = ms <= 0 ? 1 : Math.max(0, Math.min(1, (now - t0) / ms));   // a frame's timestamp can precede t0
    audioEl.volume = Math.max(0, Math.min(1, from + (target - from) * k));
    if (k < 1) player.fade = requestAnimationFrame(step); else done?.();
  };
  player.fade = requestAnimationFrame(step);
}
// Now-playing shows the song in bold and "artist · where" under it. Track names come from ENAO's tooltips
// ('e.g. Artist "Track"'), kept by scripts/parse_enao.py for every clip.
function genreSong(i) {
  const m = /^(.*?)\s*"(.*)"\s*$/.exec(nodes[i][9] || "");
  return { ...(m ? { artist: m[1], track: m[2] } : { artist: nodes[i][9] || nodes[i][0], track: null }), tid: nodes[i][11] || null };
}
// opts.tid = the Spotify track id of the clip: the now-playing bar links to that song on Spotify (Spotify asks that
// preview clips link back to the content; it is also the way to hear the whole song)
function playSong(id, track, artist, where, opts = {}) {
  const sub = [track ? artist : null, where].filter(Boolean).join(" · ");
  player.nextTid = opts.tid || null;
  player.seq = opts.seq || null;                       // {i, k}: a genre's own clip (k = -1) or its k-th example artist
  playClip(id, track || artist, sub, opts.byHover, opts.journey);
}
function playClip(id, title, sub, byHover = false, fromJourney = false) {
  if (jour.playing && !fromJourney) {
    if (byHover) return;                               // hovering never interrupts a journey
    pauseJourney();                                    // playing something yourself pauses it (Resume picks it up)
  }
  clearTimeout(player.stopTimer);
  if (player.muted) { if (!byHover && !tour.on) nowToast("Sound is muted"); return; }
  if (!id) { if (!byHover) nowToast("No clip for this one"); return; }
  if (player.id === id && !audioEl.paused) { player.byHover = player.byHover && byHover; return; }
  player.id = id; player.byHover = byHover;
  showNow(title, sub);
  const start = () => {
    if (player.id !== id) return;
    audioEl.src = PREFIX + id;
    audioEl.volume = 0;
    audioEl.play().then(() => fadeTo(player.vol, reduceMotion ? 0 : 700)).catch((err) => {
      if (player.id !== id) return;
      player.id = null; syncPlaying();
      nowToast(err && err.name === "NotAllowedError" ? "Click anywhere once to allow sound" : "Clip unavailable");
    });
    syncPlaying();
  };
  if (!audioEl.paused && audioEl.volume > 0.02) fadeTo(0, 160, start); else start();
}
function stopClip(ms = 450) {
  clearTimeout(player.hoverTimer);
  player.id = null; player.byHover = false; player.seq = null;
  if (!audioEl.paused) fadeTo(0, reduceMotion ? 0 : ms, () => { if (!player.id) audioEl.pause(); });
  showNow(null); syncPlaying();
}
// A genre's clip that plays to the end, with its card still open, carries on with the card's example artists in order
// (one song each), then stops. Hover, journeys, drift and the tour never continue this way.
audioEl.addEventListener("ended", () => {
  const s = player.seq, hover = player.byHover;
  player.id = null; player.seq = null;
  if (s && !hover && !jour.playing && !tour.on && s.i === selected && !card.hidden && playNextExample(s)) return;
  showNow(null); syncPlaying();
});
function playNextExample({ i, k }) {
  const ex = examplesOf(i), clips = artistClips?.[i];
  for (let n = k + 1; n < ex.length; n++) {
    const c = clips?.[n];
    if (!c?.[0] || c[0] === nodes[i][8]) continue;     // no clip, or the same song as the genre's own clip
    playSong(c[0], c[1], ex[n], nodes[i][0], { tid: c[2], seq: { i, k: n } });
    return true;
  }
  return false;
}
audioEl.addEventListener("error", () => {
  if (!player.id) return;
  player.id = null; syncPlaying(); nowToast("Clip unavailable");
});
// opening a genre yourself (map, search, a card's list) plays its example clip at once; quietly skipped when muted
// or when it has no clip. Shared links and the tour do not use this (no click to allow sound / the tour plays its own).
function openPlay(i) {
  if (i < 0 || player.muted || !nodes[i][8]) return;
  const g = genreSong(i);
  playSong(nodes[i][8], g.track, g.artist, nodes[i][0], { tid: g.tid, seq: { i, k: -1 } });
}
function hoverPlay(i) {
  if (tour.on) return;
  // short dwell so sweeping the pointer across circles does not fire a burst of clips
  clearTimeout(player.hoverTimer); clearTimeout(player.stopTimer);
  if (i < 0) {
    if (player.byHover) player.stopTimer = setTimeout(() => { if (player.byHover) stopClip(600); }, 450);
    return;
  }
  player.hoverTimer = setTimeout(() => { const g = genreSong(i); playSong(nodes[i][8], g.track, g.artist, nodes[i][0], { byHover: true, tid: g.tid }); }, 230);
}
let nowTimer = 0;
function showNow(title, sub) {
  const el = $("now");
  clearTimeout(nowTimer);
  if (!title) { el.classList.remove("on"); return; }
  $("now-title").textContent = title;
  $("now-sub").textContent = sub || "";
  const link = $("now-spotify"), tid = player.nextTid;
  link.hidden = !tid;
  if (tid) link.href = `https://open.spotify.com/track/${tid}`;
  el.classList.remove("msg"); el.classList.add("on");
  $("hint").classList.add("gone");
}
function nowToast(text) {
  const el = $("now");
  $("now-title").textContent = text; $("now-sub").textContent = "";
  el.classList.add("on", "msg");
  clearTimeout(nowTimer);
  nowTimer = setTimeout(() => { if (!player.id) el.classList.remove("on"); el.classList.remove("msg"); }, 2600);
}
function syncPlaying() {
  document.querySelectorAll("[data-clip]").forEach((b) => b.classList.toggle("playing", !!player.id && b.dataset.clip === player.id));
  $("mute-btn").classList.toggle("muted", player.muted);
  $("mute-btn").setAttribute("aria-pressed", String(player.muted));
}
function toggleMute() {
  player.muted = !player.muted;
  try { localStorage.setItem("ga-muted", player.muted ? "1" : "0"); } catch {}
  if (player.muted) stopClip(200);
  syncPlaying();
}
// clips.json (example artists' clips, 1.9 MB gzipped) loads the first time a genre card needs it, not on every visit
let clipsReq = null;
function loadClips() { return (clipsReq ??= fetchClips()); }
async function fetchClips() {
  try {
    const d = await (await fetch(dataUrl("clips.json"))).json();
    artistClips = d.artists; PREFIX = d.preview_prefix || PREFIX;
    if (selected >= 0) renderCard();
  } catch (err) { console.warn("artist clips not loaded", err); }
}


// ---------------------------------------------------------------- search (genres and artists)
// Own dropdown (the browser's datalist behaved differently per browser and did not always fire). Matching ignores
// case, accents, spaces and punctuation ("kpop" finds k-pop, "rnb" finds r&b), ranks exact > starts with > a word
// starts with > contains, then by popularity. Artists come from site/data/artists/<letter>.json (built by
// scripts/build_artists.py), fetched only for the letter you type (see matchArtists for artist ranking).
// ↑/↓ move, Enter picks, Esc closes. Picking always lands on the map.
const fold = (t) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/&/g, "n");
const compact = (t) => fold(t).replace(/[^a-z0-9]/g, "");
const noThe = (t) => t.replace(/^the\s+/, "");
let searchIdx = [], sItems = [], sActive = -1, sText = "";
const artistShards = new Map();                       // key -> Promise<rows> (rows = [[name, [genre...], score, home key?, home row?], ...])
function shardKeyOf(text) {
  const c = compact(noThe(fold(text.trim())));
  return !c ? null : /[a-z]/.test(c[0]) ? c[0] : /[0-9]/.test(c[0]) ? "0" : "_";
}
function loadShard(k) {
  if (!artistShards.has(k)) {
    artistShards.set(k, fetch(dataUrl(`artists/${k}.json`)).then((r) => (r.ok ? r.json() : [])).then((rows) =>
      rows.map((r, n) => {
        const f = noThe(fold(r[0])), w = f.split(/[^a-z0-9]+/).filter(Boolean);
        // tails[j] = the name from word j on, squashed ("wolfgangamadeusmozart", "amadeusmozart", "mozart")
        const tails = w.map((_, j) => w.slice(j).join(""));
        return { k: r[3] ?? k, n: r[4] ?? n, name: r[0], g: r[1], s: r[2] ?? 0, f, c: compact(f), w, tails };
      })).catch(() => []));
  }
  return artistShards.get(k);
}
function buildSearch() {
  searchIdx = nodes.map((n, i) => ({ i, f: fold(n[0]), c: compact(n[0]), words: fold(n[0]).split(/[^a-z0-9]+/).filter(Boolean) }));
  const q = $("q"), list = $("q-list");
  q.addEventListener("input", () => { tipSeen.add("artists"); renderSearch(q.value); });
  q.addEventListener("focus", () => { q.select(); if (q.value) renderSearch(q.value); });
  q.addEventListener("blur", () => setTimeout(() => { closeSearch(); if (document.activeElement !== q) stopAsking(); }, 150));
  q.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!sItems.length) return;
      e.preventDefault();
      sActive = (sActive + (e.key === "ArrowDown" ? 1 : -1) + sItems.length) % sItems.length;
      paintActive();
    } else if (e.key === "Escape") {
      e.stopPropagation(); closeSearch(); q.blur();
    }
  });
  $("search").addEventListener("submit", (e) => {
    e.preventDefault();
    if (sItems.length) pickSearch(sItems[Math.max(0, sActive)]);
  });
  // pointerdown keeps focus in the box (its blur closes the list); the pick waits for click, which a finger that
  // scrolls the list never sends, so scrolling on a phone does not open whatever it first touched
  list.addEventListener("pointerdown", (e) => { if (e.target.closest("[data-n]")) e.preventDefault(); });
  list.addEventListener("click", (e) => {
    const li = e.target.closest("[data-n]");
    if (li) pickSearch(sItems[+li.dataset.n]);
  });
}
function matchGenres(text, max) {
  const f = fold(text.trim()), c = compact(text);
  if (!c) return [];
  const out = [];
  for (const g of searchIdx) {
    let score = -1;
    if (g.f === f || g.c === c) score = 0;
    else if (g.f.startsWith(f) || g.c.startsWith(c)) score = 1;
    else if (g.words.some((w) => w.startsWith(f) || w.startsWith(c))) score = 2;
    else if (g.f.includes(f) || g.c.includes(c)) score = 3;
    if (score >= 0) out.push([score, nodes[g.i][7], g.i]);
  }
  out.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return out.slice(0, max).map((x) => ({ t: "g", i: x[2] }));
}
function matchArtists(rows, text, max) {
  // a whole word or the end of the name matches ("mozart", "amadeus mozart") > any word starts with it ("moz");
  // within a tier, most popular first (score: see scripts/build_artists.py), so the one-genre artist literally named
  // "Bach" does not beat Johann Sebastian Bach. Later words come from alias rows built by that script.
  const f = noThe(fold(text.trim())), c = compact(f);
  if (c.length < 2) return [];
  const hits = new Map();
  for (const a of rows) {
    let t = -1;
    if (a.c === c || a.w.includes(c) || a.tails.includes(c)) t = 0;
    else if (a.tails.some((x) => x.startsWith(c))) t = 1;
    if (t < 0) continue;
    const id = a.k + a.n, had = hits.get(id);
    if (!had || t < had.t) hits.set(id, { t, a });
  }
  // the order stays by popularity, but artists named exactly what was typed always make the list (when it showed 6,
  // "lisa" had 156 matches and BLACKPINK's LISA ranked 7th). They take the last places and keep their popularity position.
  const list = [...hits.values()].sort((x, y) => x.t - y.t || y.a.s - x.a.s);
  const exact = list.filter((h) => h.a.c === c).slice(0, max);
  const keep = new Set([...exact, ...list.filter((h) => h.a.c !== c).slice(0, max - exact.length)]);
  return list.filter((h) => keep.has(h)).map(({ a }) => ({ t: "a", a }));
}
function optionHTML(it, n) {
  if (it.t === "g") {
    const i = it.i;
    return `<li role="option" id="q-opt-${n}" data-n="${n}"><span class="dot" style="color:${GROUP_COLORS[G[groupOf[i]].name]}"></span><span class="q-name">${esc(nodes[i][0])}</span><span class="q-meta">${esc(G[groupOf[i]].name)} · #${nodes[i][7].toLocaleString()}</span></li>`;
  }
  const a = it.a, first = a.g.slice(0, 2).map((i) => nodes[i][0]).join(", ");
  return `<li role="option" id="q-opt-${n}" data-n="${n}"><span class="q-artist" aria-hidden="true">♪</span><span class="q-name">${esc(a.name)}</span><span class="q-meta">${a.g.length} genre${a.g.length > 1 ? "s" : ""} · ${esc(first)}${a.g.length > 2 ? "…" : ""}</span></li>`;
}
function renderSearch(text) {
  const list = $("q-list"), q = $("q");
  sText = text;
  if (!text.trim()) { closeSearch(); return; }
  if (jour.picking >= 0) {                            // asking for a journey's destination: genres only
    const genres = matchGenres(text, 9).filter((it) => it.i !== jour.picking).slice(0, 8);
    sItems = genres; sActive = genres.length ? 0 : -1;
    list.innerHTML = genres.length ? `<li class="q-head">Journey to</li>` + genres.map((it, n) => optionHTML(it, n)).join("") : `<li class="q-none">No genre matches “${esc(text.trim())}”</li>`;
    list.hidden = false; q.setAttribute("aria-expanded", "true"); paintActive();
    return;
  }
  const genres = matchGenres(text, 5), key = shardKeyOf(text);
  const paint = (artists, loading) => {
    if (sText !== text) return;                        // the user kept typing
    sItems = [...genres, ...artists]; sActive = sItems.length ? 0 : -1;
    let html = "";
    if (genres.length) html += `<li class="q-head">Genres</li>` + genres.map((it, n) => optionHTML(it, n)).join("");
    if (artists.length) html += `<li class="q-head">Artists</li>` + artists.map((it, n) => optionHTML(it, genres.length + n)).join("");
    else if (loading) html += `<li class="q-none">Looking for artists…</li>`;
    if (!sItems.length && !loading) html = `<li class="q-none">No genre or artist matches “${esc(text.trim())}”</li>`;
    list.innerHTML = html; list.hidden = false; q.setAttribute("aria-expanded", "true");
    paintActive();
  };
  if (!key || compact(text).length < 2) { paint([], false); return; }
  paint([], true);
  loadShard(key).then((rows) => paint(matchArtists(rows, text, 30), false));   // the list scrolls
}
function paintActive() {
  [...$("q-list").querySelectorAll("[data-n]")].forEach((li) => li.classList.toggle("on", +li.dataset.n === sActive));
  $("q-list").querySelector("li.on")?.scrollIntoView({ block: "nearest" });   // arrow keys keep the choice in view
  $("q").setAttribute("aria-activedescendant", sActive >= 0 ? `q-opt-${sActive}` : "");
}
function closeSearch() {
  $("q-list").hidden = true; $("q").setAttribute("aria-expanded", "false"); sActive = -1;
}
function pickSearch(it) {
  if (!it) return;
  closeSearch();
  if (jour.picking >= 0 && it.t === "g") {
    const from = jour.picking;
    stopAsking(); $("q").value = ""; $("q").blur();
    startJourney(from, it.i); hint();
    return;
  }
  $("q").value = it.t === "g" ? nodes[it.i][0] : it.a.name; $("q").blur();
  if (ov.open) closeOverlap(false);                   // a search always takes you back to the map
  if (it.t === "g") { select(it.i); openPlay(it.i); } else openArtist(it.a, true);
  hint();
}

// ---------------------------------------------------------------- artist view
// Picking an artist lights up every genre whose ENAO page lists them (the rest dims), frames them on the map, and the
// card lists those genres (biggest on that page first) with the artist's clip.
let artistSel = null, artistSet = null;              // {name, g: [genre...], k, n}; set of its genres
let artistAuto = null;                               // the artist whose clip should start once it has loaded
function openArtist(a, play = false) {
  artistAuto = play ? a : null;
  if (jour.stops) endJourney(false);
  selected = -1;
  artistSel = a; artistSet = new Set(a.g);
  refreshDim(); renderCard(); writeHash();
  frameGenres(a.g);                                  // frame all the artist's genres
}
async function artistClip(a) {
  const clips = await (artistClipShards.get(a.k) ?? artistClipShards.set(a.k, fetch(dataUrl(`artists/${a.k}.clips.json`)).then((r) => r.json()).catch(() => [])).get(a.k));
  return clips[a.n] || null;
}
const artistClipShards = new Map();
function renderArtistCard() {
  const a = artistSel;
  const items = a.g.map((i) => `<li><button type="button" data-i="${i}"><span class="dot" style="color:${GROUP_COLORS[G[groupOf[i]].name]}"></span>${esc(nodes[i][0])}<span class="n">${esc(G[groupOf[i]].name)} · #${nodes[i][7].toLocaleString()}</span></button></li>`);
  card.innerHTML = `
    <button class="close" type="button" aria-label="Close details">×</button>
    <span class="chip"><span class="q-artist" aria-hidden="true">♪</span>Artist</span>
    <h2>${esc(a.name)}</h2>
    <p class="meta">In ${a.g.length} genre${a.g.length > 1 ? "s" : ""}</p>
    <button type="button" class="clip-main" data-artist-clip><span class="pi" aria-hidden="true"></span><span><b>Play a clip</b></span></button>
    <h3>Genres</h3>
    <ol>${items.join("")}</ol>`;
  card.hidden = false;
  card.querySelector(".close").onclick = () => select(-1, false);
  card.querySelectorAll("ol button").forEach((b) => (b.onclick = () => { select(+b.dataset.i); openPlay(+b.dataset.i); }));
  const btn = card.querySelector("[data-artist-clip]");
  artistClip(a).then((c) => {
    if (artistSel !== a) return;
    const id = c?.[0];
    if (!id) { btn.disabled = true; btn.querySelector("b").textContent = "No clip for this artist"; return; }
    btn.dataset.clip = id;
    if (c[1]) btn.querySelector("b").insertAdjacentHTML("afterend", `<small>${esc(c[1])}</small>`);
    btn.onclick = () => (player.id === id && !audioEl.paused ? stopClip() : playSong(id, c[1], a.name, "", { tid: c[2] }));
    if (artistAuto === a) { artistAuto = null; if (!player.muted) playSong(id, c[1], a.name, "", { tid: c[2] }); }   // picked in search
    syncPlaying();
  });
}


// ---------------------------------------------------------------- journeys: a route between two genres
// From a genre's card, "Journey to…" asks for a second genre and finds a route through ENAO neighbours that moves in
// small steps of sound (map distance, ENAO's rank), prefers hops whose genres share artists (shown and playable), never
// leaps further than a set distance, and arrives through one of the destination's closest genres. See hopCost().
// The route is drawn as a glowing line, its genres light up, and Play walks it stop by stop with a clip at each.
const jour = { mode: "journey", stops: null, hops: null, cur: -1, playing: false, done: false, timer: 0, picking: -1, draw: 0, drawFrom: 0, op: 0 };
let jourAdj = null, jourLine = null, jourMat = null;
const JOUR_STOP_MS = 12000;
// Route cost (2026-11-10, tested on sample routes in docs/DECISIONS.md). Each hop between ENAO neighbours costs
//   1 + (map distance / 10R)^2            sound distance: squared, so one big leap costs more than several small steps
//     + 10 * (ENAO rank - 1) / 19         rank in either genre's "nearby" list (1 = closest sound)
//     + 4.5 * (1 - sqrt(min(oc/0.5, 1)))  shared artists (oc = shared / smaller artist list) make a hop cheaper
//     + 2 if they share no artists
// plus, for the hop into the destination, 12 * (rank of the previous genre in the destination's own list - 1) / 19,
// so the route arrives through one of the destination's closest-sounding genres. A hop may not be longer than
// HOP_CAPS[0] (35 circle radii on the map); if no route fits, the limit relaxes step by step.
const HOP_CAPS = [35, 45, 60, Infinity];   // 25 forced odd detours, 40+ let jarring leaps back in
let jourRank = null;
function hopCost(a, b, sh) {
  const d = Math.hypot(homePos[a * 2] - homePos[b * 2], homePos[a * 2 + 1] - homePos[b * 2 + 1]) / LAYOUT_R;
  const r = Math.min(jourRank[a].get(b) ?? 99, jourRank[b].get(a) ?? 99);
  const oc = sh ? sh / Math.min(nodes[a][3], nodes[b][3]) : 0;
  return { d, c: 1 + (d / 10) ** 2 + (10 * (r - 1)) / 19 + 4.5 * (1 - Math.sqrt(Math.min(oc / 0.5, 1))) + (sh ? 0 : 2) };
}
function findRoute(a, b) {
  if (!jourAdj) {
    jourAdj = Array.from({ length: N }, () => new Map()); jourRank = Array.from({ length: N }, () => new Map());
    for (let i = 0; i < N; i++) {
      const nb = nodes[i][6];
      for (let k = 0; k < nb.length; k += 2) { jourAdj[i].set(nb[k], nb[k + 1]); jourAdj[nb[k]].set(i, nb[k + 1]); jourRank[i].set(nb[k], k / 2 + 1); }
    }
  }
  for (const cap of HOP_CAPS) { const r = routeWithin(a, b, cap); if (r) return r; }
  return null;
}
function routeWithin(a, b, cap) {
  const D = new Float64Array(N).fill(Infinity), P = new Int32Array(N).fill(-1), heap = [[0, a]];
  const push = (e) => { heap.push(e); let n = heap.length - 1; while (n > 0) { const p = (n - 1) >> 1; if (heap[p][0] <= heap[n][0]) break; [heap[p], heap[n]] = [heap[n], heap[p]]; n = p; } };
  const pop = () => { const top = heap[0], end = heap.pop(); if (heap.length) { heap[0] = end; let n = 0; for (;;) { const l = 2 * n + 1, r = l + 1; let m = n; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === n) break; [heap[m], heap[n]] = [heap[n], heap[m]]; n = m; } } return top; };
  D[a] = 0;
  while (heap.length) {
    const [d, x] = pop();
    if (x === b) break;
    if (d > D[x]) continue;
    for (const [y, sh] of jourAdj[x]) {
      const h = hopCost(x, y, sh);
      if (h.d > cap) continue;
      const nd = d + h.c + (y === b ? (12 * ((jourRank[b].get(x) ?? 20) - 1)) / 19 : 0);
      if (nd < D[y]) { D[y] = nd; P[y] = x; push([nd, y]); }
    }
  }
  if (!isFinite(D[b])) return null;
  const out = [b];
  while (out[out.length - 1] !== a) out.push(P[out[out.length - 1]]);
  return out.reverse();
}
function buildJourneyLine(stops) {
  // a smooth curve through the stops; aT runs 0..1 along it so the shader can draw it in and send a glint along
  const SUB = 24, n = stops.length, M = (n - 1) * SUB + 1;
  const P = stops.map((i) => [pos[i * 2], pos[i * 2 + 1], zOff[i]]);
  const posA = new Float32Array(M * 3), zA = new Float32Array(M), tA = new Float32Array(M), cA = new Float32Array(M * 3);
  // Hermite curve; each stop's tangent is capped by its shorter neighbouring hop so short hops next to long ones
  // do not swing out into loops (plain Catmull-Rom did)
  const T = P.map((p, k) => {
    const a = P[Math.max(0, k - 1)], b = P[Math.min(n - 1, k + 1)];
    let tx = (b[0] - a[0]) / 2, ty = (b[1] - a[1]) / 2;
    const near = Math.min(k > 0 ? Math.hypot(p[0] - a[0], p[1] - a[1]) : Infinity, k < n - 1 ? Math.hypot(b[0] - p[0], b[1] - p[1]) : Infinity);
    const len = Math.hypot(tx, ty), cap = 0.6 * near;
    if (len > cap && len > 0) { tx *= cap / len; ty *= cap / len; }
    return [tx, ty];
  });
  let m = 0;
  for (let k = 0; k < n - 1; k++) {
    const p1 = P[k], p2 = P[k + 1], t1 = T[k], t2 = T[k + 1];
    for (let s = 0; s < (k === n - 2 ? SUB + 1 : SUB); s++, m++) {
      const t = s / SUB, t2_ = t * t, t3 = t2_ * t;
      const h00 = 2 * t3 - 3 * t2_ + 1, h10 = t3 - 2 * t2_ + t, h01 = -2 * t3 + 3 * t2_, h11 = t3 - t2_;
      posA[m * 3] = h00 * p1[0] + h10 * t1[0] + h01 * p2[0] + h11 * t2[0];
      posA[m * 3 + 1] = h00 * p1[1] + h10 * t1[1] + h01 * p2[1] + h11 * t2[1];
      zA[m] = p1[2] + (p2[2] - p1[2]) * t; tA[m] = (k + t) / (n - 1);
      for (let c = 0; c < 3; c++) cA[m * 3 + c] = colorOf[stops[k] * 3 + c] * (1 - t) + colorOf[stops[k + 1] * 3 + c] * t;
    }
  }
  if (!jourMat) {
    jourMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
      uniforms: { uFlatV: uFlat, uTime, uDraw: { value: 0 }, uOp: { value: 0 }, uProg: { value: 1 } },
      vertexShader: `attribute float aZ; attribute float aT; attribute vec3 color; uniform float uFlatV; varying vec3 vC; varying float vT;
        void main(){ vC = color; vT = aT; gl_Position = projectionMatrix*modelViewMatrix*vec4(position.xy, aZ*uFlatV, 1.); }`,
      // uProg: how far along the route the journey has got (0..1). The part already travelled is lit as before; the
      // rest stays as a dim outline, and the glint runs along the lit part only. Drift keeps uProg at 1.
      fragmentShader: `varying vec3 vC; varying float vT; uniform float uDraw; uniform float uOp; uniform float uTime; uniform float uProg;
        void main(){
          if (vT > uDraw) discard;
          float lit = 1.0 - smoothstep(uProg - 0.004, uProg + 0.004, vT);
          float glint = exp(-pow((vT - fract(uTime*0.09) * max(uProg, 0.001))*14.0, 2.0)) * lit;
          vec3 outline = mix(vC, vec3(1.0), 0.65) * 0.6, travelled = mix(vC, vec3(1.0), 0.35) * (1.05 + 2.2*glint);
          gl_FragColor = vec4(mix(outline, travelled, lit)*uOp, 1.); }`,
    });
  }
  if (jourLine) { scene.remove(jourLine); jourLine.geometry.dispose(); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(posA, 3));
  geo.setAttribute("aZ", new THREE.BufferAttribute(zA, 1));
  geo.setAttribute("aT", new THREE.BufferAttribute(tA, 1));
  geo.setAttribute("color", new THREE.BufferAttribute(cA, 3));
  jourLine = new THREE.Line(geo, jourMat); jourLine.frustumCulled = false; jourLine.renderOrder = 3;
  scene.add(jourLine);
}
function jourUpdate(dt) {
  if (!jourMat) return;
  const on = !!jour.stops;
  jour.op += ((on ? 1 : 0) - jour.op) * (1 - Math.exp(-dt * 4));
  if (on) jour.draw = Math.min(1, jour.draw + dt / (reduceMotion ? 0.01 : 1.8));
  jourMat.uniforms.uDraw.value = jour.drawFrom + (1 - jour.drawFrom) * jour.draw * jour.draw * (3 - 2 * jour.draw);
  jourMat.uniforms.uOp.value = jour.op;
  // journey progress along the line: nothing lit before Start, up to the current stop while playing, all of it at the end
  const n = jour.stops ? jour.stops.length : 0;
  const prog = jour.mode !== "journey" || !n ? 1 : jour.done ? 1 : jour.cur < 0 ? 0 : jour.cur / Math.max(1, n - 1);
  jour.prog = jour.prog ?? prog;
  jour.prog += (prog - jour.prog) * (1 - Math.exp(-dt * (reduceMotion ? 30 : 2.2)));
  jourMat.uniforms.uProg.value = jour.prog;
  // the genre the journey/drift is on: its own star glows brighter once the lit trail has reached it
  let curStar = -1, glow = 0;
  if (on && jour.cur >= 0) {
    curStar = jour.stops[jour.cur];
    if (jour.mode === "drift") glow = n < 2 ? 1 : Math.min(1, Math.max(0, (jour.draw - 0.7) / 0.3));
    else glow = jour.done ? 1 : Math.min(1, Math.max(0, 1 - (jour.cur - jour.prog * (n - 1)) * 2.5));
  }
  if (curStar !== starMat.uniforms.uCur.value) { starMat.uniforms.uCur.value = curStar; jour.glow = 0; }
  jour.glow = (jour.glow || 0) + (glow * jour.op - (jour.glow || 0)) * (1 - Math.exp(-dt * 6));
  starMat.uniforms.uCurGlow.value = jour.glow;
  if (!on && jour.op < 0.01 && jourLine) { scene.remove(jourLine); jourLine.geometry.dispose(); jourLine = null; }
}
function askJourney(from) {
  // the search box asks for the destination; picking a genre there starts the journey
  jour.picking = from;
  const q = $("q");
  q.value = ""; q.placeholder = `Journey from ${nodes[from][0]} to…`;
  q.classList.add("asking"); if (!tour.on) q.focus();
}
function stopAsking() {
  if (jour.picking < 0) return;
  jour.picking = -1;
  $("q").placeholder = "Search genres or artists"; $("q").classList.remove("asking");
}
function startJourney(a, b) {
  const route = a === b ? null : findRoute(a, b);
  if (!route) { nowToast(`No route from ${nodes[a][0]} to ${nodes[b][0]}`); return; }
  endJourney(false);
  if (ov.open) closeOverlap(false);
  selected = -1; artistSel = null;
  jour.mode = "journey"; jour.stops = route; jour.cur = -1; jour.draw = 0; jour.drawFrom = 0; jour.done = false; jour.playing = false; jour.prog = 0;
  jour.hops = route.slice(1).map((j, k) => ({ sh: sharedOf(route[k], j), list: null }));
  artistSet = new Set(route);
  jour.hops.forEach((h, k) => {
    if (!h.sh) { h.list = []; return; }
    loadShared(route[k], route[k + 1]).then((list) => { if (jour.hops?.[k] !== h) return; h.list = list || []; renderCard(); });
  });
  buildJourneyLine(route);
  refreshDim(); renderCard(); writeHash();
  showTip("share", 2500);
  frameGenres(route);
}
function frameGenres(list) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const i of list) { x0 = Math.min(x0, pos[i * 2]); x1 = Math.max(x1, pos[i * 2]); y0 = Math.min(y0, pos[i * 2 + 1]); y1 = Math.max(y1, pos[i * 2 + 1]); }
  const strip = innerWidth <= 720 && !card.hidden ? Math.max(0.3, 1 - (Math.min(card.offsetHeight, H * 0.6) + 110) / H) : 1;
  const half = Math.max((x1 - x0) / (W / H), (y1 - y0) / strip) / 2 + 60;
  goal.tx = (x0 + x1) / 2; goal.ty = (y0 + y1) / 2;
  goal.dist = Math.max(260, Math.min(homeDist, (half * 1.3) / Math.tan((FOV * Math.PI) / 360)));
  liftGoal();
  vel.x = vel.y = 0; follow = false; flying = !reduceMotion; lastInput = performance.now();
}
function endJourney(redraw = true) {
  clearTimeout(jour.timer);
  if (!jour.stops) return;
  if (jour.playing && player.id) stopClip();
  jour.stops = jour.hops = null; jour.cur = -1; jour.playing = false; jour.done = false; jour.blocked = false; artistSet = null;
  syncDriftBtn();
  if (redraw) { refreshDim(); renderCard(); }
}
function stopView(i) {
  // close enough to read the neighbourhood, far enough to still see the route around it
  const x = pos[i * 2], y = pos[i * 2 + 1], d2 = [];
  for (let j = 0; j < N; j++) d2.push((pos[j * 2] - x) ** 2 + (pos[j * 2 + 1] - y) ** 2);
  d2.sort((p, q) => p - q);
  const r = Math.sqrt(d2[70]) || 120;
  goal.tx = x; goal.ty = y;
  goal.dist = Math.max(MIN_DIST * 2, Math.min(MAX_DIST, (r * 2.4) / (2 * Math.tan((FOV * Math.PI) / 360))));
  liftGoal();
  vel.x = vel.y = 0; flying = !reduceMotion; follow = false;
  if (reduceMotion) { cam.tx = goal.tx; cam.ty = goal.ty; cam.dist = goal.dist; }
  lastInput = performance.now();
}
// Playback: Start walks the route, 12 s per stop, playing each genre's own clip. Pause / Resume, ‹ › step, a click on
// a stop plays from there. Playing anything yourself pauses the journey. The last stop ends on a finish screen.
function goStop(k) {
  if (!jour.stops) return;
  clearTimeout(jour.timer);
  const stops = jour.stops, i = stops[k];
  jour.cur = k; jour.playing = true; jour.done = false; jour.t0 = performance.now(); jour.pausedAt = null;
  stopView(i);
  const g = genreSong(i), drift = jour.mode === "drift";
  // drift lets each preview play to its end: assume the 30 s maximum until the clip reports its real length (see the
  // audio listeners below); muted or no clip: the fixed DRIFT_STOP_MS. Journeys keep their fixed JOUR_STOP_MS.
  jour.clipId = nodes[i][8] || null;
  jour.stopMs = !drift ? JOUR_STOP_MS : jour.clipId && !player.muted ? DRIFT_MAX_MS : DRIFT_STOP_MS;
  if (jour.clipId) playSong(jour.clipId, g.track, g.artist, nodes[i][0], { journey: true, tid: g.tid });
  paintJourneyCard(true);
  scheduleNextStop();
}
function scheduleNextStop() {
  clearTimeout(jour.timer);
  const stops = jour.stops, k = jour.cur, left = Math.max(0, jour.stopMs - (performance.now() - jour.t0));
  jour.timer = setTimeout(() => {
    if (!jour.playing || jour.stops !== stops || jour.cur !== k) return;
    if (jour.mode === "drift") driftStep();
    else if (k + 1 < stops.length) goStop(k + 1); else finishJourney();
  }, left);
}
// drift: fit the stop to the clip's real length, move on when it ends, and skip quickly past a clip that fails
const driftClip = () => jour.mode === "drift" && jour.playing && jour.clipId && audioEl.src.endsWith(jour.clipId);   // by source: another "ended" handler clears player.id first
audioEl.addEventListener("loadedmetadata", () => {
  if (!driftClip() || !isFinite(audioEl.duration)) return;
  jour.stopMs = Math.min(DRIFT_MAX_MS, audioEl.duration * 1000 + 400);
  scheduleNextStop(); paintJourneyCard();
});
audioEl.addEventListener("ended", () => { if (driftClip()) { jour.stopMs = performance.now() - jour.t0; scheduleNextStop(); } }, true);
audioEl.addEventListener("error", () => { if (driftClip()) { jour.stopMs = performance.now() - jour.t0 + 3000; scheduleNextStop(); paintJourneyCard(); } }, true);
function pauseJourney() {
  if (!jour.playing) return;
  jour.playing = false; clearTimeout(jour.timer); jour.pausedAt = performance.now();
  paintJourneyCard();
}
function toggleJourneyPlay() {
  if (jour.playing) { pauseJourney(); stopClip(); return; }
  goStop(jour.cur < 0 ? 0 : jour.cur);
}
function finishJourney() {
  jour.playing = false; jour.done = true; clearTimeout(jour.timer);
  stopClip(1200);
  frameGenres(jour.stops);
  renderCard();
}

// ---------------------------------------------------------------- drift: an endless, lean-back walk
// Starts at the open genre (or the current journey stop), else a random genre among the 1,200 most popular so it
// begins somewhere recognisable. Every DRIFT_STOP_MS it moves to an ENAO neighbour that shares artists with the
// current genre and has not been visited in the last 40 steps, picked at random weighted by √shared (stronger
// overlaps more likely, never fixed). If none qualifies it relaxes to any unvisited neighbour, then to a random genre.
// Each genre plays its own clip; the trail (last 30) glows on the map. Uses the journey player (jour.mode = "drift").
const DRIFT_STOP_MS = 15000, DRIFT_MAX_MS = 30500, DRIFT_TRAIL = 30, DRIFT_RECENT = 40;   // previews are up to 30 s
function randomStart() {
  let pool = byDegree.slice(0, 1200).filter((i) => nodes[i][8] && !hiddenGroups.has(groupOf[i]));
  if (!pool.length) pool = byDegree.filter((i) => nodes[i][8] && !hiddenGroups.has(groupOf[i]));   // small groups only
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : -1;              // -1: every group is faded
}
function startDrift() {
  const from = selected >= 0 ? selected : jour.stops && jour.cur >= 0 ? jour.stops[jour.cur] : randomStart();
  if (from < 0) { nowToast("Every group is faded: bring one back to drift"); return; }
  endJourney(false);
  if (ov.open) closeOverlap(false);
  stopAsking();
  selected = -1; artistSel = null;
  jour.mode = "drift"; jour.stops = [from]; jour.hops = []; jour.cur = -1; jour.done = false; jour.blocked = false; jour.draw = 1; jour.drawFrom = 0;
  jour.seen = [from]; jour.startedAt = performance.now();
  artistSet = new Set(jour.stops);
  if (jourLine) { scene.remove(jourLine); jourLine.geometry.dispose(); jourLine = null; }
  refreshDim(); writeHash(); syncDriftBtn();
  renderCard();
  goStop(0);
}
function driftNext(cur) {
  const recent = new Set(jour.seen.slice(-DRIFT_RECENT)), nb = nodes[cur][6], cands = [];
  for (let k = 0; k < nb.length; k += 2) {
    const j = nb[k];
    if (!recent.has(j) && nodes[j][8] && !hiddenGroups.has(groupOf[j])) cands.push([j, nb[k + 1]]);
  }
  let pool = cands.filter((c) => c[1] > 0);
  if (!pool.length) pool = cands;
  if (!pool.length) return randomStart();               // nothing new nearby: jump (marked on the card)
  let r = Math.random() * pool.reduce((t, c) => t + Math.sqrt(c[1] + 1), 0);
  for (const c of pool) { r -= Math.sqrt(c[1] + 1); if (r <= 0) return c[0]; }
  return pool[pool.length - 1][0];
}
// forced >= 0: the user clicked that genre while drifting - drift steers there and carries on from it
function driftStep(forced = -1) {
  if (jour.mode !== "drift" || !jour.stops) return;
  const stops = jour.stops, prev = stops[stops.length - 1], j = forced >= 0 ? forced : driftNext(prev);
  if (j === prev) return;
  if (j < 0) {                                         // every group faded: wait, keeping the trail; un-fading resumes
    jour.blocked = true; jour.playing = false; clearTimeout(jour.timer);
    renderCard();
    return;
  }
  jour.blocked = false;
  const nb = nodes[prev][6], near = (() => { for (let q = 0; q < nb.length; q += 2) if (nb[q] === j) return true; return false; })();
  const h = { sh: sharedOf(prev, j), list: null, jump: !near && forced < 0, steered: forced >= 0 };
  if (forced >= 0) jour.playing = true;                // steering also resumes a paused drift
  stops.push(j); jour.hops.push(h); jour.seen.push(j);
  while (stops.length > DRIFT_TRAIL) { stops.shift(); jour.hops.shift(); }
  if (h.sh) loadShared(prev, j).then((list) => { h.list = list || []; if (jour.hops?.includes(h)) renderCard(); });
  else h.list = [];
  artistSet = new Set(stops);
  buildJourneyLine(stops);
  jour.drawFrom = (stops.length - 2) / (stops.length - 1); jour.draw = 0;   // only the new hop draws in
  jour.cur = stops.length - 1;
  refreshDim(); renderCard();
  goStop(stops.length - 1);
}
function stopDrift(stay = true) {
  // Stopping a drift that went somewhere shows where it went: the trail stays lit, the view zooms out to all of it and
  // the card sums up the route (asked for on Reddit, 2026-11-19). A drift still on its first genre just opens it.
  // Stopping again (Esc, ×) closes it. The song keeps playing either way.
  const here = jour.stops?.[jour.cur];
  if (jour.done || !stay || here === undefined) { select(-1, false); return; }
  jour.playing = false; clearTimeout(jour.timer);
  if (jour.stops.length < 2) { select(here, "none"); return; }
  jour.done = true; syncDriftBtn();
  renderCard();
  frameGenres(jour.stops);
}
function resumeDrift() { jour.done = false; syncDriftBtn(); jour.playing = true; driftStep(); }
function syncDriftBtn() {
  const b = $("drift-btn"), on = jour.mode === "drift" && !!jour.stops && !jour.done;
  b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on));
}
const ICON_DRIFT = `<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 10.5c2-3.5 3.5-3.5 5 0s3 3.5 5 0 2.5-3.5 3-3"/><circle cx="14.5" cy="7.5" r="1"/></svg>`;
function renderDriftEnd() {
  const stops = jour.stops, a = stops[0], b = stops[stops.length - 1], n = jour.seen.length;
  const mins = Math.round((performance.now() - (jour.startedAt || performance.now())) / 60000);
  const more = n > stops.length ? `<span class="jour-more">…</span><span class="arrow">→</span>` : "";   // the trail keeps the last DRIFT_TRAIL
  card.innerHTML = `
    <button class="close" type="button" aria-label="Close">×</button>
    <span class="chip">${ICON_DRIFT}Drift ended</span>
    <h2 class="pair">${esc(nodes[a][0])}<span class="amp">to</span>${esc(nodes[b][0])}</h2>
    <p class="meta">${n} genre${n > 1 ? "s" : ""}${mins >= 1 ? ` in ${mins} min` : ""}${more ? `, the last ${stops.length} shown` : ""}</p>
    <div class="jour-end">
      <p class="jour-arrived">You drifted to <b>${esc(nodes[b][0])}</b></p>
      <p class="jour-trail">${more}${stops.map((i) => `<button type="button" class="jour-stop" data-i="${i}">${esc(nodes[i][0])}</button>`).join(`<span class="arrow">→</span>`)}</p>
    </div>
    <button type="button" class="see-overlaps" data-act="resume">${ICON_DRIFT}<span>Keep drifting</span></button>
    <button type="button" class="see-overlaps journey-btn" data-act="open">${ICON_GO}<span>Open ${esc(nodes[b][0])}</span></button>`;
  card.hidden = false;
  card.querySelector(".close").onclick = () => select(-1, false);
  card.querySelector('[data-act="resume"]').onclick = resumeDrift;
  card.querySelector('[data-act="open"]').onclick = () => select(b, "none");
  card.querySelectorAll(".jour-stop").forEach((btn) => (btn.onclick = () => select(+btn.dataset.i, "none")));
}
function renderDriftCard() {
  if (jour.done) { renderDriftEnd(); return; }
  const { stops, hops } = jour, k = jour.cur < 0 ? stops.length - 1 : jour.cur, i = stops[k];
  const color = GROUP_COLORS[G[groupOf[i]].name];
  let from = "";
  if (k > 0) {
    const p = stops[k - 1], h = hops[k - 1];
    const names = h.list ? h.list.slice(0, 3).map(([name, id, track, tid]) => (id
      ? `<button type="button" class="clip-artist" data-clip="${id}" data-name="${esc(name)}" data-track="${esc(track || "")}" data-tid="${tid || ""}" title="${esc(track || "")}"><span class="pi" aria-hidden="true"></span>${esc(name)}</button>`
      : `<span>${esc(name)}</span>`)).join("") : "";
    from = h.steered && !h.sh ? `<div class="drift-from"><span class="via-cap">You steered here from <b>${esc(nodes[p][0])}</b></span></div>`
      : h.jump ? `<div class="drift-from"><span class="via-cap">Jumped from <b>${esc(nodes[p][0])}</b></span></div>`
      : `<div class="drift-from"><span class="via-cap">From <b>${esc(nodes[p][0])}</b>${h.sh ? `, ${h.sh} shared artist${h.sh > 1 ? "s" : ""}${h.sh > 3 && h.list ? `, including` : ""}` : `, close in sound, no shared artists`}</span>${names ? `<span class="via">${names}</span>` : ""}</div>`;
  }
  if (jour.blocked) from = `<div class="drift-from drift-blocked"><span class="via-cap">Every group is faded. Bring one back to keep drifting.</span></div>` + from;
  const trail = stops.slice(0, k).reverse().map((t) => `<li><button type="button" data-i="${t}"><span class="dot" style="color:${GROUP_COLORS[G[groupOf[t]].name]}"></span>${esc(nodes[t][0])}</button></li>`).join("");
  card.innerHTML = `
    <button class="close" type="button" aria-label="Stop drifting">×</button>
    <span class="chip">${ICON_DRIFT}Drifting</span>
    <h2>${esc(nodes[i][0])}</h2>
    <p class="meta"><span class="dot" style="color:${color}"></span> ${esc(G[groupOf[i]].name)} · ${jour.seen.length} genre${jour.seen.length > 1 ? "s" : ""} so far</p>
    ${nodes[i][4] ? `<a class="play" href="${esc(nodes[i][4])}" target="_blank" rel="noopener">${ICON_OUT}<span>The Sound of ${esc(titleCase(nodes[i][0]))} on Spotify</span></a>` : ""}
    <div class="jour-ctrl">
      <div class="jour-btns">
        <button type="button" class="jour-main" id="jour-play"></button>
        <button type="button" class="jour-step" id="jour-next" aria-label="Skip to the next genre" title="Skip">›</button>
      </div>
      <p class="jour-status" id="jour-status"></p>
      <div class="jour-bar" aria-hidden="true"><i id="jour-bar"></i></div>
    </div>
    ${from}
    ${trail ? `<h3>Trail</h3><ol class="drift-trail">${trail}</ol>` : ""}`;
  card.hidden = false;
  card.querySelector(".close").onclick = () => stopDrift(true);    // ends the drift on the genre it reached
  $("jour-play").onclick = toggleJourneyPlay;
  $("jour-next").onclick = () => driftStep();
  card.querySelectorAll(".drift-trail button").forEach((b) => (b.onclick = () => driftStep(+b.dataset.i)));   // steer back there
  card.querySelectorAll(".drift-from [data-clip]").forEach((btn) => (btn.onclick = () => {
    if (player.id === btn.dataset.clip && !audioEl.paused) { stopClip(); return; }
    playSong(btn.dataset.clip, btn.dataset.track, btn.dataset.name, `${nodes[stops[k - 1]][0]} & ${nodes[i][0]}`, { tid: btn.dataset.tid });
  }));
  paintJourneyCard();
}
const ICON_ROUTE = `<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><circle cx="3.5" cy="12.5" r="1.6"/><circle cx="12.5" cy="3.5" r="1.6"/><path d="M5 12.5h4.5a2.5 2.5 0 0 0 0-5h-3a2.5 2.5 0 0 1 0-5H11"/></svg>`;
const ICON_SWAP = `<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 5.5h9.5M10 3l2.5 2.5L10 8M13 10.5H3.5M6 8l-2.5 2.5L6 13"/></svg>`;
const ICON_PLAY = `<svg class="ic fill" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3.2v9.6L12.6 8z"/></svg>`;
const ICON_PAUSE = `<svg class="ic fill" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 3h2.4v10H4.5zM9.1 3h2.4v10H9.1z"/></svg>`;
function renderJourneyCard() {
  if (jour.mode === "drift") { renderDriftCard(); return; }
  const { stops, hops } = jour, a = stops[0], b = stops[stops.length - 1], steps = stops.length - 1;
  const head = `
    <button class="close" type="button" aria-label="End journey">×</button>
    <span class="chip">${ICON_ROUTE}${jour.done ? "Journey complete" : "Journey"}</span>
    <h2 class="pair">${esc(nodes[a][0])}<span class="amp">to</span>${esc(nodes[b][0])}</h2>
    <p class="meta">${stops.length} genres, ${steps} step${steps > 1 ? "s" : ""}</p>`;
  if (jour.done) {
    card.innerHTML = head + `
      <div class="jour-end">
        <p class="jour-arrived">You made it to <b>${esc(nodes[b][0])}</b></p>
        <p class="jour-trail">${stops.map((i) => esc(nodes[i][0])).join(`<span class="arrow">→</span>`)}</p>
      </div>
      <button type="button" class="see-overlaps" data-act="again">${ICON_PLAY}<span>Play it again</span></button>
      <button type="button" class="see-overlaps" data-act="reverse">${ICON_SWAP}<span>Back the other way</span></button>
      <button type="button" class="see-overlaps journey-btn" data-act="onward">${ICON_ROUTE}<span>New journey from ${esc(nodes[b][0])}</span></button>
      <button type="button" class="jour-link" data-act="route">See the route</button>`;
  } else {
    const rows = stops.map((i, k) => {
      let html = `<li class="stop" data-k="${k}"><button type="button" data-stop="${k}" title="Play from here"><span class="dot" style="color:${GROUP_COLORS[G[groupOf[i]].name]}"></span>${esc(nodes[i][0])}</button></li>`;
      if (k < steps) {
        const h = hops[k];
        let via;
        if (!h.sh) via = `<span class="via-cap">No artists also in ${esc(nodes[stops[k + 1]][0])}, close in sound</span>`;
        else {
          const names = !h.list ? "" : h.list.slice(0, 3).map(([name, id, track, tid]) => (id
            ? `<button type="button" class="clip-artist" data-clip="${id}" data-name="${esc(name)}" data-track="${esc(track || "")}" data-tid="${tid || ""}" data-hop="${k}" title="${esc(track || "")}"><span class="pi" aria-hidden="true"></span>${esc(name)}</button>`
            : `<span>${esc(name)}</span>`)).join("");
          via = `<span class="via-cap">${h.sh} artist${h.sh > 1 ? "s" : ""} also in ${esc(nodes[stops[k + 1]][0])}${h.sh > 3 && h.list ? `, including` : ""}</span><span class="via">${names}</span>`;
        }
        html += `<li class="hop">${via}</li>`;
      }
      return html;
    }).join("");
    card.innerHTML = head + `
      <div class="jour-ctrl">
        <div class="jour-btns">
          <button type="button" class="jour-step" id="jour-prev" aria-label="Previous stop">‹</button>
          <button type="button" class="jour-main" id="jour-play"></button>
          <button type="button" class="jour-step" id="jour-next" aria-label="Next stop">›</button>
        </div>
        <p class="jour-status" id="jour-status"></p>
        <div class="jour-bar" aria-hidden="true"><i id="jour-bar"></i></div>
      </div>
      <h3>Route</h3>
      <ol class="route">${rows}</ol>`;
  }
  card.hidden = false;
  card.querySelector(".close").onclick = () => select(-1, false);
  if (jour.done) {
    card.querySelectorAll("[data-act]").forEach((btn) => (btn.onclick = () => {
      const act = btn.dataset.act;
      if (act === "again") goStop(0);
      else if (act === "reverse") startJourney(b, a);
      else if (act === "onward") { const from = b; select(from, "none"); askJourney(from); }
      else { jour.done = false; jour.cur = -1; renderCard(); }
    }));
    return;
  }
  $("jour-play").onclick = toggleJourneyPlay;
  $("jour-prev").onclick = () => goStop(Math.max(0, jour.cur - 1));
  $("jour-next").onclick = () => goStop(Math.min(stops.length - 1, jour.cur + 1));
  card.querySelectorAll("[data-stop]").forEach((btn) => (btn.onclick = () => goStop(+btn.dataset.stop)));
  card.querySelectorAll("[data-hop]").forEach((btn) => (btn.onclick = () => {
    if (player.id === btn.dataset.clip && !audioEl.paused) { stopClip(); return; }
    const k = +btn.dataset.hop;
    playSong(btn.dataset.clip, btn.dataset.track, btn.dataset.name, `${nodes[stops[k]][0]} & ${nodes[stops[k + 1]][0]}`, { tid: btn.dataset.tid });
  }));
  paintJourneyCard();
}
function paintJourneyCard(restartBar = false) {
  // update controls, status and the current stop in place (keeps the card's scroll position)
  const btn = $("jour-play");
  if (!btn || !jour.stops || jour.done) return;
  const n = jour.stops.length, k = jour.cur, started = k >= 0, drift = jour.mode === "drift";
  const paused = jour.playing ? "" : `<span class="jour-paused">paused</span>`;
  btn.innerHTML = jour.playing ? `${ICON_PAUSE}<span>Pause</span>`
    : started ? `${ICON_PLAY}<span>${drift ? "Resume drifting" : "Resume journey"}</span>` : `${ICON_PLAY}<span>Start journey</span>`;
  btn.classList.toggle("playing", jour.playing);
  if (!drift) {
    $("jour-prev").disabled = !started || k === 0;
    $("jour-next").disabled = !started || k === n - 1;
  }
  $("jour-status").innerHTML = drift ? paused
    : started ? `Stop ${k + 1} of ${n}<span class="jour-at">${esc(nodes[jour.stops[k]][0])}</span>${paused}`
    : `A clip at every stop, about ${Math.round((n * JOUR_STOP_MS) / 1000)} seconds`;
  // the bar shows time spent at this stop; a freshly rebuilt card (e.g. when the shared list arrives) picks it up
  // mid-way via a negative delay instead of starting empty
  const bar = $("jour-bar");
  if (!started) { bar.style.animation = "none"; delete bar.dataset.t0; }
  else if (bar.dataset.t0 !== `${jour.t0}|${jour.stopMs}`) {
    const done = (jour.pausedAt ?? performance.now()) - jour.t0;
    bar.style.animation = "none"; void bar.offsetWidth;
    bar.style.animation = `jbar ${jour.stopMs}ms linear ${-done}ms forwards`;
    bar.dataset.t0 = `${jour.t0}|${jour.stopMs}`;
  }
  bar.style.animationPlayState = jour.playing ? "running" : "paused";
  card.querySelectorAll("li.stop").forEach((li) => li.classList.toggle("cur", +li.dataset.k === k));
  if (restartBar) card.querySelector("li.stop.cur")?.scrollIntoView({ block: "nearest", behavior: reduceMotion ? "auto" : "smooth" });
  syncPlaying();
}

// ---------------------------------------------------------------- selection, dimming, card
let selected = -1, hovered = null;
// a faded group hides its genres, except the stops of a journey: the route you asked for always shows in full
function faded(i) { return hiddenGroups.has(groupOf[i]) && !routeKeep?.has(i); }
function refreshDim() {
  const dim = starGeo.attributes.aDim.array;
  routeKeep = jour.stops && jour.mode !== "drift" ? new Set(jour.stops) : null;
  const near = new Set();
  if (selected >= 0) { near.add(selected); const nb = nodes[selected][6]; for (let k = 0; k < nb.length; k += 2) near.add(nb[k]); }
  if (artistSel) for (const i of artistSel.g) near.add(i);
  if (jour.stops) for (const i of jour.stops) near.add(i);
  const focusOn = selected >= 0 || !!artistSel || !!jour.stops;
  for (let i = 0; i < N; i++) {
    let v = faded(i) ? 0.06 : 1;
    if (focusOn && !near.has(i)) v *= artistSel || jour.stops ? 0.22 : 0.32;
    dim[i] = v;
  }
  starGeo.attributes.aDim.needsUpdate = true;
  // lines fade with their genres' groups, end by end (a line into a faded group fades along its length)
  if (linkEnd) {
    const ld = linkGeo.attributes.aDim.array;
    for (let v = 0; v < ld.length; v++) ld[v] = faded(linkEnd[v]) ? 0.06 : 1;
    linkGeo.attributes.aDim.needsUpdate = true;
  }
  starMat.uniforms.uSel.value = selected;
  if (ringIds.length) setRingAttrs(ringIds);
}
function select(i, how = "deep") {
  if (i >= 0 && !ov.open && ++genreCards === 2) showTip("journey", 1600);
  if (jour.stops) endJourney(false);
  selected = i; artistSel = null; artistSet = null;
  refreshDim();
  renderCard();
  if (i >= 0 && (how === "deep" || how === true)) flyTo(i);
  else if (i >= 0 && how === "step") stepTo(i);
  if (vennOn) setVennSet();
  writeHash();
}
function stepTo(i) {
  // one level deeper, centred on the genre: navigation follows the scale
  goal.tx = pos[i * 2]; goal.ty = pos[i * 2 + 1];
  goal.dist = Math.max(MIN_DIST, cam.dist / 2.5);
  liftGoal();
  vel.x = vel.y = 0; flying = !reduceMotion; follow = true;
  lastInput = performance.now();
}
function flyTo(i) {
  // zoom so roughly the 18 nearest genres fill the view: close enough for the Venn view to take over
  const x = pos[i * 2], y = pos[i * 2 + 1], d2 = [];
  for (let j = 0; j < N; j++) if (!hiddenGroups.has(groupOf[j])) d2.push((pos[j * 2] - x) ** 2 + (pos[j * 2 + 1] - y) ** 2);
  d2.sort((a, b) => a - b);
  const r = Math.sqrt(d2[Math.min(18, d2.length - 1)]) || 60;
  goal.tx = x; goal.ty = y;
  goal.dist = Math.max(MIN_DIST, Math.min(MAX_DIST, (r * 2.1) / (2 * Math.tan((FOV * Math.PI) / 360))));
  liftGoal();
  vel.x = vel.y = 0;
  flying = !reduceMotion; follow = true;
  if (reduceMotion) { cam.tx = goal.tx; cam.ty = goal.ty; cam.dist = goal.dist; }
  lastInput = performance.now();
}
function examplesOf(i) { return nodes[i][5]; }
// Card button icons: an outward arrow for the Spotify link (it leaves the site), two overlapping circles for the overlap view.
const ICON_OUT = `<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3H3.5A1.5 1.5 0 0 0 2 4.5v8A1.5 1.5 0 0 0 3.5 14h8a1.5 1.5 0 0 0 1.5-1.5V10M9 2h5v5M14 2 7.5 8.5"/></svg>`;
const ICON_VENN = `<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><circle cx="6" cy="8" r="4.5"/><circle cx="10" cy="8" r="4.5"/></svg>`;
const ICON_GO = `<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 8h11M9 3.5 13.5 8 9 12.5"/></svg>`;
// "hip hop" -> "Hip Hop", "k-pop" -> "K-Pop", as Spotify titles its Sound of playlists
const titleCase = (t) => t.replace(/(^|[\s-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());

function renderPairCard() {
  const { a, b, sh, list } = ov.pair, where = `in ${nodes[a][0]} & ${nodes[b][0]}`;
  const rows = list
    ? list.map(([name, id, track, tid]) => `<li>${id ? `<button type="button" data-clip="${id}" data-name="${esc(name)}" data-track="${esc(track || "")}" data-tid="${tid || ""}" title="${esc(track || "")}"><span class="pi" aria-hidden="true"></span>${esc(name)}</button>` : `<span class="noclip">${esc(name)}</span>`}</li>`).join("")
    : `<li class="loading">Loading…</li>`;
  card.innerHTML = `
    <button class="close" type="button" aria-label="Close shared artists">×</button>
    <span class="chip">${ICON_VENN}In both</span>
    <h2 class="pair">${esc(nodes[a][0])}<span class="amp">&</span>${esc(nodes[b][0])}</h2>
    <p class="meta">${sh} shared artist${sh === 1 ? "" : "s"}${list && list.length !== sh ? ` (${list.length} listed)` : ""}</p>
    ${b !== ov.c ? `<button type="button" class="see-overlaps" data-go="${b}">${ICON_GO}<span>Go to ${esc(nodes[b][0])}</span></button>` : ""}
    <h3>Artists in both</h3>
    <ol class="shared">${rows}</ol>`;
  card.hidden = false;
  card.querySelector(".close").onclick = closePair;
  card.querySelector("[data-go]")?.addEventListener("click", (e) => walkTo(+e.currentTarget.dataset.go));
  card.querySelectorAll("[data-clip]").forEach((btn) => (btn.onclick = () => {
    if (player.id === btn.dataset.clip && !audioEl.paused) stopClip();
    else playSong(btn.dataset.clip, btn.dataset.track, btn.dataset.name, where, { tid: btn.dataset.tid });
  }));
  syncPlaying();
}

function renderCard() { renderCardBody(); addShareButton(); announce(); }
// screen readers hear a short line when the card's subject changes, not the whole card on every redraw
let announced = "";
function announce() {
  const chip = card.querySelector(".chip")?.textContent.trim(), h2 = card.querySelector("h2")?.innerText.replace(/\s+/g, " ").trim();
  const text = card.hidden || !h2 ? "" : `${chip ? `${chip}: ` : ""}${h2}`;
  if (text !== announced) { announced = text; $("announce").textContent = text; }
}
function renderCardBody() {
  if (ov.open && ov.pair) { renderPairCard(); return; }
  if (jour.stops && selected < 0) { renderJourneyCard(); return; }
  if (artistSel && selected < 0) { renderArtistCard(); return; }
  if (selected < 0) { card.hidden = true; return; }
  if (!artistClips) loadClips();                    // re-renders the card when it arrives
  const [name, , g, , playlist, examples, nb] = nodes[selected];
  const gname = G[g].name, color = GROUP_COLORS[gname];
  const items = [];
  for (let k = 0; k < nb.length; k += 2) {
    const j = nb[k], s = nb[k + 1], gj = G[groupOf[j]].name;
    items.push(`<li><button type="button" data-i="${j}"><span class="dot" style="color:${GROUP_COLORS[gj]}"></span>${esc(nodes[j][0])}<span class="n">${s ? `${s} shared` : ""}</span></button></li>`);
  }
  card.innerHTML = `
    <button class="close" type="button" aria-label="Close details">×</button>
    <span class="chip"><span class="dot" style="color:${color}"></span>${esc(gname)}</span>
    <h2>${esc(name)}</h2>
    <p class="meta">#${nodes[selected][7].toLocaleString()} of ${N.toLocaleString()} in popularity</p>
    ${playlist ? `<a class="play" href="${esc(playlist)}" target="_blank" rel="noopener">${ICON_OUT}<span>The Sound of ${esc(titleCase(name))} on Spotify</span></a>` : ""}
    ${ov.open ? "" : `<button type="button" class="see-overlaps">${ICON_VENN}<span>See overlaps</span></button>`}
    ${ov.open ? "" : `<button type="button" class="see-overlaps journey-btn">${ICON_ROUTE}<span>Journey to…</span></button>`}
    ${nodes[selected][8] ? `<button type="button" class="clip-main" data-clip="${nodes[selected][8]}"><span class="pi" aria-hidden="true"></span><span><b>Play a clip</b>${nodes[selected][9] ? `<small>${esc(nodes[selected][9])}</small>` : ""}</span></button>` : ""}
    <h3>Example artists</h3>
    <ul class="artists">${examples.map((a, k) => {
      const c = artistClips?.[selected]?.[k], id = c?.[0];
      return `<li>${id ? `<button type="button" class="clip-artist" data-clip="${id}" data-k="${k}" data-track="${esc(c[1] || "")}" data-tid="${c[2] || ""}" title="${esc(c[1] || "Play a clip")}"><span class="pi" aria-hidden="true"></span>${esc(a)}</button>` : esc(a)}</li>`;
    }).join("")}</ul>
    <h3>Nearby genres</h3>
    <ol>${items.join("")}</ol>`;
  card.hidden = false;
  card.querySelector(".close").onclick = () => (ov.open ? closeOverlap() : select(-1, false));
  // in the overlap view a neighbour that shares artists opens "who is in both" (it has a Go to button); else walk there
  card.querySelectorAll("ol button").forEach((b) => (b.onclick = () => {
    const j = +b.dataset.i, sh = sharedOf(selected, j);
    if (!ov.open) { select(j); openPlay(j); } else if (sh > 0) openPair({ a: selected, b: j, sh }); else walkTo(j);
  }));
  card.querySelector(".see-overlaps:not(.journey-btn)")?.addEventListener("click", () => openOverlap(selected));
  card.querySelector(".journey-btn")?.addEventListener("click", () => askJourney(selected));
  card.querySelectorAll("[data-clip]").forEach((b) => (b.onclick = () => {
    if (player.id === b.dataset.clip && !audioEl.paused) { stopClip(); return; }
    const k = b.dataset.k;
    if (k === undefined) { const g = genreSong(selected); playSong(b.dataset.clip, g.track, g.artist, nodes[selected][0], { tid: g.tid, seq: { i: selected, k: -1 } }); }
    else playSong(b.dataset.clip, b.dataset.track, examplesOf(selected)[+k], nodes[selected][0], { tid: b.dataset.tid, seq: { i: selected, k: +k } });
  }));
  syncPlaying();
}

// ---------------------------------------------------------------- picking: only labelled things (see drawLabels)
function pick(x, y) {
  if (vennT > 0.5) {
    const w = worldAt(x, y);
    if (!w) return null;
    let best = -1, bd = Infinity;
    for (const i of vennIds) {
      const d = Math.hypot(pos[i * 2] - w.x, pos[i * 2 + 1] - w.y);
      if (d < radiusOf(i) && d / radiusOf(i) < bd) { bd = d / radiusOf(i); best = i; }
    }
    return best >= 0 ? { t: "n", i: best } : null;
  }
  for (let k = hits.length - 1; k >= 0; k--) {
    const h = hits[k];
    if (x >= h.x0 && x <= h.x1 && y >= h.y0 && y <= h.y1) return h;
  }
  return null;
}
function activate(p) {
  if (p.t === "g") {
    // step one level into a broad group
    const c = groupCentre[p.k];
    goal.tx = c.x; goal.ty = c.y; goal.dist = Math.max(MIN_DIST, Math.min(cam.dist / 2.4, 1650));
    vel.x = vel.y = 0; flying = !reduceMotion; follow = false;
  } else if (jour.mode === "drift" && jour.stops) driftStep(p.i);   // clicking a genre while drifting steers the drift
  else if (jour.mode === "journey" && jour.stops && jour.cur >= 0 && !jour.done && jour.stops.includes(p.i)) goStop(jour.stops.indexOf(p.i));   // on the route: jump there
  else if (vennT > 0.5) { select(p.i, "none"); openPlay(p.i); }
  else { select(p.i, "step"); openPlay(p.i); }
}

// ---------------------------------------------------------------- input
// drag = orbit in 3D · shift/right/middle-drag = pan · scroll or pinch = zoom · drag a ring (Venn view) = move it
const pointers = new Map();
const spin = { yaw: 0, tilt: 0 };
let dragging = false, dragMode = null, downAt = null, moved = 0, pinch0 = 0, mouse = { x: -1, y: -1 };
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
let ovDown = null, ovHoverJ = -1;
// overlap view touch: one finger pans, two fingers pinch-zoom (a second finger cancels the pan and the tap)
const ovTouches = new Map();
let ovPinch = 0;
function ovZoomAt(x, y, f0) {
  const before = ovWorldAt(x, y), d0 = ovDist0();
  const nd = Math.max(d0 * 0.12, Math.min(d0 * 4, ovGoal.dist * f0)), f = nd / ovGoal.dist;
  ovGoal.dist = nd;
  if (before) { ovGoal.tx = before.x + (ovGoal.tx - before.x) * f; ovGoal.ty = before.y + (ovGoal.ty - before.y) * f; }
}
canvas.addEventListener("pointerdown", (e) => {
  if (ov.open) {
    canvas.setPointerCapture(e.pointerId);
    if (e.pointerType === "touch") {
      ovTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ovTouches.size === 2) {
        const [a, b] = [...ovTouches.values()];
        ovPinch = Math.hypot(a.x - b.x, a.y - b.y); ovDrag = null; ovDown = null;
        return;
      }
      if (ovTouches.size > 2) return;
    }
    ovDown = { x: e.clientX, y: e.clientY };
    ovDrag = { x: e.clientX, y: e.clientY, moved: 0, mode: e.shiftKey || e.button === 1 || e.button === 2 || e.pointerType === "touch" ? "pan" : "orbit" };
    ovSpin.yaw = ovSpin.tilt = 0; canvas.classList.add("dragging");
    return;
  }
  canvas.setPointerCapture(e.pointerId);
  if (e.pointerType !== "touch") pointers.clear();          // only touch can have two pointers down
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  lastInput = performance.now(); flying = false; hint();
  moved = 0; downAt = { x: e.clientX, y: e.clientY };
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinch0 = Math.hypot(a.x - b.x, a.y - b.y); dragMode = "pinch";
    return;
  }
  dragging = true; canvas.classList.add("dragging");
  const p = pick(e.clientX, e.clientY);
  if (e.shiftKey || e.button === 1 || e.button === 2 || e.pointerType === "touch") dragMode = "pan";
  else dragMode = "orbit";
  vel.x = vel.y = 0; spin.yaw = spin.tilt = 0;
});
canvas.addEventListener("pointermove", (e) => {
  mouse = { x: e.clientX, y: e.clientY };
  if (ov.open && ovTouches.has(e.pointerId)) {
    ovTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ovTouches.size === 2 && ovPinch > 0) {
      const [a, b] = [...ovTouches.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d > 0) ovZoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, ovPinch / d);
      ovPinch = d; tip.hidden = true;
      return;
    }
  }
  if (ov.open && ovDrag) {
    const dx = e.clientX - ovDrag.x, dy = e.clientY - ovDrag.y;
    ovDrag.x = e.clientX; ovDrag.y = e.clientY; ovDrag.moved += Math.abs(dx) + Math.abs(dy);
    if (ovDrag.mode === "pan") {
      const wpp = ovWpp(), cy = Math.cos(ovView.yaw), sy = Math.sin(ovView.yaw);
      const mx = -(dx * cy + dy * sy) * wpp, my = (dy * cy - dx * sy) * wpp;
      ovGoal.tx += mx; ovGoal.ty += my; ovView.tx += mx; ovView.ty += my;
    } else {
      const cl = (v, m) => Math.max(-m, Math.min(m, v));
      ovGoal.yaw += cl(-dx * 0.0055, 0.25);
      ovGoal.tilt = Math.max(0, Math.min(1.25, ovGoal.tilt + cl(-dy * 0.0045, 0.2)));
      ovSpin.yaw = cl(-dx * 0.0055, 0.03); ovSpin.tilt = cl(-dy * 0.0045, 0.02);
    }
    tip.hidden = true;
    return;
  }
  if (ov.open) {
    const n = ovPick(e.clientX, e.clientY), o = n > 0 ? ov.L.items[n] : null, lens = ovLens(e.clientX, e.clientY);
    const hj = n >= 0 && ov.L ? ov.L.items[n].j : -1;
    if (hj !== ovHoverJ) { ovHoverJ = hj; hoverPlay(hj); }
    canvas.classList.toggle("pointing", !!(o || lens));
    if (lens || o) {
      tip.innerHTML = lens
        ? `<b>${esc(nodes[lens.a][0])} & ${esc(nodes[lens.b][0])}</b><span>Click to see ${lens.sh} shared artist${lens.sh === 1 ? "" : "s"}</span>`
        : `<b>${esc(nodes[o.j][0])}</b><span>${o.sh} shared artist${o.sh === 1 ? "" : "s"}</span>`;
      tip.hidden = false;
      tip.style.left = tip.style.top = "0";
      tip.style.transform = `translate(${Math.min(e.clientX + 16, W - tip.offsetWidth - 8)}px, ${Math.min(e.clientY + 16, H - tip.offsetHeight - 8)}px)`;
    } else tip.hidden = true;
    return;
  }
  const prev = pointers.get(e.pointerId);
  if (!prev) { hoverAt(e.clientX, e.clientY); return; }
  const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  moved += Math.abs(dx) + Math.abs(dy);
  lastInput = performance.now();
  if (dragMode === "pinch" && pointers.size === 2) {
    const [a, b] = [...pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinch0 > 0) zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, pinch0 / d);
    pinch0 = d;
    return;
  }
  const wpp = viewH() / H, cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
  if (dragMode === "pan") {
    follow = false;
    const mx = -(dx * cy + dy * sy) * wpp, my = (dy * cy - dx * sy) * wpp;
    goal.tx += mx; goal.ty += my; cam.tx += mx; cam.ty += my;
    vel.x = mx * 0.9; vel.y = my * 0.9;
  } else if (dragMode === "orbit") {
    const cl = (v, m) => Math.max(-m, Math.min(m, v));
    goal.yaw += cl(-dx * 0.0055, 0.25);
    goal.tilt = Math.max(0, Math.min(1.25, goal.tilt + cl(-dy * 0.0045, 0.2)));
    spin.yaw = cl(-dx * 0.0055, 0.03); spin.tilt = cl(-dy * 0.0045, 0.02);   // gentle momentum after release
  }
});
function endPointer(e) {
  if (ov.open) {
    if (ovTouches.has(e.pointerId)) {
      ovTouches.delete(e.pointerId);
      if (ovPinch) {                                   // end of a pinch: no tap, and the finger left behind
        if (!ovTouches.size) ovPinch = 0;              // must not jump the view when it moves again
        else { const [t] = [...ovTouches.values()]; ovDrag = { x: t.x, y: t.y, moved: 99, mode: "pan" }; }
        ovDown = null; canvas.classList.remove("dragging");
        return;
      }
    }
    canvas.classList.remove("dragging");
    const wasDrag = ovDrag && ovDrag.moved > 6;
    ovDrag = null;
    if (ovDown && !wasDrag && Math.hypot(e.clientX - ovDown.x, e.clientY - ovDown.y) < 6) {
      const lens = ovLens(e.clientX, e.clientY), n = ovPick(e.clientX, e.clientY);
      if (lens) openPair(lens);
      else if (n > 0) { walkTo(ov.L.items[n].j); tip.hidden = true; }
      else closePair();                                  // a click on empty space or the centre's own part clears it
    }
    ovDown = null;
    return;
  }
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);
  if (pointers.size > 0) return;
  if (moved < 5 && downAt && dragMode !== "pinch") {
    spin.yaw = spin.tilt = 0;
    const p = pick(e.clientX, e.clientY);
    if (p) activate(p);
  }
  dragging = false; dragMode = null; downAt = null;
  canvas.classList.remove("dragging");
}
canvas.addEventListener("pointerup", endPointer);
canvas.addEventListener("pointercancel", endPointer);
canvas.addEventListener("pointerleave", () => { if (!dragging) { mouse = { x: -1, y: -1 }; hoverAt(-1, -1); } });
canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  if (ov.open) {                                       // zoom the overlap view towards the cursor
    const dy = e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY;
    ovZoomAt(e.clientX, e.clientY, Math.exp(dy * (e.ctrlKey ? 0.008 : 0.0016)));
    return;
  }
  lastInput = performance.now(); flying = false; follow = false; hint();
  const dy = e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY;
  zoomAt(e.clientX, e.clientY, Math.exp(dy * (e.ctrlKey ? 0.008 : 0.0016)));   // ctrl+wheel = trackpad pinch
}, { passive: false });
// A pinch over the header, card or labels would zoom the whole page (ctrl+wheel on trackpads, gestures in Safari),
// pushing the search bar and panels off-screen; later pinches land on the map and never undo it. Keep page zoom off.
addEventListener("wheel", (e) => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
for (const t of ["gesturestart", "gesturechange"]) document.addEventListener(t, (e) => e.preventDefault());

function zoomAt(x, y, factor) {
  const before = worldAt(x, y);
  const nd = Math.max(MIN_DIST, Math.min(MAX_DIST, goal.dist * factor));
  const f = nd / goal.dist;
  goal.dist = nd;
  if (before) { goal.tx = before.x + (goal.tx - before.x) * f; goal.ty = before.y + (goal.ty - before.y) * f; }
}
let hoverKey = "", mapHoverJ = -1;
function hoverAt(x, y) {
  const p = x < 0 ? null : pick(x, y);
  if (S.hoverPlay) { const hj = p && p.t === "n" ? p.i : -1; if (hj !== mapHoverJ) { mapHoverJ = hj; hoverPlay(hj); } }
  const key = p ? p.t + (p.t === "n" ? p.i : p.k) : "";
  if (key !== hoverKey) {
    hoverKey = key; hovered = p;
    starMat.uniforms.uHover.value = p && p.t === "n" ? p.i : -1;
    starMat.uniforms.uHoverGroup.value = p && p.t === "g" ? p.k : -1;
    canvas.classList.toggle("pointing", !!p);
  }
  if (!p) { tip.hidden = true; return; }
  if (p.t === "g") {
    tip.innerHTML = `<b>${esc(G[p.k].name)}</b><span>${groupSize[p.k].toLocaleString()} genres</span>`;
  } else {
    const nb = nodes[p.i];
    tip.innerHTML = `<b>${esc(nb[0])}</b><span>${esc(G[nb[2]].name)} · #${nb[7].toLocaleString()}</span>`;
  }
  tip.hidden = false;
  const tx = Math.min(x + 16, W - tip.offsetWidth - 8), ty = Math.min(y + 16, H - tip.offsetHeight - 8);
  tip.style.transform = `translate(${tx}px, ${ty}px)`;
  tip.style.left = tip.style.top = "0";
}

// arrows pan along the screen, whatever way the view has been orbited (same rotation as shift-drag)
const ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
function arrowPan(key, step, yaw, g) {
  const a = ARROWS[key];
  if (!a) return false;
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  g.tx += (a[0] * cy - a[1] * sy) * step; g.ty += (a[0] * sy + a[1] * cy) * step;
  return true;
}
// map keys work wherever focus is (after clicking a button or the card too), except while typing
function mapKeys(e) {
  if (tour.on && (e.key === "ArrowLeft" || e.key === "ArrowRight")) { e.preventDefault(); tourJump(e.key === "ArrowLeft" ? -1 : 1); return; }
  if (tour.on) { e.preventDefault(); return; }   // other map keys wait until the tour is over (Esc or Stop ends it)
  if (ov.open) {
    const step = ovWpp() * 60;
    if (e.key === "+" || e.key === "=") ovGoal.dist = Math.max(ovDist0() * 0.12, ovGoal.dist / 1.35);
    else if (e.key === "-" || e.key === "_") ovGoal.dist = Math.min(ovDist0() * 4, ovGoal.dist * 1.35);
    else if (e.key === "0") ovResetView(false);
    else if (arrowPan(e.key, step, ovView.yaw, ovGoal)) {}
    else return;
    e.preventDefault();
    return;
  }
  if (arrowPan(e.key, viewH() * 0.08, cam.yaw, goal)) follow = false;
  else if (e.key === "+" || e.key === "=") goal.dist = Math.max(MIN_DIST, goal.dist / 1.35);
  else if (e.key === "-" || e.key === "_") goal.dist = Math.min(MAX_DIST, goal.dist * 1.35);
  else if (e.key === "0") goHome();
  else return;
  e.preventDefault(); lastInput = performance.now(); hint();
}
canvas.addEventListener("keydown", mapKeys);
// F = fullscreen (keyboard only, no button). iPhone Safari can't fullscreen a page, so there it simply isn't offered.
const fsDoc = document.documentElement;
const canFullscreen = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
function toggleFullscreen() {
  if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  else (fsDoc.requestFullscreen || fsDoc.webkitRequestFullscreen).call(fsDoc)?.catch?.(() => {});
}
if (!canFullscreen) $("keys-fs")?.remove();
addEventListener("keydown", (e) => {
  if ((e.key === "m" || e.key === "M") && !/^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || "")) { toggleMute(); return; }
  if ((e.key === "f" || e.key === "F") && canFullscreen && !e.metaKey && !e.ctrlKey && !e.altKey
      && !/^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || "")) { e.preventDefault(); toggleFullscreen(); return; }
  if (e.target !== canvas && !e.metaKey && !e.ctrlKey && !e.altKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "")
      && /^(Arrow(Left|Right|Up|Down)|[-+=_0])$/.test(e.key)) { mapKeys(e); return; }
  if (e.key === "Escape" && tour.on) { stopTour(); return; }
  if (e.key === "Escape") { if (ov.pair) closePair(); else if (jour.stops && !ov.open) { if (jour.mode === "drift") stopDrift(true); else select(-1, false); } else if (ov.open) closeOverlap(); else if (!card.hidden) select(-1, false); else if (!$("settings").hidden) toggleSettings(false); }
});

// ---------------------------------------------------------------- contextual tips
// One short line at the bottom, shown the first time something relevant happens, once per visit, for 8 s, never
// during a journey or drift. Replaces the "Easy to miss" list that used to sit in Settings.
const TIPS = {
  drift: "Drift stays inside the groups you haven't faded",
  overlap: `${matchMedia("(pointer: coarse)").matches ? "Tap" : "Click"} where two circles overlap to see the artists they share`,
  journey: "Journey to… on a genre's card finds a route to any other genre",
  share: "The share button copies a link to exactly what you're seeing",
  artists: "Search finds artists too: every genre that lists them lights up",
};
const tipSeen = new Set();
try { JSON.parse(sessionStorage.getItem("ga-tips") || "[]").forEach((k) => tipSeen.add(k)); } catch {}
let tipTimer = 0, genreCards = 0;
function showTip(key, delay = 900) {
  if (tipSeen.has(key)) return;
  clearTimeout(tipTimer);
  tipTimer = setTimeout(() => {
    if (jour.playing || tour.on || tipSeen.has(key)) return;
    tipSeen.add(key);
    try { sessionStorage.setItem("ga-tips", JSON.stringify([...tipSeen])); } catch {}
    $("hint").classList.add("gone");                 // never two lines in the same spot
    const el = $("tipline"), phone = innerWidth <= 720;
    // sit above whatever occupies the bottom: the phone's card sheet, else the now-playing bar
    const bottom = phone && !card.hidden ? Math.min(card.offsetHeight, H * 0.6) + 14 : $("now").classList.contains("on") ? 96 : phone ? 64 : 46;
    el.style.bottom = bottom + "px";
    el.textContent = TIPS[key];
    el.classList.add("on");
    tipTimer = setTimeout(() => el.classList.remove("on"), 8000);
  }, delay);
}
setTimeout(() => showTip("artists", 0), 45000);      // a while on the map without searching

let hinted = false;
function hint() { if (!hinted) { hinted = true; setTimeout(() => $("hint").classList.add("gone"), 2500); } }

// ---------------------------------------------------------------- tour: a short narrated flight, like a cut scene
// The play button (bottom left) runs it: the UI fades away, the camera flies on its own, captions tell a short story
// and clips play. Stop (under the caption), Esc, or touching the map ends it and leaves you wherever it got to.
// Every fact in it comes from the data: pop is #1, trallalero's rank, bebop/hard bop's shared artists, the live route.
const TOUR_STOP = Symbol("tour stopped");
function tourWait(ms) {
  const r = tour.run;
  return new Promise((res, rej) => setTimeout(() => (tour.on && tour.run === r ? res() : rej(TOUR_STOP)), ms));
}
// keep the caption clear of the card: beside it on wide screens, above the bottom sheet on phones
function placeTourCap() {
  const cap = $("tour-cap"), r = card.hidden ? null : card.getBoundingClientRect();
  if (innerWidth <= 720) {
    // phones: under the header (and the overlap bar when it is open), clear of the genre names and the bottom sheet
    const oh = $("ov-head"), below = !oh.hidden ? oh.getBoundingClientRect().bottom : document.querySelector(".hud.top").getBoundingClientRect().bottom;
    cap.style.left = cap.style.width = ""; cap.style.bottom = "auto"; cap.style.top = `${Math.round(below + 10)}px`;
    return;
  }
  cap.style.top = "";
  if (!r) { cap.style.left = cap.style.bottom = cap.style.width = ""; return; }
  {
    // stay centred on the screen like the now-playing bar (moving it beside the card looked misaligned with the bar);
    // narrow it so it ends before the card. Only on screens too narrow for that does it move left of the card.
    const room = 2 * (r.left - innerWidth / 2) - 40;
    cap.style.bottom = "";
    if (room >= 340) { cap.style.left = ""; cap.style.width = `${Math.round(Math.min(720, room))}px`; }
    else { cap.style.left = `${Math.round(r.left / 2)}px`; cap.style.width = `${Math.round(Math.min(720, r.left - 48))}px`; }
  }
}
async function tourSay(text, ms) {
  const line = $("tour-line");
  line.classList.remove("on");
  await tourWait(reduceMotion ? 0 : 450);
  placeTourCap();
  line.textContent = text; line.classList.add("on");
  await tourWait(ms);
}
function tourClip(i) {
  if (player.muted || i < 0 || !nodes[i][8]) return;
  const g = genreSong(i);
  playSong(nodes[i][8], g.track, g.artist, nodes[i][0], { tid: g.tid });
}
// glow = a CSS selector; re-applied every 250 ms because the card re-renders (clips arriving, shared lists loading)
function tourGlow(sel) {
  tour.glow = sel;
  document.querySelectorAll(".tour-glow").forEach((b) => { if (!sel || !b.matches(sel)) b.classList.remove("tour-glow"); });
  if (sel) document.querySelector(sel)?.classList.add("tour-glow");
}
// "press" the glowing button: a short pressed look, then do what it does
async function tourPress(sel, act) {
  const el = document.querySelector(sel);
  el?.classList.add("tour-press");
  await tourWait(reduceMotion ? 0 : 260);
  el?.classList.remove("tour-press");
  tourGlow(null);
  act();
}
// The tour is a list of chapters; ‹ and › (or the arrow keys) jump between them. Each chapter can start on its own:
// a jump first clears whatever the last one left open (tourReset), then the chapter sets up what it needs.
const tourIds = () => {
  const id = (name) => nodes.findIndex((n) => n[0] === name);
  return { POP: id("pop"), TINY: id("trallalero"), BEBOP: id("bebop"), HARDBOP: id("hard bop"), FROM: id("metal"), TO: id("indie rock"), DRIFT: id("dream pop") };
};
const TOUR = [
  async ({ POP }) => {                                  // the sky
    select(-1, false);
    tourClip(POP);                                      // runs inside the click, so browsers allow the sound
    goHome(); tour.orbit = 0.035;
    await tourSay("Every star is a genre.", 4200);
    await tourSay(`${N.toLocaleString()} of them.`, 3000);
    await tourSay("Similar genres sit close together.", 4000);
  },
  async ({ POP, TINY }) => {                            // the brightest and the faintest
    tour.orbit = 0; select(POP); tourClip(POP);
    await tourSay("Pop shines brightest: the most popular of them all.", 6000);
    select(TINY); tourClip(TINY);
    await tourSay("Others are barely known at all.", 4200);
    await tourSay(`This is ${nodes[TINY][0]}: #${nodes[TINY][7].toLocaleString()} of ${N.toLocaleString()}.`, 5000);
  },
  async ({ BEBOP, HARDBOP }) => {                       // overlaps
    select(BEBOP); tourClip(BEBOP);
    await tourSay("Every genre has a card: its sound, its artists, its neighbours.", 4600);
    tourGlow(".card .see-overlaps:not(.journey-btn)");
    await tourSay("See overlaps shows who it's connected to.", 3400);
    await tourPress(".card .see-overlaps:not(.journey-btn)", () => openOverlap(BEBOP));
    await tourSay("Up close, genres become circles.", 3800);
    await tourSay("They overlap where they share artists.", 3800);
    // click hard bop in the card's list: the two circles light up and the card lists the artists both share
    const hb = `.card ol button[data-i="${HARDBOP}"]`;
    document.querySelector(hb)?.scrollIntoView({ block: "nearest", behavior: reduceMotion ? "auto" : "smooth" });
    tourGlow(hb);
    await tourWait(1500);
    await tourPress(hb, () => openPair({ a: BEBOP, b: HARDBOP, sh: sharedOf(BEBOP, HARDBOP) }));
    await tourSay(`${titleCase(nodes[BEBOP][0])} and ${nodes[HARDBOP][0]} share ${sharedOf(BEBOP, HARDBOP)}.`, 5200);
    await tourSay("Follow those overlaps, and one genre leads to another.", 4200);
  },
  async ({ FROM, TO }) => {                             // a journey
    closeOverlap(false);
    select(FROM); tourClip(FROM);
    await tourSay("Pick a destination, and the sky finds the path.", 3600);
    tourGlow(".card .journey-btn");
    await tourWait(1600);
    await tourPress(".card .journey-btn", () => askJourney(FROM));
    document.body.classList.add("tour-top"); tourGlow("#search");
    const q = $("q"), word = nodes[TO][0];
    await tourWait(700);
    for (const ch of word) { q.value += ch; renderSearch(q.value); await tourWait(reduceMotion ? 0 : 190); }
    await tourWait(1100);
    pickSearch(sItems.find((it) => it.t === "g" && it.i === TO) || { t: "g", i: TO });
    tourGlow(null); document.body.classList.remove("tour-top");
    const stops = jour.stops || [];
    for (let k = 0; k < stops.length; k++) {
      goStop(k);
      if (k === 0) tourSay(`From ${nodes[FROM][0]} to ${nodes[TO][0]} in ${stops.length} stops.`, 0).catch(() => {});
      await tourWait(k === stops.length - 1 ? 5000 : 3800);
    }
  },
  async ({ DRIFT }) => {                                // drift, from somewhere new (not the journey's end: its clip just played)
    if (jour.stops) select(-1, false);
    select(DRIFT);
    document.body.classList.add("tour-top"); tourGlow("#drift-btn");
    await tourSay("Or just press drift and wander.", 3200);
    await tourPress("#drift-btn", startDrift);
    document.body.classList.remove("tour-top");
    for (let k = 0; k < 3; k++) { await tourWait(5200); if (k < 2) driftStep(); }   // three clips
  },
  async () => {                                         // the hand-off
    select(-1, false);
    goHome(); tour.orbit = 0.03;
    document.body.classList.add("tour-top"); tourGlow("#settings-btn");
    await tourSay("Head over to settings for keyboard shortcuts and more.", 4600);
    tourGlow(null);
    await tourSay("The rest is yours to find.", 3800);
  },
];
function tourReset() {
  tourGlow(null); tour.orbit = 0;
  document.body.classList.remove("tour-top");
  $("tour-line").classList.remove("on");
  if (jour.picking >= 0) { stopAsking(); $("q").value = ""; closeSearch(); }
  closeOverlap(false);
  if (jour.stops) select(-1, false);                    // ends a journey or drift (and its clip)
}
function runTour(from) {
  tour.run++;                                           // cancels whatever chapter was waiting
  const ids = tourIds();
  (async () => {
    for (let c = from; c < TOUR.length; c++) {
      tour.ch = c; syncTourNav();
      await TOUR[c](ids);
    }
    endTour();
  })().catch((e) => { if (e !== TOUR_STOP) { console.error(e); endTour(); } });
}
function tourJump(d) {
  if (!tour.on) return;
  const c = tour.ch + d;
  if (c >= TOUR.length) { stopTour(); return; }
  tourReset();
  runTour(Math.max(0, c));
}
function syncTourNav() {
  $("tour-prev").disabled = tour.ch <= 0;
  $("tour-next").setAttribute("aria-label", tour.ch >= TOUR.length - 1 ? "End the tour" : "Next part");
}
function startTour() {
  if (tour.on) return;
  closeOverlap(false); setPeek(false);
  stopAsking(); toggleSettings(false); closeSearch();
  select(-1, false);
  tour.on = true;
  try { localStorage.setItem("gs-toured", "1"); } catch {}
  $("tour-btn").classList.remove("beckon");
  document.body.classList.add("touring");
  $("tour-cap").hidden = false;
  clearInterval(tour.placer);
  tour.placer = setInterval(() => { placeTourCap(); if (tour.glow) tourGlow(tour.glow); }, 250);   // the card changes as it fills
  runTour(0);
}
function endTour() {
  if (!tour.on) return;
  tour.on = false; tour.run++; tour.orbit = 0; clearInterval(tour.placer);
  tourGlow(null);
  if (jour.picking >= 0) { stopAsking(); $("q").value = ""; closeSearch(); }
  $("tour-line").classList.remove("on");
  document.body.classList.remove("touring", "tour-top");
  setTimeout(() => { if (!tour.on) $("tour-cap").hidden = true; }, 600);
  if (!jour.playing) stopClip(1500);
  renderCard();
}
// stopped early: stay exactly where it got to (a journey stays open, paused, with its card)
function stopTour() {
  if (!tour.on) return;
  if (jour.playing) { pauseJourney(); stopClip(); }
  endTour();
}

// ---------------------------------------------------------------- phone bottom sheet: swipe down to minimise
// On phones the card is a bottom sheet that can cover most of the map. Swiping down (from the top of its scroll)
// shrinks it to a strip with just the title; tapping the strip or swiping up opens it again. Picking another genre
// keeps it small, so you can browse the map with the strip showing what you picked. Closing it resets the state.
const isPhone = () => matchMedia("(max-width: 720px)").matches;
function setPeek(on) {
  card.classList.toggle("peek", on);
  if (on) card.scrollTop = 0;
  card.setAttribute("aria-description", on ? "Minimised. Tap to open." : "");
}
function setupSheetSwipe() {
  let sw = null;
  card.addEventListener("touchstart", (e) => {
    if (!isPhone() || tour.on || e.touches.length > 1) { sw = null; return; }
    const t = e.touches[0];
    sw = { x0: t.clientX, y0: t.clientY, dy: 0, drag: false, peek: card.classList.contains("peek") };
  }, { passive: true });
  card.addEventListener("touchmove", (e) => {
    if (!sw) return;
    const t = e.touches[0], dx = t.clientX - sw.x0, dy = t.clientY - sw.y0;
    if (!sw.drag) {
      if (Math.abs(dy) < 8 || Math.abs(dy) < Math.abs(dx)) return;
      // a downward pull at the top of the open sheet, or any vertical drag on the minimised strip
      if (sw.peek || (dy > 0 && card.scrollTop <= 0)) sw.drag = true; else { sw = null; return; }
    }
    e.preventDefault();
    sw.dy = dy;
    card.style.transition = "none";
    card.style.transform = sw.peek ? `translateY(calc(100% - var(--peek) + ${Math.min(0, dy)}px))` : `translateY(${Math.max(0, dy)}px)`;
  }, { passive: false });
  const end = () => {
    if (!sw) return;
    if (sw.drag) {
      card.style.transition = ""; card.style.transform = "";
      if (!sw.peek && sw.dy > 60) setPeek(true);
      else if (sw.peek && sw.dy < -30) setPeek(false);
    }
    lastSwipe = sw.drag ? performance.now() : 0;
    sw = null;
  };
  let lastSwipe = 0;
  card.addEventListener("touchend", end);
  card.addEventListener("touchcancel", end);
  // tapping the minimised strip (not its × or share button) opens it; a tap right after a swipe doesn't count
  card.addEventListener("click", (e) => {
    if (!card.classList.contains("peek") || performance.now() - lastSwipe < 350) return;
    if (e.target.closest(".close, .share")) return;
    e.preventDefault(); e.stopPropagation(); setPeek(false);
  }, true);
  // closing the card (or it closing itself) starts the next one open again
  new MutationObserver(() => { if (card.hidden) setPeek(false); }).observe(card, { attributes: true, attributeFilter: ["hidden"] });
  addEventListener("resize", () => { if (!isPhone()) setPeek(false); });
}

// ---------------------------------------------------------------- UI wiring
function goHome() {
  // centre and zoom out to the whole map (keeps any selection)
  goal.tx = 0; goal.ty = 0; goal.dist = homeDist; goal.tilt = 0.62;
  vel.x = vel.y = 0; spin.yaw = spin.tilt = 0; follow = false; flying = !reduceMotion;
  lastInput = performance.now();
}
function toggleSettings(open) {
  const p = $("settings"), b = $("settings-btn");
  p.hidden = !open; b.setAttribute("aria-expanded", String(open));
}
function buildUI() {
  if (matchMedia("(pointer: coarse)").matches) $("hint").textContent = "pinch to zoom · drag to move · tap a name to go deeper";
  for (let i = 0; i < N; i++) byDegree.push(i);
  byDegree.sort((a, b) => nodes[a][7] - nodes[b][7]);
  buildSearch();
  $("settings-btn").onclick = () => toggleSettings($("settings").hidden);
  $("settings-close").onclick = () => toggleSettings(false);
  $("drift-btn").onclick = () => (jour.mode === "drift" && jour.stops && !jour.done ? stopDrift(true) : startDrift());
  $("home-btn").onclick = () => { closeOverlap(false); goHome(); };
  $("tour-btn").onclick = startTour;
  $("tour-stop").onclick = stopTour;
  $("tour-prev").onclick = () => tourJump(-1);
  $("tour-next").onclick = () => tourJump(1);
  // during the tour, taps, drags and scrolls on the map, card and overlap header are ignored instead of ending it:
  // too many people left it by accident. Stop (or Esc) is the way out; ‹ › still jump between parts.
  const holdForTour = (e) => { if (tour.on && e.isTrusted) { e.preventDefault(); e.stopImmediatePropagation(); } };
  for (const el of [canvas, card, $("ov-head")]) for (const type of ["pointerdown", "click", "dblclick"]) el.addEventListener(type, holdForTour, true);
  canvas.addEventListener("wheel", holdForTour, { capture: true, passive: false });   // the card still scrolls
  setupSheetSwipe();
  try { if (!localStorage.getItem("gs-toured") && !location.hash) setTimeout(() => $("tour-btn").classList.add("beckon"), 2500); } catch {}
  $("ov-close").onclick = () => closeOverlap();
  $("mute-btn").onclick = toggleMute;
  $("now-stop").onclick = () => { if (jour.playing) pauseJourney(); stopClip(); };
  syncPlaying();
  $("ov-back").onclick = () => { if (ov.trail.length) walkTo(ov.trail.pop(), true); };
  $("home-title").onclick = () => { closeOverlap(false); goHome(); };

  const bind = (id, key, fn, kind = "range") => {
    const el = $(id);
    if (kind === "check") el.checked = S[key]; else el.value = S[key];
    el.addEventListener("input", () => { S[key] = kind === "check" ? el.checked : +el.value; fn?.(); });
  };
  const DESIGN = { size: S.size, bloom: S.bloom, linkOp: S.linkOp };
  const applyLinks = () => {
    linkMat.uniforms.uOp.value = S.links ? S.linkOp : 0;
    linkGeo.setDrawRange(0, rankCount[Math.max(1, S.linkRank)] * 2); positionsDirty = true;
    $("s-linkmode").querySelectorAll("button").forEach((b) => b.setAttribute("aria-checked", String(+b.dataset.mode === (S.links ? S.linkRank : 0))));
  };
  bind("s-size", "size", () => (starMat.uniforms.uSize.value = S.size));
  bind("s-bloom", "bloom", () => (bloom.strength = S.bloom));
  bind("s-linkop", "linkOp", applyLinks);
  $("s-linkmode").querySelectorAll("button").forEach((b) => (b.onclick = () => {
    const m = +b.dataset.mode; S.links = m > 0; if (m) S.linkRank = m; applyLinks();
  }));
  applyLinks();
  $("s-reset").onclick = () => {
    Object.assign(S, DESIGN);
    for (const [id, k] of [["s-size", "size"], ["s-bloom", "bloom"], ["s-linkop", "linkOp"]]) $(id).value = S[k];
    starMat.uniforms.uSize.value = S.size; bloom.strength = S.bloom; applyLinks();
  };
  // volume slider (iPhone Safari ignores page volume and always plays at the phone's own volume, so it hides there)
  {
    const v = $("s-volume"), probe = new Audio();
    probe.volume = 0.5;
    if (probe.volume !== 0.5) v.closest("label").remove();
    else {
      v.value = player.vol;
      v.addEventListener("input", () => {
        player.vol = +v.value;
        if (!audioEl.paused) audioEl.volume = player.vol;
        try { localStorage.setItem("ga-vol", String(player.vol)); } catch {}
      });
    }
  }
  bind("s-hoverplay", "hoverPlay", () => { if (!S.hoverPlay && player.byHover) stopClip(); }, "check");

  $("legend").innerHTML = G.map((g) => `<li><button type="button" aria-pressed="true" data-g="${g.id}"><span class="dot" style="color:${GROUP_COLORS[g.name]}"></span>${esc(g.name)}</button></li>`).join("");
  $("legend").querySelectorAll("button").forEach((b) => (b.onclick = () => {
    const g = +b.dataset.g, on = hiddenGroups.has(g);
    on ? hiddenGroups.delete(g) : hiddenGroups.add(g);
    b.setAttribute("aria-pressed", String(on));
    refreshDim();
    if (!on) showTip("drift", 600);
    else if (jour.mode === "drift" && jour.stops && jour.blocked) { jour.blocked = false; jour.playing = true; driftStep(); }
  }));
}

// ---------------------------------------------------------------- shareable links (URL hash)
// The address always describes what is on screen, so copying it (or the card's share button) reopens the same view:
//   #g=<genre slug>            a genre                   #a=<artist name>          an artist
//   #o=<slug>[&w=<slug>]       overlap view [+ the overlap with w opened]
//   #j=<from slug>~<to slug>   a journey (the route is recomputed, so it is always the same one)
// Drift is random, so a drift writes no hash. replaceState: the back button is not filled with every click.
function viewHash() {
  const slug = (i) => nodes[i][1];
  if (ov.open && ov.c >= 0) return `#o=${slug(ov.c)}${ov.pair ? `&w=${slug(ov.pair.a === ov.c ? ov.pair.b : ov.pair.a)}` : ""}`;
  if (jour.stops && jour.mode === "journey") return `#j=${slug(jour.stops[0])}~${slug(jour.stops[jour.stops.length - 1])}`;
  if (artistSel && selected < 0) return `#a=${encodeURIComponent(artistSel.name)}`;
  if (selected >= 0) return `#g=${slug(selected)}`;
  return "";
}
function writeHash() {
  const h = viewHash();
  if (h !== location.hash) history.replaceState(null, "", h || location.pathname + location.search);
}
let pendingHash = null;
function readHash() { pendingHash = location.hash.length > 1 ? location.hash.slice(1) : null; }
async function applyHash(h) {
  const p = new URLSearchParams(h), bySlug = (x) => (x ? nodes.findIndex((n) => n[1] === x) : -1);
  if (p.has("j")) {
    const [a, b] = (p.get("j") || "").split("~").map(bySlug);
    if (a >= 0 && b >= 0) { startJourney(a, b); return; }
  }
  if (p.has("o")) {
    const c = bySlug(p.get("o")), w = bySlug(p.get("w"));
    if (c >= 0) {
      openOverlap(c);
      if (w >= 0 && sharedOf(c, w) > 0) setTimeout(() => { if (ov.open && ov.c === c) openPair({ a: c, b: w, sh: sharedOf(c, w) }); }, 900);
      return;
    }
  }
  if (p.has("a")) {
    const name = p.get("a") || "", key = shardKeyOf(name);
    const row = key ? (await loadShard(key)).find((r) => r.name === name) : null;
    if (row) { openArtist(row); return; }
  }
  const g = bySlug(p.get("g"));
  if (g >= 0) select(g);
}
addEventListener("hashchange", () => { if (hasPos) applyHash(location.hash.slice(1)); });

// share button on every card: the phone's share sheet where there is one, otherwise copy the link
const ICON_SHARE = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 10V2.5M5 5.2 8 2.2l3 3M3.5 8v4.8c0 .6.5 1 1 1h7c.6 0 1-.4 1-1V8"/></svg>`;
function addShareButton() {
  if (card.hidden || card.querySelector(".share") || !viewHash()) return;
  card.querySelector(".close")?.insertAdjacentHTML("afterend", `<button class="share" type="button" aria-label="Share a link to this" title="Share a link to this">${ICON_SHARE}</button>`);
  card.querySelector(".share").onclick = shareView;
}
async function shareView() {
  writeHash();
  const url = location.href, title = document.title;
  if (navigator.share && matchMedia("(pointer: coarse)").matches) { try { await navigator.share({ title, url }); return; } catch (err) { if (err?.name === "AbortError") return; } }
  try {                                               // some frames leave this pending forever: give it 1.2 s
    await Promise.race([navigator.clipboard.writeText(url), new Promise((_, no) => setTimeout(no, 1200))]);
    nowToast("Link copied"); return;
  } catch {}
  // older route for browsers or frames that block the clipboard API
  const ta = Object.assign(document.createElement("textarea"), { value: url, readOnly: true });
  ta.style.cssText = "position:fixed;opacity:0;pointer-events:none";
  document.body.append(ta); ta.select();
  let ok = false; try { ok = document.execCommand("copy"); } catch {}
  ta.remove();
  nowToast(ok ? "Link copied" : "Copy the link from the address bar");
}

// ---------------------------------------------------------------- main loop
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  uTime.value = now / 1000;
  updateCamera(dt);
  if (hasPos) {
    started = true;
    if (positionsDirty) { writePositions(); positionsDirty = false; }
    writeDust(uTime.value);
    if (pendingHash !== null && uTime.value > 0) {
      const h = pendingHash;
      pendingHash = null;
      setTimeout(() => applyHash(h), 1800);              // let the cloud form first
    }
    const target = vennOn ? 1 : 0;
    vennT += (target - vennT) * (1 - Math.exp(-dt * (reduceMotion ? 30 : 1.4)));
    uVenn.value = vennT;
    uFlat.value = smoothstep(260, 1500, cam.dist) * (1 - vennT);
    linkMat.uniforms.uFar.value = 0.3 + 0.7 * smoothstep(2600, 900, cam.dist);   // thousands overlap when far: dimmer
    const count = project();
    updateVenn(count);
    writeRings(dt);
    ovUpdate(dt);
    jourUpdate(dt);
    const w = mouse.x >= 0 ? worldAt(mouse.x, mouse.y) : null;
    ringMat.uniforms.uMouse.value.set(w ? w.x : 1e9, w ? w.y : 1e9);
    drawLabels();
  }
  composer.render();
  requestAnimationFrame(frame);
}

resize();
addEventListener("resize", resize);
window.__atlas = { scene, renderer, camera, composer, goal, cam, get hits() { return hits; }, get pos() { return pos; }, get links() { return links; }, get groupOf() { return groupOf; } };   // dev inspection only
load().then(() => { resize(); requestAnimationFrame(frame); }).catch((err) => {
  $("stats").textContent = "Could not load the map data.";
  console.error(err);
});
