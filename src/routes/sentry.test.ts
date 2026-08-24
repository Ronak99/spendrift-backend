import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Request } from "express";
import {
  isSentryEnvelopeRequest,
  shouldForwardSentryIngest,
} from "./sentry.js";

function fakeReq(partial: {
  method?: string;
  headers?: Record<string, string>;
}): Request {
  return {
    method: partial.method ?? "POST",
    headers: partial.headers ?? {},
  } as Request;
}

describe("shouldForwardSentryIngest", () => {
  it("forwards only in production", () => {
    assert.equal(shouldForwardSentryIngest("production"), true);
    assert.equal(shouldForwardSentryIngest("development"), false);
    assert.equal(shouldForwardSentryIngest("test"), false);
  });
});

describe("isSentryEnvelopeRequest", () => {
  it("accepts POST Sentry envelopes", () => {
    assert.equal(
      isSentryEnvelopeRequest(
        fakeReq({
          headers: { "content-type": "application/x-sentry-envelope" },
        }),
      ),
      true,
    );
  });

  it("accepts content-type with parameters", () => {
    assert.equal(
      isSentryEnvelopeRequest(
        fakeReq({
          headers: {
            "content-type": "application/x-sentry-envelope; charset=utf-8",
          },
        }),
      ),
      true,
    );
  });

  it("rejects PostHog JSON batches", () => {
    assert.equal(
      isSentryEnvelopeRequest(
        fakeReq({ headers: { "content-type": "application/json" } }),
      ),
      false,
    );
  });

  it("rejects GET config fetches", () => {
    assert.equal(
      isSentryEnvelopeRequest(
        fakeReq({
          method: "GET",
          headers: { "content-type": "application/x-sentry-envelope" },
        }),
      ),
      false,
    );
  });
});
