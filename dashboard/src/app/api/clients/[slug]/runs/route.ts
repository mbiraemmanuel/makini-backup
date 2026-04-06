/**
 * GET /api/clients/[slug]/runs
 * Returns paginated list of backup runs for a client.
 *
 * Query params:
 *   limit  (default 30)
 *   offset (default 0)
 *   manifest (default false) — if "true", fetches manifest for each run
 */
import { NextRequest, NextResponse } from "next/server";
import { getClientConfig } from "@/lib/clients";
import { listBackupFolders, buildBackupRun } from "@/lib/drive";

export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const { slug } = params;
  const { searchParams } = req.nextUrl;
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "30"), 365);
  const offset = parseInt(searchParams.get("offset") ?? "0");
  const withManifest = searchParams.get("manifest") === "true";

  const config = getClientConfig(slug);
  if (!config) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  try {
    const folders = await listBackupFolders(config.drive.root_folder_id);
    const page = folders.slice(offset, offset + limit);

    const runs = withManifest
      ? await Promise.all(page.map(buildBackupRun))
      : page.map((f) => ({
          date: f.name,
          folder_id: f.id,
          folder_url: `https://drive.google.com/drive/folders/${f.id}`,
          manifest: null,
        }));

    return NextResponse.json({
      total: folders.length,
      offset,
      limit,
      runs,
    });
  } catch (err) {
    console.error(`[GET /api/clients/${slug}/runs]`, err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
