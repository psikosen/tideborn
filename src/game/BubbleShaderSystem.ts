import * as THREE from 'three';

export interface BubbleShaderSnapshot {
  particles: number;
  shaderAnimated: true;
  cpuPositionUploads: 0;
  ambientLight: number;
}

/**
 * GPU-animated underwater bubble field. The CPU only changes four uniforms;
 * rise, sideways current, size pulse, glass rim, and highlight all run in the
 * shader. Three wrapped copies share one geometry and one material.
 */
export class BubbleShaderSystem {
  private geometry: THREE.BufferGeometry;
  private material: THREE.ShaderMaterial;
  private roots: THREE.Points[] = [];
  private ambientLight = 1;

  constructor(
    scene: THREE.Scene,
    rng: () => number,
    private minX: number,
    private width: number,
    private minY: number,
    private seaLevel: number,
    count = 1600,
  ) {
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const phases = new Float32Array(count);
    const speeds = new Float32Array(count);
    for (let index = 0; index < count; index += 1) {
      positions[index * 3] = minX + rng() * width;
      positions[index * 3 + 1] = minY + rng() * (seaLevel - minY);
      positions[index * 3 + 2] = 3 + rng() * 4;
      sizes[index] = 0.045 + Math.pow(rng(), 1.8) * 0.12;
      phases[index] = rng() * Math.PI * 2;
      speeds[index] = 0.08 + rng() * 0.18;
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    this.geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    this.geometry.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));
    this.geometry.boundingSphere = new THREE.Sphere(
      new THREE.Vector3(minX + width * 0.5, minY + (seaLevel - minY) * 0.5, 4.5),
      Math.hypot(width * 0.5, (seaLevel - minY) * 0.5) + 2,
    );

    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        uTime: { value: 0 },
        uPointScale: { value: 48 },
        uMinY: { value: minY },
        uWaterHeight: { value: Math.max(1, seaLevel - minY) },
        uAmbient: { value: 1 },
        uColor: { value: new THREE.Color('#b9f5ed') },
      }]),
      vertexShader: /* glsl */`
        attribute float aSize;
        attribute float aPhase;
        attribute float aSpeed;
        uniform float uTime;
        uniform float uPointScale;
        uniform float uMinY;
        uniform float uWaterHeight;
        varying float vPhase;
        varying float vLight;
        #include <fog_pars_vertex>

        void main() {
          vec3 transformed = position;
          transformed.y = uMinY + mod(position.y - uMinY + uTime * aSpeed, uWaterHeight);
          float current = sin(uTime * 0.72 + aPhase + transformed.y * 0.19);
          transformed.x += current * (0.045 + aSize * 0.48);
          transformed.z += sin(uTime * 0.41 + aPhase * 1.7) * 0.035;
          vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          float pulse = 0.9 + sin(uTime * 1.4 + aPhase) * 0.1;
          gl_PointSize = max(2.0, aSize * pulse * uPointScale);
          vPhase = aPhase;
          vLight = 0.86 + current * 0.14;
          #include <fog_vertex>
        }
      `,
      fragmentShader: /* glsl */`
        uniform vec3 uColor;
        uniform float uAmbient;
        uniform float uTime;
        varying float vPhase;
        varying float vLight;
        #include <fog_pars_fragment>

        void main() {
          vec2 p = gl_PointCoord * 2.0 - 1.0;
          float radius = length(p);
          if (radius > 1.0) discard;

          // A thin translucent glass rim, dim body, and moving pinpoint glint.
          float rim = smoothstep(0.62, 0.94, radius) * (1.0 - smoothstep(0.94, 1.0, radius));
          float interior = (1.0 - smoothstep(0.0, 0.88, radius)) * 0.10;
          vec2 glintCenter = vec2(-0.36, 0.34) + vec2(sin(uTime * 0.8 + vPhase), cos(uTime * 0.63 + vPhase)) * 0.025;
          float glint = 1.0 - smoothstep(0.0, 0.13, distance(p, glintCenter));
          float lowerShade = smoothstep(-0.85, 0.7, p.y) * 0.16;
          float alpha = (rim * 0.54 + interior + glint * 0.68 + lowerShade * rim) * uAmbient;
          vec3 color = mix(uColor * 0.55, vec3(0.92, 1.0, 0.98), glint + rim * 0.32) * vLight;
          gl_FragColor = vec4(color, alpha);
          #include <fog_fragment>
        }
      `,
    });

    for (const offset of [-width, 0, width]) {
      const points = new THREE.Points(this.geometry, this.material);
      points.position.x = offset;
      points.renderOrder = 8;
      points.frustumCulled = true;
      points.name = offset === 0 ? 'shader-bubbles' : 'shader-bubbles-seam';
      scene.add(points);
      this.roots.push(points);
    }
  }

  update(elapsed: number, drawingBufferHeight: number, viewHeight: number, ambientLight: number): void {
    this.ambientLight = THREE.MathUtils.clamp(ambientLight, 0, 1);
    const visible = this.ambientLight > 0.015;
    for (const root of this.roots) root.visible = visible;
    this.material.uniforms.uTime.value = elapsed;
    this.material.uniforms.uPointScale.value = drawingBufferHeight / Math.max(1, viewHeight);
    this.material.uniforms.uAmbient.value = this.ambientLight;
  }

  snapshot(): BubbleShaderSnapshot {
    return {
      particles: (this.geometry.getAttribute('position') as THREE.BufferAttribute).count,
      shaderAnimated: true,
      cpuPositionUploads: 0,
      ambientLight: Number(this.ambientLight.toFixed(3)),
    };
  }
}
