import type { EmbeddingVector } from '@/types'

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string
const EMBEDDING_MODEL = 'gemini-embedding-2'
const EMBEDDING_DIM = 768

class GeminiError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
  ) {
    super(message)
    this.name = 'GeminiError'
  }
}

/**
 * Sanitize text: trim + collapse whitespace
 */
function sanitizeText(text: string): string {
  return text.trim().replace(/\s+/g, ' ')
}

/**
 * Clean conversational noise, names, class codes, dates, and phone numbers from ticket content
 * to optimize semantic matching scores.
 */
export function cleanTicketText(text: string): string {
  let cleaned = text

  // 1. Clean class codes first: "lớp GI31", "LỚP GI31" -> "lớp"
  cleaned = cleaned.replace(/\b(lớp|LỚP)\s+[A-Za-z0-9\-]+\b/g, 'lớp')

  // 2. Clean names preceded by học viên / bạn / bé / anh / chị / em
  // We match capitalized words. A capitalized word starts with an uppercase letter [A-ZÀ-Ỹ]
  cleaned = cleaned.replace(
    /\b(học\s+viên|HỌC\s+VIÊN|bạn|BẠN|bé|BÉ|anh|ANH|chị|CHỊ|em|EM)\s+[A-ZÀ-Ỹ][A-Za-zÀ-ỹ]*(\s+[A-ZÀ-Ỹ][A-Za-zÀ-ỹ]*){1,3}\b/g,
    'học viên'
  )

  // 3. Lowercase everything now to clean up remaining headers/conversational patterns
  cleaned = cleaned.toLowerCase()

  // 4. Standardize "bé", "học sinh" to "học viên"
  cleaned = cleaned.replace(/\b(bé|học\s+sinh)\b/g, 'học viên')

  // 5. Remove chat headers (Dear team, hi all, chào team, kính gửi, etc.)
  cleaned = cleaned.replace(/\b(dear|chào|hi|hello|kính\s+gửi)\s+(team|teach|mọi\s+người|all|anh\s+chị|ac)\b[^\n,.]*[,.]?/g, '')

  // 6. Remove CS introductions: "em là [Tên] vị trí CS ở BU [Tên BU]"
  cleaned = cleaned.replace(/\bem\s+là\s+[a-zà-ỹ]*(\s+[a-zà-ỹ]*)*(\s+vị\s+trí\s+\w+)?(\s+ở\s+bu\s+[a-zà-ỹ\s]+)?[,.]?/g, '')

  // 7. Remove help requests: "nhờ/mong/yêu cầu team (teach) fix/hỗ trợ giúp em"
  cleaned = cleaned.replace(/\b(nhờ|mong|yêu\s+cầu|vui\s+lòng)\s+(team|teach|mọi\s+người)?[^\n,.]*(fix|hỗ\s+trợ|giúp|sửa|xử\s+lý)[^\n,.]*[,.]?/g, '')

  // 8. Remove phone numbers
  cleaned = cleaned.replace(/\b(\+84|0)\d{9,10}\b/g, '')

  // 9. Remove dates
  cleaned = cleaned.replace(/\b\d{1,4}[/\-\.]\d{1,2}[/\-\.]\d{2,4}\b/g, '')

  // 10. Remove thank you footers: "Em xin cảm ơn...", "cảm ơn team", etc.
  cleaned = cleaned.replace(/\b(em\s+)?(xin\s+)?cảm\s+ơn\s+(team|teach|mọi\s+người|ạ)?[^\n.]*\.?/g, '')
  cleaned = cleaned.replace(/\b(thanks|thank\s+you)\b[^\n.]*\.?/g, '')

  // 11. Collapse multiple spaces and trim
  return cleaned.replace(/\s+/g, ' ').trim()
}

/**
 * Generate a 768-dim embedding vector from text using Gemini gemini-embedding-2.
 * Concatenates title + description/content before calling the API.
 */
export async function generateEmbedding(text: string): Promise<EmbeddingVector> {
  const sanitized = sanitizeText(text)

  if (!sanitized) {
    throw new GeminiError('Input text is empty after sanitization.')
  }

  if (!GEMINI_API_KEY) {
    throw new GeminiError('VITE_GEMINI_API_KEY is not set in environment variables.')
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${GEMINI_API_KEY}`

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: `models/${EMBEDDING_MODEL}`,
      content: { parts: [{ text: sanitized }] },
      outputDimensionality: EMBEDDING_DIM
    }),
  })

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}))
    const message = (errorBody as { error?: { message?: string } }).error?.message ?? response.statusText
    throw new GeminiError(`Gemini API error: ${message}`, response.status)
  }

  const data = (await response.json()) as {
    embedding?: { values?: number[] }
  }

  const values = data.embedding?.values
  if (!values || values.length !== EMBEDDING_DIM) {
    throw new GeminiError(
      `Unexpected embedding dimension: expected ${EMBEDDING_DIM}, got ${values?.length ?? 0}`,
    )
  }

  return values
}

/**
 * Combine title and body text into one embedding input string.
 */
export function buildEmbeddingInput(title: string, body: string): string {
  return `${sanitizeText(title)} ${sanitizeText(body)}`
}
