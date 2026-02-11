// app.js - Main Controller

const App = {
    state: {
        user: null, // Logged in user
        users: [], // List of users
        patients: [],
        visits: [],
        studies: [], // The main worklist
        currentView: 'reception',
        refreshTimer: null
    },

    // --- Initialization ---
    init: async () => {
        console.log("App Initializing...");

        // 1. Load Data (Users, etc) - BEFORE showing any UI
        await App.loadData();

        // 2. User Session Check - MUST happen before navigation
        const savedUserJSON = localStorage.getItem('rad_user');
        if (savedUserJSON) {
            try {
                const savedUser = JSON.parse(savedUserJSON);
                // Don't auto-login. Just remember WHO specific user was.
                // Trigger Re-Login Flow
                App.controllers.auth.showRelogin(savedUser);
            } catch (e) {
                console.error("Invalid saved user", e);
                localStorage.removeItem('rad_user');
                App.controllers.auth.showLogin();
            }
        } else {
            // No user - show login immediately, don't navigate
            App.controllers.auth.showLogin();
        }

        // 3. Start Polling (Disabled)
        // App.startPolling(); 
    },

    loadData: async (silent = false) => {
        if (!silent) App.ui.showLoading(true);
        try {
            const response = await API.getAllData();
            if (response.status === 'success') {
                const newInfo = response.data;

                // Update State
                App.state.patients = newInfo.patients || [];
                App.state.visits = newInfo.visits || [];
                App.state.studies = newInfo.studies || [];
                App.state.users = newInfo.users || []; // Added Users

                // Refresh Views
                if (!silent) {
                    App.router.navigate(App.state.currentView);
                    App.controllers.auth.populateLoginDropdown(); // Ensure dropdown is up to date
                }
            }
        } catch (e) {
            console.error("Load Failed", e);
            if (!silent) alert("Failed to sync. Check connection.");
        } finally {
            if (!silent) App.ui.showLoading(false);
        }
    },

    startPolling: () => {
        if (App.state.refreshTimer) clearInterval(App.state.refreshTimer);
        App.state.refreshTimer = setInterval(() => {
            console.log("Polling...");
            App.loadData(true); // Silent reload
        }, 15000); // Poll every 15s instead of 30s for faster Feeling
    },

    // --- UI Logic ---
    ui: {
        showLoading: (show) => {
            const el = document.getElementById('loading-overlay');
            if (el) {
                if (show) {
                    el.classList.remove('opacity-0', 'pointer-events-none');
                } else {
                    el.classList.add('opacity-0', 'pointer-events-none');
                }
            } else {
                console.warn("Loading overlay not found in DOM");
            }
        },

        renderPage: (pageId, contentHTML) => {
            document.getElementById('app-content').innerHTML = contentHTML;
            // Update Nav State (Desktop & Mobile)
            document.querySelectorAll('.nav-btn').forEach(b => {
                b.classList.remove('active');
                if (b.dataset.page === pageId) {
                    b.classList.add('active');
                }
            });
        },

        updateUserDisplay: () => {
            const user = App.state.user;
            const nameEl = document.getElementById('user-name');
            const roleEl = document.getElementById('user-role');
            const loginModal = document.getElementById('login-modal');

            if (user) {
                if (nameEl) nameEl.textContent = user.full_name;
                if (roleEl) roleEl.textContent = user.role;
                if (loginModal) loginModal.classList.add('hidden');

                // Show Logout
                // Could add a logout button visibility toggle here if needed
            } else {
                if (nameEl) nameEl.textContent = '';
                if (roleEl) roleEl.textContent = '';
                if (loginModal) loginModal.classList.remove('hidden');
            }

            // Update navigation visibility based on role
            App.ui.renderNavigation();
        },

        renderNavigation: () => {
            const user = App.state.user;
            if (!user) return;

            const allowedPages = App.rbac.getAllowedPages(user.role);

            // Define all navigation buttons with their page IDs
            const navButtons = [
                { page: 'reception', selector: '[data-page="reception"]' },
                { page: 'technician', selector: '[data-page="technician"]' },
                { page: 'radiologist', selector: '[data-page="radiologist"]' },
                { page: 'admin', selector: '[data-page="admin"]' }
            ];

            // Show/hide buttons based on permissions
            navButtons.forEach(btn => {
                const elements = document.querySelectorAll(btn.selector);
                elements.forEach(el => {
                    if (allowedPages.includes(btn.page)) {
                        el.style.display = '';
                    } else {
                        el.style.display = 'none';
                    }
                });
            });
        }
    },

    // --- RBAC Configuration ---
    rbac: {
        permissions: {
            'Reception': ['reception'],
            'Technician': ['technician'],
            'Radiologist': ['reception', 'technician', 'radiologist'],
            'Admin': ['reception', 'technician', 'radiologist', 'admin'],
            'Patient': ['patient-portal']
        },

        canAccess: (role, page) => {
            const allowed = App.rbac.permissions[role] || [];
            return allowed.includes(page);
        },

        getDefaultPage: (role) => {
            const pages = App.rbac.permissions[role] || ['reception'];
            return pages[0];
        },

        getAllowedPages: (role) => {
            return App.rbac.permissions[role] || [];
        },

        hasPermission: (action) => {
            const user = App.state.user;
            if (!user) return false;

            // Define action permissions
            const actionPermissions = {
                'createVisit': ['Reception', 'Admin'],
                'createPatient': ['Reception', 'Admin'],
                'startScan': ['Technician', 'Admin'],
                'completeScan': ['Technician', 'Admin'],
                'writeReport': ['Radiologist', 'Admin'],
                'markComplete': ['Radiologist', 'Admin'],
                'manageUsers': ['Admin'],
                'viewAllPatients': ['Radiologist', 'Admin']
            };

            const allowed = actionPermissions[action] || [];
            return allowed.includes(user.role);
        }
    },

    // --- Router ---
    router: {
        init: () => {
            const user = App.state.user;
            if (!user) return;

            // Navigate to default page for user's role
            const defaultPage = App.rbac.getDefaultPage(user.role);
            App.router.navigate(defaultPage);
        },

        navigate: (page) => {
            const user = App.state.user;

            // Strict Navigation Guard
            if (!user) {
                App.controllers.auth.showLogin();
                return;
            }

            // RBAC Check - Enforce role-based access
            if (!App.rbac.canAccess(user.role, page)) {
                console.warn(`Access denied: ${user.role} cannot access ${page}`);
                // Redirect to default page for this role
                const defaultPage = App.rbac.getDefaultPage(user.role);
                if (page !== defaultPage) {
                    App.router.navigate(defaultPage);
                }
                return;
            }

            App.state.currentView = page;

            // Hide all pages first? RenderPage handles content replacement so it's fine.

            switch (page) {
                case 'reception':
                    App.controllers.reception.render();
                    break;
                case 'technician':
                    App.controllers.technician.render();
                    break;
                case 'radiologist':
                    App.controllers.radiologist.render();
                    break;
                case 'admin':
                    App.controllers.admin.render();
                    break;
                case 'patient-portal':
                    App.controllers.patientPortal.render();
                    break;
            }

            // Update Nav Visibility based on Role
            if (user.role === 'Patient') {
                document.querySelector('nav').classList.add('hidden'); // Hide main nav for patients
            } else {
                document.querySelector('nav').classList.remove('hidden');
            }
        }
    },

    // --- Controllers ---
    controllers: {
        auth: {
            mode: 'staff', // staff | patient

            showLogin: () => {
                const modal = document.getElementById('login-modal');
                if (modal) modal.classList.remove('hidden');
                App.controllers.auth.populateLoginDropdown();
                App.controllers.auth.switchLogin('staff'); // Default
            },

            populateLoginDropdown: () => {
                const select = document.getElementById('login-user');
                if (!select) return;
                const users = App.state.users;
                if (!users || users.length === 0) {
                    select.innerHTML = '<option>No users found (Syncing...)</option>';
                    return;
                }
                select.innerHTML = '<option value="">Select User...</option>' +
                    users.map(u => `<option value="${u.id}">${u.full_name} (${u.role})</option>`).join('');
            },

            switchLogin: (mode) => {
                App.controllers.auth.mode = mode;

                // Reset any specific "Re-login" state
                const userSelect = document.getElementById('login-user');
                if (userSelect) {
                    userSelect.disabled = false;
                    userSelect.value = "";
                }
                const greeting = document.getElementById('login-greeting');
                if (greeting) greeting.classList.add('hidden');

                // Toggle Buttons
                const btnStaff = document.getElementById('btn-login-staff');
                const btnPatient = document.getElementById('btn-login-patient');

                if (mode === 'staff') {
                    if (btnStaff) btnStaff.className = "px-4 py-2 rounded-lg font-bold text-sm bg-brand-100 text-brand-700 ring-2 ring-brand-500";
                    if (btnPatient) btnPatient.className = "px-4 py-2 rounded-lg font-bold text-sm text-slate-500 hover:bg-slate-100";
                    document.getElementById('form-staff')?.classList.remove('hidden');
                    document.getElementById('form-patient')?.classList.add('hidden');
                    const sub = document.getElementById('login-subtitle');
                    if (sub) sub.textContent = "Radiology Center System";
                    const icon = document.getElementById('login-icon');
                    if (icon) icon.className = "fa-solid fa-user-shield";
                } else {
                    if (btnStaff) btnStaff.className = "px-4 py-2 rounded-lg font-bold text-sm text-slate-500 hover:bg-slate-100";
                    if (btnPatient) btnPatient.className = "px-4 py-2 rounded-lg font-bold text-sm bg-emerald-100 text-emerald-700 ring-2 ring-emerald-500";
                    document.getElementById('form-staff')?.classList.add('hidden');
                    document.getElementById('form-patient')?.classList.remove('hidden');
                    const sub = document.getElementById('login-subtitle');
                    if (sub) sub.textContent = "Patient Portal";
                    const icon = document.getElementById('login-icon');
                    if (icon) icon.className = "fa-solid fa-hospital-user";
                }
            },

            showRelogin: (savedUser) => {
                const modal = document.getElementById('login-modal');
                if (modal) modal.classList.remove('hidden');

                // Ensure dropdown is populated (might need to wait for dataload?) 
                // App.loadData happens before this, so we should be good IF users loaded.
                // If offline or first load fail, might be issue.
                // Let's assume users loaded.
                App.controllers.auth.populateLoginDropdown();

                // Select the user
                const select = document.getElementById('login-user');
                if (select) {
                    select.value = savedUser.id;
                    select.disabled = false; // Allow switching
                }

                // Hide Greeting if present
                const greeting = document.getElementById('login-greeting');
                if (greeting) greeting.classList.add('hidden');

                // Set Mode to Staff (force)
                App.controllers.auth.switchLogin('staff');
                // Focus PIN
                setTimeout(() => document.getElementById('login-pin').focus(), 100);
            },

            login: (type) => {
                if (type === 'staff') {
                    const userId = document.getElementById('login-user').value;
                    const pin = document.getElementById('login-pin').value;

                    if (!userId) return alert("Select a user");

                    const user = App.state.users.find(u => u.id === userId);

                    if (user && String(user.pin) === pin) {
                        App.state.user = user;
                        localStorage.setItem('rad_user', JSON.stringify(user));
                        App.ui.updateUserDisplay();
                        document.getElementById('login-pin').value = '';

                        // Clean up re-login UI artifacts
                        const select = document.getElementById('login-user');
                        if (select) select.disabled = false;
                        const greeting = document.getElementById('login-greeting');
                        if (greeting) greeting.classList.add('hidden');

                        // Navigate based on role (Strict Redirects)
                        if (user.role === 'Technician') App.router.navigate('technician');
                        else if (user.role === 'Reception') App.router.navigate('reception');
                        else if (user.role === 'Radiologist') App.router.navigate('radiologist');
                        else App.router.navigate('admin'); // Admin default?

                    } else {
                        console.warn(`Login failed.`);
                        alert("Invalid PIN. Please try again.");
                    }
                } else if (type === 'patient') {
                    const phone = document.getElementById('login-patient-phone').value.trim();
                    const pass = document.getElementById('login-patient-pin').value.trim();

                    if (!phone || !pass) return alert("Enter Phone and Passcode");

                    // Find Patient
                    // Normalize phone? For now exact match
                    const patient = App.state.patients.find(p => p.phone === phone);

                    if (!patient) return alert("Patient not found with this phone number.");

                    // Verify Passcode: First 3 letters of Name (Case Insensitive) + Phone
                    // Name: "Ahmed Ali" -> "AHM"
                    const namePart = patient.full_name.substring(0, 3).toUpperCase();
                    const expectedPass = namePart + phone; // Note: Ensure phone matches stored format

                    if (pass.toUpperCase() === expectedPass) {
                        // Create Session User for Patient
                        const sessionUser = {
                            id: patient.id,
                            full_name: patient.full_name,
                            role: 'Patient',
                            phone: patient.phone
                        };

                        App.state.user = sessionUser;
                        localStorage.setItem('rad_user', JSON.stringify(sessionUser)); // Still verify if we want to remember patients? user request implied staff mostly.
                        // For consistency, let's allow it, but re-login flow for patient might need tweaking.
                        // Actually, request said "user account who entered... stay at same account but onley request password"
                        // Patient auth is different (Phone + PIN). 
                        // For now, let's keep patient session behavior standard (maybe auto-login or just require full re-entry).
                        // Let's stick to auto-remembering staff primarily for this task.

                        App.ui.updateUserDisplay();

                        document.getElementById('login-patient-phone').value = '';
                        document.getElementById('login-patient-pin').value = '';

                        App.router.navigate('patient-portal');
                    } else {
                        alert("Invalid Passcode. Format: First 3 letters of Name + Phone (e.g. AHM0123...)");
                    }
                }
            },

            logout: () => {
                App.state.user = null;
                localStorage.removeItem('rad_user');
                location.reload();
            }
        },

        reception: {
            tempQueue: [], // Store studies before saving
            calendarMode: false, // Toggle between list and calendar view
            selectedDate: new Date().toISOString().split('T')[0], // Default to today

            render: () => {
                if (App.controllers.reception.calendarMode) {
                    App.controllers.reception.renderCalendarView();
                } else {
                    App.controllers.reception.renderListView();
                }
            },

            changeDate: (dateStr) => {
                App.controllers.reception.selectedDate = dateStr;
                App.controllers.reception.render();
            },

            renderListView: () => {

                const studies = App.state.studies;
                const selectedDate = App.controllers.reception.selectedDate || new Date().toISOString().split('T')[0];

                // Filter waiting by selected date
                // Note: waiting studies don't have a specific date, but their parent visit does.
                // We need to look up the visit for each study.
                const waiting = studies.filter(s => {
                    if (s.status !== 'Waiting') return false;
                    const visit = App.state.visits.find(v => v.id === s.visit_id);
                    if (!visit) return false;
                    // Check if visit date matches selected date
                    // visit.check_in_time format is ISO string or YYYY-MM-DDTHH:MM
                    return visit.check_in_time.startsWith(selectedDate);
                });

                // Sort waiting by time
                waiting.sort((a, b) => {
                    const va = App.state.visits.find(v => v.id === a.visit_id);
                    const vb = App.state.visits.find(v => v.id === b.visit_id);
                    return new Date(va.check_in_time) - new Date(vb.check_in_time);
                });

                // Date Navigation Helpers
                const dateObj = new Date(selectedDate);
                const prevDate = new Date(dateObj); prevDate.setDate(prevDate.getDate() - 1);
                const nextDate = new Date(dateObj); nextDate.setDate(nextDate.getDate() + 1);

                const prevDateStr = prevDate.toISOString().split('T')[0];
                const nextDateStr = nextDate.toISOString().split('T')[0];
                const isToday = selectedDate === new Date().toISOString().split('T')[0];

                const canEdit = ['Reception', 'Admin', 'Radiologist'].includes(App.state.user.role);
                const newBtn = canEdit ? `<button onclick="App.controllers.reception.openNewVisitModal()" class="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg shadow-md shadow-brand-500/20 transition-all font-bold text-sm flex items-center gap-2"><i class="fa-solid fa-plus"></i> New Visit</button>` : '';

                const calendarToggle = `
                    <button onclick="App.controllers.reception.toggleCalendar()" 
                        class="px-4 py-2 ${App.controllers.reception.calendarMode ? 'bg-brand-600 text-white' : 'bg-white text-slate-700 border border-slate-200'} rounded-lg text-sm font-bold hover:shadow-md transition-all">
                        <i class="fa-solid fa-${App.controllers.reception.calendarMode ? 'list' : 'calendar'} mr-2"></i>
                        ${App.controllers.reception.calendarMode ? 'List View' : 'Overview'}
                    </button>
                `;

                const html = `
                    <div class="h-full flex flex-col p-6 gap-6">
                        <!-- Action Bar -->
                        <div class="flex flex-col md:flex-row justify-between items-center gap-4 shrink-0">
                            <div>
                                <h2 class="text-3xl font-display font-bold text-slate-800">Reception Desk</h2>
                                <p class="text-slate-500 text-sm">Manage patient visits and imaging queues</p>
                            </div>
                            
                            <!-- Search & Actions -->
                            <div class="flex items-center gap-3 w-full md:w-auto">
                                <div class="relative flex-1 md:w-72">
                                    <i class="fa-solid fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"></i>
                                    <input type="text" id="patient-search" onkeyup="App.controllers.reception.searchPatients(this.value)" 
                                        class="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-500 shadow-sm"
                                        placeholder="Search patient by name or phone...">
                                    <!-- Search Results Dropdown -->
                                    <div id="search-results" class="absolute top-full left-0 right-0 bg-white shadow-xl rounded-xl border border-slate-100 mt-2 hidden z-20 max-h-60 overflow-y-auto"></div>
                                </div>

                                ${calendarToggle}
                                ${newBtn}
                            </div>
                        </div>

                        <!-- Date Navigation -->
                         <div class="flex items-center justify-between bg-white p-2 rounded-xl border border-slate-200 shadow-sm shrink-0">
                            <button onclick="App.controllers.reception.changeDate('${prevDateStr}')" class="p-2 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-brand-600 transition-colors">
                                <i class="fa-solid fa-chevron-left"></i>
                            </button>
                            
                            <div class="flex items-center gap-2">
                                <i class="fa-solid fa-calendar-day text-brand-500"></i>
                                <input type="date" value="${selectedDate}" onchange="App.controllers.reception.changeDate(this.value)" 
                                    class="bg-transparent border-none font-bold text-slate-700 outline-none focus:ring-0 cursor-pointer">
                                ${isToday ? '<span class="px-2 py-0.5 bg-brand-100 text-brand-700 text-xs font-bold rounded-full">Today</span>' : ''}
                            </div>

                            <button onclick="App.controllers.reception.changeDate('${nextDateStr}')" class="p-2 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-brand-600 transition-colors">
                                <i class="fa-solid fa-chevron-right"></i>
                            </button>
                        </div>

                        <!-- Content Grid -->
                        <div class="flex-1 overflow-hidden flex flex-col">
                            <!-- Waiting List (Full Width) -->
                            <div class="glass-panel p-6 overflow-hidden flex flex-col flex-1 shadow-lg shadow-slate-200/50">
                                <div class="flex justify-between items-center mb-4">
                                    <h3 class="font-bold text-slate-700 uppercase text-xs flex items-center tracking-wider">
                                        <i class="fa-regular fa-clock mr-2 text-brand-500 text-lg"></i> Waiting Room (${waiting.length})
                                    </h3>
                                    <span class="text-xs text-slate-400 font-bold">${isToday ? "TODAY'S QUEUE" : dateObj.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()}</span>
                                </div>
                                
                                <div class="overflow-y-auto flex-1 space-y-3 px-1 pb-2">
                                    ${waiting.map(s => App.components.studyCard(s)).join('')}
                                    ${waiting.length === 0 ? `
                                        <div class="flex flex-col items-center justify-center h-full text-slate-400">
                                            <div class="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-3">
                                                <i class="fa-solid fa-check text-2xl text-slate-300"></i>
                                            </div>
                                            <p class="font-medium">All caught up!</p>
                                            <p class="text-xs">No patients waiting for this date.</p>
                                        </div>
                                    ` : ''}
                                </div>
                            </div>
                        </div>
                    </div>
                `;
                App.ui.renderPage('reception', html);
            },

            searchPatients: (query) => {
                const res = document.getElementById('search-results');
                if (!query || query.length < 2) {
                    res.classList.add('hidden');
                    return;
                }

                const matches = App.state.patients.filter(p => p.full_name.toLowerCase().includes(query.toLowerCase()) || p.phone.includes(query));

                res.innerHTML = matches.map(p => `
                    <div onclick="App.controllers.reception.openPatientFile('${p.id}')" class="px-4 py-3 hover:bg-slate-50 cursor-pointer border-b border-slate-100 last:border-0">
                        <p class="font-bold text-sm text-slate-800">${p.full_name}</p>
                        <p class="text-[10px] text-slate-400">DOB: ${p.dob.split('T')[0]} | ${p.phone}</p>
                    </div>
                `).join('') || '<div class="p-3 text-center text-xs text-slate-400">No matches found.</div>';

                res.classList.remove('hidden');
            },

            openPatientFile: (patientId) => {
                const patient = App.state.patients.find(p => p.id === patientId);
                if (!patient) return;

                // Hide search dropdown
                document.getElementById('search-results')?.classList.add('hidden');
                document.getElementById('patient-search').value = '';

                // Populate Header
                // Populate Header
                document.getElementById('pf-name').textContent = patient.full_name;
                document.getElementById('pf-info').textContent = `${patient.dob.split('T')[0]} | ${patient.gender} | ${patient.phone}`;

                // Populate Clinical Profile
                let age = patient.age;
                if (!age && patient.dob) {
                    const birthDate = new Date(patient.dob);
                    const today = new Date();
                    age = today.getFullYear() - birthDate.getFullYear();
                    const m = today.getMonth() - birthDate.getMonth();
                    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
                        age--;
                    }
                }
                document.getElementById('pf-age').textContent = age || '--';
                document.getElementById('pf-complaint').textContent = patient.complaint || '--';
                document.getElementById('pf-diagnosis').textContent = patient.diagnosis || '--';
                document.getElementById('pf-history').textContent = patient.medical_history || '--';

                // Populate History
                const visits = App.state.visits.filter(v => v.patient_id === patientId);
                visits.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)); // Recent first

                const list = document.getElementById('pf-history-list');

                if (visits.length === 0) {
                    list.innerHTML = '<div class="text-center text-slate-400 py-10">No history found.</div>';
                } else {
                    list.innerHTML = visits.map(v => {
                        const vStudies = App.state.studies.filter(s => s.visit_id === v.id);
                        return `
                        <div class="bg-white border-l-4 border-brand-500 rounded-r-lg shadow-sm p-4">
                            <div class="flex justify-between items-start mb-2">
                                <div>
                                    <p class="text-xs font-bold text-slate-400 uppercase">${new Date(v.check_in_time).toLocaleDateString()} at ${new Date(v.check_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                    <p class="text-sm font-bold text-slate-800">Referrer: ${v.referrer_doctor || 'Self'}</p>
                                </div>
                                <span class="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider">${v.status || 'Done'}</span>
                            </div>
                            
                            <div class="space-y-2 mt-3">
                                ${vStudies.map(s => {
                            const ready = s.status === 'Reported'; // Assuming 'Reported' status means done, or use check logic
                            const reportBtn = s.report_content ?
                                `<button onclick="App.controllers.reception.viewReport('${s.id}')" class="text-brand-600 hover:underline text-xs font-bold"><i class="fa-solid fa-file-lines mr-1"></i> View Report</button>` :
                                `<span class="text-slate-400 text-xs italic">No report yet</span>`;

                            return `
                                    <div class="flex justify-between items-center bg-slate-50 px-3 py-2 rounded-lg text-sm">
                                        <div>
                                            <span class="font-bold text-slate-700">${s.modality}</span> <span class="text-slate-600">${s.study_name}</span>
                                        </div>
                                        <div>${reportBtn}</div>
                                    </div>
                                    `
                        }).join('')}
                            </div>
                        </div>
                        `;
                    }).join('');
                }

                document.getElementById('patient-file-modal').classList.remove('hidden');
            },

            closePatientFile: () => {
                document.getElementById('patient-file-modal').classList.add('hidden');
            },

            openRecentVisitsModal: () => {
                const modal = document.getElementById('recent-visits-modal');
                if (!modal) return;

                modal.classList.remove('hidden');

                // Get recent visits (last 20)
                const recentVisits = App.helpers.getRecentVisits(20);
                const list = document.getElementById('recent-visits-list');

                if (recentVisits.length === 0) {
                    list.innerHTML = '<div class="text-center text-slate-400 py-10">No recent visits found.</div>';
                } else {
                    list.innerHTML = recentVisits.map(v => {
                        const patient = App.state.patients.find(p => p.id === v.patient_id);
                        const vStudies = App.state.studies.filter(s => s.visit_id === v.id);
                        const doctor = App.state.users.find(u => u.id === v.assigned_doctor_id);

                        return `
                        <div class="bg-white border-l-4 border-brand-500 rounded-r-lg shadow-sm p-4 hover:shadow-md transition-shadow">
                            <div class="flex justify-between items-start mb-3">
                                <div class="flex-1">
                                    <h4 class="font-bold text-slate-800 text-lg">${patient ? patient.full_name : 'Unknown Patient'}</h4>
                                    <div class="flex flex-wrap gap-3 mt-1 text-xs text-slate-500">
                                        <span><i class="fa-solid fa-calendar mr-1"></i>${new Date(v.check_in_time).toLocaleDateString()}</span>
                                        <span><i class="fa-solid fa-clock mr-1"></i>${new Date(v.check_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                        ${patient ? `<span><i class="fa-solid fa-phone mr-1"></i>${patient.phone}</span>` : ''}
                                        ${v.referrer_doctor ? `<span><i class="fa-solid fa-user-doctor mr-1"></i>Ref: ${v.referrer_doctor}</span>` : ''}
                                        ${doctor ? `<span><i class="fa-solid fa-stethoscope mr-1"></i>Assigned: ${doctor.full_name}</span>` : ''}
                                    </div>
                                </div>
                                <span class="bg-slate-100 text-slate-600 px-3 py-1 rounded-lg text-xs uppercase font-bold tracking-wider">${v.status || 'Done'}</span>
                            </div>
                            
                            <div class="space-y-2">
                                <p class="text-xs font-bold text-slate-500 uppercase mb-2"><i class="fa-solid fa-microscope mr-1"></i>Studies (${vStudies.length})</p>
                                ${vStudies.map(s => {
                            const statusColor = {
                                'Waiting': 'bg-amber-100 text-amber-700',
                                'Scanning': 'bg-blue-100 text-blue-700',
                                'Reporting': 'bg-purple-100 text-purple-700',
                                'Ready': 'bg-green-100 text-green-700',
                                'Reported': 'bg-green-100 text-green-700'
                            }[s.status] || 'bg-slate-100 text-slate-700';

                            const reportBtn = s.report_content ?
                                `<button onclick="App.controllers.reception.viewReport('${s.id}')" class="text-brand-600 hover:underline text-xs font-bold"><i class="fa-solid fa-file-lines mr-1"></i> View Report</button>` :
                                `<span class="text-slate-400 text-xs italic">No report yet</span>`;

                            return `
                                    <div class="flex justify-between items-center bg-slate-50 px-3 py-2 rounded-lg">
                                        <div class="flex items-center gap-3 flex-1">
                                            <div class="w-8 h-8 rounded-full bg-white flex items-center justify-center font-bold text-slate-600 text-xs border border-slate-200">
                                                ${s.modality}
                                            </div>
                                            <div>
                                                <p class="font-bold text-slate-700 text-sm">${s.study_name}</p>
                                                <p class="text-xs text-slate-400">${s.region || 'N/A'}</p>
                                            </div>
                                        </div>
                                        <div class="flex items-center gap-3">
                                            <span class="px-2 py-1 rounded text-xs font-bold uppercase ${statusColor}">${s.status}</span>
                                            ${reportBtn}
                                        </div>
                                    </div>
                                    `;
                        }).join('')}
                            </div>
                            
                            ${patient ? `
                            <button onclick="App.controllers.reception.openPatientFile('${patient.id}'); App.controllers.reception.closeRecentVisitsModal();" 
                                class="mt-3 w-full py-2 bg-brand-50 text-brand-700 rounded-lg text-sm font-bold hover:bg-brand-100 transition-colors">
                                <i class="fa-solid fa-folder-open mr-2"></i>View Full Patient File
                            </button>
                            ` : ''}
                        </div>
                        `;
                    }).join('');
                }
            },

            closeRecentVisitsModal: () => {
                const modal = document.getElementById('recent-visits-modal');
                if (modal) modal.classList.add('hidden');
            },

            toggleCalendar: () => {
                App.controllers.reception.calendarMode = !App.controllers.reception.calendarMode;
                App.controllers.reception.render();
            },

            renderCalendarView: () => {
                // Get current week (7 days starting from today)
                const today = new Date();
                const weekDays = [];
                for (let i = 0; i < 7; i++) {
                    const date = new Date(today);
                    date.setDate(today.getDate() + i);
                    weekDays.push(date);
                }

                // Group visits by date
                const visitsByDate = {};
                App.state.visits.forEach(v => {
                    const visitDate = new Date(v.check_in_time).toDateString();
                    if (!visitsByDate[visitDate]) visitsByDate[visitDate] = [];
                    visitsByDate[visitDate].push(v);
                });

                const canEdit = ['Reception', 'Admin', 'Radiologist'].includes(App.state.user.role);
                const newBtn = canEdit ? `<button onclick="App.controllers.reception.openNewVisitModal()" class="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg shadow-md shadow-brand-500/20 transition-all font-bold text-sm flex items-center gap-2"><i class="fa-solid fa-plus"></i> New Visit</button>` : '';

                const calendarToggle = `
                    <button onclick="App.controllers.reception.toggleCalendar()" 
                        class="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-bold hover:shadow-md transition-all">
                        <i class="fa-solid fa-list mr-2"></i> List View
                    </button>
                `;

                const html = `
                    <div class="h-full flex flex-col p-6 gap-6">
                        <!-- Action Bar -->
                        <div class="flex justify-between items-center">
                            <h2 class="text-2xl font-display font-bold text-slate-800">
                                <i class="fa-solid fa-calendar mr-2"></i> Weekly Schedule
                            </h2>
                            <div class="flex gap-3">
                                ${calendarToggle}
                                ${newBtn}
                            </div>
                        </div>

                        <!-- Calendar Grid -->
                        <div class="flex-1 grid grid-cols-7 gap-4 overflow-y-auto">
                            ${weekDays.map(date => {
                    const dateStr = date.toDateString();
                    const visits = visitsByDate[dateStr] || [];
                    const isToday = dateStr === today.toDateString();

                    // Get unique doctors for this day
                    const doctors = [...new Set(visits.map(v => {
                        const doc = App.state.users.find(u => u.id === v.assigned_doctor_id);
                        return doc ? doc.full_name : 'Unassigned';
                    }))];

                    return `
                                    <div class="glass-panel p-4 flex flex-col ${isToday ? 'ring-2 ring-brand-500' : ''}">
                                        <div class="text-center mb-3">
                                            <p class="text-xs font-bold text-slate-500 uppercase">${date.toLocaleDateString('en-US', { weekday: 'short' })}</p>
                                            <p class="text-2xl font-bold ${isToday ? 'text-brand-600' : 'text-slate-800'}">${date.getDate()}</p>
                                            <p class="text-xs text-slate-400">${date.toLocaleDateString('en-US', { month: 'short' })}</p>
                                        </div>
                                        
                                        <div class="flex-1 space-y-2">
                                            ${visits.length > 0 ? `
                                                <div class="bg-brand-50 rounded-lg p-2 text-center">
                                                    <p class="text-lg font-bold text-brand-700">${visits.length}</p>
                                                    <p class="text-xs text-brand-600">Patient${visits.length > 1 ? 's' : ''}</p>
                                                </div>
                                                <div class="text-xs space-y-1">
                                                    ${doctors.slice(0, 2).map(d => `
                                                        <div class="bg-slate-100 rounded px-2 py-1 text-slate-700 truncate">
                                                            <i class="fa-solid fa-user-doctor mr-1"></i> ${d}
                                                        </div>
                                                    `).join('')}
                                                    ${doctors.length > 2 ? `<p class="text-slate-400 text-center">+${doctors.length - 2} more</p>` : ''}
                                                </div>
                                            ` : `
                                                <div class="text-center text-slate-300 py-4">
                                                    <i class="fa-regular fa-calendar-xmark text-2xl"></i>
                                                    <p class="text-xs mt-1">No visits</p>
                                                </div>
                                            `}
                                        </div>
                                        
                                        ${visits.length > 0 ? `
                                            <button onclick="App.controllers.reception.viewDayDetails('${dateStr}')" 
                                                class="mt-3 w-full py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50">
                                                View Details
                                            </button>
                                        ` : ''}
                                    </div>
                                `;
                }).join('')}
                        </div>
                    </div>
                `;
                App.ui.renderPage('reception', html);
            },

            viewDayDetails: (dateStr) => {
                // Switch back to list view and filter by date
                App.controllers.reception.selectedDate = dateStr; // Set date filter
                App.controllers.reception.calendarMode = false;   // Switch to list view
                App.controllers.reception.render();
            },

            // --- New Visit Modal ---
            openNewVisitModal: () => {
                const modal = document.getElementById('new-visit-modal');
                modal.classList.remove('hidden');

                // Populate Patient Select
                const select = document.getElementById('visit-patient-select');
                select.innerHTML = '<option value="">Select Existing Patient...</option>' +
                    App.state.patients.map(p => `<option value="${p.id}">${p.full_name}</option>`).join('');

                // Populate Doctor Select (Radiologists only)
                const doctorSelect = document.getElementById('visit-assigned-doctor');
                const radiologists = App.state.users.filter(u => u.role === 'Radiologist');
                doctorSelect.innerHTML = '<option value="">Select Doctor...</option>' +
                    radiologists.map(d => `<option value="${d.id}">${d.full_name}</option>`).join('');

                // Reset Fields
                // document.getElementById('visit-referrer').value = ''; // Removed
                document.getElementById('visit-date').value = new Date().toISOString().slice(0, 16);
                App.controllers.reception.tempQueue = [];
                App.controllers.reception.renderStudyQueue();
            },

            closeModal: () => {
                document.getElementById('new-visit-modal').classList.add('hidden');
            },

            addStudyToQueue: () => {
                const mod = document.getElementById('study-modality').value;
                const reg = document.getElementById('study-region').value;
                const name = document.getElementById('study-name').value;
                if (!reg || !name) return alert("Please enter region and study name");

                App.controllers.reception.tempQueue.push({ modality: mod, region: reg, study_name: name });
                App.controllers.reception.renderStudyQueue();

                // Clear inputs
                document.getElementById('study-region').value = '';
                document.getElementById('study-name').value = '';
            },

            renderStudyQueue: () => {
                const container = document.getElementById('study-queue-preview');
                container.innerHTML = App.controllers.reception.tempQueue.map((s, i) => `
                    <div class="flex justify-between items-center bg-slate-100 px-3 py-2 rounded-lg text-sm">
                        <span><b>${s.modality}</b> ${s.study_name}</span>
                        <button onclick="App.controllers.reception.removeStudy(${i})" class="text-red-400 hover:text-red-600"><i class="fa-solid fa-trash"></i></button>
                    </div>
                `).join('');
            },

            removeStudy: (index) => {
                App.controllers.reception.tempQueue.splice(index, 1);
                App.controllers.reception.renderStudyQueue();
            },

            saveVisit: async () => {
                // Permission check
                if (!App.rbac.hasPermission('createVisit')) {
                    return alert("Access Denied: You don't have permission to create visits.");
                }

                const patientId = document.getElementById('visit-patient-select').value;
                const assignedDoctorId = document.getElementById('visit-assigned-doctor').value;

                if (!patientId) return alert("Select a patient");
                if (!assignedDoctorId) return alert("Select a doctor");
                if (App.controllers.reception.tempQueue.length === 0) return alert("Add at least one study");

                // --- OPTIMISTIC UI START ---
                // 1. Generate IDs Locally
                const visitId = App.helpers.generateId('VS');
                const visitData = {
                    id: visitId,
                    patient_id: patientId,
                    referrer_doctor: '', // Was document.getElementById('visit-referrer').value
                    check_in_time: document.getElementById('visit-date').value,
                    assigned_doctor_id: assignedDoctorId,
                    status: 'In Progress',
                    created_at: new Date().toISOString()
                };

                // 2. Update Local State Immediately
                App.state.visits.push(visitData);

                const newStudies = App.controllers.reception.tempQueue.map(s => ({
                    id: App.helpers.generateId('ST'),
                    visit_id: visitId,
                    modality: s.modality,
                    region: s.region,
                    study_name: s.study_name,
                    assigned_doctor_id: assignedDoctorId, // Inherit from visit
                    price: 0,
                    status: 'Waiting',
                    created_at: new Date().toISOString()
                }));
                App.state.studies.push(...newStudies);

                // 3. Render UI & Close Modal Logic
                App.controllers.reception.closeModal();
                App.router.navigate('reception'); // Refresh view

                // Show Success Toast
                const toast = document.createElement('div');
                toast.className = 'fixed bottom-4 right-4 bg-slate-800 text-white px-4 py-2 rounded-lg shadow-lg z-[100] animate-fade-in flex items-center gap-2';
                toast.innerHTML = '<i class="fa-solid fa-cloud-arrow-up animate-pulse"></i> Saving in background...';
                document.body.appendChild(toast);
                setTimeout(() => toast.remove(), 3000);

                // 4. Background Sync (Fire & Forget)
                API.createVisit(visitData).then(() => {
                    return Promise.all(newStudies.map(s => API.request('createStudy', s)));
                }).then(() => {
                    console.log("Background Sync Complete");
                }).catch(e => {
                    console.error("Background Sync Failed", e);
                });

                // Clear Queue
                App.controllers.reception.tempQueue = [];
            },

            // --- New Patient Modal ---
            openNewPatientModal: () => {
                document.getElementById('new-patient-modal').classList.remove('hidden');
            },

            closeNewPatientModal: () => {
                document.getElementById('new-patient-modal').classList.add('hidden');
            },

            savePatient: async () => {
                // Permission check
                if (!App.rbac.hasPermission('createPatient')) {
                    return alert("Access Denied: You don't have permission to create patients.");
                }

                const name = document.getElementById('pat-name').value;
                const dob = document.getElementById('pat-dob').value;
                const gender = document.getElementById('pat-gender').value;
                const phone = document.getElementById('pat-phone').value;

                // New Fields
                const age = document.getElementById('pat-age').value;
                const complaint = document.getElementById('pat-complaint').value;
                const diagnosis = document.getElementById('pat-diagnosis').value;
                const history = document.getElementById('pat-history').value;

                if (!name || !dob) return alert("Fill required fields");

                // 1. Optimistic Update
                const newId = App.helpers.generateId('PT');
                const newPatient = {
                    id: newId,
                    full_name: name,
                    dob,
                    age,
                    gender,
                    phone,
                    complaint,
                    diagnosis,
                    medical_history: history,
                    // allergies - implied in history or add separate if needed, user said "Medical History / Allergies" in one input in my UI plan? 
                    // Wait, in UI I gathered them. Let's stick to what I rendered in index.html.
                    // I used id="pat-history" for "Medical History / Allergies"
                    created_at: new Date().toISOString()
                };

                App.state.patients.push(newPatient);

                // 2. Update Dropdown logic if needed (for visit modal)
                const select = document.getElementById('visit-patient-select');
                if (select) {
                    const opt = document.createElement('option');
                    opt.value = newId;
                    opt.textContent = `${name} (${phone})`;
                    select.appendChild(opt);
                    select.value = newId;
                }

                App.controllers.reception.closeNewPatientModal();

                // 3. Background Sync
                API.createPatient(newPatient).catch(e => console.error("Patient Sync Failed", e));
            },

            viewReport: (studyId) => {
                const study = App.state.studies.find(s => s.id === studyId);
                const patient = App.helpers.getPatient(study.visit_id);

                // Reuse the print overlay style for viewing
                const viewer = document.createElement('div');
                viewer.className = 'fixed inset-0 z-[100] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in';
                viewer.innerHTML = `
                    <div class="bg-white w-full max-w-2xl max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
                        <div class="h-14 bg-slate-800 flex items-center justify-between px-6 text-white shrink-0">
                            <h3 class="font-bold">Medical Report</h3>
                            <div class="flex gap-3">
                                <button onclick="this.closest('.fixed').remove()" class="hover:text-red-300"><i class="fa-solid fa-times"></i></button>
                            </div>
                        </div>
                        <div class="p-8 overflow-y-auto flex-1 prose max-w-none">
                            <div class="border-b border-slate-100 pb-4 mb-4">
                                <h1 class="text-2xl font-bold text-slate-900 mb-1">${patient.full_name}</h1>
                                <p class="text-sm text-slate-500">${study.modality} - ${study.study_name}</p>
                            </div>
                            ${study.report_content}
                        </div>
                        <div class="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
                            <button onclick="App.controllers.reception.printReport('${studyId}')" class="px-4 py-2 bg-brand-600 text-white rounded-lg font-bold hover:bg-brand-700">
                                <i class="fa-solid fa-print mr-2"></i> Print
                            </button>
                        </div>
                    </div>
                `;
                document.body.appendChild(viewer);
            },

            printReport: (studyId) => {
                // Quick hack to reuse radiologist printing logic without switching views
                App.state.currentStudy = App.state.studies.find(s => s.id === studyId);
                // We need a temporary quill instance or just use raw content? 
                // The printReport function uses App.state.quill.root.innerHTML. 
                // We should refactor printReport to take content as arg, but for now let's mock it.
                const content = App.state.currentStudy.report_content;

                // Mock Quill for the print function
                App.state.quill = { root: { innerHTML: content } };
                App.controllers.radiologist.printReport();
            }
        },

        technician: {
            selectedDate: new Date().toISOString().split('T')[0],

            render: () => {
                const studies = App.state.studies;
                const selectedDate = App.controllers.technician.selectedDate || new Date().toISOString().split('T')[0];

                // Tech sees Waiting (to start) and Scanning (in progress) filtered by date
                const todo = studies.filter(s => {
                    if (!['Waiting', 'Scanning'].includes(s.status)) return false;
                    const visit = App.state.visits.find(v => v.id === s.visit_id);
                    if (!visit) return false;
                    return visit.check_in_time.startsWith(selectedDate);
                });

                const isTech = ['Technician', 'Admin', 'Radiologist'].includes(App.state.user.role);

                // Date Navigation Helpers
                const dateObj = new Date(selectedDate);
                const prevDate = new Date(dateObj); prevDate.setDate(prevDate.getDate() - 1);
                const nextDate = new Date(dateObj); nextDate.setDate(nextDate.getDate() + 1);
                const prevDateStr = prevDate.toISOString().split('T')[0];
                const nextDateStr = nextDate.toISOString().split('T')[0];
                const isToday = selectedDate === new Date().toISOString().split('T')[0];

                const html = `
                    <div class="h-full flex flex-col p-6 gap-6">
                         <div class="flex justify-between items-center">
                            <h2 class="text-2xl font-display font-bold text-slate-800">Technician Worklist</h2>
                         </div>

                        <!-- Date Navigation -->
                         <div class="flex items-center justify-between bg-white p-2 rounded-xl border border-slate-200 shadow-sm shrink-0">
                            <button onclick="App.controllers.technician.changeDate('${prevDateStr}')" class="p-2 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-brand-600 transition-colors">
                                <i class="fa-solid fa-chevron-left"></i>
                            </button>
                            
                            <div class="flex items-center gap-2">
                                <i class="fa-solid fa-calendar-day text-brand-500"></i>
                                <input type="date" value="${selectedDate}" onchange="App.controllers.technician.changeDate(this.value)" 
                                    class="bg-transparent border-none font-bold text-slate-700 outline-none focus:ring-0 cursor-pointer">
                                ${isToday ? '<span class="px-2 py-0.5 bg-brand-100 text-brand-700 text-xs font-bold rounded-full">Today</span>' : ''}
                            </div>

                            <button onclick="App.controllers.technician.changeDate('${nextDateStr}')" class="p-2 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-brand-600 transition-colors">
                                <i class="fa-solid fa-chevron-right"></i>
                            </button>
                        </div>

                         <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto pb-20">
                            ${todo.map(s => App.components.studyCard(s, isTech)).join('')}
                            ${todo.length === 0 ? '<div class="col-span-full text-center text-slate-400">No pending scans for this date.</div>' : ''}
                         </div>
                    </div>
                `;
                App.ui.renderPage('technician', html);
            },

            changeDate: (dateStr) => {
                App.controllers.technician.selectedDate = dateStr;
                App.controllers.technician.render();
            },

            startScan: async (id) => {
                // Permission check
                if (!App.rbac.hasPermission('startScan')) {
                    return alert("Access Denied: You don't have permission to start scans.");
                }

                if (!confirm("Start Scanning patient?")) return;
                // Optimistic UI
                const s = App.state.studies.find(x => x.id === id);
                if (s) s.status = 'Scanning';
                App.controllers.technician.render();

                await API.updateStudyStatus(id, 'Scanning');
            },

            completeScan: async (id) => {
                // Permission check
                if (!App.rbac.hasPermission('completeScan')) {
                    return alert("Access Denied: You don't have permission to complete scans.");
                }

                if (!confirm("Complete scan and send to Radiologist?")) return;
                const s = App.state.studies.find(x => x.id === id);
                if (s) s.status = 'Reporting';
                App.controllers.technician.render();

                await API.updateStudyStatus(id, 'Reporting');
            },

            openImageModal: (studyId) => {
                const study = App.state.studies.find(s => s.id === studyId);
                const patient = App.helpers.getPatientName(study.visit_id);

                // Parse existing links
                let imageLinks = [];
                try {
                    imageLinks = study.image_links ? JSON.parse(study.image_links) : [];
                } catch (e) {
                    imageLinks = [];
                }

                const modal = document.createElement('div');
                modal.id = 'image-links-modal';
                modal.className = 'fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4';
                modal.innerHTML = `
                    <div class="bg-white w-full max-w-lg rounded-2xl shadow-2xl flex flex-col max-h-[80vh]">
                        <div class="h-14 bg-slate-800 flex items-center justify-between px-6 text-white shrink-0">
                            <h3 class="font-bold"><i class="fa-solid fa-images mr-2"></i> Manage Images</h3>
                            <button onclick="document.getElementById('image-links-modal').remove()" class="hover:text-red-300">
                                <i class="fa-solid fa-times"></i>
                            </button>
                        </div>
                        <div class="p-6 flex-1 overflow-y-auto">
                            <p class="text-sm text-slate-600 mb-4"><strong>${patient}</strong> - ${study.study_name}</p>
                            
                            <!-- Add Link Form -->
                            <div class="bg-slate-50 rounded-xl p-4 mb-4">
                                <label class="block text-xs font-bold text-slate-500 uppercase mb-2">Add Image Link</label>
                                <input type="text" id="new-image-link" placeholder="https://drive.google.com/file/d/..." 
                                    class="w-full bg-white border border-slate-200 rounded-lg px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500 mb-2">
                                <button onclick="App.controllers.technician.addImageLink('${studyId}')" 
                                    class="w-full py-2 bg-brand-600 text-white rounded-lg text-sm font-bold hover:bg-brand-700">
                                    <i class="fa-solid fa-plus mr-2"></i> Add Link
                                </button>
                            </div>

                            <!-- Existing Links -->
                            <div>
                                <h4 class="text-xs font-bold text-slate-500 uppercase mb-2">Current Links (${imageLinks.length})</h4>
                                <div id="image-links-list" class="space-y-2">
                                    ${imageLinks.length === 0 ? '<p class="text-sm text-slate-400 italic">No images added yet.</p>' : ''}
                                    ${imageLinks.map((link, idx) => `
                                        <div class="flex items-center gap-2 bg-white border border-slate-200 rounded-lg p-3">
                                            <i class="fa-solid fa-link text-brand-600"></i>
                                            <a href="${link}" target="_blank" class="flex-1 text-sm text-brand-600 hover:underline truncate">${link}</a>
                                            <button onclick="App.controllers.technician.removeImageLink('${studyId}', ${idx})" 
                                                class="text-red-500 hover:text-red-700">
                                                <i class="fa-solid fa-trash"></i>
                                            </button>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        </div>
                    </div>
                `;
                document.body.appendChild(modal);
            },

            addImageLink: async (studyId) => {
                const input = document.getElementById('new-image-link');
                const link = input.value.trim();

                if (!link) return alert("Please enter a valid link");
                if (!link.startsWith('http')) return alert("Link must start with http:// or https://");

                const study = App.state.studies.find(s => s.id === studyId);
                let imageLinks = [];
                try {
                    imageLinks = study.image_links ? JSON.parse(study.image_links) : [];
                } catch (e) {
                    imageLinks = [];
                }

                imageLinks.push(link);
                study.image_links = JSON.stringify(imageLinks);

                // Save to backend
                await API.request('updateImageLinks', { study_id: studyId, image_links: imageLinks });

                // Refresh modal
                document.getElementById('image-links-modal').remove();
                App.controllers.technician.openImageModal(studyId);
            },

            removeImageLink: async (studyId, index) => {
                if (!confirm("Remove this image link?")) return;

                const study = App.state.studies.find(s => s.id === studyId);
                let imageLinks = [];
                try {
                    imageLinks = study.image_links ? JSON.parse(study.image_links) : [];
                } catch (e) {
                    imageLinks = [];
                }

                imageLinks.splice(index, 1);
                study.image_links = JSON.stringify(imageLinks);

                // Save to backend
                await API.request('updateImageLinks', { study_id: studyId, image_links: imageLinks });

                // Refresh modal
                document.getElementById('image-links-modal').remove();
                App.controllers.technician.openImageModal(studyId);
            }
        },

        radiologist: {
            myListMode: false, // Toggle between "All Patients" and "My List"
            activeTab: 'reporting', // 'reporting' or 'completed'
            calendarMode: false, // Toggle between list and calendar view
            selectedDate: new Date().toISOString().split('T')[0],

            render: () => {
                if (App.controllers.radiologist.calendarMode) {
                    App.controllers.radiologist.renderCalendarView();
                } else {
                    App.controllers.radiologist.renderListView();
                }
            },

            changeDate: (dateStr) => {
                App.controllers.radiologist.selectedDate = dateStr;
                App.controllers.radiologist.render();
            },

            toggleCalendar: () => {
                App.controllers.radiologist.calendarMode = !App.controllers.radiologist.calendarMode;
                App.controllers.radiologist.render();
            },

            renderCalendarView: () => {
                // Calendar view for radiologist
                // Shows counts of Reporting/Completed studies per day
                const today = new Date();
                const weekDays = [];
                // Show a 2 week window centered on today for better context, or just this week?
                // Let's stick to 7 days starting today for consistency with Reception
                for (let i = 0; i < 7; i++) {
                    const date = new Date(today);
                    date.setDate(today.getDate() + i);
                    weekDays.push(date);
                }

                // Group studies by date
                const studiesByDate = {};
                App.state.studies.forEach(s => {
                    const visit = App.state.visits.find(v => v.id === s.visit_id);
                    if (!visit) return;
                    const dateStr = new Date(visit.check_in_time).toDateString();

                    if (!studiesByDate[dateStr]) studiesByDate[dateStr] = { reporting: 0, completed: 0, total: 0 };

                    if (s.status === 'Reporting') studiesByDate[dateStr].reporting++;
                    if (s.status === 'Completed') studiesByDate[dateStr].completed++;
                    studiesByDate[dateStr].total++;
                });

                const toggleBtn = `
                    <button onclick="App.controllers.radiologist.toggleCalendar()"
                        class="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-bold hover:shadow-md transition-all">
                        <i class="fa-solid fa-list mr-2"></i> List View
                    </button>
                `;

                const html = `
                    <div class="h-full flex flex-col p-6 gap-6">
                        <div class="flex justify-between items-center">
                            <h2 class="text-2xl font-display font-bold text-slate-800">
                                <i class="fa-solid fa-calendar mr-2"></i> Radiologist Schedule
                            </h2>
                            ${toggleBtn}
                        </div>

                         <div class="flex-1 grid grid-cols-7 gap-4 overflow-y-auto">
                            ${weekDays.map(date => {
                    const dateStr = date.toDateString();
                    const isoDate = date.toISOString().split('T')[0];
                    const stats = studiesByDate[dateStr] || { reporting: 0, completed: 0, total: 0 };
                    const isToday = dateStr === today.toDateString();

                    return `
                                    <div class="glass-panel p-4 flex flex-col ${isToday ? 'ring-2 ring-brand-500' : ''}">
                                        <div class="text-center mb-3">
                                            <p class="text-xs font-bold text-slate-500 uppercase">${date.toLocaleDateString('en-US', { weekday: 'short' })}</p>
                                            <p class="text-2xl font-bold ${isToday ? 'text-brand-600' : 'text-slate-800'}">${date.getDate()}</p>
                                            <p class="text-xs text-slate-400">${date.toLocaleDateString('en-US', { month: 'short' })}</p>
                                        </div>
                                        
                                        <div class="flex-1 space-y-2 flex flex-col justify-center">
                                             ${stats.total > 0 ? `
                                                <div class="flex justify-between items-center bg-purple-50 p-2 rounded text-xs text-purple-700">
                                                    <span>To Report</span>
                                                    <span class="font-bold">${stats.reporting}</span>
                                                </div>
                                                <div class="flex justify-between items-center bg-emerald-50 p-2 rounded text-xs text-emerald-700">
                                                    <span>Done</span>
                                                    <span class="font-bold">${stats.completed}</span>
                                                </div>
                                             ` : `
                                                <div class="text-center text-slate-300 py-2">
                                                    <p class="text-xs">No activity</p>
                                                </div>
                                             `}
                                        </div>
                                        
                                        <button onclick="App.controllers.radiologist.viewDayDetails('${isoDate}')" 
                                            class="mt-3 w-full py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50">
                                            View
                                        </button>
                                    </div>
                                `;
                }).join('')}
                        </div>
                    </div>
                `;
                App.ui.renderPage('radiologist', html);
            },

            viewDayDetails: (dateStr) => {
                App.controllers.radiologist.selectedDate = dateStr;
                App.controllers.radiologist.calendarMode = false;
                App.controllers.radiologist.render();
            },

            renderListView: () => {
                const studies = App.state.studies;
                const currentUser = App.state.user;
                const selectedDate = App.controllers.radiologist.selectedDate || new Date().toISOString().split('T')[0];

                // 1. Filter ALL studies by date first
                // This ensures counts in tabs are correct for the selected day
                const studiesForDate = studies.filter(s => {
                    const visit = App.state.visits.find(v => v.id === s.visit_id);
                    if (!visit) return false;
                    return visit.check_in_time.startsWith(selectedDate);
                });

                // 2. Filter for List Display based on Active Tab
                let displayStudies = App.controllers.radiologist.activeTab === 'reporting'
                    ? studiesForDate.filter(s => ['Reporting', 'Reported'].includes(s.status))
                    : studiesForDate.filter(s => s.status === 'Completed');

                // Filter based on My List mode
                if (App.controllers.radiologist.myListMode) {
                    displayStudies = displayStudies.filter(s => s.assigned_doctor_id === currentUser.id);
                }

                // Date Navigation Helpers
                const dateObj = new Date(selectedDate);
                const prevDate = new Date(dateObj); prevDate.setDate(prevDate.getDate() - 1);
                const nextDate = new Date(dateObj); nextDate.setDate(nextDate.getDate() + 1);
                const prevDateStr = prevDate.toISOString().split('T')[0];
                const nextDateStr = nextDate.toISOString().split('T')[0];
                const isToday = selectedDate === new Date().toISOString().split('T')[0];


                const toggleBtn = `
                    <button onclick="App.controllers.radiologist.toggleMyList()"
                        class="px-4 py-2 ${App.controllers.radiologist.myListMode ? 'bg-brand-600 text-white' : 'bg-white text-slate-700 border border-slate-200'} rounded-lg text-sm font-bold hover:shadow-md transition-all">
                        <i class="fa-solid fa-${App.controllers.radiologist.myListMode ? 'users' : 'user'} mr-2"></i>
                        ${App.controllers.radiologist.myListMode ? 'All Patients' : 'My List'}
                    </button>
                `;

                const calendarToggle = `
                     <button onclick="App.controllers.radiologist.toggleCalendar()"
                        class="px-4 py-2 ${App.controllers.radiologist.calendarMode ? 'bg-brand-600 text-white' : 'bg-white text-slate-700 border border-slate-200'} rounded-lg text-sm font-bold hover:shadow-md transition-all">
                        <i class="fa-solid fa-${App.controllers.radiologist.calendarMode ? 'list' : 'calendar'} mr-2"></i>
                        ${App.controllers.radiologist.calendarMode ? 'List View' : 'Overview'}
                    </button>
                `;

                const tabs = `
                    <div class="flex gap-2 border-b border-slate-200">
                        <button onclick="App.controllers.radiologist.switchTab('reporting')"
                            class="px-4 py-2 font-bold text-sm ${App.controllers.radiologist.activeTab === 'reporting' ? 'text-brand-600 border-b-2 border-brand-600' : 'text-slate-500 hover:text-slate-700'}">
                            <i class="fa-solid fa-file-medical mr-2"></i> Reporting (${studiesForDate.filter(s => ['Reporting', 'Reported'].includes(s.status)).length})
                        </button>
                        <button onclick="App.controllers.radiologist.switchTab('completed')"
                            class="px-4 py-2 font-bold text-sm ${App.controllers.radiologist.activeTab === 'completed' ? 'text-emerald-600 border-b-2 border-emerald-600' : 'text-slate-500 hover:text-slate-700'}">
                            <i class="fa-solid fa-circle-check mr-2"></i> Completed (${studiesForDate.filter(s => s.status === 'Completed').length})
                        </button>
                    </div>
                `;

                const html = `
                    <div class="h-full flex flex-col p-6 gap-4">
                        <div class="flex justify-between items-center">
                            <h2 class="text-2xl font-display font-bold text-slate-800">Radiologist Workspace</h2>
                            <div class="flex gap-2">
                                ${calendarToggle}
                                ${toggleBtn}
                            </div>
                        </div>
                        
                        <!-- Date Navigation -->
                         <div class="flex items-center justify-between bg-white p-2 rounded-xl border border-slate-200 shadow-sm shrink-0">
                            <button onclick="App.controllers.radiologist.changeDate('${prevDateStr}')" class="p-2 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-brand-600 transition-colors">
                                <i class="fa-solid fa-chevron-left"></i>
                            </button>
                            
                            <div class="flex items-center gap-2">
                                <i class="fa-solid fa-calendar-day text-brand-500"></i>
                                <input type="date" value="${selectedDate}" onchange="App.controllers.radiologist.changeDate(this.value)" 
                                    class="bg-transparent border-none font-bold text-slate-700 outline-none focus:ring-0 cursor-pointer">
                                ${isToday ? '<span class="px-2 py-0.5 bg-brand-100 text-brand-700 text-xs font-bold rounded-full">Today</span>' : ''}
                            </div>

                            <button onclick="App.controllers.radiologist.changeDate('${nextDateStr}')" class="p-2 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-brand-600 transition-colors">
                                <i class="fa-solid fa-chevron-right"></i>
                            </button>
                        </div>

                        ${tabs}
                        <div class="flex-1 flex gap-6 overflow-hidden">
                            <!-- Queue List -->
                            <div class="w-1/3 glass-panel p-4 overflow-y-auto">
                                ${displayStudies.map(s => {
                    const isAssigned = s.assigned_doctor_id === currentUser.id;
                    const lockIcon = !isAssigned ? '<i class="fa-solid fa-lock text-slate-300 ml-2"></i>' : '';
                    const cardClass = !isAssigned ? 'opacity-60' : '';

                    return `
                                    <div onclick="App.controllers.radiologist.openEditor('${s.id}')" class="p-4 mb-3 bg-white border border-slate-100 rounded-xl shadow-sm hover:shadow-md cursor-pointer transition-all group ${cardClass}">
                                        <div class="flex justify-between items-start mb-2">
                                            <span class="font-bold text-slate-800">${App.helpers.getPatientName(s.visit_id)}${lockIcon}</span>
                                            <span class="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-bold">${s.modality}</span>
                                        </div>
                                        <p class="text-sm text-slate-500">${s.study_name}</p>
                                    </div>
                                `;
                }).join('')}
                                ${displayStudies.length === 0 ? `<div class="text-center text-slate-400 mt-10">
                                    <i class="fa-solid fa-check-circle text-4xl text-slate-200 mb-2"></i>
                                    <p>No studies for this date.</p>
                                </div>` : ''}
                            </div>

                            <!-- Editor Placeholder -->
                            <div id="editor-panel" class="flex-1 glass-panel flex items-center justify-center text-slate-400">
                                <div class="text-center">
                                    <i class="fa-solid fa-file-medical text-4xl mb-4 text-slate-300"></i>
                                    <p>Select a study to start reporting</p>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
                App.ui.renderPage('radiologist', html);
            },

            openEditor: (studyId) => {
                const study = App.state.studies.find(s => s.id === studyId);
                const patient = App.helpers.getPatient(study.visit_id);
                const currentUser = App.state.user;
                const isAssigned = study.assigned_doctor_id === currentUser.id;
                App.state.currentStudy = study; // Store for printing

                // Read-only mode for non-assigned cases
                const readOnlyBanner = !isAssigned ? `
                    <div class="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center gap-2 text-amber-800 text-sm">
                        <i class="fa-solid fa-lock"></i>
                        <span><strong>View Only:</strong> This case is assigned to another doctor.</span>
                    </div>
                ` : '';

                const actionButtons = isAssigned ? `
                    <button onclick="App.controllers.radiologist.toggleTemplates()" class="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-sm hover:border-brand-300">
                        <i class="fa-solid fa-wand-magic-sparkles mr-1"></i> Templates
                    </button>
                    ${study.status !== 'Completed' ? `
                        <button onclick="App.controllers.radiologist.markComplete('${study.id}')" class="px-4 py-1.5 bg-emerald-600 text-white rounded-lg text-sm font-bold shadow-md hover:bg-emerald-700">
                            <i class="fa-solid fa-circle-check mr-1"></i> Mark Complete
                        </button>
                    ` : ''}
                    <button onclick="App.controllers.radiologist.printReport()" class="px-4 py-1.5 bg-brand-600 text-white rounded-lg text-sm font-bold shadow-md hover:bg-brand-700">
                        Sign & Print <i class="fa-solid fa-print ml-1"></i>
                    </button>
                ` : `
                    <span class="text-sm text-slate-500 italic">View Only Mode</span>
                `;

                const html = `
                    <div class="w-full flex flex-col h-full bg-white rounded-xl overflow-hidden relative">
                        ${readOnlyBanner}
                        <!-- Toolbar -->
                        <div class="h-14 border-b border-slate-100 flex justify-between items-center px-4 bg-slate-50/50">
                            <div>
                                <h3 class="font-bold text-slate-800">${patient.full_name} <span class="text-slate-400 font-normal">| ${String(patient.dob).split('T')[0]}</span></h3>
                                <p class="text-xs text-slate-500">${study.study_name}</p>
                            </div>
                            <div class="flex gap-2">
                                ${actionButtons}
                            </div>
                        </div>

                        <div class="flex flex-1 overflow-hidden">
                            <!-- Editor Area -->
                            <div class="flex-1 p-8 overflow-y-auto bg-white relative">
                                <!-- Patient Info & Image Links -->
                                <div class="mb-4 pb-4 border-b border-slate-100">
                                    <h3 class="text-sm font-bold text-slate-500 uppercase mb-2">Patient Information</h3>
                                    <p class="text-sm text-slate-600">DOB: ${String(patient.dob).split('T')[0]} | Phone: ${patient.phone || 'N/A'}</p>
                                    ${(() => {
                        let imageLinks = [];
                        try {
                            imageLinks = study.image_links ? JSON.parse(study.image_links) : [];
                        } catch (e) {
                            imageLinks = [];
                        }
                        if (imageLinks.length > 0) {
                            return `
                                                <div class="mt-3">
                                                    <h4 class="text-xs font-bold text-slate-500 uppercase mb-2"><i class="fa-solid fa-images mr-1"></i> Attached Images (${imageLinks.length})</h4>
                                                    <div class="flex flex-wrap gap-2">
                                                        ${imageLinks.map((link, idx) => `
                                                            <a href="${link}" target="_blank" 
                                                                class="px-3 py-1.5 bg-brand-50 text-brand-700 rounded-lg text-xs font-bold hover:bg-brand-100 flex items-center gap-2">
                                                                <i class="fa-solid fa-external-link"></i> Image ${idx + 1}
                                                            </a>
                                                        `).join('')}
                                                    </div>
                                                </div>
                                            `;
                        }
                        return '';
                    })()}
                                </div>
                                
                                <!-- Clinical Context Import Section -->
                                <div class="mb-6 p-4 bg-blue-50/50 rounded-xl border border-blue-100">
                                    <h3 class="text-xs font-bold text-blue-700 uppercase mb-3 flex items-center">
                                        <i class="fa-solid fa-notes-medical mr-2"></i> Clinical Context & Import
                                    </h3>
                                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                        ${patient.complaint ? `
                                            <label class="flex items-start gap-2 cursor-pointer group">
                                                <input type="checkbox" onchange="App.controllers.radiologist.toggleImport('complaint', this.checked, '${patient.complaint || ''}')" class="mt-1">
                                                <div>
                                                    <span class="font-bold text-slate-700">Chief Complaint</span>
                                                    <p class="text-slate-600 text-xs">${patient.complaint}</p>
                                                </div>
                                            </label>
                                        ` : ''}
                                        
                                        ${patient.diagnosis ? `
                                            <label class="flex items-start gap-2 cursor-pointer group">
                                                <input type="checkbox" onchange="App.controllers.radiologist.toggleImport('diagnosis', this.checked, '${patient.diagnosis || ''}')" class="mt-1">
                                                <div>
                                                    <span class="font-bold text-slate-700">Clinical Diagnosis</span>
                                                    <p class="text-slate-600 text-xs">${patient.diagnosis}</p>
                                                </div>
                                            </label>
                                        ` : ''}

                                        ${patient.medical_history ? `
                                            <label class="flex items-start gap-2 cursor-pointer group">
                                                <input type="checkbox" onchange="App.controllers.radiologist.toggleImport('history', this.checked, '${patient.medical_history || ''}')" class="mt-1">
                                                <div>
                                                    <span class="font-bold text-slate-700">History / Allergies</span>
                                                    <p class="text-slate-600 text-xs">${patient.medical_history}</p>
                                                </div>
                                            </label>
                                        ` : ''}
                                        
                                        ${(!patient.complaint && !patient.diagnosis && !patient.medical_history) ?
                        `<p class="text-slate-400 italic text-xs col-span-2">No clinical data recorded for this patient.</p>` : ''}
                                    </div>
                                </div>

                                <div id="quill-editor" class="h-full">
                                    ${study.report_content || `
                                        <h3 class="text-lg font-bold mb-2">Findings</h3>
                                        <p>No significant abnormality detected.</p>
                                        <br>
                                        <h3 class="text-lg font-bold mb-2">Impression</h3>
                                        <p>Normal study.</p>
                                    `}
                                </div>
                            </div>

                            <!-- Template Sidebar (Hidden by default) -->
                            <div id="template-sidebar" class="w-80 bg-slate-50 border-l border-slate-200 flex flex-col transition-all duration-300 transform translate-x-full absolute right-0 top-0 bottom-0 z-10 shadow-xl">
                                <div class="p-4 border-b border-slate-200 flex justify-between items-center bg-white">
                                    <h4 class="font-bold text-slate-700">Templates</h4>
                                    <button onclick="App.controllers.radiologist.toggleTemplates()" class="text-slate-400 hover:text-slate-600"><i class="fa-solid fa-times"></i></button>
                                </div>
                                <div id="template-list" class="flex-1 overflow-y-auto p-2 space-y-2">
                                    <!-- Populated on toggle -->
                                </div>
                            </div>
                        </div>
                    </div>
                `;
                document.getElementById('editor-panel').innerHTML = html;

                // Init Quill with read-only mode for non-assigned cases
                const isAssignedToUser = study.assigned_doctor_id === currentUser.id;
                App.state.quill = new Quill('#quill-editor', {
                    theme: 'snow',
                    readOnly: !isAssignedToUser,
                    modules: {
                        toolbar: isAssignedToUser ? [
                            ['bold', 'italic', 'underline'],
                            [{ 'header': 1 }, { 'header': 2 }],
                            [{ 'list': 'ordered' }, { 'list': 'bullet' }]
                        ] : false
                    }
                });
            },

            toggleMyList: () => {
                App.controllers.radiologist.myListMode = !App.controllers.radiologist.myListMode;
                App.controllers.radiologist.render();
            },

            switchTab: (tab) => {
                App.controllers.radiologist.activeTab = tab;
                App.controllers.radiologist.render();
            },

            markComplete: async (studyId) => {
                // Permission check
                if (!App.rbac.hasPermission('markComplete')) {
                    return alert("Access Denied: You don't have permission to mark cases as complete.");
                }

                if (!confirm("Mark this case as completed?")) return;

                // Optimistic UI
                const study = App.state.studies.find(s => s.id === studyId);
                if (study) {
                    study.status = 'Completed';
                    study.completed_at = new Date().toISOString();
                }

                // Save report first
                const content = App.state.quill.root.innerHTML;
                await API.saveReport({ study_id: studyId, content_html: content });

                // Mark as complete
                await API.request('markComplete', { study_id: studyId });

                // Refresh view
                App.controllers.radiologist.activeTab = 'completed';
                App.controllers.radiologist.render();
            },

            toggleTemplates: () => {
                const sidebar = document.getElementById('template-sidebar');
                if (sidebar.classList.contains('translate-x-full')) {
                    sidebar.classList.remove('translate-x-full');
                    App.controllers.radiologist.renderTemplateList();
                } else {
                    sidebar.classList.add('translate-x-full');
                }
            },

            renderTemplateList: () => {
                // Flatten templates for MVP
                const list = document.getElementById('template-list');
                const tpl = Templates.DATA['US']['Abdomen']; // Simplified for demo
                // In real app, we'd navigate Modality -> Organ keys

                let html = '';
                // Hardcoded demo loop over US Abdomen just to show flow
                for (const [name, data] of Object.entries(tpl)) {
                    html += `
                        <div class="bg-white border border-slate-200 rounded-lg p-3 hover:border-brand-400 cursor-pointer shadow-sm group" onclick="App.controllers.radiologist.applyTemplate('${name}')">
                            <h5 class="font-bold text-sm text-slate-700 group-hover:text-brand-600">${name}</h5>
                            <p class="text-xs text-slate-400 truncate">${data.title}</p>
                        </div>
                    `;
                }
                list.innerHTML = html + '<div class="text-xs text-slate-400 text-center p-2">Showing US Abdomen (Demo)</div>';
            },

            applyTemplate: (name) => {
                const tpl = Templates.DATA['US']['Abdomen'][name];
                if (!tpl) return;

                // Simple Prompt for Dynamic Fields (MVP)
                // In v2, this would be a nice form
                let content = tpl.content;
                tpl.fields.forEach(f => {
                    const val = prompt(`Enter ${f.label} (${f.key}):`, f.default);
                    content = content.replace(new RegExp(`{{${f.key}}}`, 'g'), val || f.default);
                });

                App.state.quill.clipboard.dangerouslyPasteHTML(content);
                App.controllers.radiologist.toggleTemplates();
            },

            printReport: async () => {
                const study = App.state.currentStudy;
                const patient = App.helpers.getPatient(study.visit_id);
                const content = App.state.quill.root.innerHTML;

                // Save first
                App.ui.showLoading(true);
                try {
                    await API.saveReport({ study_id: study.id, content_html: content });

                    // Create Printable Overlay
                    const printOverlay = document.createElement('div');
                    printOverlay.id = 'print-container';
                    printOverlay.className = 'bg-white text-black p-10 hidden'; // Visible only in print
                    printOverlay.innerHTML = `
                        <div class="max-w-[210mm] mx-auto">
                            <!-- Header -->
                            <div class="flex justify-between items-end border-b-2 border-slate-900 pb-4 mb-8">
                                <div>
                                    <h1 class="text-4xl font-bold tracking-tight text-slate-900">Radiology<span class="text-slate-500">Center</span></h1>
                                    <p class="text-sm text-slate-500 mt-1">123 Medical Plaza, Cairo, Egypt</p>
                                </div>
                                <div class="text-right">
                                    <div class="w-16 h-16 bg-slate-900 text-white flex items-center justify-center font-bold text-xs rounded mb-2 ml-auto">QR</div>
                                    <p class="text-xs text-slate-400">Scan to verify</p>
                                </div>
                            </div>

                            <!-- Patient Info Grid -->
                            <div class="grid grid-cols-2 gap-x-8 gap-y-2 text-sm mb-8 border border-slate-200 p-4 rounded-lg">
                                <div class="flex justify-between"><span class="text-slate-500">Patient Name:</span> <span class="font-bold">${patient.full_name}</span></div>
                                <div class="flex justify-between"><span class="text-slate-500">Patient ID:</span> <span class="font-bold">${patient.id}</span></div>
                                <div class="flex justify-between"><span class="text-slate-500">Date of Birth:</span> <span class="font-bold">${patient.dob.split('T')[0]}</span></div>
                                <div class="flex justify-between"><span class="text-slate-500">Exam Date:</span> <span class="font-bold">${new Date().toLocaleDateString()}</span></div>
                                <div class="col-span-2 border-t border-slate-100 my-1"></div>
                                <div class="flex justify-between"><span class="text-slate-500">Study:</span> <span class="font-bold uppercase">${study.study_name}</span></div>
                                <div class="flex justify-between"><span class="text-slate-500">Modality:</span> <span class="font-bold">${study.modality}</span></div>
                            </div>

                            <!-- Report Content -->
                            <div class="prose max-w-none mb-12">
                                ${content}
                            </div>

                            <!-- Footer / Signature -->
                            <div class="mt-20 flex justify-end">
                                <div class="text-center">
                                    <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/e/e4/Signature_sample.svg/1200px-Signature_sample.svg.png" class="h-12 mx-auto opacity-50 mb-2">
                                    <p class="font-bold text-slate-900 border-t border-slate-300 px-8 pt-2">Dr. Radiologist</p>
                                    <p class="text-xs text-slate-500 uppercase">Consultant Radiologist</p>
                                </div>
                            </div>
                        </div>
                    `;
                    document.body.appendChild(printOverlay);

                    // Trigger Print
                    window.print();

                    // Cleanup
                    setTimeout(() => document.body.removeChild(printOverlay), 1000);

                } catch (e) {
                    alert("Save failed: " + e.toString());
                } finally {
                    App.ui.showLoading(false);
                }
            },

            toggleImport: (type, checked, text) => {
                if (!App.state.quill) return;

                const editor = App.state.quill;

                if (checked) {
                    const label = {
                        'complaint': 'Chief Complaint: ',
                        'diagnosis': 'Clinical Diagnosis: ',
                        'history': 'History: '
                    }[type];

                    const insertion = `\n**${label}** ${text}\n`;

                    // Insert at the beginning of the editor
                    editor.insertText(0, insertion, 'bold', true);
                    // Reset formatting? Quill might keep bold. 
                    // Let's just insert text. 'api' source avoids triggering events if any.
                }
                // We don't remove on uncheck to avoid losing user edits.
            }
        },

        admin: {
            render: () => {
                const url = localStorage.getItem('rad_gas_url') || CONFIG.GAS_URL;

                const html = `
                    <div class="h-full flex flex-col p-6 gap-6">
                        <h2 class="text-2xl font-display font-bold text-slate-800">Admin Dashboard</h2>
                        
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 overflow-y-auto pb-20">
                            <!-- Settings Card -->
                            <div class="glass-panel p-6">
                                <h3 class="font-bold text-slate-700 mb-4"><i class="fa-solid fa-cogs mr-2"></i> System Configuration</h3>
                                
                                <div class="mb-4">
                                    <label class="block text-xs font-bold text-slate-500 uppercase mb-2">Backend URL (Google Apps Script)</label>
                                    <input type="text" id="admin-gas-url" value="${url}" class="w-full bg-white border border-slate-200 rounded-lg px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500 font-mono text-slate-600">
                                    <p class="text-[10px] text-slate-400 mt-1">Deploy your GAS code as "Web App" and paste the URL here.</p>
                                </div>
                                
                                <button onclick="App.controllers.admin.saveSettings()" class="px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-bold shadow-md hover:bg-slate-900">
                                    Save Config
                                </button>
                            </div>

                            <!-- Create User Card -->
                            <div class="glass-panel p-6">
                                <h3 class="font-bold text-slate-700 mb-4"><i class="fa-solid fa-user-plus mr-2"></i> Create User</h3>
                                <div class="space-y-3">
                                    <input type="text" id="new-user-name" placeholder="Full Name" class="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500">
                                    <input type="email" id="new-user-email" placeholder="Email" class="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500">
                                    <div class="flex gap-2">
                                        <select id="new-user-role" class="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500">
                                            <option value="Reception">Reception</option>
                                            <option value="Technician">Technician</option>
                                            <option value="Radiologist">Radiologist</option>
                                            <option value="Admin">Admin</option>
                                        </select>
                                        <input type="text" id="new-user-pin" placeholder="PIN (4 digits)" maxlength="4" class="w-24 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500 font-mono text-center">
                                    </div>
                                    <button onclick="App.controllers.admin.createUser()" class="w-full py-2 bg-brand-600 text-white rounded-lg text-sm font-bold shadow-md hover:bg-brand-700">
                                        Create User
                                    </button>
                                </div>
                            </div>

                            <!-- User List -->
                            <div class="glass-panel p-6 md:col-span-2">
                                <h3 class="font-bold text-slate-700 mb-4"><i class="fa-solid fa-users mr-2"></i> Existing Users</h3>
                                <div class="overflow-x-auto">
                                    <table class="w-full text-sm text-left">
                                        <thead class="text-xs text-slate-400 uppercase bg-slate-50">
                                            <tr>
                                                <th class="px-4 py-2 rounded-l-lg">Name</th>
                                                <th class="px-4 py-2">Role</th>
                                                <th class="px-4 py-2">Email</th>
                                                <th class="px-4 py-2 rounded-r-lg">PIN</th>
                                            </tr>
                                        </thead>
                                        <tbody class="divide-y divide-slate-100">
                                            ${App.state.users.map(u => `
                                                <tr class="hover:bg-slate-50">
                                                    <td class="px-4 py-3 font-bold text-slate-700">${u.full_name}</td>
                                                    <td class="px-4 py-3"><span class="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded text-xs font-bold uppercase">${u.role}</span></td>
                                                    <td class="px-4 py-3 text-slate-500">${u.email}</td>
                                                    <td class="px-4 py-3 font-mono text-slate-400">****</td>
                                                </tr>
                                            `).join('')}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
                App.ui.renderPage('admin', html);
            },

            saveSettings: () => {
                const url = document.getElementById('admin-gas-url').value;
                if (!url) return alert("URL cannot be empty");

                localStorage.setItem('rad_gas_url', url);
                alert("Settings Saved. Reloading...");
                location.reload();
            },

            createUser: async () => {
                const name = document.getElementById('new-user-name').value;
                const email = document.getElementById('new-user-email').value;
                const role = document.getElementById('new-user-role').value;
                const pin = document.getElementById('new-user-pin').value;

                if (!name || !email || !pin || pin.length < 4) return alert("Please fill all fields (PIN must be 4 digits)");

                App.ui.showLoading(true);
                try {
                    const newUser = {
                        id: App.helpers.generateId('USR'),
                        full_name: name,
                        email: email,
                        role: role,
                        pin: pin,
                        created_at: new Date().toISOString()
                    };

                    // Optimistic update
                    App.state.users.push(newUser);
                    App.controllers.admin.render(); // Re-render to show new user

                    // Sync
                    await API.request('createUser', newUser);
                    alert("User Created Successfully");
                } catch (e) {
                    console.error(e);
                    alert("Failed to create user");
                } finally {
                    App.ui.showLoading(false);
                }
            }
        },

        patientPortal: {
            render: () => {
                const user = App.state.user;
                if (!user || user.role !== 'Patient') {
                    App.state.user = null;
                    return App.router.navigate('reception');
                }

                const patientId = user.id;
                const visits = App.state.visits.filter(v => v.patient_id === patientId);
                visits.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

                const html = `
                    <div class="h-full flex flex-col bg-slate-50">
                        <!-- Header -->
                        <div class="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center shadow-sm">
                            <div>
                                <h1 class="text-xl font-bold text-slate-800">My Health Portal</h1>
                                <p class="text-sm text-slate-500">Welcome, ${user.full_name}</p>
                            </div>
                            <button onclick="App.controllers.auth.logout()" class="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-sm font-bold hover:bg-slate-200">
                                <i class="fa-solid fa-sign-out-alt mr-2"></i> Logout
                            </button>
                        </div>

                        <!-- Content -->
                        <div class="flex-1 overflow-y-auto p-6 max-w-4xl mx-auto w-full space-y-6">
                            
                            <!-- Profile Card -->
                            <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
                                <div class="w-16 h-16 bg-brand-100 text-brand-600 rounded-full flex items-center justify-center text-2xl">
                                    <i class="fa-regular fa-user"></i>
                                </div>
                                <div>
                                    <h2 class="text-lg font-bold text-slate-800">${user.full_name}</h2>
                                    <p class="text-slate-500 text-sm">Patient ID: ${user.id}</p>
                                    <p class="text-slate-500 text-sm">Phone: ${user.phone}</p>
                                </div>
                            </div>

                            <!-- History -->
                            <h3 class="font-bold text-slate-700 text-lg">Examination History</h3>
                            
                            ${visits.length === 0 ?
                        '<div class="text-center py-12 text-slate-400">No history found.</div>' :
                        visits.map(v => {
                            const vStudies = App.state.studies.filter(s => s.visit_id === v.id);
                            return `
                                        <div class="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                                            <div class="bg-slate-50 px-6 py-3 border-b border-slate-100 flex justify-between items-center">
                                                <span class="font-bold text-slate-700 text-sm">${new Date(v.check_in_time).toLocaleDateString()}</span>
                                                <span class="text-xs text-slate-500 uppercase font-bold tracking-wider">${v.status || 'Done'}</span>
                                            </div>
                                            <div class="divide-y divide-slate-50">
                                                ${vStudies.map(s => {
                                let actionBtn = '<span class="text-slate-400 text-xs italic">Processing...</span>';
                                // Check status. Actually we should check if reported.
                                if (s.report_content && s.status === 'Ready' || s.status === 'Reported') { // Assuming 'Reported' or 'Ready'
                                    // We use 'Reported' in tech flow, but plan said 'Ready'. Let's check logic.
                                    // Actually status is fine. If content exists, it's viewable? 
                                    // Strict requirement: "if not reported yet, it shows not reported"
                                    actionBtn = `<button onclick="App.controllers.reception.viewReport('${s.id}')" class="px-3 py-1 bg-brand-600 text-white text-xs rounded-lg font-bold hover:bg-brand-700 shadow-lg shadow-brand-500/30">View Report</button>`;
                                } else {
                                    actionBtn = '<span class="px-2 py-1 bg-amber-100 text-amber-700 rounded text-[10px] font-bold uppercase">Not Reported</span>';
                                }

                                return `
                                                        <div class="px-6 py-4 flex justify-between items-center group hover:bg-slate-50 transition-colors">
                                                            <div>
                                                                <h4 class="font-bold text-slate-800 text-sm">${s.modality} - ${s.study_name}</h4>
                                                                <p class="text-xs text-slate-400 mt-0.5">Ref: ${s.id}</p>
                                                            </div>
                                                            <div>${actionBtn}</div>
                                                        </div>
                                                    `;
                            }).join('')}
                                            </div>
                                        </div>
                                    `;
                        }).join('')
                    }
                        </div>
                    </div>
                `;
                App.ui.renderPage('patient-portal', html);
            }
        }
    },

    // --- Helpers ---
    components: {
        studyCard: (study, isTech = false) => {
            const patient = App.helpers.getPatient(study.visit_id);
            const color = { 'Waiting': 'bg-amber-100 text-amber-700', 'Scanning': 'bg-blue-100 text-blue-700', 'Reporting': 'bg-purple-100 text-purple-700' }[study.status] || 'bg-slate-100 text-slate-700';

            // Parse image links count
            let imageCount = 0;
            try {
                const links = study.image_links ? JSON.parse(study.image_links) : [];
                imageCount = links.length;
            } catch (e) {
                imageCount = 0;
            }

            let actions = '';
            if (isTech) {
                if (study.status === 'Waiting') actions = `<button onclick="App.controllers.technician.startScan('${study.id}')" class="px-3 py-1 bg-blue-600 text-white text-xs rounded-lg font-bold hover:bg-blue-700">Start</button>`;
                if (study.status === 'Scanning') actions = `<button onclick="App.controllers.technician.completeScan('${study.id}')" class="px-3 py-1 bg-green-600 text-white text-xs rounded-lg font-bold hover:bg-green-700">Complete</button>`;
            }

            const imageBtn = isTech ? `
                <button onclick="App.controllers.technician.openImageModal('${study.id}')" 
                    class="px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded-lg font-bold hover:bg-slate-200 flex items-center gap-1">
                    <i class="fa-solid fa-images"></i> ${imageCount > 0 ? imageCount : 'Add'}
                </button>
            ` : '';

            return `
                <div class="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex justify-between items-center group hover:border-brand-200 transition-colors">
                    <div class="flex items-center gap-4">
                        <div class="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-500 text-sm">
                            ${study.modality}
                        </div>
                        <div>
                            <h4 class="font-bold text-slate-800">${patient ? patient.full_name : 'Unknown User'}</h4>
                            <p class="text-xs text-slate-500">${study.study_name}</p>
                        </div>
                    </div>
                    <div class="flex flex-col items-end gap-2">
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${color}">${study.status}</span>
                        <div class="flex gap-2">
                            ${imageBtn}
                            ${actions}
                        </div>
                    </div>
                </div>
            `;
        },

        miniVisitCard: (visit) => {
            const p = App.helpers.getPatient(visit.patient_id);
            return `
                <div onclick="App.controllers.reception.openPatientFile('${visit.patient_id}')" class="bg-white/50 p-3 rounded-lg border border-white/50 hover:bg-white cursor-pointer transition-all flex justify-between items-center group">
                    <div>
                        <p class="font-bold text-xs text-slate-700 group-hover:text-brand-600 truncate w-32">${p ? p.full_name : 'Unknown'}</p>
                        <p class="text-[10px] text-slate-400">${new Date(visit.check_in_time).toLocaleDateString()}</p>
                    </div>
                    <i class="fa-solid fa-chevron-right text-slate-300 text-xs group-hover:text-brand-400"></i>
                </div>
            `;
        }
    },

    helpers: {
        getPatient: (id) => {
            if (!id) return null;
            // If it's a Patient ID (starts with PT or doesn't start with VS)
            if (id.startsWith('PT')) {
                return App.state.patients.find(p => p.id === id);
            }
            // Assume it's a Visit ID (IS)
            const visit = App.state.visits.find(v => v.id === id);
            if (!visit) return null;
            return App.state.patients.find(p => p.id === visit.patient_id);
        },
        getPatientName: (id) => {
            const p = App.helpers.getPatient(id);
            return p ? p.full_name : 'Unknown';
        },
        generateId: (prefix) => {
            return prefix + '-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
        },
        getRecentVisits: (limit = 5) => {
            const v = [...App.state.visits];
            v.sort((a, b) => new Date(b.created_at || b.check_in_time) - new Date(a.created_at || a.check_in_time));
            return v.slice(0, limit);
        },
        calculateAge: (dob) => {
            if (!dob) return;
            const birthDate = new Date(dob);
            const today = new Date();
            let age = today.getFullYear() - birthDate.getFullYear();
            const m = today.getMonth() - birthDate.getMonth();
            if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
                age--;
            }
            const ageInput = document.getElementById('pat-age');
            if (ageInput) ageInput.value = age;
        }
    }
};

// Start
document.addEventListener('DOMContentLoaded', App.init);
