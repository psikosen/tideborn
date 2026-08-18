export const submissionAssetEntries = [
  // Third-party CC BY 4.0 models retained with attribution.
  ['models/shark-animated.glb', 'models/shark-animated.glb'],
  ['models/deep/twilight-emperor.glb', 'models/deep/twilight-emperor.glb'],
  ['models/deep/midnight-angler.glb', 'models/deep/midnight-angler.glb'],
  ['models/deep/abyss-spinefish.glb', 'models/deep/abyss-spinefish.glb'],
  ['models/deep/hadal-stalker.glb', 'models/deep/hadal-stalker.glb'],
  ['models/deep/bloodfin-leviathan.glb', 'models/deep/bloodfin-leviathan.glb'],

  ...['copper-ore', 'ironstone', 'manganese', 'obsidian', 'quartz', 'salt']
    .map((name) => [`minerals/${name}.png`, `minerals/${name}.png`]),
  ...[
    'adhesive', 'bone', 'cord', 'crab-carapace', 'fibers', 'food', 'kelp', 'large-shell',
    'pumice', 'rope', 'seasoned-food', 'sponge', 'stone', 'tube-worm-meat', 'vent-tonic', 'wood',
  ].map((name) => [`resources/${name}.png`, `resources/${name}.png`]),
  ...['lightning-snag', 'narrow-cedar', 'primitive-fern', 'shoreline-oldgrowth', 'storm-scrub', 'windswept-pine']
    .map((name) => [`trees/variants/${name}.png`, `trees/variants/${name}.png`]),
  ...[
    ['ancient-stone-adze.svg', 'ancient-stone-adze.svg'],
    ...['bare-arms', 'bone-hook', 'fiber-net', 'glow-kelp', 'shell-blade', 'shell-spade', 'stone-hammer', 'stone-wedge']
      .map((name) => [`${name}.png`, `${name}.png`]),
  ].map(([source, destination]) => [`tool-icons/${source}`, `tools/${destination}`]),
];

export const maximumSubmissionZipBytes = 35_000_000;
