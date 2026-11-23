import { Component } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import styles from './ErrorBoundary.module.css';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      errorMessage: error?.message || 'An unexpected rendering error occurred.'
    };
  }

  handleReset = () => {
    this.setState({ hasError: false, errorMessage: '' });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className={styles.errorCard} role="alert">
          <div className={styles.iconCircle}>
            <AlertTriangle size={24} />
          </div>
          <div className={styles.content}>
            <h2 className={styles.title}>Unable to display this view</h2>
            <p className={styles.message}>{this.state.errorMessage}</p>
            <button type="button" className={styles.resetBtn} onClick={this.handleReset}>
              <RotateCcw size={15} />
              <span>Return to Home Overview</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
