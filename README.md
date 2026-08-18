# Tideborn

Tideborn is a playable Three.js/HTML5 vertical slice for a planetary 2.5D survival game. You control a future-evolved amphibious octopus in a deterministic, granular coastal cross-section. Gather food, hunt fish, physically uproot kelp, craft rope technology, excavate a network of dens, and survive the storm arriving on day three.

## Run it

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

Production build:

```bash
npm run build
npm run preview
```

## Controls

| Input | Action |
| --- | --- |
| WASD / arrows | Crawl, swim, and climb |
| Shift | Spend one of three regenerating jet charges. Water jets propel at full strength; retained-water land jets work at half travel strength. Nearby animals are pushed radially away. |
| R | Ink Burst concealment underwater |
| H | Pounce on a nearby fish; an equipped net increases reach |
| Space | Lunge on land / corkscrew underwater |
| E | Grab, gather, pry, or inspect |
| B | Brace against nearby terrain |
| Q | Twist a grabbed rooted plant |
| Hold X / left mouse | Dig toward the live mouse reticle; persistent scraping eventually breaks clay even with bare arms |
| Right mouse / K | Use the learned mouse-aimed Jet Blast underwater. It requires 80 mastery, all three jet charges, and 70 stamina. |
| Tab / 1–8 | Cycle or directly equip tools from the floating hotbar |
| Z | Eat one food |
| Y | Season one fresh food with one sea-salt crystal |
| N | Claim any sufficiently large, enclosed natural or player-excavated chamber as another den |
| Hold G | Grip a nearby floor, wall, or ceiling; stop moving and hide from predators while attached |
| J | Reinforce the active claimed den with two ironstone nodules |
| V | Place crafted equipment in the active den; the first carried glow-kelp becomes that den's permanent steady lamp |
| I | Open or close crafting |
| C | Toggle adaptive camouflage; chromatophores match the live terrain material beneath the body |
| Ctrl + S | Squeeze through a narrow passage |
| T | Sleep inside the den |
| M | Open or close the planetary scale atlas |
| Esc | Pause or close crafting |
| F | Toggle fullscreen |

Kelp without an equipped blade uses a physical chain: press **E** to grip it, **B** to brace against the substrate, then **Q** to twist and uproot it. Uprooting gives a larger harvest but reduces kelp cover and sediment stability.

The abyss route has a biological visibility requirement. Harvest the luminous seaweed colony with **E** before crossing 1,100 m of canonical depth. Without it, the octopus may keep descending, but black water removes every visible landmark. While carried, the fronds attach to an arm and create a limited living-light halo whose rays stop against live terrain cells.

## Prototype architecture

- `MatterWorld`: deterministic 1024×1024 typed-array material field rendered through a `THREE.DataTexture` and custom shader. It handles material hardness, displaced excavation matter, granular settling, storm sediment, local flooding, and a continuous planetary seam.
- `Octopus`: central collision body plus eight tapered procedural ribbon arms, with action-aware curves, a shared chromatophore/caustic/sucker shader, and animated contact points for bracing and twisting.
- `SurfaceAdaptationSystem`: live microcell contact sampling for material-matched chromatophore palettes and floor/wall/ceiling sucker grips.
- `CreatureLifecycleSystem`: shared deterministic life-history clock for individual genetic size, juvenile growth, sex/colony reproduction, maturity, breeding intervals, parentage, generations, population caps, and natural/predation/harvest deaths.
- `CreatureCollisionSystem`: deterministic multi-pass ellipse separation for differently proportioned fauna, with collision layers, inverse-mass response, stationary anchors, velocity cancellation, and serializable contact telemetry.
- `AquaticTerrainCollisionSystem`: material-grid body sampling, anticipatory obstacle steering, axis sliding, and nearest-opening recovery for swimming fauna; it depends only on an `isSolid` interface so streamed chunks can replace the current matter field.
- `TechniqueVFXSystem`: exported data-driven linear/radial presets, travel-impact-fade lifecycles, capped effect pools, and GPU-updated particles for jet, ink, twist, digging, feeding, bioluminescence, and vent plumes.
- `PointerAimSystem`: reusable orthographic browser-to-world aiming, directional dig contacts, and a world-space sucker/tool reticle shared by excavation and Jet Blast.
- `JetBlastSystem`: jet/excavation mastery, readiness costs, cooldowns, large no-pile terrain shock excavation, mineral yield, directional fauna knockback, and close-range predator kills.
- `ProceduralLandmassSystem`: deterministic wrapped silhouettes spanning needle islets, compact hills, broad mountain ranges, and continent-scale forms instead of repeated equal triangles.
- `ProceduralTreeSystem`: six generated alpha-clean tree silhouettes with deterministic surface placement, habitat weighting, scale/tint variation, and storm sway.
- `PredatorAlertVisual`: reusable red spotted-player and amber last-known-position waves shared by orcas, sixgills, gulper eels, and every predatory imported deep fish.
- `MarineLifeSystem`: a 72-founder reef that can breed toward 96 varied-size fish, player hunting, anemone predation, terrain/body collision, nursery cohorts, biological turnover, proximity activation, 18 distributed imported hero models, and a one-draw instanced shoal for the remaining population.
- `DeepSeaLifeSystem`: varied-size, age-tracked orcas, sixgill sharks, lantern-fish schools, gulper eels, siphonophores, and giant isopods with predator/prey targeting, body-contact attacks, collision separation, breeding and growth, last-known-position searches, player-ability reactions, and a serializable food-web state.
- `DeepSeaShoalSystem`: 161 founding lanternfish, bristlemouths, silver hatchetfish, hadal snailfish, and blind megacave glassfish. Only the nearby depth band receives flocking, spatial-hash body/terrain collision, predator avoidance, player hunting, and instanced rendering; hidden fish retain age, genealogy, and ecosystem state. Regional summaries represent more than 1.8 million deep fish without rendering them individually.
- `AmphibiousCrabSystem`: shore, mudflat, and coconut crabs with imported representative models, procedural fallbacks, terrain-following land/water locomotion, collision, lifespan, breeding, off-screen culling, fish/clam predation, player hunting, pinches, and jet-wash response.
- `ProceduralClamSystem`: 120 interactive visible representatives culled from an 18,400-animal reef-to-megacave population. Grip with `E`, then repeatedly pry with aimed dig input; crabs can find and consume the same clam entities.
- `DeepAssetFaunaSystem`: sparse imported hero fauna layered over the shoals: twilight emperors, animated abyssal mantas, animated midnight anglers, abyssal spinefish, cyan hunters, hadal crown-stalkers, and bloodfin leviathans. It owns lazy depth-band loading, lifecycle state, terrain/body collision, pursuit, player attacks, ability reactions, and a predator field consumed by the shoal food web.
- `CreatureAssetLibrary`: lazy, cached GLB loading and skinned-animation playback for imported fish, sharks, and the orca, with normalized scale and automatic procedural fallbacks.
- `ToolbeltSystem`: stable eight-slot equipment definitions, ownership and selection rules, hotbar cycling/direct selection, generated icon metadata, and tool-specific interaction profiles.
- `MineralResourceSystem`: excavation-yield accumulation, deterministic geology-aware mineral selection, generated-art world pickups, collection queries, and serializable nearby-drop state for salt, ironstone, copper, obsidian, quartz, and manganese.
- `DenNetworkSystem`: independently claimed chamber sites, shelter-ray validation, wrapped-world distance checks, per-den furnishing/food/reinforcement state, and network-wide preparedness totals.
- `PlanetScaleSystem`: canonical planet dimensions, wrapped longitude, seawater pressure, Earth/Moon comparison, depth-zone definitions, and the boundary between local matter meters and planetary streaming.
- `PlanetBeltTraversalSystem`: converts the finite active cell belt into continuous canonical longitude, counts complete revolutions, and coordinates seamless east/west wrapping without exposing a map boundary.
- `DepthAccessSystem`: maps the local cave route onto canonical ocean depth and reports black-water/biolight navigation state without placing an invisible movement gate.
- `OccludedLightSystem`: casts 160 CPU rays through the live 2D matter grid and uploads a tiny radial visibility texture. The GPU darkness shader uses it for terrain shadows, soft penumbra, living-light pulse, and tunnel daylight loss; digging changes the mask immediately.
- `TidebornGame`: planet-belt scene, orthographic camera, water/sky shaders, resource interactions, twelve core recipe outcomes plus mineral alternatives, den-network integration, survival, ecosystem summaries, weather, wildlife, save snapshots, and objective flow.
- `render_game_to_text()`: concise, machine-readable live state for automated or accessible testing.
- `advanceTime(ms)`: deterministic stepping for gameplay tests; long skips use bounded regional-summary slices.

## Current slice

The project proves the first continuous planetary belt: the player can complete revolutions without encountering a horizontal wall or exposed texture edge. The active belt contains the coast, continent, open ocean, extended trench, and hydrothermal field in a deterministic loop. Each day/night cycle lasts 90 seconds, with the major storm beginning late on day three at 243 seconds. Multiple latitude bands, richer regional populations, and GPU/WASM matter backends remain future layers behind the existing module boundaries.

## Canonical world scale

Pelagos-730 is intentionally smaller than Earth but much larger than the Moon:

| Measurement | Tideborn | Comparison |
| --- | ---: | --- |
| Planet radius | 5,200 km | 0.82× Earth; 2.99× the Moon's radius |
| Equatorial circumference | 32,673 km | 0.82× Earth |
| Surface gravity | 0.88 g | Strong enough for familiar falling matter |
| Ocean coverage | 88% | Earth is approximately 71% |
| Mean ocean depth | 7.2 km | Roughly 1.95× Earth's mean |
| Deepest open trench | 32 km | Roughly 2.91 Mariana Trench depths |
| Navigable water-rock shell | 21–987 km depth | Speculative high-pressure ocean and connected megacaves |
| Estimated ocean volume | 1.61× Earth | Smaller globe offset by broader, much deeper oceans |

The active granular belt is now 128 × 128 m with 12.5 cm simulation cells (1024×1024). It wraps onto Pelagos-730's 32,673 km canonical equatorial circumference, so crossing either edge continues at the opposite longitude and increments the revolution counter. The long-term modified-terrain target remains 2 cm cells in streamed 128 × 128-cell chunks (2.56 m per chunk).

The current belt includes the main continent plus two separated remote islands: a narrow volcanic-style islet and a much broader forestable island with open ocean between them. Parallax generation uses six landmass profiles ranging from roughly 4.4 m to 45.8 m wide in the active-field representation, then repeats those profiles continuously across the wrapped visual belt.

The hydrothermal route now requires over 105 m of actual local descent—more than five times the original field's entire water column—before reaching the canonically 27 km hadal field at approximately 2,685 atmospheres. The old local floor remains in the bright transition region. Full black arrives only in the extended lower trench; with biolight, only terrain-visible rays, vent emissions, and nearby organisms are revealed.

Deep-fish communities change with the descent. Lanternfish occupy the twilight-to-midnight transition, bristlemouths dominate the midnight water, silver hatchetfish range through the abyss, pressure-adapted snailfish inhabit the hadal route, and blind glassfish fill the first streamed megacaves. Their tiny photophores are visible only where carried or placed biolight reaches them. Sixgills, orcas, gulper eels, anglers, spinefish, cyan hunters, crown-stalkers, and bloodfins pursue these schools. A caught fish spirals into the predator before a pooled feeding effect and a short satiated state make the successful hunt visible. Fish flee active predators and jet wash, and the octopus can pounce or sweep a net with `H` just as it can in the reef.

Pelagos-730 now uses a deliberately speculative interior: the oceanic crust is 21 km thick and the lower mantle is 945 km thick, exactly half their earlier sizes. The reclaimed 966 km forms a connected abyssal water-rock shell between 21 and 987 km depth. The core still begins 2,730 km down, so the planet radius and core proportions do not move. Only nearby megacave rooms become full matter geometry; the rest stays in deterministic population and habitat summaries.

Three crab ecologies cross the shoreline. Animated striped shore crabs and tiny Ilyoplax crabs forage in wet terrain and enter land, while long-lived coconut crabs patrol exposed ground and defend themselves with damaging pinches. Crabs hunt low-swimming fish and crack procedural clams; the player can hunt them with `H`, and Jet Burst throws them back. All three retain age, sex, size, lifespan, breeding state, collision, and off-screen population state.

Seven optimized user-supplied GLBs now materialize as rare deep fauna. The original files totaled roughly 107 MB; geometry simplification, quantization, WebP texture conversion, and texture caps reduce the shipped set to about 11 MB while retaining the animated manta, emperor, and angler rigs. These models load only when their local depth habitat approaches the active bubble. Bloodfins, cyan hunters, spinefish, anglers, and crown-stalkers hunt the streamed fish populations; mantas filter-feed and twilight emperors cruise without targeting the player.

Each den is claimed dynamically rather than selected from a fixed quest list. Dig until the chamber has usable body clearance plus a roof and side enclosure, then press `N`. There is no den-count cap. A carried bioluminescent colony pulses in open water, but inside a den it switches to a reduced steady-light shader; pressing `V` anchors one colony as a fixed, non-pulsing lamp owned by that individual den.

## Mineral economy

Digging saline sand, soil, clay, limestone, mineral seams, and basalt can loosen geology-specific collectible sprites. The six generated icons are displayed in the lower-left mineral pouch and on the world drop itself. Current practical chains include sea salt → seasoned food, ironstone → den reinforcement or a mineral-footed tunnel brace, copper ore → composite hammer, and obsidian → precision wedge. Quartz and hadal manganese are collected through the same utility so later light-storage and pressure-composite recipes can be added without replacing the drop system.
