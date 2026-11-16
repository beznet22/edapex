import { json } from "@sveltejs/kit";
import { join } from "path";
import { writeFileSync, mkdirSync } from "fs";
import { STORAGE_DIR } from "$lib/constants";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request, locals: { user } }) => {
  if (!user) {
    return json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { priority } = await request.json();

    if (!Array.isArray(priority)) {
      return json({ success: false, error: "Invalid priority format" }, { status: 400 });
    }

    const userSettingsDir = join(STORAGE_DIR, "users", user.id.toString());
    const settingsPath = join(userSettingsDir, "settings.json");

    // Ensure directory exists
    mkdirSync(userSettingsDir, { recursive: true });

    // Save settings
    const settings = {
        priority,
        updatedAt: new Date().toISOString()
    };

    writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

    return json({ 
        success: true, 
        message: "Settings saved successfully" 
    });
  } catch (error) {
    console.error("[api/settings/ai] Failed to save settings:", error);
    return json({ 
        success: false, 
        error: "Internal server error" 
    }, { status: 500 });
  }
};
