'use client'

import * as Sentry from "@sentry/nextjs"

export default function SentryTestPage() {
  const testClientError = () => {
    throw new Error("🧪 Sentry Client Test Error - This is a test!");
  }

  const testCapturedError = () => {
    try {
      throw new Error("🧪 Sentry Captured Error Test");
    } catch (error) {
      Sentry.captureException(error);
      alert("Error captured and sent to Sentry! Check your dashboard.");
    }
  }

  const testMessage = () => {
    Sentry.captureMessage("🧪 Sentry Test Message - Hello from SentryOS!", "info");
    alert("Message sent to Sentry! Check your dashboard.");
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-purple-800 to-indigo-900 flex items-center justify-center p-8">
      <div className="max-w-2xl w-full bg-white/10 backdrop-blur-lg rounded-2xl shadow-2xl p-8 border border-white/20">
        <h1 className="text-4xl font-bold text-white mb-4">
          🛡️ Sentry Test Page
        </h1>
        <p className="text-purple-200 mb-8">
          Test your Sentry integration with the buttons below. Each button will send different types of events to Sentry.
        </p>

        <div className="space-y-4">
          {/* Test 1: Uncaught Error */}
          <div className="bg-white/5 rounded-lg p-4 border border-white/10">
            <h3 className="text-lg font-semibold text-white mb-2">
              1. Test Uncaught Error
            </h3>
            <p className="text-purple-200 text-sm mb-3">
              Throws an uncaught error that Sentry will automatically capture.
            </p>
            <button
              onClick={testClientError}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200 shadow-lg"
            >
              Throw Test Error
            </button>
          </div>

          {/* Test 2: Manually Captured Error */}
          <div className="bg-white/5 rounded-lg p-4 border border-white/10">
            <h3 className="text-lg font-semibold text-white mb-2">
              2. Test Captured Exception
            </h3>
            <p className="text-purple-200 text-sm mb-3">
              Catches an error and manually sends it to Sentry using captureException().
            </p>
            <button
              onClick={testCapturedError}
              className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200 shadow-lg"
            >
              Capture Test Exception
            </button>
          </div>

          {/* Test 3: Message */}
          <div className="bg-white/5 rounded-lg p-4 border border-white/10">
            <h3 className="text-lg font-semibold text-white mb-2">
              3. Test Message Logging
            </h3>
            <p className="text-purple-200 text-sm mb-3">
              Sends a custom message to Sentry using captureMessage().
            </p>
            <button
              onClick={testMessage}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200 shadow-lg"
            >
              Send Test Message
            </button>
          </div>
        </div>

        <div className="mt-8 p-4 bg-green-900/30 rounded-lg border border-green-500/30">
          <p className="text-green-200 text-sm">
            ✅ After testing, check your Sentry dashboard at{' '}
            <a
              href="https://sentry.io"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-green-100"
            >
              sentry.io
            </a>
            {' '}to see the captured events.
          </p>
        </div>

        <div className="mt-4">
          <a
            href="/"
            className="block text-center text-purple-200 hover:text-white underline transition-colors"
          >
            ← Back to Home
          </a>
        </div>
      </div>
    </div>
  )
}
