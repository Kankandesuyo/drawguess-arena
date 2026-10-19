import { useEffect, useState } from "react";

// iOS can pan the visual viewport as well as resize it when the keyboard opens.
export function useVisualViewport() {
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    const viewport = window.visualViewport;
    let frame = 0,
      baseline = viewport?.height ?? window.innerHeight,
      previousWidth = window.innerWidth;
    const delayed = new Set<ReturnType<typeof setTimeout>>();
    function update() {
      frame = 0;
      const zoomed = viewport && Math.abs(viewport.scale - 1) > 0.05;
      const height = zoomed
        ? window.innerHeight
        : (viewport?.height ?? window.innerHeight);
      if (Math.abs(window.innerWidth - previousWidth) > 60) {
        baseline = height;
        previousWidth = window.innerWidth;
      }
      const active = document.activeElement;
      const editing =
        active instanceof HTMLElement &&
        active.matches(
          'input:not([type="range"]):not([type="file"]),textarea,[contenteditable="true"]',
        );
      if (!editing) baseline = Math.max(baseline, height);
      const open = !!editing && !zoomed && baseline - height > 100;
      const top =
        !zoomed && (editing || height < baseline - 80)
          ? Math.max(0, viewport?.offsetTop ?? 0)
          : 0;
      const root = document.documentElement;
      root.style.setProperty("--app-height", `${height}px`);
      root.style.setProperty("--app-top", `${top}px`);
      root.style.setProperty(
        "--app-bottom",
        `${Math.max(0, window.innerHeight - top - height)}px`,
      );
      setKeyboardOpen(open);
    }
    function schedule() {
      if (!frame) frame = requestAnimationFrame(update);
    }
    function focus() {
      schedule();
      for (const delay of [80, 250, 500]) {
        const timer = setTimeout(() => {
          delayed.delete(timer);
          schedule();
        }, delay);
        delayed.add(timer);
      }
    }
    update();
    viewport?.addEventListener("resize", schedule);
    viewport?.addEventListener("scroll", schedule);
    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", focus);
    document.addEventListener("focusin", focus);
    document.addEventListener("focusout", focus);
    return () => {
      cancelAnimationFrame(frame);
      for (const timer of delayed) clearTimeout(timer);
      viewport?.removeEventListener("resize", schedule);
      viewport?.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", focus);
      document.removeEventListener("focusin", focus);
      document.removeEventListener("focusout", focus);
    };
  }, []);
  return keyboardOpen;
}
