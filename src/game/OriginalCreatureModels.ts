import * as THREE from 'three';

export type OriginalCreatureKind =
  | 'clownfish'
  | 'reef-fish'
  | 'orca'
  | 'abyss-manta'
  | 'cyan-abyss-hunter'
  | 'animated-shore-crab'
  | 'coconut-crab'
  | 'ilyoplax-mud-crab'
  | 'survivor-octopus';

const standard = (color: string, roughness = 0.72, emissive = '#000000', emissiveIntensity = 0) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.01, emissive, emissiveIntensity, side: THREE.DoubleSide });

const addEllipsoid = (root: THREE.Group, color: string, scale: [number, number, number], position: [number, number, number] = [0, 0, 0]): THREE.Mesh => {
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 9), standard(color));
  body.scale.set(...scale);
  body.position.set(...position);
  root.add(body);
  return body;
};

const addTriangle = (root: THREE.Group, color: string, points: Array<[number, number]>, z = 0): THREE.Mesh => {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let index = 1; index < points.length; index += 1) shape.lineTo(points[index][0], points[index][1]);
  shape.closePath();
  const fin = new THREE.Mesh(new THREE.ShapeGeometry(shape), standard(color, 0.82));
  fin.position.z = z;
  root.add(fin);
  return fin;
};

const addEye = (root: THREE.Group, x: number, y: number, z: number, scale = 1): void => {
  const white = addEllipsoid(root, '#d9eee8', [0.07 * scale, 0.07 * scale, 0.035 * scale], [x, y, z]);
  white.material = standard('#d9eee8', 0.35);
  addEllipsoid(root, '#071317', [0.032 * scale, 0.044 * scale, 0.018 * scale], [x + 0.012 * scale, y, z + 0.034 * scale]);
};

const fish = (bodyColor: string, finColor: string, pattern: 'stripe' | 'spots' | 'plain'): THREE.Group => {
  const root = new THREE.Group();
  addEllipsoid(root, bodyColor, [1.1, 0.58, 0.34]);
  addTriangle(root, finColor, [[-0.88, 0], [-1.45, 0.52], [-1.28, 0], [-1.45, -0.52]], -0.01);
  addTriangle(root, finColor, [[-0.1, 0.42], [-0.48, 0.82], [0.3, 0.43]], -0.03);
  addTriangle(root, finColor, [[0.05, -0.36], [-0.28, -0.68], [0.45, -0.34]], 0.02);
  addTriangle(root, finColor, [[0.05, 0.05], [-0.42, -0.02], [-0.15, -0.32]], 0.34);
  addEye(root, 0.64, 0.14, 0.31, 1.15);
  if (pattern === 'stripe') {
    for (const x of [-0.48, 0.12, 0.56]) addEllipsoid(root, '#f4eee0', [0.12, 0.54, 0.345], [x, 0, 0]);
  } else if (pattern === 'spots') {
    for (const [x, y] of [[-0.42, 0.18], [-0.04, -0.21], [0.35, 0.24], [0.52, -0.12]]) {
      addEllipsoid(root, '#79d6ca', [0.08, 0.08, 0.348], [x, y, 0]);
    }
  }
  root.userData.originalCreatureModel = true;
  return root;
};

const orca = (): THREE.Group => {
  const root = new THREE.Group();
  addEllipsoid(root, '#111c23', [1.9, 0.68, 0.58]);
  addEllipsoid(root, '#e8efea', [1.08, 0.28, 0.575], [0.28, -0.28, 0.01]);
  addEllipsoid(root, '#eef5ef', [0.22, 0.12, 0.582], [0.92, 0.2, 0]);
  addTriangle(root, '#111c23', [[-0.1, 0.42], [-0.48, 1.18], [0.32, 0.44]], -0.1);
  addTriangle(root, '#111c23', [[-0.08, -0.12], [-0.7, -0.76], [0.48, -0.24]], 0.38);
  addEllipsoid(root, '#111c23', [0.72, 0.31, 0.3], [-1.38, 0, 0]);
  addTriangle(root, '#111c23', [[-1.58, 0], [-2.03, 0.38], [-1.84, 0], [-2.03, -0.38]], 0);
  addEye(root, 1.16, 0.16, 0.53, 0.72);
  root.userData.originalCreatureModel = true;
  return root;
};

const manta = (): THREE.Group => {
  const root = new THREE.Group();
  const wing = new THREE.Shape();
  wing.moveTo(1.0, 0);
  wing.bezierCurveTo(0.45, 0.78, -0.35, 1.18, -1.45, 0.45);
  wing.bezierCurveTo(-0.82, 0.1, -0.82, -0.1, -1.45, -0.45);
  wing.bezierCurveTo(-0.35, -1.18, 0.45, -0.78, 1.0, 0);
  const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(wing, { depth: 0.12, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.06, bevelSegments: 2 }), standard('#294b5c', 0.7, '#0b2938', 0.12));
  mesh.rotation.x = Math.PI / 2;
  root.add(mesh);
  addEllipsoid(root, '#375d68', [0.95, 0.2, 0.25], [0.1, 0, 0.08]);
  addTriangle(root, '#274657', [[-0.6, 0.08], [-2.5, 0], [-0.6, -0.08]], -0.03);
  addEye(root, 0.73, 0.16, 0.27, 0.65);
  root.userData.originalCreatureModel = true;
  return root;
};

const cylinderBetween = (root: THREE.Group, a: THREE.Vector3, b: THREE.Vector3, radius: number, material: THREE.Material): THREE.Mesh => {
  const midpoint = a.clone().add(b).multiplyScalar(0.5);
  const length = a.distanceTo(b);
  const limb = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.8, length, 7), material);
  limb.position.copy(midpoint);
  limb.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  root.add(limb);
  return limb;
};

const crab = (shell: string, leg: string, clawScale: number, tall = false): THREE.Group => {
  const root = new THREE.Group();
  addEllipsoid(root, shell, [0.78, tall ? 0.5 : 0.36, 0.48], [0, 0.05, 0]);
  const legMaterial = standard(leg, 0.88);
  for (const side of [-1, 1]) {
    for (let index = 0; index < 4; index += 1) {
      const y = 0.16 - index * 0.13;
      const hip = new THREE.Vector3(-0.35 + index * 0.22, y, side * 0.32);
      const knee = new THREE.Vector3(-0.48 + index * 0.24, y - 0.12, side * (0.58 + index * 0.03));
      const foot = new THREE.Vector3(-0.62 + index * 0.28, y - 0.32, side * (0.72 + index * 0.02));
      cylinderBetween(root, hip, knee, 0.045, legMaterial);
      cylinderBetween(root, knee, foot, 0.035, legMaterial);
    }
  }
  for (const side of [-1, 1]) {
    const armBase = new THREE.Vector3(0.42, 0.05, side * 0.27);
    const clawBase = new THREE.Vector3(0.76, 0.1, side * 0.48);
    cylinderBetween(root, armBase, clawBase, 0.07, legMaterial);
    addEllipsoid(root, shell, [0.28 * clawScale, 0.18 * clawScale, 0.12 * clawScale], [0.9, 0.12, side * 0.5]);
    addTriangle(root, shell, [[0.78, 0.13], [1.18, 0.3], [1.02, 0.08]], side * 0.5);
  }
  addEye(root, 0.42, 0.27, 0.26, 0.75);
  root.userData.originalCreatureModel = true;
  return root;
};

const octopus = (): THREE.Group => {
  const root = new THREE.Group();
  addEllipsoid(root, '#5b2f58', [0.62, 0.7, 0.55], [0.2, 0.28, 0]);
  addEllipsoid(root, '#75406d', [0.52, 0.34, 0.48], [0.05, -0.13, 0]);
  const tentacleMaterial = standard('#5b2f58', 0.84);
  for (let index = 0; index < 8; index += 1) {
    const angle = (index / 8) * Math.PI * 2;
    const z = Math.sin(angle) * 0.28;
    const spread = Math.cos(angle) * 0.62;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.05, -0.18, z * 0.45),
      new THREE.Vector3(-0.28, -0.42 + spread * 0.18, z),
      new THREE.Vector3(-0.78, -0.5 + spread * 0.42, z * 0.65),
      new THREE.Vector3(-1.1 - (index % 2) * 0.18, -0.34 + spread * 0.65, z * 0.25),
    ]);
    root.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 10, 0.045, 6, false), tentacleMaterial));
  }
  addEye(root, 0.43, 0.24, 0.48, 1.1);
  addEye(root, 0.43, 0.24, -0.48, 1.1);
  root.userData.originalCreatureModel = true;
  return root;
};

export const buildOriginalCreatureModel = (kind: OriginalCreatureKind): THREE.Group => {
  if (kind === 'clownfish') return fish('#e66f35', '#b94d2c', 'stripe');
  if (kind === 'reef-fish') return fish('#387b88', '#efc75c', 'spots');
  if (kind === 'orca') return orca();
  if (kind === 'abyss-manta') return manta();
  if (kind === 'cyan-abyss-hunter') return fish('#174552', '#6bded4', 'spots');
  if (kind === 'animated-shore-crab') return crab('#b95d42', '#753d35', 1.05);
  if (kind === 'coconut-crab') return crab('#486d78', '#2e4d5a', 1.45, true);
  if (kind === 'ilyoplax-mud-crab') return crab('#b78b62', '#6f5947', 0.82);
  return octopus();
};
