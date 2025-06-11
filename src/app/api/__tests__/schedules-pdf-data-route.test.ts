import request from 'supertest';
import app from '../../app';
import { scheduleService } from '../services/scheduleService';
import { querySchema } from '../routes/schedules-pdf-data-route';

jest.mock('../services/scheduleService');

describe('GET /api/schedules.pdfData', () => {
  const validQuery = { scheduleId: 'abc123', locale: 'en-US' };

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('responds 400 when scheduleId is missing', async () => {
    const { status, body } = await request(app)
      .get('/api/schedules.pdfData')
      .query({ locale: validQuery.locale });
    expect(status).toBe(400);
    expect(body).toEqual(expect.objectContaining({ error: 'scheduleId required' }));
  });

  it('responds 400 on unsupported locale', async () => {
    const { status, body } = await request(app)
      .get('/api/schedules.pdfData')
      .query({ ...validQuery, locale: 'xx-YY' });
    expect(status).toBe(400);
    expect(body.error).toMatch(/unsupported locale/i);
  });

  it('responds 404 when schedule not found', async () => {
    const notFoundError = new Error('Not found');
    // @ts-ignore: simulate HTTP 404
    notFoundError.statusCode = 404;
    scheduleService.get.mockRejectedValue(notFoundError);

    const { status, body } = await request(app)
      .get('/api/schedules.pdfData')
      .query(validQuery);

    expect(status).toBe(404);
    expect(body.error).toMatch(/not found/i);
  });

  it('returns binary PDF buffer with correct headers on success', async () => {
    const fakePdf = Buffer.from('%PDF-1.4');
    scheduleService.get.mockResolvedValue({ id: validQuery.scheduleId });
    scheduleService.generatePdf.mockResolvedValue(fakePdf);

    const response = await request(app)
      .get('/api/schedules.pdfData')
      .query(validQuery)
      .buffer()
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('application/pdf');
    expect(response.body.length).toBeGreaterThan(0);
  });

  it('propagates internal server errors (500) while hiding stack traces', async () => {
    scheduleService.get.mockResolvedValue({ id: validQuery.scheduleId });
    scheduleService.generatePdf.mockImplementationOnce(() => {
      throw new Error('Fatal');
    });

    const res = await request(app)
      .get('/api/schedules.pdfData')
      .query(validQuery);

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error' });
    expect(res.body.stack).toBeUndefined();
  });

  it('guards against directory traversal in scheduleId', async () => {
    const { status } = await request(app)
      .get('/api/schedules.pdfData')
      .query({ scheduleId: '../../etc/passwd', locale: validQuery.locale });

    expect(status).toBe(400);
  });

  it('rejects locale longer than 5 chars (schema validation)', () => {
    expect(() => querySchema.parse({ scheduleId: '1', locale: 'english' })).toThrow();
  });

  it('JSON metadata snapshot when Accept: application/json', async () => {
    const meta = { id: validQuery.scheduleId, name: 'Test Schedule', locale: validQuery.locale };
    scheduleService.get.mockResolvedValue(meta);
    scheduleService.generatePdf.mockResolvedValue(Buffer.from('dummy'));

    const res = await request(app)
      .get('/api/schedules.pdfData')
      .set('Accept', 'application/json')
      .query(validQuery);

    expect(res.status).toBe(200);
    expect(res.body).toMatchSnapshot({
      id: expect.any(String),
      name: expect.any(String),
      locale: expect.any(String),
    });
  });
});