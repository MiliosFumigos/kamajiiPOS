import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/types";

type RecipeLineInput = {
  ingredientId: string;
  quantity: number;
};

type CustomizationInput = {
  label: string;
  priceDelta: number;
  maxQuantity: number;
  recipe?: RecipeLineInput[];
};

type MenuItemInput = {
  id?: string;
  name: string;
  price: number;
  dailyLimit: number;
  prepMinutes: number;
  imageUrl?: string | null;
  recipe: RecipeLineInput[];
  categories?: string[];
  customizations?: CustomizationInput[];
};

function mapMenuItems(items: {
  id: string;
  name: string;
  price: number;
  dailyLimit: number;
  prepMinutes: number;
  imageUrl: string | null;
  categories: string[];
  recipeLines: { ingredientId: string; quantity: number }[];
  customizations: {
    id: string;
    label: string;
    priceDelta: number;
    maxQuantity: number;
    extraRecipeLines: { ingredientId: string; quantity: number }[];
  }[];
}[]) {
  return items.map((item) => ({
    id: item.id,
    name: item.name,
    price: item.price,
    dailyLimit: item.dailyLimit,
    prepMinutes: item.prepMinutes,
    imageUrl: item.imageUrl ?? undefined,
    categories: item.categories ?? [],
    recipe: item.recipeLines.map((r) => ({
      ingredientId: r.ingredientId,
      quantity: r.quantity,
    })),
    customizations: item.customizations.map((c) => ({
      id: c.id,
      label: c.label,
      priceDelta: c.priceDelta,
      maxQuantity: c.maxQuantity,
      recipe: (c as any).extraRecipeLines
        ? (c as any).extraRecipeLines.map((r: any) => ({
            ingredientId: r.ingredientId,
            quantity: r.quantity,
          }))
        : [],
    })),
  }));
}

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

  const items = await prisma.menuItem.findMany({
    where: {
      brandId,
      storeId,
      isActive: true,
    },
    include: {
      recipeLines: {
        select: {
          ingredientId: true,
          quantity: true,
        },
      },
      customizations: {
        select: {
          id: true,
          label: true,
          priceDelta: true,
          maxQuantity: true,
          extraRecipeLines: {
            select: { ingredientId: true, quantity: true },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ items: mapMenuItems(items) });
}

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

  const body = (await request.json()) as MenuItemInput;

  const name = body.name.trim();
  if (!name) {
    return new NextResponse("Name is required", { status: 400 });
  }

  const price = Number.isFinite(body.price) ? Math.max(0, Math.round(body.price)) : 0;
  const dailyLimit = Number.isFinite(body.dailyLimit)
    ? Math.max(0, Math.round(body.dailyLimit))
    : 0;
  const prepMinutes = Number.isFinite(body.prepMinutes)
    ? Math.max(0, Math.round(body.prepMinutes))
    : 0;

  const recipe = (body.recipe ?? []).filter(
    (r) => r.ingredientId && Number.isFinite(r.quantity) && r.quantity > 0
  );
  const categories = (body.categories ?? [])
    .map((c) => c.trim())
    .filter((c) => c.length > 0);

  const customizations = (body.customizations ?? []).filter(
    (c) =>
      c.label?.trim() &&
      Number.isFinite(c.priceDelta) &&
      Number.isFinite(c.maxQuantity) &&
      c.maxQuantity > 0
  );

  await prisma.$transaction(async (tx) => {
    let menuItemId = body.id;

    if (menuItemId) {
      const existing = await tx.menuItem.findFirst({
        where: {
          id: menuItemId,
          brandId,
          storeId,
        },
        select: { id: true },
      });
      if (!existing) {
        throw new Error("Menu item not found");
      }

      await tx.menuItem.update({
        where: { id: menuItemId },
        data: {
          name,
          price,
          dailyLimit,
          prepMinutes,
          imageUrl: body.imageUrl?.trim() || null,
          categories,
          isActive: true,
          storeId,
        },
      });

      await tx.menuItemIngredient.deleteMany({
        where: { menuItemId },
      });

      await tx.menuItemCustomization.deleteMany({
        where: { menuItemId },
      });
    } else {
      const created = await tx.menuItem.create({
        data: {
          brandId,
          storeId,
          name,
          price,
          dailyLimit,
          prepMinutes,
          imageUrl: body.imageUrl?.trim() || null,
          categories,
          isActive: true,
        },
      });
      menuItemId = created.id;
    }

    if (recipe.length > 0 && menuItemId) {
      // 確保配方用到的原料屬於同一個 store，避免跨店共用
      const ingredientIds = Array.from(new Set(recipe.map((r) => r.ingredientId)));
      const count = await tx.ingredient.count({
        where: { brandId, storeId, id: { in: ingredientIds } },
      });
      if (count !== ingredientIds.length) {
        throw new Error("配方原料不屬於此分店");
      }

      await tx.menuItemIngredient.createMany({
        data: recipe.map((r) => ({
          menuItemId,
          ingredientId: r.ingredientId,
          quantity: Math.max(1, Math.round(r.quantity)),
        })),
      });
    }

    if (customizations.length > 0 && menuItemId) {
      for (const c of customizations) {
        const created = await tx.menuItemCustomization.create({
          data: {
            menuItemId,
            label: c.label.trim(),
            priceDelta: Math.round(c.priceDelta),
            maxQuantity: Math.max(1, Math.round(c.maxQuantity)),
          },
        });

        const extraRecipe = (c.recipe ?? []).filter(
          (r) => r.ingredientId && Number.isFinite(r.quantity) && r.quantity > 0
        );
        if (extraRecipe.length > 0) {
          await tx.menuItemCustomizationIngredient.createMany({
            data: extraRecipe.map((r) => ({
              customizationId: created.id,
              ingredientId: r.ingredientId,
              quantity: Math.max(1, Math.round(r.quantity)),
            })),
          });
        }
      }
    }
  });

  const items = await prisma.menuItem.findMany({
    where: {
      brandId,
      storeId,
      isActive: true,
    },
    include: {
      recipeLines: {
        select: {
          ingredientId: true,
          quantity: true,
        },
      },
      customizations: {
        select: {
          id: true,
          label: true,
          priceDelta: true,
          maxQuantity: true,
          extraRecipeLines: {
            select: { ingredientId: true, quantity: true },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ items: mapMenuItems(items) });
}

export async function DELETE(request: Request) {
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

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return new NextResponse("Missing id", { status: 400 });
  }

  await prisma.menuItem.deleteMany({
    where: {
      id,
      brandId,
      storeId,
    },
  });

  const items = await prisma.menuItem.findMany({
    where: {
      brandId,
      storeId,
      isActive: true,
    },
    include: {
      recipeLines: {
        select: {
          ingredientId: true,
          quantity: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ items: mapMenuItems(items) });
}

