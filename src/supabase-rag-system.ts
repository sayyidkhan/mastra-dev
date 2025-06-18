import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { CONFIG, buildSambaNovaUrl } from './constants';

config();

interface Document {
  id: string;
  content: string;
  metadata: {
    id: string;
    source: string;
    timestamp: Date;
    tags: string[];
    file_name?: string;
    file_size?: number;
    file_type?: string;
    storage_path?: string;
  };
}

interface SupabaseDocument {
  id: string;
  content: string;
  file_name: string;
  file_size: number;
  file_type: string;
  storage_path: string;
  source: string;
  tags: string[];
  embedding: number[];
  created_at: string;
  updated_at: string;
}

interface RAGConfig {
  maxContextDocuments: number;
  similarityThreshold: number;
  embeddingDimension: number;
  rateLimitDelayMs: number;
}

interface QueryResult {
  response: string;
  context: Document[];
  confidence: number;
  processingTime: string;
}

export class SupabaseRAGSystem {
  private apiKey: string;
  private config: RAGConfig;
  private supabase: SupabaseClient;
  private bucketName: string;
  private documents: Document[] = [];
  private embeddings: any[] = [];
  private lastRequestTime: number = 0;

  constructor(
    apiKey: string, 
    config: RAGConfig,
    supabaseUrl: string,
    supabaseKey: string,
    bucketName: string = CONFIG.SUPABASE.BUCKET_NAME
  ) {
    this.apiKey = apiKey;
    this.config = config;
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.bucketName = bucketName;
  }

  /**
   * Rate limiting for SambaNova API
   */
  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.config.rateLimitDelayMs) {
      const delayNeeded = this.config.rateLimitDelayMs - timeSinceLastRequest;
      console.log(`⏱️  Rate limiting: waiting ${(delayNeeded / 1000).toFixed(1)}s before next request...`);
      await new Promise(resolve => setTimeout(resolve, delayNeeded));
    }
    
    this.lastRequestTime = Date.now();
  }

  /**
   * Get embeddings from SambaNova API
   */
  private async getSambaNovaEmbeddings(texts: string[]): Promise<number[][]> {
    await this.enforceRateLimit();

    const response = await fetch('https://api.sambanova.ai/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'E5-Mistral-7B-Instruct',
        input: texts,
        encoding_format: 'float'
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`SambaNova embeddings error: ${response.status} ${errorData}`);
    }

    const data: any = await response.json();
    return data.data.map((item: any) => item.embedding);
  }

  /**
   * Generate response from SambaNova API
   */
  private async getSambaNovaResponse(prompt: string, context: string): Promise<string> {
    await this.enforceRateLimit();

    const fullPrompt = `Based on the following context, please answer the question:

Context:
${context}

Question: ${prompt}

Please provide a helpful and accurate answer based only on the information provided in the context.`;

    const response = await fetch('https://api.sambanova.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-v3-0324',
        messages: [
          {
            role: 'user',
            content: fullPrompt
          }
        ],
        temperature: 0.1,
        max_tokens: 500
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`SambaNova chat error: ${response.status} ${errorData}`);
    }

    const data: any = await response.json();
    return data.choices[0].message.content;
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    const dotProduct = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0));
    
    if (magnitudeA === 0 || magnitudeB === 0) return 0;
    return dotProduct / (magnitudeA * magnitudeB);
  }

  /**
   * Initialize Supabase storage and database
   */
  async initialize(): Promise<void> {
    try {
      // Load existing documents from Supabase
      await this.loadDocumentsFromSupabase();
      console.log('✅ Supabase RAG system initialized');
    } catch (error: any) {
      console.error('❌ Failed to initialize Supabase RAG system:', error.message);
      throw error;
    }
  }

  /**
   * Load existing documents from Supabase into memory
   */
  private async loadDocumentsFromSupabase(): Promise<void> {
    try {
      const { data: supabaseDocs, error } = await this.supabase
        .from('documents')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('⚠️  Could not load existing documents:', error.message);
        return;
      }

      if (supabaseDocs && supabaseDocs.length > 0) {
        // Convert Supabase documents to internal format
        this.documents = supabaseDocs.map((doc: any) => ({
          id: doc.id,
          content: doc.content,
          metadata: {
            id: doc.id,
            source: doc.source,
            timestamp: new Date(doc.created_at),
            tags: doc.tags || [],
            file_name: doc.file_name,
            file_size: doc.file_size,
            file_type: doc.file_type,
            storage_path: doc.storage_path
          }
        }));

        this.embeddings = supabaseDocs.map((doc: any) => ({
          text: doc.content,
          embedding: doc.embedding,
          metadata: {
            id: doc.id,
            source: doc.source,
            timestamp: new Date(doc.created_at),
            tags: doc.tags || [],
            file_name: doc.file_name,
            file_size: doc.file_size,
            file_type: doc.file_type,
            storage_path: doc.storage_path
          }
        }));

        console.log(`📂 Loaded ${this.documents.length} documents from Supabase`);
      }
    } catch (error: any) {
      console.warn('⚠️  Error loading documents from Supabase:', error.message);
    }
  }

  /**
   * Upload file to Supabase storage and extract content
   */
  async uploadFile(file: any, tags: string[] = []): Promise<{ document: Document; fileUrl: string }> {
    try {
      const fileName = `${Date.now()}-${file.originalname}`;
      const filePath = `documents/${fileName}`;

      // Upload file to Supabase storage
      const { data: uploadData, error: uploadError } = await this.supabase.storage
        .from(this.bucketName)
        .upload(filePath, file.buffer, {
          contentType: file.mimetype,
          duplex: 'half'
        });

      if (uploadError) {
        throw new Error(`File upload failed: ${uploadError.message}`);
      }

      // Get public URL
      const { data: urlData } = this.supabase.storage
        .from(this.bucketName)
        .getPublicUrl(filePath);

      const fileUrl = urlData.publicUrl;

      // Extract text content from file
      let content = '';
      
      // Get file extension for better type detection
      const filename = file.originalname || '';
      const extension = filename.toLowerCase().split('.').pop();
      
      if (file.mimetype === 'text/plain' || file.mimetype === 'text/markdown') {
        content = file.buffer.toString('utf-8');
      } else if (file.mimetype === 'text/csv' || file.mimetype === 'application/csv' || extension === 'csv') {
        // Parse CSV content - include FULL content for RAG
        const csvContent = file.buffer.toString('utf-8');
        const lines = csvContent.split('\n').filter((line: string) => line.trim());
        const headers = lines[0]?.split(',') || [];
        
        content = `CSV Document: ${file.originalname}\n\n`;
        content += `This is a CSV file with the following structure:\n`;
        content += `Headers: ${headers.join(', ')}\n`;
        content += `Total Rows: ${lines.length - 1} data rows\n\n`;
        content += `COMPLETE CSV DATA:\n${csvContent}\n\n`;
        content += `This CSV contains financial data that can be analyzed for questions about companies, revenue, profit, employees, industries, etc.`;
      } else if (file.mimetype === 'application/pdf') {
        // For PDF parsing
        const pdfParse = require('pdf-parse');
        const pdfData = await pdfParse(file.buffer);
        content = pdfData.text;
      } else if (extension === 'csv' || filename.toLowerCase().includes('csv')) {
        // Fallback for CSV files that aren't detected properly
        const csvContent = file.buffer.toString('utf-8');
        const lines = csvContent.split('\n').filter((line: string) => line.trim());
        const headers = lines[0]?.split(',') || [];
        
        content = `CSV Document: ${file.originalname}\n\n`;
        content += `This is a CSV file with the following structure:\n`;
        content += `Headers: ${headers.join(', ')}\n`;
        content += `Total Rows: ${lines.length - 1} data rows\n\n`;
        content += `COMPLETE CSV DATA:\n${csvContent}\n\n`;
        content += `This CSV contains financial data that can be analyzed for questions about companies, revenue, profit, employees, industries, etc.`;
      } else {
        content = `Document: ${file.originalname}\nFile Type: ${file.mimetype}\nSize: ${file.size} bytes`;
      }

      // Create document object (let Supabase generate the UUID)
      const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const document: Document = {
        id: tempId, // Temporary ID, will be replaced with UUID from database
        content,
        metadata: {
          id: tempId,
          source: file.originalname,
          timestamp: new Date(),
          tags,
          file_name: file.originalname,
          file_size: file.size,
          file_type: file.mimetype,
          storage_path: filePath
        }
      };

      // Generate embedding
      const texts = [content];
      const embeddings = await this.getSambaNovaEmbeddings(texts);
      const embedding = embeddings[0];

      // Save to Supabase database (let Supabase generate UUID)
      const { data: insertedData, error: dbError } = await this.supabase
        .from('documents')
        .insert({
          content: document.content,
          file_name: file.originalname,
          file_size: file.size,
          file_type: file.mimetype,
          storage_path: filePath,
          source: file.originalname,
          tags,
          embedding,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (dbError) {
        throw new Error(`Database insert failed: ${dbError.message}`);
      }

      // Update document with the actual UUID from database
      document.id = insertedData.id;
      document.metadata.id = insertedData.id;

      // Add to memory for immediate access
      this.documents.push(document);
      this.embeddings.push({
        text: content,
        embedding,
        metadata: document.metadata
      });

      console.log(`✅ Successfully uploaded and processed: ${file.originalname}`);
      return { document, fileUrl };

    } catch (error: any) {
      console.error('❌ Error uploading file:', error);
      throw error;
    }
  }

  /**
   * Add documents to the system
   */
  async addDocuments(documents: Document[]): Promise<void> {
    try {
      const texts = documents.map(doc => doc.content);
      const embeddings = await this.getSambaNovaEmbeddings(texts);

      // Save to Supabase (let Supabase generate UUIDs)
      const supabaseRecords = documents.map((doc, index) => ({
        content: doc.content,
        file_name: doc.metadata.source,
        file_size: 0,
        file_type: 'text/plain',
        storage_path: '',
        source: doc.metadata.source,
        tags: doc.metadata.tags,
        embedding: embeddings[index],
        created_at: doc.metadata.timestamp.toISOString(),
        updated_at: doc.metadata.timestamp.toISOString()
      }));

      const { data: insertedData, error } = await this.supabase
        .from('documents')
        .insert(supabaseRecords)
        .select();

      if (error) {
        throw new Error(`Database insert failed: ${error.message}`);
      }

      // Update document IDs with the actual UUIDs from database
      if (insertedData) {
        documents.forEach((doc, index) => {
          doc.id = insertedData[index].id;
          doc.metadata.id = insertedData[index].id;
        });
      }

      // Add to memory
      this.documents.push(...documents);
      this.embeddings.push(...embeddings.map((embedding, index) => ({
        text: documents[index].content,
        embedding,
        metadata: documents[index].metadata
      })));

      console.log(`✅ Added ${documents.length} documents to RAG system`);
    } catch (error: any) {
      console.error('❌ Error adding documents:', error);
      throw error;
    }
  }

  /**
   * Query the RAG system
   */
  async query(prompt: string): Promise<QueryResult> {
    const startTime = Date.now();

    try {
      // Generate embedding for the query
      const queryEmbeddings = await this.getSambaNovaEmbeddings([prompt]);
      const queryEmbedding = queryEmbeddings[0];

      // Find similar documents
      const similarities = this.embeddings.map((item) => ({
        document: this.documents.find(doc => doc.id === item.metadata.id)!,
        similarity: this.cosineSimilarity(queryEmbedding, item.embedding),
        metadata: item.metadata
      }));

      // Filter and sort by similarity
      const relevantDocs = similarities
        .filter(item => item.similarity >= this.config.similarityThreshold)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, this.config.maxContextDocuments);

      if (relevantDocs.length === 0) {
        return {
          response: "I couldn't find relevant information in the uploaded documents to answer your question.",
          context: [],
          confidence: 0,
          processingTime: `${((Date.now() - startTime) / 1000).toFixed(1)}s`
        };
      }

      // Create context from relevant documents
      const context = relevantDocs
        .map(item => `Source: ${item.metadata.source}\n${item.document.content}`)
        .join('\n\n---\n\n');

      // Generate response
      const response = await this.getSambaNovaResponse(prompt, context);

      const avgConfidence = relevantDocs.reduce((sum, item) => sum + item.similarity, 0) / relevantDocs.length;

      return {
        response,
        context: relevantDocs.map(item => item.document),
        confidence: Number(avgConfidence.toFixed(3)),
        processingTime: `${((Date.now() - startTime) / 1000).toFixed(1)}s`
      };

    } catch (error: any) {
      console.error('❌ Error querying RAG system:', error);
      throw error;
    }
  }

  /**
   * Get all documents from Supabase
   */
  async getAllDocuments(): Promise<SupabaseDocument[]> {
    try {
      const { data, error } = await this.supabase
        .from('documents')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error(`Failed to fetch documents: ${error.message}`);
      }

      return data || [];
    } catch (error: any) {
      console.error('❌ Error fetching documents:', error);
      throw error;
    }
  }

  /**
   * Get document by ID from Supabase
   */
  async getDocumentById(id: string): Promise<SupabaseDocument | null> {
    try {
      const { data, error } = await this.supabase
        .from('documents')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null; // Document not found
        }
        throw new Error(`Failed to fetch document: ${error.message}`);
      }

      return data;
    } catch (error: any) {
      console.error('❌ Error fetching document:', error);
      throw error;
    }
  }

  /**
   * Delete document from Supabase
   */
  async deleteDocument(id: string): Promise<boolean> {
    try {
      // Get document info first
      const document = await this.getDocumentById(id);
      if (!document) {
        return false;
      }

      // Delete from storage if it exists
      if (document.storage_path) {
        const { error: storageError } = await this.supabase.storage
          .from(this.bucketName)
          .remove([document.storage_path]);
        
        if (storageError) {
          console.warn(`⚠️  Could not delete file from storage: ${storageError.message}`);
        }
      }

      // Delete from database
      const { error } = await this.supabase
        .from('documents')
        .delete()
        .eq('id', id);

      if (error) {
        throw new Error(`Failed to delete document: ${error.message}`);
      }

      // Remove from memory
      this.documents = this.documents.filter(doc => doc.id !== id);
      this.embeddings = this.embeddings.filter(emb => emb.metadata.id !== id);

      console.log(`✅ Deleted document: ${id}`);
      return true;

    } catch (error: any) {
      console.error('❌ Error deleting document:', error);
      throw error;
    }
  }

  /**
   * Clear all documents
   */
  async clearDocuments(): Promise<void> {
    try {
      // Delete all from database
      const { error } = await this.supabase
        .from('documents')
        .delete()
        .neq('id', ''); // Delete all rows

      if (error) {
        throw new Error(`Failed to clear documents: ${error.message}`);
      }

      // Clear memory
      this.documents = [];
      this.embeddings = [];

      console.log('✅ All documents cleared');
    } catch (error: any) {
      console.error('❌ Error clearing documents:', error);
      throw error;
    }
  }

  /**
   * Get system statistics
   */
  getStats(): any {
    return {
      totalDocuments: this.documents.length,
      totalEmbeddings: this.embeddings.length,
      storageType: 'Supabase Storage + PostgreSQL'
    };
  }

  /**
   * Get detailed statistics
   */
  async getDetailedStats(): Promise<any> {
    try {
      const documents = await this.getAllDocuments();
      
      const stats = {
        documentCount: documents.length,
        totalChunks: documents.length,
        storageType: 'Supabase Storage + PostgreSQL',
        totalSize: documents.reduce((sum, doc) => sum + (doc.file_size || 0), 0),
        totalSizeMB: (documents.reduce((sum, doc) => sum + (doc.file_size || 0), 0) / 1024 / 1024).toFixed(2),
        fileTypes: [...new Set(documents.map(doc => doc.file_type))],
        recentDocuments: documents.slice(0, 5).map(doc => ({
          id: doc.id,
          fileName: doc.file_name,
          source: doc.source,
          createdAt: doc.created_at
        }))
      };

      return stats;
    } catch (error: any) {
      console.error('❌ Error getting detailed stats:', error);
      return this.getStats();
    }
  }
} 