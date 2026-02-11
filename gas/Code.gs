/**
 * Radiology Center Backend - Google Apps Script
 * Deploy as Web App -> Execute as Me -> Access: Anyone
 */

const SCRIPT_PROP = PropertiesService.getScriptProperties();

// --- Configuration ---
const CONFIG = {
  DB_ID: SCRIPT_PROP.getProperty('sheet_id') || 'REPLACE_WITH_YOUR_SHEET_ID_HERE', // Set manually or via Setup
  SHEETS: ['Patients', 'Visits', 'Studies', 'Templates', 'Users']
};

// --- Setup Function ---
function setup() {
  const ss = SpreadsheetApp.openById(CONFIG.DB_ID);
  
  // Define Schema
  const schema = {
    'Patients': ['id', 'full_name', 'dob', 'age', 'gender', 'phone', 'diagnosis', 'complaint', 'medical_history', 'allergies', 'created_at'],
    'Visits': ['id', 'patient_id', 'status', 'check_in_time', 'referrer_doctor', 'assigned_doctor_id', 'created_at'],
    'Studies': ['id', 'visit_id', 'modality', 'region', 'study_name', 'price', 'status', 'technician', 'radiologist', 'assigned_doctor_id', 'report_content', 'completed_at', 'image_links', 'created_at'],
    'Templates': ['id', 'modality', 'region', 'title', 'content', 'fields_json', 'is_active', 'created_at'],
    'Users': ['id', 'email', 'full_name', 'role', 'pin', 'created_at']
  };

  Object.keys(schema).forEach(sheetName => {
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
    }
    
    // Check if empty OR invalid schema (Users Migration)
    let shouldInit = false;
    if (sheet.getLastRow() === 0) {
      shouldInit = true;
    } else if (sheetName === 'Users') {
      // Check if header is outdated (starts with 'email' instead of 'id')
      const firstHeader = sheet.getRange(1, 1).getValue();
      if (firstHeader === 'email') {
         sheet.clear(); // Wipe old schema
         shouldInit = true;
      } else {
        // Only for Users? No, do for all below.
      }
    }

    if (shouldInit) {
      sheet.appendRow(schema[sheetName]);
      Logger.log('Created headers for: ' + sheetName);
      
      // Default Admin User
      if (sheetName === 'Users') {
        sheet.appendRow(['USR-ADMIN', 'admin@center.com', 'System Admin', 'Admin', '1234', new Date()]);
      }
    } else {
       // Schema Migration: Append missing columns
      const currentHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      const desiredHeaders = schema[sheetName];
      let newColIndex = sheet.getLastColumn() + 1;
      
      desiredHeaders.forEach(header => {
         if (!currentHeaders.includes(header)) {
            sheet.getRange(1, newColIndex).setValue(header);
            Logger.log('Added missing header: ' + header + ' to ' + sheetName);
            newColIndex++;
         }
      });
    }
  });
}

// --- HTTP Handlers ---

function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  const lock = LockService.getScriptLock();
  lock.tryLock(10000); 

  try {
    const params = e.parameter;
    const action = params.action;
    let payload = null;
    
    // Parse Payload if POST
    if (e.postData && e.postData.contents) {
      try { payload = JSON.parse(e.postData.contents); } catch(err) {} 
    }

    let result = {};

    switch(action) {
      case 'getAllData':
        // Self-Healing: Ensure Users sheet exists before returning
        // Note: In production, consider separating this check or optimizing it.
        // For this app, simply calling 'setup()' (which checks existance) is safe.
        setup(); 
        
        result = getAllData();
        break;
      case 'createPatient':
        result = createRow('Patients', payload, 'PT');
        break;
      case 'createVisit':
        result = createRow('Visits', payload, 'VS');
        break;
      case 'createStudy':
        result = createRow('Studies', payload, 'ST');
        break;
      case 'createUser':
        result = createRow('Users', payload, 'USR');
        break;
      case 'updateStudyStatus':
        // payload: { id, status }
        result = updateRow('Studies', payload.id, { status: payload.status });
        break;
      case 'saveReport':
        // payload: { study_id, content_html, ... }
        result = updateRow('Studies', payload.study_id, { 
          report_content: payload.content_html, 
          status: 'Reported' 
        });
        break;
      case 'markComplete':
        // payload: { study_id }
        result = updateRow('Studies', payload.study_id, { 
          status: 'Completed',
          completed_at: new Date().toISOString()
        });
        break;
      case 'updateImageLinks':
        // payload: { study_id, image_links: [...] }
        result = updateRow('Studies', payload.study_id, { 
          image_links: JSON.stringify(payload.image_links || [])
        });
        break;
      case 'saveTemplate':
        if (payload.id) {
            result = updateRow('Templates', payload.id, payload);
        } else {
            result = createRow('Templates', payload, 'TPL');
        }
        break;
      case 'deleteTemplate':
        result = deleteRow('Templates', payload.id);
        break;
      default:
        result = { status: 'error', message: 'Unknown Action' };
    }

    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (e) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: e.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

// --- database Logic ---

function getAllData() {
  const ss = SpreadsheetApp.openById(CONFIG.DB_ID);
  return {
    status: 'success',
    data: {
      patients: getSheetData(ss, 'Patients'),
      visits: getSheetData(ss, 'Visits'),
      studies: getSheetData(ss, 'Studies'),
      templates: getSheetData(ss, 'Templates'),
      users: getSheetData(ss, 'Users')
    }
  };
}

function getSheetData(ss, sheetName) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0];
  const data = [];
  
  for (let i = 1; i < rows.length; i++) {
    let obj = {};
    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]] = rows[i][c];
    }
    data.push(obj);
  }
  return data;
}

function createRow(sheetName, data, prefix) {
  const ss = SpreadsheetApp.openById(CONFIG.DB_ID);
  const sheet = ss.getSheetByName(sheetName);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  
  // Generate ID if not provided
  if (!data.id) {
    data.id = prefix + "-" + Math.floor(Math.random() * 100000);
  }
  // Ensure date is handled
  if (!data.created_at) {
    data.created_at = new Date();
  }

  // Create Row Array matching headers
  const row = headers.map(h => data[h] || '');
  
  sheet.appendRow(row);
  return { status: 'success', data: { id: data.id } };
}

function updateRow(sheetName, id, updates) {
  const ss = SpreadsheetApp.openById(CONFIG.DB_ID);
  const sheet = ss.getSheetByName(sheetName);
  const data = sheet.getDataRange().getValues();
  
  // Find Row Index (Column A assumed ID)
  let rowIndex = -1;
  for(let i=1; i<data.length; i++) {
    if(String(data[i][0]) === String(id)) {
      rowIndex = i + 1; // 1-based
      break;
    }
  }

  if (rowIndex === -1) return { status: 'error', message: 'ID not found' };

  // Headers
  const headers = data[0];
  
  // Update Columns
  Object.keys(updates).forEach(key => {
    const colIndex = headers.indexOf(key);
    if (colIndex > -1) {
      sheet.getRange(rowIndex, colIndex + 1).setValue(updates[key]);
    }
  });

  return { status: 'success' };
}

function deleteRow(sheetName, id) {
  const ss = SpreadsheetApp.openById(CONFIG.DB_ID);
  const sheet = ss.getSheetByName(sheetName);
  const data = sheet.getDataRange().getValues();
  
  for(let i=1; i<data.length; i++) {
    if(String(data[i][0]) === String(id)) {
      sheet.deleteRow(i + 1);
      return { status: 'success' };
    }
  }
  return { status: 'error', message: 'ID not found' };
}
