import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getClientConfigPath } from "@/lib/clients";

export async function GET(
  req: Request,
  props: { params: Promise<{ slug: string }> }
) {
  const { slug } = await props.params;

  try {
    const configPath = getClientConfigPath(slug);
    if (!configPath || !fs.existsSync(configPath)) {
      return NextResponse.json({ error: "Config not found" }, { status: 404 });
    }

    const raw = fs.readFileSync(configPath, "utf-8");
    const payload = JSON.parse(raw);
    return NextResponse.json(payload);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}

export async function POST(
  req: Request,
  props: { params: Promise<{ slug: string }> }
) {
  const { slug } = await props.params;

  try {
    const configPath = getClientConfigPath(slug);
    if (!configPath || !fs.existsSync(configPath)) {
      return NextResponse.json({ error: "Config not found" }, { status: 404 });
    }

    const payload = await req.json();

    // Basic structure validation
    if (!payload.client_slug || !payload.client_name) {
      return NextResponse.json(
        { error: "Invalid configuration payload" },
        { status: 400 }
      );
    }

    fs.writeFileSync(configPath, JSON.stringify(payload, null, 2), "utf8");

    return NextResponse.json({ success: true, message: "Configuration updated successfully" });
  } catch (error: any) {
    console.error("Failed to update config:", error);
    return NextResponse.json(
      { error: error.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}