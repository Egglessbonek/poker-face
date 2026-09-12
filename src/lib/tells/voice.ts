/**
 * Optional voice tells. The player never has to talk; this only runs when push-to-talk is active.
 *
 * Two sources:
 *  1. Transcript from the ElevenLabs agent's onMessage (user role) -> words, statement type (LLM-classified later)
 *  2. Web Audio: pitch via autocorrelation + RMS energy, compared to a baseline captured during calibration
 *     (player says "I'm all in" once). Hall noise makes this low-weight.
 *
 * TODO(phase 5).
 */

import type { VoiceStats } from "@/lib/types";

export interface VoiceAnalyzer {
  start(stream: MediaStream): void;
  stop(): void;
  onTranscript(text: string, t?: number): void;
  finish(): VoiceStats;
}

export function createVoiceAnalyzer(): VoiceAnalyzer {
  let transcript = "";
  return {
    start() {
      // TODO: AudioContext + AnalyserNode, sample pitch/energy at ~10Hz
    },
    stop() {},
    onTranscript(text) {
      transcript += (transcript ? " " : "") + text;
    },
    finish() {
      const words = transcript.trim() ? transcript.trim().split(/\s+/).length : 0;
      const stats: VoiceStats = { spoke: words > 0, words, pitchDelta: 1, energyDelta: 1, transcript: transcript || undefined };
      transcript = "";
      return stats;
    },
  };
}
