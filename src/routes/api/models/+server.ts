import { json } from "@sveltejs/kit";
import { getAvailableModels } from "$lib/server/provider/router";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals: { user } }) => {
  if (!user) {
    return json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    return json({ 
      success: true, 
      models: getAvailableModels(user.id)
    });
  } catch (error) {
    console.error("[api/models] Failed to fetch models:", error);
    return json({ success: false, message: "Failed to load models" }, { status: 500 });
  }
};
