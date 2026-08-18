import * as THREE from 'three';
import {
  BASE_SEA_LEVEL,
  WORLD_HEIGHT,
  WORLD_MIN_X,
  WORLD_MIN_Y,
  WORLD_WIDTH,
} from './data';

export interface OceanSurfaceSnapshot {
  model: 'layered-directional-waves';
  geometricWaves: number;
  meshSegments: number;
  reflectionPasses: 0;
  shorelineMask: 'live-matter-texture';
  seaLevel: number;
  stormStrength: number;
}

const vertexShader = /* glsl */`
  uniform float uTime;
  uniform float uStorm;
  varying vec2 vUv;
  varying vec2 vWorld;
  varying float vWave;
  varying float vSlope;
  varying float vCrest;

  void main() {
    vUv = uv;
    vec3 pos = position;
    float surfaceWeight = smoothstep(0.90, 1.0, uv.y);
    float x = pos.x;

    // Independent wave trains avoid the visibly repeating "two sine" look.
    float p0 = x * 0.48 + uTime * 0.72;
    float p1 = x * 0.93 - uTime * 1.05 + 1.7;
    float p2 = x * 1.74 + uTime * 1.54 + 4.1;
    float p3 = x * 2.85 - uTime * 2.12 + 0.6;
    float sharpened = pow(0.5 + 0.5 * sin(p0), 3.0) - 0.3125;
    float calmWave = sin(p0) * 0.105
      + sin(p1) * 0.052
      + sin(p2) * 0.024
      + sin(p3) * 0.010
      + sharpened * 0.052;
    float stormScale = 1.0 + uStorm * 4.15;
    float wave = calmWave * stormScale;

    float slope = (cos(p0) * 0.0504
      + cos(p1) * 0.04836
      + cos(p2) * 0.04176
      + cos(p3) * 0.0285) * stormScale;
    // A restrained lateral Gerstner-like shift concentrates vertices at crests.
    pos.x += (cos(p0) * 0.018 + cos(p1) * 0.008) * stormScale * surfaceWeight;
    pos.y += wave * surfaceWeight;

    vec4 worldPosition = modelMatrix * vec4(pos, 1.0);
    vWorld = worldPosition.xy;
    vWave = wave;
    vSlope = slope;
    vCrest = 0.5 + 0.5 * sin(p0);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const fragmentShader = /* glsl */`
  precision highp float;
  uniform float uTime;
  uniform float uStorm;
  uniform float uNight;
  uniform float uAbyss;
  uniform float uSeaLevel;
  uniform sampler2D uCells;
  varying vec2 vUv;
  varying vec2 vWorld;
  varying float vWave;
  varying float vSlope;
  varying float vCrest;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 345.45));
    p += dot(p, p + 34.345);
    return fract(p.x * p.y);
  }

  float materialAt(float worldX, float worldY) {
    vec2 cellUv = vec2(
      fract((worldX - ${WORLD_MIN_X.toFixed(1)}) / ${WORLD_WIDTH.toFixed(1)}),
      clamp((worldY - ${WORLD_MIN_Y.toFixed(1)}) / ${WORLD_HEIGHT.toFixed(1)}, 0.0, 1.0)
    );
    return floor(texture2D(uCells, cellUv).r * 255.0 + 0.5);
  }

  float isTerrain(float id) {
    if (id < 0.5) return 0.0;
    if (id > 7.5 && id < 8.5) return 0.0;   // local water
    if (id > 13.5 && id < 15.5) return 0.0; // steam / vent fluid
    return 1.0;
  }

  void main() {
    // In truly lightless water, preserve pitch black and skip every ripple,
    // caustic, reflection, foam, and terrain-texture sample below.
    if (uAbyss > 0.985) {
      gl_FragColor = vec4(0.00025, 0.0007, 0.0012, 0.99);
      return;
    }
    float depth = clamp(1.0 - vUv.y, 0.0, 1.0);
    // WORLD_HEIGHT is 128 m, so this confines reflective/foamy treatment to
    // roughly the upper 45 cm instead of tinting the whole shallow column.
    float surface = smoothstep(0.9965, 0.9995, vUv.y);
    float meniscus = smoothstep(0.9975, 0.9986, vUv.y) * (1.0 - smoothstep(0.9994, 1.0, vUv.y));

    // Exponential-looking depth tint: clear jade shallows into blue-black water.
    vec3 shallow = mix(vec3(0.055, 0.43, 0.46), vec3(0.035, 0.31, 0.37), uStorm * 0.55);
    vec3 deep = vec3(0.006, 0.048, 0.085);
    float opticalDepth = 1.0 - exp(-depth * 3.35);
    vec3 color = mix(shallow, deep, opticalDepth);

    // Two advected high-frequency fields behave like a cheap animated normal map.
    float rippleA = sin(vWorld.x * 4.1 + vWorld.y * 0.34 + uTime * 1.45);
    float rippleB = sin(vWorld.x * 7.7 - vWorld.y * 0.51 - uTime * 2.08 + rippleA * 0.7);
    float microSlope = rippleA * 0.55 + rippleB * 0.24;
    float causticLines = 1.0 - abs(sin(vWorld.x * 2.15 + sin(vWorld.y * 1.18 + uTime * 0.82) * 1.15));
    causticLines *= 1.0 - abs(sin(vWorld.x * 1.23 - vWorld.y * 1.72 - uTime * 0.56));
    float caustic = pow(max(0.0, causticLines), 7.0) * (1.0 - opticalDepth) * (1.0 - uStorm * 0.72);
    color += vec3(0.12, 0.35, 0.29) * caustic;

    // In side view, a narrow sky-tinted grazing band reads as reflection without
    // a costly second scene render. Surface slope and micro-ripples break it up.
    float glancing = pow(clamp(1.0 - abs(vSlope + microSlope * 0.055), 0.0, 1.0), 3.2);
    float reflectionBreakup = 0.58 + 0.42 * sin(vWorld.x * 5.4 - uTime * 0.74 + rippleB * 0.45);
    vec3 skyReflection = mix(vec3(0.42, 0.69, 0.69), vec3(0.055, 0.09, 0.14), uNight);
    skyReflection = mix(skyReflection, vec3(0.19, 0.27, 0.29), uStorm * 0.78);
    float reflection = surface * glancing * (0.16 + reflectionBreakup * 0.23);
    color = mix(color, skyReflection, reflection);

    float solidHere = isTerrain(materialAt(vWorld.x, vWorld.y));
    float shore = max(
      isTerrain(materialAt(vWorld.x, uSeaLevel - 0.18)),
      max(isTerrain(materialAt(vWorld.x, uSeaLevel - 0.48)) * 0.78,
          isTerrain(materialAt(vWorld.x, uSeaLevel - 0.92)) * 0.42)
    );

    // Foam appears in broken crest streaks and where live granular terrain meets
    // the surface. Calm open water no longer receives a uniform white stripe.
    float foamGrain = smoothstep(0.38, 0.77,
      0.5 + 0.5 * sin(vWorld.x * 10.5 - uTime * 1.7 + sin(vWorld.x * 2.2 + uTime) * 1.8));
    float foamCell = floor(vWorld.x * 5.0);
    float foamTime = uTime * 0.8;
    float foamRandom = mix(
      hash(vec2(foamCell, floor(foamTime))),
      hash(vec2(foamCell, floor(foamTime) + 1.0)),
      smoothstep(0.0, 1.0, fract(foamTime))
    );
    foamGrain *= 0.72 + foamRandom * 0.28;
    float crestFoam = surface * foamGrain
      * smoothstep(0.72 - uStorm * 0.22, 0.97, vCrest + abs(vSlope) * (0.3 + uStorm * 0.35))
      * (0.08 + uStorm * 0.78);
    float shorePulse = 0.55 + 0.45 * sin(vWorld.x * 3.7 - uTime * 1.35 + rippleA * 0.3);
    float shoreFoam = surface * shore * smoothstep(0.22, 0.88, shorePulse) * foamGrain * (0.22 + uStorm * 0.5);
    float foam = clamp(crestFoam + shoreFoam + meniscus * (0.16 + uStorm * 0.18), 0.0, 1.0);
    color = mix(color, vec3(0.72, 0.91, 0.86), foam);

    color += vec3(0.04, 0.13, 0.12) * microSlope * (1.0 - opticalDepth) * 0.16;
    color = mix(color, vec3(0.025, 0.07, 0.10), uNight * 0.34);
    color = mix(color, vec3(0.00025, 0.0007, 0.0012), uAbyss * 0.992);

    float alpha = 0.27 + opticalDepth * 0.68 + reflection * 0.24 + foam * 0.45;
    alpha *= 1.0 - solidHere * 0.93;
    alpha = mix(alpha, 0.99, uAbyss);
    gl_FragColor = vec4(color, clamp(alpha, 0.0, 0.995));
  }
`;

/** A one-pass 2.5D ocean renderer tuned for an orthographic side view. */
export class OceanSurfaceSystem {
  readonly material: THREE.ShaderMaterial;
  readonly mesh: THREE.Mesh;
  private stormStrength = 0;
  private seaLevel = BASE_SEA_LEVEL;

  constructor(scene: THREE.Scene, matterTexture: THREE.Texture) {
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uStorm: { value: 0 },
        uNight: { value: 0 },
        uAbyss: { value: 0 },
        uSeaLevel: { value: BASE_SEA_LEVEL },
        uCells: { value: matterTexture },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_WIDTH * 3, WORLD_HEIGHT, 768, 1), this.material);
    this.mesh.position.set(0, BASE_SEA_LEVEL - WORLD_HEIGHT * 0.5, 1.2);
    this.mesh.renderOrder = 6;
    scene.add(this.mesh);
  }

  setSeaLevel(seaLevel: number): void {
    this.seaLevel = seaLevel;
    this.mesh.position.y = seaLevel - WORLD_HEIGHT * 0.5;
    this.material.uniforms.uSeaLevel.value = seaLevel;
  }

  update(elapsed: number, storm: number, night: number, abyssDarkness: number): void {
    this.stormStrength = storm;
    this.material.uniforms.uTime.value = elapsed;
    this.material.uniforms.uStorm.value = storm;
    this.material.uniforms.uNight.value = night;
    this.material.uniforms.uAbyss.value = abyssDarkness;
  }

  snapshot(): OceanSurfaceSnapshot {
    return {
      model: 'layered-directional-waves',
      geometricWaves: 4,
      meshSegments: 768,
      reflectionPasses: 0,
      shorelineMask: 'live-matter-texture',
      seaLevel: Number(this.seaLevel.toFixed(2)),
      stormStrength: Number(this.stormStrength.toFixed(3)),
    };
  }
}
