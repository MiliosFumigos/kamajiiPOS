import crypto from "crypto";

type EcpayCheckoutInput = {
  merchantTradeNo: string;
  merchantTradeDate: Date;
  totalAmount: number;
  tradeDesc: string;
  itemName: string;
  returnUrl: string;
  clientBackUrl: string;
  customField1?: string;
};

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

function encodeForEcpay(value: string): string {
  return encodeURIComponent(value)
    .toLowerCase()
    .replace(/%20/g, "+")
    .replace(/%2d/g, "-")
    .replace(/%5f/g, "_")
    .replace(/%2e/g, ".")
    .replace(/%21/g, "!")
    .replace(/%2a/g, "*")
    .replace(/%28/g, "(")
    .replace(/%29/g, ")");
}

function formatTradeDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd} ${hh}:${mi}:${ss}`;
}

export function getEcpayCheckoutAction(): string {
  return process.env.ECPAY_AIO_CHECKOUT_URL?.trim() ||
    "https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5"
    ;
}

export function createCheckMacValue(payload: Record<string, string | number>): string {
  const hashKey = getRequiredEnv("ECPAY_HASH_KEY");
  const hashIV = getRequiredEnv("ECPAY_HASH_IV");
  const sorted = Object.entries(payload)
    .filter(([k]) => k !== "CheckMacValue")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${String(v)}`)
    .join("&");
  const raw = `HashKey=${hashKey}&${sorted}&HashIV=${hashIV}`;
  const encoded = encodeForEcpay(raw);
  return crypto.createHash("sha256").update(encoded).digest("hex").toUpperCase();
}

export function buildEcpayCheckoutPayload(input: EcpayCheckoutInput) {
  const merchantId = getRequiredEnv("ECPAY_MERCHANT_ID");
  const payload: Record<string, string | number> = {
    MerchantID: merchantId,
    MerchantTradeNo: input.merchantTradeNo,
    MerchantTradeDate: formatTradeDate(input.merchantTradeDate),
    PaymentType: "aio",
    TotalAmount: Math.max(1, Math.round(input.totalAmount)),
    TradeDesc: input.tradeDesc,
    ItemName: input.itemName,
    ReturnURL: input.returnUrl,
    ChoosePayment: "Credit",
    EncryptType: 1,
    ClientBackURL: input.clientBackUrl,
  };
  if (input.customField1) {
    payload.CustomField1 = input.customField1;
  }
  payload.CheckMacValue = createCheckMacValue(payload);
  return payload;
}
