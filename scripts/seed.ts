#!/usr/bin/env ts-node
/**
 * K-Guardian Knowledge Seeding Script (TypeScript)
 * 
 * Usage:
 *   npx ts-node scripts/seed.ts
 * 
 * Environment variables (can be set in mindx-kguardian/.env or shell):
 *   SUPABASE_URL / VITE_SUPABASE_URL          - Supabase project URL
 *   SUPABASE_SERVICE_KEY                      - service_role key (optional, for direct prod insert)
 *   VITE_SUPABASE_ANON_KEY                    - anon key (fallback, for queue insert)
 *   GEMINI_API_KEY / VITE_GEMINI_API_KEY      - Gemini API key
 */

import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

// Resolve __dirname under ESM
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ─── Custom Environment Loader ───────────────────────────────────────────────
function loadEnv() {
  try {
    const envPath = path.resolve(__dirname, '../.env')
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8')
      for (const line of content.split('\n')) {
        const trimmed = line.trim()
        if (trimmed && !trimmed.startsWith('#')) {
          const idx = trimmed.indexOf('=')
          if (idx !== -1) {
            const key = trimmed.substring(0, idx).trim()
            const val = trimmed.substring(idx + 1).trim()
            if (!process.env[key]) {
              process.env[key] = val
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn('⚠️  Could not load .env file:', err)
  }
}

loadEnv()

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || ''
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || ''
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || ''

if (!SUPABASE_URL) {
  console.error('\n❌ Error: SUPABASE_URL or VITE_SUPABASE_URL is not set.\n')
  process.exit(1)
}

if (!GEMINI_API_KEY) {
  console.error('\n❌ Error: GEMINI_API_KEY or VITE_GEMINI_API_KEY is not set.\n')
  process.exit(1)
}

const mdPath = path.resolve(__dirname, '../../knowledge-ticket.md')
if (!fs.existsSync(mdPath)) {
  console.error(`\n❌ Error: knowledge-ticket.md not found at ${mdPath}\n`)
  process.exit(1)
}

// ─── Gemini API Call ──────────────────────────────────────────────────────────
async function generateEmbedding(text: string, apiKey: string): Promise<number[]> {
  const sanitized = text.trim().replace(/\s+/g, ' ')
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=${apiKey}`
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'models/gemini-embedding-2',
      content: { parts: [{ text: sanitized }] },
      outputDimensionality: 768
    }),
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Gemini API Error: ${response.status} - ${errText}`)
  }

  const data = (await response.json()) as any
  const values = data.embedding?.values
  if (!values || values.length !== 768) {
    throw new Error(`Unexpected embedding dimension: expected 768, got ${values?.length ?? 0}`)
  }
  return values
}

// ─── Supabase REST Client ─────────────────────────────────────────────────────
async function insertRow(table: string, key: string, payload: any): Promise<void> {
  const url = `${SUPABASE_URL}/rest/v1/${table}`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify(payload)
  })

  if (!response.ok) {
    const errText = await response.text()
    const errObj = { status: response.status, message: errText }
    throw errObj
  }
}

// ─── Markdown Parser ──────────────────────────────────────────────────────────
interface TicketData {
  title: string
  reporter: string
  content: string
}

function parseTickets(filePath: string): TicketData[] {
  const content = fs.readFileSync(filePath, 'utf8')
  const parts = content.split(/(?:^|\n)---\r?\n/)
  
  const tickets: TicketData[] = []
  
  // Since it starts with '---', parts[0] is empty. 
  // Loop by 2 to get [YAML, Content] pairs
  for (let i = 1; i < parts.length - 1; i += 2) {
    const frontmatterRaw = parts[i]
    const contentRaw = parts[i + 1]
    
    if (!frontmatterRaw || !contentRaw) continue
    
    const titleMatch = frontmatterRaw.match(/title:\s*(.*)/)
    const reporterMatch = frontmatterRaw.match(/reporter:\s*(.*)/)
    
    const title = titleMatch ? titleMatch[1].trim() : ''
    const reporter = reporterMatch ? reporterMatch[1].trim() : 'Tathang'
    
    let cleanContent = contentRaw.trim()
    if (cleanContent.startsWith('## Nội dung')) {
      cleanContent = cleanContent.substring('## Nội dung'.length).trim()
    }
    
    if (title && cleanContent) {
      tickets.push({ title, reporter, content: cleanContent })
    }
  }
  
  return tickets
}

// ─── Main Execution ───────────────────────────────────────────────────────────
async function main() {
  console.log('\n🚀 Starting K-Guardian Knowledge Seeding (TypeScript)...')
  console.log(`📂 Parsing tickets from: ${mdPath}`)
  
  const tickets = parseTickets(mdPath)
  console.log(`📋 Found ${tickets.length} ticket cases to import.`)

  if (tickets.length === 0) {
    console.log('✨ No valid tickets parsed. Exiting.')
    return
  }

  // Determine active keys and strategy
  const activeKey = SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY
  if (!activeKey) {
    console.error('❌ Error: Neither SUPABASE_SERVICE_KEY nor VITE_SUPABASE_ANON_KEY is available.')
    process.exit(1)
  }

  const currentTable = 'knowledge_base'
  
  console.log(`🌐 Supabase Target: ${SUPABASE_URL}`)
  console.log(`📦 Target Table: ${currentTable}`)
  console.log('────────────────────────────────────────────────────────────')

  let successCount = 0

  for (let idx = 0; idx < tickets.length; idx++) {
    const ticket = tickets[idx]
    const progress = `[${idx + 1}/${tickets.length}]`
    
    console.log(`\n${progress} Processing: "${ticket.title}"`)
    
    try {
      // 1. Generate Embedding
      process.stdout.write('   🧠 Generating embedding via Gemini... ')
      const combinedText = `${ticket.title} ${ticket.content}`
      const embedding = await generateEmbedding(combinedText, GEMINI_API_KEY)
      console.log('Done.')
      
      const payload: any = {
        title: ticket.title,
        content: ticket.content,
        reporter: ticket.reporter,
        embedding: embedding
      }

      // 2. Upload to Supabase
      process.stdout.write(`   📤 Uploading to table "${currentTable}"... `)
      await insertRow(currentTable, activeKey, payload)
      console.log('Uploaded successfully!')
      successCount++

    } catch (err: any) {
      console.log('Failed!')
      console.error(`   ❌ Error processing ticket "${ticket.title}":`, err.message || err)
    }
  }

  console.log('\n────────────────────────────────────────────────────────────')
  console.log('✨ Seeding process complete.')
  console.log(`✅ Promoted directly to Prod (knowledge_base): ${successCount}`)
  console.log(`❌ Failed: ${tickets.length - successCount}\n`)
}

main().catch((err) => {
  console.error('\n💥 Fatal error:', err)
  process.exit(1)
})
