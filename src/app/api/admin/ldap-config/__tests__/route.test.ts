import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET, POST } from '../route';
import fs from 'fs';
import path from 'path';

// Mock fs module
vi.mock('fs', () => ({
  default: {
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
  },
}));

// Mock process.env
const originalEnv = process.env;
beforeEach(() => {
  process.env = {
    ...originalEnv,
    NODE_ENV: 'test',
    LDAP_URL: 'ldap://example.com',
    LDAP_BASE_DN: 'dc=example,dc=com',
    LDAP_USERNAME: 'admin',
    LDAP_PASSWORD: 'secret',
    LDAP_STUDENTS_OU: 'ou=students',
    LDAP_TEACHERS_OU: 'ou=teachers',
  };
});

afterEach(() => {
  process.env = originalEnv;
  vi.clearAllMocks();
});

describe('LDAP Config API', () => {
  describe('GET /api/admin/ldap-config', () => {
    it('should return current LDAP configuration', async () => {
      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        url: 'ldap://example.com',
        baseDN: 'dc=example,dc=com',
        username: 'admin',
        password: 'secret',
        studentsOU: 'ou=students',
        teachersOU: 'ou=teachers',
      });
    });

    it('should handle missing environment variables', async () => {
      process.env = { NODE_ENV: 'test' };
      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        url: '',
        baseDN: '',
        username: '',
        password: '',
        studentsOU: '',
        teachersOU: '',
      });
    });
  });

  describe('POST /api/admin/ldap-config', () => {
    it('should update LDAP configuration', async () => {
      const mockEnvContent = 'OTHER_VAR=value\nLDAP_URL=old-url\n';
      vi.mocked(fs.readFileSync).mockReturnValue(mockEnvContent);

      const newConfig = {
        url: 'ldap://new.example.com',
        baseDN: 'dc=new,dc=example,dc=com',
        username: 'newadmin',
        password: 'newsecret',
        studentsOU: 'ou=newstudents',
        teachersOU: 'ou=newteachers',
      };

      const request = new Request('http://localhost/api/admin/ldap-config', {
        method: 'POST',
        body: JSON.stringify(newConfig),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ success: true });
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('LDAP_URL=ldap://new.example.com')
      );
    });

    it('should handle empty .env file', async () => {
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('File not found');
      });

      const newConfig = {
        url: 'ldap://new.example.com',
        baseDN: 'dc=new,dc=example,dc=com',
        username: 'newadmin',
        password: 'newsecret',
        studentsOU: 'ou=newstudents',
        teachersOU: 'ou=newteachers',
      };

      const request = new Request('http://localhost/api/admin/ldap-config', {
        method: 'POST',
        body: JSON.stringify(newConfig),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ success: true });
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('should handle invalid request body', async () => {
      const request = new Request('http://localhost/api/admin/ldap-config', {
        method: 'POST',
        body: 'invalid json',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Failed to save LDAP configuration' });
    });
  });
}); 