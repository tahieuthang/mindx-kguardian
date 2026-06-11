// ─── Knowledge Base Types ─────────────────────────────────────────────────────

export interface KnowledgeResult {
  id: number
  title: string
  content: string
  reporter: string
  similarity: number
  created_at?: string
}

// ─── Queue Types ──────────────────────────────────────────────────────────────

export interface QueuePayload {
  title: string
  content: string
  reporter: string
  embedding: number[]
}

export type QueueStatus = 'pending' | 'approved' | 'rejected'

export interface QueueRecord {
  id: number
  title: string
  content: string
  reporter: string
  embedding: number[]
  status: QueueStatus
  ai_notes: DuplicateNote[] | null
  created_at: string
}

// ─── AI Notes / Deduplication ─────────────────────────────────────────────────

export interface DuplicateNote {
  duplicateId: number
  duplicateTitle: string
  similarityPercent: number
}

// ─── DOM Parser ───────────────────────────────────────────────────────────────

export interface TicketContext {
  title: string
  description: string
}

// ─── Gemini API ───────────────────────────────────────────────────────────────

export type EmbeddingVector = number[]
