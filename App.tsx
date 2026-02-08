
import React, { useState, useMemo, useEffect } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie
} from 'recharts';
import { 
  Upload, TrendingUp, DollarSign, ShoppingCart, 
  ArrowUpRight, ArrowDownRight, Info, AlertCircle, Sparkles, Plus, Trash2, Calendar, CheckCircle2, RefreshCw
} from 'lucide-react';
import { parseCSV } from './utils/csvParser';
import { geminiService } from './services/geminiService';
import { 
  ShopifyOrder, ShopifySalesRecord, MetaAdReport, ManualExpense, ProductCOGS, 
  DashboardStats, ReportType, Currency 
} from './types';

// Constants
const USD_TO_PKR = 280; // Example static rate

// Utility to get date strings
const getTodayStr = () => new Date().toISOString().split('T')[0];
const getFirstOfMonthStr = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'reports' | 'manual' | 'ai'>('dashboard');
  const [currency, setCurrency] = useState<Currency>('PKR');
  const [orders, setOrders] = useState<ShopifyOrder[]>([]);
  const [salesRecords, setSalesRecords] = useState<ShopifySalesRecord[]>([]);
  const [ads, setAds] = useState<MetaAdReport[]>([]);
  const [expenses, setExpenses] = useState<ManualExpense[]>([]);
  const [cogs, setCogs] = useState<ProductCOGS[]>([]);
  const [aiInsight, setAiInsight] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<Record<string, boolean>>({});
  
  // Date range states
  const [startDate, setStartDate] = useState<string>('2024-01-01');
  const [endDate, setEndDate] = useState<string>(getTodayStr());

  // Formatting Helper
  const formatVal = (amount: number) => {
    const val = currency === 'PKR' ? amount * USD_TO_PKR : amount;
    return new Intl.NumberFormat(currency === 'PKR' ? 'en-PK' : 'en-US', {
      style: 'currency',
      currency: currency,
      maximumFractionDigits: 0
    }).format(val);
  };

  // Helper to filter data by date
  const isWithinRange = (dateStr: string) => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    const start = new Date(startDate);
    const end = new Date(endDate);
    // Normalize to midnight for fair comparison
    d.setHours(0,0,0,0);
    start.setHours(0,0,0,0);
    end.setHours(0,0,0,0);
    return d >= start && d <= end;
  };

  // Filtered Data Sets
  const filteredOrders = useMemo(() => orders.filter(o => isWithinRange(o.date)), [orders, startDate, endDate]);
  const filteredSales = useMemo(() => salesRecords.filter(s => isWithinRange(s.date)), [salesRecords, startDate, endDate]);
  const filteredAds = useMemo(() => ads.filter(a => isWithinRange(a.date)), [ads, startDate, endDate]);

  // Statistics Calculation
  const stats = useMemo<DashboardStats>(() => {
    // Priority: Sales Records for accuracy, fallback to Orders
    const totalSales = filteredSales.length > 0 
      ? filteredSales.reduce((acc, curr) => acc + curr.totalSales, 0)
      : filteredOrders.reduce((acc, curr) => acc + curr.total, 0);

    const totalAdSpend = filteredAds.reduce((acc, curr) => acc + curr.spend, 0);
    
    const totalShipping = filteredSales.length > 0
      ? filteredSales.reduce((acc, curr) => acc + curr.shipping, 0)
      : filteredOrders.reduce((acc, curr) => acc + curr.shipping, 0);
    
    const totalExpenses = expenses.reduce((acc, curr) => acc + curr.amount, 0);
    
    // COGS must be calculated from Orders (where SKU is present)
    let totalCogsVal = 0;
    filteredOrders.forEach(order => {
      order.lineItems.forEach(item => {
        const itemCogs = cogs.find(c => c.sku === item.sku)?.cogs || 0;
        totalCogsVal += itemCogs * item.quantity;
      });
    });

    const totalFees = totalSales * 0.03; // Estimated gateway/Shopify fees
    const netProfit = totalSales - totalAdSpend - totalCogsVal - totalShipping - totalExpenses - totalFees;
    const roas = totalAdSpend > 0 ? totalSales / totalAdSpend : 0;
    const netMargin = totalSales > 0 ? (netProfit / totalSales) * 100 : 0;

    return {
      totalSales,
      totalOrders: filteredOrders.length,
      totalAdSpend,
      totalCogs: totalCogsVal,
      totalShipping,
      totalFees,
      netProfit,
      roas,
      netMargin
    };
  }, [filteredOrders, filteredSales, filteredAds, expenses, cogs]);

  const chartData = useMemo(() => {
    const dailyData: Record<string, any> = {};
    const sourceData = filteredSales.length > 0 ? filteredSales.map(s => ({ date: s.date, sales: s.totalSales })) 
                                              : filteredOrders.map(o => ({ date: o.date, sales: o.total }));
    
    sourceData.forEach(item => {
      if (!dailyData[item.date]) dailyData[item.date] = { date: item.date, sales: 0 };
      dailyData[item.date].sales += item.sales;
    });
    
    return Object.values(dailyData).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [filteredOrders, filteredSales]);

  // Dynamic SKU extraction from orders for Manual COGS
  useEffect(() => {
    const uniqueSkus = new Map<string, string>();
    orders.forEach(order => {
      order.lineItems.forEach(item => {
        if (item.sku && item.sku !== 'UNKNOWN') {
          uniqueSkus.set(item.sku, item.title);
        }
      });
    });

    setCogs(prev => {
      const next = [...prev];
      uniqueSkus.forEach((title, sku) => {
        if (!next.find(c => c.sku === sku)) {
          next.push({ sku, productName: title, cogs: 0 });
        }
      });
      return next;
    });
  }, [orders]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: ReportType) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const data = parseCSV(text);
        
        if (data.length === 0) {
          alert("CSV is empty or could not be parsed.");
          return;
        }

        console.log(`Parsing ${type} with ${data.length} rows...`);

        if (type === 'shopify_orders') {
          const mappedOrders: ShopifyOrder[] = data.map((row, idx) => ({
            id: row.Id || row.Name || idx.toString(),
            name: row.Name || `Order-${idx}`,
            date: (row['Created at'] || row.Date || "").split(' ')[0] || getTodayStr(),
            total: parseFloat(row.Total || row['Total price']) || 0,
            subtotal: parseFloat(row.Subtotal || row['Subtotal price']) || 0,
            tax: parseFloat(row.Tax || row['Total tax']) || 0,
            shipping: parseFloat(row.Shipping || row['Shipping cost']) || 0,
            status: row['Financial Status'] || row.Status || 'Paid',
            lineItems: [{ 
              sku: row.SKU || row['Lineitem sku'] || 'UNKNOWN', 
              title: row['Lineitem name'] || row.Title || 'Product', 
              quantity: parseInt(row['Lineitem quantity'] || row.Quantity) || 1, 
              price: parseFloat(row['Lineitem price'] || row.Price) || 0 
            }]
          }));
          setOrders(prev => [...prev, ...mappedOrders]);
        } else if (type === 'shopify_sales') {
          const mappedSales: ShopifySalesRecord[] = data.map(row => ({
            date: row.Day || row.Date || getTodayStr(),
            grossSales: parseFloat(row['Gross sales']) || 0,
            discounts: parseFloat(row.Discounts) || 0,
            returns: parseFloat(row.Returns) || 0,
            netSales: parseFloat(row['Net sales']) || 0,
            shipping: parseFloat(row.Shipping) || 0,
            taxes: parseFloat(row.Taxes) || 0,
            totalSales: parseFloat(row['Total sales'] || row.Total) || 0
          }));
          setSalesRecords(prev => [...prev, ...mappedSales]);
        } else if (type === 'meta_ads') {
          const mappedAds: MetaAdReport[] = data.map(row => ({
            date: row.Date || row['Reporting starts'] || getTodayStr(),
            campaignName: row['Campaign name'] || 'Unknown',
            spend: parseFloat(row['Amount spent (USD)'] || row.Spend || row['Amount spent'] || 0),
            impressions: parseInt(row.Impressions) || 0,
            clicks: parseInt(row['Link clicks'] || row.Clicks) || 0
          }));
          setAds(prev => [...prev, ...mappedAds]);
        }

        setUploadStatus(prev => ({ ...prev, [type]: true }));
        setTimeout(() => setUploadStatus(prev => ({ ...prev, [type]: false })), 3000);
      } catch (err) {
        console.error("Upload error:", err);
        alert("There was an error parsing the file. Please ensure it is a valid Shopify/Meta export.");
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const runAiAnalysis = async () => {
    setIsAnalyzing(true);
    const summary = `
      Performance Period: ${startDate} to ${endDate}
      Currency: ${currency}
      Total Sales: ${formatVal(stats.totalSales)}
      Net Profit: ${formatVal(stats.netProfit)}
      Ad Spend: ${formatVal(stats.totalAdSpend)}
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
              <p className="text-xs text-slate-500 font-medium uppercase tracking-widest">Brand Growth Engine</p>
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

          <div className="flex items-center space-x-4">
             {/* Currency Toggle */}
            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button 
                onClick={() => setCurrency('PKR')}
                className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-all ${currency === 'PKR' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500'}`}
              >
                PKR
              </button>
              <button 
                onClick={() => setCurrency('USD')}
                className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-all ${currency === 'USD' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500'}`}
              >
                USD
              </button>
            </div>

            <div className="flex items-center space-x-3 bg-white border border-slate-200 p-1.5 rounded-xl shadow-sm">
              <Calendar className="w-4 h-4 text-slate-400 ml-1" />
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
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        {activeTab === 'dashboard' && (
          <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Performance Dashboard</h2>
                <p className="text-sm text-slate-500">Consolidated analytics for {startDate} to {endDate}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <KPICard title="Net Profit" value={formatVal(stats.netProfit)} sub={`${stats.netMargin.toFixed(1)}% Margin`} icon={<DollarSign className="w-5 h-5 text-emerald-600" />} color="emerald" />
              <KPICard title="Gross Revenue" value={formatVal(stats.totalSales)} sub={`${stats.totalOrders} Orders`} icon={<ShoppingCart className="w-5 h-5 text-indigo-600" />} color="indigo" />
              <KPICard title="Ad Investment" value={formatVal(stats.totalAdSpend)} sub={`ROAS: ${stats.roas.toFixed(2)}`} icon={<RefreshCw className="w-5 h-5 text-rose-600" />} color="rose" />
              <KPICard title="Total COGS" value={formatVal(stats.totalCogs)} sub="Inventory & Shipping" icon={<Info className="w-5 h-5 text-slate-600" />} color="slate" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <h3 className="font-semibold text-slate-800 mb-6 flex items-center"><TrendingUp className="w-4 h-4 mr-2 text-indigo-500" /> Revenue Growth</h3>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                      <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => currency === 'PKR' ? `${v/1000}k` : `$${v}`} />
                      <Tooltip 
                        formatter={(v: number) => formatVal(v)}
                        cursor={{fill: '#f8fafc'}} 
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }} 
                      />
                      <Bar dataKey="sales" fill="#6366f1" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
                <h3 className="font-semibold text-slate-800 mb-6">P&L Split</h3>
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
                        <Tooltip formatter={(v: number) => formatVal(v)} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-4 space-y-3">
                    <LegendItem label="Ads" color="bg-rose-500" value={formatVal(stats.totalAdSpend)} />
                    <LegendItem label="COGS" color="bg-amber-500" value={formatVal(stats.totalCogs)} />
                    <LegendItem label="Net Profit" color="bg-indigo-500" value={formatVal(stats.netProfit)} />
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-semibold text-slate-800">Order Logs</h3>
                <span className="text-xs font-medium text-slate-400">{filteredOrders.length} orders analyzed</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-500 font-medium uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="px-6 py-3">Order</th>
                      <th className="px-6 py-3">Date</th>
                      <th className="px-6 py-3">Gross</th>
                      <th className="px-6 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredOrders.slice(0, 15).map(order => (
                      <tr key={`${order.id}-${order.name}`} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 font-bold text-slate-900">{order.name}</td>
                        <td className="px-6 py-4 text-slate-500">{order.date}</td>
                        <td className="px-6 py-4 font-semibold text-slate-900">{formatVal(order.total)}</td>
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
                        <td colSpan={4} className="px-6 py-12 text-center text-slate-400 italic">No order data present. Please upload reports.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'reports' && (
          <div className="max-w-5xl mx-auto space-y-6 animate-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white p-12 rounded-3xl border border-slate-200 shadow-xl text-center">
              <div className="w-20 h-20 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <Upload className="text-indigo-600 w-10 h-10" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-2">Data Synchronizer</h2>
              <p className="text-slate-500 mb-10 max-w-sm mx-auto">Import your Shopify and Meta export files to update the brand intelligence engine.</p>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <ReportUploader 
                  title="Shopify Sales Report" 
                  description="Required for financial accuracy"
                  type="shopify_sales" 
                  success={uploadStatus['shopify_sales']} 
                  onUpload={(e) => handleFileUpload(e, 'shopify_sales')} 
                />
                <ReportUploader 
                  title="Shopify Orders Report" 
                  description="Required for SKU & COGS mapping"
                  type="shopify_orders" 
                  success={uploadStatus['shopify_orders']} 
                  onUpload={(e) => handleFileUpload(e, 'shopify_orders')} 
                />
                <ReportUploader 
                  title="Meta Ads Spend" 
                  description="Required for ROAS calculation"
                  type="meta_ads" 
                  success={uploadStatus['meta_ads']} 
                  onUpload={(e) => handleFileUpload(e, 'meta_ads')} 
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'manual' && (
           <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in fade-in duration-500">
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="font-bold text-slate-800 flex items-center"><DollarSign className="w-5 h-5 mr-2 text-indigo-600" /> Operational Overheads</h3>
                  <button onClick={() => setExpenses([...expenses, { id: Date.now().toString(), category: '', amount: 0, note: '' }])} className="p-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100">
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
                <div className="space-y-3">
                  {expenses.map((exp, idx) => (
                    <div key={exp.id} className="flex items-center space-x-3 group">
                      <input type="text" placeholder="e.g. Office Rent" className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm" value={exp.category} onChange={(e) => {
                        const n = [...expenses]; n[idx].category = e.target.value; setExpenses(n);
                      }} />
                      <div className="relative">
                        <span className="absolute left-3 top-2 text-slate-400 text-sm">$</span>
                        <input type="number" className="w-32 pl-7 pr-3 py-2 border border-slate-200 rounded-lg text-sm" placeholder="USD" value={exp.amount || ''} onChange={(e) => {
                          const n = [...expenses]; n[idx].amount = parseFloat(e.target.value) || 0; setExpenses(n);
                        }} />
                      </div>
                      <button onClick={() => setExpenses(expenses.filter(e => e.id !== exp.id))} className="text-slate-300 hover:text-rose-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                  {expenses.length === 0 && <p className="text-center py-10 text-slate-400 text-sm italic">No overheads added for this period.</p>}
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="font-bold text-slate-800 flex items-center"><Info className="w-5 h-5 mr-2 text-indigo-600" /> Product COGS Ledger</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase">Automated SKU Detection</p>
                </div>
                <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
                  {cogs.map((item, idx) => (
                    <div key={item.sku} className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center justify-between">
                      <div className="max-w-[60%]">
                        <p className="text-[10px] font-black text-indigo-600 truncate">{item.sku}</p>
                        <p className="text-sm font-semibold text-slate-700 truncate">{item.productName}</p>
                      </div>
                      <div className="flex items-center space-x-3">
                        <span className="text-[10px] text-slate-400 font-bold">Unit Cost (USD)</span>
                        <input 
                          type="number" 
                          className="w-24 px-3 py-1.5 bg-white border border-slate-200 rounded-lg font-bold text-sm text-right text-slate-900" 
                          value={item.cogs || ''} 
                          placeholder="0.00"
                          onChange={(e) => {
                            const n = [...cogs]; n[idx].cogs = parseFloat(e.target.value) || 0; setCogs(n);
                          }} 
                        />
                      </div>
                    </div>
                  ))}
                  {cogs.length === 0 && (
                    <div className="text-center py-20 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                      <AlertCircle className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                      <p className="text-slate-400 text-sm font-medium">Upload "Orders Report" to auto-detect SKUs.</p>
                    </div>
                  )}
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
                <h2 className="text-3xl font-bold mb-2">AI Performance Audit</h2>
                <p className="text-indigo-100 text-lg opacity-90 mb-8 max-w-lg">Let Gemini analyze your current period performance and find optimization opportunities.</p>
                <button 
                  onClick={runAiAnalysis}
                  disabled={isAnalyzing}
                  className="px-8 py-4 bg-white text-indigo-700 font-bold rounded-2xl shadow-xl hover:scale-105 transition-all disabled:opacity-50 flex items-center"
                >
                  {isAnalyzing ? <div className="w-5 h-5 border-2 border-indigo-700 border-t-transparent rounded-full animate-spin mr-3"></div> : <Sparkles className="w-5 h-5 mr-2" />}
                  {isAnalyzing ? 'Processing Intelligence...' : 'Generate Actionable Insights'}
                </button>
              </div>
            </div>

            {aiInsight && (
              <div className="bg-white p-10 rounded-3xl border border-slate-200 shadow-sm animate-in fade-in zoom-in duration-500">
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

function KPICard({ title, value, sub, icon, color }: { 
  title: string; value: string; sub: string; icon: React.ReactNode; color: string; 
}) {
  const colorMap: any = {
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    indigo: 'bg-indigo-50 text-indigo-600 border-indigo-100',
    rose: 'bg-rose-50 text-rose-600 border-rose-100',
    slate: 'bg-slate-50 text-slate-600 border-slate-100',
  };

  return (
    <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm transition-all hover:shadow-md group">
      <div className="flex items-center justify-between mb-4">
        <div className={`p-2.5 rounded-xl border ${colorMap[color]}`}>
          {icon}
        </div>
      </div>
      <h3 className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">{title}</h3>
      <div className="text-2xl font-black text-slate-900 group-hover:text-indigo-600 transition-colors">{value}</div>
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

function ReportUploader({ title, description, type, onUpload, success }: { title: string; description: string; type: string; onUpload: (e: any) => void, success?: boolean }) {
  return (
    <div className={`group border-2 border-dashed p-8 rounded-3xl transition-all text-center flex flex-col h-full ${success ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 hover:border-indigo-400 hover:bg-indigo-50'}`}>
      <h4 className="text-base font-bold text-slate-800 mb-1">{title}</h4>
      <p className="text-[10px] text-slate-400 font-bold mb-6 flex-1">{description}</p>
      <input type="file" id={`upload-${type}`} className="hidden" accept=".csv" onChange={onUpload} />
      <label htmlFor={`upload-${type}`} className={`inline-flex items-center justify-center px-6 py-3 text-xs font-bold rounded-2xl cursor-pointer transition-all shadow-sm active:scale-95 ${success ? 'bg-emerald-600 text-white' : 'bg-slate-900 text-white hover:bg-slate-800'}`}>
        {success ? <><CheckCircle2 className="w-4 h-4 mr-2" /> Synced</> : <><Upload className="w-4 h-4 mr-2" /> Select CSV</>}
      </label>
    </div>
  );
}
