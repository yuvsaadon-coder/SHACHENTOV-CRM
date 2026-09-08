import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Modal } from '../components/ui/Modal'

describe('Modal', () => {
  it('renders nothing when closed', () => {
    const onClose = vi.fn()
    render(<Modal open={false} onClose={onClose}><p>content</p></Modal>)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders dialog with aria-modal when open', () => {
    const onClose = vi.fn()
    render(<Modal open={true} onClose={onClose}><p>content</p></Modal>)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })

  it('displays title and labels it aria-labelledby', () => {
    render(<Modal open={true} onClose={vi.fn()} title="כותרת בדיקה"><p>body</p></Modal>)
    expect(screen.getByText('כותרת בדיקה')).toBeInTheDocument()
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-labelledby', 'modal-title')
  })

  it('calls onClose when Escape key is pressed', () => {
    const onClose = vi.fn()
    render(<Modal open={true} onClose={onClose}><p>body</p></Modal>)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn()
    render(<Modal open={true} onClose={onClose}><p>body</p></Modal>)
    const backdrop = screen.getByRole('dialog').parentElement!
    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders close button when title is present', () => {
    render(<Modal open={true} onClose={vi.fn()} title="כותרת"><p>body</p></Modal>)
    expect(screen.getByRole('button', { name: 'סגור' })).toBeInTheDocument()
  })
})
