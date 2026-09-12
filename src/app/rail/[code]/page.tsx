import RailDashboard from "@/components/rail/RailDashboard";

export default async function RailCodePage(props: PageProps<"/rail/[code]">) {
  const { code } = await props.params;
  return <RailDashboard code={code} />;
}
