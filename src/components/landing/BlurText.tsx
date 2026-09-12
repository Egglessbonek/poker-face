"use client";

/**
 * BlurText from React Bits (reactbits.dev), ported to TypeScript. Words or letters blur and drift into place
 * when the element scrolls into view. Two additions: `as` picks the rendered element so the hero can be a
 * real heading, and users who prefer reduced motion get the settled text with no animation.
 */

import { motion, useReducedMotion, type Transition } from "motion/react";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";

type Snapshot = Record<string, string | number>;

interface BlurTextProps {
  text?: string;
  delay?: number;
  className?: string;
  animateBy?: "words" | "letters";
  direction?: "top" | "bottom";
  threshold?: number;
  rootMargin?: string;
  animationFrom?: Snapshot;
  animationTo?: Snapshot[];
  easing?: (t: number) => number;
  onAnimationComplete?: () => void;
  stepDuration?: number;
  /** Element to render; defaults to a paragraph. */
  as?: "p" | "h1" | "h2" | "span" | "div";
}

const buildKeyframes = (from: Snapshot, steps: Snapshot[]): Record<string, Array<string | number>> => {
  const keys = new Set([...Object.keys(from), ...steps.flatMap((s) => Object.keys(s))]);
  const keyframes: Record<string, Array<string | number>> = {};
  keys.forEach((k) => {
    keyframes[k] = [from[k], ...steps.map((s) => s[k])];
  });
  return keyframes;
};

export default function BlurText({
  text = "",
  delay = 200,
  className = "",
  animateBy = "words",
  direction = "top",
  threshold = 0.1,
  rootMargin = "0px",
  animationFrom,
  animationTo,
  easing = (t) => t,
  onAnimationComplete,
  stepDuration = 0.35,
  as = "p",
}: BlurTextProps) {
  const elements = animateBy === "words" ? text.split(" ") : text.split("");
  const [inView, setInView] = useState(false);
  const reduced = useReducedMotion() ?? false;
  const [node, setNode] = useState<HTMLElement | null>(null);
  const setRef = useCallback((el: HTMLElement | null) => setNode(el), []);

  useEffect(() => {
    const el = node;
    if (!el || reduced) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.unobserve(el);
        }
      },
      { threshold, rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [node, reduced, threshold, rootMargin]);

  const defaultFrom = useMemo<Snapshot>(
    () => (direction === "top" ? { filter: "blur(10px)", opacity: 0, y: -50 } : { filter: "blur(10px)", opacity: 0, y: 50 }),
    [direction],
  );
  const defaultTo = useMemo<Snapshot[]>(
    () => [
      { filter: "blur(5px)", opacity: 0.5, y: direction === "top" ? 5 : -5 },
      { filter: "blur(0px)", opacity: 1, y: 0 },
    ],
    [direction],
  );

  const fromSnapshot = animationFrom ?? defaultFrom;
  const toSnapshots = animationTo ?? defaultTo;
  const settled = toSnapshots[toSnapshots.length - 1];
  const stepCount = toSnapshots.length + 1;
  const totalDuration = stepDuration * (stepCount - 1);
  const times = Array.from({ length: stepCount }, (_, i) => (stepCount === 1 ? 0 : i / (stepCount - 1)));
  const style: CSSProperties = { display: "flex", flexWrap: "wrap" };

  const children = elements.map((segment, index) => {
    const transition: Transition = { duration: totalDuration, times, delay: (index * delay) / 1000, ease: easing };
    return (
      <motion.span
        className="inline-block will-change-[transform,filter,opacity]"
        key={index}
        initial={reduced ? settled : fromSnapshot}
        animate={reduced ? settled : inView ? buildKeyframes(fromSnapshot, toSnapshots) : fromSnapshot}
        transition={reduced ? { duration: 0 } : transition}
        onAnimationComplete={index === elements.length - 1 ? onAnimationComplete : undefined}
      >
        {segment === " " ? " " : segment}
        {animateBy === "words" && index < elements.length - 1 && " "}
      </motion.span>
    );
  });

  const Tag = as;
  return (
    <Tag ref={setRef} className={className} style={style} aria-label={text}>
      {children}
    </Tag>
  );
}
