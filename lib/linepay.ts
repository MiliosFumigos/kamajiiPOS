import crypto from "crypto";

type LinePayConfig = {
  channelId: string;
  channelSecret: string;
  apiBase: string;
  currency: string;
};

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing env: ${name}`);
  }
  return value;
}

export function getLinePayConfig(): LinePayConfig {
  return {
    channelId: requiredEnv("LINE_PAY_CHANNEL_ID"),
    channelSecret: requiredEnv("LINE_PAY_CHANNEL_SECRET"),
    apiBase: requiredEnv("LINE_PAY_API_BASE").replace(/\/+$/, ""),
    currency: (process.env.LINE_PAY_CURRENCY ?? "TWD").trim().toUpperCase(),
  };
}

function createAuthorization({
  channelSecret,
  requestPath,
  body,
  nonce,
}: {
  channelSecret: string;
  requestPath: string;
  body: string;
  nonce: string;
}) {
  const signTarget = `${channelSecret}${requestPath}${body}${nonce}`;
  return crypto.createHmac("sha256", channelSecret).update(signTarget).digest("base64");
}

export async function linePayRequest<TResponse>({
  method,
  requestPath,
  body,
}: {
  method: "POST" | "GET";
  requestPath: string;
  body?: unknown;
}): Promise<TResponse> {
  const config = getLinePayConfig();
  const nonce = crypto.randomUUID();
  const bodyText = body ? JSON.stringify(body) : "";

  const authorization = createAuthorization({
    channelSecret: config.channelSecret,
    requestPath,
    body: bodyText,
    nonce,
  });

  const response = await fetch(`${config.apiBase}${requestPath}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-LINE-ChannelId": config.channelId,
      "X-LINE-Authorization-Nonce": nonce,
      "X-LINE-Authorization": authorization,
    },
    body: method === "POST" ? bodyText : undefined,
    cache: "no-store",
  });

  if (!response.ok) {
    const raw = await response.text();
    throw new Error(`LINE Pay API failed (${response.status}): ${raw}`);
  }

  return (await response.json()) as TResponse;
}
