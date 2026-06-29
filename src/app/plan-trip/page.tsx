import type { Metadata } from "next";

import { PlanTripExperience } from "@/components/PlanTripExperience";

export const metadata: Metadata = {
  title: "Plan Trip | Dromomania",
  description: "Build and review a live AI-generated itinerary with Dromomania.",
};

export default function PlanTripPage() {
  return <PlanTripExperience />;
}
