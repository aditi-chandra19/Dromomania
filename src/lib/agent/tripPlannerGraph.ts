import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import {
  Annotation,
  Command,
  END,
  MemorySaver,
  START,
  StateGraph,
  interrupt,
} from "@langchain/langgraph";
import { z } from "zod";

import { searchTravelWeb } from "@/lib/agent/tools";
import {
  itineraryDaySchema,
  itinerarySchema,
  type IDay,
} from "@/lib/itinerary";

type WorkerName =
  | "hotelAgent"
  | "flightAgent"
  | "restaurantAgent"
  | "attractionAgent";

type HumanReviewResumePayload = {
  approved?: boolean;
  feedback?: string;
};

const WORKER_NAMES: WorkerName[] = [
  "hotelAgent",
  "flightAgent",
  "restaurantAgent",
  "attractionAgent",
];
const humanReviewResumeSchema = z.object({
  approved: z.boolean().optional(),
  feedback: z.string().trim().optional(),
});

const TripPlannerInput = Annotation.Root({
  destination: Annotation<string>,
  origin: Annotation<string | undefined>,
  budget: Annotation<number | undefined>,
  currency: Annotation<string | undefined>,
  startDate: Annotation<string>,
  endDate: Annotation<string>,
  preferences: Annotation<string[]>,
  travelerContext: Annotation<string | undefined>,
});

const TripPlannerState = Annotation.Root({
  destination: Annotation<string>,
  origin: Annotation<string | undefined>,
  budget: Annotation<number | undefined>,
  currency: Annotation<string | undefined>,
  startDate: Annotation<string>,
  endDate: Annotation<string>,
  preferences: Annotation<string[]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  travelerContext: Annotation<string | undefined>,
  completedWorkers: Annotation<WorkerName[]>({
    reducer: (left, right) =>
      Array.from(new Set([...left, ...right])) as WorkerName[],
    default: () => [],
  }),
  researchNotes: Annotation<Record<string, string>>({
    reducer: (left, right) => ({ ...left, ...right }),
    default: () => ({}),
  }),
  researchSources: Annotation<Record<string, string[]>>({
    reducer: (left, right) => ({ ...left, ...right }),
    default: () => ({}),
  }),
  researchFailures: Annotation<string[]>({
    reducer: (left, right) => left.concat(right),
    default: () => [],
  }),
  supervisorDecision: Annotation<string | undefined>,
  draftItinerary: Annotation<IDay[]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  draftItineraryJson: Annotation<string | undefined>,
  humanFeedback: Annotation<string | undefined>,
});

export type TripPlannerRequest = typeof TripPlannerInput.State;
export type TripPlannerGraphState = typeof TripPlannerState.State;
export type TripPlannerItineraryDay = z.infer<typeof itineraryDaySchema>;
export type TripPlannerReviewPayload = z.infer<typeof humanReviewResumeSchema>;

export { humanReviewResumeSchema };

let geminiModel: ChatGoogleGenerativeAI | null = null;

function getGoogleApiKey() {
  const apiKey = process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    throw new Error("Missing GOOGLE_API_KEY for Gemini itinerary drafting.");
  }

  return apiKey;
}

function getGeminiModel() {
  if (!geminiModel) {
    geminiModel = new ChatGoogleGenerativeAI({
      apiKey: getGoogleApiKey(),
      model: "gemini-2.5-flash",
      temperature: 0.2,
      maxRetries: 2,
    });
  }

  return geminiModel;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function formatMoney(budget: number | undefined, currency: string | undefined) {
  if (budget === undefined) {
    return "Not specified";
  }

  return `${currency ?? "USD"} ${budget}`;
}

function buildTripSummary(state: TripPlannerGraphState) {
  const preferences =
    state.preferences.length > 0 ? state.preferences.join(", ") : "Flexible";

  return [
    `Destination: ${state.destination}`,
    `Origin: ${state.origin ?? "Not specified"}`,
    `Travel window: ${state.startDate} to ${state.endDate}`,
    `Budget: ${formatMoney(state.budget, state.currency)}`,
    `Preferences: ${preferences}`,
    `Traveler context: ${state.travelerContext ?? "Not provided"}`,
  ].join("\n");
}

function buildWorkerQuery(workerName: WorkerName, state: TripPlannerGraphState) {
  const tripSummary = buildTripSummary(state);

  switch (workerName) {
    case "hotelAgent":
      return [
        `Best hotels and neighborhoods for travelers visiting ${state.destination}.`,
        `Focus on properties that fit a budget around ${formatMoney(state.budget, state.currency)}.`,
        "Include location advice, booking considerations, and standout options.",
        tripSummary,
      ].join("\n");
    case "flightAgent":
      return [
        `Flight planning guidance for reaching ${state.destination}${state.origin ? ` from ${state.origin}` : ""}.`,
        "Include likely airport choices, route considerations, seasonal timing, and fare-saving advice.",
        "If exact live prices are unavailable, prioritize practical booking guidance.",
        tripSummary,
      ].join("\n");
    case "restaurantAgent":
      return [
        `Best restaurants, local food experiences, and reservation tips in ${state.destination}.`,
        "Balance notable spots with dependable casual options.",
        "Prioritize places that match the traveler's budget and preferences.",
        tripSummary,
      ].join("\n");
    case "attractionAgent":
      return [
        `Top attractions, neighborhoods, and experience ideas in ${state.destination}.`,
        "Highlight can't-miss stops, pacing tips, and good activity groupings for a multi-day trip.",
        tripSummary,
      ].join("\n");
  }
}

async function fallbackResearchWithGemini(
  workerName: WorkerName,
  state: TripPlannerGraphState,
  tavilyError: unknown,
) {
  const model = getGeminiModel();
  const response = await model.invoke([
    [
      "system",
      [
        `You are ${workerName} inside a travel planning system.`,
        "Tavily search failed, so you must use general travel knowledge only.",
        "Do not pretend you have live prices, inventory, or current opening hours.",
        "Return a compact research memo with practical guidance and explicit verification notes.",
      ].join(" "),
    ],
    [
      "human",
      [
        buildTripSummary(state),
        `Tavily failure: ${getErrorMessage(tavilyError)}`,
      ].join("\n\n"),
    ],
  ]);

  return [
    `Fallback memo from ${workerName}:`,
    response.text.trim(),
    "Verification note: Live web search failed, so verify these details before booking.",
  ].join("\n");
}

async function runResearchWorker(
  state: TripPlannerGraphState,
  workerName: WorkerName,
) {
  try {
    const research = await searchTravelWeb({
      agentName: workerName,
      query: buildWorkerQuery(workerName, state),
    });

    return {
      completedWorkers: [workerName],
      researchNotes: {
        [workerName]: research.summary,
      },
      researchSources: {
        [workerName]: research.sources,
      },
    };
  } catch (error) {
    const fallbackMemo = await fallbackResearchWithGemini(
      workerName,
      state,
      error,
    );

    return {
      completedWorkers: [workerName],
      researchNotes: {
        [workerName]: fallbackMemo,
      },
      researchSources: {
        [workerName]: [],
      },
      researchFailures: [
        `${workerName}: Tavily research failed and Gemini fallback was used. Reason: ${getErrorMessage(error)}`,
      ],
    };
  }
}

function supervisorAgent(state: TripPlannerGraphState) {
  const missingWorkers = WORKER_NAMES.filter(
    (workerName) => !state.completedWorkers.includes(workerName),
  );

  if (missingWorkers.length > 0) {
    return new Command({
      update: {
        supervisorDecision: `Dispatching workers: ${missingWorkers.join(", ")}`,
      },
      goto: missingWorkers,
    });
  }

  return new Command({
    update: {
      supervisorDecision: "All worker research complete. Routing to draftAgent.",
    },
    goto: "draftAgent",
  });
}

async function hotelAgent(state: TripPlannerGraphState) {
  return runResearchWorker(state, "hotelAgent");
}

async function flightAgent(state: TripPlannerGraphState) {
  return runResearchWorker(state, "flightAgent");
}

async function restaurantAgent(state: TripPlannerGraphState) {
  return runResearchWorker(state, "restaurantAgent");
}

async function attractionAgent(state: TripPlannerGraphState) {
  return runResearchWorker(state, "attractionAgent");
}

function calculateTripLength(startDate: string, endDate: string) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const millisecondsPerDay = 1000 * 60 * 60 * 24;
  const rawDays =
    Math.floor((end.getTime() - start.getTime()) / millisecondsPerDay) + 1;

  return Number.isFinite(rawDays) && rawDays > 0 ? rawDays : 1;
}

function stripCodeFences(text: string) {
  const trimmed = text.trim();

  if (!trimmed.startsWith("```")) {
    return trimmed;
  }

  return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

async function draftAgent(state: TripPlannerGraphState) {
  const model = getGeminiModel();
  const tripLength = calculateTripLength(state.startDate, state.endDate);
  const revisionRequest = state.humanFeedback
    ? [
        "Human revision feedback to incorporate:",
        state.humanFeedback,
        "Revise the itinerary accordingly while keeping the response as a strict JSON array.",
      ].join("\n")
    : "";
  const researchBundle = WORKER_NAMES.map((workerName) => {
    const note = state.researchNotes[workerName] ?? "No research available.";
    const sources = state.researchSources[workerName] ?? [];
    return [
      `## ${workerName}`,
      note,
      sources.length > 0 ? `Sources: ${sources.join(", ")}` : "Sources: none",
    ].join("\n");
  }).join("\n\n");

  const response = await model.invoke([
      [
        "system",
        [
          "You are the draftAgent for Dromomania.",
          "Create a strict JSON array and nothing else.",
          "Do not wrap the JSON in markdown fences.",
          `Return exactly ${tripLength} objects, one per travel day.`,
          "Each object must contain the keys: day, date, title, summary, hotelRecommendation, flightPlan, restaurants, attractions, estimatedDailyCost, notes.",
          "Use only valid JSON types. estimatedDailyCost must be a number.",
          "restaurants, attractions, and notes must always be arrays of strings, even if there is only one item.",
        ].join(" "),
      ],
    [
      "human",
      [
        buildTripSummary(state),
        `Trip length in days: ${tripLength}`,
        revisionRequest,
        "Worker research:",
        researchBundle,
      ]
        .filter(Boolean)
        .join("\n\n"),
    ],
  ]);

  const parsedText = stripCodeFences(response.text);
  const parsedItinerary = itinerarySchema.parse(JSON.parse(parsedText));

  return {
    draftItinerary: parsedItinerary,
    draftItineraryJson: JSON.stringify(parsedItinerary, null, 2),
  };
}

function humanReview(state: TripPlannerGraphState) {
  const resumePayload = interrupt<
    {
      node: "humanReview";
      instructions: string;
      draftItinerary: IDay[];
      draftItineraryJson: string | undefined;
      researchNotes: Record<string, string>;
    },
    HumanReviewResumePayload | string
  >({
    node: "humanReview",
    instructions:
      "Review the draft itinerary. Resume the graph with feedback text or an approval note.",
    draftItinerary: state.draftItinerary,
    draftItineraryJson: state.draftItineraryJson,
    researchNotes: state.researchNotes,
  });

  const parsedPayload =
    typeof resumePayload === "string"
      ? {
          approved: false,
          feedback: resumePayload,
        }
      : humanReviewResumeSchema.parse(resumePayload);

  if (parsedPayload.approved) {
    return new Command({
      update: {
        humanFeedback: parsedPayload.feedback,
      },
      goto: END,
    });
  }

  return new Command({
    update: {
      humanFeedback:
        parsedPayload.feedback ?? "Please revise the itinerary based on my review.",
    },
    goto: "draftAgent",
  });
}

const tripPlannerBuilder = new StateGraph({
  stateSchema: TripPlannerState,
  input: TripPlannerInput,
  output: TripPlannerState,
})
  .addNode("supervisorAgent", supervisorAgent, {
    ends: [...WORKER_NAMES, "draftAgent"],
  })
  .addNode("hotelAgent", hotelAgent)
  .addNode("flightAgent", flightAgent)
  .addNode("restaurantAgent", restaurantAgent)
  .addNode("attractionAgent", attractionAgent)
  .addNode("draftAgent", draftAgent)
  .addNode("humanReview", humanReview, {
    ends: ["draftAgent", END],
  })
  .addEdge(START, "supervisorAgent")
  .addEdge(WORKER_NAMES, "supervisorAgent")
  .addEdge("draftAgent", "humanReview")
  .addEdge("humanReview", END);

export const tripPlannerGraph = tripPlannerBuilder.compile({
  checkpointer: new MemorySaver(),
  name: "dromomaniaTripPlannerGraph",
  description:
    "Parallel trip-planning graph with deterministic supervision, Tavily-first research, Gemini drafting, and human review pause.",
});
