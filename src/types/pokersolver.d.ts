declare module "pokersolver" {
  export class Hand {
    static solve(cards: string[], game?: string, canDisqualify?: boolean): Hand;
    static winners(hands: Hand[]): Hand[];
    cardPool: unknown[];
    cards: unknown[];
    descr: string;
    name: string;
    rank: number;
    toString(): string;
  }
}
