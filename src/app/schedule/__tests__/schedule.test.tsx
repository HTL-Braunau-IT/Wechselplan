afterEach(() => {
  jest.clearAllMocks();
});

it('renders schedule with default events', async () => {
  const mockEvents = [
    { id: '1', title: 'Event One', date: '2025-06-01', category: 'conference' },
    { id: '2', title: 'Event Two', date: '2025-06-02', category: 'workshop' },
  ];
  server.use(
    rest.get('/api/schedule', (req, res, ctx) =>
      res(ctx.status(200), ctx.json(mockEvents))
    )
  );
  renderWithProviders(<Schedule />);
  for (const event of mockEvents) {
    expect(await screen.findByText(event.title)).toBeInTheDocument();
  }
});

it('displays empty state when there are no events', async () => {
  server.use(
    rest.get('/api/schedule', (req, res, ctx) =>
      res(ctx.status(200), ctx.json([]))
    )
  );
  renderWithProviders(<Schedule />);
  expect(await screen.findByText(/no events scheduled/i)).toBeInTheDocument();
});

it('shows an error message on API failure', async () => {
  server.use(
    rest.get('/api/schedule', (req, res, ctx) =>
      res(ctx.status(500))
    )
  );
  renderWithProviders(<Schedule />);
  expect(await screen.findByText(/failed to load schedule/i)).toBeInTheDocument();
});

it('navigates dates when clicking next and previous buttons', async () => {
  const eventsDay1 = [{ id: '1', title: 'Day One Event', date: '2025-06-01' }];
  const eventsDay2 = [{ id: '2', title: 'Day Two Event', date: '2025-06-02' }];
  server.use(
    rest.get('/api/schedule', (req, res, ctx) => {
      const date = req.url.searchParams.get('date');
      if (date === '2025-06-02') {
        return res(ctx.status(200), ctx.json(eventsDay2));
      }
      return res(ctx.status(200), ctx.json(eventsDay1));
    })
  );
  renderWithProviders(<Schedule />);
  // initial load shows Day One Event
  expect(await screen.findByText('Day One Event')).toBeInTheDocument();

  // click next day
  userEvent.click(screen.getByRole('button', { name: /next day/i }));
  expect(await screen.findByText('Day Two Event')).toBeInTheDocument();

  // click previous day
  userEvent.click(screen.getByRole('button', { name: /previous day/i }));
  expect(await screen.findByText('Day One Event')).toBeInTheDocument();
});

it('allows filtering events by category', async () => {
  const allEvents = [
    { id: '1', title: 'Tech Talk', date: '2025-06-01', category: 'conference' },
    { id: '2', title: 'Workshop A', date: '2025-06-01', category: 'workshop' },
  ];
  server.use(
    rest.get('/api/schedule', (req, res, ctx) =>
      res(ctx.status(200), ctx.json(allEvents))
    )
  );
  renderWithProviders(<Schedule />);
  // both events are shown initially
  expect(await screen.findByText('Tech Talk')).toBeInTheDocument();
  expect(screen.getByText('Workshop A')).toBeInTheDocument();

  // filter to workshops only
  userEvent.selectOptions(screen.getByLabelText(/category/i), 'workshop');
  expect(screen.queryByText('Tech Talk')).not.toBeInTheDocument();
  expect(screen.getByText('Workshop A')).toBeInTheDocument();
});

it('has proper accessibility roles and headings', () => {
  renderWithProviders(<Schedule />);
  expect(screen.getByRole('heading', { level: 2, name: /schedule/i })).toBeInTheDocument();
  expect(screen.getByRole('table')).toBeInTheDocument();
});