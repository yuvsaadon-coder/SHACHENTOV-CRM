import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { ToastProvider, useToast } from '../context/ToastContext'

function ToastTrigger({ message, type }: { message: string; type?: 'success' | 'error' | 'info' }) {
  const { toast } = useToast()
  return <button onClick={() => toast(message, type)}>show</button>
}

function Wrapper({ message = 'hello', type }: { message?: string; type?: 'success' | 'error' | 'info' }) {
  return (
    <ToastProvider>
      <ToastTrigger message={message} type={type} />
    </ToastProvider>
  )
}

describe('ToastProvider', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('shows a toast message when triggered', () => {
    render(<Wrapper message="הצלחה" type="success" />)
    fireEvent.click(screen.getByRole('button', { name: 'show' }))
    expect(screen.getByRole('alert')).toHaveTextContent('הצלחה')
  })

  it('auto-dismisses after 4 seconds', () => {
    render(<Wrapper message="זמני" type="info" />)
    fireEvent.click(screen.getByRole('button', { name: 'show' }))
    expect(screen.getByRole('alert')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(4000) })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('can be manually dismissed before auto-dismiss', () => {
    render(<Wrapper message="בדיקה" type="error" />)
    fireEvent.click(screen.getByRole('button', { name: 'show' }))
    expect(screen.getByRole('alert')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'סגור הודעה' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows multiple toasts simultaneously', () => {
    render(<Wrapper message="ראשון" />)
    const btn = screen.getByRole('button', { name: 'show' })
    fireEvent.click(btn)
    fireEvent.click(btn)
    fireEvent.click(btn)
    expect(screen.getAllByRole('alert')).toHaveLength(3)
  })

  it('throws when used outside ToastProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const Bad = () => { useToast(); return null }
    expect(() => render(<Bad />)).toThrow('useToast must be used inside ToastProvider')
    spy.mockRestore()
  })
})
