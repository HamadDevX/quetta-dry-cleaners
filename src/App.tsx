import { ComponentType, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  BadgeCent,
  Banknote,
  Boxes,
  ChartNoAxesCombined,
  ClipboardList,
  Cog,
  DollarSign,
  Home,
  NotebookTabs,
  PackageCheck,
  RefreshCcw,
  Save,
  Search,
  ShoppingBasket,
  Truck,
  User,
  Users,
  WalletCards,
} from "lucide-react";
import { defaultSnapshot } from "./defaultData";
import { loadSnapshot, saveSnapshot } from "./storage";
import { WhatsAppPanel } from "./WhatsAppPanel";
import { buildConfirmCaption, buildDeliveredCaption, buildReadyCaption, queueWhatsApp } from "./whatsappMessages";
import { AppSnapshot, Customer, DeliveryMode, Expense, Order, OrderItem, OrderStatus, PaymentMethod, Service } from "./types";

type Screen = "Dashboard" | "Orders" | "New Order" | "Customers" | "Services" | "Payments" | "Expenses" | "Reports" | "Settings";

const menus: { key: Screen; icon: ComponentType<{ className?: string }> }[] = [
  { key: "Dashboard", icon: Home },
  { key: "New Order", icon: ShoppingBasket },
  { key: "Orders", icon: ClipboardList },
  { key: "Customers", icon: Users },
  { key: "Services", icon: Boxes },
  { key: "Payments", icon: WalletCards },
  { key: "Expenses", icon: DollarSign },
  { key: "Reports", icon: ChartNoAxesCombined },
  { key: "Settings", icon: Cog },
];

const today = () => {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};
const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const safe = (value: number) => Number.isFinite(value) ? value : 0;

const statusColor: Record<OrderStatus, string> = {
  RECEIVED: "bg-zinc-500/20 text-zinc-300",
  PROCESSING: "bg-orange-500/20 text-orange-300",
  READY: "bg-gold-500/20 text-gold-300",
  DELIVERED: "bg-emerald-500/20 text-emerald-300",
  CANCELLED: "bg-rose-500/20 text-rose-300",
};

const paymentColor = {
  PAID: "bg-emerald-500/20 text-emerald-300",
  PARTIAL: "bg-amber-500/20 text-amber-300",
  UNPAID: "bg-rose-500/20 text-rose-300",
};

const formatCurrency = (value: number, currency: string) => `${currency} ${safe(value).toLocaleString("en-PK", { maximumFractionDigits: 0 })}`;

const createReceiptHtml = (order: Order, snapshot: AppSnapshot, logoSrc: string) => {
  const { business, receipt } = snapshot.settings;
  const categoryByServiceId = new Map(snapshot.services.map((service) => [service.id, service.category]));
  const rows = order.items
    .map(
      (item) => {
        const category = categoryByServiceId.get(item.serviceId) ?? "-";
        return `<tr><td>${category}</td><td>${item.serviceName}</td><td style="text-align:center">${item.quantity}</td><td style="text-align:right">${item.rate}</td><td style="text-align:right">${item.amount}</td></tr>`;
      },
    )
    .join("");

  return `
  <html>
    <head>
      <style>
        body{font-family:Arial,sans-serif;padding:18px;color:#111}
        h1{margin:4px 0 0;font-size:22px}
        h2{margin:0;font-size:13px;color:#555}
        .meta{margin:8px 0 12px;font-size:13px}
        table{width:100%;border-collapse:collapse;margin:12px 0;font-size:12px}
        th,td{border:1px solid #ddd;padding:6px}
        .summary{margin-top:14px;font-size:13px}
        .line{display:flex;justify-content:space-between;margin:4px 0}
      </style>
    </head>
    <body>
      <div style="text-align:center">
        <img src="${logoSrc}" width="74" alt="logo"/>
        <h1>${business.businessName}</h1>
        <h2>${business.tagline}</h2>
      </div>
      <div class="meta">
        <div>Phone: ${business.phone}</div>
        <div>Address: ${business.address}</div>
        <div>Order Number: ${order.orderNumber} | Order Date: ${order.orderDate}</div>
        <div>Customer: ${order.customerName} | Phone: ${order.customerPhone}</div>
        <div>Expected Delivery: ${order.expectedDate} | Delivery: ${order.deliveryMode}</div>
        <div>Order Status: ${order.status}</div>
      </div>
      <table>
        <thead><tr><th>Category</th><th>Service</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="summary">
        <div class="line"><strong>Subtotal</strong><span>${order.subtotal}</span></div>
        <div class="line"><strong>Discount</strong><span>${order.discount}</span></div>
        <div class="line"><strong>Grand Total</strong><span>${order.grandTotal}</span></div>
        <div class="line"><strong>Paid</strong><span>${order.paidAmount}</span></div>
        <div class="line"><strong>Remaining</strong><span>${order.remainingBalance}</span></div>
        <div class="line"><strong>Payment Status</strong><span>${order.paymentStatus}</span></div>
      </div>
      <p style="text-align:center;margin-top:20px">${receipt.footer}</p>
    </body>
  </html>`;
};

const makeReceiptHtml = async (order: Order, snapshot: AppSnapshot) => {
  const receiptLogoPath = snapshot.settings.business.receiptLogoPath || snapshot.settings.business.logoPath;
  let logoSrc = receiptLogoPath;
  if (window.desktopBridge) {
    const embeddedLogo = await window.desktopBridge.getLogoDataUrl(receiptLogoPath);
    if (embeddedLogo) {
      logoSrc = embeddedLogo;
    }
  }
  return createReceiptHtml(order, snapshot, logoSrc);
};

// Hands the WhatsApp message for an order to the background queue. Never blocks or breaks saving an order.
const notifyWhatsApp = async (kind: "CONFIRM" | "READY" | "DELIVERED", order: Order, snapshot: AppSnapshot) => {
  if (!window.desktopBridge?.whatsappQueue) {
    return;
  }
  try {
    const html = kind === "CONFIRM" ? await makeReceiptHtml(order, snapshot) : undefined;
    const caption =
      kind === "CONFIRM"
        ? buildConfirmCaption(order, snapshot)
        : kind === "READY"
          ? buildReadyCaption(order, snapshot)
          : buildDeliveredCaption(order, snapshot);
    const result = await queueWhatsApp({ orderId: order.id, orderNumber: order.orderNumber, kind, phone: order.customerPhone, caption, html });
    if (result.reason === "invalid_phone") {
      window.alert(`WhatsApp message for ${order.orderNumber} was NOT sent: "${order.customerPhone}" is not a valid mobile number (example: 0300 1234567).`);
    }
  } catch {
    // WhatsApp problems must never affect the shop software.
  }
};

export default function App() {
  const [snapshot, setSnapshot] = useState<AppSnapshot>(defaultSnapshot);
  const [screen, setScreen] = useState<Screen>("Dashboard");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadSnapshot().then((data) => {
      setSnapshot(data);
      setLoading(false);
    });
  }, []);

  const persist = async (next: AppSnapshot) => {
    setSnapshot(next);
    const result = await saveSnapshot(next);
    setMessage(result.message);
    setTimeout(() => setMessage(""), 2200);
  };

  const todayOrders = useMemo(() => snapshot.orders.filter((o) => o.orderDate === today()), [snapshot.orders]);
  const todaySales = useMemo(() => todayOrders.reduce((sum, o) => sum + o.grandTotal, 0), [todayOrders]);
  const todayExpenses = useMemo(() => snapshot.expenses.filter((e) => e.date === today()).reduce((sum, e) => sum + e.amount, 0), [snapshot.expenses]);
  const outstanding = useMemo(() => snapshot.orders.reduce((sum, o) => sum + o.remainingBalance, 0), [snapshot.orders]);

  if (loading) {
    return <div className="grid min-h-screen place-items-center bg-[#0a0a0a] text-zinc-200">Loading Quetta Dry Cleaners...</div>;
  }

  const statusData = ["RECEIVED", "PROCESSING", "READY", "DELIVERED", "CANCELLED"].map((status) => ({
    name: status,
    value: snapshot.orders.filter((order) => order.status === status).length,
  }));
  const statusPalette = ["#a1a1aa", "#fb923c", "#d4af37", "#10b981", "#ef4444"];

  const monthlySales = Array.from({ length: 7 }).map((_, idx) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - idx));
    const key = date.toISOString().slice(0, 10);
    return {
      day: key.slice(5),
      amount: snapshot.orders.filter((o) => o.orderDate === key).reduce((sum, o) => sum + o.grandTotal, 0),
    };
  });

  const saveOrder = (order: Order) => {
    const customerExists = snapshot.customers.some((entry) => entry.id === order.customerId || entry.phone === order.customerPhone);
    const customer = customerExists
      ? snapshot.customers
      : [
          {
            id: order.customerId,
            name: order.customerName,
            phone: order.customerPhone,
            address: order.customerAddress,
            notes: order.customerNotes,
            createdAt: new Date().toISOString(),
          },
          ...snapshot.customers,
        ];

    const next = {
      ...snapshot,
      customers: customer,
      orders: [order, ...snapshot.orders],
      payments: [
        ...snapshot.payments,
        ...(order.paidAmount > 0
          ? [
              {
                id: uid("pay"),
                orderId: order.id,
                orderNumber: order.orderNumber,
                customerName: order.customerName,
                amount: order.paidAmount,
                method: order.paymentMethod,
                date: order.orderDate,
                notes: "Initial payment",
              },
            ]
          : []),
      ],
    };
    persist(next);
    void notifyWhatsApp("CONFIRM", order, next);
    setScreen("Orders");
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-200">
      <div className="flex min-h-screen">
        <aside className="w-72 shrink-0 border-r border-zinc-800 bg-[#0e0e0e] p-4">
          <div className="mb-6 rounded-xl border border-zinc-800 bg-[#161616] p-4">
            <img src={snapshot.settings.business.logoPath} alt="Quetta Dry Cleaners" className="mb-2 h-14 w-14 rounded-lg bg-zinc-900 object-contain p-1" />
            <p className="text-sm text-gold-300">{snapshot.settings.business.businessName}</p>
            <p className="text-xs text-zinc-400">{snapshot.settings.business.tagline}</p>
          </div>
          <nav className="space-y-1">
            {menus.map((menu) => {
              const Icon = menu.icon;
              const active = screen === menu.key;
              return (
                <button
                  key={menu.key}
                  type="button"
                  onClick={() => setScreen(menu.key)}
                  className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm transition ${
                    active ? "bg-gold-500/20 text-gold-200" : "text-zinc-300 hover:bg-zinc-800/60"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {menu.key}
                </button>
              );
            })}
          </nav>
          <div className="mt-6 rounded-xl border border-zinc-800 p-3 text-xs text-zinc-400">
            Data Path: {window.desktopBridge ? "Windows AppData (SQLite)" : "Browser local storage"}
          </div>
        </aside>

        <main className="flex-1 overflow-hidden">
          <header className="flex items-center justify-between border-b border-zinc-800 bg-[#0c0c0c] px-6 py-3">
            <div>
              <p className="text-lg font-semibold text-zinc-100">{screen}</p>
              <p className="text-xs text-zinc-400">{snapshot.settings.business.phone}</p>
            </div>
            <div className="text-sm text-gold-300">{message}</div>
          </header>

          <section className="h-[calc(100vh-65px)] overflow-auto p-6">
            {screen === "Dashboard" && (
              <div className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    { label: "Today's Orders", value: todayOrders.length, icon: NotebookTabs },
                    { label: "Today's Sales", value: formatCurrency(todaySales, snapshot.settings.app.currency), icon: Banknote },
                    { label: "Pending Orders", value: snapshot.orders.filter((o) => o.status === "RECEIVED").length, icon: ClipboardList },
                    { label: "Processing Orders", value: snapshot.orders.filter((o) => o.status === "PROCESSING").length, icon: RefreshCcw },
                    { label: "Ready Orders", value: snapshot.orders.filter((o) => o.status === "READY").length, icon: PackageCheck },
                    { label: "Delivered Orders", value: snapshot.orders.filter((o) => o.status === "DELIVERED").length, icon: Truck },
                    { label: "Outstanding", value: formatCurrency(outstanding, snapshot.settings.app.currency), icon: BadgeCent },
                    { label: "Today's Expenses", value: formatCurrency(todayExpenses, snapshot.settings.app.currency), icon: DollarSign },
                  ].map((card) => {
                    const Icon = card.icon;
                    return (
                      <div key={card.label} className="rounded-2xl border border-zinc-800 bg-[#141414] p-4">
                        <div className="mb-3 flex items-center justify-between text-zinc-400">
                          <span className="text-xs">{card.label}</span>
                          <Icon className="h-4 w-4" />
                        </div>
                        <p className="text-xl font-semibold text-zinc-100">{card.value}</p>
                      </div>
                    );
                  })}
                </div>

                <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
                  <div className="rounded-2xl border border-zinc-800 bg-[#141414] p-4">
                    <p className="mb-4 text-sm font-medium">Sales Overview (Last 7 Days)</p>
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={monthlySales}>
                          <CartesianGrid stroke="#2a2a2a" vertical={false} />
                          <XAxis dataKey="day" stroke="#71717a" />
                          <YAxis stroke="#71717a" />
                          <Tooltip
                            cursor={{ fill: "rgba(212,175,55,0.08)" }}
                            contentStyle={{ background: "#141414", border: "1px solid #5c4a1c", borderRadius: 8, color: "#f4f4f5" }}
                            labelStyle={{ color: "#a1a1aa" }}
                            itemStyle={{ color: "#e8c95f" }}
                          />
                          <Bar dataKey="amount" fill="#d4af37" radius={[6, 6, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-zinc-800 bg-[#141414] p-4">
                    <p className="mb-4 text-sm font-medium">Order Status Overview</p>
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={statusData} dataKey="value" innerRadius={45} outerRadius={75} paddingAngle={3}>
                            {statusData.map((_d, idx) => (
                              <Cell key={idx} fill={statusPalette[idx % statusPalette.length]} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{ background: "#141414", border: "1px solid #5c4a1c", borderRadius: 8, color: "#f4f4f5" }}
                            itemStyle={{ color: "#e8c95f" }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                <div className="grid gap-6 lg:grid-cols-2">
                  <div className="rounded-2xl border border-zinc-800 bg-[#141414] p-4">
                    <p className="mb-3 text-sm font-medium">Recent Orders</p>
                    <div className="space-y-2">
                      {snapshot.orders.slice(0, 6).map((order) => (
                        <div key={order.id} className="flex items-center justify-between rounded-xl border border-zinc-800 px-3 py-2 text-sm">
                          <div>
                            <p>{order.orderNumber}</p>
                            <p className="text-xs text-zinc-400">{order.customerName}</p>
                          </div>
                          <span className={`rounded-full px-2 py-0.5 text-xs ${statusColor[order.status]}`}>{order.status}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-zinc-800 bg-[#141414] p-4">
                    <p className="mb-3 text-sm font-medium">Quick Actions</p>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      {[
                        { label: "New Order", go: "New Order" as Screen },
                        { label: "Add Customer", go: "Customers" as Screen },
                        { label: "Payment", go: "Payments" as Screen },
                        { label: "Expense", go: "Expenses" as Screen },
                        { label: "View Orders", go: "Orders" as Screen },
                      ].map((action) => (
                        <button
                          key={action.label}
                          type="button"
                          onClick={() => setScreen(action.go)}
                          className="rounded-xl border border-gold-500/40 bg-gold-500/10 px-3 py-2 text-gold-200 hover:bg-gold-500/20"
                        >
                          {action.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {screen === "New Order" && <NewOrderView snapshot={snapshot} onSave={saveOrder} />}
            {screen === "Orders" && <OrdersView snapshot={snapshot} setSnapshot={persist} />}
            {screen === "Customers" && <CustomersView snapshot={snapshot} setSnapshot={persist} />}
            {screen === "Services" && <ServicesView snapshot={snapshot} setSnapshot={persist} />}
            {screen === "Payments" && <PaymentsView snapshot={snapshot} setSnapshot={persist} />}
            {screen === "Expenses" && <ExpensesView snapshot={snapshot} setSnapshot={persist} />}
            {screen === "Reports" && <ReportsView snapshot={snapshot} />}
            {screen === "Settings" && <SettingsView snapshot={snapshot} setSnapshot={persist} />}
          </section>
        </main>
      </div>
    </div>
  );
}

function NewOrderView({ snapshot, onSave }: { snapshot: AppSnapshot; onSave: (order: Order) => void }) {
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [orderDate, setOrderDate] = useState(today());
  const [expectedDate, setExpectedDate] = useState(today());
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>("Customer Pickup");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("Cash");
  const [orderNotes, setOrderNotes] = useState("");
  const [discount, setDiscount] = useState(0);
  const [paidAmount, setPaidAmount] = useState(0);
  const [serviceId, setServiceId] = useState(snapshot.services.find((s) => s.isActive)?.id ?? "");
  const [qty, setQty] = useState(1);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [error, setError] = useState("");

  const selectedService = snapshot.services.find((service) => service.id === serviceId);
  const rate = selectedService?.rate ?? 0;
  const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
  const grandTotal = Math.max(0, subtotal - discount);
  const remaining = Math.max(0, grandTotal - paidAmount);

  const selectCustomer = (customerId: string) => {
    setSelectedCustomerId(customerId);
    const customer = snapshot.customers.find((entry) => entry.id === customerId);
    if (!customer) {
      return;
    }
    setCustomerName(customer.name);
    setPhone(customer.phone);
    setAddress(customer.address);
    setNotes(customer.notes);
    if (deliveryMode === "Home Delivery") {
      setDeliveryAddress(customer.address);
    }
  };

  const addItem = () => {
    if (!selectedService || qty <= 0) {
      setError("Choose a service and valid quantity");
      return;
    }
    const amount = safe(qty * selectedService.rate);
    setItems((prev) => [...prev, { id: uid("item"), serviceId: selectedService.id, serviceName: selectedService.name, quantity: qty, rate: selectedService.rate, amount }]);
    setQty(1);
    setError("");
  };

  const save = () => {
    if (!customerName.trim() || !phone.trim()) {
      setError("Customer name and phone are required");
      return;
    }
    if (items.length === 0) {
      setError("Add at least one service item");
      return;
    }

    const orderId = uid("ord");
    const customerId = selectedCustomerId || uid("cus");
    const orderNumber = `QDC-${Date.now().toString().slice(-6)}`;
    const paymentStatus = remaining === 0 ? "PAID" : paidAmount > 0 ? "PARTIAL" : "UNPAID";

    onSave({
      id: orderId,
      orderNumber,
      customerId,
      customerName,
      customerPhone: phone,
      customerAddress: address,
      customerNotes: notes,
      orderDate,
      expectedDate,
      deliveryMode,
      deliveryAddress: deliveryMode === "Home Delivery" ? deliveryAddress || address : "",
      deliveryDate: "",
      deliveryStatus: deliveryMode === "Home Delivery" ? "PENDING" : "",
      deliveryNotes: "",
      paymentMethod,
      status: "RECEIVED",
      orderNotes,
      items,
      subtotal,
      discount,
      grandTotal,
      paidAmount,
      remainingBalance: remaining,
      paymentStatus,
      createdAt: new Date().toISOString(),
    });
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[2fr_1fr]">
      <div className="space-y-5">
        <div className="rounded-2xl border border-zinc-800 bg-[#141414] p-4">
          <p className="mb-3 text-sm font-medium">Customer</p>
          <div className="grid gap-3 md:grid-cols-2">
            <select className="field" value={selectedCustomerId} onChange={(e) => selectCustomer(e.target.value)}>
              <option value="">Search existing customer</option>
              {snapshot.customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name} - {customer.phone}
                </option>
              ))}
            </select>
            <input className="field" placeholder="Customer name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
            <input className="field" placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <input className="field" placeholder="Address" value={address} onChange={(e) => setAddress(e.target.value)} />
            <input className="field md:col-span-2" placeholder="Customer notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-[#141414] p-4">
          <p className="mb-3 text-sm font-medium">Order Information</p>
          <div className="grid gap-3 md:grid-cols-2">
            <input className="field" value={`Auto on save`} disabled />
            <input className="field" type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
            <input className="field" type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
            <select className="field" value={deliveryMode} onChange={(e) => setDeliveryMode(e.target.value as DeliveryMode)}>
              <option>Customer Pickup</option>
              <option>Home Delivery</option>
            </select>
            <select className="field" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}>
              <option>Cash</option>
              <option>Card</option>
              <option>Other</option>
            </select>
            {deliveryMode === "Home Delivery" && (
              <input className="field md:col-span-2" placeholder="Delivery address" value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} />
            )}
            <input className="field md:col-span-2" placeholder="Order notes" value={orderNotes} onChange={(e) => setOrderNotes(e.target.value)} />
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-[#141414] p-4">
          <p className="mb-3 text-sm font-medium">Service Selection</p>
          <div className="grid gap-3 md:grid-cols-4">
            <select className="field md:col-span-2" value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
              {snapshot.services
                .filter((service) => service.isActive)
                .map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.category} - {service.name}
                  </option>
                ))}
            </select>
            <input className="field" type="number" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value))} />
            <input className="field" value={rate} disabled />
          </div>
          <div className="mt-3 flex gap-2">
            <button type="button" className="btn-primary" onClick={addItem}>
              + Add Item
            </button>
            <button type="button" className="btn-muted" onClick={() => setItems([])}>
              Clear Order
            </button>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-zinc-400">
                <tr>
                  <th className="pb-2 text-left">Service</th>
                  <th className="pb-2 text-left">Quantity</th>
                  <th className="pb-2 text-left">Rate</th>
                  <th className="pb-2 text-left">Amount</th>
                  <th className="pb-2 text-left">Remove</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-t border-zinc-800">
                    <td className="py-2">{item.serviceName}</td>
                    <td>{item.quantity}</td>
                    <td>{item.rate}</td>
                    <td>{item.amount}</td>
                    <td>
                      <button type="button" className="text-rose-300" onClick={() => setItems((prev) => prev.filter((entry) => entry.id !== item.id))}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="sticky top-0 h-fit rounded-2xl border border-zinc-800 bg-[#141414] p-4">
        <p className="mb-3 text-sm font-medium">Payment Summary</p>
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span>Subtotal</span>
            <span>{subtotal}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Discount</span>
            <input className="field h-8 w-24 text-right" type="number" min={0} value={discount} onChange={(e) => setDiscount(Math.max(0, Number(e.target.value)))} />
          </div>
          <div className="flex items-center justify-between">
            <span>Grand Total</span>
            <span>{grandTotal}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Paid Amount</span>
            <input className="field h-8 w-24 text-right" type="number" min={0} value={paidAmount} onChange={(e) => setPaidAmount(Math.max(0, Number(e.target.value)))} />
          </div>
          <div className="flex items-center justify-between text-gold-300">
            <span>Remaining</span>
            <span>{remaining}</span>
          </div>
        </div>
        {error && <p className="mt-3 text-xs text-rose-300">{error}</p>}
        <button type="button" className="btn-primary mt-4 w-full" onClick={save}>
          Confirm / Save Order
        </button>
      </div>
    </div>
  );
}

function OrdersView({ snapshot, setSnapshot }: { snapshot: AppSnapshot; setSnapshot: (next: AppSnapshot) => void | Promise<void> }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [paymentFilter, setPaymentFilter] = useState("ALL");
  const [selectedId, setSelectedId] = useState("");

  const rows = snapshot.orders.filter((order) => {
    const matchQuery =
      order.orderNumber.toLowerCase().includes(query.toLowerCase()) ||
      order.customerName.toLowerCase().includes(query.toLowerCase()) ||
      order.customerPhone.includes(query);
    const matchStatus = statusFilter === "ALL" || order.status === statusFilter;
    const matchPayment = paymentFilter === "ALL" || order.paymentStatus === paymentFilter;
    return matchQuery && matchStatus && matchPayment;
  });

  const selected = snapshot.orders.find((order) => order.id === selectedId) ?? null;

  const buildReceiptHtml = async (order: Order) => {
    const receiptLogoPath = snapshot.settings.business.receiptLogoPath || snapshot.settings.business.logoPath;
    let logoSrc = receiptLogoPath;
    if (window.desktopBridge) {
      const embeddedLogo = await window.desktopBridge.getLogoDataUrl(receiptLogoPath);
      if (embeddedLogo) {
        logoSrc = embeddedLogo;
      }
    }
    return createReceiptHtml(order, snapshot, logoSrc);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-4">
        <label className="field flex items-center gap-2"><Search className="h-4 w-4" /><input className="grow bg-transparent outline-none" placeholder="Order ID / customer / phone" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
        <select className="field" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="ALL">All status</option>
          <option>RECEIVED</option>
          <option>PROCESSING</option>
          <option>READY</option>
          <option>DELIVERED</option>
          <option>CANCELLED</option>
        </select>
        <select className="field" value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)}>
          <option value="ALL">All payments</option>
          <option>PAID</option>
          <option>PARTIAL</option>
          <option>UNPAID</option>
        </select>
      </div>
      <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <div className="overflow-auto rounded-2xl border border-zinc-800 bg-[#141414]">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900/50 text-zinc-400">
              <tr>
                {[
                  "Order ID",
                  "Customer",
                  "Phone",
                  "Order Date",
                  "Expected Date",
                  "Total",
                  "Paid",
                  "Remaining",
                  "Delivery",
                  "Payment",
                  "Status",
                ].map((h) => (
                  <th key={h} className="px-3 py-2 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((order) => (
                <tr
                  key={order.id}
                  onDoubleClick={() => setSelectedId(order.id)}
                  className="cursor-pointer border-t border-zinc-800 hover:bg-zinc-800/40"
                >
                  <td className="px-3 py-2">{order.orderNumber}</td>
                  <td>{order.customerName}</td>
                  <td>{order.customerPhone}</td>
                  <td>{order.orderDate}</td>
                  <td>{order.expectedDate}</td>
                  <td>{order.grandTotal}</td>
                  <td>{order.paidAmount}</td>
                  <td>{order.remainingBalance}</td>
                  <td>{order.deliveryMode}</td>
                  <td><span className={`rounded-full px-2 py-0.5 text-xs ${paymentColor[order.paymentStatus]}`}>{order.paymentStatus}</span></td>
                  <td><span className={`rounded-full px-2 py-0.5 text-xs ${statusColor[order.status]}`}>{order.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-[#141414] p-4 text-sm">
          {!selected && <p className="text-zinc-400">Double-click an order to view details</p>}
          {selected && (
            <div className="space-y-3">
              <p className="text-base font-medium">{selected.orderNumber}</p>
              <p>{selected.customerName}</p>
              <p>{selected.customerPhone}</p>
              <p>Status: <span className={`rounded-full px-2 py-1 text-xs ${statusColor[selected.status]}`}>{selected.status}</span></p>
              <div className="flex gap-2">
                <select
                  className="field"
                  value={selected.status}
                  onChange={(e) => {
                    const newStatus = e.target.value as OrderStatus;
                    const next = {
                      ...snapshot,
                      orders: snapshot.orders.map((order) => (order.id === selected.id ? { ...order, status: newStatus } : order)),
                    };
                    setSnapshot(next);
                    if (newStatus === "READY" && selected.status !== "READY") {
                      void notifyWhatsApp("READY", { ...selected, status: newStatus }, next);
                    }
                    if (newStatus === "DELIVERED" && selected.status !== "DELIVERED") {
                      void notifyWhatsApp("DELIVERED", { ...selected, status: newStatus }, next);
                    }
                  }}
                >
                  <option>RECEIVED</option>
                  <option>PROCESSING</option>
                  <option>READY</option>
                  <option>DELIVERED</option>
                  <option>CANCELLED</option>
                </select>
                <button
                  type="button"
                  className="btn-muted"
                  onClick={async () => {
                    const html = await buildReceiptHtml(selected);
                    if (window.desktopBridge) {
                      await window.desktopBridge.previewReceipt(html);
                    } else {
                      const tab = window.open();
                      if (tab) {
                        tab.document.write(html);
                        tab.document.close();
                      }
                    }
                  }}
                >
                  Print Preview
                </button>
                <button
                  type="button"
                  className="btn-muted"
                  onClick={async () => {
                    const html = await buildReceiptHtml(selected);
                    if (window.desktopBridge) {
                      await window.desktopBridge.printReceipt(html);
                    } else {
                      const tab = window.open();
                      if (tab) {
                        tab.document.write(html);
                        tab.document.close();
                        tab.print();
                      }
                    }
                  }}
                >
                  Print Receipt
                </button>
                <button
                  type="button"
                  className="btn-muted"
                  onClick={async () => {
                    const html = await buildReceiptHtml(selected);
                    if (window.desktopBridge?.saveReceiptPdf) {
                      const result = await window.desktopBridge.saveReceiptPdf(html);
                      if (!result.ok) {
                        window.alert(result.message);
                      }
                    } else {
                      window.alert("Save PDF is available in desktop EXE mode.");
                    }
                  }}
                >
                  Save PDF
                </button>
              </div>
              <button
                type="button"
                className="w-full rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-rose-300"
                onClick={() => {
                  if (!window.confirm("Delete this order?")) {
                    return;
                  }
                  const next = {
                    ...snapshot,
                    orders: snapshot.orders.filter((order) => order.id !== selected.id),
                  };
                  setSnapshot(next);
                  setSelectedId("");
                }}
              >
                Cancel / Delete
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CustomersView({ snapshot, setSnapshot }: { snapshot: AppSnapshot; setSnapshot: (next: AppSnapshot) => void | Promise<void> }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");

  const safeCustomers = Array.isArray(snapshot.customers) ? snapshot.customers : [];
  const safeOrders = Array.isArray(snapshot.orders) ? snapshot.orders : [];

  const customers = safeCustomers.filter((customer) => {
    const customerName = typeof customer.name === "string" ? customer.name : "";
    const customerPhone = typeof customer.phone === "string" ? customer.phone : "";
    const q = search.toLowerCase();
    return customerName.toLowerCase().includes(q) || customerPhone.includes(search);
  });

  const addCustomer = () => {
    if (!name.trim() || !phone.trim()) {
      return;
    }
    const customer: Customer = { id: uid("cus"), name, phone, address, notes, createdAt: new Date().toISOString() };
    setSnapshot({ ...snapshot, customers: [customer, ...snapshot.customers] });
    setName("");
    setPhone("");
    setAddress("");
    setNotes("");
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_2fr]">
      <div className="rounded-2xl border border-zinc-800 bg-[#141414] p-4">
        <p className="mb-3 text-sm font-medium">Add Customer</p>
        <div className="space-y-2">
          <input className="field" placeholder="Customer Name" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="field" placeholder="Phone Number" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <input className="field" placeholder="Address" value={address} onChange={(e) => setAddress(e.target.value)} />
          <input className="field" placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <button type="button" className="btn-primary w-full" onClick={addCustomer}>
            Add Customer
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-[#141414] p-4">
        <div className="mb-3 flex items-center gap-2"><User className="h-4 w-4" /><input className="field" placeholder="Search name or phone" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-zinc-400">
              <tr>
                <th className="pb-2 text-left">Name</th>
                <th className="pb-2 text-left">Phone</th>
                <th className="pb-2 text-left">Address</th>
                <th className="pb-2 text-left">Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((customer) => {
                const customerOrders = safeOrders.filter((order) => order.customerId === customer.id || order.customerPhone === customer.phone);
                const outstanding = customerOrders.reduce((sum, order) => sum + order.remainingBalance, 0);
                return (
                  <tr key={customer.id} className="border-t border-zinc-800">
                    <td className="py-2">{customer.name || "-"}</td>
                    <td>{customer.phone || "-"}</td>
                    <td>{customer.address || "-"}</td>
                    <td>{outstanding}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ServicesView({ snapshot, setSnapshot }: { snapshot: AppSnapshot; setSnapshot: (next: AppSnapshot) => void | Promise<void> }) {
  const [name, setName] = useState("");
  const [rate, setRate] = useState(0);
  const [unit, setUnit] = useState("piece");
  const [category, setCategory] = useState<Service["category"]>("DRY CLEANING");

  const addService = () => {
    if (!name.trim() || rate <= 0) {
      return;
    }
    const service: Service = { id: uid("svc"), name, rate, unit, category, isActive: true };
    setSnapshot({ ...snapshot, services: [...snapshot.services, service] });
    setName("");
    setRate(0);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-5">
        <input className="field" placeholder="Service name" value={name} onChange={(e) => setName(e.target.value)} />
        <select className="field" value={category} onChange={(e) => setCategory(e.target.value as Service["category"])}><option>DRY CLEANING</option><option>PRESSING / IRONING</option></select>
        <input className="field" placeholder="Unit" value={unit} onChange={(e) => setUnit(e.target.value)} />
        <input className="field" type="number" min={1} value={rate} onChange={(e) => setRate(Number(e.target.value))} />
        <button type="button" className="btn-primary" onClick={addService}>+ Add Service</button>
      </div>
      <div className="overflow-auto rounded-2xl border border-zinc-800 bg-[#141414]">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/50 text-zinc-400">
            <tr><th className="px-3 py-2 text-left">Category</th><th className="px-3 py-2 text-left">Service</th><th className="px-3 py-2 text-left">Unit</th><th className="px-3 py-2 text-left">Rate</th><th className="px-3 py-2 text-left">Active</th><th className="px-3 py-2 text-left">Delete</th></tr>
          </thead>
          <tbody>
            {snapshot.services.map((service) => (
              <tr key={service.id} className="border-t border-zinc-800">
                <td className="px-3 py-2">{service.category}</td>
                <td>{service.name}</td>
                <td>{service.unit}</td>
                <td>
                  <input
                    className="field h-8 w-24"
                    type="number"
                    value={service.rate}
                    onChange={(e) => {
                      setSnapshot({
                        ...snapshot,
                        services: snapshot.services.map((entry) =>
                          entry.id === service.id ? { ...entry, rate: Math.max(1, Number(e.target.value)) } : entry,
                        ),
                      });
                    }}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className={`rounded-full px-2 py-1 text-xs ${service.isActive ? "bg-emerald-500/20 text-emerald-300" : "bg-zinc-700 text-zinc-300"}`}
                    onClick={() => {
                      setSnapshot({
                        ...snapshot,
                        services: snapshot.services.map((entry) =>
                          entry.id === service.id ? { ...entry, isActive: !entry.isActive } : entry,
                        ),
                      });
                    }}
                  >
                    {service.isActive ? "Enabled" : "Disabled"}
                  </button>
                </td>
                <td>
                  <button
                    type="button"
                    className="text-rose-300"
                    onClick={() => {
                      if (!window.confirm("Delete this service?")) {
                        return;
                      }
                      setSnapshot({ ...snapshot, services: snapshot.services.filter((entry) => entry.id !== service.id) });
                    }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PaymentsView({ snapshot, setSnapshot }: { snapshot: AppSnapshot; setSnapshot: (next: AppSnapshot) => void | Promise<void> }) {
  const [orderId, setOrderId] = useState("");
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState<PaymentMethod>("Cash");

  const target = snapshot.orders.find((order) => order.id === orderId);
  const addPayment = () => {
    if (!target || amount <= 0) {
      return;
    }
    const nextPaid = Math.min(target.grandTotal, target.paidAmount + amount);
    const nextRemain = Math.max(0, target.grandTotal - nextPaid);
    const status = nextRemain === 0 ? "PAID" : nextPaid > 0 ? "PARTIAL" : "UNPAID";

    setSnapshot({
      ...snapshot,
      payments: [
        {
          id: uid("pay"),
          orderId: target.id,
          orderNumber: target.orderNumber,
          customerName: target.customerName,
          amount,
          method,
          date: today(),
          notes: "Additional payment",
        },
        ...snapshot.payments,
      ],
      orders: snapshot.orders.map((order) =>
        order.id === target.id
          ? { ...order, paidAmount: nextPaid, remainingBalance: nextRemain, paymentStatus: status }
          : order,
      ),
    });
    setAmount(0);
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_2fr]">
      <div className="rounded-2xl border border-zinc-800 bg-[#141414] p-4 space-y-3">
        <p className="text-sm font-medium">Record Payment</p>
        <select className="field" value={orderId} onChange={(e) => setOrderId(e.target.value)}>
          <option value="">Select order</option>
          {snapshot.orders.map((order) => (
            <option key={order.id} value={order.id}>{order.orderNumber} - {order.customerName} ({order.remainingBalance})</option>
          ))}
        </select>
        <input className="field" type="number" min={0} value={amount} onChange={(e) => setAmount(Number(e.target.value))} placeholder="Amount" />
        <select className="field" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}><option>Cash</option><option>Card</option><option>Other</option></select>
        <button type="button" className="btn-primary w-full" onClick={addPayment}>Add Payment</button>
      </div>
      <div className="overflow-auto rounded-2xl border border-zinc-800 bg-[#141414]">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/50 text-zinc-400"><tr><th className="px-3 py-2 text-left">Customer</th><th className="px-3 py-2 text-left">Order</th><th className="px-3 py-2 text-left">Total</th><th className="px-3 py-2 text-left">Paid</th><th className="px-3 py-2 text-left">Remaining</th><th className="px-3 py-2 text-left">Status</th></tr></thead>
          <tbody>
            {snapshot.orders.map((order) => (
              <tr key={order.id} className="border-t border-zinc-800">
                <td className="px-3 py-2">{order.customerName}</td>
                <td>{order.orderNumber}</td>
                <td>{order.grandTotal}</td>
                <td>{order.paidAmount}</td>
                <td>{order.remainingBalance}</td>
                <td><span className={`rounded-full px-2 py-0.5 text-xs ${paymentColor[order.paymentStatus]}`}>{order.paymentStatus}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ExpensesView({ snapshot, setSnapshot }: { snapshot: AppSnapshot; setSnapshot: (next: AppSnapshot) => void | Promise<void> }) {
  const [category, setCategory] = useState<Expense["category"]>("Electricity");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState(0);
  const [notes, setNotes] = useState("");

  const addExpense = () => {
    if (!description.trim() || amount <= 0) {
      return;
    }
    setSnapshot({
      ...snapshot,
      expenses: [{ id: uid("exp"), date: today(), category, description, amount, notes }, ...snapshot.expenses],
    });
    setDescription("");
    setAmount(0);
    setNotes("");
  };

  const month = new Date().toISOString().slice(0, 7);
  const monthly = snapshot.expenses.filter((expense) => expense.date.startsWith(month)).reduce((sum, expense) => sum + expense.amount, 0);
  const daily = snapshot.expenses.filter((expense) => expense.date === today()).reduce((sum, expense) => sum + expense.amount, 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-6">
        <select className="field" value={category} onChange={(e) => setCategory(e.target.value as Expense["category"])}>
          <option>Electricity</option><option>Water</option><option>Detergent</option><option>Packaging</option><option>Transport</option><option>Maintenance</option><option>Rent</option><option>Other</option>
        </select>
        <input className="field md:col-span-2" placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
        <input className="field" type="number" min={0} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
        <input className="field" placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <button type="button" className="btn-primary" onClick={addExpense}>Add Expense</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-zinc-800 bg-[#141414] p-4">Today's Expenses: <span className="text-gold-300">{daily}</span></div>
        <div className="rounded-2xl border border-zinc-800 bg-[#141414] p-4">Monthly Expenses: <span className="text-gold-300">{monthly}</span></div>
      </div>
      <div className="overflow-auto rounded-2xl border border-zinc-800 bg-[#141414]">
        <table className="w-full text-sm"><thead className="bg-zinc-900/50 text-zinc-400"><tr><th className="px-3 py-2 text-left">Date</th><th className="px-3 py-2 text-left">Category</th><th className="px-3 py-2 text-left">Description</th><th className="px-3 py-2 text-left">Amount</th><th className="px-3 py-2 text-left">Notes</th></tr></thead>
          <tbody>{snapshot.expenses.map((expense) => <tr key={expense.id} className="border-t border-zinc-800"><td className="px-3 py-2">{expense.date}</td><td>{expense.category}</td><td>{expense.description}</td><td>{expense.amount}</td><td>{expense.notes}</td></tr>)}</tbody></table>
      </div>
    </div>
  );
}

function ReportsView({ snapshot }: { snapshot: AppSnapshot }) {
  const delivered = snapshot.orders.filter((order) => order.status === "DELIVERED");
  const totalSales = delivered.reduce((sum, order) => sum + order.grandTotal, 0);
  const totalExpense = snapshot.expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const net = totalSales - totalExpense;
  const serviceMap = new Map<string, number>();
  snapshot.orders.forEach((order) => {
    order.items.forEach((item) => serviceMap.set(item.serviceName, (serviceMap.get(item.serviceName) ?? 0) + item.amount));
  });

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-zinc-800 bg-[#141414] p-4">Daily Sales: {snapshot.orders.filter((o) => o.orderDate === today()).reduce((s, o) => s + o.grandTotal, 0)}</div>
        <div className="rounded-2xl border border-zinc-800 bg-[#141414] p-4">Outstanding: {snapshot.orders.reduce((s, o) => s + o.remainingBalance, 0)}</div>
        <div className="rounded-2xl border border-zinc-800 bg-[#141414] p-4">Net Sales / Profit: {net}</div>
      </div>
      <div className="rounded-2xl border border-zinc-800 bg-[#141414] p-4">
        <p className="mb-3 text-sm font-medium">Service-wise Sales</p>
        <div className="space-y-2 text-sm">
          {Array.from(serviceMap.entries()).sort((a, b) => b[1] - a[1]).map(([name, value]) => (
            <div key={name} className="flex justify-between border-b border-zinc-800 py-2"><span>{name}</span><span>{value}</span></div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SettingsView({ snapshot, setSnapshot }: { snapshot: AppSnapshot; setSnapshot: (next: AppSnapshot) => void | Promise<void> }) {
  const [local, setLocal] = useState(snapshot.settings);

  useEffect(() => {
    setLocal(snapshot.settings);
  }, [snapshot.settings]);

  return (
    <div className="grid gap-5 xl:grid-cols-[2fr_1fr]">
      <div className="space-y-4">
        <div className="rounded-2xl border border-zinc-800 bg-[#141414] p-4 space-y-3">
          <p className="text-sm font-medium">Business</p>
          <input className="field" value={local.business.businessName} onChange={(e) => setLocal({ ...local, business: { ...local.business, businessName: e.target.value } })} />
          <input className="field" value={local.business.tagline} onChange={(e) => setLocal({ ...local, business: { ...local.business, tagline: e.target.value } })} />
          <input className="field" value={local.business.phone} onChange={(e) => setLocal({ ...local, business: { ...local.business, phone: e.target.value } })} />
          <input className="field" value={local.business.address} onChange={(e) => setLocal({ ...local, business: { ...local.business, address: e.target.value } })} />
          <input className="field" value={local.business.logoPath} onChange={(e) => setLocal({ ...local, business: { ...local.business, logoPath: e.target.value } })} />
          <input className="field" placeholder="Receipt logo path" value={local.business.receiptLogoPath || ""} onChange={(e) => setLocal({ ...local, business: { ...local.business, receiptLogoPath: e.target.value } })} />
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-[#141414] p-4 space-y-3">
          <p className="text-sm font-medium">Receipt & Application</p>
          <select className="field" value={local.receipt.paperSize} onChange={(e) => setLocal({ ...local, receipt: { ...local.receipt, paperSize: e.target.value as "80mm" | "A4" } })}><option>80mm</option><option>A4</option></select>
          <input className="field" placeholder="Printer name" value={local.receipt.printerName} onChange={(e) => setLocal({ ...local, receipt: { ...local.receipt, printerName: e.target.value } })} />
          <input className="field" value={local.receipt.footer} onChange={(e) => setLocal({ ...local, receipt: { ...local.receipt, footer: e.target.value } })} />
          <input className="field" value={local.app.currency} onChange={(e) => setLocal({ ...local, app: { ...local.app, currency: e.target.value } })} />
          <input className="field" value={local.app.dateFormat} onChange={(e) => setLocal({ ...local, app: { ...local.app, dateFormat: e.target.value } })} />
        </div>
        <WhatsAppPanel />
      </div>

      <div className="space-y-4">
        <button type="button" className="btn-primary w-full" onClick={() => setSnapshot({ ...snapshot, settings: local })}><Save className="mr-2 inline h-4 w-4" />Save Settings</button>
        <button
          type="button"
          className="btn-muted w-full"
          onClick={async () => {
            if (!window.desktopBridge) {
              window.alert("Backup is available in desktop EXE mode.");
              return;
            }
            const result = await window.desktopBridge.backupDatabase();
            window.alert(result.message);
          }}
        >
          Backup Database
        </button>
        <button
          type="button"
          className="btn-muted w-full"
          onClick={async () => {
            if (!window.desktopBridge) {
              window.alert("Restore is available in desktop EXE mode.");
              return;
            }
            const result = await window.desktopBridge.restoreDatabase();
            window.alert(result.message);
            if (result.ok) {
              const refreshed = await loadSnapshot();
              setSnapshot(refreshed);
            }
          }}
        >
          Restore Database
        </button>
      </div>
    </div>
  );
}
