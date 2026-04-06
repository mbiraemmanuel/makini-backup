/**
 * GET /api/clients
 * Returns a summary of all clients including last run status.
 */
import { NextResponse } from "next/server";
import { getAllClientConfigs, getClientSummary } from "@/lib/clients";

export async function GET() {
  try {
    const configs = getAllClientConfigs();
    const summaries = await Promise.all(configs.map(getClientSummary));
    return NextResponse.json(summaries);
  } catch (err) {
    console.error("[GET /api/clients]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
