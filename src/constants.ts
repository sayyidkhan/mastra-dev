// Configuration constants for the RAG system
export const CONFIG = {
  // SambaNova API Configuration
  SAMBANOVA: {
    BASE_URL: 'https://api.sambanova.ai/v1',
    MODELS: {
      LLM: 'Mistral-7B-Instruct-v0.3',
      EMBEDDING: 'text-embedding-ada-002'
    }
  },

  // Supabase Configuration
  SUPABASE: {
    BUCKET_NAME: 'financial-doc-bucket',
    TABLES: {
      DOCUMENTS: 'documents'
    },
    FUNCTIONS: {
      MATCH_DOCUMENTS: 'match_documents'
    }
  },

  // Server Configuration
  SERVER: {
    DEFAULT_PORT: 3000,
    HOST: '0.0.0.0',
    BODY_LIMIT: 10485760, // 10MB
    KEEP_ALIVE_TIMEOUT: 65000,
    REQUEST_TIMEOUT: 60000
  },

  // RAG System Configuration
  RAG: {
    MAX_CONTEXT_DOCUMENTS: 3,
    SIMILARITY_THRESHOLD: 0.3,
    EMBEDDING_DIMENSION: 4096,
    RATE_LIMIT_DELAY_MS: 8000, // 8 seconds between requests
    MAX_REQUESTS_PER_MINUTE: 5
  },

  // File Upload Configuration
  UPLOAD: {
    MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
    MAX_FILES: 1,
    ALLOWED_MIME_TYPES: [
      'text/plain',
      'text/markdown',
      'text/csv',
      'application/csv',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/octet-stream'
    ],
    ALLOWED_EXTENSIONS: ['txt', 'md', 'csv', 'pdf', 'doc', 'docx']
  },

  // Rate Limiting Configuration
  RATE_LIMIT: {
    MAX_REQUESTS: 100,
    TIME_WINDOW: '1 minute'
  },

  // Environment Variables (with defaults)
  ENV: {
    get NODE_ENV() { return process.env.NODE_ENV || 'development'; },
    get PORT() { return process.env.PORT || '3000'; },
    get SAMBANOVA_API_KEY() { return process.env.SAMBANOVA_API_KEY || ''; },
    get SUPABASE_DATABASE_URL() { return process.env.SUPABASE_DATABASE_URL || ''; },
    get SUPABASE_SERVICE_ROLE_KEY() { return process.env.SUPABASE_SERVICE_ROLE_KEY || ''; }
  },

  // API Endpoints
  ENDPOINTS: {
    HEALTH: '/health',
    STATS: '/stats',
    UPLOAD: '/upload',
    DOCUMENTS: '/documents',
    VIEW: '/view',
    QUERY: '/query'
  },

  // Response Messages
  MESSAGES: {
    SUCCESS: {
      UPLOAD: 'Successfully uploaded and processed',
      DELETE: 'deleted successfully',
      CLEAR: 'All documents cleared successfully'
    },
    ERROR: {
      RAG_NOT_INITIALIZED: 'RAG system not initialized',
      MASTRA_NOT_INITIALIZED: 'Mastra RAG system not initialized',
      DOCUMENT_NOT_FOUND: 'Document not found',
      FILE_TOO_LARGE: 'File too large. Maximum size is 10MB.',
      NO_FILE_UPLOADED: 'No file uploaded',
      INVALID_FILE_TYPE: 'File type not supported',
      RATE_LIMITED: 'Too many requests. Please try again later.',
      INTERNAL_ERROR: 'Internal server error',
      ENDPOINT_NOT_FOUND: 'Endpoint not found'
    }
  }
};

// Validation function to check required environment variables
export const validateEnvironment = (): { isValid: boolean; missingVars: string[] } => {
  const requiredEnvVars = {
    SAMBANOVA_API_KEY: CONFIG.ENV.SAMBANOVA_API_KEY,
    SUPABASE_DATABASE_URL: CONFIG.ENV.SUPABASE_DATABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: CONFIG.ENV.SUPABASE_SERVICE_ROLE_KEY
  };
  
  const missingVars = Object.entries(requiredEnvVars)
    .filter(([key, value]) => !value || value.trim() === '')
    .map(([key]) => key);
  
  return {
    isValid: missingVars.length === 0,
    missingVars
  };
};

// Helper functions for configuration
export const getServerConfig = () => ({
  port: Number(CONFIG.ENV.PORT),
  host: CONFIG.SERVER.HOST,
  bodyLimit: CONFIG.SERVER.BODY_LIMIT,
  keepAliveTimeout: CONFIG.SERVER.KEEP_ALIVE_TIMEOUT,
  requestTimeout: CONFIG.SERVER.REQUEST_TIMEOUT
});

export const getRagConfig = () => ({
  maxContextDocuments: CONFIG.RAG.MAX_CONTEXT_DOCUMENTS,
  similarityThreshold: CONFIG.RAG.SIMILARITY_THRESHOLD,
  embeddingDimension: CONFIG.RAG.EMBEDDING_DIMENSION,
  rateLimitDelayMs: CONFIG.RAG.RATE_LIMIT_DELAY_MS
});

// API URL builders
export const buildSambaNovaUrl = (endpoint: string): string => {
  return `${CONFIG.SAMBANOVA.BASE_URL}${endpoint}`;
};

// Default export for easy importing
export default CONFIG; 