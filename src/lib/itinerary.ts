import { z } from "zod";

function normalizeStringList(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item).trim())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/\n|•|,|;/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return value;
}

export const itineraryDaySchema = z.object({
  day: z.number().int().positive(),
  date: z.string(),
  title: z.string(),
  summary: z.string(),
  hotelRecommendation: z.string(),
  flightPlan: z.string(),
  restaurants: z.preprocess(normalizeStringList, z.array(z.string())),
  attractions: z.preprocess(normalizeStringList, z.array(z.string())),
  estimatedDailyCost: z.number().nonnegative(),
  notes: z.preprocess(normalizeStringList, z.array(z.string())),
});

export const itinerarySchema = z.array(itineraryDaySchema);

export type IDay = z.infer<typeof itineraryDaySchema>;

export function calculateItineraryCost(days: IDay[]) {
  return days.reduce((total, day) => total + day.estimatedDailyCost, 0);
}
