import { describe, expect, it } from "vitest";

import {
  AGENT_CONTRACT_VERSION,
  DYNAMIC_TOOL_NAMES,
  agentEventSchema,
  dynamicToolSpecSchema,
  isAgentEvent
} from "@edapex/contracts/agent";
import {
  DEFAULT_CAMERA_OPTIONS,
  OCR_MAX_BYTES,
  PLATFORM_CONTRACT_VERSION,
  isCameraResult,
  isHostCapabilities,
  isServerCapabilities
} from "@edapex/contracts/platform";
import { webFetchRequestSchema, webSearchRequestSchema } from "@edapex/contracts/web";

import agentEvents from "../../../packages/contracts/fixtures/agent-events.json";
import dynamicTools from "../../../packages/contracts/fixtures/dynamic-tools.json";
import platform from "../../../packages/contracts/fixtures/platform-capabilities.json";

describe("capability contracts", () => {
  it("parses every fixture agent event with the same schema Rust will mirror", () => {
    expect(AGENT_CONTRACT_VERSION).toBe(1);
    for (const event of agentEvents) {
      expect(agentEventSchema.safeParse(event).success, event.type).toBe(true);
      expect(isAgentEvent(event), event.type).toBe(true);
    }
  });

  it("keeps host and server capabilities separate", () => {
    expect(PLATFORM_CONTRACT_VERSION).toBe(1);
    expect(isHostCapabilities(platform.host)).toBe(true);
    expect(isServerCapabilities(platform.server)).toBe(true);
    expect(platform.host.cameraPreview).toBe(false);
    expect(platform.server.cloudOcr).toBe(true);
  });

  it("accepts only capture results from the camera plugin", () => {
    expect(isCameraResult(platform.cameraResult)).toBe(true);
    expect(isCameraResult({ status: "captured", path: 1 })).toBe(false);
    expect(isCameraResult({ status: "failed", error: { code: "camera_unavailable" } })).toBe(
      false
    );
  });

  it("pins the camera and OCR capture limits", () => {
    expect(DEFAULT_CAMERA_OPTIONS).toEqual({
      facing: "back",
      flash: "auto",
      maxDimension: 2048
    });
    expect(OCR_MAX_BYTES).toBe(10 * 1024 * 1024);
  });

  it("keeps dynamic tool schemas closed and named", () => {
    const parsed = dynamicToolSpecSchema.array().safeParse(dynamicTools);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.map((tool) => tool.name)).toEqual([...DYNAMIC_TOOL_NAMES]);
    for (const tool of parsed.data) {
      expect(tool.inputSchema).toMatchObject({
        type: "object",
        additionalProperties: false
      });
    }
  });

  it("validates the web search and fetch request contracts", () => {
    const search = webSearchRequestSchema.safeParse({ query: "  fractions  " });
    expect(search.success).toBe(true);
    if (search.success) {
      expect(search.data.query).toBe("fractions");
      expect(search.data.maxResults).toBe(5);
      expect(search.data.includeDomains).toEqual([]);
    }

    expect(webSearchRequestSchema.safeParse({ query: "" }).success).toBe(false);
    expect(
      webSearchRequestSchema.safeParse({ query: "fractions", maxResults: 11 }).success
    ).toBe(false);
    expect(
      webFetchRequestSchema.safeParse({ url: "https://example.test/page" }).success
    ).toBe(true);
    expect(webFetchRequestSchema.safeParse({ url: "not-a-url" }).success).toBe(false);
  });
});
