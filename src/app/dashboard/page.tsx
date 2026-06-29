import Link from "next/link";
import { getServerSession } from "next-auth";
import {
  ArrowRight,
  CalendarRange,
  Compass,
  Landmark,
  Wallet,
} from "lucide-react";

import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { Timeline } from "@/components/Timeline";
import { calculateItineraryCost, itinerarySchema } from "@/lib/itinerary";
import { getPrisma } from "@/lib/prisma";

import styles from "./page.module.css";

export const dynamic = "force-dynamic";

function formatDateRange(startDate: Date, endDate: Date) {
  const formatter = new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return `${formatter.format(startDate)} - ${formatter.format(endDate)}`;
}

function parseStringArray(value: string | null) {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return (
      <main className={styles.shell}>
        <section className={styles.authCard}>
          <div className={styles.brandRow}>
            <span className={styles.brandMark}>
              <Compass size={18} strokeWidth={2.2} />
            </span>
            Dromomania Dashboard
          </div>
          <h1 className={styles.authTitle}>Sign in to unlock your finalized trips.</h1>
          <p className={styles.authCopy}>
            Your saved itineraries, day-by-day timelines, and travel cost view
            live here once you approve and store a trip.
          </p>
          <div className={styles.authActions}>
            <Link className={styles.primaryButton} href="/api/auth/signin">
              Sign in
            </Link>
            <Link className={styles.secondaryButton} href="/plan-trip">
              Open planner
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: {
      email: session.user.email,
    },
    include: {
      trips: {
        where: {
          status: "FINALIZED",
        },
        orderBy: {
          startDate: "asc",
        },
      },
    },
  });

  const trips = (user?.trips ?? []).flatMap((trip) => {
    try {
      const itinerary = itinerarySchema.parse(JSON.parse(trip.itinerary ?? "[]"));
      const preferences = parseStringArray(trip.preferences);

      return [
        {
          id: trip.id,
          destination: trip.destination,
          startDate: trip.startDate,
          endDate: trip.endDate,
          budget: trip.budget,
          currency: trip.currency,
          totalEstimatedCost: trip.totalEstimatedCost || calculateItineraryCost(itinerary),
          preferences,
          itinerary,
        },
      ];
    } catch {
      return [];
    }
  });

  const totalBudgetTracked = trips.reduce(
    (total, trip) => total + trip.totalEstimatedCost,
    0,
  );

  return (
    <main className={styles.shell}>
      <section className={styles.hero}>
        <div>
          <span className={styles.kicker}>Finalized itinerary archive</span>
          <h1 className={styles.title}>Dashboard</h1>
          <p className={styles.subtitle}>
            Review each approved route, revisit the daily flow, and keep the
            travel stack ready for the next planning session.
          </p>
        </div>

        <div className={styles.heroActions}>
          <Link className={styles.primaryButton} href="/plan-trip">
            Plan another trip
            <ArrowRight size={16} />
          </Link>
          <Link className={styles.secondaryButton} href="/">
            Back to home
          </Link>
        </div>
      </section>

      <section className={styles.metricGrid}>
        <article className={styles.metricCard}>
          <Landmark size={18} />
          <div>
            <span>Finalized trips</span>
            <strong>{trips.length}</strong>
          </div>
        </article>
        <article className={styles.metricCard}>
          <Wallet size={18} />
          <div>
            <span>Tracked itinerary value</span>
            <strong>{totalBudgetTracked.toLocaleString()}</strong>
          </div>
        </article>
        <article className={styles.metricCard}>
          <CalendarRange size={18} />
          <div>
            <span>Signed in as</span>
            <strong>{session.user.email}</strong>
          </div>
        </article>
      </section>

      {trips.length === 0 ? (
        <section className={styles.emptyCard}>
          <Compass size={20} />
          <div>
            <h2>No finalized trips yet</h2>
            <p>
              Once you approve a draft in the planner, the complete itinerary
              will land here with its day-by-day timeline.
            </p>
          </div>
          <Link className={styles.primaryButton} href="/plan-trip">
            Start planning
          </Link>
        </section>
      ) : (
        <section className={styles.tripStack}>
          {trips.map((trip) => (
            <article key={trip.id} className={styles.tripCard}>
              <div className={styles.tripHeader}>
                <div>
                  <span className={styles.tripLabel}>Destination</span>
                  <h2 className={styles.tripTitle}>{trip.destination}</h2>
                </div>
                <div className={styles.tripMeta}>
                  <span>{formatDateRange(trip.startDate, trip.endDate)}</span>
                  <span>
                    {trip.currency} {trip.totalEstimatedCost.toLocaleString()}
                  </span>
                </div>
              </div>

              <div className={styles.preferenceRow}>
                {trip.preferences.map((preference) => (
                  <span key={`${trip.id}-${preference}`} className={styles.preferenceChip}>
                    {preference}
                  </span>
                ))}
              </div>

              <Timeline days={trip.itinerary} />
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
