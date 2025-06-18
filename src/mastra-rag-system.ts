import { Mastra } from '@mastra/core';
import { Agent } from '@mastra/core/agent';
import { createTool } from '@mastra/core/tools';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { z } from 'zod';
import { CONFIG, buildSambaNovaUrl } from './constants';

config();

interface QueryResult {
  response: string;
  context: any[];
  confidence: number;
  processingTime: string;
  recommendations?: string[];
}

// Custom SambaNova provider for Mastra
class SambaNovaProvider {
  private apiKey: string;
  private baseURL: string = CONFIG.SAMBANOVA.BASE_URL;
  private lastRequestTime: number = 0;
  private rateLimitDelayMs: number = CONFIG.RAG.RATE_LIMIT_DELAY_MS;
  private requestCount: number = 0;
  private maxRequestsPerMinute: number = CONFIG.RAG.MAX_REQUESTS_PER_MINUTE;
  private lastResetTime: number = Date.now();

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Rate limiting for SambaNova API - More conservative approach
   */
  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    // Reset request count every minute
    if (now - this.lastResetTime > 60000) {
      this.requestCount = 0;
      this.lastResetTime = now;
    }
    
    // Check if we've exceeded requests per minute
    if (this.requestCount >= this.maxRequestsPerMinute) {
      const waitTime = 60000 - (now - this.lastResetTime);
      if (waitTime > 0) {
        console.log(`⏱️  Rate limiting: reached max requests per minute, waiting ${(waitTime / 1000).toFixed(1)}s...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        this.requestCount = 0;
        this.lastResetTime = Date.now();
      }
    }
    
    // Enforce minimum delay between requests
    if (timeSinceLastRequest < this.rateLimitDelayMs) {
      const delayNeeded = this.rateLimitDelayMs - timeSinceLastRequest;
      console.log(`⏱️  Rate limiting: waiting ${(delayNeeded / 1000).toFixed(1)}s before next request...`);
      await new Promise(resolve => setTimeout(resolve, delayNeeded));
    }
    
    this.lastRequestTime = Date.now();
    this.requestCount++;
  }

  async doGenerate(args: any) {
    await this.enforceRateLimit();
    
    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: CONFIG.SAMBANOVA.MODELS.LLM,
        messages: args.prompt,
        max_tokens: args.maxTokens || 1000,
        temperature: args.temperature || 0.7,
        stream: false
      })
    });

    if (!response.ok) {
      throw new Error(`SambaNova API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as any;
    return {
      text: data.choices[0].message.content,
      usage: data.usage,
      finishReason: data.choices[0].finish_reason
    };
  }

  async doEmbed(args: any) {
    await this.enforceRateLimit();
    
    const response = await fetch(`${this.baseURL}/embeddings`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: CONFIG.SAMBANOVA.MODELS.EMBEDDING,
        input: args.values
      })
    });

    if (!response.ok) {
      throw new Error(`SambaNova Embedding API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as any;
    return {
      embeddings: data.data.map((item: any) => item.embedding)
    };
  }
}

export class MastraRAGSystem {
  private mastra!: Mastra;
  private agent!: Agent;
  private supabase: SupabaseClient;
  private sambaProvider: SambaNovaProvider;

  constructor(
    sambaNovaApiKey: string,
    supabaseUrl: string,
    supabaseKey: string
  ) {
    this.sambaProvider = new SambaNovaProvider(sambaNovaApiKey);
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.initializeAgent();
    this.initializeMastra();
  }

  private initializeAgent() {
    // Create vector search tool
    const vectorSearchTool = createTool({
      id: 'vector-search',
      description: 'Search for relevant documents using vector similarity',
      inputSchema: z.object({
        query: z.string().describe('The search query'),
        limit: z.number().default(5).describe('Number of results to return')
      }),
      execute: async ({ context }) => {
        try {
          // Get embeddings for the query
          const embeddingResponse = await this.sambaProvider.doEmbed({
            values: [context.query]
          });
          const queryEmbedding = embeddingResponse.embeddings[0];

          // Perform vector search in Supabase
          const { data: searchResults, error } = await this.supabase
            .rpc(CONFIG.SUPABASE.FUNCTIONS.MATCH_DOCUMENTS, {
              query_embedding: queryEmbedding,
              match_threshold: CONFIG.RAG.SIMILARITY_THRESHOLD,
              match_count: context.limit
            });

          if (error) {
            console.error('Vector search error:', error);
            return { results: [], error: error.message };
          }

          return {
            results: searchResults || [],
            resultCount: searchResults?.length || 0
          };
        } catch (error: any) {
          console.error('Error in vector search tool:', error);
          return { results: [], error: error.message };
        }
      }
    });

    // Create recommendation tool
    const recommendationTool = createTool({
      id: 'generate-recommendations',
      description: 'Generate follow-up questions and recommendations based on context',
      inputSchema: z.object({
        query: z.string().describe('Original user query'),
        context: z.string().describe('Retrieved context documents'),
        response: z.string().describe('Generated response')
      }),
      execute: async ({ context }) => {
        try {
          const recommendationPrompt = [
            {
              role: 'system',
              content: 'You are a helpful assistant that generates relevant follow-up questions based on user queries and responses. Generate 3-5 concise, relevant follow-up questions.'
            },
            {
              role: 'user',
              content: `Original query: "${context.query}"\n\nResponse: "${context.response}"\n\nGenerate follow-up questions:`
            }
          ];

          const result = await this.sambaProvider.doGenerate({
            prompt: recommendationPrompt,
            maxTokens: 200,
            temperature: 0.8
          });

          const recommendations = result.text
            .split('\n')
            .filter((line: string) => line.trim().length > 0)
            .map((line: string) => line.replace(/^\d+\.\s*/, '').trim())
            .slice(0, 5);

          return { recommendations };
        } catch (error: any) {
          console.error('Error generating recommendations:', error);
          return { recommendations: [] };
        }
      }
    });

    // Create custom model interface for SambaNova
    const customSambaModel = {
      provider: 'sambanova',
      modelId: CONFIG.SAMBANOVA.MODELS.LLM,
      doGenerate: this.sambaProvider.doGenerate.bind(this.sambaProvider),
      doStream: async (args: any) => {
        // For now, we'll just use generate and create a mock stream
        const result = await this.sambaProvider.doGenerate(args);
        return {
          textStream: (async function* () {
            yield result.text;
          })(),
          fullStream: (async function* () {
            yield { type: 'text-delta', textDelta: result.text };
            yield { type: 'finish', finishReason: result.finishReason, usage: result.usage };
          })()
        };
      }
    };

    // Create Mastra agent with SambaNova model and tools
    this.agent = new Agent({
      name: 'SambaNova RAG Agent',
      instructions: `You are an intelligent RAG assistant powered by SambaNova AI. Your role is to:

1. Use the vector search tool to find relevant information for user queries
2. Synthesize information from multiple sources to provide comprehensive answers
3. Generate helpful follow-up questions and recommendations
4. Be accurate, helpful, and concise in your responses

When answering questions:
- Always search for relevant context first using the vector-search tool
- Use the retrieved context to inform your response
- If context is insufficient, say so honestly
- Generate relevant follow-up questions using the recommendation tool
- Cite sources when possible`,
      model: customSambaModel as any, // Type assertion to work with Mastra's typing
      tools: {
        vectorSearch: vectorSearchTool,
        generateRecommendations: recommendationTool
      }
    });
  }

  private initializeMastra() {
    this.mastra = new Mastra({
      agents: {
        'sambanova-rag': this.agent
      }
    });
  }

  async initialize(): Promise<void> {
    console.log('🤖 Initializing Mastra RAG system with SambaNova...');
    
    // Test database connection
    try {
      const { data, error } = await this.supabase.from(CONFIG.SUPABASE.TABLES.DOCUMENTS).select('count').limit(1);
      if (error && !error.message.includes(`relation "${CONFIG.SUPABASE.TABLES.DOCUMENTS}" does not exist`)) {
        throw error;
      }
      console.log('✅ Supabase connection established');
    } catch (error) {
      console.error('❌ Failed to connect to Supabase:', error);
      throw error;
    }

    console.log('✅ Mastra RAG system initialized with enhanced rate limiting');
  }

  async query(query: string): Promise<QueryResult> {
    const startTime = Date.now();
    
    try {
      console.log(`🤖 Mastra Agent processing query: "${query}"`);
      
      // Use Mastra agent to process the query
      const result = await this.agent.generate([
        {
          role: 'user',
          content: query
        }
      ], {
        maxSteps: 3 // Allow agent to use tools
      });

      const processingTime = `${Date.now() - startTime}ms`;
      
      return {
        response: result.text,
        context: [], // Context will be handled by the agent's tools
        confidence: 0.8, // Default confidence
        processingTime,
        recommendations: [] // Recommendations will be generated by tools if needed
      };

    } catch (error: any) {
      console.error('Error in Mastra RAG query:', error);
      
      const processingTime = `${Date.now() - startTime}ms`;
      return {
        response: `I apologize, but I encountered an error while processing your query: ${error.message}. Please try again.`,
        context: [],
        confidence: 0.0,
        processingTime,
        recommendations: []
      };
    }
  }

  async getStats() {
    return {
      system: 'Mastra RAG with SambaNova',
      model: CONFIG.SAMBANOVA.MODELS.LLM,
      provider: 'SambaNova',
      rateLimiting: {
        delayBetweenRequests: `${CONFIG.RAG.RATE_LIMIT_DELAY_MS / 1000}s`,
        maxRequestsPerMinute: CONFIG.RAG.MAX_REQUESTS_PER_MINUTE,
        currentRequestCount: this.sambaProvider['requestCount']
      },
      features: [
        'Mastra Agent Orchestration',
        'Vector Search Tools',
        'Recommendation Generation',
        'Conservative Rate Limiting',
        'SambaNova LLM Integration'
      ]
    };
  }

  // Expose the Mastra instance for external use
  getMastra(): Mastra {
    return this.mastra;
  }

  // Expose the agent for direct access
  getAgent(): Agent {
    return this.agent;
  }
} 