# 🧠 SambaNova RAG API with Fastify & Supabase

A high-performance RAG (Retrieval-Augmented Generation) API built with Fastify and Supabase, powered by SambaNova's AI models.

## 🚀 Features

- **High Performance**: Built with Fastify (3x faster than Express)
- **File Upload**: Support for PDF, CSV, TXT, MD, DOC, DOCX files
- **Vector Storage**: Persistent storage with Supabase PostgreSQL + pgvector
- **AI-Powered**: Uses SambaNova's DeepSeek-V3 for text generation and E5-Mistral for embeddings
- **Rate Limited**: Smart rate limiting for SambaNova API compliance
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

#### Query the RAG System
```bash
curl -X POST http://localhost:3000/query \
  -H "Content-Type: application/json" \
  -d '{"prompt": "What are the key financial metrics?"}'
```

#### Get System Stats
```bash
curl http://localhost:3000/stats
```

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────┐    ┌─────────────────┐
│   Fastify API   │ ──▶│   Supabase   │ ──▶│   SambaNova     │
│                 │    │              │    │                 │
│ • File Upload   │    │ • PostgreSQL │    │ • DeepSeek-V3   │
│ • REST Routes   │    │ • pgvector   │    │ • E5-Mistral    │
│ • Rate Limiting │    │ • Storage    │    │ • Embeddings    │
└─────────────────┘    └──────────────┘    └─────────────────┘
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
   - The system includes automatic 8-second delays
   - Check your API key and quota

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
