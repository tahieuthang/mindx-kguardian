import type { TicketContext } from '@/types'

/**
 * DOM path (per SPEC section 3.1):
 *  div.o_portal_wrap
 *    └─ div.ticket_content
 *         └─ div#card
 *              ├─ div#card_header > span.h3   → title
 *              └─ div#card_body > div[name="description"] → description
 */
export function parseTicketFromDOM(): TicketContext | null {
  try {
    const ticketContent = document.querySelector('#ticket_content')
    if (!ticketContent) return null

    const card = ticketContent.querySelector('#card')
    if (!card) return null

    const titleSpan = card.querySelector('#card_header span.h3')
    const title = titleSpan?.textContent?.trim() ?? ''

    const descriptionDiv = card.querySelector('#card_body div[name="description"]')
    const description = descriptionDiv?.textContent?.trim() ?? ''

    if (!title && !description) return null

    return { title, description }
  } catch (err) {
    console.warn('[dom-parser] Failed to parse ticket DOM:', err)
    return null
  }
}
