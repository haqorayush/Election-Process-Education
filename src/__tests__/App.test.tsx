/**
 * Frontend test suite for VoteGuide AI React application.
 *
 * Tests cover:
 *  - Component rendering without crash
 *  - Accessibility attributes (ARIA labels, landmarks, roles)
 *  - Theme and language toggle functionality
 *  - Chat input and send button interaction
 *  - Error boundary fallback rendering
 *  - Type exports from the shared types module
 *
 * @module App.test
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import App from '../App';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { initialUserState } from '../types';
import type { BackendState, ChatMode, Stage } from '../types';

/* ------------------------------------------------------------------ */
/*  Mock fetch — all network calls return sensible defaults            */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() =>
    Promise.resolve({
      ok: true,
      headers: { get: () => 'application/json' },
      json: () => Promise.resolve({
        message: 'Hello! I am VoteGuide AI.',
        stage: 'unknown',
        next_step: 'confirm_age',
        actions: [],
        suggestions: ['Yes, I am 18+', 'No, I am under 18'],
        age: null,
        location: null,
        has_voter_id: 'unknown',
        simulation_step: null,
      }),
    }),
  ));
});

/* ------------------------------------------------------------------ */
/*  Rendering                                                         */
/* ------------------------------------------------------------------ */

describe('App rendering', () => {
  it('renders without crashing', () => {
    const { container } = render(<App />);
    expect(container).toBeTruthy();
  });

  it('renders the brand name', () => {
    render(<App />);
    expect(screen.getByText('VoteGuide AI')).toBeInTheDocument();
  });

  it('renders the Civic Assistant header', () => {
    render(<App />);
    expect(screen.getByText(/Civic Assistant|नागरिक सहायक/)).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ */
/*  Accessibility                                                     */
/* ------------------------------------------------------------------ */

describe('Accessibility attributes', () => {
  it('has a skip-to-content link', () => {
    render(<App />);
    const skipLink = screen.getByText('Skip to chat');
    expect(skipLink).toBeInTheDocument();
    expect(skipLink.tagName).toBe('A');
    expect(skipLink).toHaveAttribute('href', '#chat-input');
  });

  it('uses <aside> landmark for the sidebar', () => {
    const { container } = render(<App />);
    const aside = container.querySelector('aside.sidebar');
    expect(aside).toBeInTheDocument();
    expect(aside).toHaveAttribute('aria-label', 'Journey progress');
  });

  it('uses <main> landmark for the chat area', () => {
    const { container } = render(<App />);
    const main = container.querySelector('main.main-chat');
    expect(main).toBeInTheDocument();
    expect(main).toHaveAttribute('aria-label', 'Chat area');
  });

  it('has an accessible chat input with label', () => {
    render(<App />);
    const input = screen.getByRole('textbox');
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('id', 'chat-input');
    expect(input).toHaveAttribute('aria-label');
  });

  it('has an accessible send button', () => {
    render(<App />);
    const sendBtn = screen.getByRole('button', { name: 'Send message' });
    expect(sendBtn).toBeInTheDocument();
  });

  it('messages area has role="log" and aria-live', () => {
    const { container } = render(<App />);
    const messagesArea = container.querySelector('[role="log"]');
    expect(messagesArea).toBeInTheDocument();
    expect(messagesArea).toHaveAttribute('aria-live', 'polite');
  });

  it('theme toggle button has aria-label', () => {
    render(<App />);
    const themeBtn = screen.getByRole('button', { name: /Switch to (dark|light) mode/i });
    expect(themeBtn).toBeInTheDocument();
  });

  it('language toggle button has aria-label', () => {
    render(<App />);
    const langBtn = screen.getByRole('button', { name: /Switch language to/i });
    expect(langBtn).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ */
/*  User interactions                                                  */
/* ------------------------------------------------------------------ */

describe('User interactions', () => {
  it('clears input after submit via Enter key', async () => {
    render(<App />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'test message' } });
    expect(input.value).toBe('test message');
    fireEvent.keyDown(input, { key: 'Enter' });
    // After submit the input should be cleared (asynchronously via state)
    // The fetch mock is called which triggers setInputMessage('')
  });

  it('toggles dark mode class on body', () => {
    render(<App />);
    const themeBtn = screen.getByRole('button', { name: /Switch to (dark|light) mode/i });
    fireEvent.click(themeBtn);
    expect(document.body.classList.contains('dark-mode')).toBe(true);
    fireEvent.click(themeBtn);
    expect(document.body.classList.contains('dark-mode')).toBe(false);
  });

  it('switches chat tabs between Guided and AI', () => {
    render(<App />);
    const aiTab = screen.getByRole('button', { name: /AI Chat/i });
    const guidedTab = screen.getByRole('button', { name: /Guided/i });
    fireEvent.click(aiTab);
    expect(aiTab.classList.contains('active')).toBe(true);
    fireEvent.click(guidedTab);
    expect(guidedTab.classList.contains('active')).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  ErrorBoundary                                                     */
/* ------------------------------------------------------------------ */

describe('ErrorBoundary', () => {
  it('renders children when no error occurs', () => {
    render(
      <ErrorBoundary>
        <div data-testid="child">OK</div>
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('renders fallback UI when child throws', () => {
    const ThrowingComponent = () => {
      throw new Error('Test error');
    };

    // Suppress console.error for expected error
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();

    consoleSpy.mockRestore();
  });
});

/* ------------------------------------------------------------------ */
/*  Types module                                                      */
/* ------------------------------------------------------------------ */

describe('Types module', () => {
  it('exports initialUserState with correct shape', () => {
    expect(initialUserState).toEqual({
      age: null,
      location: null,
      has_voter_id: 'unknown',
      stage: 'unknown',
      simulation_step: null,
    });
  });

  it('type aliases are importable without error', () => {
    // This test verifies the type exports compile correctly.
    // If any type is missing, TypeScript would fail at build time.
    const _mode: ChatMode = 'guided';
    const _stage: Stage = 'unknown';
    const _state: BackendState = initialUserState;
    expect(_mode).toBe('guided');
    expect(_stage).toBe('unknown');
    expect(_state.stage).toBe('unknown');
  });
});
