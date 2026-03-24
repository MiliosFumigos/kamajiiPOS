/**
 * 與 Prisma schema 的 Role enum 對齊，避免從 @prisma/client 直接引入型別造成 IDE/建置錯誤。
 * 資料庫寫入時使用字串值即可（如 Role.OWNER）。
 */

// 建立Role的interface

// type Role = "OWNER" | "MANAGER" | "STAFF" | "CUSTOMER";
export const Role = {
  OWNER: "OWNER",
  MANAGER: "MANAGER",
  STAFF: "STAFF",
  CUSTOMER: "CUSTOMER",
} as const;

export type Role = (typeof Role)[keyof typeof Role];
