export const formatCurrency = value => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(value);
export const formatNumber = value => new Intl.NumberFormat('en-AU').format(value);
