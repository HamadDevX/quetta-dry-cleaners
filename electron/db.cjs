const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");

const seedServices = [
  ["Shalwar Kameez", "DRY CLEANING", "piece", 130],
  ["3-Piece Suit", "DRY CLEANING", "set", 500],
  ["Shirt", "DRY CLEANING", "piece", 100],
  ["Pant", "DRY CLEANING", "piece", 100],
  ["Coat", "DRY CLEANING", "piece", 300],
  ["Waistcoat", "DRY CLEANING", "piece", 200],
  ["Sherwani", "DRY CLEANING", "piece", 1000],
  ["Ladies Fancy Suits", "DRY CLEANING", "suit", 1000],
  ["Jacket", "DRY CLEANING", "piece", 500],
  ["Sweater", "DRY CLEANING", "piece", 300],
  ["Blanket", "DRY CLEANING", "piece", 1000],
  ["Bedsheet", "DRY CLEANING", "piece", 300],
  ["Curtains", "DRY CLEANING", "panel", 350],
  ["Shalwar Kameez", "PRESSING / IRONING", "piece", 120],
  ["3-Piece Suit", "PRESSING / IRONING", "set", 500],
  ["Shirt", "PRESSING / IRONING", "piece", 100],
  ["Pant", "PRESSING / IRONING", "piece", 100],
  ["Coat", "PRESSING / IRONING", "piece", 300],
  ["Waistcoat", "PRESSING / IRONING", "piece", 200],
  ["Culf", "PRESSING / IRONING", "piece", 350],
];

const seedSettings = {
  business: {
    businessName: "QUETTA DRY CLEANERS",
    tagline: "WASH - DRY - PRESS",
    phone: "0319 2111233",
    address: "Basement, Noor-ul-Qamar Plaza, Jail Road, Near Marker Factory, Quetta",
    logoPath: "assets/Quetta_Dry_Cleaners_Logo.png",
    receiptLogoPath: "assets/Receipt_Logo.png",
  },
  receipt: {
    paperSize: "80mm",
    printerName: "",
    footer: "Thank you for choosing Quetta Dry Cleaners",
  },
  app: {
    theme: "dark",
    currency: "PKR",
    dateFormat: "dd/MM/yyyy",
  },
};

const createDb = (dbPath) => {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      address TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS services (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      unit TEXT NOT NULL,
      rate REAL NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      order_number TEXT NOT NULL UNIQUE,
      customer_id TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      customer_address TEXT DEFAULT '',
      customer_notes TEXT DEFAULT '',
      order_date TEXT NOT NULL,
      expected_date TEXT NOT NULL,
      delivery_mode TEXT NOT NULL,
      delivery_address TEXT DEFAULT '',
      delivery_date TEXT DEFAULT '',
      delivery_status TEXT DEFAULT '',
      delivery_notes TEXT DEFAULT '',
      payment_method TEXT NOT NULL,
      status TEXT NOT NULL,
      order_notes TEXT DEFAULT '',
      subtotal REAL NOT NULL,
      discount REAL NOT NULL,
      grand_total REAL NOT NULL,
      paid_amount REAL NOT NULL,
      remaining_balance REAL NOT NULL,
      payment_status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      service_id TEXT NOT NULL,
      service_name TEXT NOT NULL,
      quantity REAL NOT NULL,
      rate REAL NOT NULL,
      amount REAL NOT NULL,
      FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      order_number TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      amount REAL NOT NULL,
      method TEXT NOT NULL,
      date TEXT NOT NULL,
      notes TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      notes TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  const serviceCount = db.prepare("SELECT COUNT(*) AS c FROM services").get().c;
  if (serviceCount === 0) {
    const insertService = db.prepare(
      "INSERT INTO services (id, name, category, unit, rate, is_active) VALUES (?, ?, ?, ?, ?, 1)",
    );
    const seed = db.transaction(() => {
      seedServices.forEach((service, idx) => {
        insertService.run(`svc-${idx + 1}`, service[0], service[1], service[2], service[3]);
      });
    });
    seed();
  }

  const settingsCount = db.prepare("SELECT COUNT(*) AS c FROM settings").get().c;
  if (settingsCount === 0) {
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run("app_snapshot_settings", JSON.stringify(seedSettings));
  }

  return db;
};

const loadSnapshot = (db) => {
  const customers = db.prepare("SELECT id, name, phone, address, notes, created_at AS createdAt FROM customers ORDER BY name").all();
  const services = db
    .prepare("SELECT id, name, category, unit, rate, is_active AS isActive FROM services ORDER BY category, name")
    .all()
    .map((s) => ({ ...s, isActive: Boolean(s.isActive) }));
  const orders = db
    .prepare(
      `SELECT id, order_number AS orderNumber, customer_id AS customerId, customer_name AS customerName,
      customer_phone AS customerPhone, customer_address AS customerAddress, customer_notes AS customerNotes,
      order_date AS orderDate, expected_date AS expectedDate, delivery_mode AS deliveryMode,
      delivery_address AS deliveryAddress, delivery_date AS deliveryDate, delivery_status AS deliveryStatus,
      delivery_notes AS deliveryNotes, payment_method AS paymentMethod, status, order_notes AS orderNotes,
      subtotal, discount, grand_total AS grandTotal, paid_amount AS paidAmount,
      remaining_balance AS remainingBalance, payment_status AS paymentStatus, created_at AS createdAt
      FROM orders ORDER BY created_at DESC`,
    )
    .all();
  const items = db.prepare("SELECT id, order_id AS orderId, service_id AS serviceId, service_name AS serviceName, quantity, rate, amount FROM order_items").all();
  const payments = db
    .prepare("SELECT id, order_id AS orderId, order_number AS orderNumber, customer_name AS customerName, amount, method, date, notes FROM payments ORDER BY date DESC")
    .all();
  const expenses = db.prepare("SELECT id, date, category, description, amount, notes FROM expenses ORDER BY date DESC").all();
  const settingRow = db.prepare("SELECT value FROM settings WHERE key = ?").get("app_snapshot_settings");

  const settings = settingRow ? JSON.parse(settingRow.value) : seedSettings;

  const withItems = orders.map((order) => ({
    ...order,
    items: items.filter((item) => item.orderId === order.id).map(({ orderId, ...item }) => item),
  }));

  return {
    customers,
    services,
    orders: withItems,
    payments,
    expenses,
    settings,
  };
};

const saveSnapshot = (db, snapshot) => {
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM order_items").run();
    db.prepare("DELETE FROM orders").run();
    db.prepare("DELETE FROM payments").run();
    db.prepare("DELETE FROM expenses").run();
    db.prepare("DELETE FROM customers").run();
    db.prepare("DELETE FROM services").run();

    const insertCustomer = db.prepare(
      "INSERT INTO customers (id, name, phone, address, notes, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    );
    snapshot.customers.forEach((c) => insertCustomer.run(c.id, c.name, c.phone, c.address, c.notes, c.createdAt));

    const insertService = db.prepare(
      "INSERT INTO services (id, name, category, unit, rate, is_active) VALUES (?, ?, ?, ?, ?, ?)",
    );
    snapshot.services.forEach((s) => insertService.run(s.id, s.name, s.category, s.unit, s.rate, s.isActive ? 1 : 0));

    const insertOrder = db.prepare(
      `INSERT INTO orders (
        id, order_number, customer_id, customer_name, customer_phone, customer_address,
        customer_notes, order_date, expected_date, delivery_mode, delivery_address,
        delivery_date, delivery_status, delivery_notes, payment_method, status,
        order_notes, subtotal, discount, grand_total, paid_amount, remaining_balance,
        payment_status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    const insertItem = db.prepare(
      "INSERT INTO order_items (id, order_id, service_id, service_name, quantity, rate, amount) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );

    snapshot.orders.forEach((o) => {
      insertOrder.run(
        o.id,
        o.orderNumber,
        o.customerId,
        o.customerName,
        o.customerPhone,
        o.customerAddress,
        o.customerNotes,
        o.orderDate,
        o.expectedDate,
        o.deliveryMode,
        o.deliveryAddress,
        o.deliveryDate,
        o.deliveryStatus,
        o.deliveryNotes,
        o.paymentMethod,
        o.status,
        o.orderNotes,
        o.subtotal,
        o.discount,
        o.grandTotal,
        o.paidAmount,
        o.remainingBalance,
        o.paymentStatus,
        o.createdAt,
      );
      o.items.forEach((i) => insertItem.run(i.id, o.id, i.serviceId, i.serviceName, i.quantity, i.rate, i.amount));
    });

    const insertPayment = db.prepare(
      "INSERT INTO payments (id, order_id, order_number, customer_name, amount, method, date, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    );
    snapshot.payments.forEach((p) => insertPayment.run(p.id, p.orderId, p.orderNumber, p.customerName, p.amount, p.method, p.date, p.notes));

    const insertExpense = db.prepare(
      "INSERT INTO expenses (id, date, category, description, amount, notes) VALUES (?, ?, ?, ?, ?, ?)",
    );
    snapshot.expenses.forEach((e) => insertExpense.run(e.id, e.date, e.category, e.description, e.amount, e.notes));

    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(
      "app_snapshot_settings",
      JSON.stringify(snapshot.settings),
    );
  });

  tx();
};

module.exports = {
  createDb,
  loadSnapshot,
  saveSnapshot,
};