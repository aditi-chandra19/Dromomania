import { NextResponse } from "next/server";
import { z } from "zod";

import {
  type TripPlannerGraphState,
  tripPlannerGraph,
} from "@/lib/agent/tripPlannerGraph";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const planTripRequestSchema = z.object({
  origin: z.string().trim().min(1),
  destination: z.string().trim().min(1),
  startDate: z.string().trim().min(1),
  endDate: z.string().trim().min(1),
  budget: z.number().positive(),
  currency: z.string().trim().min(1).default("USD"),
  preferences: z.array(z.string().trim()).default([]),
  travelerContext: z.string().trim().optional(),
});

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unexpected trip-planning error.";
}

function makeSseEvent(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = planTripRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid trip planning request.",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const threadId = crypto.randomUUID();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(makeSseEvent(event, data)));
      };

      try {
        send("thread", {
          threadId,
          status: "started",
        });

        const graphStream = await tripPlannerGraph.stream(parsed.data, {
          configurable: {
            thread_id: threadId,
          },
          streamMode: "updates",
        });

        for await (const chunk of graphStream) {
          send("update", {
            threadId,
            chunk,
          });
        }

        const snapshot = await tripPlannerGraph.getState({
          configurable: {
            thread_id: threadId,
          },
        });

        const values = snapshot.values as TripPlannerGraphState;
        const interruptTask = snapshot.tasks.find(
          (task) => task.name === "humanReview" && task.interrupts.length > 0,
        );

        if (interruptTask) {
          send("humanReview", {
            threadId,
            draftItinerary: values.draftItinerary,
            draftItineraryJson: values.draftItineraryJson,
            researchNotes: values.researchNotes,
            researchFailures: values.researchFailures,
          });
        } else {
          send("complete", {
            threadId,
            state: values,
          });
        }
      } catch (error) {
        send("error", {
          threadId,
          message: getErrorMessage(error),
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  });
}
