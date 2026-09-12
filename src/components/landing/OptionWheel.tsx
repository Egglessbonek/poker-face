"use client";

/**
 * OptionWheel from React Bits (reactbits.dev), ported to TypeScript as a CSS module. Options sit on a circle
 * and ease toward the selected one; scroll, drag, click or arrow keys move it. Two changes from the original:
 * the config is synced in an effect (no ref writes during render), and every option gets its resting layout
 * inline at render time so the server HTML already matches the first client frame.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import styles from "./OptionWheel.module.css";

export interface OptionWheelProps {
  items: string[];
  defaultSelected?: number;
  /** Controlled selection: when it changes from outside (buttons), the wheel eases to it. `onChange` still fires for scroll, drag, click and keys. */
  selected?: number;
  onChange?: (index: number, item: string) => void;
  textColor?: string;
  activeColor?: string;
  side?: "left" | "right";
  /** Font size of the option labels in rem. */
  fontSize?: number;
  /** Vertical distance between options as a multiple of the font size. */
  spacing?: number;
  /** Depth of the circular curve; 0 flattens the wheel into a straight list. */
  curve?: number;
  /** Angle in degrees between neighboring options; higher values curl the wheel tighter. */
  tilt?: number;
  /** Blur in pixels added per step away from the middle. */
  blur?: number;
  /** Opacity lost per step away from the middle. */
  fade?: number;
  minOpacity?: number;
  /** Easing time constant in milliseconds; higher values feel heavier. */
  smoothing?: number;
  /** Padding in pixels between the anchored edge and the centered option. */
  inset?: number;
  /** Vertical position of the selected option as a percentage of the wheel's height (50 = the middle). */
  centerY?: number;
  loop?: boolean;
  draggable?: boolean;
  /** Let the mouse wheel / trackpad move the wheel. Off, scrolling over it scrolls the page as usual. */
  scrollable?: boolean;
  soundUrl?: string;
  soundVolume?: number;
  className?: string;
  "aria-label"?: string;
}

interface Config {
  count: number;
  items: string[];
  rowH: number;
  curve: number;
  tilt: number;
  blur: number;
  fade: number;
  minOpacity: number;
  side: "left" | "right";
  loop: boolean;
  smoothing: number;
  draggable: boolean;
  soundUrl: string;
  soundVolume: number;
}

/** Where an option sits for a signed distance `d` (in rows) from the wheel position. */
function layout(
  d: number,
  cfg: Pick<
    Config,
    "rowH" | "curve" | "tilt" | "blur" | "fade" | "minOpacity" | "side"
  >,
) {
  const mirror = cfg.side === "right" ? -1 : 1;
  const dist = Math.abs(d);
  // Options sit on a circle whose radius keeps the arc length between two neighbors equal to one row
  // height, so tilt controls how tightly it curls.
  const tiltRad = (cfg.tilt * Math.PI) / 180;
  const R = tiltRad > 0.0005 ? cfg.rowH / tiltRad : 0;
  let x = 0;
  let y = d * cfg.rowH;
  let rot = 0;
  if (R > 0) {
    const ang = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, d * tiltRad));
    y = R * Math.sin(ang);
    x = -mirror * R * (1 - Math.cos(ang)) * cfg.curve;
    rot = (mirror * ang * 180) / Math.PI;
  }
  return {
    transform: `translate(${x.toFixed(2)}px, calc(${y.toFixed(2)}px - 50%)) rotate(${rot.toFixed(3)}deg)`,
    opacity: String(Math.max(cfg.minOpacity, 1 - dist * cfg.fade)),
    filter: cfg.blur > 0 ? `blur(${(dist * cfg.blur).toFixed(2)}px)` : "none",
    p: Math.max(0, 1 - Math.min(dist, 1)).toFixed(4),
  };
}

export default function OptionWheel({
  items,
  defaultSelected = 0,
  selected,
  onChange,
  textColor = "#a6a6a6",
  activeColor = "#ffffff",
  side = "left",
  fontSize = 3,
  spacing = 1,
  curve = 1,
  tilt = 6,
  blur = 2,
  fade = 0.25,
  minOpacity = 0.05,
  smoothing = 200,
  inset = 80,
  centerY = 50,
  loop = false,
  draggable = true,
  scrollable = true,
  soundUrl = "",
  soundVolume = 0.5,
  className = "",
  "aria-label": ariaLabel = "Option wheel",
}: OptionWheelProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Array<HTMLDivElement | null>>([]);
  const posRef = useRef(defaultSelected);
  const targetRef = useRef(defaultSelected);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef(0);
  const remRef = useRef(16);
  const onChangeRef = useRef(onChange);
  const selectedRef = useRef(defaultSelected);
  const wheelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragRef = useRef<{ y: number; start: number; id: number } | null>(null);
  const dragMovedRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef("");
  const lastTickRef = useRef(0);
  const [selectedIndex, setSelectedIndex] = useState(defaultSelected);
  const [isDragging, setIsDragging] = useState(false);
  /** The frame function, reached through a ref so the loop can reschedule itself without referring to itself. */
  const frameRef = useRef<(now: number) => void>(() => {});

  // The server and the first client frame lay the options out with a 16px rem; the loop measures the real one.
  const baseCfg = {
    count: items.length,
    items,
    rowH: Math.max(fontSize * spacing * 16, 1),
    curve,
    tilt,
    blur,
    fade,
    minOpacity,
    side,
    loop,
    smoothing,
    draggable,
    soundUrl,
    soundVolume,
  };
  const cfgRef = useRef<Config>(baseCfg);
  useEffect(() => {
    remRef.current =
      parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    cfgRef.current = {
      ...baseCfg,
      rowH: Math.max(fontSize * spacing * remRef.current, 1),
    };
    onChangeRef.current = onChange;
  });

  // Single rAF loop that eases the wheel position toward its target with frame-rate independent
  // exponential smoothing, then lays every option out along the curve.
  const runFrame = useCallback((now: number) => {
    const dt = Math.min((now - lastRef.current) / 1000, 0.05);
    lastRef.current = now;
    const cfg = cfgRef.current;
    const tau = Math.max(cfg.smoothing, 1) / 1000;
    const k = 1 - Math.exp(-dt / tau);
    const target = targetRef.current;
    const cur = posRef.current;
    let next = cur + (target - cur) * k;
    const settled = Math.abs(target - next) < 0.001;
    if (settled) next = target;
    posRef.current = next;

    const els = itemRefs.current;
    const n = cfg.count;
    for (let i = 0; i < n; i++) {
      const el = els[i];
      if (!el) continue;
      let d = i - next;
      if (cfg.loop && n > 1) {
        d = ((d % n) + n) % n;
        if (d > n / 2) d -= n;
      }
      const l = layout(d, cfg);
      el.style.transform = l.transform;
      el.style.opacity = l.opacity;
      el.style.filter = l.filter;
      el.style.setProperty("--ow-p", l.p);
    }
    rafRef.current = settled
      ? null
      : requestAnimationFrame((t) => frameRef.current(t));
  }, []);
  useEffect(() => {
    frameRef.current = runFrame;
  }, [runFrame]);

  const startLoop = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    lastRef.current = performance.now();
    rafRef.current = requestAnimationFrame((t) => frameRef.current(t));
  }, []);

  // Optional tick on selection change, throttled, with playback failures (autoplay policies) ignored.
  const playTick = useCallback(() => {
    const { soundUrl, soundVolume } = cfgRef.current;
    if (!soundUrl) return;
    const now = performance.now();
    if (now - lastTickRef.current < 70) return;
    lastTickRef.current = now;
    if (!audioRef.current || audioUrlRef.current !== soundUrl) {
      audioRef.current = new Audio(soundUrl);
      audioRef.current.preload = "auto";
      audioUrlRef.current = soundUrl;
    }
    const audio = audioRef.current;
    audio.volume = Math.min(Math.max(soundVolume, 0), 1);
    audio.currentTime = 0;
    audio.play()?.catch(() => {});
  }, []);

  const applyTarget = useCallback(
    (value: number, snap: boolean) => {
      const cfg = cfgRef.current;
      let v = value;
      if (!cfg.loop) v = Math.min(Math.max(v, 0), Math.max(cfg.count - 1, 0));
      if (snap) v = Math.round(v);
      targetRef.current = v;
      const idx = ((Math.round(v) % cfg.count) + cfg.count) % cfg.count;
      if (idx !== selectedRef.current) {
        selectedRef.current = idx;
        setSelectedIndex(idx);
        onChangeRef.current?.(idx, cfg.items[idx]);
        playTick();
      }
      startLoop();
    },
    [startLoop, playTick],
  );

  // Wheel / touchpad scrolling, registered manually so it can be non-passive.
  useEffect(() => {
    const el = rootRef.current;
    if (!el || !scrollable) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const cfg = cfgRef.current;
      const delta = e.deltaMode === 1 ? e.deltaY * 24 : e.deltaY;
      // Cap each event at one step so notchy mouse wheels move exactly one option per click.
      const step = Math.max(-1, Math.min(1, delta / cfg.rowH));
      applyTarget(targetRef.current + step, false);
      if (wheelTimerRef.current) clearTimeout(wheelTimerRef.current);
      wheelTimerRef.current = setTimeout(
        () => applyTarget(targetRef.current, true),
        140,
      );
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      if (wheelTimerRef.current) clearTimeout(wheelTimerRef.current);
    };
  }, [applyTarget, scrollable]);

  const handlePointerDown = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (!cfgRef.current.draggable) return;
    dragRef.current = {
      y: e.clientY,
      start: targetRef.current,
      id: e.pointerId,
    };
    dragMovedRef.current = false;
    setIsDragging(true);
  }, []);

  const handlePointerMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dy = e.clientY - drag.y;
      if (!dragMovedRef.current && Math.abs(dy) > 4) {
        dragMovedRef.current = true;
        // Capture only once a real drag starts, so plain clicks still reach the items.
        rootRef.current?.setPointerCapture(drag.id);
      }
      if (dragMovedRef.current)
        applyTarget(drag.start - dy / cfgRef.current.rowH, false);
    },
    [applyTarget],
  );

  const handlePointerEnd = useCallback(() => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setIsDragging(false);
    if (dragMovedRef.current) applyTarget(targetRef.current, true);
  }, [applyTarget]);

  const handleItemClick = useCallback(
    (index: number) => {
      if (dragMovedRef.current) return;
      const cfg = cfgRef.current;
      const cur = targetRef.current;
      let d = index - (((cur % cfg.count) + cfg.count) % cfg.count);
      if (cfg.loop && cfg.count > 1) {
        if (d > cfg.count / 2) d -= cfg.count;
        else if (d < -cfg.count / 2) d += cfg.count;
      }
      applyTarget(cur + d, true);
    },
    [applyTarget],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      let delta: number | null = null;
      if (e.key === "ArrowUp" || e.key === "ArrowLeft") delta = -1;
      else if (e.key === "ArrowDown" || e.key === "ArrowRight") delta = 1;
      if (delta == null) return;
      e.preventDefault();
      applyTarget(Math.round(targetRef.current) + delta, true);
    },
    [applyTarget],
  );

  // An outside selection (the up/down buttons) moves the wheel without going through onChange again.
  useEffect(() => {
    if (selected === undefined) return;
    const cfg = cfgRef.current;
    const n = Math.max(cfg.count, 1);
    const idx = cfg.loop ? ((selected % n) + n) % n : Math.min(Math.max(selected, 0), n - 1);
    if (idx === selectedRef.current) return;
    let target = idx;
    if (cfg.loop && n > 1) {
      // Shortest way round from wherever the wheel is now.
      const cur = targetRef.current;
      let d = idx - (((Math.round(cur) % n) + n) % n);
      if (d > n / 2) d -= n;
      else if (d < -n / 2) d += n;
      target = cur + d;
    }
    selectedRef.current = idx;
    targetRef.current = target;
    playTick();
    startLoop();
  }, [selected, startLoop, playTick]);

  // Re-lay the wheel out when its geometry changes (and once on mount, with the measured rem).
  useEffect(() => {
    targetRef.current = Math.min(
      Math.max(targetRef.current, 0),
      Math.max(items.length - 1, 0),
    );
    startLoop();
  }, [
    items,
    fontSize,
    spacing,
    curve,
    tilt,
    blur,
    fade,
    minOpacity,
    side,
    loop,
    smoothing,
    startLoop,
  ]);

  useEffect(
    () => () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      audioRef.current?.pause();
    },
    [],
  );

  const current = selected === undefined ? selectedIndex : ((selected % Math.max(items.length, 1)) + items.length) % Math.max(items.length, 1);
  const rootStyle = {
    "--ow-text-color": textColor,
    "--ow-active-color": activeColor,
    "--ow-font-size": `${fontSize}rem`,
    "--ow-inset": `${inset}px`,
    "--ow-center": `${centerY}%`,
  } as CSSProperties;

  return (
    <div
      ref={rootRef}
      role="listbox"
      tabIndex={0}
      aria-label={ariaLabel}
      className={`${styles.wheel}${side === "right" ? ` ${styles.right}` : ""}${isDragging ? ` ${styles.dragging}` : ""}${className ? ` ${className}` : ""}`}
      style={rootStyle}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onKeyDown={handleKeyDown}
    >
      {items.map((label, index) => {
        const l = layout(index - defaultSelected, baseCfg);
        return (
          <div
            key={`${label}-${index}`}
            ref={(el) => {
              itemRefs.current[index] = el;
            }}
            role="option"
            aria-selected={current === index}
            className={`${styles.item}${current === index ? ` ${styles.selected}` : ""}`}
            style={
              {
                transform: l.transform,
                opacity: l.opacity,
                filter: l.filter,
                "--ow-p": l.p,
              } as CSSProperties
            }
            onClick={() => handleItemClick(index)}
          >
            {label}
          </div>
        );
      })}
    </div>
  );
}
