import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const state = searchParams.get("state") || "";
  const environment = searchParams.get("environment") || "production";

  const clientId = process.env.SALESFORCE_CLIENT_ID;
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin}/api/auth/salesforce/callback`;

  if (!clientId) {
    return NextResponse.redirect(
      new URL(`/setup/error?message=${encodeURIComponent("Salesforce client ID not configured")}`, request.url)
    );
  }

  // Determine login URL based on environment
  const loginUrl = environment === "sandbox"
    ? "https://test.salesforce.com"
    : "https://login.salesforce.com";

  // Build OAuth URL
  const authUrl = new URL(`${loginUrl}/services/oauth2/authorize`);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", "api refresh_token");
  authUrl.searchParams.set("state", state);

  return NextResponse.redirect(authUrl.toString());
}
