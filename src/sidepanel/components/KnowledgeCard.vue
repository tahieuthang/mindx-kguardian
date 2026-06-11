<script setup lang="ts">
import { ref, computed } from 'vue'
import type { KnowledgeResult } from '@/types'

const props = defineProps<{
  result: KnowledgeResult
}>()

const isExpanded = ref(false)

const similarityPercent = Math.round(props.result.similarity * 100)

// Cyberpunk similarity formatting
const similarityColor = computed(() => {
  if (similarityPercent >= 80) return 'text-cyber-green border-cyber-green/40 bg-cyber-green/5'
  if (similarityPercent >= 60) return 'text-cyber-amber border-cyber-amber/40 bg-cyber-amber/5'
  return 'text-slate-500 border-slate-800 bg-transparent'
})

// Dynamic parser to split content into up to 2 sections by "1." and "2." tags
const parsedInfo = computed(() => {
  const text = props.result.content.trim()
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
})

const copiedCause = ref(false)
const copiedSolution = ref(false)
const copiedRaw = ref(false)

async function copyText(text: string, type: 'cause' | 'solution' | 'raw') {
  try {
    await navigator.clipboard.writeText(text)
    if (type === 'cause') {
      copiedCause.value = true
      setTimeout(() => copiedCause.value = false, 2000)
    } else if (type === 'solution') {
      copiedSolution.value = true
      setTimeout(() => copiedSolution.value = false, 2000)
    } else {
      copiedRaw.value = true
      setTimeout(() => copiedRaw.value = false, 2000)
    }
  } catch (err) {
    console.error('Failed to copy: ', err)
  }
}
</script>

<template>
  <div
    class="border border-slate-800 bg-bg-charcoal/50 overflow-hidden transition-all duration-200 hover:border-cyber-green/30 glow-green-hover relative group"
  >
    <!-- Sharp corner indicators on hover -->
    <div class="absolute top-0 left-0 w-1 h-1 bg-cyber-green opacity-0 group-hover:opacity-100 transition-opacity"></div>
    <div class="absolute bottom-0 right-0 w-1 h-1 bg-cyber-green opacity-0 group-hover:opacity-100 transition-opacity"></div>

    <!-- Card Header -->
    <button
      :id="`card-toggle-${result.id}`"
      class="w-full px-4 py-3.5 text-left flex items-start gap-3.5 cursor-pointer"
      @click="isExpanded = !isExpanded"
    >
      <!-- Similarity Badge -->
      <span
        class="shrink-0 mt-0.5 text-[9px] font-bold font-mono px-2 py-0.5 border"
        :class="similarityColor"
      >
        {{ similarityPercent }}% MATCH
      </span>

      <!-- Title & Reporter -->
      <div class="flex-1 min-w-0">
        <h3 class="text-sm font-semibold text-slate-100 leading-snug group-hover:text-cyber-green transition-colors font-display">
          {{ result.title }}
        </h3>
        <div class="flex items-center gap-3 mt-1.5 font-mono text-[9px] text-slate-500">
          <span>// BY: {{ result.reporter.toUpperCase() }}</span>
          <span class="text-slate-700">|</span>
          <span>ID: {{ String(result.id).padStart(4, '0') }}</span>
        </div>
      </div>

      <!-- Expand Arrow -->
      <svg
        class="shrink-0 w-4 h-4 text-slate-600 mt-0.5 transition-transform duration-300 group-hover:text-cyber-green"
        :class="{ 'rotate-180 text-cyber-green!': isExpanded }"
        fill="none" viewBox="0 0 24 24" stroke="currentColor"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
      </svg>
    </button>

    <!-- Accordion Content -->
    <Transition name="slide">
      <div
        v-if="isExpanded"
        class="px-4 pb-4 pt-1.5 border-t border-slate-900 bg-bg-obsidian/40"
      >
        <div v-if="parsedInfo.isParsed" class="space-y-3 mt-2 text-xs">
          <!-- Section 1 -->
          <div v-if="parsedInfo.part1" class="border-l-2 border-cyber-amber/55 bg-cyber-amber/5 px-3 py-2 relative group/section">
            <div class="flex justify-between items-center mb-1">
              <div class="font-mono text-[9px] text-cyber-amber font-bold uppercase tracking-wider">
                // {{ parsedInfo.part1.header.toUpperCase() }}
              </div>
              <button
                type="button"
                class="text-[9px] font-mono text-cyber-amber/70 hover:text-cyber-amber border border-cyber-amber/20 hover:border-cyber-amber/50 bg-cyber-amber/5 px-1.5 py-0.5 cursor-pointer opacity-0 group-hover/section:opacity-100 transition-opacity duration-150 active:scale-95"
                @click="copyText(parsedInfo.part1.body, 'cause')"
              >
                {{ copiedCause ? '[ COPIED ]' : '[ COPY ]' }}
              </button>
            </div>
            <p class="text-slate-300 leading-relaxed font-sans select-text">{{ parsedInfo.part1.body }}</p>
          </div>

          <!-- Section 2 -->
          <div v-if="parsedInfo.part2" class="border-l-2 border-cyber-green/55 bg-cyber-green/5 px-3 py-2 relative group/section">
            <div class="flex justify-between items-center mb-1">
              <div class="font-mono text-[9px] text-cyber-green font-bold uppercase tracking-wider">
                // {{ parsedInfo.part2.header.toUpperCase() }}
              </div>
              <button
                type="button"
                class="text-[9px] font-mono text-cyber-green/70 hover:text-cyber-green border border-cyber-green/20 hover:border-cyber-green/50 bg-cyber-green/5 px-1.5 py-0.5 cursor-pointer opacity-0 group-hover/section:opacity-100 transition-opacity duration-150 active:scale-95"
                @click="copyText(parsedInfo.part2.body, 'solution')"
              >
                {{ copiedSolution ? '[ COPIED ]' : '[ COPY ]' }}
              </button>
            </div>
            <p class="text-slate-300 leading-relaxed font-sans select-text">{{ parsedInfo.part2.body }}</p>
          </div>
        </div>

        <!-- Raw fallback -->
        <div v-else class="mt-3 relative group/section">
          <button
            type="button"
            class="absolute top-2 right-2 text-[9px] font-mono text-slate-500 hover:text-cyber-green border border-slate-800 hover:border-cyber-green/50 bg-bg-charcoal/80 px-1.5 py-0.5 cursor-pointer opacity-0 group-hover/section:opacity-100 transition-opacity duration-150 active:scale-95"
            @click="copyText(parsedInfo.raw || '', 'raw')"
          >
            {{ copiedRaw ? '[ COPIED ]' : '[ COPY ]' }}
          </button>
          <div class="text-xs text-slate-300 leading-relaxed font-mono bg-bg-obsidian border border-slate-900 p-3 whitespace-pre-wrap select-text">
            {{ parsedInfo.raw }}
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.slide-enter-active,
.slide-leave-active {
  transition: max-height 0.25s ease-out, opacity 0.2s ease;
  max-height: 400px;
}

.slide-enter-from,
.slide-leave-to {
  max-height: 0;
  opacity: 0;
  overflow: hidden;
}
</style>
