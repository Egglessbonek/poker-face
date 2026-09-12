import { notFound } from "next/navigation";
import TableClient from "@/components/table/TableClient";
import { redirect } from "next/navigation";
import { isValidCode, normalizeCode } from "@/lib/rail/code";

export default async function TablePage(props: PageProps<"/table/[code]">) {
  const { code } = await props.params;
  if (!isValidCode(code)) {
    const fixed = normalizeCode(code);
    if (fixed.length === 4 && fixed !== code) redirect(`/table/${fixed}`);
    notFound();
  }
  return <TableClient code={code} />;
}
