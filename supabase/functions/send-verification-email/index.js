import { serve } from "https://deno.land/std@0.168.0/http/server.js";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const VERIFICATION_CODES = new Map();

// CORS headers for all responses
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Clean up expired codes every hour (codes valid for 10 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of VERIFICATION_CODES.entries()) {
    if (now - value.timestamp > 10 * 60 * 1000) {
      VERIFICATION_CODES.delete(key);
    }
  }
}, 60 * 60 * 1000);

serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    console.log("send-verification-email function called");
    console.log("RESEND_API_KEY configured:", !!RESEND_API_KEY);
    
    const body = await req.json();
    console.log("Request body parsed:", { email, codeLength: body.code?.length });
    const { email, code } = body;

    if (!email || !code) {
      return new Response(
        JSON.stringify({ message: "Email and code are required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
      );
    }

    if (!RESEND_API_KEY) {
      console.error("RESEND_API_KEY not configured");
      return new Response(
        JSON.stringify({ message: "Email service not configured" }),
        { status: 500, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
      );
    }

    // Store the verification code temporarily
    VERIFICATION_CODES.set(email, { code, timestamp: Date.now() });
    console.log("Verification code stored for email:", email);

    // Send email using Resend
    console.log("Sending email via Resend API for:", email);
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "onboarding@resend.dev",
        to,
        subject: "Email Verification - Stockify",
        html: `
          <div style="font-family, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(to right, #0f172a, #1e293b); padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
              <h1 style="color: white; margin: 0;">Stockify</h1>
            </div>
            <div style="background: #f8fafc; padding: 40px; border-radius: 0 0 8px 8px;">
              <h2 style="color: #1e293b; text-align: center;">Verify Your Email</h2>
              <p style="color: #64748b; text-align: center; margin: 20px 0;">
                Thank you for signing up Your verification code is:
              </p>
              <div style="background: #white; border: 2px solid #e2e8f0; padding: 20px; border-radius: 8px; text-align: center; margin: 30px 0;">
                <p style="font-size: 32px; font-weight: bold; color: #2563eb; letter-spacing: 5px; margin: 0;">
                  ${code}
                </p>
              </div>
              <p style="color: #64748b; text-align: center; font-size: 14px;">
                This code will expire in 10 minutes.
              </p>
              <p style="color: #64748b; text-align: center; font-size: 12px; margin-top: 20px;">
                If you didn't sign up for this account, you can safely ignore this email.
              </p>
            </div>
          </div>
        `,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error("Resend API error:", response.status, error);
      return new Response(
        JSON.stringify({ message: "Failed to send verification email", error }),
        { status: 500, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
      );
    }

    console.log("Email sent successfully for:", email);
    return new Response(
      JSON.stringify({ message: "Verification email sent successfully" }),
      { status: 200, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
    );
  } catch (error) {
    console.error("Error in send-verification-email:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ message: "Internal server error", error: errorMessage }),
      { status: 500, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
    );
  }
});
