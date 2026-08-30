import type { StudioModeDefinition } from "./ModeTypes";

export class ModeRegistry {
  private readonly definitions = new Map<string, StudioModeDefinition>();

  register(definition: StudioModeDefinition): this {
    if (this.definitions.has(definition.id)) throw new Error(`Studio mode already registered: ${definition.id}`);
    this.definitions.set(definition.id, definition);
    return this;
  }

  get(id: string): StudioModeDefinition {
    const definition = this.definitions.get(id);
    if (!definition) throw new Error(`Unknown studio mode: ${id}`);
    return definition;
  }

  list(): readonly StudioModeDefinition[] { return [...this.definitions.values()]; }
}
