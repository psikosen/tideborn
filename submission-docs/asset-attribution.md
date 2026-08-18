# Tideborn Asset Licenses and Attribution

This inventory covers every third-party runtime file and generated graphical asset in the Tideborn contest package.

## Runtime library

- **Three.js** - MIT License, copyright Three.js authors. The package includes the complete license at `vendor/LICENSE.three.txt`.

## Imported GLB models

All six shipped creature models are licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Tideborn changes their runtime scale, orientation, material roughness, emissive response, lighting, animation playback speed where applicable, and surrounding effect composition.

| Runtime file | Work and creator | Original source |
| --- | --- | --- |
| `assets/models/shark-animated.glb` | *Shark - Animated Low Poly* by [WildPoly3D](https://sketchfab.com/WildPoly3D) | [Sketchfab model](https://sketchfab.com/3d-models/shark-animated-low-poly-e5d8d8b011f548de98bc0796680ed7cd) |
| `assets/models/deep/twilight-emperor.glb` | *Fishe* by [bukharig0300](https://sketchfab.com/bukharig0300) | [Sketchfab model](https://sketchfab.com/3d-models/fishe-4051823a2c6044d0bab48ef7fa806b69) |
| `assets/models/deep/midnight-angler.glb` | *Cartoon Angler Fish (animated)* by [Jungle Jim](https://sketchfab.com/jungle_jim) | [Sketchfab model](https://sketchfab.com/3d-models/cartoon-angler-fish-animated-9c6505330419431b8c42170a42c655ec) |
| `assets/models/deep/abyss-spinefish-lod.glb` | *Deep Sea Fish #3DSM4* by [Carlo Bergonzini](https://sketchfab.com/carlo-bergonzini); Tideborn runtime derivative retains the authored `FishLOW_0` specimen and reduces its triangle count | [Sketchfab model](https://sketchfab.com/3d-models/deep-sea-fish-3dsm4-6ee4e67640794f7b8cecd10295ab2f55) |
| `assets/models/deep/hadal-stalker.glb` | *SculptJanuary01-Beast: Deep Sea* by [Mateus Schwaab](https://sketchfab.com/Mehrus) | [Sketchfab model](https://sketchfab.com/3d-models/sculptjanuary01-beast-deep-sea-d87becf784dc4dbd88935af2ff5e0b60) |
| `assets/models/deep/bloodfin-leviathan.glb` | *Bloodfin Leviathan - fish* by [Brian Trepanier](https://sketchfab.com/CMBC) | [Sketchfab model](https://sketchfab.com/3d-models/bloodfin-leviathan-fish-345a4493a1d24280b10562b9839e76f6) |

## Original code-built creature models

Clownfish, reef fish, orcas, manta rays, cyan abyss hunters, three crab families, and neighboring octopuses are original Tideborn geometry assembled at runtime from Three.js meshes and curves in `OriginalCreatureModels.ts`. They do not ship imported source-model files.

## Project-generated graphical assets

- `assets/tools/*` - generated specifically for Tideborn with OpenAI image generation, then chroma-keyed and cropped. The prompt and retained source atlas are recorded in `art/tool-icons/GENERATION.md` in the development project.
- `assets/minerals/*.png` - generated specifically for Tideborn with OpenAI image generation, then chroma-keyed and cropped. The prompt and retained source atlas are recorded in `art/minerals/GENERATION.md`.
- `assets/resources/*.png` - generated specifically for Tideborn with OpenAI image generation, then cell-contained, chroma-keyed, component-checked, and cropped. Prompts and processing records are in `art/resources/GENERATION.md` and `output/resource-icon-generation/`.
- `assets/trees/variants/*.png` - generated specifically for Tideborn with OpenAI image generation and processed into terrain props. The generation session is recorded in `progress.md`.
- All remaining shaders, UI panels, procedural terrain, creature silhouettes, octopus geometry, particles, and icons are entrant project code/assets produced during the documented AI-assisted sessions.
