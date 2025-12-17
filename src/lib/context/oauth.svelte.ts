import { addToken } from "$lib/api/agent.remote";
import type { CredentialType, DeviceAuth } from "$lib/schema/chat-schema";
import { toast } from "svelte-sonner";

let popup: Window | null = null;

async function poll_device_code(
  { device_code, provider, interval, expires_in }: DeviceAuth & { provider: CredentialType },
  controller: AbortController
) {
  const timeout = setTimeout(() => {
    controller.abort();
    if (popup) popup.close();
  }, expires_in * 1000);

  try {
    while (true) {
      if (controller.signal.aborted) break;
      console.log("Polling for token...");
      const data = await addToken({ device_code, provider });
      if (data.success) {
        console.log("✅ Credentials added successfully");
        if (popup) popup.close();
        toast.success("Provider added successfully");
        break;
      }

      if (data.status === "pending") {
        await new Promise((r) => setTimeout(r, interval * 1000));
        continue;
      }

      console.warn("❌ Authorization failed:", data);
      if (popup) popup.close();
      break;
    }
  } catch (err: any) {
    if (err.name !== "AbortError") console.error("⚠️ Polling error:", err);
  } finally {
    clearTimeout(timeout);
  }
}

export function saveTokenData(data: DeviceAuth & { provider: CredentialType }) {
  if (!data.authUrl || !data.device_code) {
    console.error("Invalid OAuth2 response", data);
    return;
  }

  const features = [
    "width=500",
    "height=600",
    "left=200",
    "top=100",
    "resizable=no",
    "scrollbars=yes",
    "status=yes",
    "toolbar=no",
    "menubar=no",
    "popup=true",
  ].join(",");

  if (popup && !popup.closed) {
    popup.focus();
    popup.location.href = data.authUrl;
  } else {
    popup = window.open(data.authUrl, "oauth2_popup", features);
  }

  const controller = new AbortController();
  const checkPopup = setInterval(() => {
    if (popup && popup.closed) {
      controller.abort();
      clearInterval(checkPopup);
    }
  }, 1000);

  window.addEventListener("focus", function () {
    if (popup && !popup.closed) {
      popup.focus();
    }
  });

  poll_device_code(data, controller);
}
