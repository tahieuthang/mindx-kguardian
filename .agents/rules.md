# Project Rules: MindX OpsCoPilot (K-Guardian Extension)

This document contains rules and guidelines that MUST be strictly adhered to across all files in this repository.

---

## 1. Technical Stack Constraints
- **Runtime Environment:** Chrome Extension Manifest V3.
- **Build Tool:** Vite + `@crxjs/vite-plugin`.
- **Frontend Framework:** Vue 3 (Composition API, SFC `<script setup lang="ts">`).
- **Language:** TypeScript (TS). Strict type checks must be enabled. No usage of `any` unless absolutely necessary; use typed interfaces from `src/types/index.ts`.
- **Styling:** TailwindCSS. Avoid custom inline styles. Use pre-defined design tokens (fonts, colors).

---

## 2. DOM Parsing Specifications (SPEC Section 3.1)
Any attempt to extract ticket data from `https://hrm.mindx.edu.vn` MUST use the following DOM selectors path:
- **Parent Container:** `div.o_portal_wrap`
- **Sub-container:** `div.ticket_content`
- **Main Card:** `div#card`
- **Ticket Title:** `div#card_header > span.h3` (extract text content from the innermost span).
- **Ticket Description:** `div#card_body > div[name="description"]` (extract all text content inside this container).

If selectors are modified, fallback mechanisms must be implemented to prevent Extension crashes.

---

## 3. Database & API Key Rules (Supabase & Gemini)
- **Supabase Client Constraints:**
  - Standard Client (using `anon_key` in the Extension) can only:
    - `SELECT` from `knowledge_base` (Prod).
    - `INSERT` into `knowledge_queue` (Staging) with `status = 'pending'`.
  - Admin CLI / Scripts (`moderate.ts`, `seed.py`, `seed.ts`):
    - Must use the `service_role` key to modify `knowledge_base` directly, check duplicates, and update ticket queue statuses.
- **Gemini Embedding Constraints:**
  - Model: `gemini-embedding-2`.
  - Dimension: Exactly **768** dimensions.
  - API call parameters: Must explicitly specify `"outputDimensionality": 768` to avoid vector size mismatch in Postgres `vector(768)` fields.

---

## 4. Algorithmic Logic
- **Search Similarity:**
  - Must call the RPC function `match_documents` with a similarity threshold of `0.5`.
  - Sort results in descending order of similarity.
- **AI Deduplication:**
  - Must call the RPC function `check_duplicate_in_prod` with a similarity threshold of `0.8`.
  - If a duplicate exists (similarity > 0.8), annotate the record in `knowledge_queue.ai_notes` with the matching ID, title, and similarity percentage.

---

## 5. UI & UX Aesthetics (K-Guardian Theme)
- **Aesthetic Direction:** Cyber-industrial minimalist design.
- **Color Palette:** Deep obsidian backgrounds (`#090d16`, `#0f172a`), neon/amber warning details, cyber-green highlights (`#00ff66`), and high contrast borders.
- **Typography:**
  - Headings / Badges: `Space Grotesk`
  - Body Text: `Plus Jakarta Sans`
  - Technical / Meta Information: `Fira Code` (monospace)
- **Component Behaviors:**
  - Search results must render details lazily in an Accordion format.
  - Inside the accordion, cleanly segment information into **Nguyên nhân (Cause)** and **Hướng xử lý (Solution)**.
  - Buttons and inputs must have smooth hover transitions, glow effects, and micro-animations on interactive states.
