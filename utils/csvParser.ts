
export const parseCSV = (text: string) => {
  const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
  if (lines.length === 0) return [];

  const splitLine = (line: string) => {
    const result = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(cur.trim());
        cur = '';
      } else {
        cur += char;
      }
    }
    result.push(cur.trim());
    return result;
  };

  const headers = splitLine(lines[0]).map(h => h.replace(/^"|"$/g, ''));
  
  return lines.slice(1).map(line => {
    const values = splitLine(line).map(v => v.replace(/^"|"$/g, ''));
    const obj: any = {};
    headers.forEach((header, i) => {
      if (header) {
        obj[header] = values[i] || '';
      }
    });
    return obj;
  });
};

export const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
};
