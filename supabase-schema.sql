-- Enable the pgvector extension for vector similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- Create the documents table
CREATE TABLE IF NOT EXISTS public.documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content TEXT NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_size INTEGER NOT NULL,
    file_type VARCHAR(100) NOT NULL,
    storage_path VARCHAR(500),
    source VARCHAR(255) NOT NULL,
    tags TEXT[] DEFAULT '{}',
    embedding vector(4096), -- SambaNova E5-Mistral-7B-Instruct uses 4096 dimensions
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Note: HNSW index removed for prototype - has 2000 dimension limit
-- For production, consider dimensionality reduction or alternative indexing

-- Create an index on created_at for faster sorting
CREATE INDEX IF NOT EXISTS documents_created_at_idx ON public.documents (created_at DESC);

-- Create an index on file_name for faster lookups
CREATE INDEX IF NOT EXISTS documents_file_name_idx ON public.documents (file_name);

-- Create an index on tags for faster tag-based queries
CREATE INDEX IF NOT EXISTS documents_tags_idx ON public.documents USING GIN (tags);

-- Create a function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger to automatically update updated_at
DROP TRIGGER IF EXISTS update_documents_updated_at ON public.documents;
CREATE TRIGGER update_documents_updated_at
    BEFORE UPDATE ON public.documents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create a storage bucket for file uploads (if it doesn't exist)
INSERT INTO storage.buckets (id, name, public)
VALUES ('financial-doc-bucket', 'financial-doc-bucket', false)
ON CONFLICT (id) DO NOTHING;

-- Set up Row Level Security (RLS) policies for the documents table
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- Create a policy that allows all operations (you may want to restrict this based on your auth setup)
DROP POLICY IF EXISTS "Allow all operations on documents" ON public.documents;
CREATE POLICY "Allow all operations on documents" ON public.documents
FOR ALL USING (true);

-- Create a policy for storage bucket access
DROP POLICY IF EXISTS "Allow all operations on financial-doc-bucket" ON storage.objects;
CREATE POLICY "Allow all operations on financial-doc-bucket" ON storage.objects
FOR ALL USING (bucket_id = 'financial-doc-bucket');