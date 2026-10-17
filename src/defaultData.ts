import { AppSnapshot, Service } from "./types";

const defaultServices: Service[] = [
  { id: "svc-1", name: "Shalwar Kameez", category: "DRY CLEANING", unit: "piece", rate: 130, isActive: true },
  { id: "svc-2", name: "3-Piece Suit", category: "DRY CLEANING", unit: "set", rate: 500, isActive: true },
  { id: "svc-3", name: "Shirt", category: "DRY CLEANING", unit: "piece", rate: 100, isActive: true },
  { id: "svc-4", name: "Pant", category: "DRY CLEANING", unit: "piece", rate: 100, isActive: true },
  { id: "svc-5", name: "Coat", category: "DRY CLEANING", unit: "piece", rate: 300, isActive: true },
  { id: "svc-6", name: "Waistcoat", category: "DRY CLEANING", unit: "piece", rate: 200, isActive: true },
  { id: "svc-7", name: "Sherwani", category: "DRY CLEANING", unit: "piece", rate: 1000, isActive: true },
  { id: "svc-8", name: "Ladies Fancy Suits", category: "DRY CLEANING", unit: "suit", rate: 1000, isActive: true },
  { id: "svc-9", name: "Jacket", category: "DRY CLEANING", unit: "piece", rate: 500, isActive: true },
  { id: "svc-10", name: "Sweater", category: "DRY CLEANING", unit: "piece", rate: 300, isActive: true },
  { id: "svc-11", name: "Blanket", category: "DRY CLEANING", unit: "piece", rate: 1000, isActive: true },
  { id: "svc-12", name: "Bedsheet", category: "DRY CLEANING", unit: "piece", rate: 300, isActive: true },
  { id: "svc-13", name: "Curtains", category: "DRY CLEANING", unit: "panel", rate: 350, isActive: true },
  { id: "svc-14", name: "Shalwar Kameez", category: "PRESSING / IRONING", unit: "piece", rate: 120, isActive: true },
  { id: "svc-15", name: "3-Piece Suit", category: "PRESSING / IRONING", unit: "set", rate: 500, isActive: true },
  { id: "svc-16", name: "Shirt", category: "PRESSING / IRONING", unit: "piece", rate: 100, isActive: true },
  { id: "svc-17", name: "Pant", category: "PRESSING / IRONING", unit: "piece", rate: 100, isActive: true },
  { id: "svc-18", name: "Coat", category: "PRESSING / IRONING", unit: "piece", rate: 300, isActive: true },
  { id: "svc-19", name: "Waistcoat", category: "PRESSING / IRONING", unit: "piece", rate: 200, isActive: true },
  { id: "svc-20", name: "Culf", category: "PRESSING / IRONING", unit: "piece", rate: 350, isActive: true },
];

export const defaultSnapshot: AppSnapshot = {
  customers: [],
  services: defaultServices,
  orders: [],
  payments: [],
  expenses: [],
  settings: {
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
  },
};