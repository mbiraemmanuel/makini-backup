import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const stateParam = searchParams.get("state");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  if (error) {
    return NextResponse.redirect(
      new URL(`/setup/error?message=${encodeURIComponent(errorDescription || error)}`, request.url)
    );
  }

  if (!code || !stateParam) {
    return NextResponse.redirect(
      new URL(`/setup/error?message=${encodeURIComponent("Missing authorization code or state")}`, request.url)
    );
  }

  // Decode state
  let state: { tenantId: string; environment: string; returnUrl: string };
  try {
    state = JSON.parse(atob(decodeURIComponent(stateParam)));
  } catch {
    return NextResponse.redirect(
      new URL(`/setup/error?message=${encodeURIComponent("Invalid state parameter")}`, request.url)
    );
  }

  const clientId = process.env.SALESFORCE_CLIENT_ID;
  const clientSecret = process.env.SALESFORCE_CLIENT_SECRET;
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin}/api/auth/salesforce/callback`;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      new URL(`/setup/error?message=${encodeURIComponent("Salesforce credentials not configured")}`, request.url)
    );
  }

  // Determine token URL based on environment
  const tokenUrl = state.environment === "sandbox"
    ? "https://test.salesforce.com/services/oauth2/token"
    : "https://login.salesforce.com/services/oauth2/token";

  try {
    // Exchange code for tokens
    const tokenResponse = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error("Token exchange failed:", errorData);
      return NextResponse.redirect(
        new URL(`/setup/error?message=${encodeURIComponent("Failed to exchange authorization code")}`, request.url)
      );
    }

    const tokens = await tokenResponse.json();

    // Get user info to get org details
    const userInfoResponse = await fetch(`${tokens.instance_url}/services/oauth2/userinfo`, {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
      },
    });

    if (!userInfoResponse.ok) {
      return NextResponse.redirect(
        new URL(`/setup/error?message=${encodeURIComponent("Failed to get user info")}`, request.url)
      );
    }

    const userInfo = await userInfoResponse.json();

    // Create Supabase admin client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Generate a slug from org name or username
    const orgSlug = userInfo.organization_id || 
      userInfo.preferred_username?.split("@")[0]?.toLowerCase().replace(/[^a-z0-9]/g, "-") ||
      `org-${Date.now()}`;

    // Create the organization
    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .insert({
        tenant_id: state.tenantId,
        slug: orgSlug,
        name: userInfo.name || userInfo.preferred_username || "Salesforce Org",
        sf_org_id: userInfo.organization_id,
        sf_environment: state.environment,
        sf_instance_url: tokens.instance_url,
        sf_username: userInfo.preferred_username,
        is_active: true,
      })
      .select()
      .single();

    if (orgError) {
      console.error("Failed to create organization:", orgError);
      return NextResponse.redirect(
        new URL(`/setup/error?message=${encodeURIComponent("Failed to save organization: " + orgError.message)}`, request.url)
      );
    }

    // Store the OAuth tokens
    const { error: tokenError } = await supabase
      .from("oauth_tokens")
      .upsert({
        tenant_id: state.tenantId,
        organization_id: org.id,
        provider: "salesforce",
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_type: tokens.token_type,
        instance_url: tokens.instance_url,
        scope: tokens.scope,
        expires_at: tokens.issued_at ? new Date(parseInt(tokens.issued_at) + 7200000).toISOString() : null,
      }, {
        onConflict: "tenant_id,provider",
      });

    if (tokenError) {
      console.error("Failed to store tokens:", tokenError);
    }

    // Log activity
    await supabase.from("activity_logs").insert({
      tenant_id: state.tenantId,
      organization_id: org.id,
      event_type: "organization_connected",
      event_category: "auth",
      severity: "info",
      message: `Connected Salesforce organization: ${userInfo.preferred_username}`,
      metadata: {
        sf_org_id: userInfo.organization_id,
        sf_username: userInfo.preferred_username,
        environment: state.environment,
      },
    });

    // Redirect back to tenant page
    return NextResponse.redirect(
      new URL(state.returnUrl || `/settings/tenants/${state.tenantId}`, request.url)
    );
  } catch (err) {
    console.error("OAuth callback error:", err);
    return NextResponse.redirect(
      new URL(`/setup/error?message=${encodeURIComponent("An error occurred during authentication")}`, request.url)
    );
  }
}
