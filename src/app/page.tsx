import Link from "next/link";
import { Compass, MapPinned, Sparkles, Wallet } from "lucide-react";

export default function Home() {
  return (
    <main className="app-shell">
      <section className="hero-card">
        <div className="nav-row">
          <div className="brand">
            <span className="brand-mark">
              <Compass size={18} strokeWidth={2.3} />
            </span>
            Dromomania
          </div>
          <div className="status-pill">
            <Sparkles size={16} strokeWidth={2.1} />
            AI Itineraries, tuned for real budgets
          </div>
        </div>

        <div className="hero-grid">
          <div className="hero-copy">
            <span className="eyebrow">Premium planning cockpit</span>
            <h1 className="hero-title">
              Plan the trip.
              <span className="gradient-text"> Feel the momentum.</span>
            </h1>
            <p className="hero-subtitle">
              Dromomania turns destinations, budgets, and travel preferences
              into a polished itinerary engine with secure sign-in, structured
              trip storage, and room for AI-powered planning flows.
            </p>

            <div className="button-row">
              <Link className="button button-primary" href="/api/auth/signin">
                Start with Credentials
              </Link>
              <a
                className="button button-secondary"
                href="https://nextjs.org/docs"
                target="_blank"
                rel="noreferrer"
              >
                View Next.js Docs
              </a>
            </div>
          </div>

          <div className="hero-side">
            <article className="panel">
              <span className="panel-kicker">Trip database</span>
              <h2 className="panel-title">Prisma + SQLite are ready.</h2>
              <p className="panel-copy">
                Users can own multiple trips, each with dates, budget,
                preferences, itinerary notes, and a draft-to-finalized status.
              </p>
              <div className="metric-row">
                <div>
                  <div className="metric-value">2 models</div>
                  <div className="metric-label">User and Trip</div>
                </div>
                <div>
                  <div className="metric-value">1:many</div>
                  <div className="metric-label">Relationship wired</div>
                </div>
              </div>
            </article>

            <article className="panel">
              <span className="panel-kicker">Auth foundation</span>
              <h2 className="panel-title">Credentials-based access.</h2>
              <p className="panel-copy">
                NextAuth validates email and password against Prisma so the app
                is ready for onboarding flows and protected trip dashboards.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="section">
        <h2 className="section-heading">What is already in place</h2>
        <div className="panel-grid">
          <article className="panel">
            <MapPinned size={20} strokeWidth={2.2} />
            <h3 className="panel-title">Destination-aware trip records</h3>
            <p className="panel-copy">
              Capture destination, dates, currency, serialized preferences, and
              itinerary output in a single source of truth.
            </p>
            <div className="feature-pill">Draft and finalized states</div>
          </article>

          <article className="panel">
            <Wallet size={20} strokeWidth={2.2} />
            <h3 className="panel-title">Budget-first planning setup</h3>
            <p className="panel-copy">
              Budget and total estimated cost live directly in the schema so
              pricing logic can stay close to the data layer.
            </p>
            <div className="feature-pill">Ready for cost breakdowns</div>
          </article>

          <article className="panel">
            <Sparkles size={20} strokeWidth={2.2} />
            <h3 className="panel-title">AI stack dependencies installed</h3>
            <p className="panel-copy">
              LangGraph, Google GenAI, Tavily, Framer Motion, and Zod are all
              installed for the next build step.
            </p>
            <div className="feature-pill">Prepared for agent workflows</div>
          </article>
        </div>
      </section>
    </main>
  );
}
