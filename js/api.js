// api.js - Google Sheets Backend Connector

// Configuration - REPLACE WITH YOUR DEPLOYED GAS URL
const CONFIG = {
    // URL Injected by User: 
    GAS_URL: 'https://script.google.com/macros/s/AKfycbx0aNNqI2LrRw0jstEkG6jHCAzpKAPTC5JWRD5WQGvuIf9MHwloXC9jOfHY8Z2N8QgWRA/exec',
    POLL_INTERVAL: 60000 // 60s
};

const API = {
    // Generic Fetch Wrapper
    // Note: 'no-cors' mode means we can't read the response in standard fetch if across domains easily without proper GAS headers.
    // However, GAS usually supports CORS if `ContentService` creates TextOutput.
    // For this MVP, we assume the user deploys as "Execute as Me" and "Access: Anyone".
    request: async (action, payload = {}) => {
        if (!CONFIG.GAS_URL) {
            console.warn("MOCK MODE: No Backend URL set.");
            return API.mockResponse(action, payload);
        }

        const url = `${CONFIG.GAS_URL}?action=${action}`;

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { "Content-Type": "text/plain;charset=utf-8" }, // "text/plain" avoids CORS preflight options
                body: JSON.stringify(payload)
            });
            return await response.json();
        } catch (error) {
            console.error("API Error:", error);
            throw error;
        }
    },

    // --- Endpoints ---

    // 1. Get All Data (Queue, Patients, etc) for initial load
    getAllData: () => API.request('getAllData'),

    // 2. Create Patient
    createPatient: (patient) => API.request('createPatient', patient),

    // 3. Create Visit + Studies
    createVisit: (data) => API.request('createVisit', data),

    // 4. Update Study Status
    updateStudyStatus: (id, status) => API.request('updateStudyStatus', { id, status }),

    // 5. Save Report
    saveReport: (data) => API.request('saveReport', data),

    // --- Mock Data Generator (for Dev/Demo when no URL) ---
    mockResponse: (action, payload) => {
        return new Promise(resolve => {
            setTimeout(() => {
                console.log(`[MOCK API] ${action}`, payload);
                if (action === 'getAllData') {
                    resolve({
                        status: 'success',
                        data: MockDB
                    });
                } else {
                    resolve({ status: 'success', data: { id: "MOCK-" + Date.now() } });
                }
            }, 800);
        });
    }
};

// Mock Database Structure
const MockDB = {
    patients: [
        { id: 'PT-101', full_name: 'Ahmed Khaled', dob: '1985-04-12', gender: 'Male', phone: '0599123456' },
        { id: 'PT-102', full_name: 'Sara Nour', dob: '1992-08-23', gender: 'Female', phone: '0599654321' }
    ],
    visits: [
        { id: 'VS-501', patient_id: 'PT-101', status: 'In Progress', check_in_time: '2023-10-27T09:00:00', referrer_doctor: 'Dr. House' }
    ],
    studies: [
        { id: 'ST-901', visit_id: 'VS-501', modality: 'US', region: 'Abdomen', study_name: 'US Abdomen Complete', status: 'Reporting', technician: 'Tech1', created_at: '2023-10-27T09:15:00' },
        { id: 'ST-902', visit_id: 'VS-501', modality: 'XR', region: 'Chest', study_name: 'Chest X-Ray PA', status: 'Waiting', technician: '', created_at: '2023-10-27T09:20:00' }
    ]
};
