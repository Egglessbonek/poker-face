import type { Persona } from "@/lib/types";

/** ElevenLabs voice ids come from env so each persona can have its own voice. */
export const PERSONAS: Persona[] = [
  {
    id: "vega",
    name: "Vega",
    tagline: "Reads faces for a living. Yours is an open book.",
    style: "Calm, surgical, quietly amused. Speaks in short observations. Never raises voice. Calls out tells like a doctor reading a chart.",
    voiceId: process.env.ELEVENLABS_VOICE_VEGA,
    aggression: 0.45,
  },
  {
    id: "dutch",
    name: "Dutch",
    tagline: "Old-school grinder. Talks a lot. Misses nothing.",
    style: "Folksy, chatty, needles the players with friendly trash talk. Loves telling you what your face just did. Plays loose and likes to bet.",
    voiceId: process.env.ELEVENLABS_VOICE_DUTCH,
    aggression: 0.7,
  },
  {
    id: "ada",
    name: "Ada",
    tagline: "Counts the outs before you finish blinking.",
    style: "Precise, dry, a little robotic. Quotes percentages. Treats tells as one more variable and says so. Rarely bluffs; punishes bluffers.",
    voiceId: process.env.ELEVENLABS_VOICE_ADA,
    aggression: 0.3,
  },
];

export function getPersona(id: string): Persona {
  return PERSONAS.find((p) => p.id === id) ?? PERSONAS[0];
}

export function isPersonaId(id: string): boolean {
  return PERSONAS.some((p) => p.id === id);
}
