import * as THREE from "three";

const SKY_VERTEX = `
  varying vec3 vWorldPosition;
  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const SKY_FRAGMENT = `
  uniform vec3 uZenithColor;
  uniform vec3 uHorizonColor;
  uniform vec3 uGlowColor;
  uniform vec3 uSunDir;
  uniform float uGlowStrength;
  varying vec3 vWorldPosition;

  void main() {
    vec3 dir = normalize(vWorldPosition);
    float h = clamp(dir.y, 0.0, 1.0);
    vec3 sky = mix(uHorizonColor, uZenithColor, pow(h, 0.52));

    float sunDot = max(dot(dir, normalize(uSunDir)), 0.0);
    float horizonMask = exp(-abs(dir.y) * 5.0);
    float glow = pow(sunDot, 5.0) * horizonMask * uGlowStrength;
    float tightGlow = pow(sunDot, 28.0) * uGlowStrength * 0.65;
    sky += uGlowColor * (glow + tightGlow);

    gl_FragColor = vec4(sky, 1.0);
  }
`;

const OCEAN_VERTEX = `
  uniform float uTime;
  varying vec3 vWorldPos;
  varying float vWaveHeight;

  void main() {
    vec3 pos = position;
    float shoreDamp = smoothstep(4.5, -18.0, pos.z);
    float w1 = sin(pos.x * 0.14 + uTime * 1.15) * cos(pos.z * 0.18 + uTime * 0.9);
    float w2 = sin(pos.x * 0.31 - uTime * 1.6 + pos.z * 0.24) * 0.45;
    float w3 = cos(pos.z * 0.55 + uTime * 2.1 + pos.x * 0.08) * 0.2;
    float height = (w1 * 0.38 + w2 * 0.22 + w3 * 0.12) * shoreDamp;
    pos.y += height;
    vWaveHeight = height;
    vec4 worldPos = modelMatrix * vec4(pos, 1.0);
    vWorldPos = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const OCEAN_FRAGMENT = `
  uniform float uTime;
  uniform vec3 uCameraPos;
  uniform vec3 uDeepColor;
  uniform vec3 uShallowColor;
  uniform vec3 uSkyHorizon;
  uniform vec3 uBodyDir;
  uniform vec3 uSpecularColor;
  uniform float uSpecularPower;
  uniform float uSpecularIntensity;

  varying vec3 vWorldPos;
  varying float vWaveHeight;

  void main() {
    // Analytical ripple normal
    float shoreDamp = smoothstep(4.5, -12.0, vWorldPos.z);
    float nx = cos(vWorldPos.x * 0.42 + uTime * 1.7) * 0.08
             + sin(vWorldPos.x * 0.85 - vWorldPos.z * 0.6 + uTime * 2.3) * 0.04;
    float nz = sin(vWorldPos.z * 0.52 + uTime * 1.9) * 0.11
             + cos(vWorldPos.z * 1.1 + uTime * 2.7 + vWorldPos.x * 0.25) * 0.05;
    vec3 N = normalize(vec3(-nx * shoreDamp, 1.0, -nz * shoreDamp));

    vec3 V = normalize(uCameraPos - vWorldPos);
    vec3 L = normalize(uBodyDir);
    vec3 H = normalize(L + V);

    float fresnel = pow(1.0 - max(dot(N, V), 0.0), 4.0);
    float depthFactor = clamp((-vWorldPos.z) / 38.0, 0.0, 1.0);
    vec3 waterBase = mix(uShallowColor, uDeepColor, pow(depthFactor, 0.65));
    vec3 color = mix(waterBase, uSkyHorizon, clamp(fresnel * 0.82, 0.0, 0.9));

    // Specular sun/moon path on water
    float spec = pow(max(dot(N, H), 0.0), uSpecularPower) * uSpecularIntensity;
    color += uSpecularColor * spec;

    // Gentle organic shoreline foam near z = 0..2.2
    float surfWave = sin(vWorldPos.x * 0.14 + uTime * 1.25) * 0.65 + cos(vWorldPos.x * 0.31 - uTime * 0.85) * 0.3;
    float distToShore = vWorldPos.z + surfWave * 0.55;
    float foamBand = smoothstep(-2.0, 0.3, distToShore) * (1.0 - smoothstep(0.5, 1.9, distToShore));
    float foamNoise = 0.5 + 0.25 * sin(vWorldPos.x * 0.9 + vWorldPos.z * 1.7 + uTime * 1.6)
                          + 0.25 * cos(vWorldPos.x * 2.1 - vWorldPos.z * 2.4 - uTime * 2.1);
    float foam = clamp(foamBand * smoothstep(0.25, 0.85, foamNoise), 0.0, 1.0);
    color = mix(color, vec3(0.88, 0.93, 0.97) * (0.38 + 0.62 * clamp(uSpecularIntensity, 0.25, 1.0)), foam * 0.58);

    // Distance horizon haze blend
    float distFade = smoothstep(55.0, 165.0, length(vWorldPos.xz));
    color = mix(color, uSkyHorizon, distFade * 0.92);

    gl_FragColor = vec4(color, 0.96);
  }
`;

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

function createGlowTexture(innerColor, midColor, size = 256) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const r = size / 2;
  const grad = ctx.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0.0, innerColor);
  grad.addColorStop(0.32, midColor);
  grad.addColorStop(1.0, "rgba(0,0,0,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createMoonTexture(size = 256) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const r = size / 2;

  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.beginPath();
  ctx.arc(r, r, r * 0.86, 0, Math.PI * 2);
  ctx.clip();

  const base = ctx.createRadialGradient(r * 0.85, r * 0.8, r * 0.1, r, r, r * 0.9);
  base.addColorStop(0, "#f8fafc");
  base.addColorStop(0.7, "#dbe6f4");
  base.addColorStop(1, "#9fb4ce");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  // Subtle lunar maria
  const craters = [
    [0.38, 0.36, 0.16, 0.18],
    [0.58, 0.44, 0.13, 0.15],
    [0.44, 0.62, 0.19, 0.13],
    [0.65, 0.66, 0.09, 0.14],
    [0.32, 0.54, 0.08, 0.11]
  ];
  for (const [cx, cy, cr, alpha] of craters) {
    ctx.fillStyle = `rgba(95, 114, 145, ${alpha})`;
    ctx.beginPath();
    ctx.arc(cx * size, cy * size, cr * size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createSandTexture(size = 512) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#c8b08a";
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 4000; i++) {
    const x = (Math.sin(i * 12.9898) * 43758.5453 % 1 + 1) % 1 * size;
    const y = (Math.sin(i * 78.233) * 19341.123 % 1 + 1) % 1 * size;
    const shade = i % 3 === 0 ? "rgba(255,244,218,0.16)" : "rgba(92,70,45,0.14)";
    ctx.fillStyle = shade;
    ctx.fillRect(x, y, 2, 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(16, 10);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createCloudPuffTexture(size = 256) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const r = size / 2;
  const grad = ctx.createRadialGradient(r, r * 0.92, r * 0.1, r, r, r);
  grad.addColorStop(0.0, "rgba(255,255,255,0.92)");
  grad.addColorStop(0.55, "rgba(241,245,249,0.58)");
  grad.addColorStop(1.0, "rgba(255,255,255,0.0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function sandHeightAt(x, z) {
  // Smooth shoreline slope: below water at z < 0, rising gently to dry beach at z > 2
  const baseSlope = z < 0 ? z * 0.14 : Math.pow(z, 0.88) * 0.125;
  const dune = Math.sin(x * 0.13 + z * 0.08) * 0.18 + Math.cos(x * 0.06 - z * 0.11) * 0.15;
  const shoreFlatten = smoothstep(-2.0, 5.5, z);
  return baseSlope + dune * shoreFlatten - 0.18;
}

export function initSouthBeachScene(canvas, onTelemetry) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance"
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth < 860 ? 1.5 : 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();

  // Camera faces SOUTH (-Z). Left = EAST (-X), Right = WEST (+X).
  const camera = new THREE.PerspectiveCamera(54, window.innerWidth / window.innerHeight, 0.2, 420);
  const baseCamPos = new THREE.Vector3(0, 3.3, 14.8);
  const baseLookAt = new THREE.Vector3(0, 2.1, -35.0);
  camera.position.copy(baseCamPos);
  camera.lookAt(baseLookAt);

  // Lighting
  const hemiLight = new THREE.HemisphereLight(0x8ecae6, 0x3b2f26, 0.75);
  scene.add(hemiLight);

  const celestialLight = new THREE.DirectionalLight(0xfff1d6, 1.6);
  scene.add(celestialLight);

  // 1. Sky Dome
  const skyUniforms = {
    uZenithColor: { value: new THREE.Color(0x1d6fb8) },
    uHorizonColor: { value: new THREE.Color(0x9ad8f5) },
    uGlowColor: { value: new THREE.Color(0xffb76b) },
    uSunDir: { value: new THREE.Vector3(-0.5, 0.3, -0.8) },
    uGlowStrength: { value: 0.7 }
  };
  const skyDome = new THREE.Mesh(
    new THREE.SphereGeometry(280, 48, 32),
    new THREE.ShaderMaterial({
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      uniforms: skyUniforms,
      side: THREE.BackSide,
      depthWrite: false
    })
  );
  scene.add(skyDome);

  // 2. Twinkling Night Stars
  const starCount = 1350;
  const starPositions = new Float32Array(starCount * 3);
  const starColors = new Float32Array(starCount * 3);
  const starPalette = [
    new THREE.Color(0xffffff),
    new THREE.Color(0xcfe8ff),
    new THREE.Color(0xffe7c2)
  ];
  for (let i = 0; i < starCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(0.06 + Math.random() * 0.94);
    const radius = 235;
    starPositions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    starPositions[i * 3 + 1] = radius * Math.cos(phi);
    starPositions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);

    const c = starPalette[i % starPalette.length];
    starColors[i * 3] = c.r;
    starColors[i * 3 + 1] = c.g;
    starColors[i * 3 + 2] = c.b;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
  starGeo.setAttribute("color", new THREE.BufferAttribute(starColors, 3));
  const starMat = new THREE.PointsMaterial({
    size: 1.55,
    vertexColors: true,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
    fog: false
  });
  const stars = new THREE.Points(starGeo, starMat);
  scene.add(stars);

  // 3. Sun & Moon Celestial Bodies
  const sunGroup = new THREE.Group();
  const sunCore = new THREE.Mesh(
    new THREE.SphereGeometry(4.4, 24, 24),
    new THREE.MeshBasicMaterial({ color: 0xfff8dc, fog: false })
  );
  const sunHalo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: createGlowTexture("rgba(255,244,195,0.95)", "rgba(255,158,68,0.42)"),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  sunHalo.scale.set(34, 34, 1);
  sunGroup.add(sunCore, sunHalo);
  scene.add(sunGroup);

  const moonGroup = new THREE.Group();
  const moonDisc = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: createMoonTexture(),
      transparent: true,
      depthWrite: false
    })
  );
  moonDisc.scale.set(11.5, 11.5, 1);
  const moonHalo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: createGlowTexture("rgba(205,228,255,0.45)", "rgba(120,165,240,0.16)"),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  moonHalo.scale.set(28, 28, 1);
  moonGroup.add(moonHalo, moonDisc);
  scene.add(moonGroup);

  // 4. Drifting Daytime Clouds
  const cloudTex = createCloudPuffTexture();
  const cloudSprites = [];
  const cloudGroup = new THREE.Group();
  for (let c = 0; c < 14; c++) {
    const baseX = -150 + c * 23 + (c % 3) * 5;
    const baseY = 18 + (c % 4) * 4.5;
    const baseZ = -65 - (c % 5) * 16;
    const speed = 0.75 + (c % 4) * 0.28;
    const puffs = [];
    const puffCount = 4 + (c % 3);
    for (let p = 0; p < puffCount; p++) {
      const mat = new THREE.SpriteMaterial({
        map: cloudTex,
        transparent: true,
        opacity: 0.75,
        depthWrite: false
      });
      const sprite = new THREE.Sprite(mat);
      const sx = 12 + (p % 3) * 4.5;
      const sy = 6.2 + (p % 2) * 2.5;
      sprite.scale.set(sx, sy, 1);
      sprite.position.set(
        baseX + (p - puffCount * 0.5) * 4.2,
        baseY + (p % 2 === 0 ? 1.1 : -0.4),
        baseZ + (p % 3) * 0.8
      );
      cloudGroup.add(sprite);
      puffs.push({ sprite, mat, offsetX: (p - puffCount * 0.5) * 4.2 });
    }
    cloudSprites.push({ x: baseX, speed, puffs });
  }
  scene.add(cloudGroup);

  // 5. South Ocean Shader
  const oceanUniforms = {
    uTime: { value: 0 },
    uCameraPos: { value: camera.position.clone() },
    uDeepColor: { value: new THREE.Color(0x0b3c5d) },
    uShallowColor: { value: new THREE.Color(0x1f8fa8) },
    uSkyHorizon: { value: new THREE.Color(0x9ad8f5) },
    uBodyDir: { value: new THREE.Vector3(-0.5, 0.3, -0.8) },
    uSpecularColor: { value: new THREE.Color(0xffdfa8) },
    uSpecularPower: { value: 90.0 },
    uSpecularIntensity: { value: 1.15 }
  };
  const oceanGeo = new THREE.PlaneGeometry(360, 210, 140, 84);
  oceanGeo.rotateX(-Math.PI / 2);
  const ocean = new THREE.Mesh(
    oceanGeo,
    new THREE.ShaderMaterial({
      vertexShader: OCEAN_VERTEX,
      fragmentShader: OCEAN_FRAGMENT,
      uniforms: oceanUniforms,
      transparent: true
    })
  );
  ocean.position.set(0, 0.0, -98);
  scene.add(ocean);

  // 6. Sculpted Sandy Beach
  const sandGeo = new THREE.PlaneGeometry(180, 46, 90, 32);
  sandGeo.rotateX(-Math.PI / 2);
  const posAttr = sandGeo.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const zWorld = posAttr.getZ(i) + 12;
    posAttr.setY(i, sandHeightAt(x, zWorld));
  }
  sandGeo.computeVertexNormals();
  const sandMat = new THREE.MeshStandardMaterial({
    map: createSandTexture(),
    roughness: 0.94,
    metalness: 0.02
  });
  const beach = new THREE.Mesh(sandGeo, sandMat);
  beach.position.set(0, 0, 12);
  scene.add(beach);

  // Coastal Boulders framing East/West edges (leave center South view clean)
  const rockGeo = new THREE.DodecahedronGeometry(1, 1);
  const rockMat = new THREE.MeshStandardMaterial({
    color: 0x3f434a,
    roughness: 0.9,
    flatShading: true
  });
  const rockPlacements = [
    [-11.5, 3.8, 1.5, 0.75, 1.2],
    [-9.8, 2.7, 0.9, 0.55, 0.85],
    [-13.0, 5.2, 1.9, 0.95, 1.5],
    [10.8, 4.4, 1.4, 0.7, 1.1],
    [12.4, 3.0, 1.0, 0.52, 0.95]
  ];
  for (const [rx, rz, sx, sy, sz] of rockPlacements) {
    const rock = new THREE.Mesh(rockGeo, rockMat);
    rock.scale.set(sx, sy, sz);
    rock.position.set(rx, sandHeightAt(rx, rz) + sy * 0.35, rz);
    rock.rotation.set(rx * 0.2, rz * 0.4, 0.15);
    scene.add(rock);
  }

  // 7. Beach Campfire (Foreground Right: x=3.6, z=6.2)
  const fireX = 3.6;
  const fireZ = 6.2;
  const fireY = sandHeightAt(fireX, fireZ);
  const campfireGroup = new THREE.Group();
  campfireGroup.position.set(fireX, fireY, fireZ);

  // Stone ring around campfire
  for (let i = 0; i < 9; i++) {
    const ang = (i / 9) * Math.PI * 2;
    const stone = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.18, 0),
      new THREE.MeshStandardMaterial({ color: 0x3b3f46, roughness: 0.92, flatShading: true })
    );
    stone.scale.set(1.2, 0.72, 1.0);
    stone.position.set(Math.cos(ang) * 0.62, 0.05, Math.sin(ang) * 0.56);
    stone.rotation.y = ang;
    campfireGroup.add(stone);
  }

  // Charred driftwood logs
  const logMat = new THREE.MeshStandardMaterial({ color: 0x2d1e16, roughness: 0.95 });
  const logAngles = [0.25, 1.45, 2.65, 3.9];
  for (const a of logAngles) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.075, 0.95, 7), logMat);
    log.position.set(Math.cos(a) * 0.18, 0.14, Math.sin(a) * 0.18);
    log.rotation.set(Math.PI / 2 - 0.35, a, 0.12);
    campfireGroup.add(log);
  }

  // Glowing ember bed
  const coalBedMat = new THREE.MeshStandardMaterial({
    color: 0x220802,
    emissive: new THREE.Color(0xff4500),
    emissiveIntensity: 1.4,
    roughness: 0.85
  });
  const coalBed = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.44, 0.08, 12), coalBedMat);
  coalBed.position.y = 0.04;
  campfireGroup.add(coalBed);

  // Warm flickering PointLight
  const fireLight = new THREE.PointLight(0xff7722, 0.0, 18.0, 1.7);
  fireLight.position.set(0, 0.65, 0);
  campfireGroup.add(fireLight);

  // Flame sprites (additive animated glow)
  const flameTex = createGlowTexture("rgba(255,242,175,0.98)", "rgba(255,95,20,0.65)");
  const flameSprites = [];
  for (let f = 0; f < 4; f++) {
    const mat = new THREE.SpriteMaterial({
      map: flameTex,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const sp = new THREE.Sprite(mat);
    sp.position.set((f - 1.5) * 0.08, 0.36 + (f % 2) * 0.1, (f % 2 - 0.5) * 0.06);
    campfireGroup.add(sp);
    flameSprites.push({ sp, mat, phase: f * 1.7, baseScale: 0.72 + (f % 2) * 0.22 });
  }

  // Rising ember sparks
  const sparkCount = 48;
  const sparkPos = new Float32Array(sparkCount * 3);
  const sparkLife = new Float32Array(sparkCount);
  const sparkSpeed = new Float32Array(sparkCount);
  for (let i = 0; i < sparkCount; i++) {
    sparkLife[i] = Math.random();
    sparkSpeed[i] = 0.28 + Math.random() * 0.35;
    sparkPos[i * 3] = (Math.random() - 0.5) * 0.35;
    sparkPos[i * 3 + 1] = Math.random() * 1.6;
    sparkPos[i * 3 + 2] = (Math.random() - 0.5) * 0.35;
  }
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute("position", new THREE.BufferAttribute(sparkPos, 3));
  const sparkMat = new THREE.PointsMaterial({
    color: 0xffaa44,
    size: 0.07,
    transparent: true,
    opacity: 0.0,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  campfireGroup.add(sparks);
  scene.add(campfireGroup);

  // Palettes for sky interpolation
  const PALETTES = {
    night: {
      zenith: new THREE.Color(0x040814),
      horizon: new THREE.Color(0x0f1b33),
      glow: new THREE.Color(0x1e3a5f),
      deep: new THREE.Color(0x040d1c),
      shallow: new THREE.Color(0x0b223d),
      hemiSky: new THREE.Color(0x28436e),
      hemiGround: new THREE.Color(0x141118),
      hemiIntensity: 0.34,
      cloud: new THREE.Color(0x293b59)
    },
    dawn: {
      zenith: new THREE.Color(0x1f3566),
      horizon: new THREE.Color(0xff8e5c),
      glow: new THREE.Color(0xffcf6e),
      deep: new THREE.Color(0x123254),
      shallow: new THREE.Color(0x266c85),
      hemiSky: new THREE.Color(0xffa97a),
      hemiGround: new THREE.Color(0x3a2a24),
      hemiIntensity: 0.65,
      cloud: new THREE.Color(0xffc79e)
    },
    day: {
      zenith: new THREE.Color(0x1c6eb8),
      horizon: new THREE.Color(0x9ee0fa),
      glow: new THREE.Color(0xfff1c9),
      deep: new THREE.Color(0x0a4973),
      shallow: new THREE.Color(0x22a6bd),
      hemiSky: new THREE.Color(0xa6e1fa),
      hemiGround: new THREE.Color(0x61513e),
      hemiIntensity: 0.95,
      cloud: new THREE.Color(0xf8fafc)
    },
    dusk: {
      zenith: new THREE.Color(0x1e1948),
      horizon: new THREE.Color(0xf46e52),
      glow: new THREE.Color(0xfbbf24),
      deep: new THREE.Color(0x0e2547),
      shallow: new THREE.Color(0x285673),
      hemiSky: new THREE.Color(0xf59272),
      hemiGround: new THREE.Color(0x2d2129),
      hemiIntensity: 0.58,
      cloud: new THREE.Color(0xf7a88f)
    }
  };

  function samplePalette(hour) {
    // 0..5.2 night, 5.2..7.5 dawn->day, 7.5..16.8 day, 16.8..19.2 dusk->night
    if (hour < 5.0 || hour >= 19.6) {
      return { a: PALETTES.night, b: PALETTES.night, t: 0, phase: "NIGHT" };
    }
    if (hour < 6.4) {
      return { a: PALETTES.night, b: PALETTES.dawn, t: smoothstep(5.0, 6.4, hour), phase: "SUNRISE" };
    }
    if (hour < 8.0) {
      return { a: PALETTES.dawn, b: PALETTES.day, t: smoothstep(6.4, 8.0, hour), phase: "MORNING" };
    }
    if (hour < 16.6) {
      return { a: PALETTES.day, b: PALETTES.day, t: 0, phase: "DAYLIGHT" };
    }
    if (hour < 18.2) {
      return { a: PALETTES.day, b: PALETTES.dusk, t: smoothstep(16.6, 18.2, hour), phase: "SUNSET" };
    }
    return { a: PALETTES.dusk, b: PALETTES.night, t: smoothstep(18.2, 19.6, hour), phase: "TWILIGHT" };
  }

  let overrideHour = null;
  let pointerX = 0;
  let pointerY = 0;
  let smoothPointerX = 0;
  let smoothPointerY = 0;
  let lastReportMs = 0;

  function onPointerMove(e) {
    pointerX = (e.clientX / window.innerWidth) * 2 - 1;
    pointerY = (e.clientY / window.innerHeight) * 2 - 1;
  }
  window.addEventListener("pointermove", onPointerMove, { passive: true });

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener("resize", onResize);

  const tmpZenith = new THREE.Color();
  const tmpHorizon = new THREE.Color();
  const tmpGlow = new THREE.Color();
  const tmpDeep = new THREE.Color();
  const tmpShallow = new THREE.Color();
  const tmpCloud = new THREE.Color();
  const tmpHemiSky = new THREE.Color();
  const tmpHemiGround = new THREE.Color();

  const clock = new THREE.Clock();
  let animId = 0;

  function animate(nowMs) {
    animId = requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);
    const elapsed = clock.elapsedTime;

    const now = new Date();
    const liveHour = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
    const hour = overrideHour !== null ? overrideHour : liveHour;

    // Gentle camera parallax
    smoothPointerX = lerp(smoothPointerX, pointerX, 0.05);
    smoothPointerY = lerp(smoothPointerY, pointerY, 0.05);
    camera.position.x = baseCamPos.x + smoothPointerX * 2.1;
    camera.position.y = baseCamPos.y - smoothPointerY * 0.55;
    camera.lookAt(baseLookAt.x + smoothPointerX * 3.0, baseLookAt.y - smoothPointerY * 1.4, baseLookAt.z);
    oceanUniforms.uCameraPos.value.copy(camera.position);
    oceanUniforms.uTime.value = elapsed;

    // Sky & ocean color blending
    const { a, b, t, phase } = samplePalette(hour);
    tmpZenith.copy(a.zenith).lerp(b.zenith, t);
    tmpHorizon.copy(a.horizon).lerp(b.horizon, t);
    tmpGlow.copy(a.glow).lerp(b.glow, t);
    tmpDeep.copy(a.deep).lerp(b.deep, t);
    tmpShallow.copy(a.shallow).lerp(b.shallow, t);
    tmpCloud.copy(a.cloud).lerp(b.cloud, t);
    tmpHemiSky.copy(a.hemiSky).lerp(b.hemiSky, t);
    tmpHemiGround.copy(a.hemiGround).lerp(b.hemiGround, t);

    skyUniforms.uZenithColor.value.copy(tmpZenith);
    skyUniforms.uHorizonColor.value.copy(tmpHorizon);
    skyUniforms.uGlowColor.value.copy(tmpGlow);
    oceanUniforms.uSkyHorizon.value.copy(tmpHorizon);
    oceanUniforms.uDeepColor.value.copy(tmpDeep);
    oceanUniforms.uShallowColor.value.copy(tmpShallow);

    hemiLight.color.copy(tmpHemiSky);
    hemiLight.groundColor.copy(tmpHemiGround);
    hemiLight.intensity = lerp(a.hemiIntensity, b.hemiIntensity, t);

    // Sun position: rises East (-X, clearly visible right of UI panel) at 05:30, peaks South at 12:00, sets West (+X) at 18:30
    const sunProgress = (hour - 5.5) / 13.0;
    const isDayWindow = hour >= 5.2 && hour <= 18.8;
    const sunAngle = clamp(sunProgress, -0.05, 1.05) * Math.PI;
    const sunX = -Math.cos(sunAngle) * 56 + 10;
    const sunY = Math.sin(sunAngle) * 60 - 1.0;
    const sunZ = -132;
    sunGroup.position.set(sunX, sunY, sunZ);
    sunGroup.visible = isDayWindow && sunY > -6.0;
    const sunElev = clamp((sunY + 1.0) / 59.0, 0.0, 1.0);
    sunCore.material.color.setHex(sunElev < 0.25 ? 0xffb35c : 0xfff6d8);
    skyUniforms.uGlowStrength.value = sunGroup.visible ? lerp(1.1, 0.45, sunElev) : 0.12;

    // Moon position: rises East (-X) around 18:50, arcs across South night sky, sets West (+X) before 05:35
    const nightHour = hour >= 18.8 ? hour - 18.8 : hour + 5.2;
    const moonProgress = clamp(nightHour / 10.7, 0.0, 1.0);
    const moonAngle = moonProgress * Math.PI;
    const moonX = -Math.cos(moonAngle) * 58 + 10;
    const moonY = Math.sin(moonAngle) * 54 - 2.5;
    const moonZ = -135;
    const darkAmt = hour < 5.2 || hour >= 19.4 ? 1.0 : hour < 6.5 ? 1.0 - smoothstep(5.2, 6.5, hour) : hour > 18.2 ? smoothstep(18.2, 19.4, hour) : 0.0;

    moonGroup.position.set(moonX, moonY, moonZ);
    moonGroup.visible = darkAmt > 0.08 && moonY > -3.0;
    moonDisc.material.opacity = darkAmt;
    moonHalo.material.opacity = darkAmt * 0.85;

    // Directional Light + Ocean Specular track active celestial body
    if (sunGroup.visible && sunY > 0.0) {
      celestialLight.position.set(sunX, sunY, sunZ);
      celestialLight.color.setHex(sunElev < 0.22 ? 0xffa45b : 0xfff4dc);
      celestialLight.intensity = lerp(0.85, 1.85, sunElev);
      skyUniforms.uSunDir.value.set(sunX, sunY, sunZ).normalize();
      oceanUniforms.uBodyDir.value.set(sunX, Math.max(sunY, 4.0), sunZ).normalize();
      oceanUniforms.uSpecularColor.value.setHex(sunElev < 0.22 ? 0xffb36b : 0xffe9be);
      oceanUniforms.uSpecularPower.value = lerp(46.0, 110.0, sunElev);
      oceanUniforms.uSpecularIntensity.value = lerp(1.35, 1.0, sunElev);
    } else {
      celestialLight.position.set(moonX, Math.max(moonY, 8.0), moonZ);
      celestialLight.color.setHex(0x8bb6f2);
      celestialLight.intensity = 0.42 * Math.max(darkAmt, 0.35);
      skyUniforms.uSunDir.value.set(moonX, moonY, moonZ).normalize();
      oceanUniforms.uBodyDir.value.set(moonX, Math.max(moonY, 8.0), moonZ).normalize();
      oceanUniforms.uSpecularColor.value.setHex(0x9bc4f7);
      oceanUniforms.uSpecularPower.value = 120.0;
      oceanUniforms.uSpecularIntensity.value = 0.65 * Math.max(darkAmt, 0.3);
    }

    // Stars twinkle at night
    const twinkle = 0.88 + 0.12 * Math.sin(elapsed * 2.1);
    starMat.opacity = darkAmt * 0.92 * twinkle;
    stars.rotation.y = elapsed * 0.0025;

    // Clouds drift West -> East / East -> West during day (fade softly at night)
    const dayCloudOpacity = lerp(0.82, 0.14, darkAmt);
    for (const cluster of cloudSprites) {
      cluster.x += cluster.speed * dt;
      if (cluster.x > 165) {
        cluster.x = -165;
      }
      for (const p of cluster.puffs) {
        p.sprite.position.x = cluster.x + p.offsetX;
        p.mat.color.copy(tmpCloud);
        p.mat.opacity = dayCloudOpacity;
      }
    }

    // Night Campfire activation (burns warm & bright at dusk/night, faint embers during day)
    const fireActivity = clamp(0.18 + darkAmt * 0.95, 0.0, 1.0);
    const flicker =
      0.86 +
      0.14 * Math.sin(elapsed * 11.7) +
      0.09 * Math.cos(elapsed * 19.3) +
      0.06 * Math.sin(elapsed * 29.1);
    fireLight.intensity = darkAmt * 5.2 * flicker;
    coalBedMat.emissiveIntensity = (0.35 + darkAmt * 1.65) * flicker;

    for (const f of flameSprites) {
      const wave = Math.sin(elapsed * 9.5 + f.phase);
      const scale = f.baseScale * (0.85 + 0.25 * wave) * (0.25 + darkAmt * 0.95);
      f.sp.scale.set(scale * 0.72, scale * 1.25, 1);
      f.sp.position.x = Math.sin(elapsed * 6.0 + f.phase) * 0.05;
      f.mat.opacity = clamp(darkAmt * (0.72 + 0.2 * wave), 0.0, 0.95);
    }

    const spAttr = sparkGeo.attributes.position;
    for (let i = 0; i < sparkCount; i++) {
      sparkLife[i] += dt * sparkSpeed[i];
      if (sparkLife[i] >= 1.0) {
        sparkLife[i] = 0.0;
        spAttr.setX(i, (Math.random() - 0.5) * 0.28);
        spAttr.setY(i, 0.12);
        spAttr.setZ(i, (Math.random() - 0.5) * 0.28);
      } else {
        const y = 0.12 + sparkLife[i] * 1.9;
        const drift = Math.sin(elapsed * 3.0 + i) * 0.14 * dt;
        spAttr.setX(i, spAttr.getX(i) + drift);
        spAttr.setY(i, y);
      }
    }
    spAttr.needsUpdate = true;
    sparkMat.opacity = darkAmt * 0.85 * fireActivity;

    renderer.render(scene, camera);

    if (onTelemetry && nowMs - lastReportMs > 400) {
      lastReportMs = nowMs;
      onTelemetry({
        hour,
        phase,
        isLive: overrideHour === null,
        fireActive: darkAmt > 0.35
      });
    }
  }

  animId = requestAnimationFrame(animate);

  return {
    setHourOverride(hourOrNull) {
      overrideHour = hourOrNull;
      lastReportMs = 0;
    },
    destroy() {
      cancelAnimationFrame(animId);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
    }
  };
}
