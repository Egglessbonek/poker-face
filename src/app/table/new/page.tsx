import TableConfigForm from "@/components/table/TableConfigForm";

export default function NewTablePage() {
  return (
    <main className="flex flex-1 flex-col items-center px-4 py-10 sm:px-8">
      <div className="w-full max-w-2xl">
        <p className="text-xs uppercase tracking-[0.3em] text-gold">New table</p>
        <h1 className="mb-6 text-3xl font-semibold">Set the house rules</h1>
        <TableConfigForm />
      </div>
    </main>
  );
}
