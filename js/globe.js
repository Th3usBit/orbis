/**
 * The globe.
 *
 * Layers, outward from the centre:
 *   ocean      lit by the real subsolar point, so the terminator is accurate
 *   land dots  equal-area matrix baked by scripts/build_geometry.py
 *   borders    country outlines, deliberately faint
 *   markers    one pillar per country with events on the selected day
 *   pulses     expanding rings, only for releases inside the next hour
 *   atmosphere additive fresnel rim, brighter on the day side
 *
 * Every animated thing is driven by a number that actually changed: the sun
 * moves because time moved, a marker pulses because a release is imminent.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export const IMPACT_COLORS = {
  3: '#ff4d6d',
  2: '#ffb347',
  1: '#6c8cb5',
  0: '#8b7bd8',
};

const RADIUS = 1;
const MAX_MARKERS = 180;
const MAX_PULSES = 24;
const IDLE_BEFORE_SPIN = 4200;
const DEG = Math.PI / 180;

/* ------------------------------------------------------------------ maths */

export function latLonToVector3(lat, lon, radius = RADIUS) {
  const phi = (90 - lat) * DEG;
  const theta = (lon + 180) * DEG;
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

/**
 * Subsolar point for a moment in time: the latitude/longitude where the sun is
 * directly overhead. Declination from the day of year, longitude from UTC.
 * Accurate to well under a degree, which is far finer than a globe this size
 * can show.
 */
export function sunDirection(date) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const dayOfYear = (date.getTime() - start) / 86400000;
  const declination = -23.44 * Math.cos(((360 / 365.24) * (dayOfYear + 10)) * DEG);

  const utcHours = date.getUTCHours()
    + date.getUTCMinutes() / 60
    + date.getUTCSeconds() / 3600;
  const longitude = (12 - utcHours) * 15;

  return latLonToVector3(declination, longitude, 1).normalize();
}

/* --------------------------------------------------------------- shaders */

const OCEAN_VERT = /* glsl */`
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vPosW = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const OCEAN_FRAG = /* glsl */`
  uniform vec3 uSun;
  uniform vec3 uDay;
  uniform vec3 uNight;
  uniform vec3 uRim;
  varying vec3 vNormalW;
  varying vec3 vPosW;

  void main() {
    vec3 n = normalize(vNormalW);
    float daylight = smoothstep(-0.16, 0.32, dot(n, normalize(uSun)));
    vec3 color = mix(uNight, uDay, daylight);

    // Rim light: reads as atmosphere thickness at grazing angles.
    vec3 viewDir = normalize(cameraPosition - vPosW);
    float fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 3.2);
    color += uRim * fresnel * 0.85;

    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

const DOTS_VERT = /* glsl */`
  uniform float uSize;
  uniform float uPixelRatio;
  varying vec3 vNormalW;

  void main() {
    vNormalW = normalize((modelMatrix * vec4(position, 0.0)).xyz);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    // Normalised against the default camera distance (~3 units) so uSize reads
    // directly as "CSS pixels at rest", then grows as the viewer zooms in.
    gl_PointSize = uSize * uPixelRatio * (3.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const DOTS_FRAG = /* glsl */`
  uniform vec3 uSun;
  uniform vec3 uDay;
  uniform vec3 uNight;
  varying vec3 vNormalW;

  void main() {
    vec2 offset = gl_PointCoord - 0.5;
    float dist = dot(offset, offset);
    if (dist > 0.25) discard;

    float edge = smoothstep(0.25, 0.06, dist);
    float daylight = smoothstep(-0.18, 0.38, dot(normalize(vNormalW), normalize(uSun)));

    gl_FragColor = vec4(mix(uNight, uDay, daylight), edge);
    #include <colorspace_fragment>
  }
`;

const ATMO_VERT = /* glsl */`
  varying vec3 vNormalV;
  varying vec3 vNormalW;
  void main() {
    vNormalV = normalize(normalMatrix * normal);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const ATMO_FRAG = /* glsl */`
  uniform vec3 uColor;
  uniform vec3 uSun;
  varying vec3 vNormalV;
  varying vec3 vNormalW;

  void main() {
    float rim = pow(0.74 - dot(vNormalV, vec3(0.0, 0.0, 1.0)), 3.0);
    // The limb glows harder where the sun actually is.
    float lit = 0.45 + 0.55 * smoothstep(-0.5, 0.5, dot(normalize(vNormalW), normalize(uSun)));
    gl_FragColor = vec4(uColor, 1.0) * clamp(rim, 0.0, 1.4) * lit;
    #include <colorspace_fragment>
  }
`;

const PULSE_VERT = /* glsl */`
  attribute float aPhase;
  attribute vec3 aColor;
  uniform float uTime;
  uniform float uPixelRatio;
  varying float vPhase;
  varying vec3 vColor;

  void main() {
    vPhase = fract(uTime * 0.45 + aPhase);
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = 150.0 * uPixelRatio * (1.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const PULSE_FRAG = /* glsl */`
  varying float vPhase;
  varying vec3 vColor;

  void main() {
    float dist = length(gl_PointCoord - 0.5) * 2.0;
    float ring = smoothstep(0.10, 0.0, abs(dist - vPhase));
    float alpha = ring * (1.0 - vPhase) * 0.85;
    if (alpha < 0.01) discard;

    gl_FragColor = vec4(vColor, alpha);
    #include <colorspace_fragment>
  }
`;

/* ------------------------------------------------------------------ setup */

export async function createGlobe(canvas, handlers = {}) {
  const [landDots, borders] = await Promise.all([
    fetch('assets/land-dots.json').then((r) => r.json()),
    fetch('assets/borders.json').then((r) => r.json()),
  ]);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x05070c, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 200);
  camera.position.set(0, 0.55, 5.6);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.065;
  controls.enablePan = false;
  controls.rotateSpeed = 0.52;
  controls.zoomSpeed = 0.7;
  controls.minDistance = 1.45;
  controls.maxDistance = 6.5;
  controls.autoRotateSpeed = 0.22;

  const world = new THREE.Group();
  scene.add(world);

  const sun = { current: sunDirection(new Date()), target: sunDirection(new Date()) };

  /* --- stars ------------------------------------------------------------- */

  scene.add(buildStars());

  /* --- ocean ------------------------------------------------------------- */

  const oceanUniforms = {
    uSun: { value: sun.current.clone() },
    uDay: { value: new THREE.Color('#0d2137') },
    uNight: { value: new THREE.Color('#060b14') },
    uRim: { value: new THREE.Color('#2f6fa8') },
  };

  world.add(new THREE.Mesh(
    new THREE.SphereGeometry(RADIUS * 0.997, 96, 64),
    new THREE.ShaderMaterial({
      uniforms: oceanUniforms,
      vertexShader: OCEAN_VERT,
      fragmentShader: OCEAN_FRAG,
    }),
  ));

  /* --- land dots --------------------------------------------------------- */

  const dotUniforms = {
    uSun: { value: sun.current.clone() },
    uDay: { value: new THREE.Color('#7fd4c1') },
    uNight: { value: new THREE.Color('#25506b') },
    uSize: { value: 2.6 },
    uPixelRatio: { value: renderer.getPixelRatio() },
  };

  world.add(buildLandDots(landDots, dotUniforms));

  /* --- borders and graticule --------------------------------------------- */

  world.add(buildBorders(borders));
  world.add(buildGraticule());

  /* --- atmosphere -------------------------------------------------------- */

  const atmoUniforms = {
    uColor: { value: new THREE.Color('#3f8fd6') },
    uSun: { value: sun.current.clone() },
  };

  world.add(new THREE.Mesh(
    new THREE.SphereGeometry(RADIUS * 1.19, 64, 48),
    new THREE.ShaderMaterial({
      uniforms: atmoUniforms,
      vertexShader: ATMO_VERT,
      fragmentShader: ATMO_FRAG,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
    }),
  ));

  /* --- markers ----------------------------------------------------------- */

  const markerGeometry = new THREE.CylinderGeometry(0.0052, 0.0092, 1, 7, 1, true);
  markerGeometry.translate(0, 0.5, 0);  // pivot at the base, so scale.y grows outward

  const markers = new THREE.InstancedMesh(
    markerGeometry,
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.92 }),
    MAX_MARKERS,
  );
  markers.count = 0;
  markers.frustumCulled = false;
  world.add(markers);

  const headGeometry = new THREE.SphereGeometry(0.014, 10, 8);
  const heads = new THREE.InstancedMesh(
    headGeometry,
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }),
    MAX_MARKERS,
  );
  heads.count = 0;
  heads.frustumCulled = false;
  world.add(heads);

  /* --- pulses ------------------------------------------------------------ */

  const pulseUniforms = {
    uTime: { value: 0 },
    uPixelRatio: { value: renderer.getPixelRatio() },
  };
  const pulses = buildPulses(pulseUniforms);
  world.add(pulses);

  /* --- interaction state -------------------------------------------------- */

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const scratch = { matrix: new THREE.Matrix4(), quat: new THREE.Quaternion(), up: new THREE.Vector3(0, 1, 0) };

  let markerData = [];
  let highlighted = null;
  let hovered = null;
  let lastInteraction = performance.now();
  let flight = null;
  let intro = { t: 0, from: 5.6, to: 3.05 };
  let running = true;

  controls.addEventListener('start', () => {
    lastInteraction = performance.now();
    canvas.classList.add('is-dragging');
    intro = null;
  });
  controls.addEventListener('change', () => { lastInteraction = performance.now(); });
  controls.addEventListener('end', () => canvas.classList.remove('is-dragging'));

  /* --- marker rebuild ----------------------------------------------------- */

  function setMarkers(list) {
    markerData = list.slice(0, MAX_MARKERS);

    const colorHolder = new THREE.Color();

    markerData.forEach((marker, index) => {
      const normal = latLonToVector3(marker.lat, marker.lon, 1).normalize();
      const height = markerHeight(marker);

      scratch.quat.setFromUnitVectors(scratch.up, normal);

      scratch.matrix.compose(
        normal.clone().multiplyScalar(RADIUS * 0.998),
        scratch.quat,
        new THREE.Vector3(1, height, 1),
      );
      markers.setMatrixAt(index, scratch.matrix);

      scratch.matrix.compose(
        normal.clone().multiplyScalar(RADIUS * 0.998 + height),
        scratch.quat,
        new THREE.Vector3(1, 1, 1).multiplyScalar(marker.maxImpact >= 3 ? 1.25 : 0.85),
      );
      heads.setMatrixAt(index, scratch.matrix);

      colorHolder.set(IMPACT_COLORS[marker.maxImpact] ?? IMPACT_COLORS[1]);
      markers.setColorAt(index, colorHolder);
      heads.setColorAt(index, colorHolder);
    });

    markers.count = markerData.length;
    heads.count = markerData.length;
    markers.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
    if (markers.instanceColor) markers.instanceColor.needsUpdate = true;
    if (heads.instanceColor) heads.instanceColor.needsUpdate = true;
  }

  function markerHeight(marker) {
    if (marker.maxImpact === 0) return 0.028;
    const base = 0.035 + marker.maxImpact * 0.048;
    const density = 1 + Math.min(Math.log2(marker.count + 1) * 0.085, 0.55);
    return base * density;
  }

  /* --- pulses ------------------------------------------------------------- */

  function setPulses(list) {
    const positions = pulses.geometry.attributes.position;
    const phases = pulses.geometry.attributes.aPhase;
    const colors = pulses.geometry.attributes.aColor;
    const colorHolder = new THREE.Color();

    const take = list.slice(0, MAX_PULSES);
    take.forEach((item, index) => {
      const point = latLonToVector3(item.lat, item.lon, RADIUS * 1.004);
      positions.setXYZ(index, point.x, point.y, point.z);
      phases.setX(index, (index * 0.37) % 1);
      colorHolder.set(IMPACT_COLORS[item.impact] ?? IMPACT_COLORS[2]);
      colors.setXYZ(index, colorHolder.r, colorHolder.g, colorHolder.b);
    });

    pulses.geometry.setDrawRange(0, take.length);
    positions.needsUpdate = true;
    phases.needsUpdate = true;
    colors.needsUpdate = true;
  }

  /* --- camera ------------------------------------------------------------- */

  function focus(lat, lon, distance) {
    const target = latLonToVector3(lat, lon, 1).normalize();
    const from = camera.position.clone().normalize();

    intro = null;
    flight = {
      from,
      quaternion: new THREE.Quaternion().setFromUnitVectors(from, target),
      fromDistance: camera.position.length(),
      toDistance: distance ?? Math.min(camera.position.length(), 2.6),
      elapsed: 0,
      duration: 950,
    };
  }

  function setDate(date) {
    sun.target = sunDirection(date);
  }

  function setHighlight(code) {
    highlighted = code;
  }

  /* --- pointer ------------------------------------------------------------ */

  function updatePointer(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  function pick() {
    if (!markers.count) return null;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObject(markers, false);
    if (!hits.length) return null;
    return markerData[hits[0].instanceId] ?? null;
  }

  canvas.addEventListener('pointermove', (event) => {
    updatePointer(event);
    const marker = pick();

    if (marker !== hovered) {
      hovered = marker;
      canvas.classList.toggle('is-over-marker', Boolean(marker));
      handlers.onHover?.(marker, event.clientX, event.clientY);
    } else if (marker) {
      handlers.onHover?.(marker, event.clientX, event.clientY);
    }
  });

  canvas.addEventListener('pointerleave', () => {
    hovered = null;
    canvas.classList.remove('is-over-marker');
    handlers.onHover?.(null);
  });

  // Treat it as a click only if the pointer barely moved — dragging the globe
  // across a marker should not select it.
  let pressAt = null;
  canvas.addEventListener('pointerdown', (event) => {
    pressAt = { x: event.clientX, y: event.clientY };
  });
  canvas.addEventListener('pointerup', (event) => {
    if (!pressAt) return;
    const moved = Math.hypot(event.clientX - pressAt.x, event.clientY - pressAt.y);
    pressAt = null;
    if (moved > 5) return;

    updatePointer(event);
    const marker = pick();
    if (marker) {
      focus(marker.lat, marker.lon);
      handlers.onSelect?.(marker);
    } else {
      handlers.onSelect?.(null);
    }
  });

  /* --- resize -------------------------------------------------------------- */

  function resize() {
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    dotUniforms.uPixelRatio.value = renderer.getPixelRatio();
    pulseUniforms.uPixelRatio.value = renderer.getPixelRatio();
  }

  new ResizeObserver(resize).observe(canvas);
  resize();

  /* --- loop ---------------------------------------------------------------- */

  const clock = new THREE.Clock();

  function frame() {
    if (!running) return;
    requestAnimationFrame(frame);

    const delta = Math.min(clock.getDelta(), 0.1);
    const now = performance.now();

    // Opening move: ease the camera in from far orbit, once.
    if (intro) {
      intro.t = Math.min(intro.t + delta / 1.9, 1);
      const eased = 1 - Math.pow(1 - intro.t, 3);
      camera.position.setLength(intro.from + (intro.to - intro.from) * eased);
      if (intro.t >= 1) intro = null;
    }

    if (flight) {
      flight.elapsed += delta * 1000;
      const t = Math.min(flight.elapsed / flight.duration, 1);
      const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

      const step = new THREE.Quaternion().slerpQuaternions(
        new THREE.Quaternion(), flight.quaternion, eased,
      );
      const distance = flight.fromDistance + (flight.toDistance - flight.fromDistance) * eased;
      camera.position.copy(flight.from.clone().applyQuaternion(step).multiplyScalar(distance));

      if (t >= 1) flight = null;
      lastInteraction = now;
    }

    // Idle spin, suspended whenever the viewer is doing something.
    controls.autoRotate = !flight && !intro && !highlighted && !hovered
      && (now - lastInteraction > IDLE_BEFORE_SPIN);

    // Ease the sun toward its target so scrubbing days sweeps the terminator.
    sun.current.lerp(sun.target, Math.min(delta * 2.6, 1)).normalize();
    oceanUniforms.uSun.value.copy(sun.current);
    dotUniforms.uSun.value.copy(sun.current);
    atmoUniforms.uSun.value.copy(sun.current);

    pulseUniforms.uTime.value = clock.elapsedTime;

    controls.update();
    renderer.render(scene, camera);
  }

  frame();

  return {
    setMarkers,
    setPulses,
    setDate,
    setHighlight,
    focus,
    resize,
    dispose() {
      running = false;
      controls.dispose();
      renderer.dispose();
    },
  };
}

/* -------------------------------------------------------------- factories */

function buildStars() {
  const count = 2600;
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);

  for (let i = 0; i < count; i += 1) {
    // Uniform on a sphere: acos gives an even latitude distribution.
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const radius = 28 + Math.random() * 42;

    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = radius * Math.cos(phi);
    sizes[i] = Math.random();
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

  return new THREE.Points(geometry, new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */`
      attribute float aSize;
      varying float vSize;
      void main() {
        vSize = aSize;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = (0.7 + aSize * 1.7) * (110.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */`
      varying float vSize;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        float alpha = smoothstep(0.5, 0.1, d) * (0.18 + vSize * 0.5);
        gl_FragColor = vec4(vec3(0.78, 0.85, 1.0), alpha);
        #include <colorspace_fragment>
      }
    `,
  }));
}

function buildLandDots(data, uniforms) {
  const { scale, lon, lat } = data;
  const positions = new Float32Array(lon.length * 3);

  for (let i = 0; i < lon.length; i += 1) {
    const point = latLonToVector3(lat[i] / scale, lon[i] / scale, RADIUS);
    positions[i * 3] = point.x;
    positions[i * 3 + 1] = point.y;
    positions[i * 3 + 2] = point.z;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  return new THREE.Points(geometry, new THREE.ShaderMaterial({
    uniforms,
    vertexShader: DOTS_VERT,
    fragmentShader: DOTS_FRAG,
    transparent: true,
    depthWrite: false,
  }));
}

function buildBorders(data) {
  const { scale, lines } = data;
  const vertices = [];

  for (const flat of lines) {
    const count = flat.length / 2;
    for (let i = 0; i < count - 1; i += 1) {
      const a = latLonToVector3(flat[i * 2 + 1] / scale, flat[i * 2] / scale, RADIUS * 1.0015);
      const b = latLonToVector3(flat[i * 2 + 3] / scale, flat[i * 2 + 2] / scale, RADIUS * 1.0015);
      vertices.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));

  return new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({
    color: new THREE.Color('#5d86ad'),
    transparent: true,
    opacity: 0.19,
    depthWrite: false,
  }));
}

function buildGraticule() {
  const vertices = [];
  const step = 2;

  for (let lonLine = -180; lonLine < 180; lonLine += 30) {
    for (let latAt = -80; latAt < 80; latAt += step) {
      const a = latLonToVector3(latAt, lonLine, RADIUS * 1.0008);
      const b = latLonToVector3(latAt + step, lonLine, RADIUS * 1.0008);
      vertices.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
  }

  for (const latLine of [-60, -30, 0, 30, 60]) {
    for (let lonAt = -180; lonAt < 180; lonAt += step) {
      const a = latLonToVector3(latLine, lonAt, RADIUS * 1.0008);
      const b = latLonToVector3(latLine, lonAt + step, RADIUS * 1.0008);
      vertices.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));

  return new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({
    color: new THREE.Color('#4a6f96'),
    transparent: true,
    opacity: 0.07,
    depthWrite: false,
  }));
}

function buildPulses(uniforms) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_PULSES * 3), 3));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(new Float32Array(MAX_PULSES), 1));
  geometry.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(MAX_PULSES * 3), 3));
  geometry.setDrawRange(0, 0);

  const points = new THREE.Points(geometry, new THREE.ShaderMaterial({
    uniforms,
    vertexShader: PULSE_VERT,
    fragmentShader: PULSE_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  points.frustumCulled = false;

  return points;
}
