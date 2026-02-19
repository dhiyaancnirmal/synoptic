import type { Express, Request, Response } from "express";
import { z } from "zod";
import type {
  ShopifyCatalogSearchRequest,
  ShopifyCatalogSearchResponse,
  ShopifyProductDetailsResponse
} from "@synoptic/types/rest";
import type { ApiContext } from "../context.js";
import { requireAuth } from "../middleware/auth.js";
import { ApiError, sendApiError } from "../utils/errors.js";

const searchSchema = z.object({
  query: z.string().min(1),
  available_for_sale: z.boolean().optional(),
  min_price: z.number().optional(),
  max_price: z.number().optional(),
  products_limit: z.number().int().positive().max(50).optional()
});

export function registerShopifyRoutes(app: Express, context: ApiContext): void {
  const authMiddleware = requireAuth(context.config.JWT_SECRET);

  app.post(
    "/shopify/catalog/search",
    authMiddleware,
    async (req: Request<unknown, ShopifyCatalogSearchResponse, ShopifyCatalogSearchRequest>, res: Response) => {
      const parsed = searchSchema.safeParse(req.body);
      if (!parsed.success) {
        sendApiError(
          res,
          new ApiError("VALIDATION_ERROR", 400, "Invalid Shopify catalog search payload", {
            reason: "INVALID_SHOPIFY_SEARCH_REQUEST",
            retryable: false
          }),
          req.requestId
        );
        return;
      }

      const data = await context.shopifyCatalogService.searchCatalog(parsed.data as Record<string, unknown>);
      res.json({ data });
    }
  );

  app.get(
    "/shopify/catalog/product/:upid",
    authMiddleware,
    async (req: Request<{ upid: string }, ShopifyProductDetailsResponse>, res: Response) => {
      if (!req.params.upid) {
        sendApiError(
          res,
          new ApiError("VALIDATION_ERROR", 400, "Missing upid path parameter", {
            reason: "MISSING_SHOPIFY_UPID",
            retryable: false
          }),
          req.requestId
        );
        return;
      }

      const data = await context.shopifyCatalogService.getProductDetails(req.params.upid);
      res.json({ data });
    }
  );
}
