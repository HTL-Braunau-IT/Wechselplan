import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import PDFLayout from '../PDFLayout';

describe('PDFLayout', () => {
  it('renders header, body and footer with provided props', () => {
    render(
      <PDFLayout title="My Report" footer="Footer Content">
        <div data-testid="content">Hello</div>
      </PDFLayout>
    );
    expect(screen.getByRole('heading', { name: /my report/i })).toBeInTheDocument();
    expect(screen.getByTestId('content')).toHaveTextContent('Hello');
    expect(screen.getByRole('button', { name: /print/i })).toBeInTheDocument();
    expect(screen.getByText(/footer content/i)).toBeInTheDocument();
  });

  it('invokes onPrint callback when Print button is clicked', () => {
    const onPrint = jest.fn();
    render(<PDFLayout title="Test Title" onPrint={onPrint} />);
    fireEvent.click(screen.getByRole('button', { name: /print/i }));
    expect(onPrint).toHaveBeenCalledTimes(1);
  });

  it('shows loading indicator and disables Print button when isLoading is true', () => {
    render(<PDFLayout title="Loading State" isLoading />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    const printButton = screen.getByRole('button', { name: /print/i });
    expect(printButton).toBeDisabled();
  });

  it('displays error alert and hides Print button on error', () => {
    render(<PDFLayout title="Error State" error="Network issue" />);
    expect(screen.getByRole('alert')).toHaveTextContent(/network issue/i);
    expect(screen.queryByRole('button', { name: /print/i })).not.toBeInTheDocument();
  });

  describe('edge cases', () => {
    it('renders children and Print button when no title is provided', () => {
      render(
        <PDFLayout>
          <span data-testid="child">Child Content</span>
        </PDFLayout>
      );
      expect(screen.getByTestId('child')).toHaveTextContent('Child Content');
      expect(screen.getByRole('button', { name: /print/i })).toBeInTheDocument();
    });

    it('clicking Print does not throw when onPrint is undefined', () => {
      render(<PDFLayout title="No Handler" />);
      expect(() => {
        fireEvent.click(screen.getByRole('button', { name: /print/i }));
      }).not.toThrow();
    });

    it('renders without footer when none is provided', () => {
      render(<PDFLayout title="No Footer Provided" />);
      expect(screen.queryByText(/footer content/i)).not.toBeInTheDocument();
    });
  });

  it('matches snapshot for happy path', () => {
    const { asFragment } = render(
      <PDFLayout title="Snapshot Test" footer="Footer">
        <p>Snapshot Content</p>
      </PDFLayout>
    );
    expect(asFragment()).toMatchSnapshot();
  });
});