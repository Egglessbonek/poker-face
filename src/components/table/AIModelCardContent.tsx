import { Bot } from "lucide-react";

interface Props {
  name: string;
  vendor: string;
}

/** Shared model identity used by picker results and seated AI cards. */
export default function AIModelCardContent({ name, vendor }: Props) {
  return (
    <>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-chip-blue/45 bg-chip-blue/35 text-foreground">
        <Bot size={14} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium" title={name}>{name}</span>
        <span className="mt-0.5 block truncate text-[9px] text-muted">{vendor}</span>
      </span>
    </>
  );
}
