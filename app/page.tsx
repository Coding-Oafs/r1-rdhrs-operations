import Dashboard from "@/components/Dashboard";
import { loadOperationsData } from "@/lib/sources";

export const dynamic = "force-dynamic";

export default async function Home() {
  const initialData = await loadOperationsData();
  return <Dashboard initialData={initialData} />;
}
