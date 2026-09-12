import { notFound } from "next/navigation";
import TableClient from "@/components/table/TableClient";
import { isValidCode } from "@/lib/rail/code";

export default async function TablePage(props: PageProps<"/table/[code]">) {
  const { code } = await props.params;
  if (!isValidCode(code)) notFound();
  return <TableClient code={code} />;
}
