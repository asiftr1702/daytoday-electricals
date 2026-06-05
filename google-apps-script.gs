/**
 * Google Apps Script for DayToDay Electricals Admin Form
 * 
 * This script receives product submissions from the Angular admin form
 * and writes them to the corresponding Google Sheet.
 * 
 * SETUP INSTRUCTIONS:
 * 
 * 1. Go to https://script.google.com
 * 2. Create a new project
 * 3. Paste this entire code
 * 4. Replace SPREADSHEET_ID below with your actual spreadsheet ID
 * 5. Save the project
 * 6. Click "Deploy" → "New deployment" → Select "type: Web app"
 * 7. Set "Execute as" to your account
 * 8. Set "Who has access" to "Anyone"
 * 9. Copy the deployment URL
 * 10. Paste the URL in product-admin.service.ts (GOOGLE_APPS_SCRIPT_URL)
 * 11. Done! Your admin form will now write to Google Sheets
 */

// ⚠️ REPLACE WITH YOUR SPREADSHEET ID
const SPREADSHEET_ID = '1wlSD45IfabSnoqsuu7GkS77LKquxiQoVZXJabzQn-14';

// Column headers (must match the order in your Google Sheet)
const HEADERS = [
  'sku',
  'name',
  'description',
  'subcategory',
  'price',
  'unit',
  'available',
  'brand',
  'costPrice',
  'discountedPrice',
  'stockQty',
  'purchaseDate',
  'location',
  'remarks',
];

/**
 * Main function to handle POST requests from the Angular app
 */
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);

    if (payload.action === 'addProduct') {
      return addProduct(payload.sheetName, payload.product);
    } else if (payload.action === 'updateProduct') {
      return updateProduct(payload.sheetName, payload.rowNumber, payload.product);
    } else {
      return createResponse('error', 'Unknown action: ' + payload.action);
    }
  } catch (err) {
    Logger.log('Error: ' + err);
    return createResponse('error', err.toString());
  }
}

/**
 * Add a new product to the specified sheet
 */
function addProduct(sheetName, productData) {
  try {
    const sheet = getSheet(sheetName);

    // Add row
    sheet.appendRow(productData);

    Logger.log(`Product added to ${sheetName}: `, productData);
    return createResponse('success', `Product added to ${sheetName}`);
  } catch (err) {
    Logger.log('Error adding product: ' + err);
    return createResponse('error', err.toString());
  }
}

/**
 * Update an existing product in the specified sheet
 */
function updateProduct(sheetName, rowNumber, productData) {
  try {
    const sheet = getSheet(sheetName);

    // Update row
    for (let i = 0; i < productData.length; i++) {
      sheet.getRange(rowNumber, i + 1).setValue(productData[i]);
    }

    Logger.log(`Product updated in ${sheetName} at row ${rowNumber}`);
    return createResponse('success', `Product updated in ${sheetName}`);
  } catch (err) {
    Logger.log('Error updating product: ' + err);
    return createResponse('error', err.toString());
  }
}

/**
 * Get or create a sheet by name
 */
function getSheet(sheetName) {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = spreadsheet.getSheetByName(sheetName);

  if (!sheet) {
    // Create sheet if it doesn't exist
    sheet = spreadsheet.insertSheet(sheetName);
    sheet.appendRow(HEADERS);
    Logger.log(`Created new sheet: ${sheetName}`);
  }

  return sheet;
}

/**
 * Helper function to create a response object
 */
function createResponse(status, message) {
  return ContentService.createTextOutput(
    JSON.stringify({
      status,
      message,
    })
  ).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Simple test function (run this in the Apps Script editor to test)
 */
function testAddProduct() {
  const testProduct = [
    'TEST-001', // sku
    'Test Product', // name
    'This is a test product', // description
    'Test Subcategory', // subcategory
    999, // price
    'Piece', // unit
    'TRUE', // available
    'Test Brand', // brand
    500, // costPrice
    899, // discountedPrice
    10, // stockQty
    new Date().toISOString().split('T')[0], // purchaseDate
    'Shelf-1', // location
    'Test entry', // remarks
  ];

  const response = addProduct('Fans', testProduct);
  Logger.log('Test response: ' + response.getContent());
}
