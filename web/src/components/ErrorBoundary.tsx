import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  fallback: ReactNode;
  children: ReactNode;
};

type State = {
  hasError: boolean;
};

/**
 * Catches errors thrown during render of its children (e.g. useGLTF failing to
 * load a missing kitchen.glb) and shows the fallback instead.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.warn(
      "[Kitchen Studio] Model failed to load — showing placeholder geometry.",
      error.message,
      info.componentStack,
    );
  }

  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}
