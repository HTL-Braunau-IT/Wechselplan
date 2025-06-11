/**
 * @file page.test.tsx
 * @description Test suite for RotationCreatePage.
 *  - Jest is the testing framework (configured in git/jest.config.js).
 *  - Uses @testing-library/react (RTL) for component interaction.
 *  - Utilises jest-axe for accessibility checks when available.
 */
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RotationCreatePage from '../../page';
import { createMockRouter } from '@/test-utils/mockRouter';
jest.mock('next/router', () => require('@/test-utils/mockNextRouter'));

let axe;
try {
  // Conditionally load jest-axe for accessibility tests
  const jestAxe = require('jest-axe');
  axe = jestAxe.axe;
  expect.extend({ toHaveNoViolations: jestAxe.toHaveNoViolations });
} catch (e) {
  console.warn('jest-axe not installed, skipping accessibility tests');
}

describe('RotationCreatePage', () => {
  let mockRouter: ReturnType<typeof createMockRouter>;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
    mockRouter = createMockRouter();
  });

  afterEach(() => {
    delete (global.fetch as jest.Mock);
    cleanup();
  });

  if (axe) {
    it('renders with no a11y issues', async () => {
      const { container } = render(<RotationCreatePage />);
      expect(await axe(container)).toHaveNoViolations();
    });
  } else {
    it.skip('renders with no a11y issues (jest-axe not available)', () => {});
  }

  it('shows validation errors for empty submit', async () => {
    render(<RotationCreatePage />);
    userEvent.click(screen.getByRole('button', { name: /submit/i }));
    expect(await screen.findByText(/required/i)).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('rejects identical start & end dates', async () => {
    render(<RotationCreatePage />);
    const startInput = screen.getByLabelText(/start date/i);
    const endInput = screen.getByLabelText(/end date/i);
    await userEvent.clear(startInput);
    await userEvent.clear(endInput);
    await userEvent.type(startInput, '2025-01-01');
    await userEvent.type(endInput, '2025-01-01');
    userEvent.click(screen.getByRole('button', { name: /submit/i }));
    expect(await screen.findByText(/end date must be after start date/i)).toBeInTheDocument();
  });

  it('handles backend 500 gracefully', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 500 });
    render(<RotationCreatePage />);
    const nameInput = screen.getByLabelText(/rotation name/i);
    const startInput = screen.getByLabelText(/start date/i);
    const endInput = screen.getByLabelText(/end date/i);
    await userEvent.type(nameInput, 'Test Rotation');
    await userEvent.type(startInput, '2025-01-01');
    await userEvent.type(endInput, '2025-01-02');
    userEvent.click(screen.getByRole('button', { name: /submit/i }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /submit/i })).not.toBeDisabled();
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('successful creation redirects', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => ({ id: '123' }) });
    render(<RotationCreatePage />);
    const nameInput = screen.getByLabelText(/rotation name/i);
    const startInput = screen.getByLabelText(/start date/i);
    const endInput = screen.getByLabelText(/end date/i);
    await userEvent.type(nameInput, 'Test Rotation');
    await userEvent.type(startInput, '2025-01-01');
    await userEvent.type(endInput, '2025-01-02');
    userEvent.click(screen.getByRole('button', { name: /submit/i }));
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith('/schedule/rotations/123'));
    expect(screen.getByText(/created successfully/i)).toBeInTheDocument();
  });
});