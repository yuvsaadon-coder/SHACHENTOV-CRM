import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props { children: ReactNode; label?: string }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700" dir="rtl">
        <p className="font-semibold">{this.props.label ?? 'אירעה שגיאה בטעינת החלק הזה'}</p>
        <p className="text-xs mt-1 text-red-500" dir="ltr">{this.state.error.message}</p>
        <button onClick={() => this.setState({ error: null })} className="mt-3 text-xs px-3 py-1.5 rounded-lg border border-red-300 hover:bg-red-100">נסה שוב</button>
      </div>
    )
  }
}
