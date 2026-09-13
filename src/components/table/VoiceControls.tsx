"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic2, MicOff, Music2 } from "lucide-react";
import type { useTalk } from "@/hooks/useTalk";

const TABLE_MUSIC_URL = "/sounds/pokerface.wav";
const TABLE_MUSIC_VOLUME = 0.3;

export default function VoiceControls({ voice, tableVoiceEnabled }: { voice: ReturnType<typeof useTalk>; tableVoiceEnabled: boolean }) {
  const { muted, unavailable, blocked, speaking, setMuted, unblock } = voice;
  const voiceOn = tableVoiceEnabled && !muted;
  const needsTap = voiceOn && blocked;
  const { musicOn, toggleMusic } = useTableMusic();
  const toggleVoice = () => {
    if (!tableVoiceEnabled) return;
    if (muted) {
      setMuted(false);
      unblock();
    } else if (needsTap) unblock();
    else setMuted(true);
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={toggleVoice}
        disabled={!tableVoiceEnabled}
        aria-pressed={voiceOn}
        aria-label={`Voice ${voiceOn ? "On" : "Off"}`}
        aria-live="polite"
        title={!tableVoiceEnabled ? "Voice is disabled for this table" : unavailable ? "Voice is temporarily unavailable" : undefined}
        className={`flex items-center gap-2 rounded-full border px-3 py-2 text-xs transition disabled:cursor-default ${needsTap ? "animate-pulse border-gold bg-gold/15 text-gold" : voiceOn ? "border-gold/50 text-gold" : "border-felt-edge text-muted"}`}
      >
        {voiceOn ? <Mic2 size={14} className={speaking ? "animate-pulse" : ""} /> : <MicOff size={14} />}
        <span>Voice</span>
        <span className="font-mono">{voiceOn ? "On" : "Off"}</span>
      </button>
      <button
        type="button"
        onClick={toggleMusic}
        aria-pressed={musicOn}
        aria-label={`Music ${musicOn ? "On" : "Off"}`}
        className={`flex items-center gap-2 rounded-full border px-3 py-2 text-xs transition ${musicOn ? "border-gold/50 text-gold" : "border-felt-edge text-muted"}`}
      >
        <Music2 size={14} />
        <span>Music</span>
        <span className="font-mono">{musicOn ? "On" : "Off"}</span>
      </button>
    </div>
  );
}

function useTableMusic() {
  const [musicOn, setMusicOn] = useState(true);
  const musicOnRef = useRef(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playRef = useRef<() => void>(() => {});

  useEffect(() => {
    const music = new Audio(TABLE_MUSIC_URL);
    music.loop = true;
    music.preload = "auto";
    music.volume = TABLE_MUSIC_VOLUME;
    audioRef.current = music;
    let active = true;
    let playPending = false;

    const stopRetrying = () => {
      document.removeEventListener("pointerdown", play);
      document.removeEventListener("keydown", play);
    };
    const play = () => {
      if (!active || !musicOnRef.current || playPending || !music.paused) return;
      playPending = true;
      void music.play()
        .then(stopRetrying)
        .catch(() => {})
        .finally(() => { playPending = false; });
    };
    playRef.current = play;

    document.addEventListener("pointerdown", play);
    document.addEventListener("keydown", play);
    play();

    return () => {
      active = false;
      stopRetrying();
      playRef.current = () => {};
      audioRef.current = null;
      music.pause();
      music.currentTime = 0;
    };
  }, []);

  const toggleMusic = useCallback(() => {
    const next = !musicOnRef.current;
    musicOnRef.current = next;
    setMusicOn(next);
    if (next) playRef.current();
    else audioRef.current?.pause();
  }, []);

  return { musicOn, toggleMusic };
}
