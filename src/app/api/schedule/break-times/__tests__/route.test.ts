import { describe, test, expect } from 'vitest';
import { GET } from '../route';

describe('Break Times API', () => {
  describe('GET /api/schedule/break-times', () => {
    test('should return default break times', async () => {
      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual([
        {
          id: '1',
          name: 'Morning Break',
          startTime: '09:40',
          endTime: '09:55',
          period: 'AM'
        },
        {
          id: '2',
          name: 'Lunch Break',
          startTime: '11:35',
          endTime: '11:50',
          period: 'AM'
        },
        {
          id: '3',
          name: 'Afternoon Break',
          startTime: '15:10',
          endTime: '15:25',
          period: 'PM'
        }
      ]);
    });

    test('should return correct content type', async () => {
      const response = await GET();

      expect(response.headers.get('content-type')).toBe('application/json');
    });
  });
}); 