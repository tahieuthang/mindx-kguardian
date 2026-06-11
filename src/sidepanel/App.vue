<script setup lang="ts">
import { ref } from 'vue'
import SearchView from './components/SearchView.vue'
import ContributionView from './components/ContributionView.vue'
import KnowledgeBaseView from './components/KnowledgeBaseView.vue'

type Tab = 'search' | 'contribute' | 'knowledge'
const activeTab = ref<Tab>('search')
</script>

<template>
  <div class="flex flex-col h-full bg-bg-obsidian text-slate-200 font-sans relative overflow-hidden cyber-grid">
    <!-- Top Decorative Scanline -->
    <div class="cyber-scanline"></div>

    <!-- Header -->
    <header class="flex items-center justify-between px-4 py-3.5 border-b border-slate-800 bg-bg-charcoal/80 backdrop-blur-md shrink-0 z-10">
      <div class="flex items-center gap-3">
        <!-- Technical hexagonal-like icon container -->
        <div class="w-7 h-7 bg-transparent border border-cyber-green/50 flex items-center justify-center shrink-0 relative overflow-hidden glow-green">
          <div class="absolute inset-0.5 bg-cyber-green/10"></div>
          <svg class="w-4 h-4 text-cyber-green" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>
        <div>
          <h1 class="text-sm font-bold font-display uppercase tracking-wider text-white leading-none">K-Guardian</h1>
          <p class="technical-label text-cyber-green/70 mt-1">OpsCoPilot V1.0</p>
        </div>
      </div>
      
      <!-- System status indicator -->
      <div class="flex items-center gap-1.5 px-2 py-0.5 border border-cyber-green/30 bg-cyber-green/5">
        <span class="w-1.5 h-1.5 rounded-full bg-cyber-green animate-pulse"></span>
        <span class="text-[9px] font-mono uppercase tracking-widest text-cyber-green font-medium">SYS_ONLINE</span>
      </div>
    </header>

    <!-- Tab Bar -->
    <nav class="flex shrink-0 border-b border-slate-800 bg-bg-obsidian z-10">
      <button
        id="tab-search"
        class="flex-1 py-3 text-xs font-semibold font-mono tracking-wider uppercase transition-all duration-200 cursor-pointer text-center relative"
        :class="activeTab === 'search'
          ? 'text-cyber-green border-b border-cyber-green bg-cyber-green/5'
          : 'text-slate-500 hover:text-slate-300 border-b border-transparent'"
        @click="activeTab = 'search'"
      >
        <span class="mr-1">⚡</span> [01] Search
      </button>
      <button
        id="tab-contribute"
        class="flex-1 py-3 text-xs font-semibold font-mono tracking-wider uppercase transition-all duration-200 cursor-pointer text-center relative"
        :class="activeTab === 'contribute'
          ? 'text-cyber-amber border-b border-cyber-amber bg-cyber-amber/5'
          : 'text-slate-500 hover:text-slate-300 border-b border-transparent'"
        @click="activeTab = 'contribute'"
      >
        <span class="mr-1">✏️</span> [02] Contribute
      </button>
      <button
        id="tab-knowledge"
        class="flex-1 py-3 text-xs font-semibold font-mono tracking-wider uppercase transition-all duration-200 cursor-pointer text-center relative"
        :class="activeTab === 'knowledge'
          ? 'text-cyber-cyan border-b border-cyber-cyan bg-cyber-cyan/5'
          : 'text-slate-500 hover:text-slate-300 border-b border-transparent'"
        @click="activeTab = 'knowledge'"
      >
        <span class="mr-1">📚</span> [03] Repository
      </button>
    </nav>

    <main class="flex-1 overflow-y-auto z-10 relative">
      <Transition name="fade" mode="out-in">
        <KeepAlive>
          <component :is="activeTab === 'search' ? SearchView : (activeTab === 'contribute' ? ContributionView : KnowledgeBaseView)" />
        </KeepAlive>
      </Transition>
    </main>

  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.fade-enter-from {
  opacity: 0;
  transform: translateY(4px);
}

.fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
