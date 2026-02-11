import * as XLSX from 'xlsx';
import { getNestedValue } from './columnDetection';

export function exportToExcel(
  products, 
  columns,
  filename = 'shopify-products'
) {
  console.log('[exportToExcel] Starting export with columns:', columns);
  console.log('[exportToExcel] First column type:', typeof columns[0]);
  
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

  console.log(`[exportToExcel] Normalized ${normalizedColumns.length} columns`);

  if (normalizedColumns.length === 0) {
    console.error('[exportToExcel] No valid columns after normalization. Original columns:', columns);
    throw new Error('No valid columns selected for export');
  }

  console.log(`[exportToExcel] Exporting ${products.length} products with columns:`, normalizedColumns.map(c => c.key));
  console.log(`%c[exportToExcel] 🎯 RECEIVING ${products.length} PRODUCTS TO EXPORT`, 'background: purple; color: white; font-weight: bold; font-size: 14px');

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
  
  console.log(`%c[exportToExcel] 🎯 EXPORT DATA ROWS: ${exportData.length}`, 'background: maroon; color: white; font-weight: bold; font-size: 14px');
  const worksheet = XLSX.utils.json_to_sheet(exportData);
  const workbook = XLSX.utils.book_new();
  
  // Set column widths based on column count
  worksheet['!cols'] = normalizedColumns.map(() => ({ wch: 20 }));
  
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Products');
  
  const dateStr = new Date().toISOString().split('T')[0];
  const fullFilename = `${filename}-${dateStr}.xlsx`;
  
  try {
    // Use writeFile with proper options for browser download
    XLSX.writeFile(workbook, fullFilename, { 
      bookType: 'xlsx',
      type: 'binary'
    });
    console.log(`Export successful: ${fullFilename}`);
  } catch (error) {
    console.error('Error writing Excel file:', error);
    throw new Error('Failed to download Excel file');
  }
}
