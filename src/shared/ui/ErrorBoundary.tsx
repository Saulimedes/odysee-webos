import { Component, type ReactNode } from 'react';
import { t } from '@/shared/i18n';

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('Screen crashed', error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="emptyState">
        <div className="emptyState__title">{t('Something went wrong')}</div>
        <div className="emptyState__hint">{this.state.error.message}</div>
      </div>
    );
  }
}
