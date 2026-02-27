import * as XLSX from 'xlsx';
import { getNestedValue } from './columnDetection';

export function exportToExcel(
  products, 
  columns,
  filename = 'shopify-products'
) {
  
  
  
  // Normalize columns: handle both ColumnDefinition objects and string arrays
  const normalizedColumns = columns.map((col) => {
    // If it's already a ColumnDefinition object with a key
    if (typeof col === 'object' && col !== null) {
      const colObj = col;
      // Extract key from key, fieldPath, or accessorKey
      const key = colObj.key || (col).fieldPath || (col).accessorKey;
      
      if (!key) {
        console.warn('[exportToExcel] Column object missing key:', col);
        return null;
      }
      
      return {
        ...colObj,
        key,
        label: colObj.label || key,
        type: colObj.type || 'string'
      };
    }
    
    // If it's a string, create a basic ColumnDefinition
    if (typeof col === 'string') {
      return {
        key: col,
        label: col.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim(),
        type: 'string',
        sortable: true,
        filterable: true
      };
    }
    
    console.warn('[exportToExcel] Invalid column type:', typeof col, col);
    return null;
  }).filter(Boolean); // Remove null entries

  

  if (normalizedColumns.length === 0) {
    console.error('[exportToExcel] No valid columns after normalization. Original columns:', columns);
    throw new Error('No valid columns selected for export');
  }

  
  

  // Build export data using only the selected columns
  const exportData = products.map((product) => {
    const row = {};
    
    normalizedColumns.forEach((col) => {
      const value = getNestedValue(product, col.key);
      
      // For Excel export, handle different types:
      // - currency: export (not formatted strings)
      // - date: export string
      // - other: export as-is
      if (col.type === 'currency') {
        // Parse currency to number if it's a string
        const numValue = typeof value === 'string' ? parseFloat(value) : Number(value);
        row[col.label] = isNaN(numValue) ? 'N/A' : numValue;
      } else if (col.type === 'date') {
        try {
          row[col.label] = new Date(value).toISOString().split('T')[0];
        } catch {
          row[col.label] = value;
        }
      } else if (value === null || value === undefined) {
        row[col.label] = 'N/A';
      } else {
        row[col.label] = value;
      }
    });
    
    return row;
  });
  
  
  const worksheet = XLSX.utils.json_to_sheet(exportData);
  const workbook = XLSX.utils.book_new();
  
  // Set column widths based on column count
  worksheet['!cols'] = normalizedColumns.map(() => ({ wch: 20 }));
  
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Products');
  
  const dateStr = new Date().toISOString().split('T')[0];
  const fullFilename = `${filename}-${dateStr}.xlsx`;
  
  try {
    // Debug: log export inputs
    console.log('[exportToExcel] exporting', { fullFilename, columns: normalizedColumns.map(c=>c.key), sample: exportData[0] });

    // Try browser-friendly writeFile first
    if (typeof XLSX.writeFile === 'function') {
      XLSX.writeFile(workbook, fullFilename, { 
        bookType: 'xlsx',
        type: 'binary'
      });
      return;
    }

    // Fallback: generate array buffer and download via blob
    const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fullFilename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return;

  } catch (error) {
    console.error('Error writing Excel file:', error);
    const err = new Error('Failed to download Excel file: ' + (error?.message || String(error)));
    err.cause = error;
    throw err;
  }
}
