import { Inventory, ResourceKey } from './data';

export type ToolId =
  | 'arms'
  | 'shellBlade'
  | 'shellSpade'
  | 'stoneHammer'
  | 'stoneWedge'
  | 'boneHook'
  | 'net'
  | 'glowKelp'
  | 'stoneAdze';

export interface ToolDefinition {
  id: ToolId;
  label: string;
  use: string;
  icon: string;
  resource?: ResourceKey;
  dig?: { strength: number; radius: number };
}

export const TOOL_DEFINITIONS: readonly ToolDefinition[] = [
  {
    id: 'arms',
    label: 'Bare arms',
    use: 'Grip, pull, crush, and slowly excavate.',
    icon: './assets/tool-icons/bare-arms.png',
    dig: { strength: 0.65, radius: 0.38 },
  },
  {
    id: 'shellBlade',
    label: 'Shell blade',
    use: 'Cut plants cleanly without uprooting them.',
    icon: './assets/tool-icons/shell-blade.png',
    resource: 'shellBlade',
  },
  {
    id: 'shellSpade',
    label: 'Shell spade',
    use: 'Move a broad fan of sand, soil, and clay.',
    icon: './assets/tool-icons/shell-spade.png',
    resource: 'shellSpade',
    dig: { strength: 1.35, radius: 0.44 },
  },
  {
    id: 'stoneHammer',
    label: 'Stone hammer',
    use: 'Fracture limestone and resistant deposits.',
    icon: './assets/tool-icons/stone-hammer.png',
    resource: 'stoneHammer',
    dig: { strength: 2.45, radius: 0.38 },
  },
  {
    id: 'stoneWedge',
    label: 'Stone wedge',
    use: 'Pry shellfish open while preserving the shell.',
    icon: './assets/tool-icons/stone-wedge.png',
    resource: 'stoneWedge',
  },
  {
    id: 'boneHook',
    label: 'Bone hook',
    use: 'Anchor rope and pull objects from narrow cracks.',
    icon: './assets/tool-icons/bone-hook.png',
    resource: 'boneHook',
  },
  {
    id: 'net',
    label: 'Fiber net',
    use: 'Increase fish-hunting reach and efficiency.',
    icon: './assets/tool-icons/fiber-net.png',
    resource: 'net',
  },
  {
    id: 'glowKelp',
    label: 'Living lamp',
    use: 'Carry bioluminescent seaweed into black water.',
    icon: './assets/tool-icons/glow-kelp.png',
    resource: 'glowKelp',
  },
  {
    id: 'stoneAdze',
    label: 'Ancient stone adze',
    use: 'A recovered human stone edge for clay and weak rock excavation.',
    icon: './assets/tool-icons/ancient-stone-adze.svg',
    resource: 'stoneAdze',
    dig: { strength: 1.85, radius: 0.4 },
  },
] as const;

export class ToolbeltSystem {
  private selected: ToolId = 'arms';

  selectedDefinition(inventory: Inventory): ToolDefinition {
    if (!this.isOwned(this.selected, inventory)) this.selected = 'arms';
    return this.definition(this.selected);
  }

  isEquipped(tool: ToolId, inventory: Inventory): boolean {
    return this.selectedDefinition(inventory).id === tool;
  }

  isOwned(tool: ToolId, inventory: Inventory): boolean {
    const definition = this.definition(tool);
    return definition.resource === undefined || inventory[definition.resource] > 0;
  }

  available(inventory: Inventory): ToolDefinition[] {
    return TOOL_DEFINITIONS.filter((definition) => this.isOwned(definition.id, inventory));
  }

  cycle(inventory: Inventory, direction = 1): ToolDefinition {
    const available = this.available(inventory);
    const current = Math.max(0, available.findIndex((definition) => definition.id === this.selected));
    this.selected = available[(current + direction + available.length) % available.length].id;
    return this.selectedDefinition(inventory);
  }

  selectSlot(index: number, inventory: Inventory): ToolDefinition | null {
    const definition = TOOL_DEFINITIONS[index];
    if (!definition || !this.isOwned(definition.id, inventory)) return null;
    this.selected = definition.id;
    return definition;
  }

  select(tool: ToolId, inventory: Inventory): ToolDefinition | null {
    if (!this.isOwned(tool, inventory)) return null;
    this.selected = tool;
    return this.selectedDefinition(inventory);
  }

  snapshot(inventory: Inventory): { selected: ToolId; label: string; available: ToolId[] } {
    const selected = this.selectedDefinition(inventory);
    return {
      selected: selected.id,
      label: selected.label,
      available: this.available(inventory).map((definition) => definition.id),
    };
  }

  private definition(tool: ToolId): ToolDefinition {
    return TOOL_DEFINITIONS.find((definition) => definition.id === tool)!;
  }
}
