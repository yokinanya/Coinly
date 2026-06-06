import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  readonly children: ReactNode;
}

interface ErrorBoundaryState {
  readonly error?: Error;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {};

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Coinly render error", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="grid min-h-screen place-items-center bg-(--color-background) px-4 text-(--color-text)">
        <section className="panel max-w-md space-y-4 p-5">
          <div>
            <h1 className="text-lg font-semibold">页面出现异常</h1>
            <p className="mt-2 text-sm text-(--color-text-secondary)">当前视图渲染失败，可以刷新页面回到最近保存的账本状态。</p>
          </div>
          <p className="rounded-md bg-(--color-surface-muted) p-3 text-xs text-(--color-text-secondary)">
            {this.state.error.message || "未知错误"}
          </p>
          <button
            className="ui-button border-(--color-accent) bg-(--color-accent) text-white hover:bg-(--color-accent-hover)"
            type="button"
            onClick={() => window.location.reload()}
          >
            刷新页面
          </button>
        </section>
      </main>
    );
  }
}