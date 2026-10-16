"use client";

import { TourProvider, useTour, type StepType } from "@reactour/tour";
import { useEffect } from "react";

/** Reactour, loaded on the first start (see Tour): opens the tour each time `run` changes. */
export function TourRunner({ steps, run, onClose }: { steps: StepType[]; run: number; onClose: () => void }) {
  return (
    <TourProvider
      steps={[]}
      padding={{ mask: 6, popover: 12 }}
      scrollSmooth
      beforeClose={onClose}
      styles={{
        popover: (base) => ({
          ...base,
          background: "var(--card)",
          color: "var(--fg)",
          borderRadius: 16,
          padding: "22px 20px 14px",
          maxWidth: "min(340px, calc(100vw - 32px))",
          boxShadow: "0 12px 40px rgb(0 0 0 / 0.25)",
          fontSize: 15,
          lineHeight: 1.45,
        }),
        maskArea: (base) => ({ ...base, rx: 14 }),
        maskWrapper: (base) => ({ ...base, color: "rgb(0 0 0 / 0.55)" }),
        badge: (base) => ({ ...base, background: "var(--fg)", color: "var(--bg)", fontWeight: 700 }),
        close: (base) => ({ ...base, color: "var(--subtle)", top: 10, right: 10 }),
        arrow: (base, state) => ({ ...base, color: state?.disabled ? "var(--line)" : "var(--fg)" }),
        dot: (base, state) => ({
          ...base,
          background: state?.current ? "var(--fg)" : "transparent",
          borderColor: state?.current ? "var(--fg)" : "var(--line)",
        }),
      }}
    >
      <Opener steps={steps} run={run} />
    </TourProvider>
  );
}

function Opener({ steps, run }: { steps: StepType[]; run: number }) {
  const { setIsOpen, setSteps, setCurrentStep } = useTour();
  useEffect(() => {
    setSteps?.(steps);
    setCurrentStep(0);
    setIsOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);
  return null;
}
