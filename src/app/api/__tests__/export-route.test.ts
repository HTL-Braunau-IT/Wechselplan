// Mock external dependencies
jest.mock('../../db/client');
jest.mock('../../auth/utils');
jest.mock('fs');
jest.mock('../../stream-helper');

import { createMocks } from 'node-mocks-http';
import exportRoute from '../export-route';
import dbClient from '../../db/client';
import { authorize } from '../../auth/utils';
import { streamLargeDataset } from '../../stream-helper';

describe('exportRoute – extended scenarios', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    // Ensure any open handles (e.g. DB pool) are closed
    if (dbClient.pool && typeof dbClient.pool.end === 'function') {
      dbClient.pool.end();
    }
  });

  test('should respond 200 and correct JSON body for happy path', async () => {
    authorize.mockResolvedValue(true);
    dbClient.getExportData.mockResolvedValue([{ id: '1', value: 'test' }]);

    const { req, res } = createMocks({
      method: 'GET',
      query: { id: '123' },
    });

    await exportRoute(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual([{ id: '1', value: 'test' }]);
    expect(dbClient.getExportData).toHaveBeenCalledWith('123');
  });

  test('should respond 400 when id param is missing', async () => {
    const { req, res } = createMocks({
      method: 'GET',
      query: {},
    });

    await exportRoute(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({ error: 'Missing id parameter' });
  });

  test('should respond 500 when DB throws an error', async () => {
    authorize.mockResolvedValue(true);
    dbClient.getExportData.mockRejectedValue(new Error('DB error'));

    const { req, res } = createMocks({
      method: 'GET',
      query: { id: '123' },
    });

    await exportRoute(req, res);

    expect(res._getStatusCode()).toBe(500);
    expect(res._getJSONData()).toEqual({ error: 'Internal server error' });
  });

  test('should respond 403 when user is not authorised', async () => {
    authorize.mockResolvedValue(false);

    const { req, res } = createMocks({
      method: 'GET',
      query: { id: '123' },
    });

    await exportRoute(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toEqual({ error: 'Forbidden' });
  });

  test('should stream response when dataset size exceeds limit', async () => {
    authorize.mockResolvedValue(true);
    const largeData = new Array(1001).fill({ id: 'x', value: 'y' });
    dbClient.getExportData.mockResolvedValue(largeData);

    const { req, res } = createMocks({
      method: 'GET',
      query: { id: '123' },
    });

    await exportRoute(req, res);

    expect(streamLargeDataset).toHaveBeenCalledWith(largeData, res);
  });

  describe.each([
    ['empty dataset', [], 200],
    ['maximum id length', [{ id: '1'.repeat(255), value: 'z' }], 200],
    ['malformed UUID', [{ id: 'not-a-uuid', value: 'z' }], 200],
  ])('edge case: %s', (_caseName, mockData, expectedStatus) => {
    test(`handles ${_caseName}`, async () => {
      authorize.mockResolvedValue(true);
      dbClient.getExportData.mockResolvedValue(mockData);

      const { req, res } = createMocks({
        method: 'GET',
        query: { id: '123' },
      });

      await exportRoute(req, res);

      expect(res._getStatusCode()).toBe(expectedStatus);
      expect(res._getJSONData()).toEqual(mockData);
    });
  });
});

// Example of advancing timers if the implementation uses setTimeout internally
describe('exportRoute – timer-based behavior', () => {
  beforeAll(() => {
    jest.useFakeTimers();
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  test('handles delayed operations correctly', async () => {
    authorize.mockResolvedValue(true);
    dbClient.getExportData.mockResolvedValue([]);

    const { req, res } = createMocks({
      method: 'GET',
      query: { id: '123' },
    });

    const handlerPromise = exportRoute(req, res);
    jest.advanceTimersByTime(5000);
    await handlerPromise;

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual([]);
  });
});