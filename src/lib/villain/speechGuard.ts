/** Conservative gate for public banter. Decision reasoning must never pass through this channel. */
export function safeTableTalk(value: unknown): string {
  if (typeof value !== "string") return "";
  const text = value.normalize("NFKC").replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/[’‘]/g, "'").trim();
  if (!text || text.length > 100 || text.split(/\s+/).length > 12) return "";
  // English banter only; reject markup, card symbols, encoded payloads, numbers and percentages.
  if (/[^a-zA-Z\s.,!?';:()\-—–]/.test(text)) return "";
  if (/\b(?:ace|aces|king|kings|queen|queens|jack|jacks|ten|tens|nine|nines|eight|eights|seven|sevens|six|sixes|five|fives|four|fours|three|threes|two|twos|deuce|deuces|trey|treys|spade|spades|heart|hearts|diamond|diamonds|club|clubs)\b/i.test(text)) return "";
  if (/\b(?:[AKQJT][CDHS]|[AKQJT]{2}(?:o|s)?)\b/.test(text)) return "";
  if (/\b[akqjt]-[akqjt](?:o|s)?\b/i.test(text)) return "";
  if (/\b(?:pair|paired|trips|set|straight|flush|full\s+house|quads|boat|nuts|nut|kicker|draw|drawing|outs|overcards?|overpair|underpair|suited|offsuit|pocket|hole|holding|blockers?|equity|odds|percent|probability|range|bluff|bluffing|bluffed|value|air|monster|trash|royal|cowboys|bullets|rockets|snowmen|ducks|fishhooks|broadway|big\s+slick|dead\s+man)\b/i.test(text)) return "";
  // Private strength, future plans, claims about other hands, and coaching/collusion.
  if (/\b(?:my|your|their|our|his|her)\s+(?:\w+\s+){0,2}(?:cards?|hand|chances|percentage)\b/i.test(text)) return "";
  if (/\b(?:i|we|you|he|she|they)\s+(?:(?:have|has|had|hold|held|got|am|are|is|was|were|will|would|might|can|could)\b|'(?:m|ve|d|ll)\b)/i.test(text)) return "";
  if (/\b(?:i'm|i've|i'd|i'll|you're|you've|you'll|they're|they've|they'll|we're|we've|we'll)\b/i.test(text)) return "";
  if (/\b(?:fold|folding|call|calling|raise|raising|bet|betting|check|checking|all[ -]?in|shove|shoving|jam|jamming|limp|limping|slowplay|trap|trapping|should|must|need\s+to|let's|if|unless|signal|collude|team\s+up|split\s+the\s+pot)\b/i.test(text)) return "";
  return text;
}
