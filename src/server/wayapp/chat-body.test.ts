import { describe, expect, it, vi } from "vitest";

vi.mock("./rate-limit", () => ({ isOverLimit: vi.fn(async () => false) }));
vi.mock("./db", () => ({
  query: vi.fn(() => {
    throw new Error("The database must not be accessed for rejected bodies");
  }),
  logDatabaseError: vi.fn(),
}));

import { handleChat } from "./chat";

function makeRequest(body: string, contentLength?: string) {
  return new Request("https://wayup.es/api/chat", {
    method: "POST",
    headers: {
      origin: "https://wayup.es",
      "content-type": "application/json",
      ...(contentLength ? { "content-length": contentLength } : {}),
    },
    body,
  });
}

describe("chat request body limits", () => {
  it("rejects a body larger than 64 KiB even without Content-Length", async () => {
    const previous = process.env["GROQ_API_KEY"];
    process.env["GROQ_API_KEY"] = "test-key-not-real";
    try {
      const response = await handleChat(makeRequest("x".repeat(65 * 1024)));
      expect(response.status).toBe(413);
    } finally {
      if (previous === undefined) delete process.env["GROQ_API_KEY"];
      else process.env["GROQ_API_KEY"] = previous;
    }
  });

  it("rejects an oversized declared Content-Length before reading", async () => {
    const previous = process.env["GROQ_API_KEY"];
    process.env["GROQ_API_KEY"] = "test-key-not-real";
    try {
      const response = await handleChat(makeRequest("{}", "65537"));
      expect(response.status).toBe(413);
    } finally {
      if (previous === undefined) delete process.env["GROQ_API_KEY"];
      else process.env["GROQ_API_KEY"] = previous;
    }
  });

  it("returns 400 for malformed JSON within the limit", async () => {
    const previous = process.env["GROQ_API_KEY"];
    process.env["GROQ_API_KEY"] = "test-key-not-real";
    try {
      const response = await handleChat(makeRequest("{invalid"));
      expect(response.status).toBe(400);
    } finally {
      if (previous === undefined) delete process.env["GROQ_API_KEY"];
      else process.env["GROQ_API_KEY"] = previous;
    }
  });
});
