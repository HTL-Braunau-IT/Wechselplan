jest.mock('../../api/groups', () => ({
  fetchGroups: jest.fn(),
  createGroup: jest.fn(),
  updateGroup: jest.fn(),
  deleteGroup: jest.fn(),
}));

beforeEach(() => {
  jest.resetAllMocks();
});
afterEach(() => {
  jest.clearAllMocks();
});

const typeGroupName = async (name: string) => {
  const input = screen.getByLabelText(/group name/i);
  await userEvent.clear(input);
  await userEvent.type(input, name);
};

describe('GroupManagement — edge cases', () => {
  it('should render "No groups available" message when list is empty', async () => {
    (fetchGroups as jest.Mock).mockResolvedValueOnce([]);
    renderWithProviders(<GroupManagementModal isOpen onClose={jest.fn()} />);
    expect(await screen.findByText(/no groups available/i)).toBeInTheDocument();
  });

  it('should handle special characters in group names', async () => {
    (fetchGroups as jest.Mock).mockResolvedValueOnce([]);
    const specialName = 'Group!@#$%^&*()_+';
    (createGroup as jest.Mock).mockResolvedValueOnce({ id: '1', name: specialName });
    renderWithProviders(<GroupManagementModal isOpen onClose={jest.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /add group/i }));
    await typeGroupName(specialName);
    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => {
      expect(createGroup).toHaveBeenCalledWith({ name: specialName });
    });
    expect(screen.getByText(specialName)).toBeInTheDocument();
  });

  it('should disable save button for invalid group name input', async () => {
    (fetchGroups as jest.Mock).mockResolvedValueOnce([{ id: '1', name: 'Existing Group' }]);
    renderWithProviders(<GroupManagementModal isOpen onClose={jest.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /add group/i }));
    await typeGroupName('   ');
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
  });

  it('should show error message when createGroup API fails', async () => {
    (fetchGroups as jest.Mock).mockResolvedValueOnce([]);
    const errorMessage = 'Internal Server Error';
    (createGroup as jest.Mock).mockRejectedValueOnce(new Error(errorMessage));
    renderWithProviders(<GroupManagementModal isOpen onClose={jest.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /add group/i }));
    await typeGroupName('New Group');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(await screen.findByText(/failed to create group/i)).toBeInTheDocument();
  });
});