import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    // Test 1: Capture a message
    Sentry.captureMessage("🧪 Server-side Sentry test message", "info");

    // Test 2: Capture an exception
    const testError = new Error("🧪 Server-side Sentry test error");
    Sentry.captureException(testError);

    // Test 3: Throw an uncaught error (will be caught by Sentry)
    // Uncomment to test uncaught errors:
    // throw new Error("Uncaught server error test");

    return NextResponse.json({
      success: true,
      message: "Test events sent to Sentry! Check your dashboard.",
      events: [
        "Message: 'Server-side Sentry test message'",
        "Exception: 'Server-side Sentry test error'"
      ]
    });
  } catch (error) {
    Sentry.captureException(error);
    return NextResponse.json({
      success: false,
      error: "An error occurred while testing Sentry"
    }, { status: 500 });
  }
}
