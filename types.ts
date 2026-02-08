
export interface ShopifyOrder {
  id: string;
  name: string;
  date: string;
  total: number;
  subtotal: number;
  tax: number;
  shipping: number;
  lineItems: LineItem[];
  status: string;
}

export interface ShopifySalesRecord {
  date: string;
  grossSales: number;
  discounts: number;
  returns: number;
  netSales: number;
  shipping: number;
  taxes: number;
  totalSales: number;
}

export interface LineItem {
  sku: string;
  title: string;
  quantity: number;
  price: number;
}

export interface MetaAdReport {
  date: string;
  campaignName: string;
  spend: number;
  impressions: number;
  clicks: number;
}

export interface SettlementReport {
  orderName: string;
  amountReceived: number;
  fees: number;
  status: 'settled' | 'pending' | 'failed';
}

export interface ManualExpense {
  id: string;
  category: string;
  amount: number;
  note: string;
}

export interface ProductCOGS {
  sku: string;
  productName: string;
  cogs: number;
}

export interface DashboardStats {
  totalSales: number;
  totalOrders: number;
  totalAdSpend: number;
  totalCogs: number;
  totalShipping: number;
  totalFees: number;
  netProfit: number;
  roas: number;
  netMargin: number;
}

export type ReportType = 'shopify_orders' | 'shopify_sales' | 'meta_ads' | 'settlement' | 'cogs' | 'expenses';
export type Currency = 'PKR' | 'USD';
