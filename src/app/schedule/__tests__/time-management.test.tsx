/**
 * Test suite for TimeManagement component.
 * Uses Jest + React Testing Library.
 * Covers default rendering, edge cases, user interactions, and validation.
 */
describe('TimeManagement - edge cases', () => {
  beforeEach(() => {
    jest.useFakeTimers('modern');
    jest.setSystemTime(new Date('2025-01-01T00:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should render 00:00 correctly', () => {
    render(<TimeManagement />);
    expect(screen.getByDisplayValue('00:00')).toBeInTheDocument();
  });

  it('should handle 23:59 transitions', () => {
    render(<TimeManagement initialTime="23:59" />);
    expect(screen.getByDisplayValue('23:59')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /increment/i }));
    expect(screen.getByDisplayValue('00:00')).toBeInTheDocument();
  });

  it('should call onChange when user adjusts time', () => {
    const onChange = jest.fn();
    render(<TimeManagement onChange={onChange} />);
    const input = screen.getByLabelText(/time/i);
    fireEvent.change(input, { target: { value: '12:34' } });
    expect(onChange).toHaveBeenCalledWith('12:34');
  });

  it('should display validation message on invalid input', () => {
    render(<TimeManagement />);
    const input = screen.getByLabelText(/time/i);
    fireEvent.change(input, { target: { value: '99:99' } });
    expect(screen.getByText(/invalid time/i)).toBeInTheDocument();
  });
});