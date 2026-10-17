import { AppSnapshot } from "./types";

export interface WhatsAppMessageRow {
  order_number: string;
  kind: "CONFIRM" | "READY" | "DELIVERED";
  phone: string;
  status: "PENDING" | "SENT" | "FAILED";
  attempts: number;
  last_error: string;
  created_ms: number;
  sent_ms: number | null;
}

export interface WhatsAppStatus {
  enabled: boolean;
  state: "DISABLED" | "STARTING" | "QR" | "CONNECTING" | "READY" | "DISCONNECTED" | "ERROR";
  qr: string | null;
  connectedAs: string;
  lastError: string;
  pending: number;
  failed: number;
  sent: number;
  installedVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  browserFound: boolean;
  recent: WhatsAppMessageRow[];
}

export interface WhatsAppQueuePayload {
  orderId: string;
  orderNumber: string;
  kind: "CONFIRM" | "READY" | "DELIVERED";
  phone: string;
  caption: string;
  html?: string;
}

export interface WhatsAppQueueResult {
  ok: boolean;
  queued: boolean;
  reason?: string;
  message?: string;
}

interface DesktopBridge {
  loadSnapshot: () => Promise<AppSnapshot | null>;
  saveSnapshot: (snapshot: AppSnapshot) => Promise<{ ok: boolean; message: string }>;
  backupDatabase: () => Promise<{ ok: boolean; message: string }>;
  restoreDatabase: () => Promise<{ ok: boolean; message: string }>;
  printReceipt: (html: string) => Promise<{ ok: boolean; message: string }>;
  previewReceipt: (html: string) => Promise<{ ok: boolean; message: string }>;
  saveReceiptPdf: (html: string) => Promise<{ ok: boolean; message: string }>;
  getLogoDataUrl: (logoPath: string) => Promise<string | null>;
  getAppDataPath: () => Promise<string>;
  whatsappStatus?: () => Promise<WhatsAppStatus>;
  whatsappSetEnabled?: (enabled: boolean) => Promise<WhatsAppStatus>;
  whatsappRelink?: () => Promise<WhatsAppStatus>;
  whatsappRetryFailed?: () => Promise<WhatsAppStatus>;
  whatsappCheckUpdate?: () => Promise<WhatsAppStatus>;
  whatsappQueue?: (payload: WhatsAppQueuePayload) => Promise<WhatsAppQueueResult>;
}

declare global {
  interface Window {
    desktopBridge?: DesktopBridge;
  }
}

export {};