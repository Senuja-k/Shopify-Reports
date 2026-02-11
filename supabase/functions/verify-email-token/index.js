import { serve } from "https://deno.land/std@0.168.0/http/server.js";

// Store verification codes with expiration (10 minutes)
const VERIFICATION_CODES = new Map();

// CORS headers for all responses
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Clean up expired codes periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of VERIFICATION_CODES.entries()) {
    if (now - value.timestamp > 10 * 60 * 1000) {
      VERIFICATION_CODES.delete(key);
    }
  }
}, 5 * 60 * 1000); // Check every 5 minutes

serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    console.log("verify-email-token function called");
    const body = await req.json();
    console.log("Request body parsed:", { email, codeLength: body.code?.length });
    const { email, code } = body;

    if (!email || !code) {
      return new Response(
        JSON.stringify({ message: "Email and code are required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
      );
    }

    // Check if code exists for this email
    const stored = VERIFICATION_CODES.get(email);
    console.log("Code lookup for email:", email, "found:", !!stored);

    if (!stored) {
      return new Response(
        JSON.stringify({ message: "Verification code not found or expired. Please request a new one." }),
        { status: 400, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
      );
    }

    // Check if code is expired (10 minutes)
    const ageMs = Date.now() - stored.timestamp;
    console.log("Code age (ms):", ageMs, "Expired:", ageMs > 10 * 60 * 1000);
    if (ageMs > 10 * 60 * 1000) {
      VERIFICATION_CODES.delete(email);
      return new Response(
        JSON.stringify({ message: "Verification code has expired. Please request a new one." }),
        { status: 400, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
      );
    }

    // Verify the code
    const codeMatch = stored.code === code;
    console.log("Code verification:", { expected, received, match: codeMatch });
    if (!codeMatch) {
      return new Response(
        JSON.stringify({ message: "Invalid verification code. Please check and try again." }),
        { status: 400, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
      );
    }

    // Code is valid - remove it
    VERIFICATION_CODES.delete(email);
    console.log("Code verified and deleted for email:", email);

    return new Response(
      JSON.stringify({ message: "Email verified successfully" }),
      { status: 200, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
    );
  } catch (error) {
    console.error("Error in verify-email-token:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ message: "Internal server error", error: errorMessage }),
      { status: 500, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
    );
  }
});
