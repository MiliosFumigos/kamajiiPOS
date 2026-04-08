import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/types";
import type { Prisma } from "@prisma/client";

type IngredientWithInventory = Prisma.IngredientGetPayload<{
  include: { inventories: true };
}>;

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const brandId = session.user.brandId;
  const storeId = session.user.storeId;
  if (!brandId) {
    return new NextResponse("Brand not found for user", { status: 400 });
  }
  if (!storeId) {
    return new NextResponse("Store not found for user", { status: 400 });
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
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { role, brandId, storeId } = session.user;
  if (!brandId) {
    return new NextResponse("Brand not found for user", { status: 400 });
  }
  if (!storeId) {
    return new NextResponse("Store not found for user", { status: 400 });
  }

  if (role !== Role.MANAGER && role !== Role.STAFF) {
    return new NextResponse("Forbidden", { status: 403 });
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

      // 前端新增列會用 crypto.randomUUID() 當暫存 id，DB 尚無該筆時不可 update，需改為 create
      if (item.id) {
        const existing = await tx.ingredient.findFirst({
          where: { id: item.id, brandId, storeId },
        });

        if (existing) {
          const ing = await tx.ingredient.update({
            where: { id: existing.id },
            data: { name, unit, storeId },
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
        } else {
          const ing = await tx.ingredient.create({
            data: {
              name,
              unit,
              brandId,
              storeId,
            },
          });

          await tx.inventory.create({
            data: {
              brandId,
              storeId,
              ingredientId: ing.id,
              quantity,
            },
          });
        }
      } else {
        const ing = await tx.ingredient.create({
          data: {
            name,
            unit,
            brandId,
            storeId,
          },
        });

        await tx.inventory.create({
          data: {
            brandId,
            storeId,
            ingredientId: ing.id,
            quantity,
          },
        });
      }
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
}