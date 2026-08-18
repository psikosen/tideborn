import { readFile, writeFile } from 'node:fs/promises';
import { MeshoptSimplifier } from 'meshoptimizer';

const sourceUrl = new URL('../public/assets/models/deep/abyss-spinefish.glb', import.meta.url);
const destinationUrl = new URL('../public/assets/models/deep/abyss-spinefish-lod.glb', import.meta.url);
const source = await readFile(sourceUrl);

const jsonChunkLength = source.readUInt32LE(12);
const jsonChunkType = source.readUInt32LE(16);
if (jsonChunkType !== 0x4e4f534a) throw new Error('Expected JSON as the first GLB chunk.');
const document = JSON.parse(source.subarray(20, 20 + jsonChunkLength).toString('utf8'));
const binHeaderOffset = 20 + jsonChunkLength;
const binLength = source.readUInt32LE(binHeaderOffset);
const binType = source.readUInt32LE(binHeaderOffset + 4);
if (binType !== 0x004e4942) throw new Error('Expected BIN as the second GLB chunk.');
const binary = Buffer.from(source.subarray(binHeaderOffset + 8, binHeaderOffset + 8 + binLength));

const componentBytes = (componentType) => componentType === 5120 || componentType === 5121
  ? 1
  : componentType === 5122 || componentType === 5123
    ? 2
    : componentType === 5125 || componentType === 5126
      ? 4
      : 0;
const readIndex = (view, offset, componentType) => componentType === 5121
  ? view.getUint8(offset)
  : componentType === 5123
    ? view.getUint16(offset, true)
    : view.getUint32(offset, true);
const writeIndex = (view, offset, componentType, value) => {
  if (componentType === 5121) view.setUint8(offset, value);
  else if (componentType === 5123) view.setUint16(offset, value, true);
  else view.setUint32(offset, value, true);
};

await MeshoptSimplifier.ready;
const report = [];
for (const [meshIndex, mesh] of (document.meshes ?? []).entries()) {
  for (const [primitiveIndex, primitive] of mesh.primitives.entries()) {
    if ((primitive.mode ?? 4) !== 4 || primitive.indices === undefined || primitive.attributes.POSITION === undefined) continue;
    const indexAccessor = document.accessors[primitive.indices];
    const indexView = document.bufferViews[indexAccessor.bufferView];
    const indexSize = componentBytes(indexAccessor.componentType);
    if (!indexSize) continue;
    const indexOffset = (indexView.byteOffset ?? 0) + (indexAccessor.byteOffset ?? 0);
    const dataView = new DataView(binary.buffer, binary.byteOffset, binary.byteLength);
    const indices = new Uint32Array(indexAccessor.count);
    for (let index = 0; index < indices.length; index += 1) {
      indices[index] = readIndex(dataView, indexOffset + index * indexSize, indexAccessor.componentType);
    }

    const positionAccessor = document.accessors[primitive.attributes.POSITION];
    const positionView = document.bufferViews[positionAccessor.bufferView];
    if (positionAccessor.type !== 'VEC3') continue;
    const positionOffset = (positionView.byteOffset ?? 0) + (positionAccessor.byteOffset ?? 0);
    const positionComponentBytes = componentBytes(positionAccessor.componentType);
    if (!positionComponentBytes) continue;
    const positionStrideBytes = positionView.byteStride ?? positionComponentBytes * 3;
    const readPosition = (offset) => {
      if (positionAccessor.componentType === 5126) return dataView.getFloat32(offset, true);
      if (positionAccessor.componentType === 5122) return Math.max(-1, dataView.getInt16(offset, true) / 32767);
      if (positionAccessor.componentType === 5123) return dataView.getUint16(offset, true) / 65535;
      if (positionAccessor.componentType === 5120) return Math.max(-1, dataView.getInt8(offset) / 127);
      if (positionAccessor.componentType === 5121) return dataView.getUint8(offset) / 255;
      return dataView.getUint32(offset, true);
    };
    const positions = new Float32Array(positionAccessor.count * 3);
    for (let vertex = 0; vertex < positionAccessor.count; vertex += 1) {
      const offset = positionOffset + vertex * positionStrideBytes;
      positions[vertex * 3] = readPosition(offset);
      positions[vertex * 3 + 1] = readPosition(offset + positionComponentBytes);
      positions[vertex * 3 + 2] = readPosition(offset + positionComponentBytes * 2);
    }

    const targetCount = Math.max(12, Math.floor(indexAccessor.count * 0.28 / 3) * 3);
    const [simplified, error] = MeshoptSimplifier.simplify(indices, positions, 3, targetCount, 0.04);
    for (let index = 0; index < simplified.length; index += 1) {
      writeIndex(dataView, indexOffset + index * indexSize, indexAccessor.componentType, simplified[index]);
    }
    indexAccessor.count = simplified.length;
    if (indexAccessor.max) indexAccessor.max[0] = simplified.reduce((maximum, value) => Math.max(maximum, value), 0);
    if (indexAccessor.min) indexAccessor.min[0] = simplified.reduce((minimum, value) => Math.min(minimum, value), Number.POSITIVE_INFINITY);
    report.push({
      meshIndex,
      primitiveIndex,
      beforeTriangles: indices.length / 3,
      afterTriangles: simplified.length / 3,
      retained: Number((simplified.length / indices.length).toFixed(3)),
      error: Number(error.toFixed(5)),
    });
  }
}

// The source GLB is a Sketchfab collection of ten widely separated models,
// not one creature. Rendering the whole collection compressed into a single
// gameplay body creates the blue rectangular mismatch seen in the abyss.
// Keep the authored FishLOW specimen as Tideborn's spinefish and leave the
// original multi-model source untouched beside this generated runtime LOD.
const selectedNodeNames = new Set(['FishLOW_0']);
for (const scene of document.scenes ?? []) {
  scene.nodes = (scene.nodes ?? []).filter((nodeIndex) => selectedNodeNames.has(document.nodes?.[nodeIndex]?.name));
}

const jsonSource = Buffer.from(JSON.stringify(document));
const jsonPadding = (4 - jsonSource.length % 4) % 4;
const json = Buffer.concat([jsonSource, Buffer.alloc(jsonPadding, 0x20)]);
const binPadding = (4 - binary.length % 4) % 4;
const bin = Buffer.concat([binary, Buffer.alloc(binPadding)]);
const output = Buffer.alloc(12 + 8 + json.length + 8 + bin.length);
output.writeUInt32LE(0x46546c67, 0);
output.writeUInt32LE(2, 4);
output.writeUInt32LE(output.length, 8);
output.writeUInt32LE(json.length, 12);
output.writeUInt32LE(0x4e4f534a, 16);
json.copy(output, 20);
const outputBinOffset = 20 + json.length;
output.writeUInt32LE(bin.length, outputBinOffset);
output.writeUInt32LE(0x004e4942, outputBinOffset + 4);
bin.copy(output, outputBinOffset + 8);
await writeFile(destinationUrl, output);

const beforeTriangles = report.reduce((sum, entry) => sum + entry.beforeTriangles, 0);
const afterTriangles = report.reduce((sum, entry) => sum + entry.afterTriangles, 0);
console.log(JSON.stringify({
  source: sourceUrl.pathname,
  destination: destinationUrl.pathname,
  beforeTriangles,
  afterTriangles,
  retained: Number((afterTriangles / beforeTriangles).toFixed(3)),
  selectedNodes: [...selectedNodeNames],
  primitives: report,
}, null, 2));
