import type { RequestHandler } from "@sveltejs/kit";

export const POST: RequestHandler = async ({ request, params }) => {
  const { provider } = params;
  const body = await request.json();
  console.log("Webhook received", provider, body);
  return new Response("OK", { status: 200 });
};
