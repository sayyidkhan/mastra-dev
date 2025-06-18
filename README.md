# 🧠 SambaNova RAG API with Mastra.ai, Fastify & Supabase

A high-performance RAG (Retrieval-Augmented Generation) API built with Mastra.ai workflows, Fastify and Supabase, powered by SambaNova's AI models.

## 🚀 Features

- **High Performance**: Built with Fastify (3x faster than Express)
- **Mastra.ai Integration**: Advanced RAG workflows with intelligent recommendation engine
- **File Upload**: Support for PDF, CSV, TXT, MD, DOC, DOCX files
- **Vector Storage**: Persistent storage with Supabase PostgreSQL + pgvector
- **AI-Powered**: Uses SambaNova's DeepSeek-V3 for text generation and OpenAI for embeddings
- **Enhanced Rate Limiting**: Conservative 8-second delays with max 5 requests/minute
- **Smart Recommendations**: AI-generated follow-up questions based on query context
- **Type Safe**: Full TypeScript implementation
- **RESTful API**: Clean REST endpoints for all operations

## 📋 Prerequisites

- Node.js 18+ 
- npm or yarn
- Supabase account and project
- SambaNova API key

## 🛠️ Quick Setup

### 1. Clone and Install
```bash
git clone <your-repo>
cd sambanova-rag-fastify
npm install
```

### 2. Environment Variables
Copy `.env.example` to `.env` and configure:
```bash
cp .env.example .env
```

Fill in your credentials:
```env
SAMBANOVA_API_KEY=your_sambanova_api_key
SUPABASE_DATABASE_URL=your_supabase_database_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
PORT=3000
```

### 3. Setup Supabase Database
Run the SQL setup script in your Supabase SQL editor:
```sql
-- See supabase_setup.sql for the complete schema
```

Or follow the detailed setup in [SUPABASE_SETUP.md](./SUPABASE_SETUP.md)

### 4. Start the Server
```bash
# Development
npm run dev

# Production build
npm run build
npm start
```

## 📚 API Endpoints

### Core Endpoints
```
GET    /health                 - Health check
GET    /stats                  - System statistics
POST   /upload                 - Upload files to Supabase
GET    /view                   - View all documents  
GET    /view/:id               - View single document
POST   /query                  - Query the RAG system
DELETE /documents/:id          - Delete single document
DELETE /documents              - Clear all documents
```

### Example Usage

#### Upload a File
```bash
curl -X POST http://localhost:3000/upload \
  -F "file=@sample-financial-data.csv" \
  -F "tags=[\"financial\", \"2024\"]"
```

#### Query the RAG System (Powered by Mastra.ai)
```bash
curl -X POST http://localhost:3000/query \
  -H "Content-Type: application/json" \
  -d '{"prompt": "What are the key financial metrics?"}'
```

The query endpoint now uses Mastra.ai agents with:
- Enhanced rate limiting (5 requests/min, 8s delays)
- Intelligent recommendation engine
- Tool-based vector search
- Agent-driven RAG workflow

#### Get System Stats
```bash
curl http://localhost:3000/stats
```

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Fastify API   │ ──▶│   Supabase   │ ──▶│   SambaNova     │ ──▶│   Mastra.ai     │
│                 │    │              │    │                 │    │                 │
│ • File Upload   │    │ • PostgreSQL │    │ • DeepSeek-V3   │    │ • RAG Workflow  │
│ • REST Routes   │    │ • pgvector   │    │ • Text Gen      │    │ • Agent Logic   │
│ • Multi-System  │    │ • Storage    │    │ • 8s Delays     │    │ • Orchestration │
└─────────────────┘    └──────────────┘    └─────────────────┘    └─────────────────┘
```

## 🔧 Development

### Available Scripts
```bash
npm run dev          # Start development server
npm run build        # Build for production
npm start           # Start production server
npm run build:watch # Watch mode build
npm run clean       # Clean build directory
npm run type-check  # TypeScript type checking
```

### File Structure
```
src/
├── server.ts                 # Main Fastify server
└── supabase-rag-system.ts   # RAG system with Supabase integration

Database:
├── supabase_setup.sql       # Database schema
├── SUPABASE_SETUP.md       # Setup instructions
└── sample-financial-data.csv # Test data
```

## 🚀 Deployment Options

This serverless-ready application can be deployed to:

- **Vercel Functions** (recommended for Node.js)
- **Google Cloud Run** (most flexible, container-based)
- **Fly.io** (excellent developer experience)
- **Railway** (easiest migration from traditional hosting)

## 📊 Performance

- **3x faster** than Express-based alternatives
- **Smart rate limiting** - 8s delays between SambaNova requests
- **Efficient memory usage** with streaming file uploads
- **Type-safe validation** with JSON schemas

## 🔒 Security Features

- CORS protection with `@fastify/cors`
- Security headers with `@fastify/helmet` 
- Rate limiting with `@fastify/rate-limit`
- File type validation
- Request size limits (10MB)

## 🐛 Troubleshooting

### Common Issues

1. **Port 3000 in use**
   ```bash
   pkill -f "ts-node-dev"
   npm run dev
   ```

2. **Supabase connection errors**
   - Check your database URL and service role key
   - Ensure the documents table exists (run setup SQL)

3. **SambaNova rate limiting**
   - Enhanced Mastra.ai rate limiting: 8-second delays between requests
   - Maximum 5 requests per minute for optimal API compliance
   - Check your API key and quota

## ✅ **Integration Complete & Tested**

🎉 **The `/query` endpoint is now fully working with Mastra.ai orchestration!**

**What's Working:**
- ✅ **Mastra.ai Agent Orchestration**: Full agent-based workflow 
- ✅ **SambaNova LLM Integration**: Custom provider within Mastra framework
- ✅ **Vector Search Tools**: Agent autonomously searches Supabase vectors
- ✅ **Recommendation Engine**: Contextual follow-up questions
- ✅ **Rate Limiting**: 8-second delays, 5 requests/minute
- ✅ **Correct Flow**: Fastify → Supabase → SambaNova → Mastra.ai

**Test Command:**
```bash
curl -X POST http://localhost:3000/query \
  -H "Content-Type: application/json" \
  -d '{"prompt": "What are the key financial metrics?"}'
```

The agent successfully uses tools, searches vectors, and generates intelligent responses!

### Debug Mode
```bash
DEBUG=fastify:* npm run dev
```

## 📝 License

MIT

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

---

**Built with ❤️ using Fastify, Supabase, and SambaNova AI**
