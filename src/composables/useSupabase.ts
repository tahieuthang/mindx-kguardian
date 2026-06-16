import { createClient } from '@supabase/supabase-js'
import type { EmbeddingVector, KnowledgeResult, QueuePayload } from '@/types'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

const MATCH_THRESHOLD = 0.70
const MATCH_COUNT = 7

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('[useSupabase] Missing Supabase environment variables.')
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

class SupabaseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SupabaseError'
  }
}

/**
 * Semantic search on knowledge_base using cosine similarity via pgvector.
 * Returns the top 5 most relevant results sorted by similarity (desc).
 */
export async function searchKnowledge(
  embedding: EmbeddingVector,
): Promise<KnowledgeResult[]> {
  const { data, error } = await supabase.rpc('match_documents', {
    query_embedding: embedding,
    match_threshold: MATCH_THRESHOLD,
    match_count: MATCH_COUNT,
  })

  if (error) {
    throw new SupabaseError(`searchKnowledge failed: ${error.message}`)
  }

  return (data as KnowledgeResult[]) ?? []
}

/**
 * Submit a new knowledge contribution to the staging queue.
 * Status defaults to 'pending' on insert.
 */
export async function submitToQueue(payload: QueuePayload): Promise<void> {
  const { error } = await supabase.from('knowledge_queue').insert({
    title: payload.title,
    content: payload.content,
    reporter: payload.reporter,
    embedding: payload.embedding,
    status: 'pending',
  })

  if (error) {
    throw new SupabaseError(`submitToQueue failed: ${error.message}`)
  }
}

/**
 * Fetch all verified cases from knowledge_base, sorted by creation date desc.
 */
export async function fetchAllKnowledge(): Promise<KnowledgeResult[]> {
  const { data, error } = await supabase
    .from('knowledge_base')
    .select('id, title, content, reporter, created_at')
    .order('created_at', { ascending: false })

  if (error) {
    throw new SupabaseError(`fetchAllKnowledge failed: ${error.message}`)
  }

  // Treat retrieved items as high similarity (1.0) for UI consistency
  return (data as any[]).map(item => ({
    ...item,
    similarity: 1.0
  })) as KnowledgeResult[]
}

/**
 * Update an existing verified case in knowledge_base with new details and embedding vector.
 */
export async function updateKnowledge(
  id: number,
  title: string,
  content: string,
  embedding: EmbeddingVector
): Promise<void> {
  const { data, error } = await supabase
    .from('knowledge_base')
    .update({
      title,
      content,
      embedding,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .select()

  if (error) {
    throw new SupabaseError(`updateKnowledge failed: ${error.message}`)
  }

  if (!data || data.length === 0) {
    throw new SupabaseError('Không có hàng nào được cập nhật. Vui lòng kiểm tra lại quyền UPDATE (RLS Policy) dành cho vai trò anon trên Supabase.')
  }
}
