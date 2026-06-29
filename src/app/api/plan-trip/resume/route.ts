import { Command } from "@langchain/langgraph";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getPrisma } from "@/lib/prisma";
import {
  humanReviewResumeSchema,
  itinerarySchema,
  type TripPlannerGraphState,
  tripPlannerGraph,
} from "@/lib/agent/tripPlannerGraph";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const resumeTripRequestSchema = z.object({
  threadId: z.string().trim().min(1),
  draft: itinerarySchema.optional(),
  userFeedback: z.string().trim().optional(),
  approved: z.boolean(),
});

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unexpected trip-planning resume error.";
}

function calculateTotalEstimatedCost(
  itinerary: z.infer<typeof itinerarySchema>,
) {
  return itinerary.reduce(
    (total, day) => total + day.estimatedDailyCost,
    0,
  );
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = resumeTripRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid resume request.",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const { approved, draft, threadId, userFeedback } = parsed.data;
  const config = {
    configurable: {
      thread_id: threadId,
    },
  };

  try {
    const snapshot = await tripPlannerGraph.getState(config);
    const state = snapshot.values as TripPlannerGraphState;

    if (!state.draftItinerary.length && !draft?.length) {
      return NextResponse.json(
        {
          error: "No draft itinerary is available for this thread.",
        },
        { status: 409 },
      );
    }

    if (approved) {
      const session = await getServerSession(authOptions);

      if (!session?.user?.email) {
        return NextResponse.json(
          {
            error: "You must be signed in to save a finalized trip.",
          },
          { status: 401 },
        );
      }

      const prisma = getPrisma();
      const user = await prisma.user.findUnique({
        where: {
          email: session.user.email,
        },
      });

      if (!user) {
        return NextResponse.json(
          {
            error: "Signed-in user could not be found.",
          },
          { status: 404 },
        );
      }

      const finalItinerary = draft ?? state.draftItinerary;
      const totalEstimatedCost = calculateTotalEstimatedCost(finalItinerary);

      await tripPlannerGraph.invoke(
        new Command({
          resume: humanReviewResumeSchema.parse({
            approved: true,
            feedback: userFeedback,
          }),
        }),
        config,
      );

      const trip = await prisma.trip.create({
        data: {
          userId: user.id,
          destination: state.destination,
          budget: state.budget ?? totalEstimatedCost,
          currency: state.currency ?? "USD",
          startDate: new Date(state.startDate),
          endDate: new Date(state.endDate),
          preferences: JSON.stringify(state.preferences),
          itinerary: JSON.stringify(finalItinerary),
          status: "FINALIZED",
          totalEstimatedCost,
        },
      });

      return NextResponse.json({
        ok: true,
        threadId,
        tripId: trip.id,
        status: trip.status,
        draftItinerary: finalItinerary,
      });
    }

    if (!userFeedback) {
      return NextResponse.json(
        {
          error: "Feedback is required when requesting a rewrite.",
        },
        { status: 400 },
      );
    }

    await tripPlannerGraph.updateState(
      config,
      {
        humanFeedback: userFeedback,
      },
      "humanReview",
    );

    await tripPlannerGraph.invoke(
      new Command({
        resume: humanReviewResumeSchema.parse({
          approved: false,
          feedback: userFeedback,
        }),
      }),
      config,
    );

    const revisedSnapshot = await tripPlannerGraph.getState(config);
    const revisedState = revisedSnapshot.values as TripPlannerGraphState;

    return NextResponse.json({
      ok: true,
      threadId,
      waitingForHumanReview: revisedSnapshot.tasks.some(
        (task) => task.name === "humanReview" && task.interrupts.length > 0,
      ),
      draftItinerary: revisedState.draftItinerary,
      draftItineraryJson: revisedState.draftItineraryJson,
      researchNotes: revisedState.researchNotes,
      researchFailures: revisedState.researchFailures,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: getErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
