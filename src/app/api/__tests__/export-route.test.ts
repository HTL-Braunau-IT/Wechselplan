import { NextRequest } from "next/server";
import handler, { GET, POST } from "../export-route";
import { createMocks } from "node-mocks-http";
import { prisma } from "../../lib/prisma";

jest.mock("../../lib/prisma", () => ({
  prisma: { export: jest.fn() }
}));

afterEach(() => {
  jest.resetAllMocks();
});

function buildMockReqRes(
  method: string,
  options: { query?: Record<string, any>; body?: any } = {}
) {
  const { req, res } = createMocks({
    method,
    query: options.query,
    body: options.body
  });
  return { req: req as unknown as NextRequest, res: res as any };
}

describe("GET /api/export", () => {
  it("GIVEN valid id WHEN GET called THEN returns 200 and JSON payload", async () => {
    const mockData = { id: "123", name: "Test Export" };
    (prisma.export as jest.Mock).mockResolvedValue(mockData);
    const { req, res } = buildMockReqRes("GET", { query: { id: "123" } });

    await GET(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData())).toEqual(
      expect.objectContaining({ id: "123" })
    );
    expect(prisma.export).toHaveBeenCalledWith({ id: "123" });
  });

  it("GIVEN missing id WHEN GET called THEN returns 400", async () => {
    const { req, res } = buildMockReqRes("GET");

    await GET(req, res);

    expect(res._getStatusCode()).toBe(400);
  });

  it("GIVEN db throws error WHEN GET called THEN returns 500", async () => {
    (prisma.export as jest.Mock).mockRejectedValue(new Error("DB failure"));
    const consoleSpy = jest.spyOn(console, "error").mockImplementation();
    const { req, res } = buildMockReqRes("GET", { query: { id: "123" } });

    await GET(req, res);

    expect(res._getStatusCode()).toBe(500);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

describe("POST /api/export", () => {
  it("GIVEN valid body WHEN POST called THEN returns 201 and JSON payload", async () => {
    const payload = { id: "456", description: "New export" };
    (prisma.export as jest.Mock).mockResolvedValue(payload);
    const { req, res } = buildMockReqRes("POST", { body: payload });

    await POST(req, res);

    expect(res._getStatusCode()).toBe(201);
    expect(JSON.parse(res._getData())).toEqual(
      expect.objectContaining(payload)
    );
    expect(prisma.export).toHaveBeenCalledWith(payload);
  });

  it("GIVEN malformed JSON WHEN POST called THEN returns 400", async () => {
    const { req, res } = createMocks({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ invalidJson }"
    });

    await POST(req as unknown as NextRequest, res as any);

    expect(res._getStatusCode()).toBe(400);
  });

  it("GIVEN unsupported method WHEN called THEN returns 405", async () => {
    const { req, res } = buildMockReqRes("PUT");

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);
  });
});