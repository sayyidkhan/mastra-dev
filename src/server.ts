import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { config } from 'dotenv';
import { SupabaseRAGSystem } from './supabase-rag-system';
import { MastraRAGSystem } from './mastra-rag-system';
import { CONFIG, validateEnvironment, getServerConfig, getRagConfig } from './constants';

// Load environment variables
config();

// Type definitions
interface DocumentRequest {
  documents: {
    id: string;
    content: string;
    metadata: {
      source: string;
      tags?: string[];
    };
  }[];
}

interface QueryRequest {
  prompt: string;
}

// Enhanced query request with document selection
interface EnhancedQueryRequest {
  prompt: string;
  documentIds?: string[];  // Optional: specific documents to query against
  documentNames?: string[]; // Optional: query by document names
  tags?: string[];         // Optional: query documents with specific tags
  useAllDocuments?: boolean; // Optional: use all available documents
  userResponse?: string;  // Optional: user's response/feedback for formatting
}

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

interface RouteParams {
  id: string;
}

// File upload interface for multipart
interface FileUpload {
  filename: string;
  encoding: string;
  mimetype: string;
  file: NodeJS.ReadableStream;
  fields: any;
}

// Initialize RAG systems
let ragSystem: SupabaseRAGSystem | null = null;
let mastraRagSystem: MastraRAGSystem | null = null;

async function initializeRAGSystem() {
  // Validate environment variables using constants
  const envValidation = validateEnvironment();
  if (!envValidation.isValid) {
    throw new Error(`Missing required environment variables: ${envValidation.missingVars.join(', ')}`);
  }

  ragSystem = new SupabaseRAGSystem(
    CONFIG.ENV.SAMBANOVA_API_KEY!,
    getRagConfig(),
    CONFIG.ENV.SUPABASE_DATABASE_URL!,
    CONFIG.ENV.SUPABASE_SERVICE_ROLE_KEY!,
    CONFIG.SUPABASE.BUCKET_NAME
  );

  await ragSystem.initialize();
  console.log('✅ Supabase RAG System initialized');

  // Initialize Mastra RAG system for enhanced query processing
  mastraRagSystem = new MastraRAGSystem(
    CONFIG.ENV.SAMBANOVA_API_KEY!,
    CONFIG.ENV.SUPABASE_DATABASE_URL!,
    CONFIG.ENV.SUPABASE_SERVICE_ROLE_KEY!
  );

  await mastraRagSystem.initialize();
  console.log('✅ Mastra RAG System initialized with enhanced rate limiting');
}

// Build Fastify app
async function buildApp(): Promise<FastifyInstance> {
  const serverConfig = getServerConfig();
  const fastify = Fastify({
    logger: {
      level: 'info'
    },
    bodyLimit: serverConfig.bodyLimit,
    keepAliveTimeout: serverConfig.keepAliveTimeout,
    requestTimeout: serverConfig.requestTimeout
  });

  // Register plugins
  await fastify.register(require('@fastify/cors'), {
    origin: true,
    credentials: true
  });

  await fastify.register(require('@fastify/helmet'), {
    contentSecurityPolicy: false
  });

  await fastify.register(require('@fastify/rate-limit'), {
    max: CONFIG.RATE_LIMIT.MAX_REQUESTS,
    timeWindow: CONFIG.RATE_LIMIT.TIME_WINDOW
  });

  await fastify.register(require('@fastify/multipart'), {
    limits: {
      fileSize: CONFIG.UPLOAD.MAX_FILE_SIZE,
      files: CONFIG.UPLOAD.MAX_FILES
    }
  });

  // Health check endpoint
  fastify.get('/health', async (request: FastifyRequest, reply: FastifyReply) => {
    return {
      success: true,
      message: 'SambaNova RAG API with Mastra.ai + Supabase (Fastify)',
      timestamp: new Date().toISOString(),
      systems: {
        supabase_rag: ragSystem !== null,
        mastra_rag: mastraRagSystem !== null
      },
      storage: 'Supabase Storage + PostgreSQL',
      framework: 'Fastify + Mastra.ai',
      query_system: 'Mastra.ai with Enhanced Rate Limiting'
    };
  });

  // Get system statistics
  fastify.get('/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      if (!ragSystem || !mastraRagSystem) {
        reply.code(500);
        return {
          success: false,
          error: 'RAG systems not initialized'
        } as ApiResponse;
      }

      const [supabaseStats, mastraStats] = await Promise.all([
        ragSystem.getDetailedStats(),
        mastraRagSystem.getStats()
      ]);
      
      return {
        success: true,
        data: {
          supabase_system: supabaseStats,
          mastra_system: mastraStats,
          active_query_system: 'Mastra.ai (Enhanced Rate Limiting)',
          rate_limiting: {
            delay_between_requests: '8 seconds',
            max_requests_per_minute: 5,
            features: ['Conservative Rate Limiting', 'Request Count Tracking', 'Auto Rate Reset']
          }
        }
      } as ApiResponse;
    } catch (error: any) {
      fastify.log.error('Error getting stats:', error);
      reply.code(500);
      return {
        success: false,
        error: error.message
      } as ApiResponse;
    }
  });

  // Upload file endpoint
  fastify.post('/upload', async (request: any, reply: FastifyReply) => {
    try {
      if (!ragSystem) {
        reply.code(500);
        return {
          success: false,
          error: 'RAG system not initialized'
        } as ApiResponse;
      }

      const data = await request.file();
      if (!data) {
        reply.code(400);
        return {
          success: false,
          error: 'No file uploaded'
        } as ApiResponse;
      }

      // Validate file type using constants
      const allowedTypes = CONFIG.UPLOAD.ALLOWED_MIME_TYPES;

      // Check by file extension if MIME type is generic
      const filename = data.filename || '';
      const extension = filename.toLowerCase().split('.').pop();
      const allowedExtensions = CONFIG.UPLOAD.ALLOWED_EXTENSIONS;

      console.log(`📁 DEBUG: File details:`, {
        filename: data.filename,
        mimetype: data.mimetype,
        encoding: data.encoding,
        extension: extension
      });

      const isMimeTypeAllowed = allowedTypes.includes(data.mimetype);
      const isExtensionAllowed = allowedExtensions.includes(extension || '');
      
      if (!isMimeTypeAllowed && !isExtensionAllowed) {
        reply.code(400);
        return {
          success: false,
          error: `File type not supported. Received: ${data.mimetype} (${extension}). Allowed types: ${allowedTypes.join(', ')} or extensions: ${allowedExtensions.join(', ')}`
        } as ApiResponse;
      }

      // Convert stream to buffer
      const chunks: Buffer[] = [];
      for await (const chunk of data.file) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);

      // Create file object compatible with existing uploadFile method
      const fileObj = {
        fieldname: 'file',
        originalname: data.filename,
        encoding: data.encoding,
        mimetype: data.mimetype,
        buffer: buffer,
        size: buffer.length,
        stream: data.file,
        destination: '',
        filename: data.filename,
        path: ''
      };

      // Parse tags from fields if provided
      let tags: string[] = [];
      if (data.fields) {
        const tagsField = (data.fields as any).tags;
        if (tagsField && tagsField.value) {
          try {
            tags = typeof tagsField.value === 'string' ? JSON.parse(tagsField.value) : tagsField.value;
          } catch (e) {
            tags = tagsField.value.split(',').map((tag: string) => tag.trim());
          }
        }
      }

      console.log(`📁 API: Uploading file: ${data.filename}`);
      const result = await ragSystem.uploadFile(fileObj, tags);

      const response = {
        success: true,
        message: `Successfully uploaded and processed: ${data.filename}`,
        data: {
          document: {
            id: result.document.id,
            fileName: result.document.metadata.source,
            fileSize: fileObj.size,
            fileType: fileObj.mimetype,
            source: result.document.metadata.source,
            tags: result.document.metadata.tags,
            timestamp: result.document.metadata.timestamp
          },
          fileUrl: result.fileUrl,
          contentPreview: result.document.content.substring(0, 200) + '...'
        }
      } as ApiResponse;

      // Pretty print the upload response to console
      console.log('📁 Upload Response:');
      console.log(JSON.stringify(response, null, 2));

      return response;

    } catch (error: any) {
      fastify.log.error('Error uploading file:', error);
      reply.code(500);
      return {
        success: false,
        error: error.message
      } as ApiResponse;
    }
  });

  // View all documents endpoint
  fastify.get('/view', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      if (!ragSystem) {
        reply.code(500);
        return {
          success: false,
          error: 'RAG system not initialized'
        } as ApiResponse;
      }

      console.log('📄 API: Fetching all documents...');
      const documents = await ragSystem.getAllDocuments();

      // Clean format with better structure and all attributes
      const formattedDocs = documents.map(doc => ({
        document_name: doc.file_name,
        document_id: doc.id,
        tags: doc.tags,
        file_info: {
          size_kb: parseFloat((doc.file_size / 1024).toFixed(1)),
          size_mb: parseFloat((doc.file_size / 1024 / 1024).toFixed(2)),
          type: doc.file_type,
          source: doc.source
        },
        content_info: {
          length: doc.content.length,
          preview: doc.content.substring(0, 100) + (doc.content.length > 100 ? '...' : '')
        },
        timestamps: {
          created_at: doc.created_at,
          updated_at: doc.updated_at
        },
        storage_path: doc.storage_path
      }));

      const totalSize = documents.reduce((sum, doc) => sum + doc.file_size, 0);
      
      const response = {
        success: true,
        message: `Found ${documents.length} documents`,
        data: {
          summary: {
            total_documents: documents.length,
            total_size_kb: parseFloat((totalSize / 1024).toFixed(1)),
            total_size_mb: parseFloat((totalSize / 1024 / 1024).toFixed(2)),
            file_types: [...new Set(documents.map(doc => doc.file_type))],
            all_tags: [...new Set(documents.flatMap(doc => doc.tags))]
          },
          documents: formattedDocs
        }
      } as ApiResponse;

      // Pretty print the response to console
      console.log('📄 API Response:');
      console.log(JSON.stringify(response, null, 2));

      return response;

    } catch (error: any) {
      fastify.log.error('Error fetching documents:', error);
      reply.code(500);
      return {
        success: false,
        error: error.message
      } as ApiResponse;
    }
  });

  // Get single document by ID
  fastify.get<{ Params: RouteParams }>('/view/:id', async (request: FastifyRequest<{ Params: RouteParams }>, reply: FastifyReply) => {
    try {
      if (!ragSystem) {
        reply.code(500);
        return {
          success: false,
          error: 'RAG system not initialized'
        } as ApiResponse;
      }

      const { id } = request.params;
      const documents = await ragSystem.getAllDocuments();
      const document = documents.find(doc => doc.id === id);

      if (!document) {
        reply.code(404);
        return {
          success: false,
          error: 'Document not found'
        } as ApiResponse;
      }

      return {
        success: true,
        data: {
          id: document.id,
          fileName: document.file_name,
          fileSize: document.file_size,
          fileSizeMB: (document.file_size / 1024 / 1024).toFixed(2),
          fileType: document.file_type,
          source: document.source,
          tags: document.tags,
          content: document.content,
          createdAt: document.created_at,
          updatedAt: document.updated_at,
          storagePath: document.storage_path
        }
      } as ApiResponse;

    } catch (error: any) {
      fastify.log.error('Error fetching document:', error);
      reply.code(500);
      return {
        success: false,
        error: error.message
      } as ApiResponse;
    }
  });

  // Add documents endpoint (backward compatibility)
  fastify.post<{ Body: DocumentRequest }>('/documents', {
    schema: {
      body: {
        type: 'object',
        required: ['documents'],
        properties: {
          documents: {
            type: 'array',
            items: {
              type: 'object',
              required: ['id', 'content', 'metadata'],
              properties: {
                id: { type: 'string' },
                content: { type: 'string' },
                metadata: {
                  type: 'object',
                  required: ['source'],
                  properties: {
                    source: { type: 'string' },
                    tags: {
                      type: 'array',
                      items: { type: 'string' }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: DocumentRequest }>, reply: FastifyReply) => {
    try {
      if (!ragSystem) {
        reply.code(500);
        return {
          success: false,
          error: 'RAG system not initialized'
        } as ApiResponse;
      }

      const { documents } = request.body;

      // Transform documents to match internal format
      const formattedDocs = documents.map(doc => ({
        id: doc.id,
        content: doc.content,
        metadata: {
          id: doc.id,
          source: doc.metadata.source,
          timestamp: new Date(),
          tags: doc.metadata.tags || []
        }
      }));

      console.log(`📄 API: Adding ${documents.length} documents...`);
      await ragSystem.addDocuments(formattedDocs);

      return {
        success: true,
        message: `Successfully added ${documents.length} documents`,
        data: {
          documentsAdded: documents.length,
          totalDocuments: ragSystem.getStats().totalDocuments
        }
      } as ApiResponse;

    } catch (error: any) {
      fastify.log.error('Error adding documents:', error);
      reply.code(500);
      return {
        success: false,
        error: error.message
      } as ApiResponse;
    }
  });

  // Enhanced RAG query with document selection
  fastify.post<{ Body: EnhancedQueryRequest }>('/query', {
    schema: {
      body: {
        type: 'object',
        required: ['prompt'],
        properties: {
          prompt: { type: 'string', minLength: 1 },
          documentIds: { 
            type: 'array', 
            items: { type: 'string' },
            description: 'Specific document IDs to query against'
          },
          documentNames: { 
            type: 'array', 
            items: { type: 'string' },
            description: 'Specific document names to query against'
          },
          tags: { 
            type: 'array', 
            items: { type: 'string' },
            description: 'Query documents with specific tags'
          },
          useAllDocuments: { 
            type: 'boolean', 
            default: false,
            description: 'Use all available documents for context'
          },
          userResponse: {
            type: 'string',
            description: 'User response or feedback to include in the formatted response'
          }
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: EnhancedQueryRequest }>, reply: FastifyReply) => {
    try {
      if (!mastraRagSystem || !ragSystem) {
        reply.code(500);
        return {
          success: false,
          error: 'RAG systems not initialized'
        } as ApiResponse;
      }

      const { prompt, documentIds, documentNames, tags, useAllDocuments, userResponse } = request.body;

      // Step 1: Get available documents and filter based on selection criteria
      let selectedDocuments: any[] = [];
      let selectionCriteria: string[] = [];

      if (documentIds && documentIds.length > 0) {
        const allDocs = await ragSystem.getAllDocuments();
        selectedDocuments = allDocs.filter(doc => documentIds.includes(doc.id));
        selectionCriteria.push(`Document IDs: ${documentIds.join(', ')}`);
      }

      if (documentNames && documentNames.length > 0) {
        const allDocs = await ragSystem.getAllDocuments();
        const nameSelected = allDocs.filter(doc => 
          documentNames.some(name => 
            doc.file_name.toLowerCase().includes(name.toLowerCase()) ||
            doc.source.toLowerCase().includes(name.toLowerCase())
          )
        );
        selectedDocuments = selectedDocuments.length > 0 
          ? selectedDocuments.filter(doc => nameSelected.some(ns => ns.id === doc.id))
          : nameSelected;
        selectionCriteria.push(`Document Names: ${documentNames.join(', ')}`);
      }

      if (tags && tags.length > 0) {
        const allDocs = await ragSystem.getAllDocuments();
        const tagSelected = allDocs.filter(doc => 
          tags.some(tag => doc.tags.includes(tag))
        );
        selectedDocuments = selectedDocuments.length > 0 
          ? selectedDocuments.filter(doc => tagSelected.some(ts => ts.id === doc.id))
          : tagSelected;
        selectionCriteria.push(`Tags: ${tags.join(', ')}`);
      }

      if (useAllDocuments || (selectedDocuments.length === 0 && !documentIds && !documentNames && !tags)) {
        selectedDocuments = await ragSystem.getAllDocuments();
        selectionCriteria.push('All available documents');
      }

      console.log(`🔍 API: Enhanced query with document selection:`);
      console.log(`   Query: "${prompt}"`);
      console.log(`   Selection criteria: ${selectionCriteria.join(' | ')}`);
      console.log(`   Selected documents: ${selectedDocuments.length}`);

      // Step 2: Create context from selected documents for the AI
      const documentContext = selectedDocuments.map(doc => ({
        id: doc.id,
        name: doc.file_name,
        source: doc.source,
        content: doc.content.substring(0, 1000), // First 1000 chars for context
        tags: doc.tags,
        size: doc.file_size
      }));

      // Step 3: Enhanced prompt with document context and user response formatting
      let enhancedPrompt: string;
      
      if (selectedDocuments.length > 0) {
        enhancedPrompt = `Document Data:
${documentContext.map(doc => `${doc.name}:\n${doc.content}`).join('\n\n')}

Question: ${prompt}

${userResponse ? `Output Format: ${userResponse}

` : ''}Answer directly using the data above.${userResponse ? ' Use the exact format requested.' : ''} Do not ask follow-up questions or provide explanations beyond answering the question.`;
      } else {
        enhancedPrompt = userResponse 
          ? `Question: ${prompt}

Output Format: ${userResponse}

Provide a direct answer in the requested format.`
          : prompt;
      }

      // Step 4: Process query with Mastra.ai
      const result = await mastraRagSystem.query(enhancedPrompt);

      return {
        success: true,
        data: {
          prompt: prompt,
          userResponse: userResponse || null,
          response: result.response,
          confidence: result.confidence,
          processingTime: result.processingTime,
          
          // Document selection details
          documentSelection: {
            criteria: selectionCriteria,
            selectedCount: selectedDocuments.length,
            selectedDocuments: documentContext.map(doc => ({
              id: doc.id,
              name: doc.name,
              source: doc.source,
              tags: doc.tags,
              contentLength: doc.content.length,
              preview: doc.content.substring(0, 100) + '...'
            }))
          },
          
          recommendations: result.recommendations || [],
          responseFormatting: userResponse ? 'Response formatted considering user feedback' : 'Standard response format',
          system: 'Enhanced Mastra.ai + SambaNova + Supabase with Document Selection',
          features: ['Document Selection', 'Enhanced Rate Limiting', 'Recommendation Engine', 'RAG Workflow', 'User Response Formatting']
        }
      } as ApiResponse;

    } catch (error: any) {
      fastify.log.error('Error processing enhanced query:', error);
      reply.code(500);
      return {
        success: false,
        error: error.message
      } as ApiResponse;
    }
  });

  // List documents for selection (lightweight version for query planning)
  fastify.get('/documents', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      if (!ragSystem) {
        reply.code(500);
        return {
          success: false,
          error: 'RAG system not initialized'
        } as ApiResponse;
      }

      const documents = await ragSystem.getAllDocuments();

      // Lightweight document list for selection purposes
      const documentList = documents.map(doc => ({
        id: doc.id,
        name: doc.file_name,
        source: doc.source,
        tags: doc.tags,
        size: `${(doc.file_size / 1024).toFixed(1)} KB`,
        type: doc.file_type,
        contentPreview: doc.content.substring(0, 150) + '...',
        createdAt: doc.created_at
      }));

      return {
        success: true,
        message: `${documents.length} documents available for selection`,
        data: {
          totalDocuments: documents.length,
          documents: documentList,
          availableTags: [...new Set(documents.flatMap(doc => doc.tags))],
          fileTypes: [...new Set(documents.map(doc => doc.file_type))],
          usage: {
            byId: 'Use "documentIds" array with specific document IDs',
            byName: 'Use "documentNames" array with document names (partial match)',
            byTags: 'Use "tags" array to filter by document tags',
            all: 'Use "useAllDocuments": true to include all documents'
          }
        }
      } as ApiResponse;

    } catch (error: any) {
      fastify.log.error('Error fetching documents list:', error);
      reply.code(500);
      return {
        success: false,
        error: error.message
      } as ApiResponse;
    }
  });

  // Delete document endpoint
  fastify.delete<{ Params: RouteParams }>('/documents/:id', async (request: FastifyRequest<{ Params: RouteParams }>, reply: FastifyReply) => {
    try {
      if (!ragSystem) {
        reply.code(500);
        return {
          success: false,
          error: 'RAG system not initialized'
        } as ApiResponse;
      }

      const { id } = request.params;
      const success = await ragSystem.deleteDocument(id);

      if (success) {
        return {
          success: true,
          message: `Document ${id} deleted successfully`
        } as ApiResponse;
      } else {
        reply.code(404);
        return {
          success: false,
          error: 'Document not found'
        } as ApiResponse;
      }

    } catch (error: any) {
      fastify.log.error('Error deleting document:', error);
      reply.code(500);
      return {
        success: false,
        error: error.message
      } as ApiResponse;
    }
  });

  // Clear all documents (useful for testing)
  fastify.delete('/documents', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      if (!ragSystem) {
        reply.code(500);
        return {
          success: false,
          error: 'RAG system not initialized'
        } as ApiResponse;
      }

      await ragSystem.clearDocuments();
      
      return {
        success: true,
        message: 'All documents cleared successfully'
      } as ApiResponse;

    } catch (error: any) {
      fastify.log.error('Error clearing documents:', error);
      reply.code(500);
      return {
        success: false,
        error: error.message
      } as ApiResponse;
    }
  });

  // Global error handler
  fastify.setErrorHandler(async (error, request, reply) => {
    fastify.log.error(error);
    
    // Handle multipart errors
    if (error.code === 'FST_REQ_FILE_TOO_LARGE') {
      reply.code(400);
      return {
        success: false,
        error: 'File too large. Maximum size is 10MB.'
      } as ApiResponse;
    }

    // Handle validation errors
    if (error.validation) {
      reply.code(400);
      return {
        success: false,
        error: 'Validation error: ' + error.message
      } as ApiResponse;
    }

    // Handle rate limiting
    if (error.statusCode === 429) {
      reply.code(429);
      return {
        success: false,
        error: 'Too many requests. Please try again later.'
      } as ApiResponse;
    }

    reply.code(500);
    return {
      success: false,
      error: 'Internal server error'
    } as ApiResponse;
  });

  // 404 handler
  fastify.setNotFoundHandler(async (request, reply) => {
    reply.code(404);
    return {
      success: false,
      error: 'Endpoint not found'
    } as ApiResponse;
  });

  return fastify;
}

// Start server function
async function startServer() {
  const PORT = CONFIG.ENV.PORT;
  
  try {
    console.log('🚀 Starting SambaNova RAG API Server with Supabase (Fastify)...\n');
    
    // Initialize RAG system
    await initializeRAGSystem();
    
    // Build Fastify app
    const fastify = await buildApp();
    
    // Start listening
    const serverConfig = getServerConfig();
    await fastify.listen({ 
      port: serverConfig.port, 
      host: serverConfig.host 
    });
    
    console.log(`\n🌟 SambaNova RAG API Server running on http://localhost:${PORT}`);
    console.log('\n📚 Available endpoints:');
    console.log('  GET  /health                    - Health check');
    console.log('  GET  /stats                     - System statistics');
    console.log('  POST /upload                    - Upload files to Supabase');
    console.log('  GET  /documents                 - List documents for selection');
    console.log('  GET  /view                      - View all documents (detailed)');
    console.log('  GET  /view/:id                  - View single document');
    console.log('  POST /documents                 - Add documents (JSON)');
    console.log('  POST /query                     - Enhanced RAG query with document selection');
    console.log('  DELETE /documents/:id           - Delete single document');
    console.log('  DELETE /documents               - Clear all documents');
    console.log('\n🔑 Environment variables required:');
    console.log('  - SAMBANOVA_API_KEY');
    console.log('  - SUPABASE_DATABASE_URL');
    console.log('  - SUPABASE_SERVICE_ROLE_KEY');
    console.log('\n💾 Storage: Supabase (financial-doc-bucket)');
    console.log('⚡ Framework: Fastify (3x faster than Express)');
    console.log('⏱️  API includes automatic rate limiting for SambaNova');

    return fastify;

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
async function gracefulShutdown(fastify: FastifyInstance) {
  console.log('\n👋 Shutting down SambaNova RAG API Server...');
  await fastify.close();
  process.exit(0);
}

// Start the server
if (require.main === module) {
  startServer().then((fastify) => {
    if (fastify) {
      process.on('SIGINT', () => gracefulShutdown(fastify));
      process.on('SIGTERM', () => gracefulShutdown(fastify));
    }
  });
}

export { buildApp, startServer }; 