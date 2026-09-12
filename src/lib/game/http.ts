import "server-only";
import { NextResponse } from "next/server";
import { TableError } from "./table";

/** Run a table operation and map TableError to its HTTP status. */
export async function handle<T>(fn: () => T | Promise<T>): Promise<NextResponse> {
  try {
    const out = await fn();
    return NextResponse.json(out ?? { ok: true });
  } catch (err) {
    if (err instanceof TableError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: (err as Error).message ?? "error" }, { status: 400 });
  }
}

export async function body<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}
