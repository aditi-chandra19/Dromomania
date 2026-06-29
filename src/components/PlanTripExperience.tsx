"use client";

import { Activity, startTransition, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarRange,
  MapPinned,
  Sparkles,
  Wallet,
} from "lucide-react";

import {
  ThinkingAgentUI,
  type ThinkingAgentRequest,
} from "@/components/ThinkingAgentUI";

import styles from "./PlanTripExperience.module.css";

type FormState = {
  origin: string;
  destination: string;
  startDate: string;
  endDate: string;
  budget: string;
  currency: string;
  preferences: string[];
  travelerContext: string;
};

const preferenceOptions = [
  "Food-first",
  "Design hotels",
  "Art and museums",
  "Nature escapes",
  "Nightlife",
  "Local markets",
  "Wellness",
  "Family pace",
];

const stepLabels = ["Locations", "Budget and dates", "Preferences"];

const initialFormState: FormState = {
  origin: "",
  destination: "",
  startDate: "",
  endDate: "",
  budget: "",
  currency: "INR",
  preferences: [],
  travelerContext: "",
};

function parseBudget(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

export function PlanTripExperience() {
  const [step, setStep] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(initialFormState);
  const [activeRequest, setActiveRequest] = useState<ThinkingAgentRequest | null>(
    null,
  );

  function updateField<Key extends keyof FormState>(key: Key, value: FormState[Key]) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function togglePreference(preference: string) {
    setForm((current) => {
      const nextPreferences = current.preferences.includes(preference)
        ? current.preferences.filter((item) => item !== preference)
        : [...current.preferences, preference];

      return {
        ...current,
        preferences: nextPreferences,
      };
    });
  }

  function validateCurrentStep() {
    if (step === 0) {
      if (!form.origin.trim() || !form.destination.trim()) {
        return "Enter both the departure city and the destination.";
      }
    }

    if (step === 1) {
      const budget = parseBudget(form.budget);

      if (!Number.isFinite(budget) || budget <= 0) {
        return "Set a travel budget greater than zero.";
      }

      if (!form.startDate || !form.endDate) {
        return "Choose both the departure and return dates.";
      }

      if (new Date(form.startDate) > new Date(form.endDate)) {
        return "Return date must be on or after the departure date.";
      }
    }

    return null;
  }

  function handleNextStep() {
    const validationError = validateCurrentStep();

    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setErrorMessage(null);
    setStep((current) => Math.min(current + 1, stepLabels.length - 1));
  }

  function handlePreviousStep() {
    setErrorMessage(null);
    setStep((current) => Math.max(current - 1, 0));
  }

  function handleSubmit() {
    const validationError = validateCurrentStep();

    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    const budget = parseBudget(form.budget);

    if (!Number.isFinite(budget)) {
      setErrorMessage("Travel budget must be a valid number.");
      return;
    }

    setErrorMessage(null);
    startTransition(() => {
      setActiveRequest({
        requestId: crypto.randomUUID(),
        origin: form.origin.trim(),
        destination: form.destination.trim(),
        startDate: form.startDate,
        endDate: form.endDate,
        budget,
        currency: form.currency,
        preferences: form.preferences,
        travelerContext: form.travelerContext.trim() || undefined,
      });
    });
  }

  const budgetPreview = parseBudget(form.budget);

  return (
    <main className={styles.shell}>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className={styles.kicker}>Trip planner wizard</span>
          <h1 className={styles.title}>
            Build a route briefing the agents can turn into a premium itinerary.
          </h1>
          <p className={styles.subtitle}>
            Move through the three planning layers, then watch the research and
            drafting agents work live before you approve the final trip.
          </p>
        </div>

        <div className={styles.summaryRail}>
          <div className={styles.routeCard}>
            <div className={styles.routeIcon}>
              <MapPinned size={20} />
            </div>
            <div>
              <span className={styles.routeLabel}>Route preview</span>
              <strong className={styles.routeValue}>
                {form.origin || "Departure city"} to {form.destination || "Destination"}
              </strong>
            </div>
          </div>

          <div className={styles.metricCard}>
            <CalendarRange size={18} />
            <div>
              <span>Travel window</span>
              <strong>
                {form.startDate || "Select dates"} to {form.endDate || "Select dates"}
              </strong>
            </div>
          </div>

          <div className={styles.metricCard}>
            <Wallet size={18} />
            <div>
              <span>Budget frame</span>
              <strong>
                {Number.isFinite(budgetPreview)
                  ? `${form.currency} ${budgetPreview.toLocaleString()}`
                  : "Set your working budget"}
              </strong>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.wizard}>
        <div className={styles.stepRail}>
          {stepLabels.map((label, index) => (
            <button
              key={label}
              className={styles.stepButton}
              data-active={step === index}
              data-complete={step > index}
              onClick={() => setStep(index)}
              type="button"
            >
              <span className={styles.stepIndex}>0{index + 1}</span>
              <span>{label}</span>
            </button>
          ))}
        </div>

        <div className={styles.stage}>
          <Activity mode={step === 0 ? "visible" : "hidden"}>
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <span className={styles.panelKicker}>Step one</span>
                <h2>Anchor the route</h2>
                <p>
                  Give the planner a clean start city and the destination it
                  should optimize for.
                </p>
              </div>

              <div className={styles.fieldGrid}>
                <label className={styles.field}>
                  <span>Origin city</span>
                  <input
                    type="text"
                    value={form.origin}
                    onChange={(event) => updateField("origin", event.target.value)}
                  />
                </label>

                <label className={styles.field}>
                  <span>Destination city</span>
                  <input
                    type="text"
                    value={form.destination}
                    onChange={(event) =>
                      updateField("destination", event.target.value)
                    }
                  />
                </label>
              </div>
            </section>
          </Activity>

          <Activity mode={step === 1 ? "visible" : "hidden"}>
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <span className={styles.panelKicker}>Step two</span>
                <h2>Define the travel frame</h2>
                <p>
                  Set the spending band and travel window so every agent can
                  research with the same constraints.
                </p>
              </div>

              <div className={styles.fieldGrid}>
                <label className={styles.field}>
                  <span>Budget</span>
                  <input
                    type="number"
                    min="1"
                    value={form.budget}
                    onChange={(event) => updateField("budget", event.target.value)}
                  />
                </label>

                <label className={styles.field}>
                  <span>Currency</span>
                  <select
                    value={form.currency}
                    onChange={(event) => updateField("currency", event.target.value)}
                  >
                    <option value="INR">INR</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="GBP">GBP</option>
                  </select>
                </label>

                <label className={styles.field}>
                  <span>Departure date</span>
                  <input
                    type="date"
                    value={form.startDate}
                    onChange={(event) =>
                      updateField("startDate", event.target.value)
                    }
                  />
                </label>

                <label className={styles.field}>
                  <span>Return date</span>
                  <input
                    type="date"
                    value={form.endDate}
                    onChange={(event) => updateField("endDate", event.target.value)}
                  />
                </label>
              </div>
            </section>
          </Activity>

          <Activity mode={step === 2 ? "visible" : "hidden"}>
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <span className={styles.panelKicker}>Step three</span>
                <h2>Shape the tone of the trip</h2>
                <p>
                  Select the travel moods that matter most and add any special
                  context the drafting agent should respect.
                </p>
              </div>

              <div className={styles.preferenceGrid}>
                {preferenceOptions.map((preference) => (
                  <button
                    key={preference}
                    className={styles.preferenceChip}
                    data-active={form.preferences.includes(preference)}
                    onClick={() => togglePreference(preference)}
                    type="button"
                  >
                    <Sparkles size={15} />
                    {preference}
                  </button>
                ))}
              </div>

              <label className={styles.field}>
                <span>Traveler context</span>
                <textarea
                  rows={5}
                  value={form.travelerContext}
                  onChange={(event) =>
                    updateField("travelerContext", event.target.value)
                  }
                />
              </label>
            </section>
          </Activity>

          {errorMessage ? <div className={styles.errorMessage}>{errorMessage}</div> : null}

          <div className={styles.actions}>
            <button
              className={styles.secondaryButton}
              disabled={step === 0}
              onClick={handlePreviousStep}
              type="button"
            >
              <ArrowLeft size={16} />
              Back
            </button>

            {step < stepLabels.length - 1 ? (
              <button
                className={styles.primaryButton}
                onClick={handleNextStep}
                type="button"
              >
                Continue
                <ArrowRight size={16} />
              </button>
            ) : (
              <button
                className={styles.primaryButton}
                onClick={handleSubmit}
                type="button"
              >
                Launch planner
                <ArrowRight size={16} />
              </button>
            )}
          </div>
        </div>
      </section>

      <ThinkingAgentUI request={activeRequest} />
    </main>
  );
}
