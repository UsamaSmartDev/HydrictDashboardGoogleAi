
import React, { useState, useMemo, useEffect } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, Cell, PieChart, Pie
} from 'recharts';
import { 
  Upload, LayoutDashboard, FileText, Settings, TrendingUp, DollarSign, ShoppingCart, 
  ArrowUpRight, ArrowDownRight, Info, AlertCircle, Sparkles, Plus, Trash2, Filter
} from 'lucide-react';
import { parseCSV, formatCurrency } from './utils/csvParser';
import { geminiService } from './services/geminiService';
import { 
  ShopifyOrder, MetaAdReport, SettlementReport, ManualExpense, ProductCOGS, 
  DashboardStats, ReportType 
} from './types';

// Mock Data for Initial UI demo
const MOCK_ORDERS: ShopifyOrder[] = [
  { id: '1', name: '#1001', date: '2023-10-01', total: 120.50, subtotal: 100, tax: 5, shipping: 15.50, status: 'fulfilled', lineItems: [{ sku: 'HY-01', title: 'Hydrict Bottle V1', quantity: 1, price: 100 }] },
  { id: '2', name: '#1002', date: '2023-10-02', total: 240.00, subtotal: 200, tax: 10, shipping: 30.00, status: 'fulfilled', lineItems: [{ sku: 'HY-01', title: 'Hydrict Bottle V1', quantity: 2, price: 100 }] },
  { id: '3', name: '#1003', date: '2023-10-03', total: 95.00, subtotal: 80, tax: 5, shipping: 10.00, status: 'pending', lineItems: [{ sku: 'HY-02', title: 'Hydrict Filter Pro', quantity: 1, price: 80 }] },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'reports' | 'manual' | 'ai'>('dashboard');
  const [orders, setOrders] = useState<ShopifyOrder[]>(MOCK_ORDERS);
  const [ads, setAds] = useState<MetaAdReport[]>([]);
  const [settlements, setSettlements] = useState<SettlementReport[]>([]);
  const [expenses, setExpenses] = useState<ManualExpense[]>([]);
  const [cogs, setCogs] = useState<ProductCOGS[]>([
    { sku: 'HY-01', productName: 'Hydrict Bottle V1', cogs: 25 },
    { sku: 'HY-02', productName: 'Hydrict Filter Pro', cogs: 12 },
  ]);
  const [aiInsight, setAiInsight] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<string>('All');

  // Process data to calculate statistics
  const stats = useMemo<DashboardStats>(() => {
    const totalSales = orders.reduce((acc, curr) => acc + curr.total, 0);
    const totalAdSpend = ads.reduce((acc, curr) => acc + curr.spend, 0);
    const totalShipping = orders.reduce((acc, curr) => acc + curr.shipping, 0);
    const totalExpenses = expenses.reduce((acc, curr) => acc + curr.amount, 0);
    
    // Calculate COGS
    let totalCogs = 0;
    orders.forEach(order => {
      order.lineItems.forEach(item => {
        const itemCogs = cogs.find(c => c.sku === item.sku)?.cogs || 0;
        totalCogs += itemCogs * item.quantity;
      });
    });

    // Settlement Fees (Estimated if no report)
    const totalFees = settlements.reduce((acc, curr) => acc + curr.fees, 0) || (totalSales * 0.03); 

    const netProfit = totalSales - totalAdSpend - totalCogs - totalShipping - totalExpenses - totalFees;
    const roas = totalAdSpend > 0 ? totalSales / totalAdSpend : 0;
    const netMargin = totalSales > 0 ? (netProfit / totalSales) * 100 : 0;

    return {
      totalSales,
      totalOrders: orders.length,
      totalAdSpend,
      totalCogs,
      totalShipping,
      totalFees,
      netProfit,
      roas,
      netMargin
    };
  }, [orders, ads, expenses, cogs, settlements]);

  // Product Filter Logic
  const filteredProducts = useMemo(() => {
    const productList = Array.from(new Set(orders.flatMap(o => o.lineItems.map(i => i.title))));
    return ['All', ...productList];
  }, [orders]);

  const chartData = useMemo(() => {
    // Group sales by date
    const dailyData: Record<string, any> = {};
    orders.forEach(o => {
      if (!dailyData[o.date]) dailyData[o.date] = { date: o.date, sales: 0, orders: 0 };
      dailyData[o.date].sales += o.total;
      dailyData[o.date].orders += 1;
    });
    return Object.values(dailyData).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [orders]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: ReportType) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      const data = parseCSV(text);
      
      if (type === 'shopify_orders') {
        // Robust mapping would happen here
        const mappedOrders: ShopifyOrder[] = data.map((row, idx) => ({
          id: row.Id || row.Name || idx.toString(),
          name: row.Name || `Order-${idx}`,
          date: row['Created at'] || row.Date || new Date().toISOString().split('T')[0],
          total: parseFloat(row.Total) || 0,
          subtotal: parseFloat(row.Subtotal) || 0,
          tax: parseFloat(row.Tax) || 0,
          shipping: parseFloat(row.Shipping) || 0,
          status: row.Status || 'Paid',
          lineItems: [{ sku: row.SKU || 'UNKNOWN', title: row.Title || 'Product', quantity: parseInt(row.Quantity) || 1, price: parseFloat(row.Price) || 0 }]
        }));
        setOrders(prev => [...prev, ...mappedOrders]);
      } else if (type === 'meta_ads') {
        const mappedAds: MetaAdReport[] = data.map(row => ({
          date: row.Date || new Date().toISOString().split('T')[0],
          campaignName: row['Campaign Name'] || 'Unknown',
          spend: parseFloat(row['Amount Spent']) || parseFloat(row.Spend) || 0,
          impressions: parseInt(row.Impressions) || 0,
          clicks: parseInt(row.Clicks) || 0
        }));
        setAds(prev => [...prev, ...mappedAds]);
      }
    };
    reader.readAsText(file);
  };

  const runAiAnalysis = async () => {
    setIsAnalyzing(true);
    const summary = `
      Total Sales: ${formatCurrency(stats.totalSales)}
      Net Profit: ${formatCurrency(stats.netProfit)}
      Ad Spend: ${formatCurrency(stats.totalAdSpend)}
      ROAS: ${stats.roas.toFixed(2)}
      Net Margin: ${stats.netMargin.toFixed(1)}%
      Orders: ${stats.totalOrders}
    `;
    const insight = await geminiService.analyzeData(summary);
    setAiInsight(insight || '');
    setIsAnalyzing(false);
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center">
              <TrendingUp className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">Hydrict <span className="text-indigo-600">Intelligence</span></h1>
              <p className="text-xs text-slate-500 font-medium">Shopify Sales Dashboard</p>
            </div>
          </div>
          <nav className="hidden md:flex space-x-1">
            <button 
              onClick={() => setActiveTab('dashboard')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'dashboard' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              Dashboard
            </button>
            <button 
              onClick={() => setActiveTab('reports')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'reports' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              Reports
            </button>
            <button 
              onClick={() => setActiveTab('manual')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'manual' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              Manual Entry
            </button>
            <button 
              onClick={() => setActiveTab('ai')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'ai' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              AI Insights
            </button>
          </nav>
          <div className="flex items-center space-x-3">
             <button className="p-2 text-slate-400 hover:text-slate-600">
               <Settings className="w-5 h-5" />
             </button>
             <div className="w-8 h-8 rounded-full bg-slate-200"></div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        {/* Quick Product Filter */}
        <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Overview</h2>
            <p className="text-slate-500">Real-time store performance and profitability.</p>
          </div>
          <div className="flex items-center space-x-2 bg-white p-1 rounded-lg border border-slate-200 shadow-sm">
            <Filter className="w-4 h-4 text-slate-400 ml-2" />
            <select 
              className="bg-transparent text-sm font-medium text-slate-700 focus:outline-none pr-4 py-1"
              value={selectedProduct}
              onChange={(e) => setSelectedProduct(e.target.value)}
            >
              {filteredProducts.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>

        {activeTab === 'dashboard' && (
          <div className="space-y-8">
            {/* KPI Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <KPICard title="Net Profit" value={formatCurrency(stats.netProfit)} sub={`${stats.netMargin.toFixed(1)}% Margin`} icon={<DollarSign className="w-5 h-5 text-emerald-600" />} color="emerald" trend={stats.netProfit > 0 ? 'up' : 'down'} />
              <KPICard title="Gross Sales" value={formatCurrency(stats.totalSales)} sub={`${stats.totalOrders} Orders`} icon={<ShoppingCart className="w-5 h-5 text-indigo-600" />} color="indigo" trend="up" />
              <KPICard title="Ad Spend (Meta)" value={formatCurrency(stats.totalAdSpend)} sub={`ROAS: ${stats.roas.toFixed(2)}`} icon={<TrendingUp className="w-5 h-5 text-rose-600" />} color="rose" trend="down" />
              <KPICard title="Total COGS" value={formatCurrency(stats.totalCogs)} sub="Inventory & Ops" icon={<Info className="w-5 h-5 text-slate-600" />} color="slate" />
            </div>

            {/* Main Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="font-semibold text-slate-800">Sales Trend</h3>
                  <div className="flex items-center space-x-2 text-xs font-medium text-slate-400">
                    <span className="flex items-center"><span className="w-2 h-2 rounded-full bg-indigo-500 mr-1"></span> Sales</span>
                    <span className="flex items-center"><span className="w-2 h-2 rounded-full bg-emerald-500 mr-1"></span> Orders</span>
                  </div>
                </div>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `$${value}`} />
                      <Tooltip 
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                      />
                      <Bar dataKey="sales" fill="#6366f1" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <h3 className="font-semibold text-slate-800 mb-6">Cost Breakdown</h3>
                <div className="h-64 flex flex-col justify-center items-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'Ads', value: stats.totalAdSpend },
                          { name: 'COGS', value: stats.totalCogs },
                          { name: 'Fees', value: stats.totalFees },
                          { name: 'Shipping', value: stats.totalShipping },
                          { name: 'Profit', value: Math.max(0, stats.netProfit) }
                        ]}
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {[
                          '#f43f5e', // ads
                          '#f59e0b', // cogs
                          '#10b981', // fees
                          '#0ea5e9', // shipping
                          '#6366f1'  // profit
                        ].map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="mt-4 w-full space-y-2">
                    <LegendItem label="Ads" color="bg-rose-500" value={formatCurrency(stats.totalAdSpend)} />
                    <LegendItem label="COGS" color="bg-amber-500" value={formatCurrency(stats.totalCogs)} />
                    <LegendItem label="Profit" color="bg-indigo-500" value={formatCurrency(stats.netProfit)} />
                  </div>
                </div>
              </div>
            </div>

            {/* Table Area */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-semibold text-slate-800">Recent Transactions</h3>
                <button className="text-sm text-indigo-600 font-medium hover:text-indigo-700">View All</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-500 font-medium uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="px-6 py-3">Order</th>
                      <th className="px-6 py-3">Date</th>
                      <th className="px-6 py-3">Product</th>
                      <th className="px-6 py-3">Amount</th>
                      <th className="px-6 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {orders.slice(0, 5).map(order => (
                      <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 font-medium text-slate-900">{order.name}</td>
                        <td className="px-6 py-4 text-slate-500">{order.date}</td>
                        <td className="px-6 py-4 text-slate-600">{order.lineItems[0].title}</td>
                        <td className="px-6 py-4 font-semibold text-slate-900">{formatCurrency(order.total)}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                            order.status === 'fulfilled' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                          }`}>
                            {order.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'reports' && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm text-center">
              <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <Upload className="text-indigo-600 w-8 h-8" />
              </div>
              <h2 className="text-xl font-bold text-slate-800 mb-2">Upload Reports</h2>
              <p className="text-slate-500 mb-8">Drag and drop your Shopify and Meta export CSV files here to sync your dashboard.</p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ReportUploader title="Shopify Orders Report" type="shopify_orders" onUpload={(e) => handleFileUpload(e, 'shopify_orders')} />
                <ReportUploader title="Meta Ad Spend Report" type="meta_ads" onUpload={(e) => handleFileUpload(e, 'meta_ads')} />
                <ReportUploader title="Shopify Sales Report" type="shopify_sales" onUpload={(e) => handleFileUpload(e, 'shopify_sales')} />
                <ReportUploader title="Courier Settlement" type="settlement" onUpload={(e) => handleFileUpload(e, 'settlement')} />
              </div>
            </div>

            <div className="bg-indigo-900 text-white p-6 rounded-2xl flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="p-3 bg-indigo-800 rounded-xl">
                  <AlertCircle className="w-6 h-6 text-indigo-300" />
                </div>
                <div>
                  <h4 className="font-bold">Missing Settlement Reports?</h4>
                  <p className="text-indigo-200 text-sm">Upload them to see actual profit after courier fees.</p>
                </div>
              </div>
              <button className="px-4 py-2 bg-indigo-700 hover:bg-indigo-600 rounded-lg text-sm font-semibold transition-colors">Learn More</button>
            </div>
          </div>
        )}

        {activeTab === 'manual' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Manual Expenses */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-bold text-slate-800 flex items-center"><DollarSign className="w-5 h-5 mr-2 text-indigo-600" /> Fixed Expenses</h3>
                <button 
                  onClick={() => setExpenses([...expenses, { id: Date.now().toString(), category: 'Tools', amount: 0, note: '' }])}
                  className="p-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-4">
                {expenses.map((exp, idx) => (
                  <div key={exp.id} className="flex items-center space-x-3 group">
                    <input 
                      type="text" 
                      placeholder="Category" 
                      className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      value={exp.category}
                      onChange={(e) => {
                        const newExp = [...expenses];
                        newExp[idx].category = e.target.value;
                        setExpenses(newExp);
                      }}
                    />
                    <input 
                      type="number" 
                      placeholder="$ Amount" 
                      className="w-24 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      value={exp.amount}
                      onChange={(e) => {
                        const newExp = [...expenses];
                        newExp[idx].amount = parseFloat(e.target.value) || 0;
                        setExpenses(newExp);
                      }}
                    />
                    <button onClick={() => setExpenses(expenses.filter(e => e.id !== exp.id))} className="p-2 text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {expenses.length === 0 && <p className="text-center text-slate-400 py-8 text-sm italic">No expenses added yet.</p>}
              </div>
            </div>

            {/* COGS Per Product */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <h3 className="font-bold text-slate-800 mb-6 flex items-center"><Info className="w-5 h-5 mr-2 text-indigo-600" /> COGS Per SKU</h3>
              <div className="space-y-4">
                {cogs.map((item, idx) => (
                  <div key={item.sku} className="flex items-center space-x-3">
                    <div className="flex-1">
                      <p className="text-xs font-bold text-indigo-600 uppercase mb-1">{item.sku}</p>
                      <p className="text-sm font-medium text-slate-700">{item.productName}</p>
                    </div>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                      <input 
                        type="number" 
                        className="w-28 pl-7 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none font-semibold"
                        value={item.cogs}
                        onChange={(e) => {
                          const newCogs = [...cogs];
                          newCogs[idx].cogs = parseFloat(e.target.value) || 0;
                          setCogs(newCogs);
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'ai' && (
          <div className="max-w-4xl mx-auto">
            <div className="bg-gradient-to-br from-indigo-600 to-violet-700 p-8 rounded-3xl text-white shadow-xl shadow-indigo-200 mb-8">
              <div className="flex items-center space-x-4 mb-6">
                <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-sm">
                  <Sparkles className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold">Hydrict AI Analyst</h2>
                  <p className="text-indigo-100 opacity-90">Deep financial and performance audit powered by Gemini.</p>
                </div>
              </div>
              
              <button 
                onClick={runAiAnalysis}
                disabled={isAnalyzing}
                className="w-full sm:w-auto px-8 py-3 bg-white text-indigo-700 font-bold rounded-xl shadow-lg hover:bg-indigo-50 transition-all disabled:opacity-50 flex items-center justify-center"
              >
                {isAnalyzing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-indigo-700 border-t-transparent rounded-full animate-spin mr-2"></div>
                    Analyzing Store Data...
                  </>
                ) : 'Generate Performance Insights'}
              </button>
            </div>

            {aiInsight && (
              <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="prose prose-slate max-w-none">
                  {aiInsight.split('\n').map((line, i) => (
                    <p key={i} className="text-slate-700 mb-2 leading-relaxed">{line}</p>
                  ))}
                </div>
              </div>
            )}

            {!aiInsight && !isAnalyzing && (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Info className="text-slate-400 w-8 h-8" />
                </div>
                <h3 className="text-slate-600 font-medium">No analysis generated yet.</h3>
                <p className="text-slate-400 text-sm max-w-xs mx-auto mt-1">Upload your reports and click the button above to get AI recommendations for your brand.</p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-100 py-6 mt-12">
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-between">
          <p className="text-xs text-slate-400">© 2024 Hydrict. Designed for modern e-commerce brands.</p>
          <div className="flex space-x-4">
            <a href="#" className="text-xs text-slate-400 hover:text-indigo-600">Privacy</a>
            <a href="#" className="text-xs text-slate-400 hover:text-indigo-600">Terms</a>
            <a href="#" className="text-xs text-slate-400 hover:text-indigo-600">Support</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

// Helper Components

function KPICard({ title, value, sub, icon, color, trend }: { 
  title: string; value: string; sub: string; icon: React.ReactNode; color: string; trend?: 'up' | 'down' 
}) {
  const colorMap: any = {
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    indigo: 'bg-indigo-50 text-indigo-600 border-indigo-100',
    rose: 'bg-rose-50 text-rose-600 border-rose-100',
    slate: 'bg-slate-50 text-slate-600 border-slate-100',
  };

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-4">
        <div className={`p-2 rounded-xl border ${colorMap[color]}`}>
          {icon}
        </div>
        {trend && (
          <div className={`flex items-center text-[10px] font-bold px-2 py-1 rounded-full ${
            trend === 'up' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
          }`}>
            {trend === 'up' ? <ArrowUpRight className="w-3 h-3 mr-0.5" /> : <ArrowDownRight className="w-3 h-3 mr-0.5" />}
            12%
          </div>
        )}
      </div>
      <h3 className="text-slate-500 text-sm font-medium">{title}</h3>
      <div className="flex items-baseline space-x-2 mt-1">
        <span className="text-2xl font-bold text-slate-900 tracking-tight">{value}</span>
      </div>
      <p className="text-xs text-slate-400 mt-1">{sub}</p>
    </div>
  );
}

function LegendItem({ label, color, value }: { label: string; color: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <div className="flex items-center">
        <div className={`w-2.5 h-2.5 rounded-full ${color} mr-2`}></div>
        <span className="text-slate-500 font-medium">{label}</span>
      </div>
      <span className="text-slate-700 font-bold">{value}</span>
    </div>
  );
}

function ReportUploader({ title, type, onUpload }: { title: string; type: string; onUpload: (e: any) => void }) {
  return (
    <div className="p-4 border border-dashed border-slate-200 rounded-xl hover:border-indigo-300 hover:bg-slate-50 transition-all text-left">
      <h4 className="text-sm font-bold text-slate-700 mb-2">{title}</h4>
      <input 
        type="file" 
        id={`upload-${type}`}
        className="hidden" 
        accept=".csv"
        onChange={onUpload}
      />
      <label 
        htmlFor={`upload-${type}`}
        className="text-xs text-indigo-600 cursor-pointer font-medium flex items-center hover:underline"
      >
        <Upload className="w-3 h-3 mr-1" /> Choose CSV File
      </label>
    </div>
  );
}
