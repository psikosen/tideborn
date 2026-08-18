Original prompt: Create a new `Tideborn` project: a Three.js/HTML5 2.5D granular-world survival, resource-management, den-building, ecosystem-simulation game about a future-evolved amphibious octopus, following the supplied planetary design brief.

## 2026-08-14

- Created a fresh Vite + TypeScript + Three.js project in `Tideborn`.
- Chosen vertical-slice scope: procedural coastal cross-section, local microcell terrain, octopus techniques, gathering/crafting, den preparation, three-day storm, and hydrothermal-vent tease.
- Implemented a 512×256 deterministic DataTexture material field with layered materials, starter cave, vent basin, granular settling, storm sediment, local flood cells, hardness/tool checks, and displaced dig material.
- Added the procedural Three.js 2.5D scene, octopus IK-style arms, movement/jet/corkscrew/brace/twist/camouflage/squeeze/climb actions, survival stats, 12 recipes, gathering, den placement, ecosystem counters, wildlife, day/night, storm sequence, and deep-vent discovery.
- `npm run build` passes (Vite production bundle generated; only the expected Three.js chunk-size advisory remains).
- First Playwright/render pass succeeded with no page or console errors. Visually confirmed the title screen and live gameplay frame (terrain grain shader, water, octopus, wildlife, parallax, HUD).
- Verified end-to-end resource gathering and jet/camouflage controls; verified the multi-step kelp chain `grab → brace → twist → harvest`, including ecosystem/sediment consequences reflected in text state.
- Improved offline determinism by removing the remote font import and adding Enter as an alternate start control. Widened the starter den entrance and made digging rake down automatically when the forward cell is open water.
- Found and fixed a live crafting issue: the recipe DOM was being refreshed every frame, which detached buttons during interaction. Recipe availability now refreshes only on inventory/crafting changes.
- Enlarged the bare-arm/spade dig sweep and moved the automatic substrate rake to the actual contact depth so one action produces a readable microcell excavation instead of grazing a single cell.
- Full resource/crafting test now reaches 20 fiber, 2 food, 2 wood; excavation reaches 23 changed cells; crafting produces both required den items. Found the deterministic starter tunnel stopped just inside the shoreline mask, so extended its carved throat through the seafloor for a physically valid entrance.
- Verified the repaired den entrance through four navigation waypoints; `inDen` and discovery now become true without digging through the entrance.
- Full objective chain passes: sling and brace visibly placed, `prepared: true`, storm simulation ends in `mode: won`, health remains valid, and no browser errors occur.
- Verified deep route and vent discovery at 12.5 m prototype depth with pressure/temperature changes. Darkened the water column, corrected depth-gauge direction, and clamped camera travel to keep streamed-world edges out of frame.
- Final Playwright client pass and custom interaction passes report no console/page errors. Visually inspected title, coastal gameplay, brace/twist harvest, den entry, furnished den, successful aftermath, and deep vent frames.
- Added `README.md` with run/build commands, full controls, architecture, and explicit vertical-slice boundaries.

## TODO

- Future: move the typed-array matter update into a Web Worker and persist terrain deltas instead of only summary/player data.
- Future: add regional chunk streaming and a second planetary belt once the local matter profile is stable on target hardware.

## 2026-08-14 — VFX / ability follow-up

- Researched `AvatarCastingAbilitiesThreeJS`, `LinearAbiltyCastingThreeJS`, `GODOT-VFX-LIBRARY`, `VFEZ-godot`, and current official Three.js shader/particle/post-processing documentation.
- Chosen lessons to port: declarative live settings; targeting separated from the effect; travel/impact/fade phases; metres-based linear/radial patterns; pooled effect instances; shared frame uniforms; GPU particle lifetime evaluation; layered environmental effects; ordered shader composition.
- Deliberately not porting engine-specific Godot scene/shader code. Tideborn will implement equivalent patterns as native TypeScript, Three.js BufferGeometry, ShaderMaterial, and pooled effect nodes.
- Implement the technique VFX pool, tapered shader arms, Ink Burst, layered vent plume, and subtle post-processing; then repeat Playwright/state/screenshot QA.
- Implemented `TechniqueVFXSystem`: declarative definitions, linear/radial SDF fields, travel/impact/fade phases, capped per-type pools, and shader-driven point particles for jet, ink, twist, dig, vent, and biological pulses.
- Rebuilt all eight arms as tapered ribbon meshes with a shared shader for chromatophores, wet caustics, edge shading, sucker lanes, camouflage/ink tinting, and animated sucker-contact rings. Added playable underwater Ink Burst on `R` with stamina, concealment duration, cooldown, HUD, and text-state reporting.
- Replaced the single black-smoker silhouette with a three-chimney vent habitat, glowing apertures, tube organisms, mineral fans, and recurring layered plume casts. Coastal kelp now uses current/storm vertex deformation and a living gradient/caustic fragment shader.
- Added a subtle Three.js composer pipeline (`RenderPass → UnrealBloomPass → OutputPass`). Kept neutral output grading after visual QA showed ACES washed out the established coastal palette.
- Corrected orthographic particle sizing and separated dark-ink shading from ordinary non-additive effects. Browser state tests confirm Ink Burst concealment/cooldown, jet stamina use, braced twist impact, and staggered recurring vent plumes.
- Reached the hydrothermal habitat through the playable cave route: discovery, bioluminescent pulse, vent casts, and HUD state all activate correctly with zero captured console/page errors.

## 2026-08-14 — Planet scale and marine hunting

- Added `PlanetScaleSystem` as the authoritative boundary between the 64 × 32 m loaded simulation and canonical Pelagos-730 geography: 5,200 km radius, 32,673 km circumference, 88% ocean, 5.2 km mean depth, and 17 km maximum trench depth.
- Added explicit coast, sunlit, twilight, midnight, abyssal, and hadal bands plus wrapped-longitude and realistic seawater-pressure utilities. The `M` atlas exposes the scale and Earth/Moon comparisons in-game.
- Added `MarineLifeSystem`, which owns twelve visible fish, schooling/fleeing state, three animated reef anemones, tentacle prey capture, feeding cooldowns, regional representative respawning, and concise text-state output.
- Added player fish hunting on `H`: forward target selection, stamina cost, cooldown, pounce motion, food reward, regional population consequence, and a configurable linear `hunt` VFX. A crafted fiber net increases range and reduces stamina cost.
- Playwright checks confirm a complete player hunt (`food 1 → 2`, `smallFish 740 → 739`, stamina use, impact VFX), active anemone snaring, completed anemone feeding, atlas rendering, and zero page/console errors.

## Next systems

- Stream actual longitude-addressed chunks through `PlanetScaleSystem`; the canonical planet is configured but the current playable terrain is still one local cross-section.
- Add depth-zone streaming so the 200 m, 1 km, 4 km, 6 km, and 32 km thresholds select distinct generated habitats rather than compressing them into the coastal prototype.
- Move regional birth/death equations behind the visible `MarineLifeSystem` representatives and add fish meat spoilage, stalking camouflage bonuses, net placement, and competing reef predators.

## 2026-08-14 — Abyssal light gate

- Added `DepthAccessSystem` to map the local cave route onto a canonical 0–5,200 m descent while keeping the material simulation in local meters. The HUD and text state now report both scales and realistic seawater pressure.
- Moved the vent discovery to the abyssal end of the route. At the tested habitat it reports approximately 5.16 km and 514 atmospheres instead of the old 12.5 m prototype reading.
- Rebuilt the glowing colony as harvestable bioluminescent seaweed. The first colony is reachable in the twilight band; harvesting with `E` adds `glowKelp`, attaches visible glowing bulbs to the octopus, and activates a limited light halo.
- Enforced a hard biolight gate at 1,100 m. An unlit player is pushed back with a black-water warning and cannot discover the vent. Deep vent geometry and plume VFX remain hidden until the player carries seaweed into the appropriate depth.
- Added black-water composition: the water shader approaches black, scene fog becomes nearly black, and a screen-space darkness layer reveals only a small seaweed-lit area around the player. The vent now sits outside all surface illumination.
- Screenshot QA confirms the blocked route, the visible seaweed harvest, attached biolight, and the black abyssal vent. The complete lit route reaches the vent with full health and no captured page/console errors.

## Next abyss work

- Add pressure adaptation tiers throughout the 6–32 km hadal trenches; biolight solves navigation, not the entire late-game adaptation path.
- Replace the current route mapping with multiple streamed depth habitats once chunk streaming is active, preserving the same `DepthAccessSystem` interface.

## 2026-08-14 — Hadal scale and terrain-occluded light

- Expanded Pelagos-730 to a 7.2 km mean ocean depth and 32 km maximum trench depth. The prototype hydrothermal route now resolves to 27 km and roughly 2,685 atmospheres—more than five times the previous 5.2 km destination.
- Removed the invisible 1,100 m movement barrier. `DepthAccessSystem` still reports when biological light is required, but `accessAllowed` remains true: an unlit octopus can enter the hadal route and receives a black-water warning while the world becomes visually unreadable.
- Added reusable `OccludedLightSystem`: 160 CPU rays walk the live `MatterWorld` grid, stop on granular terrain, and upload a 160×1 visibility texture. This is the efficient 2D equivalent of ray tracing for the current engine and automatically responds to excavation, collapse, and erosion.
- Rebuilt the darkness fragment shader around that visibility texture. It now provides pitch-black unlit hadal water, terrain-clipped bioluminescent reach, softened shadow boundaries, subtle water-ray grain, pulsing living light, cave darkness based on direct sky aperture, black fog, and hidden vent emissions outside the light-enabled route.
- Moved the first luminous seaweed colony above the black-water threshold so it can be discovered before committing to blind descent. Vent geometry and VFX now appear only with carried biolight beyond 12 km.
- Darkened the shared procedural arm shader—including chromatophores, wet rims, caustics, and sucker rows—so the tentacles match the shaded mantle instead of reading pink-white.
- Added `scripts/verify-lighting.mjs` for repeatable blind/lit route QA. The blind route reached 26.63 km with `hasBiolight: false` and `accessAllowed: true`; the lit route reached the same habitat with the occluded halo active. Both browser scenarios captured zero console or page errors.
- Production build passes. The standard gameplay client also passed movement/state regression checks; visual review confirmed the final coastal arm color, fully black blind descent, and terrain-shaped hadal lighting.

## 2026-08-14 — Vertical darkness correction

- Fixed a depth-mapping bug reported during live play: eastward travel contributed 62% of `DepthAccessSystem` route progress, so swimming right near the surface incorrectly darkened the world.
- Canonical depth is now derived exclusively from vertical descent. A right-only regression swim from x = −8 to x = 12 remained at `routeProgress: 0` and `darkness: 0` throughout.
- Added a deliberately long visual fade across the compressed descent slice. Automated checkpoints now progress through darkness values `0.033 → 0.256 → 0.715 → 0.840 → 1.0` as the player descends, while the deepest unlit water remains pitch black.
- Expanded `scripts/verify-lighting.mjs` to save numeric gradient checkpoints and screenshots for each descent stage. Production build, the standard web-game client, blind route, and lit route all pass with zero captured browser errors.

## 2026-08-14 — Continuous belt and physical trench expansion

- Used the project-native map pipeline (`DataTexture` visual model, interactive entities, precise cell collision, Three.js target) to replace the exposed 64×32 m box with a 128×128 m, 1024×1024-cell deterministic belt at the same 12.5 cm matter resolution.
- Added `PlanetBeltTraversalSystem`. Player/collision coordinates now wrap east/west, canonical longitude spans the full 32,673 km circumference, complete revolutions are counted, and duplicate seam render layers prevent the camera from revealing a texture edge during crossing.
- Redesigned the terrain as a continuous loop: remote shelf → continent/mountains → original coast → reef → old trench → multi-stage hadal wall → 100+ m physical trench → rising seam shelf. Periodic terrain detail matches at both longitude endpoints.
- Extended the water shader plane, matter texture, camera bounds, bubbles, mineral terrain, staged bioluminescent colonies, heat zone, vent lights, vent structures, discovery checks, and VFX to the new hadal floor near local y = −102 m.
- Fixed deep open-water sky testing so the terrain-occlusion budget does not mistake a distant surface for a cave roof; canonical depth still controls wavelength absorption.
- The day-three storm is now a survivable world milestone rather than a hard game shutdown, allowing planetary exploration to continue after the competition objective resolves.
- Boundary automation crossed from 96.2% to 2.08% belt progress, incremented `revolutions` to 1, retained velocity, and captured no browser errors. Seam screenshots show continuous water with no wall or exposed map texture.
- Blind descent automation reached 105.24 m of local depth and 26.99 km canonical depth with `accessAllowed: true`. Darkness remains 0 through the former local floor, rises gradually across the added trench, and reaches 1 only in the lower hadal section.
- The matching lit route reached 105.34 m with carried seaweed, discovered the relocated vent, rendered its terrain-clipped halo at 76.9% blocked rays, remained playable after the storm, and produced zero console/page errors. Final production and standard-client builds pass.

## 2026-08-14 — Persistent hard-material excavation

- Replaced the binary clay hardness rejection with a persistent per-microcell fracture field. Bare arms can now scrape through clay over many repeated actions; damage survives between scrapes and appears as deepening shader cracks.
- Holding `X` repeats excavation at a fixed 0.32-second cadence. Hard-material scraping has its own stamina cost and live percentage feedback; strong tools and bracing accelerate the same upgradeable fracture utility.
- Preserved a physical lower bound: clay and extremely slow limestone scraping are biologically possible, while bare arms still cannot fracture basalt.
- Production build and the standard web-game client pass. Added `scripts/verify-clay-dig.mjs`, which swims into the starter den and tests the real clay wall through `5% → 46% → 19 cells displaced` using held bare-arm input.
- The bare-arm breakthrough takes about 11 seconds, fracture progress survives releasing and re-holding `X`, and the captured mid-fracture/breakthrough screenshots match text state. The dedicated run reported zero browser or console errors.

## 2026-08-14 — Generated tool art and hotbar

- Used the built-in image-generation workflow to create a cohesive 4 × 2 Tideborn marine-tool atlas on a removable chroma key. Removed the background, validated alpha, and produced eight optimized 256 × 256 runtime icons under `public/assets/tool-icons/`; retained the generated source and transparent atlas under `art/tool-icons/`.
- Added the standalone `ToolbeltSystem` utility with stable tool definitions, ownership checks, selected state, cycling, direct slot selection, dig profiles, and a serializable text-state snapshot.
- Added a floating eight-slot hotbar above the resource strip. It has generated tool art for owned slots, numbered fixed positions, selected-slot bloom, empty uncrafted slots, hover descriptions, click selection, `Tab` cycling, and `1–8` direct selection.
- Tool choice now has gameplay authority: shell blades cut only while equipped, wedges pry only while equipped, nets improve hunts only while equipped, and excavation uses the equipped arms/spade/hammer profile.
- Production build and the standard web-game client pass. Visual QA confirmed the hotbar reads cleanly at 1280 × 720 without covering the prompt, resource strip, technique panel, or playfield.
- Added `scripts/verify-toolbelt.mjs`. The normal gameplay run gathered two stones, crafted a wedge, equipped it with `Tab`, returned to arms with `1`, re-equipped it by clicking slot 5, and then pried a scallop for an intact shell. State, icon selection, and the visible interaction result stayed synchronized with zero browser errors.
- Reran the persistent-clay test with the new equipment authority; bare arms still pass `5% → 46% → 19 cells displaced`, and no console errors were captured.

## 2026-08-14 — Den network, breach movement, and mineral economy

- Generated a six-resource mineral atlas through the built-in image workflow: sea salt, ironstone, copper ore, obsidian, quartz, and manganese nodules. Removed the chroma key, validated transparency, and exported six 256 × 256 runtime icons under `public/assets/minerals/`; source and alpha atlases live under `art/minerals/`.
- Added `DenNetworkSystem`: the original shore den is now one site in a multi-home network, sheltered chambers can be claimed with `N`, each den owns its own storage/decor/reinforcement/food state, and a second generated trench-wall chamber demonstrates remote den claiming.
- Added `MineralResourceSystem`: hard excavation accumulates deterministic mineral yield, drops spawn as generated-art world pickups, `E` collects them, and nearby drops are represented in text state.
- Added salt seasoning (`Y`), improved seasoned meals, ironstone wall reinforcement (`G`), and alternate copper/obsidian/ironstone tool recipes. The HUD now includes a generated-art mineral pouch.
- Added a post-trigger jet steering window so `Shift`, then `W` plus a horizontal direction, performs a diagonal breach near the surface. Underwater body rotation now eases toward the actual travel direction and is exposed as `tiltDegrees` in text state.
- Added a reachable reef-alcove den as the tutorial second home while retaining the remote trench chamber as a later outpost. Browser automation traveled through both real tunnel entrances, discovered the shore den, claimed `Reef den 2`, and confirmed both sites retain separate state.
- Tuned breach momentum so the post-trigger `Shift → W + direction` sequence retains its jet impulse above the normal swim-speed clamp. The focused run peaked at local `y = 6.33 m` (2.33 m above sea level), was airborne, tilted −12.7°, and captured no browser errors.
- Tuned excavation yield for the coarse prototype cells. One 22-cell wet-sand scoop released the generated sea-salt pickup; `E` put it in the mineral pouch and `Y` converted the starting food into one seasoned meal. The persistent bare-arm clay regression still reached `5% → 46% → 19 cells displaced`, now releasing salt on breakthrough.
- Production build passes. The standard web-game client, focused breach/mineral/den tests, toolbelt/pry regression, and persistent-clay regression all pass with zero captured console/page errors. Visually inspected the airborne breach, mineral pouch, salt world pickup, seasoned-food HUD, two-den claim banner, and final swimming-tilt frame.

## Next den/mineral work

- Persist and restore terrain deltas, uncollected mineral drops, and the den-network snapshot; the current autosave writes summary state but the prototype still begins a fresh runtime on reload.
- Add quartz light-storage and manganese pressure-composite recipes when those adaptation tiers become playable, and connect per-den mineral reinforcement to the storm collapse calculation rather than only regional sediment stability/preparedness scoring.

## 2026-08-14 — Jet chain, deep fauna, and steady den light

- Replaced the single long-cooldown burst with three regenerating jet charges. Separate Shift presses chain immediately, stamina still limits abuse, the HUD reports `JETS 3/3`, and the water exhaust now renders behind the mantle opposite acceleration. Automated state captured the exact `2 → 1 → 0 → 1 recharged` sequence with overlapping jet VFX and no browser errors.
- Added `DeepSeaLifeSystem` as a separate active-chunk utility. The descent now stages twilight/midnight/abyssal/hadal representatives: three sixgill sharks, three lantern-fish schools, a gulper eel, a glass siphonophore, and a giant isopod. Sharks and eels detect exposed movement, pursue, bite, knock the octopus back, and lose pursuit to concealment.
- Deep-fauna automation reached the 2.35 km midnight habitat with carried light. A sixgill entered `stalking`, bit for 13 health, and shared the light volume with a fleeing lantern school; the text snapshot also reported every deeper species population. No console/page errors were captured.
- Added per-den living lamps. The first carried glow-kelp placed with `V` is removed from inventory, increments that den's `bioLights`, creates a fixed lamp decoration, and keeps the terrain-occluded light anchored to that chamber.
- Added steady-den shader mode: smaller 4.35 m halo, lower intensity, static bulb scale/ray grain, no recurring `bioPulse`, and a fixed den-center origin. Two screenshots 0.9 seconds apart retain the same light shape and both text snapshots report `steady-den-lamp` with no active biopulse.
- Strengthened dynamic den claims with a body-clearance sample in addition to roof/side enclosure. Any player-excavated chamber can be claimed once it is large enough; tight squeeze tunnels receive a live clearance percentage instead. Existing automation still discovers the shore den and claims `Reef den 2`, confirming unlimited multi-site state remains intact.

## Next deep-life work

- Connect deep predators to regional biomass/birth-death equations and add carcass/scavenging loops rather than keeping the current fixed active representatives.
- Add collision-aware predator pathing around newly excavated rock and make large sharks avoid passages narrower than their body profile.

## 2026-08-14 — Continuous mountain strata

- Removed the visible vertical terrain splice on the western mountain. The former piecewise generator joined its shelf, island rise, and ridge at different elevations around x = −38, −26, and −19 m.
- Replaced those hard joins with smooth shelf-to-island blending and a continuous raised ridge curve. Soil, clay, and limestone layers now follow the same uninterrupted profile while retaining the intended 12.5 cm granular stair-step edge.
- Added `scripts/verify-terrain-continuity.mjs` and a development-only camera hook for deterministic visual regression coverage of the old join. The focused screenshot spans the complete ridge, reports no browser errors, and the production build passes.

## 2026-08-14 — Adaptive camouflage and surface grip

- Added the standalone `SurfaceAdaptationSystem`. It samples the live microcell field beneath and around the octopus, returns the contacted material plus sucker direction, and maps sand, soil, clay, stone, shell, wood, kelp, basalt, and mineral sediment to terrain-matched chromatophore palettes.
- Rebuilt camouflage visuals so both the mantle and procedural arm shader use the sampled material color/accent instead of a generic land/water tint. Suckers blend into the adaptive accent, eyes close, and the body retains an opaque material-like silhouette rather than merely becoming transparent.
- Added hold-`G` surface grip. It only activates when floor, wall, or ceiling is within sucker reach, locks velocity, flattens the mantle, aims all eight arms toward the contact, exposes visible sucker contacts, and immediately releases if the surface or key is lost.
- Grip is a predator-stealth state independent of `C`; combined grip plus camouflage provides physical attachment and visual blending. Fixed deep-predator bite resolution so a concealed player cannot still be damaged at point-blank range from a previously acquired attack.
- Rebound mineral den reinforcement from `G` to `J`, updated the menu/README/HUD, and exposed grip surface, camouflage surface/color, and concealment source through `render_game_to_text()`.
- Added `scripts/verify-surface-stealth.mjs`. Automated QA matched soil at `#403129`, matched a different mineral palette on the midnight wall, held position beside a sixgill for 2.8 seconds with 100 health, and confirmed the shark returned to `stalking` after `G` was released. Focused and standard gameplay runs captured zero console/page errors; the production build passes.

## Next stealth work

- Add predator-specific senses so stillness defeats visual hunters while smell/electroreception require ink, current masking, or later adaptations; the current prototype uses one shared concealment gate.
- Extend the material profile with procedural spots/stripes copied from local terrain neighborhoods rather than the current dominant-material color and accent pair.

## 2026-08-14 — Imported creature graphics

- Audited the user-supplied `assets/` pack with Assimp. Selected the browser-efficient animated clownfish (196 KB), low-poly reef fish (1.1 MB), animated shark (304 KB), and low-poly orca (60 KB). Preserved but did not ship the redundant 3–5 MB fish and 20–108 MB orca variants.
- Copied the selected self-contained GLBs into `public/assets/models/` and added `CreatureAssetLibrary`: one lazy load per asset, skeleton-safe cloning, automatic side-view orientation/normalization, cached animation clips, shared mixer updates, material tuning, load-state snapshots, and procedural fallback retention on failure.
- Replaced all twelve coastal representatives with a mixture of imported animated clownfish and low-poly reef fish while preserving schooling, fleeing, anemone capture, hunting, respawn, and population logic.
- Replaced the three procedural sixgills with the imported skinned shark and its swim animation. Added the imported orca as a new large pelagic predator with 10.5 m detection, faster stalking, 18-damage attacks, and concealment response.
- Standard browser QA loaded all four asset types, created 16 model instances and seven animated mixers, and captured zero failures or console/page errors. Visual inspection confirmed readable side-view orientation and scale for coastal fish, shark, and orca.
- Focused creature QA confirmed the orca and shark remain tied to live AI snapshots. The playable deep route took one 18-health orca strike, reached the shark/lantern habitat with 82 health, and retained hunting/predator behavior with no browser errors. Production build passes.

## Next imported-asset work

- Record the original source URLs, authors, and licenses before any public competition distribution; the supplied asset folders currently contain no attribution or license files.
- Compress the larger unused green/orange fish variants before considering them for biome diversity, and add distance-based model LOD if active visible schools grow beyond the current representative count.

## 2026-08-14 — Shark senses, ability reactions, and deep food web

- Increased the imported sixgill shark's normalized body length from 3.05 m to 4.35 m, giving it a much stronger size contrast against the octopus while retaining the skinned swim animation.
- Added three animated red sensory waves to sharks. Fast, strong waves signal a player pursuit; slower waves signal a last-known-position search after camouflage or surface grip breaks visual contact; lower-intensity waves remain visible when the shark hunts natural prey.
- Built natural deep predation into `DeepSeaLifeSystem`: sixgills and gulper eels hunt lantern-fish schools, orcas prefer sharks but can hunt lantern fish, prey flee active unblinded predators, successful feeding produces a visible burst, and consumed representatives recover through delayed regional replenishment.
- Added food-web telemetry with representative capacity, live population counts, four predator/prey links, cumulative kills, and recent predation events. The runtime can now show ecosystem events in which the player is only an observer.
- Connected player abilities to the deep fauna. Camouflage and gripping force predators to search the last known position; jets push and briefly stagger nearby animals; ink clears targets, disables alert waves, and coats sharks in a dark visual cloud for 20 seconds—half of the prototype's 40-second day.
- Production build and the standard browser client pass. `scripts/verify-shark-food-web.mjs` confirms player pursuit, concealed searching, a full half-day ink debuff, natural sixgill predation on lantern fish, orca predation on a shark, jet stagger, model loading, and zero console/page errors.

## Next deep food-web work

- Feed active predation results into the coarse region biomass equations so prey scarcity, predator hunger, migration, birth, and death remain coupled while the player is far away.
- Add carcasses for isopod/scavenger feeding, terrain-aware pursuit around excavated tunnels, and distinct smell/electroreception counterplay for sharks beyond the current visual concealment model.

## 2026-08-14 — Individual size, lifespans, breeding, and generations

- Added the reusable `CreatureLifecycleSystem`. It owns deterministic species life histories, genetic adult-size ranges, juvenile growth, elder shrinkage, maturity, biological sex or colony reproduction, breeding intervals, brood size, parentage, generation numbers, population caps, and natural/predation/harvest death counters.
- The prototype clock uses 20 seconds per ecology year. Short-lived reef organisms visibly turn over during a long run, while 55–85-year sixgills survive roughly 18–28 real-time minutes and retain a meaningful sense of longevity.
- Applied lifecycle variation to every active fauna layer: sharks, orcas, lantern schools, gulper eels, siphonophores, giant isopods, reef fish, anemones, birds, caterpillars, snakes, and jellyfish. Founders receive deterministic varied adult sizes; offspring begin around 42% of inherited adult scale and grow continuously toward maturity.
- Sharks now range from roughly 3.1–5.9 m as adults. Focused QA produced 4.32 m and 5.64 m adults beside a 2.44 m generation-one juvenile with two recorded parent IDs.
- Added pair-based breeding for sexual species and budding for colonial organisms. Reef fish form nursery cohorts, fed anemones bud young colonies, deep cohorts reproduce while offscreen, and all populations respect species-specific active caps.
- Replaced timer-based creature respawning with actual births. Natural death, predation, and player harvest remove individuals; future births recycle retired visual representatives, preventing unbounded GLB instances and animation mixers during long simulations.
- Extended `render_game_to_text()` with age, lifespan, life stage, sex, generation, parent IDs, current scale, measured size, births, deaths, and active populations for deep, reef, and surface wildlife.
- Production build and the standard web-game client pass. `scripts/verify-creature-lifecycle.mjs` validates visible size variation, parented shark/fish juveniles, anemone budding, births across all three wildlife layers, multi-year natural turnover, nonzero capped populations, bounded model instances, and zero browser errors. The shark food-web regression also passes with lifecycle generations active.

## Next lifecycle work

- Persist individual genealogy and age deltas in saves, then move inactive individuals into region-level demographic cohorts rather than keeping every historical representative in the active-world snapshot.
- Add carcasses/nutrient return, mate-seeking animations, egg or nursery objects, seasonal fertility, genetic trait inheritance beyond size, and metamorphosis for the caterpillar stage.

## 2026-08-14 — Fauna body collision

- Added the standalone `CreatureCollisionSystem`: a deterministic, multi-pass ellipse solver with species/lifecycle-scaled body profiles, inverse-mass separation, immovable anchors, contact velocity cancellation, collision layers, exact-overlap fallback directions, and concise debug telemetry.
- Integrated collision into reef fish, anemones, all active deep fauna, birds, caterpillars, snakes, jellyfish, and the octopus body. Air, ground, and water layers prevent false cross-habitat contacts; captured fish may still enter their anemone's tentacles by design.
- Replaced deep predator center-distance bites and feeding with ellipse-contact tests. Long sharks can now make physical nose/body contact without needing their centers to overlap, preserving player attacks and food-web predation after separation was introduced.
- Increased sessile anemone bud spacing so new colonies cannot be born inside an immovable parent. Mobile newborn fish and sharks are unpacked by the same reusable solver on their first active update.
- Added collision snapshots to deep, reef, and surface text state. A standard gameplay run showed live marine/surface resolutions and no browser errors.
- Added `scripts/verify-creature-collisions.mjs`. Forced overlaps resolved a 4.32 m and 5.64 m sixgill to a normalized contact ratio of `1.000`, a three-fish stack to pair ratios of `1.27+`, and two snakes to `1.000`; player/shark clearance and zero browser errors also passed. Visually inspected deep, reef, surface, and standard-play captures.
- Production build, shark food-web, lifecycle, and deep-fauna regressions all pass after collision integration. Natural sixgill/orca predation, shark alert/search/ink states, jet stagger, breeding, and player damage remain intact.

## Next collision work

- Add terrain-contour sampling and clearance-aware navigation so large sharks avoid newly excavated passages narrower than their lifecycle-scaled body profile.
- Introduce a lightweight spatial hash if active fauna counts grow enough that all-pairs collision checks become measurable; current capped prototype populations remain comfortably small.

## 2026-08-14 — Dense reef, rock avoidance, and proximity LOD

- Added the standalone `AquaticTerrainCollisionSystem`. It samples each swimmer's complete ellipse against the live `MatterWorld`, anticipates rock with directional probes, selects a deterministic clear turn, slides along one free axis on contact, prevents tunneling, and radially rescues fish caught by a collapse or newly streamed terrain.
- Integrated terrain resolution both after ordinary fish movement and again after body-to-body separation, preventing one fish from pushing another back into the granular seabed. Snared anemone prey also retains terrain clearance while being pulled toward the tentacles.
- Expanded the reef from 12 founding representatives to 72 individual fish, with reproduction capped at 96. Each retains age, lifespan, parentage, hunting eligibility, anemone predation, size variation, and ecological birth/death state.
- Added dense-school rendering LOD: 18 fish distributed across the reef retain imported GLB presentation, while the remaining population uses a single color-capable `InstancedMesh` draw. This removed the startup hitch caused by cloning dozens of animated/low-poly models while keeping the reef visually crowded.
- Added real proximity activation. A 14 × 9 m presentation bubble hides both hero GLBs and instanced fish outside the player's area; a slightly larger 16 × 11 m simulation bubble starts AI before fish enter view. Distant individuals retain lifecycle/ecosystem state without consuming local movement, collision, or rendering work.
- Extended marine text state with `livingFish`, `visibleFish`, `simulatedFish`, body-collision telemetry, and terrain-contact/avoidance/rescue counters.
- Added `scripts/verify-fish-terrain-density.mjs`. It confirmed 72 founders, zero local terrain intersections, recovery of eight fish forced inside solid seabed, sustained growth to the 96-fish cap with no active terrain penetration, `96 living / 0 visible / 0 simulated` while the player is deep, and full local reactivation on return.
- Visual QA confirms the dense imported/instanced school tracks above the complete sloped reef instead of passing through it. Production build, standard web-game client, imported asset, creature body-collision, and multi-generation lifecycle regressions pass with zero captured browser errors.

## Next reef work

- Move truly inactive reef individuals into numeric region cohorts so long-distance time skips update demographics without retaining every local runtime object; the current 96-individual cap is appropriate for the vertical slice.
- Add school-level cohesion/current lanes and terrain-aware navigation to deep sharks, orcas, and eels using the same solid-sampler interface with species-scaled clearance.

## 2026-08-14 — Streamed deep-sea fish communities

- Added the standalone `DeepSeaShoalSystem` with four depth-native fish: twilight lanternfish, midnight bristlemouths, abyssal silver hatchetfish, and hadal snailfish. The deterministic founding population is 113 individuals and can breed toward a capped 208-fish regional community.
- Implemented the same planet-scale proximity trick used by the reef. Fish keep age, lifespan, sex, parentage, generation, and population state everywhere, but only a 17 × 12 m local bubble runs movement and collision; a tighter 14 × 9.5 m bubble feeds eight instanced meshes. Coastal QA recorded `113 living / 0 visible / 0 simulated`.
- Added species-shaped instanced silhouettes and additive photophores. In hadal black water the fish remain invisible outside terrain-occluded carried biolight, while the illuminated pocket reveals pressure-adapted fish without brightening the surrounding trench.
- Reused `AquaticTerrainCollisionSystem` for whole-body rock clearance, anticipation, sliding, and collapse rescue, then applied `CreatureCollisionSystem` to the active shoal so dense fish neither cross granular walls nor stack into one another.
- Connected the shoals to the food web. Fish flee enabled sharks, orcas, and gulper eels; contact predation updates per-link kill telemetry; jets scatter nearby schools; `H` hunts deep fish with bare arms or a net; births/deaths/harvest/predation feed the coarse small-fish count.
- Added `predatorField()` to `DeepSeaLifeSystem`, a read-only upgrade boundary that lets streamed prey react to large fauna without coupling their internal simulations.
- Added `scripts/verify-deep-sea-shoals.mjs`. It verified growth from 113 to 196 fish through off-screen breeding, 60 locally streamed twilight fish, 35 hadal fish, complete terrain clearance, sixgill and gulper-eel predation, player hunting, and clean zero-cost culling on return to the coast.
- Production build, standard game client, deep-fauna, shark-food-web, body-collision, and dense-reef regressions pass with zero captured browser/page errors. The abyss jet regression now stages in the shark's expanded open-water pocket instead of an obsolete solid-wall coordinate.

## Next deep-shoal work

- Replace inactive individual records with numeric regional age cohorts once multiple planetary belts stream concurrently; the current 208 cap is intentionally bounded for the vertical slice.
- Add lateral migration driven by thermoclines, spawning seasons, organic-fall events, and predator hunger so depth communities redistribute instead of remaining tied to fixed habitat centers.

## 2026-08-14 — Imported deep-fauna asset pass

- Audited all seven newly supplied GLBs with Assimp and a reusable Three.js `asset-preview.html` turntable. The set contains an animated manta, animated emperor fish, animated angler, spined deep fish, alien crown-stalker, cyan abyss predator, and bloodfin leviathan.
- Optimized the source pack from roughly 107 MB to about 11 MB in `public/assets/models/deep/`. The animated angler fell from 51.2 MB to 1.87 MB, manta from 2 MB to 433 KB, crown-stalker from 1.39 MB to 129 KB, bloodfin from 13.2 MB to 818 KB, and cyan hunter from 18 MB to 694 KB. Animated rigs and embedded materials remain intact.
- Extended `CreatureAssetLibrary` with all seven depth-native definitions, per-model normalization/orientation, animation selection, restrained emissive tuning, lazy caching, skeleton-safe cloning, and hidden-mixer pausing.
- Added the standalone `DeepAssetFaunaSystem`. Two founders of each species retain deterministic size, age, sex, lifespan, breeding, parentage, and population caps. Only nearby representatives simulate or request GLBs; the coast recorded `0 visible / 0 simulated` and requested none of the new files.
- Added species-scaled whole-body terrain clearance, inter-creature separation, obstacle anticipation, player pursuit, bites/knockback, searching, ink blindness, jet stagger, and proximity culling. The large 7.4 m bloodfin uses a 6.2 m clearance profile and remains confined to the broad hadal chamber.
- Connected imported predators through the shared shoal predator field. Focused QA recorded natural cyan-hunter and bloodfin feeding plus a forced `midnight-angler > bristlemouth` link; passive mantas and twilight emperors remain non-predatory.
- Added `scripts/preview-new-assets.mjs` and `scripts/verify-imported-deep-assets.mjs`. Seven in-game screenshots confirm successful fallback replacement, black-water/biolight presentation, terrain clearance, lazy loading, food-web participation, and clean culling with no console/page errors.
- Production build, mandatory standard web-game client, deep-shoal, shark-food-web, and multi-generation lifecycle regressions pass.

## Next imported deep-fauna work

- Obtain and record creator/license/source metadata for every supplied GLB before public distribution; the current asset drop includes no attribution files.
- Add authored turn/swim animations for the three static generated predators and a true terrain-aware route planner for the bloodfin instead of local avoidance plus radial recovery.

## 2026-08-14 — Visible predation and dense-fauna performance

- Replaced instant streamed-fish deletion with a 0.78-second capture sequence. Contact marks prey as captured, pulls it in a tightening spiral to the moving predator, excludes it from player hunting and competing predators, and only records the food-web death after the swallow completes.
- Synchronized imported anglers/spinefish/cyan hunters/crown-stalkers/bloodfins and native sixgills/orcas/gulpers with the streamed kill. Successful hunters now pause, visibly pulse in a feeding state, become briefly unavailable for another shoal capture, and retain a longer satiated interval.
- Added a pooled `feeding` shader/particle effect through `TechniqueVFXSystem`, avoiding the geometry/material churn of one-off burst objects for deep predation. The HUD now says that the named predator catches and swallows the named prey.
- Upgraded `CreatureCollisionSystem` with an automatic deterministic spatial-hash broadphase for groups of 24 or more. Its telemetry reports broadphase type, candidate pairs, naïve pairs, and reduction percentage; small groups retain the simpler all-pairs path.
- Browser profiling recorded the active 44-fish coastal neighborhood at `223 / 1128` candidate pairs (80.2% fewer) and the tested deep shoal at `4 / 406` (99% fewer), while retaining complete body separation.
- Capped Retina rendering at 1.5× pixel density so bloom, water, darkness, and other full-screen shaders remain crisp without paying a 4× fill-rate cost on 2× displays.
- Added `scripts/verify-visible-predation-performance.mjs` with captures of the caught, swallowed, and feeding states plus browser assertions for food-web accounting and broadphase reduction. Production build, mandatory standard client, deep-shoal, and imported deep-asset regressions pass with no browser errors.

## 2026-08-14 — Predator awareness, jet recoil, longer days, and render budget

- Added the reusable `PredatorAlertVisual` utility. Sixgills, orcas, gulper eels, midnight anglers, spinefish, cyan hunters, crown-stalkers, and bloodfins now emit fast red waves while actively tracking the player and slower amber waves while searching the last known position. Natural prey hunting does not falsely show a player alert.
- Increased the pooled feeding VFX from a 0.82 m to 1.15 m radial field, raised the particle count from 30 to 40, and lengthened its fade so successful ecosystem kills read clearly without allocating one-off geometries.
- Jet Burst now records an explicit aim vector and environment strength. Underwater impulse increased modestly to 7.1 m/s horizontally; land/air jets use exactly 0.5× force and still support delayed directional steering.
- Connected jet wash to every fauna layer. Reef fish, streamed deep shoals, sharks/orcas/gulpers, imported deep predators, birds, caterpillars, snakes, and jellyfish receive distance-falloff radial knockback plus a smaller directional component. The HUD reports how many animals were displaced.
- Increased digging effectiveness by 8% across bare arms and tools while preserving clay/rock fracture time, stamina cost, tool tiers, and the stronger brace multiplier.
- Increased each day/night cycle from 40 to 90 seconds. The warning, storm arrival, peak, and aftermath were scaled proportionally; the storm now begins at 243 seconds late on day three.
- Applied current Three.js performance guidance: retained the instanced school meshes, capped high-DPI rendering to both 1.5× and a 2560×1440 drawing-buffer budget, exposed pixel/GPU-resource telemetry, and disabled the directional sun-shadow pass below 1,500 m where sunlight cannot contribute.
- Added `scripts/verify-alerts-jets-cycle-performance.mjs`. At 2× device scale it recorded a 2160×1350 / 2.916M-pixel buffer under the 3.686M budget, full-strength reef knockback, half-strength land movement/animal knockback, visible orca and angler player alerts, 90-second days, and zero browser errors. Clay fracture, diagonal breach jet, visible feeding, production build, and mandatory standard-client regressions pass.

## Next performance work

- Split infrequently used crafting/atlas and deep-asset orchestration into lazy JavaScript chunks; the current production build still emits Vite's non-blocking 500 KB chunk advisory.
- Add an in-game quality selector that can disable bloom and lower the drawing-buffer budget on thermally constrained mobile devices while retaining the current automatic cap as the default.

## 2026-08-14 — Mouse excavation, Jet Blast, varied landmasses, and generated trees

- Added the reusable `PointerAimSystem`. Canvas pointer coordinates now map directly into the orthographic world plane, a small world-space contact reticle shows arm reach, and either held `X` or left mouse excavates along the pointer direction. The old downward substrate rake remains only as a keyboard fallback before mouse aim is active.
- Added the standalone `JetBlastSystem`. Ordinary Jet Bursts and real excavation train an 80-point mastery track; the learned underwater technique requires all three jet chambers plus 70 stamina and has an 18-second cooldown. Right mouse or `K` releases the pointer-aimed pressure front.
- Jet Blast uses its own configurable linear shader/particle preset plus radial impact and feeding layers. It removed 188 microcells in the focused test, created two mineral pickups, emptied all jet charges, and killed a sixgill caught inside its close pressure core. Larger predators can also be ruptured, but require a much closer center hit; survivors are forcefully displaced and staggered.
- Kept conservation behavior for ordinary den excavation while giving Jet Blast a no-pile shock mode. Pulverized blast matter moves into VFX/mineral yield instead of stacking above the crater and falsely triggering the terrain-occluded cave-darkness shader.
- Added actual granular-belt landmass size variation west of the main continent: a narrow islet, open-water gap, and broader island. Added `ProceduralLandmassSystem` for wrapped parallax profiles ranging from 4.4 m islets to 45.8 m broad ranges, replacing the repeated hand-authored triangles.
- Used the built-in image generator through the 2D-sprite workflow to create a six-prop Tideborn tree family: windswept pine, narrow cedar, shoreline old growth, storm scrub, lightning snag, and primitive fern-palm. The original source atlas is under `public/assets/trees/raw/`; six alpha-clean 512 px runtime sprites are under `public/assets/trees/variants/`.
- Added `ProceduralTreeSystem`. Every seed includes all six tree silhouettes at least once, then habitat-weighted selection varies later trees. Placement samples the live material surface; scale, tint, depth, and wind phase vary deterministically, and storm strength increases whole-tree sway.
- Added `scripts/verify-mouse-aim-jet-blast-trees.mjs`. It verified downward mouse excavation (`0 → 3` cells), a blast crater (`3 → 191` modified cells), sixgill population reduction (`3 → 2`), active layered VFX, real separated island samples, all six generated tree variants, and zero browser errors.
- Visually inspected the mouse dig, bright coastal blast, procedural forest, and final standard-client screenshots. Production build, ordinary bare-arm clay breakthrough, dynamic half-day shark ink/food-web regression, and mandatory standard web-game client all pass. The only build note remains Vite's existing non-blocking bundle-size advisory.

## Next environment work

- Stream the new landmass profile metadata into true longitude-addressed terrain chunks so later continents can vary climate and geology as much as the current local belt varies silhouette and island width.
- Add tree lifecycle/ecology state (seed dispersal, storm fall, regrowth, browsing pressure, wood yield) behind `ProceduralTreeSystem` without replacing its generated-art placement interface.

## 2026-08-14 — Root-anchored tree wind animation

- Replaced rigid whole-sprite tree rotation with the reusable `TreeWindMaterial` vertex-shader utility. Each low-cost tree remains one textured plane, but its subdivided geometry now bends progressively from a planted root while crown pixels and outer branches receive a separate flutter wave.
- Added species-specific wind profiles. Old-growth and dead snags resist wind; cedar tops flex; scrub and primitive fern crowns move fastest. Clear weather uses slow asynchronous breeze phases, while rising weather adds directional lean and full storms layer rapid gust buffeting over the bend.
- Extended tree text-state telemetry with `gentle-wind`, `rising-wind`, and `storm-gusts` modes, normalized strength/gust values, root anchoring, and the vertex-shader renderer marker.
- The first standard visual pass caught and fixed missing Three.js fog uniforms in the custom material. The repeated standard client then rendered the complete game cleanly with no page or console errors.
- Added `scripts/verify-tree-wind.mjs`. It validates seven generated trees, 165 deformation vertices per tree, six distinct species wind profiles, full storm uniform propagation, and unchanged root positions across breeze/storm frames. Four screenshots cover two gentle-wind phases and two storm-gust phases.
- Production build, the mandatory standard web-game client, the focused wind test, and the existing mouse-dig/Jet-Blast/island/tree regression all pass with zero captured browser errors.

## Next tree work

- Connect severe storm gust thresholds to branch loss, fallen wood, seed dispersal, and eventual regrowth once tree lifecycle state becomes gameplay-active.

## 2026-08-15 — Hydrodynamic octopus arms and depth rendering budgets

- Replaced the old fixed tentacle drift with a velocity-driven arm wake. The octopus converts world velocity into its tilted local body frame, smooths the opposite-flow direction, narrows the arm fan as speed rises, lengthens the wake, and adds a restrained traveling ripple. Diagonal swimming now trails diagonally and Jet Burst produces the tightest streamlining; brace, grip, and twist poses retain control.
- Added `armTrailSnapshot` telemetry so automated checks can distinguish free, streaming, jet-streamlined, and anchored poses. `scripts/verify-octopus-arm-trailing.mjs` measured normalized velocity/trail dot products of −1.001 rightward, −0.997 diagonal, and −0.998 during a jet, with zero browser errors.
- Added the standalone `DepthPerformanceSystem`, keeping resolution and occlusion policy outside the renderer so both can be tuned or replaced independently. Four hysteretic depth tiers preserve 1.5× coastal fidelity, then cap the aphotic, midnight, and abyssal buffers at 1.25×, 1×, and 0.9× respectively.
- Terrain-aware light rays now update at a depth/biolight-aware 8–18 Hz and reuse the small occlusion texture between samples. Digging and light-source changes force an immediate refresh, so excavated tunnels and den lamps still alter light paths without paying for 160 terrain rays on every rendered frame.
- Added `scripts/profile-deep-performance.mjs` and before/after artifacts under `output/deep-performance-profile/`. At a 1440×900, 2×-DPR SwiftShader stress load, settled performance improved from 6.3→8.4 FPS at 3.8 km, 6.2→8.2 at 9.6 km, 3.9→6.3 at 21.1 km, and 3.7→7.1 at 26.9 km. Hadal drawing-buffer work fell from 2.916M to 1.050M pixels while the sea outside carried biolight remained pitch black.
- Production build, mandatory standard web-game client, focused arm-direction test, deep profile, and the existing alert/jet/day-cycle/performance regression pass with zero captured browser/page errors. The long-form lighting route also completed without browser errors; its old steering routine was intercepted by predators around 11 km, while the direct 26.9 km profile provided the reliable hadal lighting check. Visual QA covers rightward and diagonal arm wakes, jet streamlining, midnight biolight, and the 26.9 km hadal vent field.

## Next movement/performance work

- Add a user-facing quality selector for mobile thermal throttling (automatic, high, battery saver) and make bloom optional only in battery-saver mode.
- Profile real mobile GPUs separately from SwiftShader; the current before/after numbers are deliberately a worst-case software-rendered comparison, not a claimed player-device frame rate.
- Give individual primary arms temporary current/obstacle contacts so their wake can curl around nearby rock while the aggregate body solver continues to provide stable swimming.

## 2026-08-15 — Portrait mobile control deck

- Added the standalone `MobileControlSystem`, a multitouch-safe input adapter that keeps the desktop controller unchanged while mapping a left virtual stick to movement, a directional right pad to world-space aim plus held digging, and touch buttons to Jet, Grab, held Grip, Camouflage, Use/Place, Craft, and results Retry.
- Added bubbling `tideborn:mobile-move`, `tideborn:mobile-aim`, and `tideborn:mobile-layout` contracts plus a serializable debug snapshot. The layout event recommends a 20 m portrait camera height, 30% lower-control occlusion, and an 8% upward player composition bias for the camera system to consume without coupling it to the DOM utility.
- Reflowed the HUD for portrait play: compact survival vitals, horizontally scrollable resources and tappable eight-slot hotbar, touch-sized bottom-sheet crafting, safe-area support, non-overlapping ability controls, and a clean touch-ready title screen. Desktop/landscape controls remain hidden and unchanged.
- Added `scripts/verify-portrait-mobile-controls.mjs`. Automated 390×844 and 430×932 mobile contexts verified layout bounds, diagonal movement, aim/dig propagation into `PointerAimSystem`, jet charge use, camouflage toggle, held-grip release, crafting, Retry/Enter dispatch, hotbar selection, and zero console/page errors. Production build and the standard desktop web-game client pass; screenshots are under `output/portrait-mobile-controls/`.

## Next portrait work

- Consume `tideborn:mobile-layout` inside `Game`: set `viewHeight` to `detail.camera.viewHeightM`, call `resize()` on tier changes, and follow `player.y - viewHeight * detail.camera.focusBiasY` so the octopus sits above the touch deck. The current orthographic aspect already becomes portrait; this final hook applies the deliberate control-aware composition.
- On real iOS/Android hardware, verify simultaneous stick + aim + ability touches, safe-area insets, thermal behavior, and browser gesture suppression before submission.

## 2026-08-14 — Terrain-fitted buried tree roots

- Reworked procedural tree placement around a seven-sample weighted surface-line fit. The local least-squares terrain tangent smooths the granular one-cell staircase, then contributes a biologically limited planted angle capped at ±14° so trees match opposing hill slopes without growing unnaturally sideways.
- Added per-species burial fractions based on the generated art's painted root footprint. Tree pivots now sit 0.34–0.91 m inside solid terrain, and the matter layer renders after/in front of the tree layer, fully hiding the roots behind soil, sand, clay, or other granular cover.
- Restricted vertex wind deformation to species-specific upper zones. The lower 34–58% of each tree remains rigid; only upper trunk, branches, crowns, and fronds participate in breeze and storm motion.
- Extended tree text-state telemetry with placement method, buried-root count, burial-depth range, planted-slope range, and terrain-occlusion state.
- Expanded `scripts/verify-tree-wind.mjs` to assert all seven roots are inside solid cells, every tree renders behind terrain, planted angles vary across real slopes, lower-trunk wind cutoffs are active, and root transforms remain unchanged between calm and full-storm frames.
- Production build, mandatory standard web-game client, focused root/wind verification, and mouse-dig/Jet-Blast/island/tree regression all pass with zero captured browser errors. Visual QA confirms the former exposed old-growth, pine, fern, cedar, scrub, and snag roots are now buried.

## 2026-08-15 — First-winter contest ending and session reset

- Added the standalone `SeasonSystem`. The three-day contest now moves through late summer, autumn, storm season, and first winter; temperature and daylight telemetry change continuously, and near-surface survival temperature receives the seasonal cooling while the deep ocean remains thermally dominated by depth.
- Added `ContestSessionSystem` as the single authority for completion. The storm's aftermath now ends the run instead of merely showing a banner. A player wins by linking seven viable dens or by preparing one large winter den with 36 excavated cells, two structural supports, storage, three winter meals, and one habitat fixture.
- Added explicit catastrophic den failure. If neither win route is ready when first winter arrives, all discovered unprepared dens are marked destroyed, the viable-den count reaches zero, and the contest ends in a loss. Reaching zero health still produces an immediate death loss.
- Replaced the old indefinite banner with a portrait-safe results panel containing the route-specific outcome, den/readiness/resource summary, and a 58 px touch-friendly `Play Again` action. Replay clears autosave and reloads a clean session; keyboard Enter remains supported.
- Expanded the HUD and `render_game_to_text` with season, winter countdown, both win-path assessments, completed result, den found/viable/lost counts, and results visibility. Winter-preparation checklist thresholds now match the actual solo-den rules.
- Added `scripts/verify-contest-session-ending.mjs`. It passes solo-fortress win, seven-den network win, no-den catastrophic loss, death loss, and touch replay at 430×932 and 390×844 with zero console/page errors. Visual QA confirmed both win and loss results panels, and the standard web-game client plus production build pass.

## Next season/session work

- For the longer campaign, stretch `SeasonSystem` across regional months and use its daylight/temperature outputs for migration, fertility, kelp growth, food spoilage, snow, and winter storms instead of the contest's compressed four-phase calendar.
- Track excavation volume per den rather than using the contest slice's shared modified-cell count, then persist individual collapsed/repairable chambers in saved planetary deltas.

## 2026-08-15 — Contest-compliant standalone package

- Added a separate `build:submission` pipeline that leaves normal Vite `dist/` behavior intact and produces `submission/` plus `Tideborn-submission.zip`.
- The package places 389 KB / 8,700+ lines of readable, unminified entrant JavaScript and all CSS directly inside top-level `index.html`. Three.js, its split `three.core.js`, and the exact recursive add-on dependency closure remain external under `vendor/` with the MIT license.
- Converted every runtime root-relative `/assets/...` source reference to `./assets/...`. The package preserves models, trees, minerals, and tool art, and adds the contest-facing `assets/tools/` directory while retaining source-compatible `assets/tool-icons/`.
- Added a static compliance audit covering relative URLs, external hosts, inline-code readability, vendor completeness, byte-for-byte runtime-asset completeness, ZIP layout, hidden metadata, final ZIP size, and the authoritative attribution inventory.
- Copied `submission-docs/asset-attribution.md` verbatim into the package as `ASSET-ATTRIBUTION.md`; it records all 11 imported GLBs from embedded metadata and flags the manta/Sketchfab licenses for mandatory manual review.
- Added a clean runtime test that extracts the final ZIP to a temporary directory, serves it with a dependency-free static server, blocks non-local traffic, enters gameplay, and records all browser requests/errors. The final run made zero external requests, had zero failed requests and zero console/page errors, and reached `mode: playing`.
- The final ZIP has `index.html` at its top level and measures 13.26 MiB (13,903,802 bytes). The static audit passes. Mandatory remaining human gates: physical-phone touch testing and written license compatibility confirmation before upload.
# 2026-08-15 - Final contest integration and package audit

- Connected the portrait-layout utility to the real orthographic camera: 20 m portrait view, 8% upward player screen bias, desktop fallback at 18 m, and camera telemetry in `render_game_to_text`.
- Replaced the desktop WASD starter prompt with a touch-specific MOVE/GRAB/USE prompt in portrait mode.
- Re-ran production build, the required standard web-game client, focused portrait tests at 390x844 and 430x932, and all contest-ending paths. All completed without browser errors.
- Rebuilt `Tideborn-submission.zip`: 13.26 MiB, 8,817 lines of readable inline entrant code, relative local vendor/assets, all 38 runtime assets byte-identical, and `index.html` at ZIP root.
- Extended the clean extracted-ZIP runtime test to both portrait target sizes. Desktop and portrait passed with zero external requests, failed requests, console errors, or page errors.
- Final manual gates: test on a connected physical phone; obtain written redistribution/contest compatibility confirmation or replacements for the Sketchfab Standard models and the CC BY-NC-SA manta.

## 2026-08-15 — Regional snow and physical sea ice

- Added the standalone `SeasonalCryosphereSystem`, driven by the existing season timeline but evaluated per world position. A deterministic western ice current and high alpine surfaces become cold while the same date remains temperate elsewhere, establishing a regional climate contract that can later expand into latitude bands.
- Extended `SeasonSystem` with snowfall potential, sea-ice potential, and a moving snow line across late summer, autumn, storm season, and first winter.
- Added real `Ice` and `Snow` matter materials. Frozen ocean cells and accumulated snow are solid, collide with creatures, can be dug, and participate in the existing granular terrain renderer. Player-broken ice remains open instead of instantly regenerating; system-owned snow and ice melt cleanly during late summer without counting as player terrain edits.
- Added a low-cost instanced ice-surface shader and local snowfall particle field. Cold winter cores form a connected frozen crust, while the warmer margins retain patchier floes. Weather text switches from rain to regional snow, and the survival temperature model now samples local surface climate before blending into deep-ocean temperatures.
- Added `scripts/verify-seasonal-cryosphere.mjs`. The focused run verified 120 frozen surface cells and 20 snow cells in the cold storm-season province, physical solid material IDs for both, zero ice or snow at the temperate comparison longitude, persistent openings after digging two ice cells, complete summer melt, and zero browser errors. Production build and the standard gameplay client pass; visual QA screenshots are under `output/seasonal-cryosphere/`.
- Re-ran contest-ending and portrait-control regressions, then rebuilt and audited `Tideborn-submission.zip`. The 13.26 MiB package retains readable inline game code and passed its clean extracted-ZIP desktop plus 390×844/430×932 runtime tests with zero external requests or browser errors.

## Next cryosphere work

- Couple snow depth and ice thickness to longer monthly seasons, wind transport, water salinity, and regional currents once the post-contest campaign timeline replaces the compressed three-day session.
- Add drifting floes, pressure ridges, spring break-up, tree snow loading, and predator migration behind the cryosphere utility without changing the matter-material interface.

## 2026-08-15 — Full procedural world captures

- Added `scripts/capture-procedural-world.mjs`, a reusable clean-camera capture utility that frames the live Three.js scene without changing normal gameplay or redrawing the map outside the engine.
- Captured a 1920×1920 full simulation cross-section spanning all 128 wrapped longitude meters and the complete +16 m to −112 m vertical field. It shows the remote island chain, main landmass, reef shelf, descent route, abyssal wall, and hadal trench in one image.
- Captured a 2560×960 companion surface panorama across the same full belt so island silhouettes, forest placement, shoreline, reef life, and the beginning of the deep route remain legible.
- Both captures report seed 730221, use the actual procedural terrain/material/water shaders, emitted zero browser errors, and are stored under `output/world-overview/`. The mandatory standard gameplay client still passes afterward and its normal-camera screenshot was visually inspected.

## 2026-08-15 — Pelagos-730 procedural globe portrait

- Corrected the map-capture interpretation by adding a dedicated `globe-preview.html` Three.js route and `src/globe-preview.ts`: this is a true spherical planet render, not another zoomed side-view cross-section.
- The globe deterministically extends seed 730221's equatorial world concept into latitude terrain using seam-free spherical 3D noise, seeded continental shelves, island chains, a volcanic arc, polar climate, and an exact 82% ocean / 18% land target.
- Added generated bathymetric ocean colors, beaches, forest/moisture regions, alpine rock and snow, polar pack ice, bump/roughness maps, a separate moving cloud layer, atmosphere shader, stars, and a day/night lighting terminator. All textures are produced locally at runtime with no external requests.
- Added `scripts/capture-procedural-globe.mjs` and captured two opposing 1920×1920 hemispheres with zero browser errors. Combined them into `output/procedural-globe/tideborn-complete-globe-two-hemispheres.png` at 3248×1600 so the image covers the entire planet surface rather than only the visible face.
- Production TypeScript/Vite build passes, and the mandatory standard-game client plus visual inspection confirm the preview route leaves normal gameplay and camera framing unchanged.

## 2026-08-15 — Season-driven skin moisture

- Extended every `SeasonState` with interpolated atmospheric humidity and evaporation multipliers. Late summer begins at 48% humidity with 1.2× evaporation, autumn becomes progressively more humid, storm season approaches saturation, and winter cold suppresses evaporation even when direct precipitation stops.
- Added the standalone `SeasonalMoistureSystem`. It combines season, local storm strength, rain-versus-snow, physical snow/ice contact, den shelter, and water immersion into a serializable per-second moisture budget with a readable source and trend.
- Replaced the old binary land/rain formula in `Game.updateSurvival`. Dry late-summer land now drains about 0.75 moisture/s, autumn about 0.49/s, heavy storm rain restores about 1.22/s, direct winter snow contact restores about 0.34/s, bare ice is nearly moisture-neutral, a humid den slows evaporation, and underwater saturation remains 5/s.
- Added a compact up/down/stable marker beside the moisture HUD label plus a descriptive tooltip. `render_game_to_text` now exposes humidity, evaporation, precipitation gain, net rate, precipitation type, shelter/contact state, trend, and source.
- Added `scripts/verify-seasonal-moisture.mjs`. It verifies the four seasonal regimes, den retention, underwater behavior, integrated survival values, real physical snow contact, HUD telemetry, and zero browser errors. Production build, mandatory standard gameplay, cryosphere behavior, all contest ending routes, and portrait controls at 390×844/430×932 pass after the change.
- Rebuilt and re-audited `Tideborn-submission.zip`: 13.26 MiB with 9,305 lines of readable inline entrant code. Its freshly extracted desktop and two portrait runtime checks pass with zero external requests, failed requests, console errors, or page errors.

## Next moisture work

- Let genetic moisture-retention adaptations, wind speed, sunlight exposure, kelp curtains, and room-specific den humidity modify the same utility inputs during the longer campaign.

## 2026-08-15 — Whole-planet 2D equatorial cutaway

- Extracted the exact deterministic playable terrain formula into `PlanetBeltProfile`, shared by `MatterWorld` and the planet cutaway. This keeps the circular cross-section's coastline, shelf, abyssal descent, and trench tied to the live game rather than drawing an unrelated illustration.
- Added `globe-slice-preview.html` and a reusable capture utility. The 1920×1920 image shows the full 5,200 km-radius planet as a circular equatorial slice, wraps the 128 m playable belt around the outer circumference, identifies the current 27 km descent route, and marks the future 32 km ocean-depth target.
- Kept the scale disclosure explicit: at the rendered 710 px planetary radius, a true 32 km ocean is only 4.37 px thick, so the outer ocean/trench shell is magnified for readability. The differentiated mantle and core are a plausible fictional cutaway model, not currently playable simulation layers.
- Corrected the separate Three.js globe portrait to read the canonical planet specification directly: 88% ocean and 12% land. Re-captured both opposing hemispheres and the combined whole-surface image with zero browser errors.
- Production build, exact-terrain continuity regression, standard gameplay client, globe capture, and cutaway capture all pass. Visual QA confirms the shared terrain refactor did not change the playable world.
- Rebuilt and re-audited `Tideborn-submission.zip` after the shared-profile refactor. The 13.26 MiB ZIP passed clean offline desktop and portrait runtime checks with zero external requests, failed requests, console errors, or page errors.

## 2026-08-15 — Climbable forests, survivor octopi, finite living light, and relics

- Added `TreeInteractionSystem` and exposed deterministic trunk capsules from `ProceduralTreeSystem`. Generated trees now physically block the player, provide bark-colored camouflage contact, accept the existing sucker grip, and support stamina-driven `G + W/S` climbing. Nearby prompts teach the action, while wind remains a separate shader concern.
- Added `SurvivorOctopusSystem`. Four future octopi maintain hunger, moisture, stamina, health, food caches, shelters, age, lifespan, sex, generation, and changing forage/hunt/excavate/reinforce/rest/storm goals. Their regional summaries continue off-screen, only representatives within 24 m render, hunts affect the fish population, careful forage affects kelp, and suitable survivors can produce a juvenile.
- Added `BioluminescenceSystem`. Each scarce seaweed frond now supplies 64.8 seconds of living light; extra fronds form sequential reserve stacks instead of making a permanent unlock. Placing a frond transfers its remaining charge to a den wall. Multiple visible wall fixtures stack time and brightness modestly, remain constant rather than pulsing, and disappear individually as their charge expires. The HUD reports stack count and remaining time.
- Kept four luminous colonies distributed along the full descent route: enough to discover and chain, but sparse enough that a player must plan the trip and collect deeper replacements.
- Added `RareRelicSystem` with sparse weighted excavation finds: an equipable ancient knapped-stone adze, fired-ceramic insulator, titanium clasp, fused-glass lens, hadal zircon, and deep garnet. The finds explain why stone, fired ceramic, corrosion-resistant metal, optical glass, and minerals can remain recognizable around year 6030 even when organics and exposed structures are gone. The glass lens extends carried biolight; the adze is a real ninth hotbar tool; any find can be archived visibly in a den.
- Added a generated vector hotbar icon for the ancient adze and extended den state/totals with protected artifact archives.
- Added `scripts/verify-survival-expansion.mjs`. It verifies 1.37 m of sucker tree climbing, physical trunk separation, nearby/off-screen octopus simulation, repeated shelter work, two-stack wall light transfer, single-charge expiry, visible fixture removal, rare adze collection/equipping/storage, and zero browser errors.
- Production build, mandatory standard web-game client, tree wind, toolbelt, contest ending, focused survival expansion, and portrait controls at 390×844/430×932 pass. Visual QA confirms the nearby survivor, the recognizable steady wall-seaweed fixture, intact normal gameplay framing, and the ninth horizontally scrollable mobile hotbar slot.
- Rebuilt and re-audited the offline submission. `Tideborn-submission.zip` is 13.28 MiB with 10,168 lines of readable inline entrant code and all 39 public runtime assets; fresh extracted desktop and both portrait runs made zero external requests and produced zero browser errors.

## Next survivor/relic work

- Give neighboring octopi direct ownership of persistent planetary dens and locally excavated delta cells after player-versus-NPC excavation totals are separated; the first version intentionally avoids letting NPC digging satisfy the player's contest objective.
- Add flooded ruin biomes with ceramic/stone/glass/concrete distributions, corrosion states, and an artifact research table rather than treating every year-6030 find as an isolated drop.

## 2026-08-15 — Planetary core, defensive vent worms, and procedural clams

- Added the standalone `PlanetInteriorSystem` as Pelagos-730's canonical differentiated interior: 42 km oceanic crust, upper/lower mantle, 2,470 km-radius liquid outer core, and 910 km-radius solid inner core. The world atlas and `render_game_to_text` now expose the model and explicitly state that the 32 km trench is still 2,698 km above the core.
- Rewired the full equatorial cutaway to consume the same interior utility instead of approximate hard-coded layer sizes, then recaptured `output/globe-slice/tideborn-2d-planet-slice.png` with the exact core proportions.
- Added `DeepTubeWormSystem` with four deterministic hadal vent colonies and 20 varied individuals. A first sucker grip always triggers a 91–94°C mineral spray; continued digging/cutting costs stamina, harvests nutrient-dense meat, and creates a separate glowing restorative vesicle pickup.
- Added two saved survival resources: tube-worm meat restores 54 hunger and 11 health with `Z`, while collected vent tonic restores 34 health later with `U`. The portrait touch deck has a dedicated eighth `HEAL` button. Worm meat counts as winter food and can be stored in den slings.
- Added `ProceduralClamSystem` with 22 seeded reef clams, varied scale/color/rib count, visible shell hinges, and a real two-step interaction: `E` grips both valves, then repeated aimed dig input peels the shell open. Bare arms work slowly; wedges and shaped tools give stronger leverage. Opening yields food plus an intact shell and reduces regional shellfish.
- Kept procedural clams east of the handcrafted tutorial resource cluster and changed interaction routing to choose the closest target, preventing shellfish from stealing `E` from a nearer stone, wood, or kelp.
- Added `scripts/verify-core-worms-clams.mjs`. The focused browser run verifies both core layers/scale boundaries, clam grip → 48% visible pry → open/reward, first-contact thermal damage, three-cut worm harvest, collectible tonic, later meal/heal use, and zero console/page errors.
- Production build, mandatory standard web-game client, toolbelt/scallop regression, all contest ending paths, and portrait controls at 390×844/430×932 pass. QA captures are under `output/core-worms-clams/`; the canonical full slice is under `output/globe-slice/`.
- Rebuilt and audited `Tideborn-submission.zip` after the new systems. It is 13.28 MiB with 10,750 lines of readable inline entrant code and all 39 runtime assets; a fresh extracted-ZIP desktop plus both portrait runs made zero external requests, failed requests, console errors, or page errors.

## Next core/vent work

- Add long-duration vent-worm regeneration and colony reproduction to the region summary simulation; harvested individuals currently stay gone only for the active session.
- Add mantle convection, magnetic-field, quake, and volcanic-chain summaries to `PlanetInteriorSystem` before any campaign mechanic depends on core heat.

## 2026-08-15 — Reclaimed abyssal shell, megacave biomass, and amphibious crabs

- Rebuilt `PlanetInteriorSystem` without changing the 5,200 km radius or 2,470 km outer-core radius. The oceanic crust is now 21 km and the lower mantle 945 km—exactly half their previous 42 km and 1,890 km thicknesses. The reclaimed 966 km is a canonical mixed water-rock shell from 21–987 km depth, with explicit UI and cutaway disclosure that this is speculative Tideborn geology.
- Extended `DepthAccessSystem` below the 27 km hydrothermal route. The final local megacave segment maps continuously into the 987 km habitat limit; ordinary sunlight remains zero and navigation still depends on terrain-occluded biological/geothermal light. Added connected bottom chambers to `MatterWorld` as the first streamed representative of that shell.
- Expanded `ProceduralClamSystem` from 22 reef clams to 120 reef-through-megacave representatives. Only animals within 13.5 m render, while an 18,400-clam regional summary remains simulated. Deep shells use pressure-zone palettes and a higher rare-nacre chance; crabs and the player consume the same entities.
- Extended `DeepSeaShoalSystem` with 48 blind megacave glassfish, collision-safe instanced rendering, lifespan/breeding state, and a 920,000-fish regional population. All five deep-fish communities now summarize more than 1.8 million fish while simulating only the nearby bubble.
- Added `AmphibiousCrabSystem` as a separate utility. Eight shore crabs, ten Ilyoplax mudflat crabs, and five coconut crabs are active representatives of 11,700 regional animals. They follow live granular terrain across water and land, collide, age, vary in size, breed, hunt fish and clams, feed visibly, respond to Jet Burst/Jet Blast, pinch the player, and can be hunted with `H`. Off-screen animals retain life state but do not render or run detailed movement.
- Integrated all four newly supplied files: three crab GLBs are species representatives and the fourth octopus GLB represents a neighboring survivor. Only two imported crabs per species are cloned; remaining animals retain lightweight procedural fallbacks. Texture caps reduced the three crab files from about 78 MB to about 25 MB while preserving embedded author/license/source metadata.
- Updated the equatorial cutaway and atlas to expose the dark-blue 966 km habitat ring and recaptured `output/globe-slice/tideborn-2d-planet-slice.png`. Updated formal attribution with TwilightFox, AnnaDemol, boxgizmo, and StinkySkunk12 plus the mandatory Sketchfab Standard review gate.
- Added `scripts/verify-abyssal-shell-crabs.mjs`. It verifies exact layer reclamation, on-land/underwater/culling counts, imported model loads, clam predation, breeding, jet response, player hunting, 463.77 km depth mapping, visible cave clams, glassfish collision clearance, and zero browser errors. Screenshots are in `output/abyssal-shell-crabs/`.
- Rebuilt and audited the offline contest package after the ecology expansion. `Tideborn-submission.zip` is 34.51 MiB with 11,372 lines of readable inline entrant code and all 43 public runtime assets. A fresh extracted ZIP passed desktop, 390×844, and 430×932 gameplay with zero external requests, failed requests, console errors, or page errors.

## Next abyssal-shell work

- Split the compressed 966 km shell into independently streamed cave addresses so a campaign dive transitions between multiple local matter fields instead of mapping the last ten local meters across hundreds of kilometers.
- Add crab burrows, molting, eggs/larvae, carrion, and direct predator links from shore birds and octopi before using crab abundance for long-term ecosystem balance.

## 2026-08-15 — Octipoint Sphere and visual supply economy

- Recreated the supplied neon ability-map concept as the interactive, Tideborn-native Octipoint Sphere inside Settings. The standalone `OctipointSystem` defines six color-coded branches—Manipulation, Mobility, Combat, Survival, Environment, and Crafting & Tools—with 18 connected Tier I–III nodes, prerequisite checks, one-point purchases, effect queries, XP history, and serializable telemetry.
- Players begin with one instinct Octipoint and gain survival XP from first-time depth exploration, time alive, hunting, clam and vent-worm harvesting, ecological foraging, excavation milestones, crafting, claiming dens, sleeping safely, placing den equipment, and repairs. Every 100 XP becomes an Octipoint; the HUD button, XP meter, and connected available nodes glow when a point can be spent.
- Purchased nodes immediately affect live mechanics: dig strength/radius, clam leverage, vegetation yield, Jet Burst force/recovery, predator ink duration, hunting stamina, moisture and hunger drain, restorative sleep, cord/rope output, mineral/supply sensing, and den reinforcement.
- Added actual Settings controls for reduced bloom and larger supply icons. O or the touch-friendly ADAPT button opens the full sphere and pauses safely; Escape, O, or the close button resumes. Portrait 390×844 uses a readable vertically scrolling grid without blocking the touch deck after close.
- Generated and integrated 17 transparent resource icons matching the existing mineral art: fresh and salt-cured food, tube-worm meat, vent tonic, bioluminescent kelp, edible kelp, fibers, cord, rope, intact shell, wood, bone, stone, carapace fragments, sponge, mussel adhesive, and pumice. The bottom Supply Sling now uses image counters like the Mineral Pouch and scrolls horizontally on mobile.
- Added `SupplyCollectibleSystem` with nine sparse world pickups across coastal, deep, and vent regions: filter sponges, mussel bio-adhesive, and vent pumice. Added alternative recipes using all three. The first regression pass found a sponge could steal E from a closer clam; interaction and prompt routing now compare distances across loose objects, supplies, clams, and tube worms.
- Added `scripts/verify-octipoints-supplies.mjs`. It passes at 1440×900 and 390×844 with zero browser errors, verifies all 17 icons load, real adhesive collection, 18 nodes/six branches, connected purchases/effects, touch close, and portrait containment. Production build, the standard gameplay client, portrait controls at 390×844 and 430×932, tool crafting/prying, and the full clam/vent-worm chain pass after the routing fix.

## Next Octipoint work

- Persist the Octipoint ledger when the campaign save loader is introduced; the current autosave records the snapshot, but this contest build intentionally restarts progression with a new session.
- Expand each branch beyond three proof-of-system nodes, add adjacency paths between branches, and let neighboring survivor octopi express their own adaptation profiles.

## 2026-08-17 — Pelagic food web, predator perception, crab assets, and dive budgets

- Added two real open-ocean populations to `DeepSeaShoalSystem`: silver sprats and blue mackerel. The active bubble carries 62 lightweight representatives backed by 905,000 regional fish, with a deliberately mild shelf-productivity bias and smaller deterministic offshore aggregations instead of an empty pelagic corridor or an even wallpaper distribution.
- Connected those shoals to `DeepSeaLifeSystem` as actual prey. Orcas and sixgills now choose nearby fish, chase them, consume them, and enter a feeding state; the focused run recorded an orca taking a silver sprat and a sixgill taking a lanternfish.
- Strengthened player perception without making predators omniscient. Orcas, sharks, and hunting eels gain species-specific range plus a movement/vibration bonus, retain a search for several seconds after contact, and still respect camouflage/ink. A verified sixgill acquired the player, displayed an alert, closed distance, and reduced health to 87.
- Rebuilt `PredatorAlertVisual` for abyss readability. Three red/orange sonar rings plus a diamond threat beacon render above the pitch-black depth mask, while non-hunting animals stay unmarked.
- Replaced the limited crab-representative path with the supplied species GLBs for every nearby visible crab. Procedural bodies now exist only as asynchronous loading fallbacks; the mudflat verification reached `ilyoplax-mud-crab` ready with zero visible fallback meshes.
- Added asset-template caching, enabled frustum culling, and flattened compatible static GLBs. The tested creature set was reduced from 45 static source meshes to 12 prepared meshes without changing the authored animated models.
- Reduced continuous deep render work: batched fish instance uploads, culled off-screen anemone tentacle deformation, throttled bubble-buffer uploads to 30 Hz, skipped hidden rain work, and disabled bloom in unlit pitch-black water.
- Found and removed a second major dive bottleneck in the procedural clam beds. Each clam's many individual rib line objects are now two batched `LineSegments` geometries. In the same staged stress scene, abyssal GPU geometry count fell from 883 to 554 (37%), hadal geometry fell from 1,829 to 910 (50%), and effective scene-object count fell by roughly 36–38% while keeping all 120 active clams and the 18,400 regional population.
- Added `scripts/verify-pelagic-predators-crab-assets.mjs` and upgraded `scripts/profile-deep-performance.mjs` so screenshots are optional during render profiling. The focused ecology/assets test, production build, and mandatory standard gameplay client all pass with zero console/page errors. Visual QA covers the offshore school/orca hunt, unmistakable sixgill alert and bite, supplied mudflat crab, and ordinary starting gameplay.

## Next pelagic/performance work

- Replace the current deterministic offshore aggregations with slow seasonal migration fronts and nutrient/current cells while retaining the cheap regional summaries.
- Add terrain-occluded predator line of sight on top of the existing vibration sense, then expose separate sight/smell/vibration cues to the player.
- Profile on the target physical phone. SwiftShader remains useful for relative resource counts and worst-case hitches, but its absolute frame timing is not representative of a hardware-accelerated browser.

## 2026-08-17 — Pre-submission performance and compliance audit

- Audited the current 36,648,355-byte ZIP against the supplied 35 MB rule. The existing audit reports 34.95 MiB but does not enforce either a decimal or binary threshold. This is a submission blocker: the file is 1,648,355 bytes above 35,000,000 bytes and only 51,805 bytes below 35 MiB.
- Identified 3,117,594 compressed bytes of safely prunable package duplication/development art: the unused tree source atlas, unused tree crops, and the duplicate contest-facing tool-icon copy. Pruning these from the package while retaining the six runtime tree variants and one tool-icon path projects a 33,530,761-byte ZIP.
- Confirmed the three required artifact types exist. The Design Intent is one clean rendered page, 346 words, text-only, English, and has blank creator/last-modified metadata. The formal Build Log exists but stops before the latest cryosphere, moisture, planet slice, survivor/relic, vent/clam, Octipoint, pelagic, crab-asset, and performance work, and its final size/asset claims are stale.
- Reconfirmed the freshly extracted package reaches gameplay at desktop, 390×844, and 430×932 with no external requests, failed requests, console errors, or page errors. A physical-phone run remains unperformed.
- Marked licensing as the highest-risk nontechnical gate. The ZIP exposes eight Sketchfab Standard GLBs as standalone files despite the license restriction on allowing standalone access; the manta is CC BY-NC-SA; and the neighboring-survivor file is described as an Animal Crossing: New Horizons octopus, creating a separate underlying-IP risk. Replace these with original/generated assets or obtain explicit written permission before upload.
- Researched current Three.js/MDN guidance and mapped it to concrete Tideborn work: cache/throttle DOM HUD updates, cache prey arrays until ecology changes, pool/dispose burst geometry, send matter simulation to a Worker, upload only dirty DataTexture rows, prewarm lazy models with `compileAsync()`/`initTexture()`, add LOD to imported fauna, use `InstancedMesh`/`BatchedMesh` for repeated props, and evaluate KTX2/Basis for texture-heavy models.

## Submission gates from this audit

- Enforce `< 35,000,000` bytes in `audit-submission.mjs`, prune unused/duplicate assets, and target at most 33 MB for portal safety.
- Replace or relicense every risky model; update attribution with modification notices for retained CC BY assets.
- Bring `submission-docs/build-log.md` through the final optimization/compliance session and correct its final evidence figures.
- Run one complete win path, one loss/reset path, and a 10–15 minute thermal/performance soak from the extracted ZIP on an actual 390×844- or 430×932-class phone.
- Rebuild, hash, offline-test, audit, and perform a real portal upload dry run before the deadline.

## 2026-08-17 — Submission hardening, original creature models, and bubble shader

- Replaced nine contest-risk imported-model paths with original reusable Three.js geometry builders: clownfish, reef fish, orca, manta, cyan abyss hunter, shore crab, mudflat crab, coconut crab, and neighboring octopus. Retained only six attributed CC BY 4.0 GLBs in the submission. Updated the formal attribution so no unresolved model-license family remains.
- Added `BubbleShaderSystem` as a separate GPU utility. A single shared geometry/material renders three wrapped fields; rise, current wobble, size pulse, translucent glass rim, moving glint, fog, and depth/biolight response run in GLSL. Telemetry verifies 1,600 particles and zero per-frame CPU position uploads.
- Reduced recurring main-thread/GPU churn: HUD DOM refresh now runs at 10 Hz, static clam prey data is cached until consumption, burst effects share geometry and color materials, and depth fog reuses color objects.
- Replaced recursive public-asset copying with `scripts/submission-assets.mjs`, a byte-verified 43-file allowlist. The package rewrites tool paths to `assets/tools/`, excludes unused tree crops/source atlases and replaced GLBs, and fails automatically at 35,000,000 bytes or more.
- Fixed fast portrait startup by synchronizing touch-deck visibility with both game state and late camera layout, then removed its transition timing dependency. Extracted-ZIP tests pass at desktop, 390×844, and 430×932 with movement/Jet controls and zero external requests, failed requests, console errors, or page errors.
- Standard gameplay client passed after movement input; the capture and text state agree on `mode: playing`, directional swim/arm trail, live season/moisture, and shader bubbles. Focused ecology verification passed with 62 visible offshore fish, orca and sixgill feeding, a sixgill alert/attack reducing health to 87, original crab replacement ready, and no asset/browser failures.
- Final automated compliance audit passes. Current ZIP is 8.71 MiB (exact byte count recorded by the final build), with top-level `index.html`, 12,233 readable inline code lines, local Three.js vendor modules, relative asset paths, and a fresh offline runtime hash.

## Remaining manual submission gate

- Test the final ZIP for 10–15 minutes on an actual target phone, including one complete win, one loss/reset, deep dive heat/performance, and a portal-upload dry run. No physical phone is connected to this workspace.

## 2026-08-17 — Stronger digging and layered ocean surface

- Increased ordinary excavation power from a `1.08` to `1.14` base multiplier and shortened held-dig repeat time from `0.32 s` to `0.29 s`. Together this is roughly 16% more digging throughput while preserving hardness, stamina, bracing, tools, and Octipoint upgrades. Bare arms still require sustained work on clay; the clay regression reached 9%, 45%, and a real displaced-material breakthrough with no browser errors.
- Replaced the two-wave inline water material with the standalone `OceanSurfaceSystem`. The new one-pass shader sums four differently scaled/directed wave trains, sharpens crests, uses a restrained lateral Gerstner-like shift, adds two moving micro-ripple fields, depth attenuation, fine caustics, slope-driven sky color, crest foam, and live granular-terrain shoreline foam.
- Kept the renderer inexpensive: it still uses one transparent plane and one material, performs no reflection scene pass, and samples the existing matter `DataTexture` for shore contact. The mesh now has 768 horizontal segments so calm waves remain smooth and storms can form visibly larger crests. Pitch-black abyss/hadal fragments take an early shader exit before any ripple, caustic, reflection, foam, or terrain-texture work.
- Used NVIDIA's primary GPU Gems water guidance for independent summed waves, sharpened/Gerstner crests, high-frequency surface detail, and shoreline/depth attenuation (`developer.nvidia.com/gpugems/.../chapter-1-effective-water-simulation-physical-models`). Compared the result with the official Three.js `Water` addon and ocean shader examples, then chose a cheaper side-view reflection band rather than a second reflected-scene render.
- Visual QA found the first reflection band extended about 11 m down the water column and formed bright vertical strips. Tightened foam/reflection to the upper ~45 cm and interpolated foam noise across time to remove popping. Final calm/storm captures are `output/ocean-surface/calm-coast.png` and `output/ocean-surface/storm-coast.png`; the focused utility test reports four wave layers, a 768-segment mesh, zero reflection passes, live shoreline masking, and zero console/page errors.
- Rebuilt the final contest package after the water/digging change. `Tideborn-submission.zip` is 9,135,432 bytes (SHA-256 `f247d32c0217f7a0a2d4edac3ec5713569106c2cd23231956fe475ccf5633624`), carries 12,381 readable inline game-code lines and all 43 allowlisted runtime assets, and passed clean extracted-ZIP desktop plus 390×844/430×932 portrait runs with zero external requests, failed requests, page errors, or runtime errors.

## 2026-08-17 — Conservative swept terrain contact trial

- Applied the first low-risk recommendation from the contact-method research as a standalone `SweptContact2D` utility. It is intentionally not the paper's full FEM cubic barrier: Tideborn's player and terrain are an ellipse against a 2D cellular field, so the useful near-term transfer is conservative path traversal and first-contact handling rather than a Newton/PCG elasticity solve.
- Replaced endpoint-only octopus terrain movement with a whole-path swept ellipse. Motion is sampled at less than half a matter cell per substep, first impact is refined with eight binary-search iterations, and the remaining inward component is projected away while tangential travel continues along the wall.
- Preserved the former collision path as an emergency recovery only when a collapse has already created terrain inside the octopus. Added runtime telemetry for sweeps, contacts, slides, start penetrations, prevented travel, maximum attempted travel, query count, substeps, contact time, and normal.
- Added `scripts/verify-swept-contact.mjs`. A deterministic 2.4 m test proves the old endpoint check would miss a one-cell basalt wall; the swept path stops at `x = -0.430147 m` without penetration. A diagonal impact retains 100% of its requested tangential travel, and an actual octopus moving at an intentionally excessive 48 m/s also stops cleanly with no inward velocity or fallback.
- Production build, the mandatory standard gameplay client, breach-jet regression, planetary wrapping, and swimming arm-trailing regression pass with zero browser errors. Visual evidence is in `output/swept-contact/diagonal-wall-slide.png` and `output/swept-contact-standard/shot-0.png`.
- Rebuilt and audited the contest package after this trial. `Tideborn-submission.zip` is 9,137,283 bytes (SHA-256 `b7948e0700e14a05b51203d976bcf4c818935cc625b8ea3e6e1576c11254d36e`), contains 12,638 readable inline code lines and all 43 allowlisted runtime assets, and passed a fresh extracted-ZIP desktop plus 390×844/430×932 portrait run with zero external requests, failed requests, console errors, or page errors.

## Next contact work

- Keep this player/terrain trial isolated until physical-phone profiling confirms its cost. If adopted more broadly, benchmark the same conservative sweep for tree capsules and high-speed predators rather than routing ordinary schooling contacts through it.
- Prototype particle merge/split only after Tideborn has real physical debris or rope nodes; it is not appropriate for the current cellular water, granular cells, or general fish collisions.

## 2026-08-17 — Restored full-fidelity orca, fish, and crab assets

- Corrected an over-broad submission-hardening choice that had silently redirected the local game’s orca, clownfish, reef fish, and three crab species to code-built replacements. The supplied GLBs were still present under `public/assets/models/`; `CreatureAssetLibrary` now uses them in localhost and normal builds.
- Added an explicit dual asset profile. Normal gameplay reports `assetMode: full-glb`; `build:submission` defines `VITE_CONTEST_SAFE_CREATURES=1` and reports `assetMode: contest-safe`, retaining the license-cleared code-built versions for files whose embedded metadata says Sketchfab Standard. The animated shark and six CC BY deep-fish GLBs remain shared by both profiles.
- Preserved the high-population rendering strategy: nearby coastal representatives use animated clownfish/reef-fish GLBs, while huge sprat, mackerel, lanternfish, and deep-shoal populations remain lightweight silhouettes/instances. This is intentional population LOD rather than a missing-model fallback.
- Removed eager decoding of every crab file. Shore, mudflat, and coconut crab GLBs now load only when that species enters the active bubble, avoiding an automatic 25+ MB startup decode while preserving the detailed model for nearby animals.
- Upgraded `scripts/verify-imported-creature-assets.mjs` to stage and capture the detailed coast, orca, mudflat crab, and coconut crab. It verified all six restored IDs in `full-glb` mode, zero failed assets, 44 attached instances, 15 animated mixers, and zero visible crab fallback meshes or browser errors. Captures are under `output/imported-creatures/`.
- The mandatory standard game client completed in `full-glb` mode with the restored coast and no errors. SwiftShader first-load capture was slow because the animated shore crab is 92,491 triangles and the three crab files total more than 25 MB; physical/GPU profiling and a proper LOD/decimation pass remain advisable.
- Rebuilt the contest-safe ZIP and hardened its offline test with deterministic mobile stepping plus longer cold screenshot capture. The extracted package passed desktop and both portrait sizes with zero external requests, failed requests, console errors, or page errors, and made no request for excluded orca/fish/crab GLBs.
- Final contest-safe artifact: 9,137,400 bytes, SHA-256 `45a1b6021fff88aeaebf3d5246714a48a590568f1c463fcac68a7665cae9fbe9`, 12,646 readable inline code lines, 43 allowlisted runtime assets, and a passing compliance audit.

## Next creature-asset work

- Produce optimized original or explicitly redistributable orca/crab GLBs before switching the contest package to the same full-fidelity profile. Do not silently replace local art again.
- Decimate the animated shore crab from roughly 92,000 triangles and generate near/mid LODs; reduce coconut-crab texture payload while preserving the supplied look.

## 2026-08-18 — Correct 2D orca orientation

- Rotated the supplied orca GLB 90 degrees around Y so its native nose-to-tail Z axis lies across the side-view gameplay plane. The creature anchor still mirrors X for correct left/right travel.
- Strengthened `scripts/verify-imported-creature-assets.mjs` with a rendered-geometry check. It samples the attached GLB's transformed vertices and now rejects a front-facing orca unless its XY silhouette is at least 2.1 times wider than tall.
- Focused full-GLB verification passed with a measured 4.34 m × 1.46 m silhouette (2.98:1), 44 asset instances, 15 animated mixers, zero failed assets, and zero console/page errors. Visual QA confirms the authored black-and-white orca is broadside in `output/imported-creatures/pelagic-orca.png`.
- The mandatory standard gameplay client also reached `mode: playing` through keyboard input with no reported runtime errors; its capture is `output/orca-orientation-standard-enter/shot-0.png`.

## 2026-08-18 — Grounded crab crawling

- Replaced velocity-based crab pitching with sampled terrain support. Left, center, and right foot probes establish a planted stance; the carapace inherits only a restrained portion of gentle terrain slope and remains within roughly ±5 degrees.
- Lifecycle scale now affects terrain clearance, so juveniles and large adults place their feet at the correct height. The three authored crab GLBs also use bottom/foot anchors instead of generic bounding-box centers.
- Ordinary foraging no longer treats a one-cell pinnacle or near-vertical cliff as walkable ground. Crabs turn around with their stance planted at ledges, while Jet Blast stagger can still launch them normally.
- Crab collision correction now re-seats grounded animals before rendering and restores their last planted position if another crab would shove them over a cliff. Visuals update after collision, eliminating the prior one-frame body/model mismatch.
- Added grounded-state telemetry (`grounded`, body angle, support gap, crawl distance) and `scripts/verify-crab-ground-crawl.mjs`. The full-GLB run verified shore, mudflat, and coconut crabs all moved, retained zero physics support gap, avoided terrain penetration, and kept modeled feet within contact tolerance with zero browser errors.
- Focused captures are in `output/crab-ground-crawl/`. The mandatory standard client reached `mode: playing`, loaded both nearby full crab GLBs with zero asset failures, and reported every nearby shore crab grounded with zero support gap.

## 2026-08-18 — Deep-swimming performance pass

- Added a depth-by-depth CPU/GPU profiler and reproduced the reported descent hitch in twilight, midnight, abyssal, hadal, and megacave bands. The largest avoidable CPU cost was not fish AI: a camera-relative bottom strip deliberately kept settled granular terrain awake, which repeatedly changed the full 1024×1024 material texture while the player descended.
- Converted granular activity to explicit wake-on-change behavior. Settled sand, mud, and mineral cells now sleep regardless of camera depth; digging, placement, displacement, material swaps, and natural reactions wake their local neighborhood. The focused regression records zero cell moves and zero texture uploads throughout untouched deep travel, while a 29-cell loose-mineral pile wakes, performs 783 moves, and uploads changed texture state.
- Removed redundant depth-tier renderer reallocations. Aphotic, midnight, and abyssal tiers share one deep pixel-ratio cap, and `Game.resize()` now changes renderer/composer allocation only when the actual pixel ratio or viewport dimensions change. In the isolated simulation profile, the first abyss step fell from an 8,099 ms software-renderer stall to 35.5 ms.
- Removed the 20 independent tube-worm point lights from the hadal habitat. Worm crowns remain emissive and share the existing vent illumination, avoiding a per-fragment light-loop multiplier while preserving the glowing vent composition and thermal-spray gameplay.
- Disabled invisible work in pitch-black water: the bubble point fields are hidden when ambient light is effectively zero, and deep bloom is skipped once natural darkness reaches the abyssal threshold. Bioluminescent geometry, carried lights, den lamps, vent glow, and light occlusion remain active.
- Diagnosed `abyss-spinefish.glb` as a Sketchfab collection containing ten widely separated fish rather than one gameplay creature. Added a reproducible Meshoptimizer step that preserves the original source, selects the authored `FishLOW_0` specimen, reduces its active mesh from 14,942 to 8,946 triangles, and ships `abyss-spinefish-lod.glb`. Visual verification now shows one recognizable broadside fish instead of a compressed blue model bundle.
- Under the same 960×600 DPR-1 SwiftShader stress profile, steady twilight improved from 6.3 to 17.1 fps, midnight from 6.2 to 13.4 fps, abyss from 3.9 to 15.2 fps, and hadal from 3.7 to 9.0 fps. These absolute software-renderer numbers are intentionally pessimistic; the relative comparison uses identical conditions.
- Production build, bare-arm clay breakthrough, imported deep-fauna, tube-worm/clam behavior, granular wake behavior, and the standard gameplay client all pass with zero browser errors. The standard client reached `mode: playing`, moved/swarmed normally, and reported zero material uploads while terrain remained untouched.

## 2026-08-18 — Development server restored

- Confirmed the reported `localhost:4173` outage: no process was listening on the development port. Restarted Vite on port 4173 and verified an HTTP 200 response.
- The standard gameplay client reached `mode: playing`, moved the octopus through live coastal water, and reported zero browser errors. Visual evidence is in `output/server-restart-check/shot-0.png`.

## 2026-08-18 — Tree-blocked crabs, swimming Jet Blast, aggregate digging, and rival predation

- Routed all above-water crab bodies through the reusable generated-tree trunk capsules. A contact removes inward velocity, turns the crab back toward open terrain, preserves ordinary ground settling, and records both per-crab contact IDs and global tree-contact telemetry.
- Changed Jet Blast from a small reverse recoil into a strong forward mantle surge along the aimed blast vector. The underwater speed allowance now keeps that surge from being immediately clamped; the focused run measured roughly `5.96 m/s` initial forward speed and `1.32 m` of travel over the first `0.26 s`, while the existing predator/terrain regression still cleared 188 cells and ruptured the staged sixgill.
- Added explicit excavation material classes and per-material strength multipliers. Sand, wet sand, mud, crushed shell aggregate, soil, and mineral/gravel packets are easier to displace or fracture, while limestone and basalt retain their previous hardness. A bare-strength mineral packet broke through after 43 deterministic chip actions; clay still preserves its deliberately slow 9% → 45% → displaced-material progression.
- Added close-range conspecific predation to the shared `H` hunt action. A rival octopus must be in forward arm range and costs 22 stamina; a successful grapple removes it from the survivor population, restores hunger/health, recovers its cached food, emits hunt/feeding VFX, and grants hunting Octipoints experience. HUD and contextual prompts now name nearby rival octopi.
- Added `scripts/verify-predation-propulsion-aggregate-tree.mjs`. It passed tree clearance/contact, aggregate/rock profiles, swimming propulsion, survivor population loss, hunger/health recovery, cached-food recovery, and zero console/page errors. Updated the older crab crawl test to distinguish unobstructed shoreline/mudflat movement from expected forest tree obstruction and to hold large GLBs still during cold decode.
- Mandatory standard client reached `mode: playing` with no errors; visual inspection confirms the live coastal scene and forward Jet Blast bubble/impact stack. Evidence is in `output/standard-gameplay-new-interactions/shot-0.png` and `output/mouse-aim-jet-blast-trees/jet-blast-terrain-and-predator.png`.
- Rebuilt the contest-safe artifact after these changes. `Tideborn-submission.zip` is 9,145,168 bytes (SHA-256 `8f57e49725443d8aae78ac1527f574e3cab1ecc7dabc5da60379ff3a23ef3979`) with 13,010 readable inline game-code lines. A fresh extracted ZIP passed desktop plus 390×844 and 430×932 portrait play with zero external requests, failed requests, page errors, or runtime errors; the only remaining compliance gate is a real-phone pass.
