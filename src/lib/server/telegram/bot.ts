import { env } from "$env/dynamic/private";

export const TELEGRAM_BOT_TOKEN: string = env.TELEGRAM_BOT_TOKEN ?? "";
export const TELEGRAM_BOT_USERNAME: string = env.TELEGRAM_BOT_USERNAME ?? "";
const TELEGRAM_WEBHOOK_URL: string = env.TELEGRAM_WEBHOOK_URL ?? "";

const TELEGRAM_API_BASE = "https://api.telegram.org";

export interface TelegramUpdate {
	update_id: number;
	message?: {
		message_id: number;
		from: {
			id: number;
			first_name: string;
			last_name?: string;
			username?: string;
		};
		chat: {
			id: number;
			type: "private" | "group" | "supergroup" | "channel";
		};
		text?: string;
		date: number;
	};
}

export interface TelegramApiResponse<T> {
	ok: boolean;
	description?: string;
	result?: T;
}

async function callTelegram<T>(
	method: string,
	body: Record<string, unknown>,
): Promise<TelegramApiResponse<T>> {
	if (!TELEGRAM_BOT_TOKEN) {
		return { ok: false, description: "TELEGRAM_BOT_TOKEN is not configured" };
	}
	const res = await fetch(`${TELEGRAM_API_BASE}/bot${TELEGRAM_BOT_TOKEN}/${method}`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
	if (!res.ok) {
		return {
			ok: false,
			description: `Telegram API HTTP ${res.status}: ${await res.text()}`,
		};
	}
	return (await res.json()) as TelegramApiResponse<T>;
}

export async function setWebhook(): Promise<{ ok: boolean; description?: string }> {
	return callTelegram<true>("setWebhook", {
		url: TELEGRAM_WEBHOOK_URL,
		allowed_updates: ["message"],
	});
}

export async function sendMessage(
	chatId: number | string,
	text: string,
	parseMode?: "HTML" | "MarkdownV2" | "Markdown",
): Promise<{ ok: boolean; result?: { message_id: number } }> {
	const body: Record<string, unknown> = {
		chat_id: chatId,
		text,
	};
	if (parseMode) body.parse_mode = parseMode;
	return callTelegram<{ message_id: number }>("sendMessage", body);
}
