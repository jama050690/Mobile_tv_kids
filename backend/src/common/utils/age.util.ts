import { AgeGroup } from '@prisma/client';

const AGE_ORDER: Record<AgeGroup, number> = {
  AGE_0_3: 0,
  AGE_4_7: 1,
  AGE_8_12: 2,
  ALL: -1,
};

/** Dastur yosh chegarasi kanal yosh toifasiga mosmi (masalan 0–3 kanalda 8–12 multfilm — mos emas) */
export function isAgeSuitable(channelGroup: AgeGroup, programRating: AgeGroup): boolean {
  if (channelGroup === AgeGroup.ALL || programRating === AgeGroup.ALL) return true;
  return AGE_ORDER[programRating] <= AGE_ORDER[channelGroup];
}
