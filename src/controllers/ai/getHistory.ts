import { Request, Response } from "express";
import axios from "axios";
import { formatAxiosLikeError } from "../../utils/format-http-client-error";
import { stripContextPreamble } from "./_compose";

const WALLET_ADDRESS_PATTERN =
  /^(addr|addr_test|stake|stake_test)1[0-9a-z]{20,}$/;
const UPSTREAM_TIMEOUT_MS = 15_000;
const MAX_LIMIT = 200;

interface UpstreamMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  sequenceNum: number;
  createdAt: string;
}

interface UpstreamHistory {
  sessionId: string;
  messages: UpstreamMessage[];
}

/**
 * GET /ai/chat/history?walletAddress=<addr>&scope=<scope>&limit=<n>
 *
 * Reads message history from the upstream Sidanclaw assistant for the
 * (walletAddress, scope) tuple. Mirrors the sessionId convention used by
 * POST /ai/chat: `cgov-${scope}-${walletAddress}` and
 * `externalUserId = cgov:${walletAddress}`.
 *
 * Lets the cgov frontend self-heal after a refresh / tab close that
 * interrupted a chat reply: on next mount, the panel pulls the latest
 * server state and rebuilds the conversation.
 */
export const getHistory = async (req: Request, res: Response) => {
  const baseUrl = process.env.SIDANCLAW_API_URL || "https://api.sidan.ai";
  const apiKey = process.env.SIDANCLAW_API_KEY;
  const assistantId = process.env.SIDANCLAW_ASSISTANT_ID;

  if (!apiKey || !assistantId) {
    return res
      .status(500)
      .json({ error: "AI assistant is not configured on the server" });
  }

  const walletAddress = String(req.query.walletAddress ?? "");
  const scope = String(req.query.scope ?? "global");
  const limitRaw = req.query.limit;

  if (!WALLET_ADDRESS_PATTERN.test(walletAddress)) {
    return res
      .status(401)
      .json({ error: "Wallet connection required to read chat history" });
  }

  let limit: number | undefined;
  if (typeof limitRaw === "string" && limitRaw.length > 0) {
    const parsed = Number.parseInt(limitRaw, 10);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > MAX_LIMIT) {
      return res
        .status(400)
        .json({ error: `limit must be a positive integer up to ${MAX_LIMIT}` });
    }
    limit = parsed;
  }

  const externalUserId = `cgov:${walletAddress}`;
  const sessionId = `cgov-${scope}-${walletAddress}`;

  try {
    const upstream = await axios.get<UpstreamHistory>(
      `${baseUrl}/api/v1/assistants/${assistantId}/messages`,
      {
        params: {
          externalUserId,
          sessionId,
          ...(limit ? { limit } : {}),
        },
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        timeout: UPSTREAM_TIMEOUT_MS,
        validateStatus: () => true,
      },
    );

    if (upstream.status < 200 || upstream.status >= 300) {
      const data = upstream.data as { error?: string; detail?: string } | null;
      return res.status(upstream.status).json({
        error:
          (data && (data.error || data.detail)) ||
          `Upstream error (${upstream.status})`,
      });
    }

    const data = upstream.data;
    // Strip the per-turn context preamble that POST /ai/chat welds onto
    // the first user turn (proposal description, rationale, etc.). The
    // model needs to see it; the cgov chat UI does not — without this,
    // the user's bubble would render the entire system context.
    const rawMessages = Array.isArray(data?.messages) ? data.messages : [];
    const messages = rawMessages.map((m) =>
      m.role === "user"
        ? { ...m, content: stripContextPreamble(m.content) }
        : m,
    );
    return res.status(200).json({
      sessionId: data?.sessionId ?? sessionId,
      messages,
    });
  } catch (error) {
    console.error("ai/chat history proxy error:", formatAxiosLikeError(error));
    return res
      .status(502)
      .json({ error: "Failed to read AI assistant history" });
  }
};
