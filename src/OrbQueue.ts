import { CommandInteraction, Message } from 'oceanic.js';
import EventEmitter from 'events';

interface OrbQueueEntry {
  interaction: CommandInteraction;
}

export default class OrbQueue extends EventEmitter {
  public orbs: OrbQueueEntry[] = [];

  public constructor() {
    super();
  }

  public addOrb(interaction: CommandInteraction): number {
    return this.orbs.push({ interaction }) - 1;
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
