// Supplier price-quote analysis (owner request 19.11.2026). Shared by the browser and the Netlify function.

/** One priced line read from a supplier quote. */
export interface QuoteLine {
  /** Product name as written in the quote */
  name: string
  /** Price of ONE unit as it goes into a basket, as written (before the VAT decision below) */
  unitPrice: number | null
  /** true = includes VAT, false = before VAT, null = the quote does not say */
  vatIncluded: boolean | null
  /** Catalog product id this line is about, or null for a new product */
  matchId: string | null
  /** Suggested icon for a new product */
  emoji: string
  cat: 'dry' | 'fresh'
  /** 0..1, how sure the analysis is about the match and the price */
  confidence: number
  /** Short Hebrew note for the admin (pack size, unclear unit, …) */
  note: string
}

export interface CatalogEntry { id: string; name: string; price: number }

export type QuoteSource =
  | { kind: 'rows'; rows: string[][] }
  | { kind: 'text'; text: string }
  | { kind: 'file'; mediaType: string; base64: string }

export type VatMode = 'auto' | 'included' | 'excluded'
export const VAT_RATE = 0.18

/** record = keep the offer in the price history without touching the catalog (e.g. a cheaper offer exists) */
export type ProposalAction = 'update' | 'add' | 'record' | 'ignore'

export interface Proposal {
  key: string
  line: QuoteLine
  action: ProposalAction
  productId: string | null
  oldPrice: number | null
  newPrice: number | null
  /** for action 'add' */
  newName: string
  emoji: string
  cat: 'dry' | 'fresh'
  /** a cheaper offer already received for this product in the target period */
  cheaper: { price: number; supplier: string } | null
}
