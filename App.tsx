
import React, { useState, useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie
} from 'recharts';
import { 
  Upload, TrendingUp, DollarSign, ShoppingCart, 
  ArrowUpRight, ArrowDownRight, Info, AlertCircle, Sparkles, Plus, Trash2, Calendar
} from 'lucide-react';
import { parseCSV, formatCurrency } from './utils/csvParser';
import { geminiService } from './services/geminiService';
import { 
  ShopifyOrder, MetaAdReport, ManualExpense, ProductCOGS, 
  DashboardStats, ReportType 
} from './types';

// Utility to get date strings
const getTodayStr = () => new Date().toISOString().split('T')[0];
const getFirstOfMonthStr = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
};

// Mock Data for Initial UI demo
const MOCK_ORDERS: ShopifyOrder[] = [
  { id: '1', name: '#1001', date: '2023-10-01', total: 120.50, subtotal: 100, tax: 5, shipping: 15.50, status: 'fulfilled', lineItems: [{ sku: 'HY-01', title: 'Hydrict Bottle V1', quantity: 1, price: 100 }] },
  { id: '2', name: '#1002', date: '2023-10-15', total: 240.00, subtotal: 200, tax: 10, shipping: 30.00, status: 'fulfilled', lineItems: [{ sku: 'HY-01', title: 'Hydrict Bottle V1', quantity: 2, price: 100 }] },
  { id: '3', name: '#1003', date: '2023-10-28', total: 95.00, subtotal: 80, tax: 5, shipping: 10.00, status: 'pending', lineItems: [{ sku: 'HY-02', title: 'Hydrict Filter Pro', quantity: 1, price: 80 }] },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'reports' | 'manual' | 'ai'>('dashboard');
  const [orders, setOrders] = useState<ShopifyOrder[]>(MOCK_ORDERS);
  const [ads, setAds] = useState<MetaAdReport[]>([]);
  const [expenses, setExpenses] = useState<ManualExpense[]>([]);
  const [cogs, setCogs] = useState<ProductCOGS[]>([
    { sku: 'HY-01', productName: 'Hydrict Bottle V1', cogs: 25 },
    { sku: 'HY-02', productName: 'Hydrict Filter Pro', cogs: 12 },
  ]);
  const [aiInsight, setAiInsight] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  // Date range states
  const [startDate, setStartDate] = useState<string>('2023-10-01');
  const [endDate, setEndDate] = useState<string>(getTodayStr());

  // Helper to filter data by date
  const isWithinRange = (dateStr: string) => {
    const d = new Date(dateStr);
    const start = new Date(startDate);
    const end = new Date(endDate);
    return d >= start && d <= end;
  };

  // Filtered Data Sets
  const filteredOrders = useMemo(() => orders.filter(o => isWithinRange(o.date)), [orders, startDate, endDate]);
  const filteredAds = useMemo(() => ads.filter(a => isWithinRange(a.date)), [ads, startDate, endDate]);

  // Process data to calculate statistics based on date range
  const stats = useMemo<DashboardStats>(() => {
    const totalSales = filteredOrders.reduce((acc, curr) => acc + curr.total, 0);
    const totalAdSpend = filteredAds.reduce((acc, curr) => acc + curr.spend, 0);
    const totalShipping = filteredOrders.reduce((acc, curr) => acc + curr.shipping, 0);
    const totalExpenses = expenses.reduce((acc, curr) => acc + curr.amount, 0);
    
    let totalCogs = 0;
    filteredOrders.forEach(order => {
      order.lineItems.forEach(item => {
        const itemCogs = cogs.find(c => c.sku === item.sku)?.cogs || 0;
        totalCogs += itemCogs * item.quantity;
      });
    });

    const totalFees = totalSales * 0.03; 

    const netProfit = totalSales - totalAdSpend - totalCogs - totalShipping - totalExpenses - totalFees;
    const roas = totalAdSpend > 0 ? totalSales / totalAdSpend : 0;
    const netMargin = totalSales > 0 ? (netProfit / totalSales) * 100 : 0;

    return {
      totalSales,
      totalOrders: filteredOrders.length,
      totalAdSpend,
      totalCogs,
      totalShipping,
      totalFees,
      netProfit,
      roas,
      netMargin
    };
  }, [filteredOrders, filteredAds, expenses, cogs]);

  const chartData = useMemo(() => {
    const dailyData: Record<string, any> = {};
    filteredOrders.forEach(o => {
      if (!dailyData[o.date]) dailyData[o.date] = { date: o.date, sales: 0, orders: 0 };
      dailyData[o.date].sales += o.total;
      dailyData[o.date].orders += 1;
    });
    return Object.values(dailyData).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [filteredOrders]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: ReportType) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      const data = parseCSV(text);
      
      if (type === 'shopify_orders') {
        const mappedOrders: ShopifyOrder[] = data.map((row, idx) => ({
          id: row.Id || row.Name || idx.toString(),
          name: row.Name || `Order-${idx}`,
          date: row['Created at']?.split(' ')[0] || row.Date || getTodayStr(),
          total: parseFloat(row.Total) || 0,
          subtotal: parseFloat(row.Subtotal) || 0,
          tax: parseFloat(row.Tax) || 0,
          shipping: parseFloat(row.Shipping) || 0,
          status: row['Financial Status'] || row.Status || 'Paid',
          lineItems: [{ sku: row.SKU || 'UNKNOWN', title: row['Lineitem name'] || row.Title || 'Product', quantity: parseInt(row['Lineitem quantity']) || 1, price: parseFloat(row['Lineitem price']) || 0 }]
        }));
        setOrders(prev => [...prev, ...mappedOrders]);
      } else if (type === 'meta_ads') {
        const mappedAds: MetaAdReport[] = data.map(row => ({
          date: row.Date || getTodayStr(),
          campaignName: row['Campaign name'] || 'Unknown',
          spend: parseFloat(row['Amount spent (USD)']) || parseFloat(row.Spend) || 0,
          impressions: parseInt(row.Impressions) || 0,
          clicks: parseInt(row['Link clicks']) || 0
        }));
        setAds(prev => [...prev, ...mappedAds]);
      }
    };
    reader.readAsText(file);
  };

  const runAiAnalysis = async () => {
    setIsAnalyzing(true);
    const summary = `
      Performance Period: ${startDate} to ${endDate}
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
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-2">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center">
              <TrendingUp className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">Hydrict <span className="text-indigo-600 tracking-tight">Intelligence</span></h1>
              <p className="text-xs text-slate-500 font-medium">Performance Analytics</p>
            </div>
          </div>
          
          <div className="flex bg-slate-100 p-1 rounded-xl">
            {(['dashboard', 'reports', 'manual', 'ai'] as const).map((tab) => (
              <button 
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${activeTab === tab ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="flex items-center space-x-3 bg-white border border-slate-200 p-1.5 rounded-xl shadow-sm">
            <Calendar className="w-4 h-4 text-slate-400 ml-2" />
            <input 
              type="date" 
              className="text-xs font-medium text-slate-600 bg-transparent focus:outline-none" 
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <span className="text-slate-300">—</span>
            <input 
              type="date" 
              className="text-xs font-medium text-slate-600 bg-transparent focus:outline-none" 
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        {activeTab === 'dashboard' && (
          <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Store Overview</h2>
                <p className="text-sm text-slate-500">Results from {startDate} to {endDate}</p>
              </div>
              <div className="flex items-center space-x-2">
                <button 
                  onClick={() => { setStartDate('2023-10-01'); setEndDate('2023-10-31'); }}
                  className="px-3 py-1.5 bg-white border border-slate-200 text-xs font-medium rounded-lg hover:bg-slate-50"
                >
                  Oct '23
                </button>
                <button 
                  onClick={() => { setStartDate(getFirstOfMonthStr()); setEndDate(getTodayStr()); }}
                  className="px-3 py-1.5 bg-white border border-slate-200 text-xs font-medium rounded-lg hover:bg-slate-50"
                >
                  This Month
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <KPICard title="Net Profit" value={formatCurrency(stats.netProfit)} sub={`${stats.netMargin.toFixed(1)}% Margin`} icon={<DollarSign className="w-5 h-5 text-emerald-600" />} color="emerald" trend={stats.netProfit > 0 ? 'up' : 'down'} />
              <KPICard title="Gross Sales" value={formatCurrency(stats.totalSales)} sub={`${stats.totalOrders} Orders`} icon={<ShoppingCart className="w-5 h-5 text-indigo-600" />} color="indigo" trend="up" />
              <KPICard title="Ad Spend" value={formatCurrency(stats.totalAdSpend)} sub={`ROAS: ${stats.roas.toFixed(2)}`} icon={<TrendingUp className="w-5 h-5 text-rose-600" />} color="rose" trend="down" />
              <KPICard title="Total COGS" value={formatCurrency(stats.totalCogs)} sub="Inventory Cost" icon={<Info className="w-5 h-5 text-slate-600" />} color="slate" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <h3 className="font-semibold text-slate-800 mb-6 flex items-center"><TrendingUp className="w-4 h-4 mr-2 text-indigo-500" /> Revenue Trend</h3>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                      <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(value) => `$${value}`} />
                      <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }} />
                      <Bar dataKey="sales" fill="#6366f1" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
                <h3 className="font-semibold text-slate-800 mb-6">Cost Breakdown</h3>
                <div className="flex-1 flex flex-col justify-center">
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={[
                            { name: 'Ads', value: stats.totalAdSpend },
                            { name: 'COGS', value: stats.totalCogs },
                            { name: 'Fees', value: stats.totalFees },
                            { name: 'Profit', value: Math.max(0, stats.netProfit) }
                          ]}
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={8}
                          dataKey="value"
                        >
                          {['#f43f5e', '#f59e0b', '#10b981', '#6366f1'].map((c, i) => <Cell key={i} fill={c} />)}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-4 space-y-3">
                    <LegendItem label="Ads" color="bg-rose-500" value={formatCurrency(stats.totalAdSpend)} />
                    <LegendItem label="COGS" color="bg-amber-500" value={formatCurrency(stats.totalCogs)} />
                    <LegendItem label="Profit" color="bg-indigo-500" value={formatCurrency(stats.netProfit)} />
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-semibold text-slate-800">Filtered Transactions</h3>
                <span className="text-xs font-medium text-slate-400">{filteredOrders.length} records found</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-500 font-medium uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="px-6 py-3">Order</th>
                      <th className="px-6 py-3">Date</th>
                      <th className="px-6 py-3">Amount</th>
                      <th className="px-6 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredOrders.slice(0, 10).map(order => (
                      <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 font-bold text-slate-900">{order.name}</td>
                        <td className="px-6 py-4 text-slate-500">{order.date}</td>
                        <td className="px-6 py-4 font-semibold text-slate-900">{formatCurrency(order.total)}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            order.status.toLowerCase().includes('paid') || order.status.toLowerCase().includes('fulfilled') 
                            ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                          }`}>
                            {order.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {filteredOrders.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-6 py-12 text-center text-slate-400 italic">No orders found in this range.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'reports' && (
          <div className="max-w-4xl mx-auto space-y-6 animate-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white p-12 rounded-3xl border border-slate-200 shadow-xl text-center">
              <div className="w-20 h-20 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <Upload className="text-indigo-600 w-10 h-10" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-2">Sync Your Data</h2>
              <p className="text-slate-500 mb-10 max-w-sm mx-auto">Upload weekly or monthly CSV exports from Shopify and Meta.</p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <ReportUploader title="Shopify Orders" type="shopify_orders" onUpload={(e) => handleFileUpload(e, 'shopify_orders')} />
                <ReportUploader title="Meta Ad Spend" type="meta_ads" onUpload={(e) => handleFileUpload(e, 'meta_ads')} />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'manual' && (
           <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in fade-in duration-500">
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="font-bold text-slate-800 flex items-center"><DollarSign className="w-5 h-5 mr-2 text-indigo-600" /> Operating Expenses</h3>
                  <button onClick={() => setExpenses([...expenses, { id: Date.now().toString(), category: '', amount: 0, note: '' }])} className="p-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100">
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
                <div className="space-y-3">
                  {expenses.map((exp, idx) => (
                    <div key={exp.id} className="flex items-center space-x-3 group">
                      <input type="text" placeholder="e.g. Shopify App Fee" className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm" value={exp.category} onChange={(e) => {
                        const n = [...expenses]; n[idx].category = e.target.value; setExpenses(n);
                      }} />
                      <input type="number" className="w-24 px-3 py-2 border border-slate-200 rounded-lg text-sm" value={exp.amount} onChange={(e) => {
                        const n = [...expenses]; n[idx].amount = parseFloat(e.target.value) || 0; setExpenses(n);
                      }} />
                      <button onClick={() => setExpenses(expenses.filter(e => e.id !== exp.id))} className="text-slate-300 hover:text-rose-500"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <h3 className="font-bold text-slate-800 mb-6 flex items-center"><Info className="w-5 h-5 mr-2 text-indigo-600" /> COGS Settings</h3>
                <div className="space-y-6">
                  {cogs.map((item, idx) => (
                    <div key={item.sku} className="flex items-center justify-between border-b border-slate-50 pb-4">
                      <div>
                        <p className="text-xs font-bold text-indigo-600">{item.sku}</p>
                        <p className="text-sm text-slate-700">{item.productName}</p>
                      </div>
                      <input type="number" className="w-20 px-2 py-1 border rounded font-medium text-sm text-right" value={item.cogs} onChange={(e) => {
                        const n = [...cogs]; n[idx].cogs = parseFloat(e.target.value) || 0; setCogs(n);
                      }} />
                    </div>
                  ))}
                </div>
              </div>
           </div>
        )}

        {activeTab === 'ai' && (
          <div className="max-w-4xl mx-auto animate-in slide-in-from-bottom-4 duration-500">
            <div className="bg-indigo-600 p-10 rounded-[2.5rem] text-white shadow-2xl relative overflow-hidden mb-8">
              <div className="absolute top-0 right-0 p-12 opacity-10">
                <Sparkles className="w-48 h-48" />
              </div>
              <div className="relative z-10">
                <h2 className="text-3xl font-bold mb-2">Financial Insights</h2>
                <p className="text-indigo-100 text-lg opacity-90 mb-8 max-w-lg">Audit performance from {startDate} to {endDate}.</p>
                <button 
                  onClick={runAiAnalysis}
                  disabled={isAnalyzing}
                  className="px-8 py-4 bg-white text-indigo-700 font-bold rounded-2xl shadow-xl hover:scale-105 transition-all disabled:opacity-50 flex items-center"
                >
                  {isAnalyzing ? <div className="w-5 h-5 border-2 border-indigo-700 border-t-transparent rounded-full animate-spin mr-3"></div> : <Sparkles className="w-5 h-5 mr-2" />}
                  {isAnalyzing ? 'Analyzing...' : 'Run Performance Audit'}
                </button>
              </div>
            </div>

            {aiInsight && typeof aiInsight === 'string' && (
              <div className="bg-white p-10 rounded-3xl border border-slate-200 shadow-sm">
                <div className="prose prose-indigo max-w-none">
                  {aiInsight.split('\n').map((line, i) => (
                    <p key={i} className="text-slate-700 mb-4 leading-relaxed font-medium">{line}</p>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

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
    <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm transition-all hover:shadow-md">
      <div className="flex items-center justify-between mb-4">
        <div className={`p-2.5 rounded-xl border ${colorMap[color]}`}>
          {icon}
        </div>
      </div>
      <h3 className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">{title}</h3>
      <div className="text-2xl font-black text-slate-900">{value}</div>
      <p className="text-xs text-slate-500 mt-1 font-medium">{sub}</p>
    </div>
  );
}

function LegendItem({ label, color, value }: { label: string; color: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center space-x-2">
        <div className={`w-2.5 h-2.5 rounded-full ${color}`}></div>
        <span className="text-xs font-semibold text-slate-500">{label}</span>
      </div>
      <span className="text-xs font-bold text-slate-800">{value}</span>
    </div>
  );
}

function ReportUploader({ title, type, onUpload }: { title: string; type: string; onUpload: (e: any) => void }) {
  return (
    <div className="group border-2 border-dashed border-slate-200 p-6 rounded-2xl hover:border-indigo-400 hover:bg-indigo-50 transition-all text-center">
      <h4 className="text-sm font-bold text-slate-700 mb-3">{title}</h4>
      <input type="file" id={`upload-${type}`} className="hidden" accept=".csv" onChange={onUpload} />
      <label htmlFor={`upload-${type}`} className="inline-flex items-center px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-xl cursor-pointer">
        <Upload className="w-3.5 h-3.5 mr-2" /> Upload CSV
      </label>
    </div>
  );
}
