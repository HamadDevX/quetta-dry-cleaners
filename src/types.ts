export type OrderStatus = "RECEIVED" | "PROCESSING" | "READY" | "DELIVERED" | "CANCELLED";

export type PaymentStatus = "PAID" | "PARTIAL" | "UNPAID";

export type DeliveryMode = "Customer Pickup" | "Home Delivery";

export type PaymentMethod = "Cash" | "Card" | "Other";

export interface Customer {
  id: string;
  name: string;
  phone: string;
  address: string;
  notes: string;
  createdAt: string;
}

export interface Service {
  id: string;
  name: string;
  category: "DRY CLEANING" | "PRESSING / IRONING";
  unit: string;
  rate: number;
  isActive: boolean;
}

export interface OrderItem {
  id: string;
  serviceId: string;
  serviceName: string;
  quantity: number;
  rate: number;
  amount: number;
}

export interface Order {
  id: string;
  orderNumber: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  customerNotes: string;
  orderDate: string;
  expectedDate: string;
  deliveryMode: DeliveryMode;
  deliveryAddress: string;
  deliveryDate: string;
  deliveryStatus: string;
  deliveryNotes: string;
  paymentMethod: PaymentMethod;
  status: OrderStatus;
  orderNotes: string;
  items: OrderItem[];
  subtotal: number;
  discount: number;
  grandTotal: number;
  paidAmount: number;
  remainingBalance: number;
  paymentStatus: PaymentStatus;
  createdAt: string;
}

export interface Payment {
  id: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  amount: number;
  method: PaymentMethod;
  date: string;
  notes: string;
}

export interface Expense {
  id: string;
  date: string;
  category:
    | "Electricity"
    | "Water"
    | "Detergent"
    | "Packaging"
    | "Transport"
    | "Maintenance"
    | "Rent"
    | "Other";
  description: string;
  amount: number;
  notes: string;
}

export interface BusinessSettings {
  businessName: string;
  tagline: string;
  phone: string;
  address: string;
  logoPath: string;
  receiptLogoPath: string;
}

export interface ReceiptSettings {
  paperSize: "80mm" | "A4";
  printerName: string;
  footer: string;
}

export interface AppSettings {
  theme: "dark";
  currency: string;
  dateFormat: string;
}

export interface Settings {
  business: BusinessSettings;
  receipt: ReceiptSettings;
  app: AppSettings;
}

export interface AppSnapshot {
  customers: Customer[];
  services: Service[];
  orders: Order[];
  payments: Payment[];
  expenses: Expense[];
  settings: Settings;
}