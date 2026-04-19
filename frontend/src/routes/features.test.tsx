import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FeaturesPage } from './features'
import { features } from '@/lib/features/catalog'

describe('FeaturesPage', () => {
  it('renders a card for every feature in the catalog', () => {
    render(<FeaturesPage />)

    for (const f of features) {
      // Assert the English title appears somewhere on the page. Using
      // getAllByText so duplicate phrases (unlikely but possible in future
      // additions) don't break the test.
      expect(screen.getAllByText(f.title_en).length).toBeGreaterThan(0)
    }
  })

  it('shows a "live / total" header counter', () => {
    render(<FeaturesPage />)
    const liveCount = features.filter((f) => f.status === 'live').length
    const total = features.length
    expect(screen.getByText(new RegExp(`${liveCount}\\s*/\\s*${total}`))).toBeInTheDocument()
  })
})
