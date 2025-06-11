// Tests for schedules-pdf-data-route written with Jest + ts-jest

import { GET } from '../schedules-pdf-data-route'; // TODO: adjust import path if necessary

const mockRequest = (query: Record<string, string> = {}) =>
  new Request(
    'http://localhost/api/schedules-pdf-data?' +
      new URLSearchParams(query).toString()
  );

const invoke = async (query?: Record<string, string>) =>
  await GET(mockRequest(query!));

afterEach(() => {
  jest.resetAllMocks();
});

describe('schedules-pdf-data-route', () => {
  it('should return 200 and expected PDF payload for valid scheduleId', async () => {
    // Arrange
    const scheduleId = 'sch_123';
    jest.spyOn(global, 'fetch').mockResolvedValue(
      mockPdfResponse()
    );

    // Act
    const res = await invoke({ scheduleId });

    // Assert
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/pdf/);
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(bytes[0]).toBe(0x25);
  });

  it('should return 400 when scheduleId is missing', async () => {
    // Act
    const res = await invoke();

    // Assert
    expect(res.status).toBe(400);
  });

  it('should return 422 for invalid scheduleId format', async () => {
    // Arrange
    const invalidId = 'invalid!';
    // Act
    const res = await invoke({ scheduleId: invalidId });

    // Assert
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      error: 'Invalid scheduleId format',
    });
  });

  it('should return 502 when upstream PDF service fails', async () => {
    // Arrange
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(null, { status: 500 })
    );
    jest.spyOn(console, 'error').mockImplementation(() => {});

    // Act
    const res = await invoke({ scheduleId: 'bad' });

    // Assert
    expect(res.status).toBe(502);
    expect(console.error).toHaveBeenCalled();
  });
});

// Helper to generate a mock PDF Response
function mockPdfResponse(
  data: Uint8Array = new Uint8Array([0x25, 0x50, 0x44, 0x46]),
  status: number = 200
): Response {
  return new Response(data, {
    status,
    headers: { 'Content-Type': 'application/pdf' },
  });
}