// Runs inside headless Chromium. Exposes window.baker for bake.mjs to drive.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const canvas = document.getElementById('c');
let renderer, scene, camera, pivot, inner, mixer, clips = [], mats = [];
const cfg = { elevation: 38, env: 0.22, ambient: 0.35, key: 2.4, rim: 2.0, fill: 0.25, exposure: 1.0 };

function setupLights() {
  scene.add(new THREE.AmbientLight(0x2a2c3a, cfg.ambient * Math.PI));
  // low warm key from front-left, high enough to model the form
  const key = new THREE.DirectionalLight(0xffa866, cfg.key);
  key.position.set(-4, 5, 4); scene.add(key);
  // cool rim from behind-right so the silhouette separates from dark ground
  const rim = new THREE.DirectionalLight(0x5f8fff, cfg.rim);
  rim.position.set(4, 3.5, -5); scene.add(rim);
  // faint warm bounce from below (ground glow, e.g. furnaces)
  const fill = new THREE.DirectionalLight(0xff6a2a, cfg.fill);
  fill.position.set(1, -2, 3); scene.add(fill);
}

window.baker = {
  async init(opts = {}) {
    Object.assign(cfg, opts);
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, preserveDrawingBuffer: true, premultipliedAlpha: false });
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = cfg.exposure;
    renderer.setClearColor(0x000000, 0);
    scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = cfg.env;
    setupLights();
    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      version: gl.getParameter(gl.VERSION),
    };
  },

  // Loads a GLB, centres it on the feet (bind pose) and returns clip list + bounds.
  async load(url) {
    if (pivot) { scene.remove(pivot); pivot.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
    const gltf = await new GLTFLoader().loadAsync(url);
    inner = new THREE.Group(); inner.add(gltf.scene);
    pivot = new THREE.Group(); pivot.add(inner); scene.add(pivot);
    gltf.scene.traverse(o => { if (o.isMesh) { o.frustumCulled = false; } });
    mixer = new THREE.AnimationMixer(gltf.scene);
    clips = gltf.animations;
    pivot.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(gltf.scene, true);
    const c = box.getCenter(new THREE.Vector3());
    inner.position.set(-c.x, -box.min.y, -c.z);
    return {
      clips: clips.map(a => ({ name: a.name, duration: a.duration })),
      size: box.getSize(new THREE.Vector3()).toArray(),
      skinned: !!gltf.parser.json.skins,
    };
  },

  // Bounding box (metres, centred on feet) of the model at a given pose.
  poseBox(clipName, t) {
    this._pose(clipName, t); pivot.rotation.y = 0; pivot.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(pivot, true);
    return { min: b.min.toArray(), max: b.max.toArray() };
  },

  _pose(clipName, t) {
    if (!mixer) return;
    mixer.stopAllAction();
    if (clipName) {
      const clip = clips.find(c => c.name === clipName);
      const a = mixer.clipAction(clip); a.play(); mixer.setTime(t);
    }
    pivot.updateMatrixWorld(true);
  },

  _draw({ clip, t, yawDeg, size, ppm, anchorY, anchorX, ss }) {
    this._pose(clip, t);
    pivot.rotation.y = yawDeg * Math.PI / 180;
    const W = size * ss;
    renderer.setSize(W, W, false);
    const el = cfg.elevation * Math.PI / 180;
    const d = 100;
    camera.position.set(0, Math.sin(el) * d, Math.cos(el) * d);
    camera.up.set(0, 1, 0); camera.lookAt(0, 0, 0);
    camera.left = -anchorX / ppm; camera.right = (size - anchorX) / ppm;
    camera.top = anchorY / ppm; camera.bottom = -(size - anchorY) / ppm;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    const gl = renderer.getContext();
    const buf = new Uint8Array(W * W * 4);
    gl.readPixels(0, 0, W, W, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    return { buf, W };
  },

  // Alpha bounds [minx, miny, maxx, maxy] (inclusive, px of the size x size frame) or null if empty.
  measure(p) {
    p.ss = 1;
    const { buf, W } = this._draw(p);
    let x0 = W, y0 = W, x1 = -1, y1 = -1;
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      if (buf[(y * W + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 < 0) return null;
    return [x0, W - 1 - y1, x1, W - 1 - y0]; // GL rows are bottom-up
  },

  // Render one frame; returns base64 RGBA (straight alpha), (size*ss)^2 px, rows top-down.
  render(p) {
    const { buf, W } = this._draw(p);
    const row = W * 4, out = new Uint8Array(buf.length);
    for (let y = 0; y < W; y++) out.set(buf.subarray((W - 1 - y) * row, (W - y) * row), y * row);
    let s = '';
    for (let i = 0; i < out.length; i += 0x8000) s += String.fromCharCode.apply(null, out.subarray(i, i + 0x8000));
    return btoa(s);
  },
};
window.bakerReady = true;
