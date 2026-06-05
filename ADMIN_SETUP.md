# Admin Form Setup Guide

This guide will walk you through setting up the Google Sheets admin form for your DayToDay Electricals website.

## Overview

The admin form allows you to add/edit products directly from your web app, and the data automatically saves to Google Sheets. Perfect for mobile data entry!

### Architecture:
- **Angular Admin Form** → Collects product data
- **Google Apps Script** → Acts as a bridge
- **Google Sheets** → Stores the product data

---

## Step 1: Create Google Apps Script

1. Go to https://script.google.com
2. Click **"+ New project"**
3. Name it something like `DayToDay Electricals Admin API`
4. Delete the default code
5. Paste the code from `google-apps-script.gs` (in this repository)
6. **Replace `SPREADSHEET_ID`** on line 8 with your actual spreadsheet ID from the Google Sheet URL
   - Example: `1wlSD45IfabSnoqsuu7GkS77LKquxiQoVZXJabzQn-14`

---

## Step 2: Deploy as Web App

1. Click **"Deploy"** (top right)
2. Click **"New deployment"**
3. Select **"Type: Web app"** from dropdown
4. Set **"Execute as"**: Your Google account (select from dropdown)
5. Set **"Who has access"**: `Anyone`
6. Click **"Deploy"**
7. ✅ You'll see a deployment ID. **Copy the URL** from "New deployment"
   - It looks like: `https://script.googleapis.com/macros/d/{DEPLOYMENT_ID}/usercallable`

---

## Step 3: Update Angular Service

1. Open `src/app/core/services/product-admin.service.ts`
2. Find the line:
   ```typescript
   private readonly GOOGLE_APPS_SCRIPT_URL = 'https://script.googleapis.com/macros/d/{DEPLOYMENT_ID}/usercallable';
   ```
3. Replace `{DEPLOYMENT_ID}` with your actual deployment ID from Step 2

---

## Step 4: Grant Sheet Access (Optional but Recommended)

1. Go back to your Google Apps Script
2. Click **"Execute"** to run the `testAddProduct()` function
3. You'll be asked to grant permissions
4. Check the **"View execution logs"** for your Google account email
5. Share your Google Sheet with that email address

---

## Step 5: Test the Form

1. Start your Angular app: `npm start`
2. Go to http://localhost:4200/admin
3. You should see the admin form with category selection
4. Select a category (e.g., Fans)
5. Fill in the form
6. Click **"Add Product"**
7. Check your Google Sheet - the new row should appear!

---

## Form Features

✅ **Mobile-Friendly**: Optimized for phone screens  
✅ **Category-Based**: Products organized by category (Fans, Lights, etc.)  
✅ **Real-Time Validation**: Form validates before submission  
✅ **Auto-Complete**: Fields remember previous entries  
✅ **Success Messages**: Feedback when product is added  
✅ **Error Handling**: Clear error messages if something goes wrong

---

## Troubleshooting

### "Failed to add product" error?
- ✅ Check that your DEPLOYMENT_ID is correct in `product-admin.service.ts`
- ✅ Make sure the Google Apps Script was deployed as a Web app
- ✅ Verify "Who has access" is set to "Anyone"

### New data not appearing in Google Sheet?
- ✅ Check browser console for errors (F12 → Console)
- ✅ Check Google Apps Script execution logs for errors
- ✅ Refresh the Google Sheet (might be cached)

### CORS errors?
- ✅ The Google Apps Script endpoint should handle CORS
- ✅ If still getting errors, try disabling browser cache

### Script won't execute?
- ✅ Make sure you have a Google account with edit access to the sheet
- ✅ The service account needs read/write permissions

---

## Advanced: Update Existing Products

The service also supports updating existing products:

```typescript
this.adminService.updateProduct(product, sheetName, rowNumber);
```

To use this, you would need to:
1. Fetch the product first
2. Show an edit form
3. Submit the update with the row number

---

## Column Order (Important!)

The Google Sheet columns must be in this exact order:

1. SKU
2. Name
3. Description
4. Subcategory
5. Price
6. Unit
7. Available (TRUE/FALSE)
8. Brand
9. Cost Price
10. Discounted Price
11. Stock Quantity
12. Purchase Date
13. Location
14. Remarks

If your sheet has different column order, update the `HEADERS` array in `google-apps-script.gs`.

---

## Security Note

⚠️ **This form is publicly accessible!** 

If you want to restrict access to only authorized users, you should:
1. Add authentication (Firebase, Auth0, etc.)
2. Add a password/PIN check
3. Use a dedicated admin subdomain with access controls

For now, the form assumes you're the only one with the admin URL.

---

## Next Steps

- 🎨 Customize the form styling in `src/app/features/admin/admin.css`
- 🔐 Add authentication to the admin form
- 📊 Add product editing/deletion features
- 🔔 Add email notifications when products are added

---

For questions or issues, check the console logs and Google Apps Script execution logs!
