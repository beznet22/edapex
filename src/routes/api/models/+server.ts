import { json } from "@sveltejs/kit";
import { MODEL_REGISTRY } from "$lib/server/mastra/registry";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals: { user } }) => {
  if (!user) {
    return json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    return json({ 
      success: true, 
      models: MODEL_REGISTRY
    });
  } catch (error) {
    console.error("[api/models] Failed to fetch models:", error);
    return json({ success: false, message: "Failed to load models" }, { status: 500 });
  }
};
