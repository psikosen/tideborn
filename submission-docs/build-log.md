# Tideborn Build Log

## Project and AI workflow

Tideborn is a portrait-oriented Three.js / HTML5 prototype in the Survival & Resource Management category. The game was created through iterative natural-language prompting with Codex. The human supplied the original creative vision, reviewed browser builds, provided screenshots and assets, and requested changes. Codex performed the heavy implementation work: project scaffolding, TypeScript systems, shaders, procedural generation, UI, asset optimization and integration, automated Playwright tests, debugging, profiling, packaging, and documentation.

This formal log condenses the detailed running record in `progress.md`. Each session followed the same loop: prompt -> implementation -> browser actions -> state/screenshot inspection -> correction -> regression test.

## Session 1 - Core vertical slice (August 14, 2026)

**Prompt direction:** Create Tideborn as a Three.js 2.5D granular survival game about a future amphibious octopus; include gathering, crafting, den excavation, ecosystems, weather, deep water, and a three-day storm.

**Decisions:** Scope the competition build to one deterministic coastal cross-section. Represent terrain as a DataTexture material grid rather than individual cubes. Use local cellular matter plus entity-based animals and tools.

**AI implementation:** Created the Vite/TypeScript project, orthographic Three.js scene, 512 x 256 material field, octopus controller, eight procedural arms, survival meters, gathering, 12 recipes, den preparation, basic wildlife, day/night, storm, and vent teaser.

**Problems and iteration:** The starter den tunnel ended inside the shoreline mask, crafting buttons detached during live DOM refresh, and early digging grazed too few cells. Codex extended the tunnel, made recipe refresh state-driven, and enlarged the dig sweep.

**Evidence:** Production build passed. Automated play reached the den, crafted and placed a sling and brace, stored food, survived the storm, and produced no browser errors.

## Session 2 - Physical abilities, shaders, and deep light

**Prompt direction:** Add stronger octopus techniques, more shaders, black deep water, bioluminescent seaweed, realistic light obstruction, and much greater depth.

**Decisions:** Treat 2D terrain rays as the efficient equivalent of ray tracing for this engine. Allow blind descent, but reveal terrain only inside carried biological light.

**AI implementation:** Added pooled ability VFX, arm shaders, Ink Burst, shader kelp and vent plumes, bloom, a 32 km ocean scale, pressure bands, a 27 km vent route, and a 160-ray terrain-occlusion texture that responds to excavation.

**Problems and iteration:** Darkness originally changed with horizontal travel, tentacles were brighter than the mantle, and the vent was too shallow. Codex tied darkness to canonical depth, unified arm/body shading, removed the invisible depth barrier, and expanded the route by more than five times.

**Evidence:** Blind and lit route captures showed pitch-black hadal water outside the seaweed halo. Build and lighting regressions completed without console errors.

## Session 3 - Planet continuity, dens, tools, and resources

**Prompt direction:** Remove map edges, make clay slowly diggable by bare arms, add a hotbar, multiple dens, mineral drops, better swimming jets, camouflage, and surface grip.

**Decisions:** Use a horizontally wrapped planetary belt for the prototype and keep systems behind upgradeable utilities.

**AI implementation:** Added wrapped traversal, toolbelt and generated icons, slow fracture accumulation, mineral economy and generated mineral icons, multiple claimable dens, steady den biolight, water-to-air breach jets, directional tilt, surface-matched camouflage, and `G` grip.

**Problems and iteration:** Terrain seams and repeated land silhouettes exposed the wrap. Codex rebuilt seam sampling and added procedural landmass variation.

**Evidence:** Automated tests verified world wrapping, clay breakthrough, tool switching, two dens, mineral collection/use, breach jets, steady den light, and surface concealment.

## Session 4 - Living food web and creature assets

**Prompt direction:** Add large numbers of fish, sharks and deep fauna; make predators hunt other animals; add alerts, feeding effects, collision, lifespans, size variation, breeding, and off-screen simulation.

**Decisions:** Keep regional populations alive numerically while only nearby representatives simulate and render. Use shared collision and lifecycle utilities.

**AI implementation:** Added reef schools, anemone hunting, sharks, orcas, deep predators, four streamed deep-fish communities, predator/prey links, alerts, feeding sequences, ink blindness, jet knockback, births, aging, deaths, multi-generation state, terrain avoidance, spatial-hash collision, and lazy GLB loading.

**Problems and iteration:** Fish crossed rocks, animals overlapped, dense schools reduced performance, and instant prey deletion made predation unreadable. Codex added terrain clearance, separation, broadphase collision, proximity culling, and a visible capture/swallow sequence.

**Evidence:** Tests recorded up to 99% broadphase pair reduction, natural predator feeding, breeding across generations, hidden off-screen schools, complete terrain clearance, and zero captured browser errors.

## Session 5 - Environment, aiming, and performance

**Prompt direction:** Add mouse-directed digging, a learned Jet Blast, varied landmasses, procedural trees with realistic storm movement and buried roots, then improve deep-water performance and swimming tentacles.

**Decisions:** Keep new capabilities modular: pointer aim, Jet Blast, procedural landmasses, tree wind material, depth performance budgets, and velocity-driven tentacle wake.

**AI implementation:** Added pointer excavation, trainable Jet Blast, crater/mineral/predator effects, six generated tree families, terrain-fitted root burial, upper-canopy wind deformation, adaptive deep render scale, cached terrain light rays, and hydrodynamic arm trailing.

**Problems and iteration:** Custom tree fog uniforms were missing; roots showed above gravel; full-resolution post-processing wasted work in black water. Codex fixed shader uniforms, sampled terrain tangents/burial depth, and added hysteretic depth quality tiers.

**Evidence:** At 1440 x 900 under software WebGL, hadal performance improved from 3.7 to 7.1 FPS and abyss performance from 3.9 to 6.3 FPS. Arm direction tests measured near-perfect opposite-flow alignment for horizontal, diagonal, and jet movement.

## Session 6 - Contest completion pass (August 15, 2026)

**Prompt direction:** Make the game genuinely playable in portrait on mobile; add a season-backed win/loss/results loop; create a compliant offline package, Design Intent, Build Log, and final audit.

**Decisions:** Use touch-first controls without removing desktop input. End the prototype at winter readiness: either discover seven dens or build one exceptional solo shelter. Package readable game code inline while keeping Three.js external in `vendor/`.

**AI implementation:** Added a reusable portrait touch-control utility with twin analog pads, seven action buttons, tappable toolbelt, touch crafting, responsive HUD, and a camera framing contract. Added modular seasons and contest-session systems, den-loss state, two reachable win paths, two loss paths, results summaries, and clean Play Again. Built an offline packaging pipeline that inlines readable entrant code and CSS while placing Three.js and its add-ons under local `vendor/`. Created the Design Intent, attribution inventory, survival presentation map, and automated compliance audit.

**Problems and iteration:** The first portrait pass published a camera recommendation without applying it, fixed-size waits made WebGL touch tests intermittent, and the initial standalone test covered desktop only. Codex connected the portrait camera to the game, shifted the octopus above the control deck, replaced desktop-only prompt text on touch devices, changed the tests to wait on observable state, and extended the extracted-ZIP test to both target phone sizes.

**Evidence:** Production build passed. Focused tests passed for movement, aim/dig, Jet, Grab, held Grip, camouflage, Use, crafting, hotbar, reset, solo-den win, seven-den win, death, den collapse, results, and clean restart. The final 13.26 MiB ZIP contains 8,817 lines of readable inline game code, all 38 runtime assets byte-identically, and top-level `index.html`. A freshly extracted ZIP ran from a clean static server with zero external requests, failed requests, console errors, or page errors at desktop, 390 x 844, and 430 x 932.

## Session 7 - Abyssal shell and amphibious crabs (August 15, 2026)

**Prompt direction:** Halve the lower mantle and crust, turn the reclaimed volume into deep ocean and caves, add abundant clams and deep fauna, and use four newly supplied crab/octopus assets.

**Decisions:** Preserve the 5,200 km radius and existing core. A 21 km crust plus 945 km lower mantle frees exactly 966 km for a speculative high-pressure water-rock habitat. Keep planetary abundance numerical and render only nearby representatives.

**AI implementation:** Rebuilt the canonical interior and 2D equatorial cutaway around a 21–987 km abyssal megacave shell. Expanded the local bottom into connected streamed chambers, grew the clam field to 120 interactive representatives, and added 48 blind glassfish backed by a 920,000-fish regional population. Added shore, Ilyoplax, and coconut crabs with land/water terrain locomotion, collision, hunting, feeding effects, jet response, player hunting, lifespan, size, sex, breeding, and culling. Integrated the fourth model as a representative neighboring octopus. Texture resizing reduced the three source crab models from about 78 MB to about 25 MB.

**Problems and iteration:** Full source textures were too expensive for browser delivery, and a uniform water-cell planet would be impossible. Codex capped texture resolution while preserving embedded attribution, retained procedural fallbacks for most crabs, limited imported representatives to two per species, and kept the huge cave ecosystem behind region summaries plus an active local bubble.

**Evidence:** Focused browser checks verified exact layer thicknesses, land and underwater crab populations, culled animals, clam predation, crab births, jet knockback, player crab hunting, all four model loads, 463.77 km cave mapping, nearby cave clams, 48 collision-safe glassfish, and zero console/page errors. Screenshots record both the amphibious coast and biolight-only megacave.

## Session 8 - Planet seasons, biosphere depth, and progression (August 16-17, 2026)

**Prompt direction:** Add snow and sea ice, seasonal moisture, a full planetary cutaway and core, deeper caves, tube worms, clams, amphibious crabs, other surviving octopuses, rare relics, resource art, and a sphere-grid-style Octipoint progression screen.

**Decisions:** Keep the playable world a streamed equatorial belt while presenting the whole ocean planet through deterministic atlas/cutaway utilities. Make cold, moisture, biology, and den readiness share the same season clock. Preserve enormous populations as summaries and instantiate only nearby representatives.

**AI implementation:** Added a four-phase season utility, regional snow/ice rendering, frozen surface cells, humidity/evaporation/precipitation moisture effects, a 5,200 km-radius differentiated planet and 987 km navigable water-rock shell, edible defensive tube worms, peelable clams, amphibious crab ecology, tree collision/climbing, survivor-octopus dens and behaviors, timed stacked biolight, rare minerals/artifacts, resource icons, and seven-branch Octipoint progression fed by exploration, hunting, crafting, excavation, den repair, and survival.

**Problems and iteration:** A first cutaway over-allocated mantle thickness, touch controls could appear before camera layout settled, and broad creature placement clustered near coasts. Codex reclaimed exactly 966 km for deep water/caves, synchronized mobile layout and controls, and expanded pelagic representative bubbles while retaining plausible coastal abundance.

**Evidence:** Focused tests passed for cryosphere/moisture state, planet-layer arithmetic, clams, tube worms, crab land/water behavior, Octipoint acquisition, tree interaction, other octopus activity, deep shoals, and predator alerts without browser errors.

## Session 9 - Submission hardening and shader bubbles (August 17, 2026)

**Prompt direction:** Find proven performance optimizations, identify missing contest requirements, complete the hardening work, and add bubble shaders.

**Decisions:** Remove every unresolved model-license family instead of asking the judges to interpret redistribution terms. Retain only clearly attributed CC BY models, replace the rest with original code-built geometry, ship an explicit asset allowlist, and make the build fail above 35,000,000 bytes.

**AI implementation:** Added original Three.js clownfish, reef fish, orca, manta, cyan hunter, three crab, and survivor-octopus builders. Added a shared GPU bubble system with shader-side rise, current wobble, pulse, glass rim, moving glint, darkness response, and zero per-frame position uploads. Throttled DOM HUD refresh to 10 Hz, cached static clam prey fields, reused burst geometry/materials, and reused fog colors. Rebuilt attribution around only shipped files and changed tool icons to the required `assets/tools/` path.

**Problems and iteration:** The first bubble material omitted Three.js fog uniforms, portrait controls remained inside a visibility transition during fast automated startup, and the old package copied unused source atlases and risky GLBs. Codex merged the fog uniform library, made touch-deck visibility deterministic, and replaced recursive asset copying with a byte-verified 43-file manifest.

**Evidence:** The standard gameplay client passed with readable state and no captured errors. Open-ocean verification showed 62 visible fish, orca and sixgill feeding, a sixgill player lock/alert and damage, seven original-model families loaded, and no asset failures. A freshly extracted ZIP passed desktop, 390 x 844, and 430 x 932 play with zero external requests, failed requests, console errors, or page errors.

## Session 10 - Excavation feel and ocean surface (August 17, 2026)

**Prompt direction:** Make digging a little stronger, add waves, and research proven 2D techniques so the surface no longer looks cheesy.

**Decisions:** Improve throughput modestly without bypassing terrain hardness or tools. Replace the synchronized two-sine surface with a reusable one-pass shader; reserve an additional reflection render for a later quality tier.

**AI implementation:** Raised dig force by 5.6%, shortened the held-dig cadence from 0.32 to 0.29 seconds, and added `OceanSurfaceSystem`. It combines four independent wave trains, sharper crests, restrained Gerstner-like horizontal motion, micro-ripples, depth color, caustics, a grazing sky-reflection band, and broken crest/shore foam sampled against the live matter texture. Fully dark abyss/hadal fragments exit early before the expensive surface work.

**Problems and iteration:** The first reflection band covered about 11 world meters and made vertical storm stripes. Codex caught this in focused calm/storm screenshots, confined surface light and foam to roughly 45 cm, and changed foam noise to interpolate over time rather than pop.

**Evidence:** Production build passed. The mandatory gameplay client reached playing state with no browser errors. The focused ocean test verified four wave layers, 768 mesh segments, a live shoreline mask, and zero extra reflection passes. The bare-arm clay regression reached visible fracture stages and displaced real clay cells.

## Session 11 - Swept terrain contact trial (August 17, 2026)

**Prompt direction:** Research three advanced contact/particle papers in parallel, identify ideas that fit the existing browser architecture, then try the safest recommendation.

**Decisions:** Do not transplant a 3D FEM, SPH octree, or merge/split particle solver into a 2D cellular game. Trial the directly useful concept first: conservative whole-path contact for the fast octopus, behind a reusable utility, while retaining collapse recovery.

**AI implementation:** Added `SweptContact2D`, which substeps an ellipse by less than half a cell, binary-searches first impact, computes an ellipse contact normal, and projects remaining motion onto the wall tangent. Integrated it into player movement and exposed diagnostic telemetry in the machine-readable game state. Added a deterministic focused browser test.

**Problems and iteration:** Endpoint-only motion could land safely beyond a thin wall after a Jet or frame hitch. The focused scene deliberately crossed 2.4 m through a one-cell basalt barrier while leaving the endpoint empty, reproducing that failure condition without relying on random terrain.

**Evidence:** The new path stopped at first contact with no overlap; diagonal contact retained all requested tangential travel; a 48 m/s integrated octopus could not tunnel. Standard gameplay, breach jets, planetary wrapping, and hydrodynamic arm motion passed without browser errors.

## Session 12 - Full-fidelity creature asset restoration (August 17, 2026)

**Prompt direction:** Explain why the orca, fish, and crab models looked procedural, and restore the supplied creature art without losing submission safety.

**Decisions:** Treat the local/full game and redistributable contest package as explicit asset profiles. Keep massive schools as lightweight population LOD, but use detailed GLBs for nearby named representatives. Never hide the selected profile.

**AI implementation:** Restored the supplied orca, animated clownfish, reef fish, animated shore crab, Ilyoplax crab, and coconut crab paths in normal builds. Added `full-glb`/`contest-safe` telemetry and a packager-only compile flag. Changed crab loading from eager to proximity-triggered so the three files do not all decode at startup.

**Problems and iteration:** The former license hardening changed the development game as well as the submission. Restoring all crab preloads exposed a severe first-load SwiftShader capture delay; lazy species loading retained the art while removing the automatic 25+ MB decode. Headless mobile scheduling also made fixed requestAnimationFrame waits flaky, so the offline test now uses the public deterministic time-step hook and longer screenshot capture without weakening gameplay assertions.

**Evidence:** Focused visual tests verified all six restored detailed IDs, no model failures, 44 attached instances, 15 animated mixers, detailed mudflat/coconut crabs with zero visible stand-ins, and a model-backed orca tied to hunting AI. Standard local gameplay passed in `full-glb` mode. The separate extracted contest ZIP passed desktop, 390 x 844, and 430 x 932 with zero external/failed requests or browser errors in `contest-safe` mode.

## Final QA checklist

- PASS - Portrait control and applied camera tests at 390 x 844 and 430 x 932
- PASS - Touch movement, aiming/digging, Jet, Grab, Grip, camouflage, interaction, tool selection, crafting, and reset
- PASS - Reachable win/loss states, results summary, Play Again, and clean session restart
- PASS - Freshly extracted ZIP on a clean static server with zero external network requests
- PASS - Readable unminified entrant code inside top-level `index.html`
- PASS - Three.js/add-ons under `vendor/`; all runtime references are relative
- PASS - Final ZIP audit enforces fewer than 35,000,000 bytes, `index.html` at ZIP root, readable inline game code, and the complete allowlisted runtime asset set
- PASS - Unresolved imported-model license families were replaced by original code-built animals; shipped GLBs are CC BY 4.0 and attributed
- MANUAL - No physical phone was connected; repeat the passing portrait checks on an actual device before upload
