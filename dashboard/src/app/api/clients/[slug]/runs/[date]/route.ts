/**
 * GET /api/clients/[slug]/runs/[date]
 * Returns the full manifest for a specific backup run.
 *
 * [date] is the Drive folder name: YYYY-MM-DD
 */
import { NextRequest, NextResponse } from "next/server";
import { getClientConfig } from "@/lib/clients";
import { listBackupFolders, fetchManifest, listDataFiles } from "@/lib/drive";

export async function GET(
  _req: NextRequest,
  { params }: { params: { slug: string; date: string } }
) {
  const { slug, date } = params;

  const config = getClientConfig(slug);
  if (!config) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  try {
    const folders = await listBackupFolders(config.drive.root_folder_id);
    const folder = folders.find((f) => f.name === date);
    if (!folder) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    const [manifest, dataFiles] = await Promise.all([
      fetchManifest(folder.id),
      listDataFiles(folder.id),
    ]);

    return NextResponse.json({
      date,
      folder_id: folder.id,
      folder_url: `https://drive.google.com/drive/folders/${folder.id}`,
      manifest,
      data_files: dataFiles,
    });
  } catch (err) {
    console.error(`[GET /api/clients/${slug}/runs/${date}]`, err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
