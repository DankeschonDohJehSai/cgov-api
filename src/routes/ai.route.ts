import express from "express";
import { aiController } from "../controllers";

const router = express.Router();

/**
 * @openapi
 * /ai/chat:
 *   post:
 *     summary: Proxy a chat message to the AI assistant
 *     description: Forwards a user message to the upstream Sidanclaw assistant and returns the reply. Requires a connected Cardano wallet address.
 *     tags:
 *       - AI
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *               - walletAddress
 *             properties:
 *               message:
 *                 type: string
 *                 maxLength: 16000
 *               walletAddress:
 *                 type: string
 *                 description: Cardano bech32 address (addr/stake, mainnet or testnet)
 *               sessionId:
 *                 type: string
 *               context:
 *                 type: string
 *                 description: Optional prefix prepended to the message before forwarding upstream
 *     responses:
 *       200:
 *         description: Successful AI response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 reply:
 *                   type: string
 *                 sessionId:
 *                   type: string
 *                 messageId:
 *                   type: string
 *                 model:
 *                   type: string
 *       400:
 *         description: Invalid request body
 *       401:
 *         description: Wallet address missing or malformed
 *       500:
 *         description: AI assistant not configured on the server
 *       502:
 *         description: Failed to reach upstream AI assistant
 */
router.post("/chat", aiController.postChat);

/**
 * @openapi
 * /ai/chat/history:
 *   get:
 *     summary: Read AI chat history for a wallet
 *     description: Returns prior session messages so the cgov frontend can self-heal after a refresh or tab close that interrupted a reply.
 *     tags:
 *       - AI
 *     parameters:
 *       - name: walletAddress
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *         description: Cardano bech32 address (addr/stake, mainnet or testnet)
 *       - name: scope
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *           default: "global"
 *         description: Conversation scope (e.g. "global" or a proposal id) — must match the value used when sending
 *       - name: limit
 *         in: query
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 200
 *     responses:
 *       200:
 *         description: Session history (may be empty)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sessionId:
 *                   type: string
 *                 messages:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       role:
 *                         type: string
 *                         enum: [user, assistant]
 *                       content:
 *                         type: string
 *                       sequenceNum:
 *                         type: integer
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *       401:
 *         description: Wallet address missing or malformed
 *       500:
 *         description: AI assistant not configured
 *       502:
 *         description: Upstream history fetch failed
 */
router.get("/chat/history", aiController.getHistory);

export default router;
