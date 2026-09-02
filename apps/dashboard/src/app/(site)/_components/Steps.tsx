import type { SiteStep } from "@/lib/site/content";

/** Bordures hautes des étapes, dans l'ordre du design (cyclique au-delà de 4). */
const STEP_COLORS = ["#FF6A2B", "#7C2AE8", "#22E1B9", "#1C1C1E"];

export function Steps({ title, steps }: { title: string; steps: SiteStep[] }) {
  if (steps.length === 0) return null;
  return (
    <section className="aj-section aj-sec-steps">
      <div data-reveal="1">
        <h2 className="aj-h2-steps">{title}</h2>
        <div className="aj-steps">
          {steps.map((step, index) => (
            <div
              key={`${index}-${step.title}`}
              className="aj-step"
              style={{ borderTopColor: STEP_COLORS[index % STEP_COLORS.length] }}
            >
              <div className="aj-step-num">{String(index + 1).padStart(2, "0")}</div>
              <div className="aj-step-title">{step.title}</div>
              <div className="aj-step-text">{step.text}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
