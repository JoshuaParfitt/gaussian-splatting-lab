import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import './style.css';

// This is intentionally a Gaussian POINT-SPRITE renderer, not full 3DGS.
// Gaussians are isotropic in image space, and the 3D positions are procedural.
const vertexShader = `
  attribute vec3 aColor;
  attribute float aRadius;
  varying vec3 vColor;
  uniform float uScale;
  uniform float uPixelRatio;
  uniform float uPointMode;
  void main() {
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float radiusPixels = aRadius * uScale * 220.0 * uPixelRatio / max(1.0, -mv.z);
    gl_PointSize = clamp(radiusPixels * mix(1.0, 0.22, uPointMode), 1.0, 150.0 * uPixelRatio);
  }
`;
const fragmentShader = `
  precision highp float;
  varying vec3 vColor;
  uniform float uOpacity;
  uniform float uPointMode;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(p, p);
    if (r2 > 1.0) discard;
    // r is measured in normalized point-sprite coordinates.
    float alpha = mix(exp(-4.5 * r2), 1.0, uPointMode) * uOpacity;
    if (alpha < 0.008) discard;
    gl_FragColor = vec4(vColor, alpha);
  }
`;

const $ = (selector) => document.querySelector(selector);
const viewport = $('#viewport');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.setClearColor(0x090f1a, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
viewport.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 160);
camera.position.set(0, 5.4, 17);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.055;
controls.minDistance = 5;
controls.maxDistance = 38;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.38;
controls.addEventListener('start', () => { controls.autoRotate = false; });

const state = { mode: 'compare', shape: 'torus', count: 3000, scale: 1, opacity: 0.65, palette: 'aurora' };
const palette = {
  aurora: [[0x3df0e2, 0x607cf6, 0xcd67ff]],
  ember: [[0xffd06c, 0xff784c, 0xe35491]],
  ocean: [[0x54f5b7, 0x34b9ed, 0x6574e8]],
};
function seededRandom(seed = 1249) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(1664525, s) + 1013904223) >>> 0; return s / 4294967296; };
}
function generate() {
  const random = seededRandom(state.shape.length * 321 + state.count);
  const positions = new Float32Array(state.count * 3);
  const colors = new Float32Array(state.count * 3);
  const radii = new Float32Array(state.count);
  const stops = palette[state.palette][0].map(h => new THREE.Color(h));
  const color = new THREE.Color();
  for (let i = 0; i < state.count; i++) {
    const t = (i / state.count) * Math.PI * 2;
    const jitter = () => (random() + random() + random() - 1.5);
    let x, y, z, u;
    if (state.shape === 'torus') {
      const tube = 1.35 + 0.22 * Math.sin(7 * t);
      const section = random() * Math.PI * 2;
      const R = 4.05 + tube * Math.cos(section);
      x = R * Math.cos(t * 2) + jitter() * 0.22;
      y = 2.1 * Math.sin(t * 3) + tube * Math.sin(section) + jitter() * 0.22;
      z = R * Math.sin(t * 2) + jitter() * 0.22;
      u = (t / (Math.PI * 2) + section / (Math.PI * 5)) % 1;
    } else if (state.shape === 'helix') {
      const branch = i % 2;
      const phase = t * 3.5 + branch * Math.PI;
      x = 2.65 * Math.cos(phase) + jitter() * 0.45;
      y = (i / state.count - 0.5) * 11 + jitter() * 0.35;
      z = 2.65 * Math.sin(phase) + jitter() * 0.45;
      u = (i / state.count + branch * 0.33) % 1;
    } else {
      const theta = random() * Math.PI * 2;
      const phi = Math.acos(2 * random() - 1);
      const radius = 3.0 + random() * 2.4 + 0.65 * Math.sin(5 * theta) * Math.sin(3 * phi);
      x = radius * Math.sin(phi) * Math.cos(theta) + jitter() * 0.25;
      y = radius * Math.cos(phi) + jitter() * 0.25;
      z = radius * Math.sin(phi) * Math.sin(theta) + jitter() * 0.25;
      u = (y + 5.5) / 11;
    }
    positions.set([x, y, z], i * 3);
    // Interpolate along a three-stop palette.
    const clamped = Math.min(0.999, Math.max(0, u));
    const span = clamped * 2;
    color.copy(stops[Math.floor(span)]).lerp(stops[Math.floor(span) + 1], span % 1);
    colors.set([color.r, color.g, color.b], i * 3);
    radii[i] = 0.7 + random() * 1.2;
  }
  return { positions, colors, radii };
}

let original = generate();
let sprite = null;
let point = null;
let dirtySort = true;
let lastSort = 0;
let sortMilliseconds = 0;
const ui = {
  fps: $('#fps'), count: $('#gaussians'), frame: $('#frame-time'), explanation: $('#explanation'),
};
function createGeometry() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(original.positions.slice(), 3));
  geometry.setAttribute('aColor', new THREE.BufferAttribute(original.colors.slice(), 3));
  geometry.setAttribute('aRadius', new THREE.BufferAttribute(original.radii.slice(), 1));
  return geometry;
}
function createMaterial(pointMode) {
  return new THREE.ShaderMaterial({
    vertexShader, fragmentShader, transparent: true, depthTest: true, depthWrite: false,
    blending: THREE.NormalBlending,
    uniforms: {
      uScale: { value: state.scale }, uOpacity: { value: state.opacity },
      uPointMode: { value: pointMode }, uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) }
    }
  });
}
function rebuild() {
  original = generate();
  for (const obj of [sprite, point]) {
    if (!obj) continue;
    scene.remove(obj);
    obj.geometry.dispose();
    obj.material.dispose();
  }
  sprite = new THREE.Points(createGeometry(), createMaterial(0));
  point = new THREE.Points(createGeometry(), createMaterial(1));
  sprite.frustumCulled = false;
  point.frustumCulled = false;
  scene.add(sprite, point);
  ui.count.textContent = state.count.toLocaleString();
  dirtySort = true;
}
rebuild();

// Approximate per-primitive transparency order. Three.js sorts objects,
// but not individual points inside one THREE.Points object; we do that here.
// This is still not order-independent transparency / exact 3DGS compositing.
function sortBackToFront() {
  const start = performance.now();
  const matrix = camera.matrixWorldInverse;
  const m = matrix.elements;
  const positions = original.positions;
  const index = Array.from({ length: state.count }, (_, i) => i);
  index.sort((ia, ib) => {
    const a = ia * 3, b = ib * 3;
    const za = m[2] * positions[a] + m[6] * positions[a + 1] + m[10] * positions[a + 2] + m[14];
    const zb = m[2] * positions[b] + m[6] * positions[b + 1] + m[10] * positions[b + 2] + m[14];
    return za - zb; // More negative is farther from camera.
  });
  for (const obj of [sprite, point]) {
    const attrs = obj.geometry.attributes;
    for (let n = 0; n < index.length; n++) {
      const i = index[n];
      attrs.position.array.set(original.positions.subarray(i * 3, i * 3 + 3), n * 3);
      attrs.aColor.array.set(original.colors.subarray(i * 3, i * 3 + 3), n * 3);
      attrs.aRadius.array[n] = original.radii[i];
    }
    attrs.position.needsUpdate = true;
    attrs.aColor.needsUpdate = true;
    attrs.aRadius.needsUpdate = true;
  }
  sortMilliseconds = performance.now() - start;
  lastSort = performance.now();
  dirtySort = false;
}
function sizeRenderer() {
  const width = viewport.clientWidth;
  const height = viewport.clientHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr);
  renderer.setSize(width, height, false);
  for (const obj of [sprite, point]) obj.material.uniforms.uPixelRatio.value = dpr;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
new ResizeObserver(sizeRenderer).observe(viewport);
sizeRenderer();
controls.addEventListener('change', () => { dirtySort = true; });

function updateMode() {
  document.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('active', b.dataset.mode === state.mode));
  const split = state.mode === 'compare';
  $('#midline').style.display = split ? '' : 'none';
  $('#left-label').style.display = state.mode === 'splats' ? 'none' : '';
  $('#right-label').style.display = state.mode === 'points' ? 'none' : '';
  if (split) {
    $('#left-label').textContent = 'POINTS'; $('#right-label').textContent = 'GAUSSIAN SPLATS';
    ui.explanation.textContent = 'Both views use identical 3D positions and colors. Left: hard-edged circular points. Right: Gaussian opacity falloff, approximately sorted back-to-front for alpha blending.';
  } else if (state.mode === 'splats') {
    $('#right-label').textContent = 'GAUSSIAN SPLATS';
    ui.explanation.textContent = 'Each 3D point is drawn as a billboard. A custom fragment shader produces a soft Gaussian opacity profile, and overlapping sprites blend into a continuous-looking scene.';
  } else {
    $('#left-label').textContent = 'POINTS';
    ui.explanation.textContent = 'Conventional point sprites show the discrete geometry. Switch back to splats to see the effect of Gaussian alpha falloff and overlap.';
  }
}
updateMode();
function setLabels() {
  $('#count-value').textContent = state.count.toLocaleString();
  $('#size-value').textContent = state.scale.toFixed(2) + '×';
  $('#opacity-value').textContent = state.opacity.toFixed(2);
  $('#scene-heading').textContent = { torus: 'Twisted torus', helix: 'Double helix', sphere: 'Nebula sphere' }[state.shape];
}
setLabels();
document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => { state.mode = b.dataset.mode; updateMode(); }));
$('#shape').addEventListener('change', e => { state.shape = e.target.value; rebuild(); setLabels(); });
$('#palette').addEventListener('change', e => { state.palette = e.target.value; rebuild(); });
$('#count').addEventListener('input', e => { state.count = Number(e.target.value); setLabels(); rebuild(); });
$('#size').addEventListener('input', e => { state.scale = Number(e.target.value); setLabels(); sprite.material.uniforms.uScale.value = state.scale; point.material.uniforms.uScale.value = state.scale; });
$('#opacity').addEventListener('input', e => { state.opacity = Number(e.target.value); setLabels(); sprite.material.uniforms.uOpacity.value = state.opacity; point.material.uniforms.uOpacity.value = state.opacity; });
$('#reset').addEventListener('click', () => {
  Object.assign(state, { mode: 'compare', shape: 'torus', count: 3000, scale: 1, opacity: 0.65, palette: 'aurora' });
  for (const key of ['shape', 'count', 'size', 'opacity', 'palette']) $('#'+key).value = key === 'size' ? state.scale : state[key];
  camera.position.set(0, 5.4, 17); controls.target.set(0, 0, 0); controls.autoRotate = true; controls.update();
  rebuild(); updateMode(); setLabels();
});

// Side-by-side uses the same camera but recomputes its aspect for each half.
// Depth-sorting works in both halves because camera position/orientation match.
function renderRegion(x, width, height, obj) {
  renderer.setViewport(x, 0, width, height);
  renderer.setScissor(x, 0, width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  sprite.visible = obj === sprite;
  point.visible = obj === point;
  renderer.render(scene, camera);
}
let previous = performance.now(), frameCount = 0, accumulated = 0, smoothedFPS = 60;
function animate(now) {
  requestAnimationFrame(animate);
  const elapsed = Math.min(100, now - previous); previous = now;
  controls.update();
  camera.updateMatrixWorld();
  if (dirtySort && now - lastSort > 150) sortBackToFront();
  const w = renderer.domElement.width, h = renderer.domElement.height;
  if (!w || !h) return;
  renderer.setScissorTest(true);
  if (state.mode === 'compare') {
    const left = Math.floor(w / 2);
    renderRegion(0, left, h, point);
    renderRegion(left, w - left, h, sprite);
  } else renderRegion(0, w, h, state.mode === 'splats' ? sprite : point);
  renderer.setScissorTest(false);
  frameCount++;
  accumulated += elapsed;
  if (accumulated > 400) {
    smoothedFPS = frameCount * 1000 / accumulated;
    ui.fps.textContent = Math.round(smoothedFPS);
    ui.frame.textContent = (1000 / Math.max(1, smoothedFPS)).toFixed(1);
    $('#depth-order').textContent = 'BACK → FRONT';
    frameCount = 0; accumulated = 0;
  }
}
requestAnimationFrame(animate);
