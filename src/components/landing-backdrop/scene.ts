import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { chipAngle, renderPixelRatio, viewHeight } from "./motion";
import { CARD_BELT_OUTER_RADIUS, createDistantCards } from "./cards";

// Tone mapping, display conversion and film effects share one fullscreen pass.
// Grain is added in display space so it survives in the darkest parts of the image.
const filmShader = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float time;
    varying vec2 vUv;
    float noise(vec2 p) {
      return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
    }
    void main() {
      vec2 radial = vUv - 0.5;
      vec2 fringe = radial * dot(radial, radial) * 0.003;
      vec3 color = vec3(
        texture2D(tDiffuse, vUv + fringe).r,
        texture2D(tDiffuse, vUv).g,
        texture2D(tDiffuse, vUv - fringe).b
      );
      color *= 1.0 + 0.018 * sin(time * 0.43) + 0.008 * sin(time * 0.79);
      color = ACESFilmicToneMapping(color);
      color = sRGBTransferOETF(vec4(color, 1.0)).rgb;
      float vignette = 1.0 - 0.78 * smoothstep(0.12, 0.68, length(radial));
      color *= vignette;
      float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
      float grain = noise(gl_FragCoord.xy + mod(floor(time * 24.0), 4096.0) * vec2(17.0, 31.0)) - 0.5;
      color += grain * mix(0.075, 0.022, smoothstep(0.0, 0.6, luminance));
      gl_FragColor = vec4(max(color, 0.0), 1.0);
    }
  `,
};

function maskShape(laughing: boolean) {
  const shape = new THREE.Shape();
  // Broad temples, hollow cheeks and a tapered chin: a theatrical mask silhouette.
  shape.moveTo(0, 0.91);
  shape.bezierCurveTo(0.3, 0.96, 0.64, 0.84, 0.68, 0.58);
  shape.bezierCurveTo(0.76, 0.2, 0.55, -0.38, 0.3, -0.72);
  shape.bezierCurveTo(0.12, -0.95, -0.12, -0.95, -0.3, -0.72);
  shape.bezierCurveTo(-0.55, -0.38, -0.76, 0.2, -0.68, 0.58);
  shape.bezierCurveTo(-0.64, 0.84, -0.3, 0.96, 0, 0.91);

  for (const side of [-1, 1]) {
    const eye = new THREE.Path();
    if (laughing) {
      eye.moveTo(side * 0.13, 0.27);
      eye.quadraticCurveTo(side * 0.32, 0.56, side * 0.53, 0.3);
      eye.quadraticCurveTo(side * 0.32, 0.39, side * 0.13, 0.27);
    } else {
      eye.moveTo(side * 0.12, 0.37);
      eye.quadraticCurveTo(side * 0.3, 0.23, side * 0.53, 0.22);
      eye.quadraticCurveTo(side * 0.38, 0.06, side * 0.16, 0.19);
      eye.closePath();
    }
    shape.holes.push(eye);
  }

  const mouth = new THREE.Path();
  if (laughing) {
    mouth.moveTo(-0.43, -0.18);
    mouth.quadraticCurveTo(0, -0.36, 0.43, -0.18);
    mouth.bezierCurveTo(0.31, -0.79, -0.31, -0.79, -0.43, -0.18);
  } else {
    mouth.moveTo(-0.39, -0.55);
    mouth.quadraticCurveTo(0, -0.04, 0.39, -0.55);
    mouth.quadraticCurveTo(0, -0.32, -0.39, -0.55);
  }
  shape.holes.push(mouth);
  return shape;
}

export function mountBackdrop(host: HTMLDivElement): () => void {
  const canvas = document.createElement("canvas");
  let renderer: THREE.WebGLRenderer;
  try {
    const context = canvas.getContext("webgl2", { alpha: false, antialias: false, powerPreference: "low-power" });
    if (!context) return () => {};
    renderer = new THREE.WebGLRenderer({ canvas, context, antialias: false });
  } catch {
    return () => {};
  }

  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const scene = new THREE.Scene();
  let composer: EffectComposer | undefined;
  let frame = 0;
  let disposed = false;
  const cleanups: (() => void)[] = [];
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frame);
    cleanups.forEach((cleanup) => cleanup());
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    scene.traverse((object) => {
      if (object instanceof THREE.DirectionalLight || object instanceof THREE.SpotLight) {
        object.shadow.dispose();
      }
    });
    composer?.passes.forEach((pass) => pass.dispose());
    // Includes both render-target textures and the composer's internal copy pass.
    composer?.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    canvas.remove();
  };

  try {
    const geometry = <T extends THREE.BufferGeometry>(value: T): T => { geometries.add(value); return value; };
    const material = <T extends THREE.Material>(value: T): T => { materials.add(value); return value; };
    const mesh = (parent: THREE.Object3D, shape: THREE.BufferGeometry, surface: THREE.Material) => {
      const object = new THREE.Mesh(geometry(shape), surface);
      object.castShadow = true;
      object.receiveShadow = true;
      parent.add(object);
      return object;
    };
    const merged = (parts: THREE.BufferGeometry[]) => {
      const result = mergeGeometries(parts);
      parts.forEach((part) => part.dispose());
      if (!result) throw new Error("Cannot merge chip geometry");
      return result;
    };

    const palette = getComputedStyle(host);
    const color = (name: string) => palette.getPropertyValue(name).trim();
    scene.background = new THREE.Color(color("--background"));
    scene.fog = new THREE.FogExp2(color("--background"), 0.045);
    const camera = new THREE.OrthographicCamera(-4, 4, 3, -3, 0.1, 40);
    camera.position.set(0, 0, 10);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.6;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    canvas.style.cssText = "display:block;width:100%;height:100%;";

    const red = material(new THREE.MeshStandardMaterial({ color: color("--chip-red"), roughness: 0.43, metalness: 0.25 }));
    const gold = material(new THREE.MeshStandardMaterial({ color: color("--gold"), roughness: 0.32, metalness: 0.7 }));
    const ivory = material(new THREE.MeshStandardMaterial({ color: color("--card"), roughness: 0.42, metalness: 0.35 }));
    const edge = material(new THREE.MeshStandardMaterial({ color: color("--chip-red"), roughness: 0.65, metalness: 0.15 }));
    const chip = new THREE.Group();
    chip.scale.setScalar(1.5);
    const stage = new THREE.Group();
    stage.add(chip);
    scene.add(stage);

    const disk = new THREE.Shape();
    disk.absarc(0, 0, 1.94, 0, Math.PI * 2, false);
    const body = new THREE.ExtrudeGeometry(disk, { depth: 0.27, bevelEnabled: true, bevelSize: 0.055, bevelThickness: 0.04, bevelSegments: 3, steps: 1, curveSegments: 48 });
    body.translate(0, 0, -0.135);
    mesh(chip, body, edge);

    const spotParts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 12; i++) {
      const angle = i * Math.PI / 6;
      for (const z of [-0.181, 0.181]) {
        const spot = new THREE.RingGeometry(1.69, 1.947, 5, 1, angle - 0.072, 0.144);
        if (z < 0) spot.rotateY(Math.PI);
        spot.translate(0, 0, z);
        spotParts.push(spot);
      }
      const side = new THREE.CylinderGeometry(1.997, 1.997, 0.26, 5, 1, true, angle + Math.PI / 2 - 0.072, 0.144);
      side.rotateX(Math.PI / 2);
      spotParts.push(side);
    }
    mesh(chip, merged(spotParts), ivory);

    for (const [index, laughing] of [true, false].entries()) {
      const face = new THREE.Group();
      face.rotation.y = index * Math.PI;
      chip.add(face);
      const inset = mesh(face, new THREE.CircleGeometry(1.61, 80), red);
      inset.position.z = 0.18;
      const rings = [1.58, 1.47].map((radius) => {
        const ring = new THREE.TorusGeometry(radius, radius === 1.58 ? 0.025 : 0.009, 6, 80);
        ring.translate(0, 0, 0.2);
        return ring;
      });
      mesh(face, merged(rings), gold);

      const relief = new THREE.ExtrudeGeometry(maskShape(laughing), { depth: 0.065, bevelEnabled: true, bevelSize: 0.035, bevelThickness: 0.035, bevelSegments: 3, curveSegments: 16, steps: 1 });
      relief.scale(1.25, 1.25, 1);
      relief.translate(0, 0, 0.205);
      mesh(face, relief, ivory);

      // Raised brows and a sculpted nose catch the key light above the cutouts.
      const details: THREE.BufferGeometry[] = [];
      for (const side of [-1, 1]) {
        const brow = new THREE.Shape();
        brow.moveTo(side * 0.12, laughing ? 0.56 : 0.59);
        brow.quadraticCurveTo(side * 0.34, laughing ? 0.77 : 0.42, side * 0.54, laughing ? 0.52 : 0.37);
        brow.quadraticCurveTo(side * 0.35, laughing ? 0.67 : 0.5, side * 0.12, laughing ? 0.61 : 0.65);
        const raised = new THREE.ExtrudeGeometry(brow, { depth: 0.025, bevelSize: 0.016, bevelThickness: 0.018, bevelSegments: 2, curveSegments: 12 });
        raised.scale(1.25, 1.25, 1);
        raised.translate(0, 0, 0.308);
        details.push(raised);
        if (!laughing) {
          const tear = new THREE.Shape();
          tear.moveTo(side * 0.44, 0.06);
          tear.bezierCurveTo(side * 0.39, -0.08, side * 0.32, -0.2, side * 0.42, -0.22);
          tear.bezierCurveTo(side * 0.55, -0.21, side * 0.46, -0.04, side * 0.44, 0.06);
          const drop = new THREE.ExtrudeGeometry(tear, { depth: 0.02, bevelSize: 0.012, bevelThickness: 0.018, bevelSegments: 2, curveSegments: 10 });
          drop.scale(1.25, 1.25, 1);
          drop.translate(0, 0, 0.312);
          mesh(face, drop, gold);
        }
      }
      mesh(face, merged(details), ivory);
      const nose = mesh(face, new THREE.SphereGeometry(1, 12, 8), ivory);
      nose.scale.set(0.09, 0.23, 0.12);
      nose.position.set(0, 0.12, 0.3);
    }

    scene.add(new THREE.AmbientLight(color("--felt"), 0.65));
    const key = new THREE.SpotLight(0xffd19a, 85, 25, 0.48, 0.65, 2);
    key.position.set(-3, 5, 3);
    key.castShadow = true;
    key.shadow.mapSize.set(512, 512);
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 15;
    key.shadow.normalBias = 0.008;
    key.shadow.bias = -0.0002;
    stage.add(key, key.target);
    const rim = new THREE.DirectionalLight(color("--chip-blue"), 6);
    rim.position.set(3, 1, -3);
    stage.add(rim, rim.target);
    const bounce = new THREE.DirectionalLight(0x698bc1, 0.3);
    bounce.position.set(2, -1, 3);
    stage.add(bounce, bounce.target);

    const dustPositions = new Float32Array(90 * 3);
    for (let i = 0; i < dustPositions.length; i += 3) {
      // Deterministic positions also keep reduced-motion stills consistent.
      dustPositions[i] = Math.sin(i * 127.1) * 5;
      dustPositions[i + 1] = Math.cos(i * 311.7) * 4;
      dustPositions[i + 2] = Math.sin(i * 74.7) * 2 - 1;
    }
    const dustGeometry = geometry(new THREE.BufferGeometry());
    dustGeometry.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
    const dustMaterial = material(new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { time: { value: 0 }, pixelRatio: { value: 1 } },
      vertexShader: /* glsl */ `
        uniform float time;
        uniform float pixelRatio;
        varying float lightAmount;
        void main() {
          vec3 p = position;
          p.y = mod(p.y + 4.0 + time * 0.022, 8.0) - 4.0;
          p.x += sin(time * 0.09 + p.y) * 0.12;
          lightAmount = exp(-pow((p.x + p.y * 0.6 + 0.6) * 0.8, 2.0)) * 0.23;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = (1.5 + fract(position.x * 12.0) * 1.5) * pixelRatio;
        }
      `,
      fragmentShader: /* glsl */ `
        varying float lightAmount;
        void main() {
          float alpha = (1.0 - smoothstep(0.12, 0.5, length(gl_PointCoord - 0.5))) * lightAmount;
          gl_FragColor = vec4(0.8, 0.65, 0.42, alpha);
        }
      `,
    }));
    scene.add(new THREE.Points(dustGeometry, dustMaterial));

    const cards = createDistantCards(color("--card"), color("--chip-red"), color("--chip-blue"));
    stage.add(cards.group);
    cleanups.push(cards.dispose);

    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const film = new ShaderPass(filmShader);
    composer.addPass(film);
    const pipeline = composer;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let elapsed = 0;
    let previous = 0;
    let contextLost = false;
    let beltOuterRadius = CARD_BELT_OUTER_RADIUS;

    const draw = () => {
      chip.rotation.set(0.045 + Math.sin(elapsed * 0.31) * 0.018, chipAngle(elapsed), -0.075 + Math.sin(elapsed * 0.23) * 0.018);
      chip.position.y = Math.sin(elapsed * 0.55) * 0.16;
      film.uniforms.time.value = elapsed;
      dustMaterial.uniforms.time.value = elapsed;
      cards.update(elapsed, beltOuterRadius);
      pipeline.render();
    };
    const tick = (now: number) => {
      frame = 0;
      if (disposed || document.hidden || contextLost || motion.matches) return;
      // A slow decorative scene needs only 30fps, regardless of display refresh.
      if (now - previous >= 1000 / 30) {
        elapsed += previous ? Math.min((now - previous) / 1000, 0.1) : 0;
        previous = now;
        draw();
      }
      frame = requestAnimationFrame(tick);
    };
    const syncPlayback = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      previous = 0;
      if (disposed || document.hidden || contextLost) return;
      if (motion.matches) { elapsed = 0; cards.clearPointer(); }
      draw();
      if (!motion.matches) frame = requestAnimationFrame(tick);
    };
    const placeStage = () => {
      // The full-viewport canvas follows a reserved layout slot, keeping the
      // decoration beside the copy on desktop and above it on small screens.
      const slot = host.parentElement!.getBoundingClientRect();
      const worldPerPixel = (camera.top * 2) / Math.max(1, host.clientHeight);
      // Let the wider belt use the desktop gutter, while reserving room for
      // card corners and pointer repulsion at either side of the viewport.
      const horizontalRoom = slot.width + (host.clientWidth >= 1024 ? 48 : 0);
      const scale = Math.min(slot.height * 0.92 / 7.4, horizontalRoom * 0.98 / 10.6) * worldPerPixel;
      stage.scale.setScalar(scale);
      const desktop = host.clientWidth >= 1024;
      const centerX = desktop ? host.clientWidth * 0.69 : slot.left + slot.width / 2;
      stage.position.set(
        (centerX - host.clientWidth / 2) * worldPerPixel,
        (host.clientHeight / 2 - slot.top - slot.height / 2) * worldPerPixel,
        0,
      );
      // Both objects share the same center and world scale. On small screens,
      // reduce only the outer radius to fit; the inner radius remains 3.2.
      beltOuterRadius = desktop ? CARD_BELT_OUTER_RADIUS : 4.45;
      key.intensity = 85 * scale ** 2;
      key.shadow.camera.near = 0.5 * scale;
      key.shadow.camera.far = 15 * scale;
      key.shadow.normalBias = 0.008 * scale;
    };
    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      const aspect = width / height;
      const halfHeight = viewHeight(aspect) / 2;
      camera.left = -halfHeight * aspect;
      camera.right = halfHeight * aspect;
      camera.top = halfHeight;
      camera.bottom = -halfHeight;
      camera.updateProjectionMatrix();
      placeStage();
      const ratio = renderPixelRatio(width, height, window.devicePixelRatio || 1);
      renderer.setPixelRatio(ratio);
      renderer.setSize(width, height, false);
      pipeline.setPixelRatio(ratio);
      pipeline.setSize(width, height);
      dustMaterial.uniforms.pixelRatio.value = ratio;
      syncPlayback();
    };
    const onContextLost = (event: Event) => {
      event.preventDefault();
      contextLost = true;
      canvas.style.visibility = "hidden";
      syncPlayback();
    };
    const onContextRestored = () => {
      contextLost = false;
      canvas.style.visibility = "visible";
      resize();
    };
    const onScroll = () => {
      placeStage();
      if (motion.matches && !document.hidden && !contextLost) draw();
    };
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let lastPointer = 0;
    const onPointerMove = (event: PointerEvent) => {
      if (motion.matches || document.hidden || event.pointerType === "touch") return;
      const now = performance.now();
      if (now - lastPointer < 25) return;
      lastPointer = now;
      pointer.set(event.clientX / host.clientWidth * 2 - 1, 1 - event.clientY / host.clientHeight * 2);
      raycaster.setFromCamera(pointer, camera);
      cards.setPointer(raycaster.ray);
    };
    const clearPointer = () => cards.clearPointer();
    document.addEventListener("visibilitychange", syncPlayback);
    motion.addEventListener("change", syncPlayback);
    window.addEventListener("resize", resize);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("blur", clearPointer);
    document.documentElement.addEventListener("pointerleave", clearPointer);
    canvas.addEventListener("webglcontextlost", onContextLost);
    canvas.addEventListener("webglcontextrestored", onContextRestored);
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    observer.observe(host.parentElement!);
    cleanups.push(() => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", syncPlayback);
      motion.removeEventListener("change", syncPlayback);
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("blur", clearPointer);
      document.documentElement.removeEventListener("pointerleave", clearPointer);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      canvas.removeEventListener("webglcontextrestored", onContextRestored);
    });
    host.appendChild(canvas);
    resize();
    return dispose;
  } catch {
    dispose();
    return () => {};
  }
}
