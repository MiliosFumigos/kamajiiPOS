import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/types";
import type { Prisma } from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { apiError } from "@/lib/api-error";

type IngredientWithInventory = Prisma.IngredientGetPayload<{
  include: { inventories: true };
}>;

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return apiError("UNAUTHORIZED", "Unauthorized", 401);
  }

  const brandId = session.user.brandId;
  const storeId = session.user.storeId;
  if (!brandId) {
    return apiError("BRAND_NOT_FOUND", "Brand not found for user", 400);
  }
  if (!storeId) {
    return apiError("STORE_NOT_FOUND", "Store not found for user", 400);
  }

  const ingredients: IngredientWithInventory[] =
    await prisma.ingredient.findMany({
      where: { brandId, storeId },
      include: {
        inventories: {
          where: { brandId, storeId },
        },
      },
      orderBy: { createdAt: "asc" },
    });

  const items = ingredients.map((ing) => {
    const stock = ing.inventories[0];
    return {
      id: ing.id,
      name: ing.name,
      unit: ing.unit,
      quantity: stock?.quantity ?? 0,
    };
  });

  return NextResponse.json({ items });
}

type SaveItem = {
  id?: string;
  name: string;
  unit: string;
  quantity: number;
  deleted?: boolean;
};

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return apiError("UNAUTHORIZED", "Unauthorized", 401);
    }

    const { role, brandId, storeId } = session.user;
    if (!brandId) {
      return apiError("BRAND_NOT_FOUND", "Brand not found for user", 400);
    }
    if (!storeId) {
      return apiError("STORE_NOT_FOUND", "Store not found for user", 400);
    }

    if (role !== Role.MANAGER && role !== Role.STAFF) {
      return apiError("FORBIDDEN", "Forbidden", 403);
    }

    const body = (await request.json()) as { items: SaveItem[] | undefined };
    const items = body.items ?? [];

    await prisma.$transaction(async (tx) => {
      for (const item of items) {
        const name = item.name.trim();
        const unit = (item.unit || "份").trim() || "份";
        const quantity = Number.isFinite(item.quantity)
          ? Math.max(0, Math.floor(item.quantity))
          : 0;

        if (item.deleted) {
          if (item.id) {
            await tx.inventory.deleteMany({
              where: { brandId, storeId, ingredientId: item.id },
            });
            await tx.ingredient.deleteMany({
              where: { id: item.id, brandId, storeId },
            });
          }
          continue;
        }

        if (!name) continue;

        // 優先以 id 對應，找不到時以 (storeId, name) 對應，避免前端暫存 UUID 造成重複建立
        const existingById = item.id
          ? await tx.ingredient.findFirst({
              where: { id: item.id, brandId, storeId },
            })
          : null;
        const existingByName = existingById
          ? null
          : await tx.ingredient.findFirst({
              where: { name, brandId, storeId },
            });
        const existing = existingById ?? existingByName;

        const ing = existing
          ? await tx.ingredient.update({
              where: { id: existing.id },
              data: { name, unit, storeId },
            })
          : await tx.ingredient.create({
              data: {
                name,
                unit,
                brandId,
                storeId,
              },
            });

        await tx.inventory.upsert({
          where: {
            storeId_ingredientId: { storeId, ingredientId: ing.id },
          },
          update: { quantity, brandId, storeId },
          create: {
            brandId,
            storeId,
            ingredientId: ing.id,
            quantity,
          },
        });
      }
    });

    const ingredients: IngredientWithInventory[] =
      await prisma.ingredient.findMany({
        where: { brandId, storeId },
        include: {
          inventories: {
            where: { brandId, storeId },
          },
        },
        orderBy: { createdAt: "asc" },
      });

    const itemsResult = ingredients.map((ing) => {
      const stock = ing.inventories[0];
      return {
        id: ing.id,
        name: ing.name,
        unit: ing.unit,
        quantity: stock?.quantity ?? 0,
      };
    });

    return NextResponse.json({ items: itemsResult });
  } catch (error) {
    if (error instanceof PrismaClientKnownRequestError && error.code === "P2002") {
      return apiError(
        "INVENTORY_DUPLICATE_NAME",
        "同分店已有相同原料名稱，請更換名稱後再儲存",
        409
      );
    }

    console.error("POST /api/inventory failed:", error);
    return apiError("INVENTORY_SAVE_FAILED", "儲存庫存失敗，請稍後再試", 500);
  }
}