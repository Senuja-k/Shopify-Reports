/**
 * Column visibility and ordering configuration
 * Users can customize which columns are visible and in what order
 */


// Default visible columns (customize as needed)
export const visibleColumns = {
  title: true,
  vendor: true,
  price: true,
  inventory: true,
  // Add more columns as needed
};

// Default column widths (customize as needed)
export const columnWidths = {
  title: 200,
  vendor: 120,
  price: 100,
  inventory: 100,
  // Add more columns as needed
};

// Default column labels (customize as needed)
export const columnLabels = {
  title: 'Title',
  vendor: 'Vendor',
  price: 'Price',
  inventory: 'Inventory',
  // Add more columns as needed
};

export const COLUMN_CONFIG = {
  visibleColumns,
  columnWidths,
  columnLabels,
};

/**
 * Example: To customize visible columns, modify visibleColumns object
 * To show additional fields from Shopify, the system will auto-detect them
 * To hide specific columns, set them to false:
 *
 * visibleColumns: {
 *   title,
 *   vendor,  // This will hide the vendor column
 *   // ... other columns
 * }
 */
