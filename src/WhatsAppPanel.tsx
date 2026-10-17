import { useCallback, useEffect, useState } from "react";
import type { WhatsAppStatus } from "./global";

const stateLabel: Record<WhatsAppStatus["state"], { text: string; className: string }> = {
  DISABLED: { text: "OFF", className: "bg-zinc-500/20 text-zinc-300" },
  STARTING: { text: "Starting...", className: "bg-amber-500/20 text-amber-300" },
  QR: { text: "Scan QR code", className: "bg-gold-500/20 text-gold-300" },
  CONNECTING: { text: "Connecting...", className: "bg-amber-500/20 text-amber-300" },
  READY: { text: "Connected", className: "bg-emerald-500/20 text-emerald-300" },
  DISCONNECTED: { text: "Disconnected", className: "bg-rose-500/20 text-rose-300" },
  ERROR: { text: "Error", className: "bg-rose-500/20 text-rose-300" },
};

const messageStatusClass = {
  PENDING: "text-amber-300",
  SENT: "text-emerald-300",
  FAILED: "text-rose-300",
};

const formatTime = (ms: number | null) => (ms ? new Date(ms).toLocaleString("en-GB", { hour12: true }) : "-");

export function WhatsAppPanel() {
  const bridge = window.desktopBridge;
  const [status, setStatus] = useState<WhatsAppStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!bridge?.whatsappStatus) {
      return;
    }
    try {
      setStatus(await bridge.whatsappStatus());
    } catch {
      // keep the last known status
    }
  }, [bridge]);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 2000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const run = async (action: (() => Promise<WhatsAppStatus>) | undefined) => {
    if (!action) {
      return;
    }
    setBusy(true);
    try {
      setStatus(await action());
    } catch {
      // status poll will show the real state
    } finally {
      setBusy(false);
    }
  };

  if (!bridge?.whatsappStatus) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-[#141414] p-4 space-y-2">
        <p className="text-sm font-medium">WhatsApp Auto Messages</p>
        <p className="text-xs text-zinc-400">Available only in the desktop (EXE) app.</p>
      </div>
    );
  }

  const badge = status ? stateLabel[status.state] : stateLabel.STARTING;

  return (
    <div className="rounded-2xl border border-zinc-800 bg-[#141414] p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">WhatsApp Auto Messages</p>
        <span className={`rounded-full px-2 py-1 text-xs ${badge.className}`}>{badge.text}</span>
      </div>

      <p className="text-xs text-zinc-400">
        When ON: the receipt image is sent to the customer when an order is saved, and a message is sent when the order status
        is changed to READY, and a thank-you message when it is changed to DELIVERED. Orders save normally even if WhatsApp or
        internet is down; messages wait in a queue and go later.
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={status?.enabled ? "btn-muted" : "btn-primary"}
          disabled={busy || !status}
          onClick={() => run(() => bridge.whatsappSetEnabled!(!status?.enabled))}
        >
          {status?.enabled ? "Turn OFF" : "Turn ON"}
        </button>
        {status?.enabled && (
          <button
            type="button"
            className="btn-muted"
            disabled={busy}
            onClick={() => {
              if (window.confirm("Unlink this PC from WhatsApp and show a new QR code?")) {
                run(bridge.whatsappRelink);
              }
            }}
          >
            {status.state === "READY" ? "Unlink / Change number" : "Reset connection"}
          </button>
        )}
      </div>

      {status?.enabled && !status.browserFound && (
        <p className="rounded-lg bg-rose-500/10 p-2 text-xs text-rose-300">
          The WhatsApp browser was not found. Install Google Chrome on this PC and restart the app (or rebuild the installer with npm install).
        </p>
      )}

      {status?.state === "QR" && (
        <div className="space-y-2">
          {status.qr ? (
            <img src={status.qr} alt="WhatsApp QR code" className="h-56 w-56 rounded-lg bg-white p-2" />
          ) : (
            <p className="text-xs text-zinc-400">Preparing QR code...</p>
          )}
          <p className="text-xs text-zinc-400">
            On the shop phone open WhatsApp Business, then Settings, Linked Devices, Link a Device, and scan this code.
          </p>
        </div>
      )}

      {status?.state === "READY" && (
        <p className="text-xs text-emerald-300">Connected{status.connectedAs ? ` as +${status.connectedAs}` : ""}. Messages are being sent automatically.</p>
      )}

      {status?.lastError && status.enabled && status.state !== "READY" && (
        <p className="rounded-lg bg-zinc-900 p-2 text-xs text-amber-300">{status.lastError}</p>
      )}

      {status && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-300">
          <span>Waiting: {status.pending}</span>
          <span>Sent: {status.sent}</span>
          <span className={status.failed > 0 ? "text-rose-300" : ""}>Failed: {status.failed}</span>
          {status.failed > 0 && (
            <button type="button" className="btn-muted !px-2 !py-1 text-xs" disabled={busy} onClick={() => run(bridge.whatsappRetryFailed)}>
              Retry failed
            </button>
          )}
        </div>
      )}

      {status && status.recent.length > 0 && (
        <div className="max-h-48 overflow-auto rounded-lg border border-zinc-800">
          <table className="w-full text-left text-xs">
            <thead className="text-zinc-400">
              <tr>
                <th className="px-2 py-1">Order</th>
                <th>Type</th>
                <th>Status</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {status.recent.map((row) => (
                <tr key={`${row.order_number}-${row.kind}`} className="border-t border-zinc-800" title={row.last_error || row.phone}>
                  <td className="px-2 py-1">{row.order_number}</td>
                  <td>{row.kind === "CONFIRM" ? "Receipt" : row.kind === "READY" ? "Ready" : "Thanks"}</td>
                  <td className={messageStatusClass[row.status]}>
                    {row.status}
                    {row.last_error ? ` - ${row.last_error}` : ""}
                  </td>
                  <td>{formatTime(row.sent_ms ?? row.created_ms)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {status && (
        <div className="space-y-1 border-t border-zinc-800 pt-3 text-xs text-zinc-400">
          <p>WhatsApp library version: {status.installedVersion || "unknown"} (locked, never updates by itself)</p>
          {status.updateAvailable && (
            <p className="rounded-lg bg-amber-500/10 p-2 text-amber-300">
              Newer library version {status.latestVersion} is available. You do not need to update while messages are going
              normally. Update only if messages stop working (see WHATSAPP_SETUP.md).
            </p>
          )}
          <button type="button" className="btn-muted !px-2 !py-1 text-xs" disabled={busy} onClick={() => run(bridge.whatsappCheckUpdate)}>
            Check for library update
          </button>
        </div>
      )}
    </div>
  );
}
