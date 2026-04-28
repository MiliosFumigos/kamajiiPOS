const bcrypt = require("bcryptjs");
const { PrismaClient, Role, PaymentStatus, PaymentMethod, OrderStatus } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const now = new Date();

  const brand = await prisma.brand.upsert({
    where: { subdomain: "demo" },
    update: { name: "Demo Brand" },
    create: {
      name: "Demo Brand",
      subdomain: "demo",
    },
  });

  const store = await prisma.store.upsert({
    where: { id: "seed-demo-store" },
    update: { name: "Demo Store", brandId: brand.id },
    create: {
      id: "seed-demo-store",
      name: "Demo Store",
      brandId: brand.id,
    },
  });

  const ownerPassword = await bcrypt.hash("123456", 10);
  const managerPassword = await bcrypt.hash("123456", 10);

  await prisma.user.upsert({
    where: { email_brandId: { email: "owner@demo.local", brandId: brand.id } },
    update: {
      name: "Demo Owner",
      role: Role.OWNER,
      storeId: null,
      password: ownerPassword,
    },
    create: {
      name: "Demo Owner",
      email: "owner@demo.local",
      password: ownerPassword,
      role: Role.OWNER,
      brandId: brand.id,
    },
  });

  const manager = await prisma.user.upsert({
    where: { email_brandId: { email: "manager@demo.local", brandId: brand.id } },
    update: {
      name: "Demo Manager",
      role: Role.MANAGER,
      storeId: store.id,
      password: managerPassword,
    },
    create: {
      name: "Demo Manager",
      email: "manager@demo.local",
      password: managerPassword,
      role: Role.MANAGER,
      brandId: brand.id,
      storeId: store.id,
    },
  });

  const drink = await prisma.menuItem.create({
    data: {
      brandId: brand.id,
      storeId: store.id,
      name: `穀茶-測試-${now.getTime()}`,
      price: 65,
      dailyLimit: 999,
      prepMinutes: 5,
      categories: ["飲品", "測試資料"],
      isActive: true,
    },
  });

  await prisma.order.create({
    data: {
      brandId: brand.id,
      storeId: store.id,
      displayId: `SEED-${now.getTime()}`,
      total: 65,
      paymentStatus: PaymentStatus.PAID,
      paymentMethod: PaymentMethod.CASH,
      status: OrderStatus.COMPLETED,
      placedAt: now,
      startedAt: new Date(now.getTime() + 1 * 60 * 1000),
      customerEta: new Date(now.getTime() + 12 * 60 * 1000),
      readyAt: new Date(now.getTime() + 10 * 60 * 1000),
      createdByUserId: manager.id,
      completedByUserId: manager.id,
      items: {
        create: [
          {
            menuItemId: drink.id,
            name: drink.name,
            unitPrice: drink.price,
            prepMinutes: drink.prepMinutes,
            quantity: 1,
          },
        ],
      },
    },
  });

  console.log("Seed completed.");
  console.log("Owner: owner@demo.local / 123456");
  console.log("Manager: manager@demo.local / 123456");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
