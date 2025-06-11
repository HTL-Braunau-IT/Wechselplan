import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import PDFLayout from './PDFLayout';

// Mock any external browser API used in PDFLayout
beforeAll(() => {
  jest.spyOn(window, 'print').mockImplementation(() => {});
});

afterAll(() => {
  window.print.mockRestore();
});

afterEach(() => {
  cleanup();
  jest.resetAllMocks();
});

describe('PDFLayout', () => {
  it('matches snapshot with minimal props', () => {
    const { asFragment } = render(<PDFLayout><div>Content</div></PDFLayout>);
    expect(asFragment()).toMatchSnapshot();
  });

  it('renders header, content, and footer in correct order', () => {
    render(
      <PDFLayout
        header={<header>Header</header>}
        footer={<footer>Footer</footer>}
      >
        <main>Main Content</main>
      </PDFLayout>
    );
    const header = screen.getByText('Header');
    const main = screen.getByText('Main Content');
    const footer = screen.getByText('Footer');
    expect(header).toBeInTheDocument();
    expect(main).toBeInTheDocument();
    expect(footer).toBeInTheDocument();
    // header should precede main, and main should precede footer
    expect(header.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(main.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('handles missing optional props without errors', () => {
    expect(() => render(<PDFLayout />)).not.toThrow();
  });

  it('calls onRenderComplete callback once after render', () => {
    const onRenderComplete = jest.fn();
    render(
      <PDFLayout onRenderComplete={onRenderComplete}>
        <div>Test</div>
      </PDFLayout>
    );
    expect(onRenderComplete).toHaveBeenCalledTimes(1);
  });

  it('displays loading state when loading prop is true', () => {
    render(<PDFLayout loading>Loading...</PDFLayout>);
    expect(screen.getByText(/loading\.\.\.|loading/i)).toBeInTheDocument();
  });

  it('displays error state when error prop is provided', () => {
    render(<PDFLayout error>Error occurred</PDFLayout>);
    expect(screen.getByText(/error occurred/i)).toBeInTheDocument();
  });

  it('renders very long text and special characters correctly', () => {
    const longText = 'A'.repeat(1000) + ' © €';
    render(<PDFLayout>{longText}</PDFLayout>);
    expect(screen.getByText(/A{10}/)).toBeInTheDocument();
    expect(screen.getByText('©')).toBeInTheDocument();
    expect(screen.getByText('€')).toBeInTheDocument();
  });

  it('shows fallback UI when child throws an error', () => {
    const ProblemChild = () => { throw new Error('Test'); };
    render(
      <PDFLayout>
        <ProblemChild />
      </PDFLayout>
    );
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
  });

  it('is accessible with basic a11y checks', () => {
    const { container } = render(<PDFLayout><div>Accessible Content</div></PDFLayout>);
    // Basic accessibility check: ensure a landmark or document role exists
    expect(container.querySelector('[role="document"], [aria-label]')).toBeInTheDocument();
  });
});