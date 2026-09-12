import type { Persona } from "@/lib/types";

/** ElevenLabs agent IDs come from env so each persona can have its own voice/agent. */
export const PERSONAS: Persona[] = [
  {
    id: "vega",
    name: "Vega",
    tagline: "Reads faces for a living. Yours is an open book.",
    style: "Calm, surgical, quietly amused. Speaks in short observations. Never raises voice. Calls out tells like a doctor reading a chart.",
    elevenLabsAgentId: process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_VEGA,
  },
  {
    id: "dutch",
    name: "Dutch",
    tagline: "Old-school grinder. Talks a lot. Misses nothing.",
    style: "Folksy, chatty, needles the player with friendly trash talk. Loves telling you what your face just did.",
    elevenLabsAgentId: process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_DUTCH,
  },
];

export function getPersona(id: string): Persona {
  return PERSONAS.find((p) => p.id === id) ?? PERSONAS[0];
}
