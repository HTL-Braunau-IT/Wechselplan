import { describe, test, expect, vi, beforeEach, afterAll } from 'vitest';
import { POST } from '../route';
import { prisma } from '~/lib/prisma';
import { sendSupportEmail } from '~/server/send-support-email-graph';
import { captureError } from '@/lib/sentry';



// Mock prisma
vi.mock('~/lib/prisma', () => ({
  prisma: {
    supportMessage: {
      create: vi.fn(),
    },
  },
}));

// Mock sendSupportEmail
vi.mock('~/server/send-support-email-graph', () => ({
  sendSupportEmail: vi.fn(),
}));

// Mock sentry
vi.mock('@/lib/sentry', () => ({
  captureError: vi.fn(),
}));

describe('Support API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });



  describe('POST', () => {
    const validRequest = {
      name: 'John Doe',
      message: 'I need help with something',
      currentUri: '/some/page',
    };

    test('should create support message and send email', async () => {
      const mockSupportMessage = {
        id: 1,
        name: validRequest.name,
        message: validRequest.message,
        currentUri: validRequest.currentUri,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      vi.mocked(prisma.supportMessage.create).mockResolvedValue(mockSupportMessage);
      vi.mocked(sendSupportEmail).mockResolvedValue(undefined);

      const request = new Request('http://localhost:3000/api/support', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(validRequest),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual(mockSupportMessage);

      // Verify prisma call
      expect(prisma.supportMessage.create).toHaveBeenCalledWith({
        data: {
          name: validRequest.name,
          message: validRequest.message,
          currentUri: validRequest.currentUri,
        },
      });

      // Verify email was sent
      expect(sendSupportEmail).toHaveBeenCalledWith(
        `New support message from ${validRequest.name}`,
        `Name: ${validRequest.name}\nMessage: ${validRequest.message}\nLocation: ${validRequest.currentUri}`
      );

      // Verify no errors were logged
   
      expect(captureError).not.toHaveBeenCalled();
    });

    test('should handle missing required fields', async () => {
      const request = new Request('http://localhost:3000/api/support', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          // Missing name and message
          currentUri: '/some/page',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({
        error: 'Name and message are required',
      });

      // Verify error was logged


      // Verify no database or email operations were attempted
      expect(prisma.supportMessage.create).not.toHaveBeenCalled();
      expect(sendSupportEmail).not.toHaveBeenCalled();
    });

    test('should handle email sending failure gracefully', async () => {
      const mockSupportMessage = {
        id: 1,
        name: validRequest.name,
        message: validRequest.message,
        currentUri: validRequest.currentUri,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      vi.mocked(prisma.supportMessage.create).mockResolvedValue(mockSupportMessage);
      vi.mocked(sendSupportEmail).mockRejectedValue(new Error('Email service unavailable'));

      const request = new Request('http://localhost:3000/api/support', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(validRequest),
      });

      const response = await POST(request);
      const data = await response.json();

      // Should still return success to user
      expect(response.status).toBe(200);
      expect(data).toEqual(mockSupportMessage);

      // Verify error was logged and captured

      expect(captureError).toHaveBeenCalledWith(
        expect.any(Error),
        {
          location: 'api/support',
          type: 'send-support-email',
          extra: {
            name: validRequest.name,
            message: validRequest.message,
            currentUri: validRequest.currentUri,
          },
        }
      );
    });

    test('should handle database errors', async () => {
      const requestBody = JSON.stringify(validRequest);
      const request = new Request('http://localhost:3000/api/support', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: requestBody,
      });

      vi.mocked(prisma.supportMessage.create).mockRejectedValue(
        new Error('Database connection failed')
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({
        error: 'Failed to process support request',
      });


      expect(captureError).toHaveBeenCalledWith(
        expect.any(Error),
        {
          location: 'api/support',
          type: 'send-support-email',
          extra: {
            requestBody,
          },
        }
      );

      // Verify no email was attempted
      expect(sendSupportEmail).not.toHaveBeenCalled();
    });
  });
}); 