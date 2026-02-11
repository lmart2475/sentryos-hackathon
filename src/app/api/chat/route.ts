import { query } from '@anthropic-ai/claude-agent-sdk'
import * as Sentry from '@sentry/nextjs'

const SYSTEM_PROMPT = `You are a helpful personal assistant designed to help with general research, questions, and tasks.

Your role is to:
- Answer questions on any topic accurately and thoroughly
- Help with research by searching the web for current information
- Assist with writing, editing, and brainstorming
- Provide explanations and summaries of complex topics
- Help solve problems and think through decisions

Guidelines:
- Be friendly, clear, and conversational
- Use web search when you need current information, facts you're unsure about, or real-time data
- Keep responses concise but complete - expand when the topic warrants depth
- Use markdown formatting when it helps readability (bullet points, code blocks, etc.)
- Be honest when you don't know something and offer to search for answers`

interface MessageInput {
  role: 'user' | 'assistant'
  content: string
}

export async function POST(request: Request) {
  // Generate request ID for tracing
  const requestId = crypto.randomUUID()
  const requestStartTime = Date.now()

  try {
    const { messages } = await request.json() as { messages: MessageInput[] }

    // Log request received
    Sentry.logger.info("Chat API request received", {
      endpoint: "/api/chat",
      requestId,
      messageCount: messages?.length || 0
    })

    if (!messages || !Array.isArray(messages)) {
      Sentry.logger.error("Chat API validation error: invalid messages", {
        endpoint: "/api/chat",
        requestId,
        error: "Messages array is required"
      })
      Sentry.metrics.count("sentryos.api.chat.request", 1, {
        tags: { status: "validation_error" }
      })
      return new Response(
        JSON.stringify({ error: 'Messages array is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Get the last user message
    const lastUserMessage = messages.filter(m => m.role === 'user').pop()
    if (!lastUserMessage) {
      Sentry.logger.error("Chat API validation error: no user message", {
        endpoint: "/api/chat",
        requestId,
        error: "No user message found"
      })
      Sentry.metrics.count("sentryos.api.chat.request", 1, {
        tags: { status: "validation_error" }
      })
      return new Response(
        JSON.stringify({ error: 'No user message found' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Build conversation context
    const conversationContext = messages
      .slice(0, -1) // Exclude the last message since we pass it as the prompt
      .map((m: MessageInput) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n\n')

    const fullPrompt = conversationContext
      ? `${SYSTEM_PROMPT}\n\nPrevious conversation:\n${conversationContext}\n\nUser: ${lastUserMessage.content}`
      : `${SYSTEM_PROMPT}\n\nUser: ${lastUserMessage.content}`

    // Create a streaming response
    const encoder = new TextEncoder()

    // Initialize streaming metrics
    let streamStartTime = 0
    let chunkCount = 0
    let toolExecutions = 0
    let streamingTextLength = 0
    const toolTimings: Map<string, number> = new Map()

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Log streaming started
          streamStartTime = Date.now()
          Sentry.logger.info("Chat streaming started", {
            endpoint: "/api/chat",
            requestId,
            messageLength: lastUserMessage.content.length
          })
          // Use the claude-agent-sdk query function with all default tools enabled
          for await (const message of query({
            prompt: fullPrompt,
            options: {
              maxTurns: 10,
              // Use the preset to enable all Claude Code tools including WebSearch
              tools: { type: 'preset', preset: 'claude_code' },
              // Bypass all permission checks for automated tool execution
              permissionMode: 'bypassPermissions',
              allowDangerouslySkipPermissions: true,
              // Enable partial messages for real-time text streaming
              includePartialMessages: true,
              // Set working directory to the app's directory for sandboxing
              cwd: process.cwd(),
            }
          })) {
            // Handle streaming text deltas (partial messages)
            if (message.type === 'stream_event' && 'event' in message) {
              const event = message.event
              // Handle content block delta events for text streaming
              if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
                chunkCount++
                streamingTextLength += event.delta.text.length
                controller.enqueue(encoder.encode(
                  `data: ${JSON.stringify({ type: 'text_delta', text: event.delta.text })}\n\n`
                ))
              }
            }

            // Send tool start events from assistant messages
            if (message.type === 'assistant' && 'message' in message) {
              const content = message.message?.content
              if (Array.isArray(content)) {
                for (const block of content) {
                  if (block.type === 'tool_use') {
                    toolExecutions++
                    toolTimings.set(block.name, Date.now())

                    Sentry.logger.info("Tool execution started", {
                      endpoint: "/api/chat",
                      requestId,
                      toolName: block.name
                    })

                    Sentry.metrics.count("sentryos.chat.tool.executed", 1, {
                      tags: { toolName: block.name }
                    })

                    controller.enqueue(encoder.encode(
                      `data: ${JSON.stringify({ type: 'tool_start', tool: block.name })}\n\n`
                    ))
                  }
                }
              }
            }

            // Send tool progress updates
            if (message.type === 'tool_progress') {
              // Track tool duration when completed
              if (message.elapsed_time_seconds) {
                Sentry.metrics.distribution("sentryos.chat.tool.duration", message.elapsed_time_seconds, {
                  unit: "second",
                  tags: { toolName: message.tool_name }
                })
              }

              controller.enqueue(encoder.encode(
                `data: ${JSON.stringify({ type: 'tool_progress', tool: message.tool_name, elapsed: message.elapsed_time_seconds })}\n\n`
              ))
            }

            // Signal completion
            if (message.type === 'result' && message.subtype === 'success') {
              const totalDuration = Date.now() - requestStartTime
              const streamDuration = Date.now() - streamStartTime

              Sentry.logger.info("Chat streaming completed successfully", {
                endpoint: "/api/chat",
                requestId,
                totalDuration,
                streamDuration,
                chunkCount,
                toolExecutions,
                streamingTextLength
              })

              // Track metrics
              Sentry.metrics.count("sentryos.api.chat.request", 1, {
                tags: { status: "success" }
              })
              Sentry.metrics.distribution("sentryos.api.chat.duration", totalDuration, {
                unit: "millisecond",
                tags: { hasError: "false" }
              })
              Sentry.metrics.distribution("sentryos.stream.total_duration", streamDuration, {
                unit: "millisecond"
              })
              Sentry.metrics.distribution("sentryos.stream.chunk.count", chunkCount, {
                unit: "none"
              })

              controller.enqueue(encoder.encode(
                `data: ${JSON.stringify({ type: 'done' })}\n\n`
              ))
            }

            // Handle errors
            if (message.type === 'result' && message.subtype !== 'success') {
              const totalDuration = Date.now() - requestStartTime

              Sentry.logger.error("Chat query did not complete successfully", {
                endpoint: "/api/chat",
                requestId,
                totalDuration,
                subtype: message.subtype
              })

              Sentry.metrics.count("sentryos.api.chat.request", 1, {
                tags: { status: "error" }
              })
              Sentry.metrics.distribution("sentryos.api.chat.duration", totalDuration, {
                unit: "millisecond",
                tags: { hasError: "true" }
              })

              controller.enqueue(encoder.encode(
                `data: ${JSON.stringify({ type: 'error', message: 'Query did not complete successfully' })}\n\n`
              ))
            }
          }

          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        } catch (error) {
          const totalDuration = Date.now() - requestStartTime

          Sentry.logger.error("Chat stream error", {
            endpoint: "/api/chat",
            requestId,
            totalDuration,
            error: error instanceof Error ? error.message : String(error)
          })

          Sentry.metrics.count("sentryos.api.chat.request", 1, {
            tags: { status: "stream_error" }
          })

          console.error('Stream error:', error)
          controller.enqueue(encoder.encode(
            `data: ${JSON.stringify({ type: 'error', message: 'Stream error occurred' })}\n\n`
          ))
          controller.close()
        }
      }
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  } catch (error) {
    const totalDuration = Date.now() - requestStartTime

    Sentry.logger.error("Chat API error", {
      endpoint: "/api/chat",
      requestId,
      totalDuration,
      error: error instanceof Error ? error.message : String(error)
    })

    Sentry.metrics.count("sentryos.api.chat.request", 1, {
      tags: { status: "error" }
    })
    Sentry.metrics.distribution("sentryos.api.chat.duration", totalDuration, {
      unit: "millisecond",
      tags: { hasError: "true" }
    })

    console.error('Chat API error:', error)

    return new Response(
      JSON.stringify({ error: 'Failed to process chat request. Check server logs for details.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
