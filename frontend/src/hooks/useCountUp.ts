import { useState, useEffect } from "react";

/**
 * Custom hook to smoothly count up a number over a specified duration with cubic ease-out.
 *
 * @param targetValue The final numeric value to reach.
 * @param duration Duration in milliseconds (default: 800ms).
 * @param decimals Number of decimal places to preserve (default: 0).
 * @returns The animated current numeric value.
 */
export function useCountUp(
  targetValue: number,
  duration: number = 800,
  decimals: number = 0
): number {
  const [current, setCurrent] = useState<number>(0);

  useEffect(() => {
    // If target is 0 or NaN, quickly set to 0
    if (!targetValue || isNaN(targetValue)) {
      setCurrent(0);
      return;
    }

    let startTimestamp: number | null = null;
    let animationFrameId: number;
    const startValue = 0;

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const elapsed = timestamp - startTimestamp;
      const progress = Math.min(elapsed / duration, 1);

      // Ease-out cubic: decelerates toward the end
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const val = startValue + (targetValue - startValue) * easeOut;

      if (progress < 1) {
        if (decimals > 0) {
          const factor = Math.pow(10, decimals);
          setCurrent(Math.round(val * factor) / factor);
        } else {
          setCurrent(Math.round(val));
        }
        animationFrameId = window.requestAnimationFrame(step);
      } else {
        // Ensure exact target value is displayed at completion
        setCurrent(targetValue);
      }
    };

    animationFrameId = window.requestAnimationFrame(step);

    return () => {
      if (animationFrameId) {
        window.cancelAnimationFrame(animationFrameId);
      }
    };
  }, [targetValue, duration, decimals]);

  return current;
}
