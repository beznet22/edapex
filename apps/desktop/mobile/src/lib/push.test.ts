import { describe, expect, it } from "vitest";

import { pushDeviceBody } from "./push";

describe("push device registration", () => {
  it("registers as an android device with the install id the server upserts on", () => {
    expect(pushDeviceBody("fcm-token-value", "install-1")).toEqual({
      platform: "android",
      token: "fcm-token-value",
      installId: "install-1"
    });
  });
});
