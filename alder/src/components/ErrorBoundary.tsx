import { Component, type ReactNode } from 'react';

interface Props { children: ReactNode; resetKey?: string }
interface State { error: Error | null; armed: boolean }

/** If a page throws, say so in words instead of going blank, and offer a way out. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, armed: false };
  static getDerivedStateFromError(error: Error): Partial<State> { return { error }; }
  componentDidUpdate(prev: Props) { if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null, armed: false }); }
  render() {
    const { error, armed } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="mx-auto max-w-xl px-4 py-10">
        <p className="kicker">Something broke</p>
        <h1 className="mt-1.5 display text-3xl">This page hit an error</h1>
        <p className="mt-2 text-sm text-muted">Your rooms and lists are still saved. Try the page again; if it keeps happening, the message below helps fix it.</p>
        <pre className="field mt-4 overflow-x-auto whitespace-pre-wrap font-mono text-xs">{error.message || String(error)}</pre>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="inline-flex min-h-11 items-center rounded-lg bg-fg px-4 text-sm font-medium text-bg" onClick={() => this.setState({ error: null })}>Try again</button>
          <a href="#/" className="inline-flex min-h-11 items-center rounded-lg border border-line bg-surface px-4 text-sm font-medium" onClick={() => setTimeout(() => this.setState({ error: null }), 0)}>Back to the Overview</a>
          {armed ? (
            <button type="button" className="inline-flex min-h-11 items-center rounded-lg border border-stop/40 px-4 text-sm font-medium text-stop" onClick={() => { try { localStorage.removeItem('alder-atelier-v2'); } catch { /* storage may be blocked */ } location.hash = '#/'; location.reload(); }}>Yes, erase everything and start over</button>
          ) : (
            <button type="button" className="inline-flex min-h-11 items-center rounded-lg px-4 text-sm text-muted" onClick={() => this.setState({ armed: true })}>Erase saved data</button>
          )}
        </div>
      </div>
    );
  }
}
