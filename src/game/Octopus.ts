import * as THREE from 'three';
import { BASE_SEA_LEVEL, WORLD_MAX_Y, WORLD_MIN_Y, clamp, wrapWorldX } from './data';
import { MatterWorld } from './MatterWorld';
import { SurfaceAdaptationSystem, type SurfaceContact } from './SurfaceAdaptationSystem';
import { SweptContact2D, type SweptContactSnapshot } from './SweptContact2D';

export interface InputState {
  held: Set<string>;
  pressed: Set<string>;
}

export interface OctopusEvents {
  jet: boolean;
  ink: boolean;
  dig: boolean;
  interact: boolean;
  twist: boolean;
  braceChanged: boolean;
  camouflageChanged: boolean;
  gripStarted: boolean;
  gripReleased: boolean;
  gripFailed: boolean;
  eat: boolean;
  place: boolean;
  sleep: boolean;
}

const ARM_COUNT = 8;
const ARM_POINTS = 12;

const armVertex = /* glsl */ `
  attribute float aTone;
  varying vec2 vUv;
  varying float vTone;
  void main() {
    vUv = uv;
    vTone = aTone;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const armFragment = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uCamo;
  uniform float uInk;
  uniform float uAction;
  uniform float uWet;
  uniform vec3 uCamoColor;
  uniform vec3 uCamoAccent;
  varying vec2 vUv;
  varying float vTone;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  void main() {
    float across = abs(vUv.y - 0.5) * 2.0;
    float rim = smoothstep(0.46, 1.0, across);
    float cellular = hash(floor(vUv * vec2(22.0, 5.0)) + floor(uTime * 0.7));
    float chromatophore = smoothstep(0.52, 0.88, cellular + sin(vUv.x * 38.0 - uTime * 2.0) * 0.12);
    vec3 base = mix(vec3(0.22, 0.045, 0.05), vec3(0.34, 0.09, 0.07), vTone);
    vec3 adaptiveCamo = mix(uCamoColor * 0.88, uCamoAccent, chromatophore * 0.72);
    base = mix(base, adaptiveCamo, uCamo * 0.94);
    base = mix(base, vec3(0.12, 0.08, 0.24), uInk * 0.72);
    base += chromatophore * vec3(0.09, 0.025, 0.018) * (1.0 - uCamo);
    base += rim * mix(vec3(0.07, 0.012, 0.02), vec3(0.11, 0.25, 0.23), uWet);

    float lane = abs(vUv.y - mix(0.21, 0.79, step(0.5, vTone)));
    float suckerAlong = abs(fract(vUv.x * 9.0 + vTone * 0.5) - 0.5);
    float suckers = (1.0 - smoothstep(0.07, 0.17, suckerAlong)) * (1.0 - smoothstep(0.055, 0.15, lane));
    vec3 suckerColor = mix(vec3(0.38, 0.11, 0.10) * (1.0 + uAction * 0.26), uCamoAccent * 0.78, uCamo);
    base = mix(base, suckerColor, suckers * 0.54);
    float caustic = pow(max(0.0, sin(vUv.x * 46.0 + uTime * 2.6 + vTone * 2.0)), 10.0) * uWet;
    base += caustic * vec3(0.07, 0.20, 0.18);
    float alpha = mix(0.97, 0.86, uCamo) * (1.0 - smoothstep(0.94, 1.0, across) * 0.25);
    gl_FragColor = vec4(base, alpha);
  }
`;

export class Octopus {
  readonly group = new THREE.Group();
  readonly mantle: THREE.Mesh;
  readonly armMeshes: THREE.Mesh[] = [];
  x = -8.35;
  y = 2.95;
  vx = 0;
  vy = 0;
  facing = 1;
  radius = 0.43;
  onGround = false;
  underwater = true;
  braced = false;
  camouflage = false;
  gripping = false;
  camouflageSurface = 'open water';
  squeezing = false;
  stamina = 100;
  jetCooldown = 0;
  jetCharges = 3;
  jetRechargeRemaining = 0;
  readonly lastJetDirection = new THREE.Vector2(1, 0);
  lastJetStrength = 1;
  inkCooldown = 0;
  inkTime = 0;
  swimTilt = 0;
  technique = 'crawl';
  techniqueTimer = 0;
  private baseColor = new THREE.Color('#dd765e');
  private mantleMaterial: THREE.MeshStandardMaterial;
  private armMaterial: THREE.ShaderMaterial;
  private surfaceAdaptation = new SurfaceAdaptationSystem();
  private surfaceContact: SurfaceContact | null = null;
  private camouflageColor = new THREE.Color('#315d59');
  private camouflageAccent = new THREE.Color('#578981');
  private suckerContacts: THREE.Mesh[] = [];
  private eyeGroup = new THREE.Group();
  private digRepeatTimer = 0;
  private jetSteerTime = 0;
  private jetSteerApplied = true;
  private jetEnvironmentScale = 1;
  private armTrailLocal = new THREE.Vector2(0, -1);
  private armTrailStrength = 0;
  private armTrailSpeed = 0;
  private sweptContact = new SweptContact2D();

  constructor() {
    const mantleGeometry = new THREE.SphereGeometry(0.5, 24, 18);
    this.mantleMaterial = new THREE.MeshStandardMaterial({
      color: this.baseColor,
      roughness: 0.72,
      metalness: 0.02,
      emissive: new THREE.Color('#3b1014'),
      emissiveIntensity: 0.06,
    });
    this.mantle = new THREE.Mesh(mantleGeometry, this.mantleMaterial);
    this.mantle.scale.set(1.0, 1.14, 0.46);
    this.mantle.position.set(0, 0.18, 0.1);
    this.mantle.castShadow = true;
    this.group.add(this.mantle);

    this.armMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uCamo: { value: 0 },
        uInk: { value: 0 },
        uAction: { value: 0 },
        uWet: { value: 1 },
        uCamoColor: { value: this.camouflageColor.clone() },
        uCamoAccent: { value: this.camouflageAccent.clone() },
      },
      vertexShader: armVertex,
      fragmentShader: armFragment,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    for (let i = 0; i < ARM_COUNT; i += 1) {
      const positions = new Float32Array(ARM_POINTS * 2 * 3);
      const uvs = new Float32Array(ARM_POINTS * 2 * 2);
      const tones = new Float32Array(ARM_POINTS * 2);
      const indices: number[] = [];
      for (let p = 0; p < ARM_POINTS; p += 1) {
        const t = p / (ARM_POINTS - 1);
        uvs[p * 4] = t;
        uvs[p * 4 + 1] = 0;
        uvs[p * 4 + 2] = t;
        uvs[p * 4 + 3] = 1;
        tones[p * 2] = i % 2;
        tones[p * 2 + 1] = i % 2;
        if (p < ARM_POINTS - 1) {
          const a = p * 2;
          indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
      geometry.setAttribute('aTone', new THREE.BufferAttribute(tones, 1));
      geometry.setIndex(indices);
      geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1.8);
      const mesh = new THREE.Mesh(geometry, this.armMaterial);
      mesh.frustumCulled = false;
      mesh.renderOrder = 8;
      this.armMeshes.push(mesh);
      this.group.add(mesh);

      const contact = new THREE.Mesh(
        new THREE.RingGeometry(0.026, 0.064, 14),
        new THREE.MeshBasicMaterial({ color: '#ffd4bd', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      contact.position.z = 0.16;
      contact.visible = false;
      contact.renderOrder = 10;
      this.suckerContacts.push(contact);
      this.group.add(contact);
    }

    const eyeWhite = new THREE.MeshBasicMaterial({ color: '#e8eee5' });
    const pupilMat = new THREE.MeshBasicMaterial({ color: '#10191b' });
    for (const side of [-1, 1]) {
      const white = new THREE.Mesh(new THREE.SphereGeometry(0.105, 12, 10), eyeWhite);
      white.position.set(side * 0.19, 0.28, 0.44);
      white.scale.set(1, 0.72, 0.48);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.052, 10, 8), pupilMat);
      pupil.position.set(side * 0.19 + 0.018 * this.facing, 0.275, 0.50);
      pupil.scale.set(0.52, 1, 0.4);
      this.eyeGroup.add(white, pupil);
    }
    this.group.add(this.eyeGroup);

    const suckerMaterial = new THREE.MeshBasicMaterial({ color: '#f3b8a1', transparent: true, opacity: 0.72 });
    for (let i = 0; i < 12; i += 1) {
      const sucker = new THREE.Mesh(new THREE.CircleGeometry(0.025, 8), suckerMaterial);
      const angle = (i / 12) * Math.PI * 2;
      sucker.position.set(Math.cos(angle) * 0.34, -0.17 + Math.sin(angle) * 0.12, 0.51);
      this.group.add(sucker);
    }
    this.group.position.set(this.x, this.y, 2);
    this.updateVisuals(0, BASE_SEA_LEVEL);
  }

  update(dt: number, input: InputState, world: MatterWorld, seaLevel: number, time: number, externalGripContact: SurfaceContact | null = null): OctopusEvents {
    const events: OctopusEvents = {
      jet: false,
      ink: false,
      dig: false,
      interact: false,
      twist: false,
      braceChanged: false,
      camouflageChanged: false,
      gripStarted: false,
      gripReleased: false,
      gripFailed: false,
      eat: false,
      place: false,
      sleep: false,
    };
    this.underwater = this.y < seaLevel - 0.05;
    this.squeezing = input.held.has('KeyS') && (input.held.has('ControlLeft') || input.held.has('ControlRight'));
    this.radius = this.squeezing ? 0.28 : 0.43;
    this.jetCooldown = Math.max(0, this.jetCooldown - dt);
    if (this.jetCharges < 3) {
      this.jetRechargeRemaining = Math.max(0, this.jetRechargeRemaining - dt);
      if (this.jetRechargeRemaining <= 0) {
        this.jetCharges += 1;
        this.jetRechargeRemaining = this.jetCharges < 3 ? 1.15 : 0;
      }
    }
    this.inkCooldown = Math.max(0, this.inkCooldown - dt);
    this.inkTime = Math.max(0, this.inkTime - dt);
    this.techniqueTimer = Math.max(0, this.techniqueTimer - dt);
    this.digRepeatTimer = Math.max(0, this.digRepeatTimer - dt);
    this.jetSteerTime = Math.max(0, this.jetSteerTime - dt);
    if (this.techniqueTimer === 0 && !this.braced) this.technique = this.underwater ? 'swim' : 'crawl';

    if (input.pressed.has('KeyB')) {
      this.braced = !this.braced;
      this.technique = this.braced ? 'brace' : this.underwater ? 'swim' : 'crawl';
      events.braceChanged = true;
    }
    if (input.pressed.has('KeyC')) {
      this.camouflage = !this.camouflage;
      events.camouflageChanged = true;
    }
    if (input.pressed.has('KeyE')) events.interact = true;
    const digHeld = input.held.has('KeyX') || input.held.has('MouseLeft');
    if (input.pressed.has('KeyX') || input.pressed.has('MouseLeft') || (digHeld && this.digRepeatTimer <= 0)) {
      events.dig = true;
      this.digRepeatTimer = 0.29;
    }
    if (!digHeld) this.digRepeatTimer = 0;
    if (input.pressed.has('KeyQ')) {
      events.twist = true;
      this.technique = 'twist';
      this.techniqueTimer = 0.62;
    }
    if (input.pressed.has('KeyZ')) events.eat = true;
    if (input.pressed.has('KeyV')) events.place = true;
    if (input.pressed.has('KeyT')) events.sleep = true;
    if (input.pressed.has('KeyR') && this.underwater && this.inkCooldown <= 0 && this.stamina >= 22) {
      this.stamina -= 22;
      this.inkCooldown = 7;
      this.inkTime = 4.2;
      this.technique = 'ink burst';
      this.techniqueTimer = 0.72;
      events.ink = true;
    }

    const left = input.held.has('KeyA') || input.held.has('ArrowLeft');
    const right = input.held.has('KeyD') || input.held.has('ArrowRight');
    const up = input.held.has('KeyW') || input.held.has('ArrowUp');
    const down = input.held.has('KeyS') || input.held.has('ArrowDown');
    const axisX = Number(right) - Number(left);
    const axisY = Number(up) - Number(down);
    if (axisX) this.facing = Math.sign(axisX);

    const wasGripping = this.gripping;
    const underlying = this.surfaceAdaptation.sampleUnderlying(world, this.x, this.y);
    const gripCandidate = input.held.has('KeyG')
      ? externalGripContact ?? this.surfaceAdaptation.sampleGrippable(world, this.x, this.y)
      : null;
    this.gripping = input.held.has('KeyG') && gripCandidate !== null;
    this.surfaceContact = gripCandidate ?? underlying;
    if (this.gripping && !wasGripping) {
      this.braced = false;
      events.gripStarted = true;
    }
    if (!this.gripping && wasGripping) events.gripReleased = true;
    if (input.pressed.has('KeyG') && !gripCandidate) events.gripFailed = true;

    if (this.surfaceContact) {
      this.camouflageSurface = this.surfaceContact.materialName;
      this.camouflageColor.copy(this.surfaceContact.color);
      this.camouflageAccent.copy(this.surfaceContact.accent);
    } else if (this.underwater) {
      const water = this.surfaceAdaptation.openWaterProfile();
      this.camouflageSurface = water.materialName;
      this.camouflageColor.copy(water.color);
      this.camouflageAccent.copy(water.accent);
    } else {
      this.camouflageSurface = 'open air';
      this.camouflageColor.set('#6f7f7b');
      this.camouflageAccent.set('#93a19a');
    }

    if (this.gripping) {
      const treeGrip = this.surfaceContact?.materialName.includes('tree bark');
      if (treeGrip && axisY !== 0 && this.stamina > 0 && this.surfaceContact) {
        let tangentX = -this.surfaceContact.directionY;
        let tangentY = this.surfaceContact.directionX;
        if (tangentY < 0) { tangentX *= -1; tangentY *= -1; }
        this.vx = tangentX * axisY * 1.68;
        this.vy = tangentY * axisY * 1.68;
        this.stamina = clamp(this.stamina - dt * 6.5, 0, 100);
        this.technique = 'sucker tree climb';
      } else {
        this.vx = 0;
        this.vy = 0;
        this.stamina = clamp(this.stamina + dt * 5, 0, 100);
        this.technique = treeGrip ? 'tree grip' : 'surface grip';
      }
      this.techniqueTimer = 0.12;
    } else if (this.braced) {
      this.vx *= Math.pow(0.03, dt);
      this.vy *= Math.pow(0.03, dt);
      this.stamina = clamp(this.stamina + dt * 12, 0, 100);
    } else if (this.underwater) {
      const accel = this.squeezing ? 5.8 : 8.8;
      this.vx += axisX * accel * dt;
      this.vy += axisY * accel * dt;
      this.vy += 0.5 * dt;
      const damping = Math.pow(0.16, dt);
      this.vx *= damping;
      this.vy *= damping;
      // A breach jet must retain its impulse for several physics frames. If
      // ordinary swim clamping immediately reduced it to 3.1 m/s, the mantle
      // could touch the surface but never launch fully into the air.
      const jetBlastSwimming = this.technique === 'jet blast';
      const maxSpeed = this.technique === 'breach jet' ? 9.4 : jetBlastSwimming ? 7.4 : this.squeezing ? 2.2 : 3.1;
      const speed = Math.hypot(this.vx, this.vy);
      if (speed > maxSpeed) {
        this.vx = (this.vx / speed) * maxSpeed;
        this.vy = (this.vy / speed) * maxSpeed;
      }
      this.stamina = clamp(this.stamina + dt * 10, 0, 100);
    } else {
      this.vx += axisX * 12.5 * dt;
      this.vx *= Math.pow(0.085, dt);
      this.vy -= 12.8 * dt;
      if ((input.pressed.has('Space') || input.pressed.has('KeyW')) && this.onGround && this.stamina >= 8) {
        this.vy = 5.8;
        this.stamina -= 8;
        this.onGround = false;
        this.technique = 'lunge';
        this.techniqueTimer = 0.4;
      }
      const touchingWall = world.isSolid(this.x + this.facing * (this.radius + 0.1), this.y);
      if (touchingWall && up && this.stamina > 0) {
        this.vy = 2.25;
        this.stamina = clamp(this.stamina - dt * 8, 0, 100);
        this.technique = 'sucker climb';
      } else {
        this.stamina = clamp(this.stamina + dt * 7, 0, 100);
      }
    }

    if ((input.pressed.has('ShiftLeft') || input.pressed.has('ShiftRight')) && !this.gripping && this.jetCooldown <= 0 && this.jetCharges > 0 && this.stamina >= 13) {
      const aimed = axisX !== 0 || axisY !== 0;
      let dx = aimed ? axisX : this.facing;
      let dy = axisY;
      const len = Math.hypot(dx, dy) || 1;
      dx /= len;
      dy /= len;
      this.jetEnvironmentScale = this.underwater ? 1 : 0.5;
      const jetScale = this.jetEnvironmentScale;
      this.vx += dx * 7.1 * jetScale;
      this.vy += dy * 7.3 * jetScale + (this.underwater && dy > 0 && this.y > seaLevel - 1.45 ? 5.2 : 0);
      this.lastJetDirection.set(dx, dy);
      this.lastJetStrength = jetScale;
      this.stamina -= 13;
      this.jetCharges -= 1;
      this.jetRechargeRemaining = 1.15;
      this.jetCooldown = 0.18;
      this.jetSteerTime = 0.32;
      this.jetSteerApplied = aimed;
      this.technique = this.underwater ? (dy > 0 && this.y > seaLevel - 1.45 ? 'breach jet' : 'jet burst') : 'land jet';
      this.techniqueTimer = 0.35;
      events.jet = true;
    }

    // A short post-trigger aim window lets players press jet first, then add
    // up + a horizontal direction. Near the surface this becomes a breach.
    if (!this.gripping && this.jetSteerTime > 0 && !this.jetSteerApplied && (axisX !== 0 || axisY !== 0)) {
      let dx = axisX || this.facing;
      let dy = axisY;
      const len = Math.hypot(dx, dy) || 1;
      dx /= len;
      dy /= len;
      this.vx += dx * 4.8 * this.jetEnvironmentScale;
      this.vy += dy * 7.1 * this.jetEnvironmentScale + (this.underwater && dy > 0 && this.y > seaLevel - 1.65 ? 5.4 : 0);
      this.lastJetDirection.set(dx, dy);
      this.facing = Math.sign(dx) || this.facing;
      this.jetSteerApplied = true;
      this.technique = this.underwater ? (dy > 0 && this.y > seaLevel - 1.65 ? 'breach jet' : 'jet burst') : 'land jet';
      this.techniqueTimer = Math.max(this.techniqueTimer, 0.38);
    }

    if (input.pressed.has('Space') && !this.gripping && this.underwater && this.stamina >= 11) {
      this.vx += this.facing * 3.8;
      this.stamina -= 11;
      this.technique = 'corkscrew';
      this.techniqueTimer = 0.55;
    }

    this.moveAndCollide(dt, world);
    this.group.position.set(this.x, this.y, 2);
    const lean = clamp(this.vx * -0.055, -0.25, 0.25);
    this.mantle.rotation.z += (lean - this.mantle.rotation.z) * Math.min(1, dt * 8);
    if (this.technique === 'corkscrew' || this.technique === 'twist') {
      this.group.rotation.z += dt * (this.technique === 'corkscrew' ? 14 : 9) * this.facing;
    } else {
      const speed = Math.hypot(this.vx, this.vy);
      let targetTilt = 0;
      if (this.gripping) {
        targetTilt = 0;
      } else if (this.underwater && speed > 0.16) {
        const leadX = Math.abs(this.vx) > 0.16 ? this.vx : this.facing * 0.28;
        targetTilt = clamp(-Math.atan2(leadX, Math.max(0.35, this.vy + 1.4)), -0.88, 0.88);
      } else if (!this.underwater) {
        targetTilt = clamp(-this.vx * 0.045, -0.35, 0.35);
      }
      const normalizedRotation = Math.atan2(Math.sin(this.group.rotation.z), Math.cos(this.group.rotation.z));
      this.swimTilt = normalizedRotation + (targetTilt - normalizedRotation) * Math.min(1, dt * 6.5);
      this.group.rotation.z = this.swimTilt;
    }
    this.updateArmTrail(dt);
    this.updateVisuals(time, seaLevel);
    return events;
  }

  /**
   * Convert world velocity into the currently rotating body frame. This keeps
   * the arms physically downstream while the mantle turns, instead of bending
   * them along world X/Y as though the octopus never tilted.
   */
  private updateArmTrail(dt: number): void {
    const speed = Math.hypot(this.vx, this.vy);
    const canTrail = this.underwater && !this.braced && !this.gripping && this.technique !== 'twist';
    let targetX = 0;
    let targetY = -1;
    if (canTrail && speed > 0.06) {
      const inverseRotation = -this.group.rotation.z;
      const cosine = Math.cos(inverseRotation);
      const sine = Math.sin(inverseRotation);
      const localVelocityX = this.vx * cosine - this.vy * sine;
      const localVelocityY = this.vx * sine + this.vy * cosine;
      const inverseSpeed = 1 / Math.max(0.001, Math.hypot(localVelocityX, localVelocityY));
      targetX = -localVelocityX * inverseSpeed;
      targetY = -localVelocityY * inverseSpeed;
    }
    const jetting = this.technique.includes('jet');
    const normalizedSpeed = clamp((speed - 0.08) / 2.85, 0, 1);
    const smoothSpeed = normalizedSpeed * normalizedSpeed * (3 - 2 * normalizedSpeed);
    const targetStrength = canTrail ? Math.max(smoothSpeed, jetting ? 1 : 0) : 0;
    const directionResponse = 1 - Math.exp(-dt * (jetting ? 13 : 7.2));
    const strengthResponse = 1 - Math.exp(-dt * (targetStrength > this.armTrailStrength ? 8.5 : 4.2));
    this.armTrailLocal.x += (targetX - this.armTrailLocal.x) * directionResponse;
    this.armTrailLocal.y += (targetY - this.armTrailLocal.y) * directionResponse;
    if (this.armTrailLocal.lengthSq() > 0.0001) this.armTrailLocal.normalize();
    this.armTrailStrength += (targetStrength - this.armTrailStrength) * strengthResponse;
    this.armTrailSpeed = speed;
  }

  private moveAndCollide(dt: number, world: MatterWorld): void {
    const radiusY = this.squeezing ? 0.25 : 0.36;
    const contact = this.sweptContact.move(
      this.x,
      this.y,
      this.vx * dt,
      this.vy * dt,
      { radiusX: this.radius, radiusY },
      world,
    );
    this.onGround = false;
    if (contact.startPenetrating) {
      this.legacyMoveAndCollide(dt, world);
      return;
    }
    this.x = contact.x;
    this.y = contact.y;
    if (contact.collided) {
      const inwardVelocity = this.vx * contact.normalX + this.vy * contact.normalY;
      if (inwardVelocity < 0) {
        this.vx -= contact.normalX * inwardVelocity;
        this.vy -= contact.normalY * inwardVelocity;
      }
      if (contact.normalY > 0.45 && inwardVelocity < 0) this.onGround = true;
    }
    this.x = wrapWorldX(this.x);
    this.y = clamp(this.y, WORLD_MIN_Y + this.radius, WORLD_MAX_Y - this.radius);
  }

  /** Emergency compatibility path for a body already trapped by a collapse. */
  private legacyMoveAndCollide(dt: number, world: MatterWorld): void {
    const nextX = this.x + this.vx * dt;
    if (!this.collides(nextX, this.y, world)) this.x = nextX;
    else this.vx *= -0.08;

    const nextY = this.y + this.vy * dt;
    if (!this.collides(this.x, nextY, world)) this.y = nextY;
    else {
      if (this.vy < 0) this.onGround = true;
      this.vy *= this.underwater ? -0.06 : 0;
      // Small separation pass prevents tunneling into a freshly collapsed pile.
      for (let i = 0; i < 8 && this.collides(this.x, this.y, world); i += 1) this.y += 0.025;
    }
    this.x = wrapWorldX(this.x);
    this.y = clamp(this.y, WORLD_MIN_Y + this.radius, WORLD_MAX_Y - this.radius);
  }

  private collides(x: number, y: number, world: MatterWorld): boolean {
    const rx = this.radius;
    const ry = this.squeezing ? 0.25 : 0.36;
    const samples = 14;
    for (let i = 0; i < samples; i += 1) {
      const a = (i / samples) * Math.PI * 2;
      if (world.isSolid(x + Math.cos(a) * rx, y + Math.sin(a) * ry)) return true;
    }
    return world.isSolid(x, y);
  }

  private updateVisuals(time: number, seaLevel: number): void {
    const speed = Math.hypot(this.vx, this.vy);
    const camoTarget = this.inkTime > 0
      ? new THREE.Color('#2a2042')
      : this.camouflage
        ? this.camouflageColor
        : this.baseColor;
    this.mantleMaterial.color.lerp(camoTarget, 0.08);
    this.mantleMaterial.transparent = this.camouflage || this.inkTime > 0;
    this.mantleMaterial.opacity = this.camouflage ? 0.88 : this.inkTime > 0 ? 0.82 : 1;
    this.eyeGroup.visible = !this.camouflage;
    const mantleWidth = this.gripping ? 1.12 : 1;
    const mantleHeight = this.gripping ? 0.94 : 1.14;
    this.mantle.scale.x += (mantleWidth - this.mantle.scale.x) * 0.12;
    this.mantle.scale.y += (mantleHeight - this.mantle.scale.y) * 0.12;

    this.armMaterial.uniforms.uTime.value = time;
    this.armMaterial.uniforms.uCamo.value = this.camouflage ? 1 : 0;
    this.armMaterial.uniforms.uInk.value = this.inkTime > 0 ? 1 : 0;
    this.armMaterial.uniforms.uAction.value = this.braced || this.gripping || this.technique === 'twist' || this.technique.includes('jet') ? 1 : 0;
    this.armMaterial.uniforms.uWet.value = this.y < seaLevel ? 1 : 0.15;
    (this.armMaterial.uniforms.uCamoColor.value as THREE.Color).copy(this.camouflageColor);
    (this.armMaterial.uniforms.uCamoAccent.value as THREE.Color).copy(this.camouflageAccent);

    for (let arm = 0; arm < ARM_COUNT; arm += 1) {
      const attr = this.armMeshes[arm].geometry.getAttribute('position') as THREE.BufferAttribute;
      const side = arm < 4 ? -1 : 1;
      const row = arm % 4;
      const rootX = side * (0.11 + row * 0.055);
      const rootY = -0.12 - row * 0.045;
      const bracedSpread = this.braced || this.gripping ? 1.35 : 1;
      const trailStrength = this.armTrailStrength;
      const trailX = this.armTrailLocal.x;
      const trailY = this.armTrailLocal.y;
      const trailPerpendicularX = -trailY;
      const trailPerpendicularY = trailX;
      const jetPose = this.technique.includes('jet');
      const centers: Array<{ x: number; y: number }> = [];
      for (let p = 0; p < ARM_POINTS; p += 1) {
        const t = p / (ARM_POINTS - 1);
        const swimSway = Math.sin(time * (3.2 + speed * 0.7) + arm * 1.31 - t * 4.1)
          * (0.1 + t * 0.18) * (1 - trailStrength * 0.58);
        let px = rootX + side * t * (0.34 + row * 0.12) * bracedSpread + swimSway * t;
        let py = rootY - t * (0.45 + row * 0.07) + Math.cos(time * 2.3 + arm + t * 4) * 0.04 * t;
        if (this.underwater && !this.braced && !this.gripping && this.technique !== 'twist') {
          // Faster swimming bundles the arms into the wake while preserving a
          // little perpendicular separation and a delayed tip ripple. During
          // a jet the bundle lengthens and tightens rather than becoming rigid.
          const length = (0.56 + row * 0.105) * (1 + trailStrength * 0.1 + (jetPose ? 0.18 : 0));
          const fan = side * (0.105 + row * 0.024) * (1 - trailStrength * 0.7);
          const wake = Math.sin(time * (4.1 + speed * 0.38) + arm * 1.47 - t * 5.8)
            * (0.032 + t * 0.045) * (1 - trailStrength * 0.42);
          const hydrodynamicX = rootX + trailX * length * t + trailPerpendicularX * (fan * t + wake * t * t);
          const hydrodynamicY = rootY + trailY * length * t + trailPerpendicularY * (fan * t + wake * t * t);
          const blend = clamp(trailStrength * (jetPose ? 1 : 0.9), 0, 1);
          px += (hydrodynamicX - px) * blend;
          py += (hydrodynamicY - py) * blend;
        }
        if (this.gripping && this.surfaceContact) {
          const fan = (row - 1.5) * 0.12 + side * 0.055;
          const reach = 0.5 + row * 0.045;
          const dx = this.surfaceContact.directionX;
          const dy = this.surfaceContact.directionY;
          px = rootX + (dx * reach - dy * fan) * t;
          py = rootY + (dy * reach + dx * fan) * t;
        }
        if (this.technique === 'twist') {
          const twist = t * Math.PI * 2 + time * 10 + arm;
          px = rootX + Math.cos(twist) * t * 0.46;
          py = rootY + Math.sin(twist) * t * 0.46;
        }
        centers.push({ x: px, y: py });
      }
      for (let p = 0; p < ARM_POINTS; p += 1) {
        const t = p / (ARM_POINTS - 1);
        const prev = centers[Math.max(0, p - 1)];
        const next = centers[Math.min(ARM_POINTS - 1, p + 1)];
        const tx = next.x - prev.x;
        const ty = next.y - prev.y;
        const length = Math.hypot(tx, ty) || 1;
        const nx = -ty / length;
        const ny = tx / length;
        const width = (0.073 * Math.pow(1 - t, 0.58) + 0.014) * (this.technique === 'twist' ? 1.14 : 1);
        const center = centers[p];
        const z = 0.035 - arm * 0.006;
        attr.setXYZ(p * 2, center.x + nx * width, center.y + ny * width, z);
        attr.setXYZ(p * 2 + 1, center.x - nx * width, center.y - ny * width, z);
      }
      attr.needsUpdate = true;
      const tip = centers[centers.length - 1];
      const contact = this.suckerContacts[arm];
      contact.position.x = tip.x;
      contact.position.y = tip.y;
      contact.visible = this.braced || this.gripping || this.technique === 'twist';
      const contactMaterial = contact.material as THREE.MeshBasicMaterial;
      contactMaterial.opacity = contact.visible ? 0.45 + Math.sin(time * 8 + arm) * 0.22 : 0;
      const contactScale = 0.72 + Math.sin(time * 7 + arm * 0.9) * 0.16;
      contact.scale.setScalar(contactScale);
    }
  }

  get concealed(): boolean {
    return this.camouflage || this.gripping || this.inkTime > 0;
  }

  get concealmentSource(): 'ink' | 'surface grip' | 'camouflage' | 'none' {
    if (this.inkTime > 0) return 'ink';
    if (this.gripping) return 'surface grip';
    if (this.camouflage) return 'camouflage';
    return 'none';
  }

  get camouflageColorHex(): string {
    return `#${this.camouflageColor.getHexString()}`;
  }

  get gripSurface(): string | null {
    return this.gripping ? this.surfaceContact?.materialName ?? null : null;
  }

  get armTrailSnapshot(): {
    strength: number;
    speed: number;
    localDirection: { x: number; y: number };
    worldDirection: { x: number; y: number };
    mode: 'free' | 'streaming' | 'jet-streamlined' | 'anchored';
  } {
    const cosine = Math.cos(this.group.rotation.z);
    const sine = Math.sin(this.group.rotation.z);
    const worldX = this.armTrailLocal.x * cosine - this.armTrailLocal.y * sine;
    const worldY = this.armTrailLocal.x * sine + this.armTrailLocal.y * cosine;
    const anchored = this.braced || this.gripping;
    return {
      strength: Number(this.armTrailStrength.toFixed(2)),
      speed: Number(this.armTrailSpeed.toFixed(2)),
      localDirection: { x: Number(this.armTrailLocal.x.toFixed(2)), y: Number(this.armTrailLocal.y.toFixed(2)) },
      worldDirection: { x: Number(worldX.toFixed(2)), y: Number(worldY.toFixed(2)) },
      mode: anchored ? 'anchored' : this.technique.includes('jet') ? 'jet-streamlined' : this.armTrailStrength > 0.12 ? 'streaming' : 'free',
    };
  }

  get sweptContactSnapshot(): SweptContactSnapshot {
    return this.sweptContact.snapshot();
  }

  canBrace(world: MatterWorld): boolean {
    for (let i = 0; i < 12; i += 1) {
      const a = (i / 12) * Math.PI * 2;
      if (world.isSolid(this.x + Math.cos(a) * 0.72, this.y + Math.sin(a) * 0.58)) return true;
    }
    return false;
  }

  isInDen(): boolean {
    return this.x > -15.8 && this.x < -11.1 && this.y > 1.45 && this.y < 4.45;
  }

  performJetBlast(direction: THREE.Vector2, staminaCost: number): void {
    const normalized = direction.lengthSq() > 0.001 ? direction.clone().normalize() : new THREE.Vector2(this.facing, 0);
    this.stamina = clamp(this.stamina - staminaCost, 0, 100);
    this.jetCharges = 0;
    this.jetRechargeRemaining = 1.55;
    this.jetCooldown = 0.85;
    this.lastJetDirection.copy(normalized);
    this.lastJetStrength = 3.5;
    // Jet Blast is a whole-mantle surge as well as a pressure weapon. Drive
    // the body along the aimed stream so it can breach, escape or follow the
    // tunnel it just opened; the higher temporary swim cap preserves the
    // impulse instead of erasing it on the next physics step.
    this.vx += normalized.x * 6.15;
    this.vy += normalized.y * 6.15;
    this.jetSteerTime = 0.34;
    this.jetSteerApplied = true;
    this.facing = Math.sign(normalized.x) || this.facing;
    this.technique = 'jet blast';
    this.techniqueTimer = 0.9;
  }

  digPoint(direction?: THREE.Vector2): { x: number; y: number } {
    const aimed = direction && direction.lengthSq() > 0.001
      ? direction.clone().normalize()
      : new THREE.Vector2(this.facing, -0.04).normalize();
    return { x: this.x + aimed.x * 0.72, y: this.y + aimed.y * 0.72 };
  }
}
