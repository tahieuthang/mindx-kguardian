<script setup lang="ts">
import { ref, computed } from 'vue'
import { generateEmbedding, buildEmbeddingInput } from '@/composables/useGemini'
import { submitToQueue } from '@/composables/useSupabase'

const title = ref('')
const content = ref('')
const reporter = ref('')
const isSubmitting = ref(false)
const isMaximized = ref(false)
const toast = ref<{ type: 'success' | 'error'; message: string } | null>(null)

const isFormValid = computed(
  () => title.value.trim() !== '' && content.value.trim() !== '' && reporter.value.trim() !== '',
)

let toastTimer: ReturnType<typeof setTimeout> | null = null

function showToast(type: 'success' | 'error', message: string): void {
  if (toastTimer) clearTimeout(toastTimer)
  toast.value = { type, message }
  toastTimer = setTimeout(() => {
    toast.value = null
  }, 4000)
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
      content.value = newValue
      setTimeout(() => {
        target.focus()
        target.selectionStart = target.selectionEnd = selectionStart + insertText.length
      }, 0)
    }
  }
}

function clearForm() {
  title.value = ''
  content.value = ''
  reporter.value = ''
}

async function handleSubmit(): Promise<void> {
  if (!isFormValid.value || isSubmitting.value) return

  if (!validateKnowledgeFormat(content.value)) {
    showToast('error', 'SAI ĐỊNH DẠNG: Tri thức phải chứa ít nhất một mục bắt đầu bằng "1." hoặc "2." (ví dụ: Nguyên nhân/Cách xử lý). Nếu có cả hai mục, bắt buộc phải xuống dòng phân tách.')
    return
  }

  isSubmitting.value = true

  try {
    const embeddingInput = buildEmbeddingInput(title.value, content.value)
    const embedding = await generateEmbedding(embeddingInput)

    await submitToQueue({
      title: title.value.trim(),
      content: content.value.trim(),
      reporter: reporter.value.trim(),
      embedding,
    })

    // Reset form on success
    title.value = ''
    content.value = ''
    reporter.value = ''
    showToast('success', 'ĐÓNG GÓP THÀNH CÔNG: Đã chuyển tới hàng đợi phê duyệt của Admin.')
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Lỗi hệ thống không xác định.'
    showToast('error', `GỬI THẤT BẠI: ${message}`)
  } finally {
    isSubmitting.value = false
  }
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
          <div class="font-bold mb-0.5">{{ toast.type === 'success' ? 'TRANSMISSION_SUCCESS' : 'TRANSMISSION_ERROR' }}</div>
          <p class="font-sans text-[11px] text-slate-300 leading-normal">{{ toast.message }}</p>
        </div>
      </div>
    </Transition>

    <!-- Description -->
    <div class="border border-slate-800 bg-bg-charcoal/20 px-3 py-2.5 font-mono text-[10px] text-slate-400 leading-normal">
      <span class="text-cyber-amber font-bold">// SYSTEM_LOG:</span> Chia sẻ giải pháp để xây dựng cơ sở dữ liệu xử lý sự cố. Mọi bản ghi sẽ đi qua hệ thống kiểm duyệt (Staging Queue) trước khi tích hợp vào lõi Production.
    </div>

    <!-- Form -->
    <div class="space-y-4">

      <!-- Title Input -->
      <div class="space-y-1.5">
        <label for="contrib-title" class="technical-label text-slate-500 font-mono">
          // FIELD: TICKET_TITLE <span class="text-cyber-amber">*</span>
        </label>
        <div class="relative">
          <input
            id="contrib-title"
            v-model="title"
            type="text"
            placeholder="VD: Lỗi kế toán không đối soát được payment..."
            class="w-full bg-bg-charcoal border border-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyber-amber/60 transition-all duration-200 font-sans"
          />
          <div class="absolute right-0 bottom-0 top-0 w-1 bg-cyber-amber/20"></div>
        </div>
      </div>

      <!-- Content Textarea -->
      <div class="space-y-1.5">
        <div class="flex justify-between items-center">
          <label for="contrib-content" class="technical-label text-slate-500 font-mono">
            // FIELD: CAUSE_AND_RESOLUTION <span class="text-cyber-amber">*</span>
          </label>
          <button
            type="button"
            class="text-[9px] font-mono text-cyber-amber/80 hover:text-cyber-amber border border-cyber-amber/35 hover:border-cyber-amber bg-cyber-amber/5 px-2 py-0.5 cursor-pointer uppercase transition-all duration-150 active:scale-95"
            @click="isMaximized = true"
          >
            🔎 [ EXPAND ]
          </button>
        </div>
        <div class="relative">
          <textarea
            id="contrib-content"
            v-model="content"
            rows="6"
            placeholder="1. Nguyên nhân:&#10;Mô tả nguyên nhân gây ra lỗi...&#10;&#10;2. Cách xử lý:&#10;Các bước xử lý cụ thể..."
            class="w-full bg-bg-charcoal border border-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyber-amber/60 transition-all duration-200 resize-none font-sans"
            @keydown="handleKeyDown"
          />
          <div class="absolute right-0 bottom-0 top-0 w-1 bg-cyber-amber/20"></div>
        </div>
      </div>

      <!-- Reporter Input -->
      <div class="space-y-1.5">
        <label for="contrib-reporter" class="technical-label text-slate-500 font-mono">
          // FIELD: REPORTER_IDENTITY <span class="text-cyber-amber">*</span>
        </label>
        <div class="relative">
          <input
            id="contrib-reporter"
            v-model="reporter"
            type="text"
            placeholder="Nhập tên/tài khoản của bạn..."
            class="w-full bg-bg-charcoal border border-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyber-amber/60 transition-all duration-200 font-sans"
          />
          <div class="absolute right-0 bottom-0 top-0 w-1 bg-cyber-amber/20"></div>
        </div>
      </div>

    </div>

    <!-- Actions Button Group -->
    <div class="flex gap-3">
      <!-- Clear Button -->
      <button
        type="button"
        class="w-1/3 py-3 border border-cyber-red/50 text-cyber-red/80 hover:text-cyber-red bg-cyber-red/5 font-mono text-xs font-semibold tracking-wider uppercase transition-all duration-200 cursor-pointer hover:bg-cyber-red/10 active:scale-[0.99] text-center"
        @click="clearForm"
      >
        🗑️ [ CLEAR ]
      </button>

      <!-- Submit Button -->
      <button
        id="contrib-submit-btn"
        :disabled="!isFormValid || isSubmitting"
        class="flex-1 py-3 border border-cyber-amber text-cyber-amber bg-cyber-amber/5 font-mono text-xs font-semibold tracking-widest uppercase transition-all duration-200 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed hover:bg-cyber-amber hover:text-bg-obsidian relative overflow-hidden group active:scale-[0.99]"
        @click="handleSubmit"
      >
        <div class="absolute inset-0 bg-cyber-amber/10 transform -skew-x-12 translate-x-full group-hover:translate-x-[-150%] transition-transform duration-1000"></div>

        <span v-if="isSubmitting" class="flex items-center justify-center gap-2">
          <span class="inline-block w-2.5 h-2.5 border-2 border-bg-obsidian border-t-transparent rounded-full animate-spin"></span>
          [ TRANSMITTING... ]
        </span>
        <span v-else-if="!isFormValid" class="text-slate-600">[ INCOMPLETE ]</span>
        <span v-else>⚡ [ TRANSMIT ]</span>
      </button>
    </div>

    <div class="font-mono text-[9px] text-slate-600 text-center uppercase tracking-wider">
      // PROTOCOL_STATUS: STAGING_QUEUE_ACTIVE
    </div>

    <!-- Fullscreen Zoom Editor Overlay -->
    <Transition name="fade">
      <div
        v-if="isMaximized"
        class="fixed inset-0 z-50 bg-bg-obsidian/95 backdrop-blur-md p-4 flex flex-col space-y-4"
      >
        <div class="flex justify-between items-center border-b border-slate-800 pb-2.5">
          <span class="font-mono text-xs text-cyber-amber font-bold">// EDITOR_FULLSCREEN</span>
          <button
            type="button"
            class="text-[9px] font-mono text-cyber-red/80 hover:text-cyber-red border border-cyber-red/30 hover:border-cyber-red px-2 py-0.5 bg-cyber-red/5 cursor-pointer transition-colors"
            @click="isMaximized = false"
          >
            [ ESC_CLOSE ]
          </button>
        </div>

        <div class="flex-1 flex flex-col space-y-1.5">
          <label class="technical-label text-slate-500 font-mono">
            // EDITING: content_matrix (D_TEXT)
          </label>
          <textarea
            v-model="content"
            placeholder="1. Nguyên nhân:&#10;Mô tả nguyên nhân gây ra lỗi...&#10;&#10;2. Cách xử lý:&#10;Các bước xử lý cụ thể..."
            class="flex-1 w-full bg-bg-charcoal border border-cyber-amber/40 p-4 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyber-amber transition-all font-mono leading-relaxed resize-none"
            @keydown="handleKeyDown"
          />
        </div>

        <button
          type="button"
          class="w-full py-2.5 border border-cyber-amber text-cyber-amber bg-cyber-amber/5 font-mono text-xs font-semibold tracking-wider uppercase transition-all duration-200 cursor-pointer hover:bg-cyber-amber hover:text-bg-obsidian text-center"
          @click="isMaximized = false"
        >
          ⚡ [ SAVE_AND_MINIMIZE ]
        </button>
      </div>
    </Transition>

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
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
  transform: scale(0.98);
}
</style>
