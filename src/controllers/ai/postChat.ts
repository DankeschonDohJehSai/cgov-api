import { Request, Response } from "express";
import axios from "axios";
import { formatAxiosLikeError } from "../../utils/format-http-client-error";

const WALLET_ADDRESS_PATTERN =
  /^(addr|addr_test|stake|stake_test)1[0-9a-z]{20,}$/;
const MAX_MESSAGE_LENGTH = 16_000;
const UPSTREAM_TIMEOUT_MS = 120_000;

interface ChatRequestBody {
  message?: string;
  sessionId?: string;
  walletAddress?: string;
  /**
   * Sidanclaw destroy-and-regenerate retry/edit. UUID of a user message
   * in the same session — that row and every subsequent row are deleted
   * upstream before the new turn is appended, and the model gets a hint
   * to pick a different angle.
   */
  truncateFromMessageId?: string;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /ai/chat
 *
 * Proxies a chat message to the upstream Sidanclaw assistant.
 * Hosted on the backend (not on Next.js) because LLM completions
 * routinely exceed serverless function timeouts.
 */
export const postChat = async (req: Request, res: Response) => {
  const baseUrl = process.env.SIDANCLAW_API_URL || "https://api.sidan.ai";
  const apiKey = process.env.SIDANCLAW_API_KEY;
  const assistantId = process.env.SIDANCLAW_ASSISTANT_ID;

  if (!apiKey || !assistantId) {
    return res
      .status(500)
      .json({ error: "AI assistant is not configured on the server" });
  }

  const { message, sessionId, walletAddress, truncateFromMessageId } =
    (req.body || {}) as ChatRequestBody;

  if (
    truncateFromMessageId !== undefined &&
    (typeof truncateFromMessageId !== "string" ||
      !UUID_PATTERN.test(truncateFromMessageId))
  ) {
    return res
      .status(400)
      .json({ error: "truncateFromMessageId must be a UUID" });
  }

  if (
    !walletAddress ||
    typeof walletAddress !== "string" ||
    !WALLET_ADDRESS_PATTERN.test(walletAddress)
  ) {
    return res
      .status(401)
      .json({ error: "Wallet connection required to use AI chat" });
  }

  if (!message || typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ error: "Message is required" });
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    return res
      .status(400)
      .json({ error: `Message exceeds ${MAX_MESSAGE_LENGTH} character limit` });
  }

  try {
    const upstream = await axios.post(
      `${baseUrl}/api/v1/assistants/${assistantId}/messages`,
      {
        externalUserId: `cgov:${walletAddress}`,
        sessionId,
        message,
        ...(truncateFromMessageId ? { truncateFromMessageId } : {}),
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: UPSTREAM_TIMEOUT_MS,
        validateStatus: () => true,
      }
    );

    if (upstream.status < 200 || upstream.status >= 300) {
      const data = upstream.data as { error?: string; message?: string } | null;
      return res.status(upstream.status).json({
        error:
          (data && (data.error || data.message)) ||
          `Upstream error (${upstream.status})`,
      });
    }

    const data = upstream.data as {
      reply?: string;
      sessionId?: string;
      messageId?: string;
      model?: string;
    };

    return res.status(200).json({
      reply: data?.reply ?? "",
      sessionId: data?.sessionId,
      messageId: data?.messageId,
      model: data?.model,
    });
  } catch (error) {
    console.error("ai/chat proxy error:", formatAxiosLikeError(error));
    return res.status(502).json({ error: "Failed to reach AI assistant" });
  }
};
