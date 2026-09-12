import RailDashboard from "@/components/rail/RailDashboard";

export default async function RailCodePage(props: PageProps<"/rail/[code]">) {
  const { code } = await props.params;
  const searchParams = await props.searchParams;
  return <RailDashboard code={code} demo={searchParams.demo === "1"} />;
}
