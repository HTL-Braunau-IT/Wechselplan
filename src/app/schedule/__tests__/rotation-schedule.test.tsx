/* src/app/schedule/__tests__/rotation-schedule.test.tsx */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RotationSchedule, RotationScheduleProps } from '../RotationSchedule';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom';

const makeProps = (overrides: Partial<RotationScheduleProps> = {}): RotationScheduleProps => ({
  rotations: [
    { id: 'morning', start: '08:00', end: '12:00' },
    { id: 'afternoon', start: '12:00', end: '16:00' },
  ],
  onSelect: vi.fn(),
  ...overrides,
});

describe('RotationSchedule – happy path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a list item for each rotation', () => {
    render(<RotationSchedule {...makeProps()} />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(screen.getByText('morning')).toBeInTheDocument();
    expect(screen.getByText('afternoon')).toBeInTheDocument();
  });

  it('selects the first rotation by default', () => {
    const onSelect = vi.fn();
    const props = makeProps({ onSelect });
    render(<RotationSchedule {...props} />);
    expect(onSelect).toHaveBeenCalledWith(props.rotations[0]);
  });
});

describe('RotationSchedule – edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows fallback UI when rotations array is empty', () => {
    render(<RotationSchedule {...makeProps({ rotations: [] })} />);
    expect(screen.getByText(/no rotations/i)).toBeInTheDocument();
  });

  it('renders and allows selection of a single rotation', async () => {
    const onSelect = vi.fn();
    const single = { id: 'only', start: '00:00', end: '23:59' };
    render(<RotationSchedule {...makeProps({ rotations: [single], onSelect })} />);
    const item = screen.getByText('only');
    await userEvent.click(item);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(single);
  });

  it('renders a large number of rotations without crashing', () => {
    const many = Array.from({ length: 120 }, (_, i) => ({
      id: `r${i + 1}`,
      start: '00:00',
      end: '01:00',
    }));
    render(<RotationSchedule {...makeProps({ rotations: many })} />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(120);
    expect(screen.getByText('r120')).toBeInTheDocument();
  });
});

describe('RotationSchedule – failure scenarios', () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it('warns when required `rotations` prop is omitted', () => {
    // @ts-expect-error intentionally omitting rotations
    render(<RotationSchedule onSelect={() => {}} />);
    expect(consoleError).toHaveBeenCalled();
  });

  it('does not crash on malformed rotation objects', () => {
    const malformed = [{ start: '09:00' } as any];
    render(<RotationSchedule {...makeProps({ rotations: malformed })} />);
    const items = screen.queryAllByRole('listitem');
    // Either skips invalid entries or shows fallback
    expect(items.length).toBeLessThanOrEqual(1);
  });
});

describe('RotationSchedule – interaction & accessibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls onSelect when a rotation is clicked', async () => {
    const onSelect = vi.fn();
    render(<RotationSchedule {...makeProps({ onSelect })} />);
    const target = screen.getByText('afternoon');
    await userEvent.click(target);
    expect(onSelect).toHaveBeenCalledWith({ id: 'afternoon', start: '12:00', end: '16:00' });
  });

  it('renders with role="list" for accessibility', () => {
    render(<RotationSchedule {...makeProps()} />);
    expect(screen.getByRole('list')).toBeInTheDocument();
  });

  it('supports keyboard navigation and selection via Enter key', async () => {
    const onSelect = vi.fn();
    render(<RotationSchedule {...makeProps({ onSelect })} />);
    const first = screen.getAllByRole('listitem')[0];
    first.focus();
    await userEvent.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledWith({ id: 'morning', start: '08:00', end: '12:00' });
  });
});