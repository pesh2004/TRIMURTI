import { describe, it, expect } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from './tabs'

function Harness() {
  return (
    <Tabs defaultValue="one">
      <TabsList>
        <TabsTrigger value="one">One</TabsTrigger>
        <TabsTrigger value="two">Two</TabsTrigger>
      </TabsList>
      <TabsContent value="one">first panel</TabsContent>
      <TabsContent value="two">second panel</TabsContent>
    </Tabs>
  )
}

describe('Tabs', () => {
  it('renders the default panel and hides the others', () => {
    render(<Harness />)
    expect(screen.getByText('first panel')).toBeInTheDocument()
    expect(screen.queryByText('second panel')).not.toBeInTheDocument()
  })

  it('switches panels on trigger click', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('tab', { name: /two/i }))
    expect(screen.getByText('second panel')).toBeInTheDocument()
    expect(screen.queryByText('first panel')).not.toBeInTheDocument()
  })

  it('marks the active trigger via aria-selected', () => {
    render(<Harness />)
    expect(screen.getByRole('tab', { name: /one/i })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: /two/i })).toHaveAttribute('aria-selected', 'false')
  })

  it('ignores disabled triggers', () => {
    render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">A</TabsTrigger>
          <TabsTrigger value="b" disabled>B</TabsTrigger>
        </TabsList>
        <TabsContent value="a">panel A</TabsContent>
        <TabsContent value="b">panel B</TabsContent>
      </Tabs>,
    )
    fireEvent.click(screen.getByRole('tab', { name: /b/i }))
    expect(screen.getByText('panel A')).toBeInTheDocument()
  })
})
