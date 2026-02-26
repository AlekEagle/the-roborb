import { CommandInteraction } from 'oceanic.js';
import EventEmitter from 'events';

interface OrbQueueEvents {
  orbComplete: () => void;
}

export interface OrbQueueOptions {
  size: number;
}

export interface OrbQueueEntry {
  interaction: CommandInteraction;
  options: OrbQueueOptions;
}

export default class OrbQueue extends EventEmitter {
  declare on: <K extends keyof OrbQueueEvents>(
    event: K,
    listener: OrbQueueEvents[K],
  ) => this;
  declare once: <K extends keyof OrbQueueEvents>(
    event: K,
    listener: OrbQueueEvents[K],
  ) => this;
  declare off: <K extends keyof OrbQueueEvents>(
    event: K,
    listener: OrbQueueEvents[K],
  ) => this;
  declare emit: <K extends keyof OrbQueueEvents>(
    event: K,
    ...args: Parameters<OrbQueueEvents[K]>
  ) => boolean;
  declare removeListener: <K extends keyof OrbQueueEvents>(
    event: K,
    listener: OrbQueueEvents[K],
  ) => this;
  declare removeAllListeners: <K extends keyof OrbQueueEvents>(
    event?: K,
  ) => this;
  declare listeners: <K extends keyof OrbQueueEvents>(
    event: K,
  ) => OrbQueueEvents[K][];
  declare listenerCount: <K extends keyof OrbQueueEvents>(event: K) => number;
  declare prependListener: <K extends keyof OrbQueueEvents>(
    event: K,
    listener: OrbQueueEvents[K],
  ) => this;
  declare prependOnceListener: <K extends keyof OrbQueueEvents>(
    event: K,
    listener: OrbQueueEvents[K],
  ) => this;
  declare eventNames: () => (keyof OrbQueueEvents)[];
  declare rawListeners: <K extends keyof OrbQueueEvents>(
    event: K,
  ) => Function[];

  public orbs: OrbQueueEntry[] = [];

  public constructor() {
    super();
  }

  public addOrb(
    interaction: CommandInteraction,
    options: OrbQueueOptions,
  ): number {
    return this.orbs.push({ interaction, options }) - 1;
  }

  public removeOrb(interactionID: string): void {
    const index = this.getOrbPosition(interactionID);
    if (index === -1) return;
    this.orbs.splice(index, 1);
  }

  public getOrbPosition(orb: string): number {
    return this.orbs.findIndex((entry) => entry.interaction.id === orb);
  }

  public get length(): number {
    return this.orbs.length;
  }

  public completeOrb(orb: string): void {
    this.removeOrb(orb);
    this.emit('orbComplete');
  }
}
