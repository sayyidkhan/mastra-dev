# 📚 SambaNova RAG API Reference

> **Base URL:** `https://hf3ifrfjgk.us-west-2.awsapprunner.com`

## 📂 API Endpoints Directory

```
🏠 https://hf3ifrfjgk.us-west-2.awsapprunner.com/
├── 🔍 GET    /health                 - Health check & system status
├── 📊 GET    /stats                  - System statistics & document counts
├── 📤 POST   /upload                 - Upload files (CSV, PDF, TXT, etc.)
├── 📄 GET    /documents              - List available documents
├── 📋 GET    /view                   - View all documents (detailed)
├── 📄 GET    /view/:id               - View single document details
├── 🤖 POST   /query                  - **AI Query - Ask questions about data**
├── 🗑️  DELETE /documents/:id          - Delete specific document  
└── 🗑️  DELETE /documents              - Clear all documents
```

### 🎯 Most Important Endpoints
```
📤 POST /upload     → Add your data files
🤖 POST /query      → Ask AI questions about your data  
📄 GET  /documents  → See what data is available
```

## 🚀 Quick Start

1. **Upload documents** → 2. **Query your data** → 3. **Get AI responses**

```bash
# 1. Upload a document
curl -X POST https://your-url.com/upload -F "file=@data.csv"

# 2. Ask a question
curl -X POST https://your-url.com/query \
  -H "Content-Type: application/json" \
  -d '{"prompt": "What insights can you provide from the data?"}'
```

## 📋 API Endpoints

### 🔍 System Health

#### `GET /health`
Check if the API is running.

```bash
curl https://your-url.com/health
```

**Response:**
```json
{
  "success": true,
  "message": "SambaNova RAG API with Mastra.ai + Supabase (Fastify)",
  "timestamp": "2025-06-18T12:00:00.000Z",
  "systems": {
    "supabase_rag": true,
    "mastra_rag": true
  }
}
```

---

### 📊 System Statistics

#### `GET /stats`
Get system statistics and document counts.

```bash
curl https://your-url.com/stats
```

**Response:**
```json
{
  "success": true,
  "data": {
    "supabase_system": {
      "documentCount": 4,
      "totalSizeMB": "2.1",
      "fileTypes": ["application/octet-stream"]
    },
    "mastra_system": {
      "requestCount": 15,
      "lastRequestTime": "2025-06-18T12:00:00.000Z"
    }
  }
}
```

---

### 📤 Upload Documents

#### `POST /upload`
Upload files (CSV, PDF, TXT, MD, DOC, DOCX) to the system.

```bash
curl -X POST https://your-url.com/upload \
  -F "file=@restaurant-data.csv" \
  -F "tags=[\"financial\", \"restaurant\", \"2024\"]"
```

**Parameters:**
- `file` (required): File to upload (max 10MB)
- `tags` (optional): JSON array of tags for the document

**Response:**
```json
{
  "success": true,
  "message": "Successfully uploaded and processed: restaurant-data.csv",
  "data": {
    "document": {
      "id": "abc123-def456-ghi789",
      "fileName": "restaurant-data.csv",
      "fileSize": 1024,
      "tags": ["financial", "restaurant", "2024"],
      "timestamp": "2025-06-18T12:00:00.000Z"
    },
    "fileUrl": "https://storage-url...",
    "contentPreview": "CSV Document with headers: Company, Revenue..."
  }
}
```

---

### 📄 List Documents

#### `GET /documents`
Get a list of all uploaded documents for selection.

```bash
curl https://your-url.com/documents
```

**Response:**
```json
{
  "success": true,
  "message": "4 documents available for selection",
  "data": {
    "totalDocuments": 4,
    "documents": [
      {
        "id": "abc123-def456-ghi789",
        "name": "Restaurant A - Income Statement.csv",
        "tags": ["financial", "restaurant-a", "income-statement"],
        "size": "0.6 KB",
        "contentPreview": "CSV data with financial metrics...",
        "createdAt": "2025-06-18T12:00:00.000Z"
      }
    ],
    "availableTags": ["financial", "restaurant-a", "restaurant-b"],
    "usage": {
      "byId": "Use 'documentIds' array with specific document IDs",
      "byName": "Use 'documentNames' array with document names",
      "byTags": "Use 'tags' array to filter by document tags",
      "all": "Use 'useAllDocuments': true to include all documents"
    }
  }
}
```

---

### 🤖 Query with AI

#### `POST /query`
Ask questions about your uploaded documents using AI.

**Basic Query:**
```bash
curl -X POST https://your-url.com/query \
  -H "Content-Type: application/json" \
  -d '{"prompt": "What are the key financial insights?"}'
```

**Query Specific Documents:**
```bash
# By document IDs
curl -X POST https://your-url.com/query \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Compare Restaurant A vs Restaurant B revenue",
    "documentIds": ["abc123", "def456"]
  }'

# By tags
curl -X POST https://your-url.com/query \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Analyze income statements",
    "tags": ["income-statement"]
  }'

# All documents
curl -X POST https://your-url.com/query \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Give me an overview of all financial data",
    "useAllDocuments": true
  }'

# With user response formatting
curl -X POST https://your-url.com/query \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Which company has the highest revenue per employee?",
    "documentNames": ["sample-financial-data"],
    "userResponse": "I need this information for a board presentation, please format it professionally with key metrics highlighted"
  }'
```

**Request Body:**
```json
{
  "prompt": "Your question here",                    // Required
  "documentIds": ["id1", "id2"],                    // Optional: specific documents
  "documentNames": ["restaurant-data"],             // Optional: by name (partial match)
  "tags": ["financial", "2024"],                    // Optional: by tags
  "useAllDocuments": true,                          // Optional: use all documents
  "userResponse": "user feedback here"              // Optional: user response for formatting
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "prompt": "What are the key financial insights?",
    "userResponse": "I need this for a board presentation, please format professionally",
    "response": "**Executive Summary: Key Financial Insights**\n\n📊 **Performance Highlights:**\n- Restaurant A shows higher profitability with a 15% profit margin compared to Restaurant B's 12%\n- Revenue growth indicates strong market position...\n\n*Formatted for board presentation as requested*",
    "documentSelection": {
      "criteria": ["All documents"],
      "selectedCount": 4,
      "selectedDocuments": [
        {
          "id": "abc123",
          "name": "Restaurant A - Income Statement.csv",
          "contentLength": 576
        }
      ]
    },
    "processingTime": "2.1s",
    "responseFormatting": "Response formatted considering user feedback",
    "system": "Enhanced Mastra.ai + SambaNova + Supabase"
  }
}
```

---

### 🗑️ Delete Documents

#### `DELETE /documents/:id`
Delete a specific document.

```bash
curl -X DELETE https://your-url.com/documents/abc123-def456-ghi789
```

#### `DELETE /documents`
Delete all documents.

```bash
curl -X DELETE https://your-url.com/documents
```

**Response:**
```json
{
  "success": true,
  "message": "All documents cleared successfully"
}
```

---

## 📝 Request Examples

### Upload Financial Data
```bash
curl -X POST https://your-url.com/upload \
  -F "file=@financial-report.csv" \
  -F "tags=[\"quarterly\", \"2024\", \"revenue\"]"
```

### Analyze Financial Performance
```bash
curl -X POST https://your-url.com/query \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Which restaurant has better profit margins and why?",
    "tags": ["financial"]
  }'
```

### Get System Overview
```bash
curl https://your-url.com/health && curl https://your-url.com/stats
```

---

## ⚠️ Error Responses

All endpoints return errors in this format:
```json
{
  "success": false,
  "error": "Error message here"
}
```

**Common HTTP Status Codes:**
- `400` - Bad Request (invalid parameters)
- `404` - Not Found (document or endpoint)
- `413` - File Too Large (>10MB)
- `429` - Too Many Requests (rate limited)
- `500` - Internal Server Error

---

## 🎯 Rate Limiting

- **8-second delays** between AI requests
- **Maximum 5 requests per minute**
- Built-in rate limiting for optimal API performance

---

## 💡 Tips

1. **Tag your documents** for easier querying
2. **Use specific prompts** for better AI responses
3. **Check document list** before querying to see what's available
4. **CSV files work best** for data analysis
5. **Keep files under 10MB** for optimal performance

---

## 🎯 UserResponse Examples

The `userResponse` field allows you to specify how you want the AI to format its response. Here are practical examples:

### JSON Object Response
```bash
curl -X POST https://your-url.com/query \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "What are the revenue figures for both restaurants?",
    "tags": ["financial"],
    "userResponse": "Please return the data as a JSON object with restaurant names as keys and their revenue, profit margin, and growth rate as values. Include a summary object with totals."
  }'
```

**Expected Response Format:**
```json
{
  "restaurants": {
    "Restaurant A": {
      "revenue": "$2,500,000",
      "profit_margin": "15%",
      "growth_rate": "8.5%"
    },
    "Restaurant B": {
      "revenue": "$1,800,000", 
      "profit_margin": "12%",
      "growth_rate": "6.2%"
    }
  },
  "summary": {
    "total_revenue": "$4,300,000",
    "average_profit_margin": "13.5%",
    "industry_performance": "Above average"
  }
}
```

### Table Format Response
```bash
curl -X POST https://your-url.com/query \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Compare the financial performance of both restaurants",
    "useAllDocuments": true,
    "userResponse": "Format as a markdown table with columns: Restaurant, Revenue, Expenses, Profit, Margin%. Add a summary row at the bottom."
  }'
```

### Executive Summary Format
```bash
curl -X POST https://your-url.com/query \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "What are the key insights from the financial data?",
    "tags": ["financial"],
    "userResponse": "I need this for a board presentation. Format as: 1) Executive Summary (3 bullet points), 2) Key Metrics (in a box format), 3) Recommendations (numbered list), 4) Risk Assessment (brief paragraph). Use professional business language."
  }'
```

### Structured Data Format
```bash
curl -X POST https://your-url.com/query \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Extract all expense categories and amounts",
    "documentNames": ["Restaurant A - Income Statement"],
    "userResponse": "Return as a structured JSON with categories as keys and objects containing amount, percentage_of_revenue, and year_over_year_change. Also include metadata about the analysis."
  }'
```

### Quick Dashboard Format
```bash
curl -X POST https://your-url.com/query \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Give me a financial overview of both restaurants",
    "useAllDocuments": true,
    "userResponse": "Format like a dashboard with emoji indicators: 📈 for growth, 📉 for decline, ⚠️ for concerns, ✅ for good performance. Include 5 key metrics with status indicators."
  }'
```

### API-Ready JSON Response
```bash
curl -X POST https://your-url.com/query \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "What are the main financial KPIs for each restaurant?",
    "tags": ["financial"],
    "userResponse": "Return as a clean JSON object suitable for API consumption with: restaurant_id, name, kpis array (each with metric_name, value, unit, trend), last_updated timestamp, and data_quality_score."
  }'
```

**Example API-Ready Response:**
```json
{
  "financial_summary": {
    "analysis_date": "2024-01-15",
    "restaurants": [
      {
        "restaurant_id": "rest_a",
        "name": "Restaurant A",
        "kpis": [
          {
            "metric_name": "revenue",
            "value": 2500000,
            "unit": "USD",
            "trend": "increasing"
          },
          {
            "metric_name": "profit_margin",
            "value": 15.0,
            "unit": "percentage", 
            "trend": "stable"
          }
        ],
        "data_quality_score": 0.95
      }
    ],
    "comparative_analysis": {
      "market_leader": "Restaurant A",
      "total_market_size": 4300000,
      "competitive_gap": "28.9%"
    }
  }
}
``` 