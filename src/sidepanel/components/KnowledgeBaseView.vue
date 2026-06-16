<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import type { KnowledgeResult } from '@/types'
import { generateEmbedding, buildEmbeddingInput } from '@/composables/useGemini'
import { fetchAllKnowledge, updateKnowledge } from '@/composables/useSupabase'

const cases = ref<KnowledgeResult[]>([])
const isLoading = ref(true)
const isSaving = ref(false)
const filterQuery = ref('')
const sortBy = ref<'newest' | 'oldest'>('newest')
const filterDate = ref('')
const errorMessage = ref('')
const toast = ref<{ type: 'success' | 'error'; message: string } | null>(null)

// Accordion expanded state tracking
const expandedCardIds = ref<Record<number, boolean>>({})

// Editing state tracking
const editingId = ref<number | null>(null)
const editTitle = ref('')
const editContent = ref('')

let toastTimer: ReturnType<typeof setTimeout> | null = null

function showToast(type: 'success' | 'error', message: string): void {
  if (toastTimer) clearTimeout(toastTimer)
  toast.value = { type, message }
  toastTimer = setTimeout(() => {
    toast.value = null
  }, 4000)
}

async function loadData() {
  isLoading.value = true
  errorMessage.value = ''
  try {
    cases.value = await fetchAllKnowledge()
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : 'Không thể tải kho tri thức.'
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  void loadData()
})

const filteredCases = computed(() => {
  let result = [...cases.value]
  
  // 1. Filter by text search query
  const query = filterQuery.value.toLowerCase().trim()
  if (query) {
    result = result.filter(c => 
      c.title.toLowerCase().includes(query) || 
      c.content.toLowerCase().includes(query)
    )
  }
  
  // 2. Filter by date picker
  if (filterDate.value) {
    const targetDateStr = filterDate.value // YYYY-MM-DD
    result = result.filter(c => {
      if (!c.created_at) return false
      const itemDateStr = c.created_at.substring(0, 10)
      return itemDateStr === targetDateStr
    })
  }
  
  // 3. Sort by creation date
  result.sort((a, b) => {
    const dateA = a.created_at ? new Date(a.created_at).getTime() : 0
    const dateB = b.created_at ? new Date(b.created_at).getTime() : 0
    return sortBy.value === 'newest' ? dateB - dateA : dateA - dateB
  })
  
  return result
})

function toggleExpand(id: number) {
  // If editing another card, don't allow toggle without close or just cancel editing
  if (editingId.value !== null && editingId.value !== id) {
    cancelEdit()
  }
  expandedCardIds.value[id] = !expandedCardIds.value[id]
}

function startEdit(item: KnowledgeResult) {
  editingId.value = item.id
  editTitle.value = item.title
  editContent.value = item.content
  expandedCardIds.value[item.id] = true // ensure expanded when editing
}

function cancelEdit() {
  editingId.value = null
  editTitle.value = ''
  editContent.value = ''
}

function validateKnowledgeFormat(text: string): boolean {
  const trimmed = text.trim()
  const lowercase = trimmed.toLowerCase()

  // If both "1." and "2." tags exist, make sure they are on different lines
  const lines = trimmed.split('\n')
  const hasLineWithBoth = lines.some(line => {
    const l = line.toLowerCase()
    return (l.includes('1.') && l.includes('2.'))
  })
  if (hasLineWithBoth) {
    return false
  }

  // Detect at least one section prefix (1. or 2. or fallback words)
  const hasPart1 = /^(?:1\.\s+|nguyên nhân[:\-])/im.test(trimmed) || 
                   lowercase.includes('1. nguyên nhân') || 
                   lowercase.includes('nguyên nhân:')
                   
  const hasPart2 = /^(?:2\.\s+|cách xử lý[:\-]|hướng xử lý[:\-])/im.test(trimmed) || 
                   lowercase.includes('2. cách xử lý') || 
                   lowercase.includes('cách xử lý:') || 
                   lowercase.includes('hướng xử lý:')

  return hasPart1 || hasPart2
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    const target = e.target as HTMLTextAreaElement
    const value = target.value
    const selectionStart = target.selectionStart
    
    const textBeforeCursor = value.substring(0, selectionStart)
    const lines = textBeforeCursor.split('\n')
    const currentLine = lines[lines.length - 1].trim()
    
    if (/^1\.\s*nguyên nhân/i.test(currentLine) && !value.toLowerCase().includes('2. cách xử lý')) {
      e.preventDefault()
      const insertText = '\n2. Cách xử lý: '
      const newValue = value.substring(0, selectionStart) + insertText + value.substring(target.selectionEnd)
      editContent.value = newValue
      setTimeout(() => {
        target.focus()
        target.selectionStart = target.selectionEnd = selectionStart + insertText.length
      }, 0)
    }
  }
}

async function saveEdit(item: KnowledgeResult) {
  const titleVal = editTitle.value.trim()
  const contentVal = editContent.value.trim()

  if (!titleVal || !contentVal) {
    showToast('error', 'LỖI VALIDATE: Không được để trống tiêu đề hoặc nội dung tri thức.')
    return
  }

  if (!validateKnowledgeFormat(contentVal)) {
    showToast('error', 'SAI ĐỊNH DẠNG: Tri thức phải chứa ít nhất một mục bắt đầu bằng "1." hoặc "2." (ví dụ: Nguyên nhân/Cách xử lý). Nếu có cả hai mục, bắt buộc phải xuống dòng phân tách.')
    return
  }

  isSaving.value = true
  try {
    // Generate new embedding using updated title and content
    const embeddingInput = buildEmbeddingInput(titleVal, contentVal)
    const embedding = await generateEmbedding(embeddingInput)

    // Update Supabase
    await updateKnowledge(item.id, titleVal, contentVal, embedding)

    // Update locally
    const idx = cases.value.findIndex(c => c.id === item.id)
    if (idx !== -1) {
      cases.value[idx].title = titleVal
      cases.value[idx].content = contentVal
    }

    cancelEdit()
    showToast('success', 'CẬP NHẬT THÀNH CÔNG: Dữ liệu tri thức đã được cập nhật.')
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Lỗi không xác định.'
    showToast('error', `CẬP NHẬT THẤT BẠI: ${msg}`)
  } finally {
    isSaving.value = false
  }
}

// Inline parser for Cause & Solution display using standard formatting
function parseContent(content: string) {
  const text = content.trim()
  const lines = text.split('\n')
  
  let part1Header = ''
  let part1Body = ''
  let part2Header = ''
  let part2Body = ''
  
  let currentPart = 0
  
  for (const line of lines) {
    const part1Match = line.match(/^(?:1\.\s*)([^:\-\n]+)(?:[:\-](.*))?$/i)
    const part2Match = line.match(/^(?:2\.\s*)([^:\-\n]+)(?:[:\-](.*))?$/i)
    
    if (part1Match) {
      currentPart = 1
      part1Header = part1Match[1].trim()
      part1Body = (part1Match[2] || '').trim()
    } else if (part2Match) {
      currentPart = 2
      part2Header = part2Match[1].trim()
      part2Body = (part2Match[2] || '').trim()
    } else {
      if (currentPart === 0) {
        // Fallback checks for items without "1." / "2." prefix
        const genericMatch = line.match(/^(cách xử lý|hướng xử lý|cách khắc phục|nguyên nhân|giải pháp|tình trạng)[:\-](.*)$/i)
        if (genericMatch) {
          const header = genericMatch[1].trim()
          const body = genericMatch[2].trim()
          const isSol = /xử lý|khắc phục|giải pháp/i.test(header)
          if (isSol) {
            part2Header = header
            part2Body = body
            currentPart = 2
          } else {
            part1Header = header
            part1Body = body
            currentPart = 1
          }
          continue
        }
      }
      
      if (currentPart === 1) {
        part1Body += (part1Body ? '\n' : '') + line
      } else if (currentPart === 2) {
        part2Body += (part2Body ? '\n' : '') + line
      }
    }
  }
  
  if (part1Header || part2Header || part1Body || part2Body) {
    return {
      part1: part1Body.trim() ? { header: part1Header || 'Mục 1', body: part1Body.trim() } : null,
      part2: part2Body.trim() ? { header: part2Header || 'Mục 2', body: part2Body.trim() } : null,
      isParsed: true,
      raw: text
    }
  }
  
  return { part1: null, part2: null, isParsed: false, raw: text }
}
</script>

<template>
  <div class="p-4 space-y-4 relative">
    <!-- Toast Notification -->
    <Transition name="toast">
      <div
        v-if="toast"
        class="border px-3.5 py-3 text-xs font-mono flex items-start gap-2 relative z-50 shadow-lg"
        :class="toast.type === 'success'
          ? 'border-cyber-green/50 bg-cyber-green/5 text-cyber-green'
          : 'border-cyber-red/50 bg-cyber-red/5 text-cyber-red'"
      >
        <div class="absolute top-0 left-0 w-2 h-2" :class="toast.type === 'success' ? 'bg-cyber-green' : 'bg-cyber-red'"></div>
        <span>{{ toast.type === 'success' ? '⚡' : '⚠️' }}</span>
        <div class="flex-1">
          <div class="font-bold mb-0.5">{{ toast.type === 'success' ? 'SUCCESS_LOG' : 'VALIDATION_LOG' }}</div>
          <p class="font-sans text-[11px] text-slate-300 leading-normal">{{ toast.message }}</p>
        </div>
      </div>
    </Transition>

    <!-- Search/Filter Input Header -->
    <div class="space-y-1.5">
      <label for="kb-filter" class="technical-label text-slate-500 font-mono">
        // REPOSITORY_LOCAL_FILTER
      </label>
      <div class="relative">
        <input
          id="kb-filter"
          v-model="filterQuery"
          type="text"
          placeholder="Tìm kiếm theo tiêu đề hoặc nội dung..."
          class="w-full bg-bg-charcoal border border-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyber-green/60 transition-all duration-200 font-sans"
        />
        <div class="absolute right-0 bottom-0 top-0 w-1 bg-cyber-green/20"></div>
      </div>
    </div>

    <!-- Sort & Date filter controls -->
    <div class="flex gap-3 items-end">
      <!-- Sort By -->
      <div class="flex-1 space-y-1.5">
        <label for="kb-sort" class="technical-label text-slate-500 font-mono">
          // SORT_ORDER
        </label>
        <div class="relative">
          <select
            id="kb-sort"
            v-model="sortBy"
            class="w-full bg-bg-charcoal border border-slate-800 px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-cyber-green/60 transition-all duration-200 font-mono appearance-none"
          >
            <option value="newest">🕒 Gần nhất (Newest)</option>
            <option value="oldest">⏳ Lâu nhất (Oldest)</option>
          </select>
          <div class="absolute right-3 top-2.5 pointer-events-none text-slate-600 text-[10px]">▼</div>
          <div class="absolute right-0 bottom-0 top-0 w-1 bg-cyber-green/20"></div>
        </div>
      </div>

      <!-- Date Filter -->
      <div class="flex-1 space-y-1.5">
        <div class="flex justify-between items-center">
          <label for="kb-date" class="technical-label text-slate-500 font-mono">
            // DATE_FILTER
          </label>
          <button
            v-if="filterDate"
            type="button"
            class="text-[9px] font-mono text-cyber-red/80 hover:text-cyber-red cursor-pointer"
            @click="filterDate = ''"
          >
            [ Reset ]
          </button>
        </div>
        <div class="relative">
          <input
            id="kb-date"
            v-model="filterDate"
            type="date"
            class="w-full bg-bg-charcoal border border-slate-800 px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-cyber-green/60 transition-all duration-200 font-mono"
            style="color-scheme: dark;"
          />
          <div class="absolute right-0 bottom-0 top-0 w-1 bg-cyber-green/20"></div>
        </div>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="border border-slate-800 bg-bg-charcoal/30 p-8 flex flex-col items-center justify-center space-y-3 relative overflow-hidden h-32">
      <div class="absolute inset-0 bg-cyber-green/[0.02] cyber-grid"></div>
      <div class="cyber-scanline !h-[2px] !bg-cyber-green/70"></div>
      <div class="text-[11px] font-mono text-cyber-green animate-pulse">CONNECTING TO PRODUCTION REPOSITORY...</div>
    </div>

    <!-- Error State -->
    <div v-else-if="errorMessage" class="border border-cyber-red/50 bg-cyber-red/5 px-3 py-2.5 font-mono text-[11px] text-cyber-red relative">
      <div class="absolute top-0 left-0 w-1.5 h-1.5 bg-cyber-red"></div>
      <div class="font-bold mb-1">SYSTEM_ERROR_LOG:</div>
      {{ errorMessage }}
      <button 
        class="mt-2 block border border-cyber-red/30 px-2 py-0.5 text-[10px] hover:bg-cyber-red/10 cursor-pointer"
        @click="loadData"
      >
        [ TRY_RELOAD ]
      </button>
    </div>

    <!-- Case List -->
    <div v-else class="space-y-3">
      <div class="flex justify-between items-center border-b border-slate-800 pb-1.5">
        <span class="technical-label text-slate-500 font-mono">
          // KNOWLEDGE_RECORDS
        </span>
        <div class="flex items-center gap-2">
          <button
            type="button"
            :disabled="isLoading"
            class="text-[9px] font-mono text-cyber-green/80 hover:text-cyber-green border border-cyber-green/20 hover:border-cyber-green/50 bg-cyber-green/5 px-2 py-0.5 cursor-pointer uppercase transition-all duration-150 active:scale-95 disabled:opacity-50"
            @click="loadData"
          >
            🔄 [ REFRESH ]
          </button>
          <span class="font-mono text-xs font-semibold text-cyber-green">
            [ COUNT: {{ filteredCases.length }} ]
          </span>
        </div>
      </div>

      <div v-if="filteredCases.length === 0" class="border border-dashed border-slate-800 bg-bg-charcoal/20 p-8 text-center text-slate-500">
        <div class="font-mono text-xs mb-1 text-slate-400">// NO_RECORDS_FOUND</div>
        <p class="text-xs">Không tìm thấy tri thức nào khớp với bộ lọc.</p>
      </div>

      <div v-else class="space-y-3">
        <!-- Knowledge Card Structure -->
        <div
          v-for="item in filteredCases"
          :key="item.id"
          class="border bg-bg-charcoal/40 transition-colors duration-200"
          :class="expandedCardIds[item.id] ? 'border-cyber-green/35' : 'border-slate-900 hover:border-slate-800'"
        >
          <!-- Card Header / Collapsed view -->
          <div class="flex items-start justify-between p-4 cursor-pointer gap-3 group" @click="toggleExpand(item.id)">
            <div class="space-y-1.5 min-w-0 flex-1">
              <h3 class="text-xs font-bold leading-snug text-slate-100 group-hover:text-cyber-green transition-colors duration-150 font-sans">
                {{ item.title }}
              </h3>
              <div class="flex items-center gap-2">
                <span class="text-[9px] font-mono text-slate-500">
                  BY: {{ item.reporter }}
                </span>
                <span v-if="item.created_at" class="text-[9px] font-mono text-slate-500">
                  | 📅 {{ new Date(item.created_at).toLocaleDateString('vi-VN') }}
                </span>
                <span class="text-[9px] font-mono text-cyber-green/60">
                  [ VERIFIED ]
                </span>
              </div>
            </div>

            <div class="flex items-center gap-2 shrink-0" @click.stop>
              <!-- Edit Button -->
              <button
                v-if="editingId !== item.id"
                type="button"
                class="text-[9px] font-mono text-cyber-green/80 hover:text-cyber-green border border-cyber-green/20 hover:border-cyber-green/60 bg-cyber-green/5 px-1.5 py-0.5 cursor-pointer transition-all active:scale-95"
                @click="startEdit(item)"
              >
                 EDIT 
              </button>
              
              <!-- Expand Icon -->
              <button 
                class="shrink-0 p-0.5 text-slate-600 hover:text-cyber-green cursor-pointer"
                @click="toggleExpand(item.id)"
              >
                <svg
                  class="w-4 h-4 transition-transform duration-300"
                  :class="{ 'rotate-180 text-cyber-green!': expandedCardIds[item.id] }"
                  fill="none" viewBox="0 0 24 24" stroke="currentColor"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
          </div>

          <!-- Card Content / Expanded view -->
          <Transition name="slide">
            <div
              v-if="expandedCardIds[item.id]"
              class="px-4 pb-4 pt-1.5 border-t border-slate-900 bg-bg-obsidian/40"
            >
              <!-- EDIT MODE FORM -->
              <div v-if="editingId === item.id" class="space-y-3 pt-2 text-xs" @click.stop>
                <!-- Title Field -->
                <div class="space-y-1">
                  <label class="technical-label text-slate-500 font-mono">// EDIT_TITLE <span class="text-cyber-green">*</span></label>
                  <input
                    v-model="editTitle"
                    type="text"
                    class="w-full bg-bg-charcoal border border-cyber-green/30 px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyber-green transition-all duration-200 font-sans"
                  />
                </div>

                <!-- Content Field -->
                <div class="space-y-1">
                  <label class="technical-label text-slate-500 font-mono">// EDIT_CONTENT <span class="text-cyber-green">*</span></label>
                  <textarea
                    v-model="editContent"
                    rows="6"
                    class="w-full bg-bg-charcoal border border-cyber-green/30 px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyber-green transition-all duration-200 font-mono resize-none leading-relaxed"
                    @keydown="handleKeyDown"
                  />
                </div>

                <!-- Save/Cancel Actions -->
                <div class="flex items-center gap-2 pt-1 justify-end">
                  <button
                    type="button"
                    :disabled="isSaving"
                    class="text-[9px] font-mono text-slate-400 hover:text-slate-200 border border-slate-800 hover:border-slate-700 bg-bg-charcoal px-2 py-1 cursor-pointer transition-all active:scale-95 disabled:opacity-50"
                    @click="cancelEdit"
                  >
                    [ CANCEL ]
                  </button>
                  <button
                    type="button"
                    :disabled="isSaving"
                    class="text-[9px] font-mono text-cyber-green hover:text-bg-obsidian border border-cyber-green bg-cyber-green/5 hover:bg-cyber-green px-3 py-1 cursor-pointer transition-all active:scale-95 font-bold disabled:opacity-50 flex items-center gap-1"
                    @click="saveEdit(item)"
                  >
                    <span v-if="isSaving" class="inline-block w-2.5 h-2.5 border border-bg-obsidian border-t-transparent rounded-full animate-spin"></span>
                    {{ isSaving ? '[ SAVING... ]' : '[ SAVE_CHANGES ]' }}
                  </button>
                </div>
              </div>

              <!-- READ ONLY VIEW -->
              <div v-else class="space-y-3 mt-2 text-xs">
                <div v-if="parseContent(item.content).isParsed" class="space-y-3">
                  <!-- Section 1 -->
                  <div v-if="parseContent(item.content).part1" class="border-l-2 border-cyber-amber/55 bg-cyber-amber/5 px-3 py-2">
                    <div class="font-mono text-[9px] text-cyber-amber font-bold uppercase tracking-wider mb-1">
                      // {{ parseContent(item.content).part1?.header.toUpperCase() }}
                    </div>
                    <p class="text-slate-300 leading-relaxed font-sans select-text whitespace-pre-wrap">{{ parseContent(item.content).part1?.body }}</p>
                  </div>

                  <!-- Section 2 -->
                  <div v-if="parseContent(item.content).part2" class="border-l-2 border-cyber-green/55 bg-cyber-green/5 px-3 py-2">
                    <div class="font-mono text-[9px] text-cyber-green font-bold uppercase tracking-wider mb-1">
                      // {{ parseContent(item.content).part2?.header.toUpperCase() }}
                    </div>
                    <p class="text-slate-300 leading-relaxed font-sans select-text whitespace-pre-wrap">{{ parseContent(item.content).part2?.body }}</p>
                  </div>
                </div>

                <!-- Raw fallback -->
                <div v-else class="text-xs text-slate-300 leading-relaxed font-mono bg-bg-obsidian border border-slate-900 p-3 whitespace-pre-wrap select-text">
                  {{ item.content }}
                </div>
              </div>
            </div>
          </Transition>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.toast-enter-active, .toast-leave-active {
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
.toast-enter-from, .toast-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
.slide-enter-active,
.slide-leave-active {
  transition: max-height 0.25s ease-out, opacity 0.2s ease;
  max-height: 500px;
}
.slide-enter-from,
.slide-leave-to {
  max-height: 0;
  opacity: 0;
  overflow: hidden;
}
</style>
