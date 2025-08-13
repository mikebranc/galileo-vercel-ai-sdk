# Vercel AI SDK + Galileo Integration Demo (Next.js)

A reference **Next.js** implementation showing how to integrate [Vercel AI SDK](https://ai-sdk.dev/) with [Galileo's TypeScript SDK](https://v2docs.galileo.ai/sdk-api/typescript/sdk-reference) for comprehensive AI application observability.

This demo builds upon the official [Vercel AI SDK Next.js App Router quickstart](https://ai-sdk.dev/docs/getting-started/nextjs-app-router), extending it with complete Galileo observability integration.

## What This Demo Shows

This integration demonstrates how to add **complete observability** to AI applications using Galileo's structured logging with:

- ✅ **Session Management** - Group related conversation traces
- ✅ **Agent Span Tracking** - Capture decision-making processes  
- ✅ **LLM Call Monitoring** - Track model performance and token usage
- ✅ **Tool Execution Logging** - Monitor tool calls and results
- ✅ **Error Handling** - Graceful failure tracking
- ✅ **Streaming Support** - Works with Vercel AI SDK's streaming responses 

## Architecture

The integration follows Galileo's recommended span hierarchy for agentic applications:

```
Session: "Chat Session - chat-abc123"
└── Trace: "Chat Exchange" 
    └── Workflow: "Chat Processing Workflow"
        └── Agent: "gpt-4o Agent Decision Making"
            ├── LLM: "gpt-4o Chat Completion"
            ├── Tool: "Weather Tool"
            └── Tool: "Temperature Conversion Tool"
```

## Quick Start

### 1. Prerequisites

- An OpenAI API key: https://openai.com/api/
- A Galileo account and API key: https://app.galileo.ai/

### 2. Clone and Install

```bash
git clone <this-repo>
cd galileo-vercel-ai-sdk
pnpm install
```

### 3. Environment Setup

Create a `.env.local` file:

```bash
# OpenAI API Key
OPENAI_API_KEY=your-openai-api-key-here

# Galileo Configuration
GALILEO_API_KEY=your-galileo-api-key
GALILEO_PROJECT=vercel-ai-sdk
GALILEO_LOG_STREAM=default

# Optional: Custom Galileo deployment
# GALILEO_CONSOLE_URL=your-galileo-console-url
```

### 4. Run the Demo

```bash
pnpm dev
```

Visit `http://localhost:3000` and start chatting! Try asking about weather or temperature conversions to see tool execution tracking.

## Key Integration Points

### Session Persistence

The integration maintains consistent Galileo sessions across multiple messages in a conversation:

```typescript
// Maps chat IDs to Galileo session IDs for persistence
const chatSessionMap = new Map<string, string>();

if (chatId && chatSessionMap.has(chatId)) {
  // Continue existing session
  sessionId = chatSessionMap.get(chatId)!;
  logger.setSessionId(sessionId);
} else {
  // Create new session
  sessionId = await logger.startSession({
    name: `Chat Session - ${chatId}`
  });
  chatSessionMap.set(chatId, sessionId);
}
```

### Agent-Centric Logging

Captures the decision-making process of agentic AI applications:

```typescript
// Agent span captures tool selection decisions
const agent = logger.addAgentSpan({
  input: JSON.stringify(messages),
  name: `${MODEL_NAME} Agent Decision Making`,
  createdAt: agentStartTime,
  tags: ['agent', 'tool-selection']
});
```

### Tool Execution Tracking

Each tool call gets comprehensive logging:

```typescript
const weatherTool = async ({ location }: { location: string }) => {
  const toolStart = new Date();
  
  try {
    const result = await getWeather(location);
    
    // Log successful execution
    logger.addToolSpan({
      input: JSON.stringify({ location }),
      output: JSON.stringify(result),
      name: 'Weather Tool',
      durationNs: (Date.now() - toolStart.getTime()) * 1000000,
      createdAt: toolStart,
      tags: ['tool', 'weather']
    });
    
    return result;
  } catch (error) {
    // Log failures with error details
    logger.addToolSpan({
      input: JSON.stringify({ location }),
      output: JSON.stringify({ error: error.message }),
      name: 'Weather Tool (Error)',
      // ... error metadata
    });
    throw error;
  }
};
```

### Streaming Integration

Uses Vercel AI SDK's `onFinish` callback for accurate completion tracking:

```typescript
const result = streamText({
  model: openai(MODEL_NAME),
  messages: convertToModelMessages(messages),
  tools: { weather: weatherTool, convert: convertTool },
  
  onFinish: async ({ text, toolCalls, usage, finishReason }) => {
    // Log LLM execution with complete data
    logger.addLlmSpan({
      input: messages,
      output: { role: 'assistant', content: text },
      model: MODEL_NAME,
      numInputTokens: usage?.inputTokens,
      numOutputTokens: usage?.outputTokens,
      totalTokens: usage?.totalTokens,
      tags: ['llm', MODEL_NAME.toLowerCase()]
    });

    // Conclude spans and flush to Galileo
    logger.conclude({ output: text });
    await logger.flush();
  }
});
```

## File Structure

```
├── app/
│   ├── api/chat/route.ts     # Main integration - API route with Galileo logging
│   ├── page.tsx              # Chat UI component
│   ├── layout.tsx            # App layout
│   └── globals.css           # Styling
├── README.md                 # This file
├── package.json              # Dependencies
└── .env.local               # Environment variables (create this)
```

## Customization

### Adding New Tools

```typescript
// 1. Create tool function with logging
const newTool = async ({ param }: { param: string }) => {
  const toolStart = new Date();
  try {
    const result = await yourToolLogic(param);
    logger.addToolSpan({
      input: JSON.stringify({ param }),
      output: JSON.stringify(result),
      name: 'Your New Tool',
      durationNs: (Date.now() - toolStart.getTime()) * 1000000,
      createdAt: toolStart,
      tags: ['tool', 'your-category']
    });
    return result;
  } catch (error) {
    // Add error logging...
    throw error;
  }
};

// 2. Add to streamText tools
tools: {
  weather: weatherTool,
  convert: convertTool,
  newTool: tool({
    description: 'Your tool description',
    inputSchema: z.object({
      param: z.string().describe('Parameter description')
    }),
    execute: newTool
  })
}
```

### Changing Models

```typescript
// Update the model constant at the top of route.ts
const MODEL_NAME = 'gpt-4o-mini'; // or 'claude-3-sonnet', etc.

// All logging automatically updates to reflect the new model
```

More details on LLM providers and models supported by the AI SDK can be found [here](https://ai-sdk.dev/docs/foundations/providers-and-models)

### Custom Metadata

```typescript
// Add custom metadata to any span
logger.addLlmSpan({
  // ... standard fields
  metadata: {
    userId: req.headers['x-user-id'],
    sessionType: 'premium',
    customField: 'your-value'
  }
});
```

## Documentation Links

### Vercel AI SDK
- [Getting Started](https://ai-sdk.dev/docs)
- [Tool Calling](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling)
- [Streaming Text](https://ai-sdk.dev/docs/ai-sdk-core/generating-text)
- [Message Persistence](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-message-persistence)

### Galileo
- [Getting Started](https://v2docs.galileo.ai/getting-started/quickstart)
- [TypeScript SDK Reference](https://v2docs.galileo.ai/sdk-api/typescript/sdk-reference)
- [Galileo Logger](https://v2docs.galileo.ai/sdk-api/logging/galileo-logger)
- [Logging Basics](https://v2docs.galileo.ai/sdk-api/logging/logging-basics)
- [Span Types](https://v2docs.galileo.ai/concepts/logging/spans)
