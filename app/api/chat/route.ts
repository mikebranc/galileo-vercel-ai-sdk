import { openai } from '@ai-sdk/openai';
import {
  streamText,
  UIMessage,
  convertToModelMessages,
  tool,
  stepCountIs,
} from 'ai';
import { z } from 'zod';
import { GalileoLogger } from 'galileo';

export const maxDuration = 30;

// Model configuration
const MODEL_NAME = 'gpt-4o';

// Simple in-memory store for session mapping (in production, use Redis/database)
const chatSessionMap = new Map<string, string>();

export async function POST(req: Request) {
  try {
    const { messages, id: chatId }: { messages: UIMessage[]; id?: string } = await req.json();
    
    // Step 1: Initialize Galileo logger
    const logger = new GalileoLogger({
      projectName: process.env.GALILEO_PROJECT || 'vercel-ai-sdk',
      logStreamName: process.env.GALILEO_LOG_STREAM || 'default'
    });

    // Step 2: Start or continue session using Galileo session ID
    let sessionId: string;
    
    if (chatId && chatSessionMap.has(chatId)) {
      // Continue existing session
      sessionId = chatSessionMap.get(chatId)!;
      logger.setSessionId(sessionId);
    } else {
      // Create new session
      sessionId = await logger.startSession({
        name: `Chat Session${chatId ? ` - ${chatId}` : ''}`
      });
      
      // Store the mapping for future requests
      if (chatId) {
        chatSessionMap.set(chatId, sessionId);
      }
    }

    // Step 3: Start trace (single user interaction)
    logger.startTrace({
      input: messages[messages.length - 1]?.parts?.find(p => p.type === 'text')?.text || 'Chat request',
      name: 'Chat Exchange'
    });

    // Step 4: Add workflow span (overall process orchestration)
    logger.addWorkflowSpan({
      input: 'Processing chat request with agent decision-making',
      name: 'Chat Processing Workflow'
    });

    // Step 5: Add agent span (captures decision-making about tool usage)
    const agentStartTime = new Date();
    logger.addAgentSpan({
      input: JSON.stringify(messages.map(m => ({
        role: m.role,
        content: m.parts?.map(p => p.type === 'text' ? p.text : `[${p.type}]`).join(' ') || ''
      }))),
      name: 'Weather Agent',
      createdAt: agentStartTime,
      tags: ['agent', 'tool-selection']
    });

    // Step 6: Create tools with Galileo logging
    const weatherTool = async ({ location }: { location: string }) => {
      const toolStart = new Date();
      
      try {
        // Simulate weather API call
        const temperature = Math.round(Math.random() * (90 - 32) + 32);
        const result = { location, temperature };
        
        // Log successful tool execution
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
        // Log failed tool execution
        logger.addToolSpan({
          input: JSON.stringify({ location }),
          output: JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
          name: 'Weather Tool (Error)',
          durationNs: (Date.now() - toolStart.getTime()) * 1000000,
          createdAt: toolStart,
          tags: ['tool', 'weather', 'error']
        });
        throw error;
      }
    };

    const convertTool = async ({ temperature }: { temperature: number }) => {
      const toolStart = new Date();
      
      try {
        // Convert temperature
        const celsius = Math.round((temperature - 32) * (5 / 9));
        const result = { celsius };
        
        // Log successful tool execution
        logger.addToolSpan({
          input: JSON.stringify({ temperature }),
          output: JSON.stringify(result),
          name: 'Temperature Conversion Tool',
          durationNs: (Date.now() - toolStart.getTime()) * 1000000,
          createdAt: toolStart,
          tags: ['tool', 'conversion']
        });
        
        return result;
      } catch (error) {
        // Log failed tool execution
        logger.addToolSpan({
          input: JSON.stringify({ temperature }),
          output: JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
          name: 'Temperature Conversion Tool (Error)',
          durationNs: (Date.now() - toolStart.getTime()) * 1000000,
          createdAt: toolStart,
          tags: ['tool', 'conversion', 'error']
        });
        throw error;
      }
    };

    // Step 7: Execute AI with Galileo callbacks
    const result = streamText({
      model: openai(MODEL_NAME),
      messages: convertToModelMessages(messages),
      stopWhen: stepCountIs(5),
      tools: {
        weather: tool({
          description: 'Get the weather in a location (fahrenheit)',
          inputSchema: z.object({
            location: z.string().describe('The location to get the weather for'),
          }),
          execute: weatherTool,
        }),
        convertFahrenheitToCelsius: tool({
          description: 'Convert a temperature in fahrenheit to celsius',
          inputSchema: z.object({
            temperature: z
              .number()
              .describe('The temperature in fahrenheit to convert'),
          }),
          execute: convertTool,
        }),
      },
      
      // Step 8: Log LLM execution when streaming completes
      onFinish: async ({ text, toolCalls, usage, finishReason }) => {
        // Log the LLM span with complete data
        logger.addLlmSpan({
          input: messages.map(m => ({
            role: m.role,
            content: m.parts?.map(p => p.type === 'text' ? p.text : `[${p.type}]`).join(' ') || ''
          })),
          output: {
            role: 'assistant',
            content: text
          },
          model: MODEL_NAME,
          name: `${MODEL_NAME} Chat Completion`,
          durationNs: (Date.now() - agentStartTime.getTime()) * 1000000,
          numInputTokens: usage?.inputTokens,
          numOutputTokens: usage?.outputTokens,
          totalTokens: usage?.totalTokens,
          tags: ['llm', MODEL_NAME.toLowerCase()]
        });

        // Step 9: Conclude spans
        logger.conclude({
          output: text || 'Chat completed successfully'
        });

        // Step 10: Flush traces to Galileo
        await logger.flush();
      },
      
      // Handle streaming errors
      onError: ({ error }) => {
        logger.conclude({
          output: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
        logger.flush();
      }
    });

    return result.toUIMessageStreamResponse();

  } catch (error) {
    // Handle request-level errors
    console.error('Chat API error:', error);
    throw error;
  }
}