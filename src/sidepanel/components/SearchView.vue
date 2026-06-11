<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import type { KnowledgeResult } from '@/types'
import { generateEmbedding, buildEmbeddingInput, cleanTicketText } from '@/composables/useGemini'
import { searchKnowledge } from '@/composables/useSupabase'
import KnowledgeCard from './KnowledgeCard.vue'

const ticketTitle = ref('')
const ticketDescription = ref('')
const results = ref<KnowledgeResult[]>([])
const isLoading = ref(false)
const errorMessage = ref('')
const hasSearched = ref(false)
const isAutoDetected = ref(false)

// Debounce timer for auto-search
let autoSearchTimer: ReturnType<typeof setTimeout> | null = null

onMounted(async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (tab && tab.id && tab.url && (tab.url.includes('hrm.mindx.edu.vn') || tab.url.includes('localhost') || tab.url.includes('127.0.0.1'))) {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          try {
            const ticketContent = document.querySelector('#ticket_content')
            if (!ticketContent) return null

            const card = ticketContent.querySelector('#card')
            if (!card) return null

            const titleSpan = card.querySelector('#card_header span.h3')
            const title = titleSpan?.textContent?.trim() ?? ''

            const descriptionDiv = card.querySelector('#card_body div[name="description"]')
            const description = descriptionDiv?.textContent?.trim() ?? ''

            return { title, description }
          } catch (err) {
            console.warn('[dom-parser] Failed to parse DOM:', err)
            return null
          }
        }
      })

      const response = results?.[0]?.result
      if (response && (response.title || response.description)) {
        ticketTitle.value = response.title || ''
        ticketDescription.value = response.description || ''
        isAutoDetected.value = true
        
        // Auto-trigger search after 400ms debounce
        autoSearchTimer = setTimeout(() => {
          void runSearch()
        }, 400)
      }
    }
  } catch (err) {
    console.warn('[SearchView] Failed to retrieve ticket data via scripting:', err)
  }
})

onUnmounted(() => {
  if (autoSearchTimer) {
    clearTimeout(autoSearchTimer)
  }
})

async function runSearch(): Promise<void> {
  if (!ticketTitle.value.trim() || !ticketDescription.value.trim()) {
    errorMessage.value = 'LỖI: Vui lòng cung cấp đầy đủ cả tiêu đề và mô tả lỗi để tiếp tục.'
    return
  }

  isLoading.value = true
  errorMessage.value = ''
  hasSearched.value = true

  try {
    const inputText = buildEmbeddingInput(ticketTitle.value, ticketDescription.value)
    const cleanedText = cleanTicketText(inputText)
    const embedding = await generateEmbedding(cleanedText)
    results.value = await searchKnowledge(embedding)
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : 'Đã xảy ra lỗi không xác định trong hệ thống.'
    results.value = []
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <div class="p-4 space-y-5">

    <!-- Auto-Detected Ticket Info Header -->
    <div v-if="isAutoDetected" class="border border-slate-800 bg-bg-charcoal/40 p-3.5 space-y-2 relative overflow-hidden group">
      <!-- Tiny technical indicator -->
      <div class="absolute top-0 right-0 bg-cyber-green/10 text-cyber-green text-[8px] font-mono font-bold px-1.5 py-0.5 border-l border-b border-slate-800">// DETECTED</div>
      
      <div class="font-mono text-[9px] text-slate-500 uppercase tracking-wider">// TARGET_TICKET:</div>
      <h3 class="text-sm font-semibold text-slate-200 leading-snug font-sans select-text pr-14">
        {{ ticketTitle }}
      </h3>
      
      <div v-if="ticketDescription" class="pt-1.5 border-t border-slate-900/60">
        <p class="text-xs text-slate-400 font-sans leading-relaxed select-text line-clamp-3 hover:line-clamp-none transition-all duration-200 cursor-pointer">
          {{ ticketDescription }}
        </p>
      </div>

      <!-- Option to switch to manual search -->
      <div class="flex justify-end pt-1">
        <button
          type="button"
          class="text-[9px] font-mono text-cyber-green/80 hover:text-cyber-green border border-cyber-green/30 hover:border-cyber-green bg-cyber-green/5 px-2 py-0.5 cursor-pointer uppercase transition-all duration-155 active:scale-95"
          @click="isAutoDetected = false"
        >
          🔎 MANUAL_EDIT
        </button>
      </div>
    </div>

    <!-- Manual Input Form (only visible if not auto-detected or user clicks Edit) -->
    <div v-else class="space-y-5">
      <!-- Input Section -->
      <div class="space-y-4">
        <!-- Ticket Title Container -->
        <div class="space-y-1.5">
          <div class="flex justify-between items-center">
            <label class="technical-label text-slate-500 font-mono">
              // FIELD: TICKET_TITLE
            </label>
          </div>
          <div class="relative">
            <input
              id="search-title-input"
              v-model="ticketTitle"
              type="text"
              placeholder="Nhập tiêu đề hoặc cào tự động..."
              class="w-full bg-bg-charcoal border border-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyber-green/60 transition-all duration-200 font-sans"
            />
            <div class="absolute right-0 bottom-0 top-0 w-1 bg-cyber-green/20"></div>
          </div>
        </div>

        <!-- Ticket Description Container -->
        <div class="space-y-1.5">
          <label class="technical-label text-slate-500 font-mono">
            // FIELD: TICKET_DESCRIPTION
          </label>
          <div class="relative">
            <textarea
              id="search-description-input"
              v-model="ticketDescription"
              rows="3"
              placeholder="Nội dung lỗi chi tiết..."
              class="w-full bg-bg-charcoal border border-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyber-green/60 transition-all duration-200 resize-none font-sans"
            />
            <div class="absolute right-0 bottom-0 top-0 w-1 bg-cyber-green/20"></div>
          </div>
        </div>
      </div>

      <!-- Actions / Submit Button -->
      <button
        id="search-submit-btn"
        :disabled="isLoading"
        class="w-full py-3 border border-cyber-green text-cyber-green bg-cyber-green/5 font-mono text-xs font-semibold tracking-widest uppercase transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:bg-cyber-green hover:text-bg-obsidian glow-green-hover relative overflow-hidden group active:scale-[0.99]"
        @click="runSearch"
      >
        <div class="absolute inset-0 bg-cyber-green/10 transform -skew-x-12 translate-x-full group-hover:translate-x-[-150%] transition-transform duration-1000"></div>
        
        <span v-if="isLoading" class="flex items-center justify-center gap-2">
          <span class="inline-block w-2.5 h-2.5 border-2 border-bg-obsidian border-t-transparent rounded-full animate-spin"></span>
          [ SCANNING CORE CORE_MATRIX... ]
        </span>
        <span v-else>⚡ [ RUN_SEMANTIC_MATCH ]</span>
      </button>
    </div>

    <!-- Error Logs -->
    <div v-if="errorMessage" class="border border-cyber-red/50 bg-cyber-red/5 px-3 py-2.5 font-mono text-[11px] text-cyber-red relative">
      <div class="absolute top-0 left-0 w-1.5 h-1.5 bg-cyber-red"></div>
      <div class="font-bold mb-1">SYSTEM_ERROR_LOG:</div>
      {{ errorMessage }}
    </div>

    <!-- Custom Database Scan Line Animation -->
    <div v-if="isLoading" class="border border-slate-800 bg-bg-charcoal/30 p-8 flex flex-col items-center justify-center space-y-3 relative overflow-hidden h-32">
      <div class="absolute inset-0 bg-cyber-green/[0.02] cyber-grid"></div>
      <div class="cyber-scanline !h-[2px] !bg-cyber-green/70"></div>
      <div class="text-[11px] font-mono text-cyber-green animate-pulse">CONNECTING TO GEMINI EMBEDDING MATRIX...</div>
      <div class="text-[9px] font-mono text-slate-600">QUERY_VEC: D_768</div>
    </div>

    <!-- Results Section -->
    <div v-if="!isLoading && hasSearched" class="space-y-3">
      <div class="flex justify-between items-center border-b border-slate-800 pb-1.5">
        <span class="technical-label text-slate-500 font-mono">
          // SCAN_RESULT
        </span>
        <span class="font-mono text-xs font-semibold" :class="results.length > 0 ? 'text-cyber-green' : 'text-slate-500'">
          [ {{ results.length > 0 ? `MATCHES: ${results.length}` : 'NO MATCH' }} ]
        </span>
      </div>

      <!-- Empty State -->
      <div v-if="results.length === 0 && !errorMessage" class="border border-dashed border-slate-800 bg-bg-charcoal/20 p-8 text-center text-slate-500">
        <div class="font-mono text-xs mb-1 text-slate-400">// RESOLUTION_NOT_FOUND</div>
        <p class="text-xs">Không tìm thấy case tri thức tương thích với mô tả lỗi này trong hệ thống.</p>
      </div>

      <!-- Result Cards -->
      <div class="space-y-3">
        <KnowledgeCard
          v-for="result in results"
          :key="result.id"
          :result="result"
        />
      </div>
    </div>

  </div>
</template>
