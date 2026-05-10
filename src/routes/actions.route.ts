import express from "express";
import { actionsController } from "../controllers";
import { cacheControl } from "../middleware/cache.middleware";

const router = express.Router();

/**
 * @openapi
 * /actions/types:
 *   get:
 *     summary: Catalog of governance action types
 *     description: Lists distinct governance action types currently in the proposal corpus, with the number of proposals each type covers. Labels match the display format used by /proposal/{id}.type.
 *     tags:
 *       - Governance Actions
 *     responses:
 *       200:
 *         description: Successfully retrieved action types
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 types:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       type:
 *                         type: string
 *                       count:
 *                         type: integer
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get("/types", cacheControl(300), actionsController.getActionTypes);

export default router;
