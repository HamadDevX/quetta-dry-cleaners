import { AppSnapshot, Order } from "./types";
import type { WhatsAppQueuePayload, WhatsAppQueueResult } from "./global";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LINE = "━━━━━━━━━━━━━━";

/** Google "write a review" link of the shop, used in the DELIVERED thank-you message. */
const GOOGLE_REVIEW_LINK = "https://g.page/r/CThd9wr9C8NSEAE/review";

const titleCase = (text: string) =>
  text
    .toLowerCase()
    .replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());

/** 2026-10-12 -> 12-Oct-2026 (anything else is shown as typed) */
const formatDate = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  if (!match) {
    return value || "-";
  }
  const month = MONTHS[Number(match[2]) - 1];
  return month ? `${match[3]}-${month}-${match[1]}` : value;
};

const rs = (value: number) => `Rs ${Math.round(Number.isFinite(value) ? value : 0).toLocaleString("en-PK")}`;

const header = (snapshot: AppSnapshot) => {
  const { business } = snapshot.settings;
  const tagline = (business.tagline ?? "")
    .split(/\s*[-–•]\s*/)
    .filter(Boolean)
    .map(titleCase)
    .join(" • ");
  return [`🧺 *${business.businessName}*`, tagline ? `_${tagline}_` : "", LINE].filter(Boolean);
};

const footerLines = (snapshot: AppSnapshot) => {
  const { business } = snapshot.settings;
  return [business.address ? `📍 ${business.address}` : "", business.phone ? `📞 ${business.phone}` : ""].filter(Boolean);
};

const balanceLine = (order: Order) =>
  order.remainingBalance > 0 ? `💰 *Balance Due:* ${rs(order.remainingBalance)}` : "✅ *Payment:* Complete";

/** Caption sent together with the receipt image when an order is confirmed. */
export const buildConfirmCaption = (order: Order, snapshot: AppSnapshot) => {
  const delivery = order.deliveryMode === "Home Delivery";
  return [
    ...header(snapshot),
    "",
    `Hello *${order.customerName.trim()}*,`,
    "",
    "Thank you for trusting us with your garments. Your order is confirmed and in good hands. ✨",
    "",
    `🧾 *Order No:* ${order.orderNumber}`,
    `📅 *Expected Ready:* ${formatDate(order.expectedDate)}`,
    balanceLine(order),
    "",
    delivery
      ? "Your receipt is attached above. We'll deliver your order to your address. 🚚"
      : "Your receipt is attached above. Please keep it for pickup.",
    "",
    LINE,
    "We'll message you as soon as your order is ready. 👔",
    ...footerLines(snapshot),
  ].join("\n");
};

/** Message sent when the order status is changed to READY. */
export const buildReadyCaption = (order: Order, snapshot: AppSnapshot) => {
  const delivery = order.deliveryMode === "Home Delivery";
  return [
    ...header(snapshot),
    "",
    `Hello *${order.customerName.trim()}*,`,
    "",
    delivery ? "Your order is *ready and on its way to you soon!* 🚚✅" : "Your order is *ready for pickup!* 👔✅",
    "",
    `🧾 *Order No:* ${order.orderNumber}`,
    balanceLine(order),
    "",
    delivery ? "Please keep your receipt handy." : "Please bring your receipt when you visit.",
    "",
    LINE,
    `Thank you for choosing ${titleCase(snapshot.settings.business.businessName)}. We look forward to serving you again! 💙`,
    ...footerLines(snapshot),
  ].join("\n");
};

/** Thank-you message sent when the order status is changed to DELIVERED. */
export const buildDeliveredCaption = (order: Order, snapshot: AppSnapshot) => {
  const delivery = order.deliveryMode === "Home Delivery";
  const { business } = snapshot.settings;
  return [
    ...header(snapshot),
    "",
    `Hello *${order.customerName.trim()}*,`,
    "",
    delivery ? "Your order has been delivered! 🚚" : "Thank you for collecting your order! 🙏",
    "We hope your garments look their best. ✨",
    "",
    `🧾 *Order No:* ${order.orderNumber}`,
    "",
    "⭐ Enjoyed our service? Please rate us on Google:",
    GOOGLE_REVIEW_LINK,
    "",
    "Looking forward to serving you again. 💙",
    business.phone ? `📞 ${business.phone}` : "",
  ]
    .filter((line, index, all) => line !== "" || all[index - 1] !== "")
    .join("\n")
    .trim();
};

/** Hands a message to the desktop app's background WhatsApp queue. Never throws. */
export const queueWhatsApp = async (payload: WhatsAppQueuePayload): Promise<WhatsAppQueueResult> => {
  if (!window.desktopBridge?.whatsappQueue) {
    return { ok: true, queued: false, reason: "unavailable" };
  }
  try {
    return await window.desktopBridge.whatsappQueue(payload);
  } catch {
    return { ok: false, queued: false, reason: "error" };
  }
};
