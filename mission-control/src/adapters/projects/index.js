import { EmperorOsAdapter } from './emperor-os/EmperorOsAdapter.js'
import { PolymarketAdapter } from './polymarket/PolymarketAdapter.js'
import { FuturePlaceholderAdapter } from './future-placeholder/FuturePlaceholderAdapter.js'

/** @type {Readonly<Record<string, import('./ProjectAdapter.js').ProjectAdapter>>} */
export const PROJECT_ADAPTER_REGISTRY = Object.freeze({
  emperor_os: new EmperorOsAdapter(),
  polymarket: new PolymarketAdapter(),
  future_placeholder: new FuturePlaceholderAdapter(),
})

export function getProjectAdapters() {
  return Object.values(PROJECT_ADAPTER_REGISTRY)
}

export function getProjectAdapterBySlug(slug) {
  return getProjectAdapters().find((adapter) => adapter.getMetadata().slug === slug) || null
}

export function getProjectsMetadataFromAdapters() {
  return getProjectAdapters()
    .map((adapter) => adapter.getMetadata())
    .sort((a, b) => Number(a.displayOrder || 0) - Number(b.displayOrder || 0))
}
