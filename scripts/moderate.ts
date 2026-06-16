#!/usr/bin/env ts-node
/**
 * K-Guardian Admin Moderation Script
 *
 * Usage:
 *   npx ts-node scripts/moderate.ts
 *
 * Environment variables (set in .env.local or shell):
 *   SUPABASE_URL          - Supabase project URL
 *   SUPABASE_SERVICE_KEY  - service_role key (NOT the anon key)
 *
 * Workflow (per SPEC section 5):
 *   1. Fetch all pending records from knowledge_queue
 *   2. Run deduplication check against knowledge_base via check_duplicate_in_prod
 *   3. Auto-annotate ai_notes for duplicates (similarity > 0.8)
 *   4. Display list with AI notes for Admin review
 *   5. Admin interactively approve or reject each entry
 */

import { createClient } from '@supabase/supabase-js'
import * as readline from 'readline'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import type { QueueRecord, DuplicateNote } from '../src/types'

// ─── Load Environment variables ──────────────────────────────────────────────
function loadEnv(): void {
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)
  const envPath = path.join(__dirname, '../.env')
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (trimmed && !trimmed.startsWith('#')) {
        const firstEqual = trimmed.indexOf('=')
        if (firstEqual !== -1) {
          const key = trimmed.substring(0, firstEqual).trim()
          let val = trimmed.substring(firstEqual + 1).trim()
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.substring(1, val.length - 1)
          }
          if (!process.env[key]) {
            process.env[key] = val
          }
        }
      }
    }
  }
}
loadEnv()

// ─── Config ──────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY ?? ''
const DUPLICATE_THRESHOLD = 0.8

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('\n❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables.\n')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// ─── Utils ───────────────────────────────────────────────────────────────────

function hr(): void {
  console.log('─'.repeat(60))
}

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

// ─── Phase 1: Fetch pending records ──────────────────────────────────────────

async function fetchPending(): Promise<QueueRecord[]> {
  const { data, error } = await supabase
    .from('knowledge_queue')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  if (error) throw new Error(`Failed to fetch pending records: ${error.message}`)
  return (data as QueueRecord[]) ?? []
}

// ─── Phase 2: Deduplication scan ─────────────────────────────────────────────

async function checkDuplicates(record: QueueRecord): Promise<DuplicateNote[]> {
  const { data, error } = await supabase.rpc('check_duplicate_in_prod', {
    query_embedding: record.embedding,
    match_threshold: DUPLICATE_THRESHOLD,
  })

  if (error) {
    console.warn(`  ⚠️  Dedup check failed for ID ${record.id}: ${error.message}`)
    return []
  }

  return ((data as { id: number; title: string; similarity: number }[]) ?? []).map((row) => ({
    duplicateId: row.id,
    duplicateTitle: row.title,
    similarityPercent: Math.round(row.similarity * 100),
  }))
}

async function annotateRecord(record: QueueRecord, duplicates: DuplicateNote[]): Promise<void> {
  if (duplicates.length === 0) return

  const { error } = await supabase
    .from('knowledge_queue')
    .update({ ai_notes: duplicates })
    .eq('id', record.id)

  if (error) {
    console.warn(`  ⚠️  Failed to annotate ID ${record.id}: ${error.message}`)
  } else {
    record.ai_notes = duplicates
  }
}

// ─── Phase 3: Approve ────────────────────────────────────────────────────────

async function approveRecord(record: QueueRecord): Promise<void> {
  // Transaction: INSERT into knowledge_base + UPDATE status in queue
  const { error: insertError } = await supabase.from('knowledge_base').insert({
    title: record.title,
    content: record.content,
    reporter: record.reporter,
    embedding: record.embedding,
  })

  if (insertError) throw new Error(`Insert failed: ${insertError.message}`)

  const { error: updateError } = await supabase
    .from('knowledge_queue')
    .update({ status: 'approved' })
    .eq('id', record.id)

  if (updateError) throw new Error(`Status update failed: ${updateError.message}`)

  console.log(`  ✅ ID ${record.id} approved and promoted to knowledge_base.`)
}

// ─── Phase 4: Reject ─────────────────────────────────────────────────────────

async function rejectRecord(record: QueueRecord): Promise<void> {
  const { error } = await supabase
    .from('knowledge_queue')
    .update({ status: 'rejected' })
    .eq('id', record.id)

  if (error) throw new Error(`Reject failed: ${error.message}`)
  console.log(`  ❌ ID ${record.id} rejected.`)
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const isCron = process.argv.includes('--cron')
  console.log(`\n🛡️  K-Guardian Admin Auto-Moderation Console${isCron ? ' [Cron Mode]' : ''}`)
  hr()

  console.log('📡 Fetching pending contributions...')
  const pending = await fetchPending()

  if (pending.length === 0) {
    console.log('\n✨ No pending entries. Knowledge base is up to date!\n')
    return
  }

  console.log(`\n🔍 Scanning and auto-moderating ${pending.length} entries...`)
  const manualReviewList: QueueRecord[] = []

  for (const record of pending) {
    const duplicates = await checkDuplicates(record)
    
    if (duplicates.length > 0) {
      await annotateRecord(record, duplicates)
    }

    const maxSimilarity = duplicates.length > 0
      ? Math.max(...duplicates.map(d => d.similarityPercent))
      : 0

    if (maxSimilarity >= 90) {
      const bestMatch = duplicates.find(d => d.similarityPercent === maxSimilarity)
      console.log(`\n[ID: ${record.id}] "${record.title}"`)
      console.log(`  ❌ AUTO-REJECTED: Độ trùng khớp ${maxSimilarity}% với KB #${bestMatch?.duplicateId} (Vượt ngưỡng 90%)`)
      await rejectRecord(record)
    } else if (maxSimilarity >= 80) {
      console.log(`\n[ID: ${record.id}] "${record.title}"`)
      console.log(`  ⏳ SKIPPED: Độ trùng khớp ${maxSimilarity}% nằm trong khoảng 80% - 89% (Cần duyệt thủ công)`)
      manualReviewList.push(record)
    } else {
      console.log(`\n[ID: ${record.id}] "${record.title}"`)
      console.log(`  ✅ AUTO-APPROVED: Độ trùng khớp tối đa ${maxSimilarity}% < 80% (Mới và an toàn)`)
      await approveRecord(record)
    }
  }

  if (manualReviewList.length > 0) {
    if (isCron) {
      hr()
      console.log(`\n📋 Có ${manualReviewList.length} đóng góp có nghi vấn cần duyệt thủ công sau (Bỏ qua trong chế độ Cron).`)
    } else {
      hr()
      console.log(`\n📋 Bắt đầu duyệt thủ công ${manualReviewList.length} đóng góp có nghi vấn:\n`)

      for (const record of manualReviewList) {
        hr()
        console.log(`[ID: ${record.id}]  ${record.title}`)
        console.log(`👤 Reporter: ${record.reporter}  |  🕒 ${new Date(record.created_at).toLocaleString('vi-VN')}`)
        console.log(`\n📝 Content:\n${record.content}`)

        console.log('\n⚠️  AI DEDUPLICATION WARNING:')
        for (const note of record.ai_notes || []) {
          console.log(`  • [KB #${note.duplicateId}] "${note.duplicateTitle}" — ${note.similarityPercent}% match`)
        }

        console.log()
        const answer = await prompt('Decision → [a] Approve  [r] Reject  [s] Skip: ')

        if (answer.toLowerCase() === 'a') {
          await approveRecord(record)
        } else if (answer.toLowerCase() === 'r') {
          await rejectRecord(record)
        } else {
          console.log(`  ⏭️  Skipped ID ${record.id} (Giữ lại trạng thái pending).`)
        }
      }
    }
  }

  hr()
  console.log('\n✅ Moderation session complete.\n')
}

main().catch((err: unknown) => {
  console.error('\n💥 Fatal error:', err instanceof Error ? err.message : err)
  process.exit(1)
})
