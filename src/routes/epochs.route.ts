import express from "express";
import { epochsController } from "../controllers";
import { cacheControl } from "../middleware/cache.middleware";

const router = express.Router();

/**
 * @openapi
 * /epochs/range:
 *   get:
 *     summary: Get epoch range available in the database
 *     description: Returns the min/max/current epochs covered by proposal and epoch_totals data. Used by clients to size epoch sliders and sparklines.
 *     tags:
 *       - Epochs
 *     responses:
 *       200:
 *         description: Successfully retrieved epoch range
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 min:
 *                   type: integer
 *                 max:
 *                   type: integer
 *                 current:
 *                   type: integer
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get("/range", cacheControl(300), epochsController.getEpochsRange);

export default router;
