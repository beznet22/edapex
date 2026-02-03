import { json, type RequestHandler } from "@sveltejs/kit";
import { cookies } from "$lib/server/helpers";
import { CredentialType } from "$lib/schema/chat-schema";

export const GET: RequestHandler = async ({ url, cookies: nativeCookies }) => {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error) {
        return new Response(`Authentication error: ${error}`, { status: 400 });
    }

    if (!code || !state) {
        return new Response("Missing code or state", { status: 400 });
    }

    // Store the code in a cookie indexed by state
    // This will be picked up by the polling getToken call
    const cookieName = `auth_code_${state}`;
    nativeCookies.set(cookieName, code, {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        maxAge: 300, // 5 minutes
    });

    // Return a simple success page that the popup will show
    return new Response(`
    <html>
      <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0f172a; color: white;">
        <div style="text-align: center; padding: 2rem; border-radius: 1rem; background: #1e293b; border: 1px solid #334155; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);">
          <h1 style="color: #38bdf8;">Authorization Successful!</h1>
          <p>You can close this window now.</p>
          <button onclick="window.close()" style="margin-top: 1rem; padding: 0.5rem 1rem; border-radius: 0.5rem; border: none; background: #38bdf8; color: #0f172a; cursor: pointer; font-weight: bold;">Close Window</button>
        </div>
        <script>
          setTimeout(() => window.close(), 3000);
        </script>
      </body>
    </html>
  `, {
        headers: { "Content-Type": "text/html" }
    });
};
