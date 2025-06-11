import { describe, test, expect, vi, beforeEach, afterAll } from 'vitest';
import { POST } from '../route';
import { captureError } from '@/lib/sentry';
import ldap from 'ldapjs';


// Mock environment variables
const originalEnv = process.env;
process.env = {
  ...originalEnv,
  LDAP_URL: 'ldap://example.com',
  LDAP_BASE_DN: 'dc=example,dc=com',
  LDAP_USERNAME: 'admin',
  LDAP_PASSWORD: 'password',
  LDAP_TEACHERS_OU: 'ou=teachers,dc=example,dc=com',
  NEXT_RUNTIME: 'nodejs',
};

// Mock ldapjs
vi.mock('ldapjs', () => ({
  default: {
    createClient: vi.fn(() => ({
      bind: vi.fn(),
      search: vi.fn(),
      unbind: vi.fn(),
    })),
  },
}));

// Mock sentry
vi.mock('@/lib/sentry', () => ({
  captureError: vi.fn(),
}));

describe('Teachers Import API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(() => {

    process.env = originalEnv;
  });

  test('should successfully import teachers from LDAP', async () => {
    const mockTeachers = [
      {
        givenName: 'John',
        sn: 'Doe',
        sAMAccountName: 'johndoe',
        mail: 'john.doe@example.com',
      },
      {
        givenName: 'Jane',
        sn: 'Smith',
        sAMAccountName: 'janesmith',
        mail: 'jane.smith@example.com',
      },
    ];

    const mockClient = {
      bind: vi.fn((username, password, callback) => callback(null)),
      search: vi.fn((base, options, callback) => {
        const res = {
          on: vi.fn((event, handler) => {
            if (event === 'searchEntry') {
              mockTeachers.forEach(teacher => {
                handler({
                  attributes: [
                    { type: 'givenName', values: [teacher.givenName] },
                    { type: 'sn', values: [teacher.sn] },
                    { type: 'sAMAccountName', values: [teacher.sAMAccountName] },
                    { type: 'mail', values: [teacher.mail] },
                  ],
                });
              });
            } else if (event === 'end') {
              handler();
            }
          }),
        };
        callback(null, res);
      }),
      unbind: vi.fn(),
    };

    vi.mocked(ldap.createClient).mockReturnValue(mockClient as any);

    const response = await POST();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      teachers: mockTeachers.map(teacher => ({
        firstName: teacher.givenName,
        lastName: teacher.sn,
        username: teacher.sAMAccountName,
        email: teacher.mail,
      })),
    });

    // Verify LDAP client configuration
    expect(ldap.createClient).toHaveBeenCalledWith({
      url: process.env.LDAP_URL,
      timeout: 5000,
      connectTimeout: 10000,
      idleTimeout: 5000,
      reconnect: true,
      strictDN: false,
      tlsOptions: {
        rejectUnauthorized: false,
      },
    });

    // Verify LDAP bind
    expect(mockClient.bind).toHaveBeenCalledWith(
      process.env.LDAP_USERNAME,
      process.env.LDAP_PASSWORD,
      expect.any(Function)
    );

    // Verify LDAP search
    expect(mockClient.search).toHaveBeenCalledWith(
      process.env.LDAP_TEACHERS_OU,
      {
        filter: '(objectClass=user)',
        scope: 'sub',
        attributes: ['givenName', 'sn', 'sAMAccountName', 'mail'],
        paged: true,
        sizeLimit: 1000,
      },
      expect.any(Function)
    );

    // Verify client cleanup
    expect(mockClient.unbind).toHaveBeenCalled();
  });

  test('should handle LDAP bind errors', async () => {
    const mockClient = {
      bind: vi.fn((username, password, callback) => 
        callback(new Error('Invalid credentials'))
      ),
      unbind: vi.fn(),
    };

    vi.mocked(ldap.createClient).mockReturnValue(mockClient as any);

    const response = await POST();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toEqual({
      error: 'LDAP bind failed',
    });

    // Verify error was logged and captured

    expect(captureError).toHaveBeenCalledWith(
      expect.any(Error),
      {
        location: 'api/teachers/import',
        type: 'ldap-bind',
        extra: {
          config: {
            url: process.env.LDAP_URL,
            baseDN: process.env.LDAP_BASE_DN,
            teachersOU: process.env.LDAP_TEACHERS_OU,
          },
        },
      }
    );

    // Verify client cleanup
    expect(mockClient.unbind).toHaveBeenCalled();
  });

  test('should handle LDAP search errors', async () => {
    const mockClient = {
      bind: vi.fn((username, password, callback) => callback(null)),
      search: vi.fn((base, options, callback) => 
        callback(new Error('Search failed'))
      ),
      unbind: vi.fn(),
    };

    vi.mocked(ldap.createClient).mockReturnValue(mockClient as any);

    const response = await POST();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toEqual({
      error: 'LDAP search failed',
    });

    // Verify error was logged and captured

    expect(captureError).toHaveBeenCalledWith(
      expect.any(Error),
      {
        location: 'api/teachers/import',
        type: 'ldap-search',
        extra: {
          config: {
            url: process.env.LDAP_URL,
            baseDN: process.env.LDAP_BASE_DN,
            teachersOU: process.env.LDAP_TEACHERS_OU,
          },
        },
      }
    );

    // Verify client cleanup
    expect(mockClient.unbind).toHaveBeenCalled();
  });

  test('should handle missing environment variables', async () => {
    // Remove required environment variables
    delete process.env.LDAP_URL;
    delete process.env.LDAP_BASE_DN;

    const response = await POST();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toEqual({
      error: 'Failed to import teachers',
    });

    // Verify error was logged and captured

    expect(captureError).toHaveBeenCalledWith(
      expect.any(Error),
      {
        location: 'api/teachers/import',
        type: 'import-teachers',
        extra: {
          runtime: process.env.NEXT_RUNTIME,
          nodeEnv: process.env.NODE_ENV,
        },
      }
    );
  });
}); 