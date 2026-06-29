"use client";

import Link from "next/link";
import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { motion } from "framer-motion";
import {
  Bot,
  CheckCircle2,
  CircleAlert,
  Compass,
  LoaderCircle,
  MessageSquareReply,
  SendHorizontal,
  Sparkles,
} from "lucide-react";

import type { IDay } from "@/lib/itinerary";

import { Timeline } from "@/components/Timeline";
import styles from "./ThinkingAgentUI.module.css";

export type ThinkingAgentRequest = {
  requestId: string;
  origin: string;
  destination: string;
  startDate: string;
  endDate: string;
  budget: number;
  currency: string;
  preferences: string[];
  travelerContext?: string;
};

type ThinkingAgentUIProps = {
  request: ThinkingAgentRequest | null;
};

type StreamLog = {
  id: string;
  title: string;
  detail: string;
  tone: "neutral" | "success" | "warning" | "error";
};

type PlannerPhase =
  | "idle"
  | "streaming"
  | "review"
  | "saving"
  | "complete"
  | "error";

function formatChunkTitle(nodeName: string) {
  return nodeName
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (value) => value.toUpperCase());
}

function buildLogsFromChunk(chunk: unknown): StreamLog[] {
  if (!chunk || typeof chunk !== "object" || Array.isArray(chunk)) {
    return [
      {
        id: crypto.randomUUID(),
        title: "Agent update",
        detail: String(chunk),
        tone: "neutral",
      },
    ];
  }

  return Object.entries(chunk as Record<string, unknown>).map(([node, payload]) => {
    let detail = "Progress update received.";
    let tone: StreamLog["tone"] = "neutral";

    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      const payloadRecord = payload as Record<string, unknown>;

      if (typeof payloadRecord.supervisorDecision === "string") {
        detail = payloadRecord.supervisorDecision;
      } else if (payloadRecord.researchNotes) {
        detail = `${formatChunkTitle(node)} finished a research pass and returned fresh guidance.`;
        tone = "success";
      } else if (payloadRecord.draftItinerary) {
        const draftLength = Array.isArray(payloadRecord.draftItinerary)
          ? payloadRecord.draftItinerary.length
          : 0;
        detail = `Draft agent assembled a ${draftLength}-day itinerary draft.`;
        tone = "success";
      } else if (typeof payloadRecord.humanFeedback === "string") {
        detail = "Human feedback was applied and the planner is revising the route.";
      } else {
        detail = Object.entries(payloadRecord)
          .map(([key, value]) => `${key}: ${String(value)}`)
          .join(" • ");
      }
    }

    return {
      id: crypto.randomUUID(),
      title: formatChunkTitle(node),
      detail,
      tone,
    };
  });
}

function calculateDraftCost(draft: IDay[]) {
  return draft.reduce((total, day) => total + day.estimatedDailyCost, 0);
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "A planner error occurred.";
}

function formatResearchSnippet(researchNotes: Record<string, string>) {
  return Object.entries(researchNotes).slice(0, 4);
}

export function ThinkingAgentUI({ request }: ThinkingAgentUIProps) {
  const [phase, setPhase] = useState<PlannerPhase>("idle");
  const [logs, setLogs] = useState<StreamLog[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [draft, setDraft] = useState<IDay[]>([]);
  const [researchNotes, setResearchNotes] = useState<Record<string, string>>({});
  const [researchFailures, setResearchFailures] = useState<string[]>([]);
  const [feedback, setFeedback] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [savedTripId, setSavedTripId] = useState<string | null>(null);
  const terminalRef = useRef<HTMLDivElement>(null);

  const appendLog = useCallback((entry: Omit<StreamLog, "id">) => {
    startTransition(() => {
      setLogs((previous) => [
        ...previous,
        {
          id: crypto.randomUUID(),
          ...entry,
        },
      ]);
    });
  }, []);

  const resetRunState = useCallback(() => {
    startTransition(() => {
      setPhase("streaming");
      setLogs([]);
      setThreadId(null);
      setDraft([]);
      setResearchNotes({});
      setResearchFailures([]);
      setFeedback("");
      setErrorMessage(null);
      setSavedTripId(null);
    });
  }, []);

  useEffect(() => {
    if (!terminalRef.current) {
      return;
    }

    terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
  }, [logs]);

  useEffect(() => {
    if (!request) {
      return;
    }

    const currentRequest = request;
    const abortController = new AbortController();

    async function runPlanner() {
      resetRunState();
      appendLog({
        title: "Mission control",
        detail: `Opening a new planning run for ${currentRequest.origin} to ${currentRequest.destination}.`,
        tone: "neutral",
      });

      try {
        const response = await fetch("/api/plan-trip", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            origin: currentRequest.origin,
            destination: currentRequest.destination,
            startDate: currentRequest.startDate,
            endDate: currentRequest.endDate,
            budget: currentRequest.budget,
            currency: currentRequest.currency,
            preferences: currentRequest.preferences,
            travelerContext: currentRequest.travelerContext,
          }),
          signal: abortController.signal,
        });

        if (!response.ok || !response.body) {
          const payload = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(payload?.error ?? "Planner stream could not start.");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });

          while (buffer.includes("\n\n")) {
            const boundaryIndex = buffer.indexOf("\n\n");
            const rawEvent = buffer.slice(0, boundaryIndex);
            buffer = buffer.slice(boundaryIndex + 2);

            const lines = rawEvent.split("\n");
            const eventName =
              lines.find((line) => line.startsWith("event:"))?.slice(6).trim() ??
              "message";
            const data = lines
              .filter((line) => line.startsWith("data:"))
              .map((line) => line.slice(5).trim())
              .join("\n");

            if (!data) {
              continue;
            }

            const parsed = JSON.parse(data) as Record<string, unknown>;

            const parsedThreadId = parsed.threadId;

            if (eventName === "thread" && typeof parsedThreadId === "string") {
              startTransition(() => {
                setThreadId(parsedThreadId);
              });
              appendLog({
                title: "Thread created",
                detail: `Planner thread ${parsedThreadId.slice(0, 8)} is checkpointed and live.`,
                tone: "success",
              });
              continue;
            }

            if (eventName === "update") {
              for (const log of buildLogsFromChunk(parsed.chunk)) {
                appendLog({
                  title: log.title,
                  detail: log.detail,
                  tone: log.tone,
                });
              }
              continue;
            }

            if (eventName === "humanReview") {
              startTransition(() => {
                setPhase("review");
                setDraft((parsed.draftItinerary as IDay[]) ?? []);
                setResearchNotes(
                  (parsed.researchNotes as Record<string, string>) ?? {},
                );
                setResearchFailures(
                  (parsed.researchFailures as string[]) ?? [],
                );
              });
              appendLog({
                title: "Draft summary ready",
                detail:
                  "The drafting agent has paused for review. Approve the itinerary or request revisions.",
                tone: "success",
              });
              continue;
            }

            if (eventName === "complete") {
              startTransition(() => {
                setPhase("complete");
              });
              appendLog({
                title: "Planner complete",
                detail: "The planning flow completed without waiting for further review.",
                tone: "success",
              });
              continue;
            }

            if (eventName === "error") {
              const message =
                typeof parsed.message === "string"
                  ? parsed.message
                  : "Planner stream failed.";
              startTransition(() => {
                setPhase("error");
                setErrorMessage(message);
              });
              appendLog({
                title: "Planner error",
                detail: message,
                tone: "error",
              });
            }
          }
        }
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }

        const message = getErrorMessage(error);
        startTransition(() => {
          setPhase("error");
          setErrorMessage(message);
        });
        appendLog({
          title: "Planner error",
          detail: message,
          tone: "error",
        });
      }
    }

    void runPlanner();

    return () => {
      abortController.abort();
    };
  }, [appendLog, request, resetRunState]);

  async function handleReviewAction(approved: boolean) {
    if (!threadId || draft.length === 0) {
      return;
    }

    if (!approved && !feedback.trim()) {
      setErrorMessage("Add clear revision guidance before requesting another draft.");
      return;
    }

    startTransition(() => {
      setPhase("saving");
      setErrorMessage(null);
    });

    appendLog({
      title: approved ? "Finalizing trip" : "Revision requested",
      detail: approved
        ? "Saving the finalized itinerary to your account."
        : "Sending your feedback back into the drafting loop.",
      tone: "neutral",
    });

    try {
      const response = await fetch("/api/plan-trip/resume", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          threadId,
          draft,
          approved,
          userFeedback: feedback.trim() || undefined,
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        tripId?: string;
        draftItinerary?: IDay[];
        researchNotes?: Record<string, string>;
        researchFailures?: string[];
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Planner review request failed.");
      }

      if (approved) {
        startTransition(() => {
          setPhase("complete");
          setSavedTripId(payload.tripId ?? null);
        });
        appendLog({
          title: "Trip finalized",
          detail: "The itinerary is saved and ready inside your dashboard.",
          tone: "success",
        });
        return;
      }

      startTransition(() => {
        setPhase("review");
        setDraft(payload.draftItinerary ?? []);
        setResearchNotes(payload.researchNotes ?? {});
        setResearchFailures(payload.researchFailures ?? []);
      });
      appendLog({
        title: "Fresh draft ready",
        detail: "The itinerary has been rewritten with your feedback and is waiting for another review pass.",
        tone: "success",
      });
    } catch (error) {
      const message = getErrorMessage(error);
      startTransition(() => {
        setPhase("error");
        setErrorMessage(message);
      });
      appendLog({
        title: "Review loop error",
        detail: message,
        tone: "error",
      });
    }
  }

  const totalEstimatedCost = calculateDraftCost(draft);
  const researchPreview = formatResearchSnippet(researchNotes);

  return (
    <section className={styles.shell}>
      <div className={styles.header}>
        <div>
          <span className={styles.kicker}>Live agent stream</span>
          <h2 className={styles.title}>Thinking Agent Console</h2>
        </div>
        <div className={styles.statusBadge} data-phase={phase}>
          {phase === "streaming" || phase === "saving" ? (
            <LoaderCircle size={16} className={styles.spinner} />
          ) : phase === "complete" ? (
            <CheckCircle2 size={16} />
          ) : phase === "error" ? (
            <CircleAlert size={16} />
          ) : (
            <Sparkles size={16} />
          )}
          <span>{phase}</span>
        </div>
      </div>

      <div className={styles.layout}>
        <article className={styles.terminalCard}>
          <div className={styles.terminalHeader}>
            <div className={styles.windowControls}>
              <span />
              <span />
              <span />
            </div>
            <div className={styles.terminalLabel}>
              <Bot size={14} />
              agent.log
            </div>
          </div>

          <div ref={terminalRef} className={styles.logStream}>
            {logs.length === 0 ? (
              <div className={styles.emptyState}>
                <Compass size={18} />
                Submit the planner form to watch each worker research the trip in real time.
              </div>
            ) : (
              logs.map((log) => (
                <motion.div
                  key={log.id}
                  className={styles.logEntry}
                  data-tone={log.tone}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.22 }}
                >
                  <div className={styles.logTitleRow}>
                    <span className={styles.logDot} />
                    <strong>{log.title}</strong>
                  </div>
                  <p>{log.detail}</p>
                </motion.div>
              ))
            )}
          </div>
        </article>

        <article className={styles.summaryCard}>
          <div className={styles.summaryHeader}>
            <div>
              <span className={styles.kicker}>Draft summary</span>
              <h3 className={styles.summaryTitle}>Itinerary review desk</h3>
            </div>
            {threadId ? <span className={styles.threadPill}>{threadId.slice(0, 8)}</span> : null}
          </div>

          {draft.length > 0 ? (
            <>
              <div className={styles.summaryStats}>
                <div className={styles.statTile}>
                  <span className={styles.statValue}>{draft.length}</span>
                  <span className={styles.statLabel}>days mapped</span>
                </div>
                <div className={styles.statTile}>
                  <span className={styles.statValue}>
                    {totalEstimatedCost.toLocaleString()}
                  </span>
                  <span className={styles.statLabel}>estimated total</span>
                </div>
              </div>

              {researchPreview.length > 0 ? (
                <div className={styles.researchGrid}>
                  {researchPreview.map(([agent, note]) => (
                    <div key={agent} className={styles.researchTile}>
                      <span>{formatChunkTitle(agent)}</span>
                      <p>{note.slice(0, 180)}</p>
                    </div>
                  ))}
                </div>
              ) : null}

              <Timeline days={draft} />

              {researchFailures.length > 0 ? (
                <div className={styles.warningCard}>
                  <CircleAlert size={16} />
                  <div>
                    {researchFailures.map((failure) => (
                      <p key={failure}>{failure}</p>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className={styles.reviewCard}>
                <div className={styles.reviewHeader}>
                  <MessageSquareReply size={18} />
                  <div>
                    <h4>Human-in-the-loop review</h4>
                    <p>
                      Approve the draft to save it, or send focused feedback to
                      trigger a rewrite.
                    </p>
                  </div>
                </div>

                <label className={styles.feedbackLabel} htmlFor="review-feedback">
                  Revision guidance
                </label>
                <textarea
                  id="review-feedback"
                  className={styles.feedbackInput}
                  rows={5}
                  value={feedback}
                  onChange={(event) => setFeedback(event.target.value)}
                />

                <div className={styles.reviewActions}>
                  <button
                    className={styles.secondaryButton}
                    disabled={phase === "saving"}
                    onClick={() => void handleReviewAction(false)}
                    type="button"
                  >
                    <SendHorizontal size={16} />
                    Request rewrite
                  </button>
                  <button
                    className={styles.primaryButton}
                    disabled={phase === "saving"}
                    onClick={() => void handleReviewAction(true)}
                    type="button"
                  >
                    <CheckCircle2 size={16} />
                    Approve and save
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className={styles.summaryEmpty}>
              <Sparkles size={18} />
              The draft itinerary will appear here as soon as the drafting agent
              reaches the review checkpoint.
            </div>
          )}

          {savedTripId ? (
            <div className={styles.successCard}>
              <CheckCircle2 size={18} />
              <div>
                <strong>Trip saved successfully</strong>
                <p>
                  Your finalized itinerary is in the dashboard and ready for the
                  next planning session.
                </p>
              </div>
              <Link className={styles.inlineLink} href="/dashboard">
                Open dashboard
              </Link>
            </div>
          ) : null}

          {errorMessage ? (
            <div className={styles.errorCard}>
              <CircleAlert size={18} />
              <p>{errorMessage}</p>
            </div>
          ) : null}
        </article>
      </div>
    </section>
  );
}
