import { randomInt } from 'node:crypto';

export type RandomInt = (minimum: number, maximum: number) => number;

export function rollDice(random: RandomInt = randomInt): number {
  return random(1, 7);
}

export const DICE_EMOJI = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'] as const;
