## 目的
讓「主網域登入 / 註冊」後，跳到「品牌子網域」(`*.domain`) 的 `/app/...` 仍然是已登入狀態（共用同一份 NextAuth session）。

## 現象（本次遇到的問題）
在 `http://localhost:3000/register` 註冊並自動登入後，導向 `http://<brand>.localhost:3000/app/dashboard` 時會被視為未登入，接著被導到：

- `/login?callbackUrl=/app/dashboard`

原因是 session cookie 預設是 **host-only**：

- 在 `localhost` 寫入的 cookie，不會自動帶到 `<brand>.localhost`

## 對應解法
在 NextAuth 設定（`lib/auth.ts`）把 cookie `domain` 設成「主網域」(含所有子網域)：

- 開發環境：建議用 `.lvh.me`（A 方案，本機也能穩定支援 `*.lvh.me`），或退回 `.localhost`
- 正式環境：`.yourapp.com`（由環境變數 `APP_DOMAIN` 提供）

## 本專案的實作
- 檔案：`lib/auth.ts`
- 邏輯：
  - 若有 `APP_DOMAIN` → 使用 `.${APP_DOMAIN}`（A 方案本地通常是 `lvh.me`；正式環境是 `yourapp.com`）
  - 沒有 `APP_DOMAIN` 且 `NODE_ENV === "development"` → 退回 `.localhost`
  - `NODE_ENV === "production"` 且有 `APP_DOMAIN` → 使用 `.${APP_DOMAIN}`
  - 若 production 未提供 `APP_DOMAIN` → 不覆寫 cookie domain（維持預設行為）

## 部署時需要設定的環境變數
- `NEXTAUTH_URL`: `https://yourapp.com`
- `NEXTAUTH_SECRET`: 你的 secret
- `APP_DOMAIN`: `yourapp.com`

