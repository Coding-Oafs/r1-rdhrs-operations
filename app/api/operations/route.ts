import { NextResponse } from "next/server";
import { loadOperationsData } from "@/lib/sources";

export const runtime = "nodejs";
export const revalidate = 300;

export async function GET() {
  const data = await loadOperationsData();
  return NextResponse.json(data, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=300" } });
}
