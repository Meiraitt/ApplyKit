import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import {
  createCompatibleClient,
  compatibleEndpoint,
} from "../src/infrastructure/providers/compatible-client.js";

const schema = z.object({ approved: z.boolean() });
const answer = () =>
  Response.json({
    choices: [
      { finish_reason: "stop", message: { content: '{"approved":true}' } },
    ],
  });
const options = {
  url: "https://api.example.com/v1/chat/completions",
  model: "model-test",
  writerKey: "writer-secret",
  reviewerKey: "reviewer-secret",
};

describe("Chat Completions compatible API", () => {
  it("builds messages, uses role-specific keys and validates JSON", async () => {
    const fetcher = vi.fn().mockImplementation(answer);
    const client = createCompatibleClient({ ...options, fetcher });

    expect(await client("writer", "Vaga e fatos", schema)).toEqual({
      approved: true,
    });

    await client("reviewer", "Revise com fatos", schema);
    expect(fetcher.mock.calls[0][0]).toBe(options.url);
    expect(fetcher.mock.calls[0][1].headers.Authorization).toBe(
      "Bearer writer-secret",
    );

    expect(fetcher.mock.calls[1][1].headers.Authorization).toBe(
      "Bearer reviewer-secret",
    );

    const body = JSON.parse(fetcher.mock.calls[0][1].body);

    expect(body.model).toBe("model-test");
    expect(body.stream).toBe(false);
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.messages[1].content).toContain("OUTPUT JSON CONTRACT");
    expect(fetcher.mock.calls[0][1].redirect).toBe("error");
  });

  it.each(["json_schema", "none"] as const)(
    "supports response mode %s",
    async (responseFormat) => {
      const fetcher = vi.fn().mockImplementation(answer);

      await createCompatibleClient({ ...options, responseFormat, fetcher })(
        "writer",
        "JSON",
        schema,
      );

      const body = JSON.parse(fetcher.mock.calls[0][1].body);

      if (responseFormat === "none")
        expect(body).not.toHaveProperty("response_format");
      else
        expect(
          body.response_format.json_schema.schema.properties.approved.type,
        ).toBe("boolean");
    },
  );

  it.each([400, 401, 429, 500])(
    "interrompe HTTP %s sem gastar chamadas adicionais ou expor a chave",
    async (status) => {
      const fetcher = vi
        .fn()
        .mockResolvedValue(new Response("writer-secret", { status }));
      const promise = createCompatibleClient({ ...options, fetcher })(
        "writer",
        "JSON",
        schema,
      );

      await expect(promise).rejects.toThrow(`HTTP ${status}`);
      await expect(promise).rejects.not.toThrow("writer-secret");
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    {
      choices: [
        { finish_reason: "length", message: { content: '{"approved":true}' } },
      ],
    },
    { candidates: [{ text: '{"approved":true}' }] },
    {
      choices: [
        { finish_reason: "stop", message: { content: '{"approved":"yes"}' } },
      ],
    },
    {
      choices: [
        {
          finish_reason: "stop",
          message: { refusal: "no", content: '{"approved":true}' },
        },
      ],
    },
  ])(
    "rejects incompatible, truncated and out-of-contract responses",
    async (body) => {
      const fetcher = vi.fn().mockResolvedValue(Response.json(body));

      await expect(
        createCompatibleClient({ ...options, fetcher })(
          "writer",
          "JSON",
          schema,
        ),
      ).rejects.toThrow();
    },
  );

  it("accepts a keyless local server and rejects unsafe URLs or embedded credentials", async () => {
    expect(
      compatibleEndpoint("http://localhost:1234/v1/chat/completions"),
    ).toContain("localhost");

    for (const url of [
      "http://remote.example/api",
      "https://key:secret@example.com",
      "https://example.com?key=secret",
      "invalid",
    ])
      expect(() => compatibleEndpoint(url)).toThrow();
    const fetcher = vi.fn().mockImplementation(answer);

    await createCompatibleClient({
      ...options,
      url: "http://localhost:1234/v1/chat/completions",
      writerKey: "",
      reviewerKey: "",
      fetcher,
    })("writer", "JSON", schema);

    expect(fetcher.mock.calls[0][1].headers).not.toHaveProperty(
      "Authorization",
    );
  });
});
