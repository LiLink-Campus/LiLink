import type { ComponentProps, CSSProperties, ReactNode } from "react";
import styles from "./question-components.module.css";

export function QuestionField({ className = "", ...props }: ComponentProps<"fieldset">) {
  return <fieldset {...props} data-question className={`${styles.field} ${className}`} />;
}

export function QuestionHeading({ children }: { children: ReactNode }) {
  return <><legend className={styles.legend}>{children}</legend><div data-question-title aria-hidden="true" className={styles.title}>{children}</div></>;
}

export function ScaleChoice({ name, label, value, options, onChange, unit = "", readout = "number" }: {
  readout?: "number" | "label";
  unit?: string;
  name: string;
  label: string;
  value: unknown;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const index = options.findIndex(option => option.value === value);
  const position = Math.max(0, index);
  const choose = (next: number) => { if (options[next]) onChange(options[next].value); };
  return <div className={styles.scale} data-scale-choice style={{ "--scale-progress": `${position / Math.max(1, options.length - 1) * 100}%` } as CSSProperties}>
    <div className={styles.scaleReadout} data-readout={readout} aria-hidden="true"><strong>{index < 0 ? "—" : readout === "label" ? options[index].label : index + 1}</strong><span>{unit}</span></div>
    <input className={styles.slider} type="range" aria-label={label} aria-valuetext={index < 0 ? "未选择" : options[index].label} min={0} max={options.length - 1} step={1} value={position} data-unset={index < 0} onKeyDown={event => {
      const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : event.key === "ArrowLeft" || event.key === "ArrowDown" ? Math.max(0, position - 1) : event.key === "ArrowRight" || event.key === "ArrowUp" ? Math.min(options.length - 1, position + 1) : null;
      if (next != null) { event.preventDefault(); choose(next); }
    }} onChange={event => choose(Number(event.target.value))} onPointerUp={event => choose(Number(event.currentTarget.value))} />
    <div className={styles.ticks} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((option, tick) => <label key={option.value} data-visible={tick === 0 || tick === options.length - 1 || tick === index}>
        <input type="radio" name={name} aria-label={option.label} checked={index === tick} onChange={() => choose(tick)} />
        <span aria-hidden="true">{tick + 1}</span>
      </label>)}
    </div>
  </div>;
}

export function ChoiceOption({ className = "", ...props }: ComponentProps<"label">) {
  return <label {...props} data-choice className={`${styles.choice} ${className}`} />;
}

export function QuestionChoices({ children, layout = "tiles" }: { children: ReactNode; layout?: "tiles" | "list" | "compact" }) {
  return <div className={styles.choices} data-choice-layout={layout}>{children}</div>;
}
