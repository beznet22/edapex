import { auth } from "$lib/server/service/auth.service";
import { json, type RequestHandler } from "@sveltejs/kit";

export const POST: RequestHandler = async ({ request, params })=> {
  const authType = params.authType;
  if(!authType) return json({ error: "Invalid auth type" }, { status: 400 });

  if (authType !== "refresh" && authType !== "logout") {
    return json({ error: "Invalid auth type" }, { status: 400 });
  }

  try {
    const { refreshToken, sessionId } = await request.json();
    if (authType && authType === "logout") {
      const result = await auth.logoutMobile(sessionId);
      return json(result);
    }

    if(!refreshToken) return json({ error: "No refresh token" }, { status: 400 });

    const result = await auth.refreshMobile(refreshToken);
    return json(result);
  } catch (e:any) {
    return json({ error: e.message }, { status: 401 });
  }
}
