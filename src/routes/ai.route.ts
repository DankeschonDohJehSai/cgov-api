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

export default router;
