import PredictionResults from "@/components/rail/PredictionResults";

export default async function RailPredictionResultsPage(props: PageProps<"/rail/[code]/results">) {
  const { code } = await props.params;
  return <PredictionResults code={code} />;
}
