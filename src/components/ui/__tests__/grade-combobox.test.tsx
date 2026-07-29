// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GradeCombobox } from '../grade-combobox'

describe('GradeCombobox', () => {
  it('renders the current value as display text', () => {
    render(<GradeCombobox value={2.5} onChange={vi.fn()} aria-label="Note" />)
    expect(screen.getByRole('combobox')).toHaveValue('2.5')
  })

  it('renders the sentinels as words rather than numbers', () => {
    const { rerender } = render(<GradeCombobox value={6} onChange={vi.fn()} />)
    expect(screen.getByRole('combobox')).toHaveValue('nicht beurteilt')

    rerender(<GradeCombobox value={7} onChange={vi.fn()} />)
    expect(screen.getByRole('combobox')).toHaveValue('gestunden')
  })

  it('renders an empty field for a missing grade', () => {
    render(<GradeCombobox value={null} onChange={vi.fn()} />)
    expect(screen.getByRole('combobox')).toHaveValue('')
  })

  it('offers half steps for a Teilnote but not for an Endnote', async () => {
    const user = userEvent.setup()

    const { unmount } = render(<GradeCombobox value={null} onChange={vi.fn()} variant="teilnote" />)
    await user.click(screen.getByRole('combobox'))
    expect(screen.getByRole('button', { name: '2.5' })).toBeInTheDocument()
    unmount()

    render(<GradeCombobox value={null} onChange={vi.fn()} variant="endnote" />)
    await user.click(screen.getByRole('combobox'))
    expect(screen.queryByRole('button', { name: '2.5' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '2' })).toBeInTheDocument()
  })

  it('reports the selected option to the caller', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<GradeCombobox value={null} onChange={onChange} />)

    await user.click(screen.getByRole('combobox'))
    await user.click(screen.getByRole('button', { name: '3' }))

    expect(onChange).toHaveBeenCalledWith('3')
  })

  it('reports a sentinel chosen from the dropdown by its numeric value', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<GradeCombobox value={null} onChange={onChange} />)

    await user.click(screen.getByRole('combobox'))
    await user.click(screen.getByRole('button', { name: 'nicht beurteilt' }))

    expect(onChange).toHaveBeenCalledWith('6')
  })

  it('commits a typed mark without needing Enter', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<GradeCombobox value={null} onChange={onChange} />)

    await user.type(screen.getByRole('combobox'), '4')

    expect(onChange).toHaveBeenCalledWith('4')
  })

  it('commits an emptied field so the grade can be cleared', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<GradeCombobox value={3} onChange={onChange} />)

    await user.clear(screen.getByRole('combobox'))

    expect(onChange).toHaveBeenCalledWith('')
  })

  it('does not commit input that is not a valid mark', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<GradeCombobox value={null} onChange={onChange} />)

    await user.type(screen.getByRole('combobox'), '9')

    expect(onChange).not.toHaveBeenCalled()
  })

  it('closes the dropdown on Escape', async () => {
    const user = userEvent.setup()
    render(<GradeCombobox value={null} onChange={vi.fn()} />)

    const input = screen.getByRole('combobox')
    await user.click(input)
    expect(input).toHaveAttribute('aria-expanded', 'true')

    await user.keyboard('{Escape}')
    expect(input).toHaveAttribute('aria-expanded', 'false')
  })

  it('reflects a value changed from outside', () => {
    const { rerender } = render(<GradeCombobox value={1} onChange={vi.fn()} />)
    expect(screen.getByRole('combobox')).toHaveValue('1')

    rerender(<GradeCombobox value={5} onChange={vi.fn()} />)
    expect(screen.getByRole('combobox')).toHaveValue('5')
  })

  it('can be disabled', () => {
    render(<GradeCombobox value={null} onChange={vi.fn()} disabled />)
    expect(screen.getByRole('combobox')).toBeDisabled()
  })
})
