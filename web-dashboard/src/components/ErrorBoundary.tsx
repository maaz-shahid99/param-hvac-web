import { Component, type ErrorInfo, type ReactNode } from "react";
import Icon from "./Icon";

/**
 * Catches a render-time crash in one page and shows a recoverable panel instead
 * of an empty white document.
 *
 * The app renders values straight from unvalidated JSON, so a single malformed
 * row — a router whose BME sensor returned null, say — could throw a TypeError
 * during render. With no boundary anywhere in the tree, React unmounted
 * everything and the operator was left staring at a blank page with no error, no
 * navigation and no way back except a manual reload. On a monitoring product
 * that is indistinguishable from the server being down.
 *
 * Reset is keyed on `resetKey` (the route path), so navigating elsewhere clears
 * the error rather than trapping the user on the broken screen.
 */
type Props = { children: ReactNode; resetKey?: string };
type State = { error: Error | null };

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep the detail in the console for whoever is debugging; the UI stays calm.
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="page">
        <div className="card">
          <div className="hd hd-ico">
            <Icon name="error" size={18} /> This page hit an error
          </div>
          <div className="bd">
            <p className="muted" style={{ marginTop: 0 }}>
              Something in the data on this page could not be displayed. The rest of the
              dashboard still works — use the sidebar to switch pages, or try again.
            </p>
            <pre
              className="small mono"
              style={{
                whiteSpace: "pre-wrap",
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                padding: 12,
                overflowX: "auto",
              }}
            >
              {error.message || String(error)}
            </pre>
            <div className="btnrow" style={{ marginTop: 12 }}>
              <button onClick={() => this.setState({ error: null })}>Try again</button>
              <button className="secondary" onClick={() => window.location.reload()}>
                Reload
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
