/**
 * Google Sheets Configuration for DayToDay Electricals
 *
 * ──────────────────────────────────────────────────────────
 *  SETUP INSTRUCTIONS
 * ──────────────────────────────────────────────────────────
 *
 *  1. Create a Google Spreadsheet at https://sheets.google.com
 *
 *  2. Create one tab/sheet per product category using the exact
 *     sheet names listed in categories.config.ts (sheetName field).
 *
 *  3. Add the following column headers in Row 1 of each sheet:
 *        Name | Description | Subcategory | Price | Unit | Available | Brand
 *     Example row:
 *        Havells Ceiling Fan | 1200mm 3-blade fan | Ceiling Fan | 2800 | Piece | TRUE | Havells
 *
 *     Subcategory values should match the subcategories listed in categories.config.ts.
 *     Items without a Subcategory value will appear under "All" but not in any sub-filter.
 *
 *  4. Share the spreadsheet publicly:
 *        File → Share → Share with others
 *        → Change to "Anyone with the link" → Viewer → Done
 *
 *  5. Copy the Spreadsheet ID from the URL:
 *        https://docs.google.com/spreadsheets/d/[SPREADSHEET_ID]/edit
 *
 *  6. Replace the placeholder below with your actual Spreadsheet ID.
 *
 * ──────────────────────────────────────────────────────────
 *  NOTE: Until you set this up, the website shows sample data.
 * ──────────────────────────────────────────────────────────
 */
export const SPREADSHEET_ID: string = '1wlSD45IfabSnoqsuu7GkS77LKquxiQoVZXJabzQn-14';
