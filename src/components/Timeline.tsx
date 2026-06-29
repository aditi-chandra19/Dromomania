"use client";

import { motion, useReducedMotion } from "framer-motion";
import { BedDouble, CalendarRange, MapPinned, UtensilsCrossed, Wallet } from "lucide-react";

import type { IDay } from "@/lib/itinerary";

import styles from "./Timeline.module.css";

type TimelineProps = {
  days: IDay[];
};

export function Timeline({ days }: TimelineProps) {
  const reduceMotion = useReducedMotion();

  return (
    <div className={styles.timeline}>
      {days.map((day, index) => (
        <motion.article
          key={`${day.day}-${day.date}`}
          className={styles.entry}
          initial={reduceMotion ? false : { opacity: 0, y: 28 }}
          whileInView={reduceMotion ? {} : { opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.38, delay: index * 0.07 }}
        >
          <div className={styles.rail}>
            <span className={styles.dot} />
            {index < days.length - 1 ? <span className={styles.line} /> : null}
          </div>

          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <span className={styles.dayLabel}>Day {day.day}</span>
                <h3 className={styles.title}>{day.title}</h3>
              </div>
              <div className={styles.dateBadge}>
                <CalendarRange size={15} />
                {day.date}
              </div>
            </div>

            <p className={styles.summary}>{day.summary}</p>

            <div className={styles.metricGrid}>
              <div className={styles.metric}>
                <MapPinned size={16} />
                <span>{day.attractions.join(" • ")}</span>
              </div>
              <div className={styles.metric}>
                <UtensilsCrossed size={16} />
                <span>{day.restaurants.join(" • ")}</span>
              </div>
              <div className={styles.metric}>
                <BedDouble size={16} />
                <span>{day.hotelRecommendation}</span>
              </div>
              <div className={styles.metric}>
                <Wallet size={16} />
                <span>{day.estimatedDailyCost.toLocaleString()}</span>
              </div>
            </div>

            <div className={styles.flightPlan}>{day.flightPlan}</div>

            <div className={styles.notes}>
              {day.notes.map((note) => (
                <span key={`${day.day}-${note}`} className={styles.noteChip}>
                  {note}
                </span>
              ))}
            </div>
          </div>
        </motion.article>
      ))}
    </div>
  );
}
