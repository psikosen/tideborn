import * as THREE from 'three';

export interface TreeWindProfile {
  flexibility: number;
  crownFlutter: number;
  stormLean: number;
  windStart: number;
}

/**
 * Root-anchored wind deformation for flat generated tree art.
 *
 * The material keeps the cheap one-plane representation, but bends vertices
 * progressively toward the crown. A second high-frequency wave makes leaves
 * and outer branches flutter without sliding the trunk across the ground.
 */
export class TreeWindMaterial extends THREE.ShaderMaterial {
  constructor(
    map: THREE.Texture,
    tint: THREE.Color,
    phase: number,
    profile: TreeWindProfile,
  ) {
    super({
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uMap: { value: map },
          uTint: { value: tint },
          uTime: { value: 0 },
          uStorm: { value: 0 },
          uPhase: { value: phase },
          uFlexibility: { value: profile.flexibility },
          uCrownFlutter: { value: profile.crownFlutter },
          uStormLean: { value: profile.stormLean },
          uWindStart: { value: profile.windStart },
        },
      ]),
      vertexShader: /* glsl */`
        uniform float uTime;
        uniform float uStorm;
        uniform float uPhase;
        uniform float uFlexibility;
        uniform float uCrownFlutter;
        uniform float uStormLean;
        uniform float uWindStart;
        varying vec2 vUv;
        varying float vWindShimmer;
        #include <fog_pars_vertex>

        void main() {
          vUv = uv;
          // The planted trunk remains rigid. Deformation begins only above the
          // species-specific crown line, so neither wind nor storms can slide
          // the buried roots or rubber-bend the base of the tree.
          float heightMask = smoothstep(uWindStart, 1.0, uv.y);
          float bendMask = pow(heightMask, 1.65);
          float crownMask = smoothstep(max(uWindStart, 0.38), 0.82, uv.y);
          float outerBranch = 0.34 + abs(uv.x - 0.5) * 1.32;
          float storm = smoothstep(0.04, 1.0, uStorm);

          float breeze = sin(uTime * 0.72 + uPhase) * 0.021;
          breeze += sin(uTime * 1.29 + uPhase * 1.73 + uv.y * 2.4) * 0.007;

          float gustWave = 0.5 + 0.5 * sin(uTime * 0.61 + uPhase * 0.83);
          float gustPulse = gustWave * gustWave;
          float stormLean = -storm * (0.07 + gustPulse * 0.075) * uStormLean;
          float stormBuffet = sin(uTime * (2.35 + storm * 2.3) + uPhase + uv.y * 2.1)
            * storm * (0.015 + gustPulse * 0.031);
          float bend = (breeze * (1.0 - storm * 0.42) + stormLean + stormBuffet)
            * uFlexibility;

          float flutter = sin(
            uTime * (2.4 + storm * 6.2) + uPhase * 2.1 + uv.y * 14.0 + uv.x * 7.0
          ) * (0.003 + storm * 0.015) * uCrownFlutter * crownMask * outerBranch;

          vec3 transformed = position;
          transformed.x += bend * bendMask + flutter;
          transformed.y -= abs(bend) * bendMask * 0.028;
          vWindShimmer = flutter * 7.5;

          vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }
      `,
      fragmentShader: /* glsl */`
        uniform sampler2D uMap;
        uniform vec3 uTint;
        varying vec2 vUv;
        varying float vWindShimmer;
        #include <fog_pars_fragment>

        void main() {
          vec4 texel = texture2D(uMap, vUv);
          if (texel.a < 0.08) discard;
          float heightLight = 0.89 + vUv.y * 0.11;
          vec3 color = texel.rgb * uTint * (heightLight + vWindShimmer * 0.08);
          gl_FragColor = vec4(color, texel.a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }
      `,
      transparent: true,
      alphaTest: 0.08,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: true,
      toneMapped: true,
    });
  }

  updateWind(time: number, storm: number): void {
    this.uniforms.uTime.value = time;
    this.uniforms.uStorm.value = THREE.MathUtils.clamp(storm, 0, 1);
  }
}
