/**
 * GET /api/drive/download?fileId=xxx
 * Proxies a Google Drive file download through the Next.js server,
 * so the service account credentials are never exposed to the browser.
 */
import { NextRequest, NextResponse } from "next/server";
import { streamDriveFile } from "@/lib/drive";

export async function GET(req: NextRequest) {
  const fileId = req.nextUrl.searchParams.get("fileId");
  if (!fileId) {
    return NextResponse.json({ error: "fileId required" }, { status: 400 });
  }

  try {
    const { stream, mimeType, name } = await streamDriveFile(fileId);

    // Convert Node.js ReadableStream to a Web ReadableStream
    const webStream = new ReadableStream({
      start(controller) {
        (stream as NodeJS.ReadableStream).on("data", (chunk: Buffer) =>
          controller.enqueue(chunk)
        );
        (stream as NodeJS.ReadableStream).on("end", () => controller.close());
        (stream as NodeJS.ReadableStream).on("error", (err: Error) =>
          controller.error(err)
        );
      },
    });

    return new Response(webStream, {
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": `attachment; filename="${name}"`,
      },
    });
  } catch (err) {
    console.error("[GET /api/drive/download]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
