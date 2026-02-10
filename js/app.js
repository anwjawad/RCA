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

        // 1. Setup Router
        App.router.init();

        // 2. Load Data (Users, etc)
        await App.loadData();

        // 3. User Session Check
        const savedUser = localStorage.getItem('rad_user');
        if (savedUser) {
            App.state.user = JSON.parse(savedUser);
            App.ui.updateUserDisplay();
        } else {
            App.controllers.auth.showLogin();
        }

        // 4. Start Polling (Disabled)
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
            const nameEl = document.getElementById('user-name-display');
            const roleEl = document.getElementById('user-role-display');
            const loginModal = document.getElementById('login-modal');

            if (user) {
                if (nameEl) nameEl.textContent = user.full_name;
                if (roleEl) roleEl.textContent = user.role;
                if (loginModal) loginModal.classList.add('hidden');

                // Show Logout
                // Could add a logout button visibility toggle here if needed
            } else {
                if (loginModal) loginModal.classList.remove('hidden');
            }
        }
    },

    // --- Router ---
    router: {
        init: () => {
            // Simple hash router or direct navigate
            App.router.navigate('reception'); // Default
        },

        navigate: (page) => {
            const user = App.state.user;

            // Strict Navigation Guard
            if (!user) {
                App.controllers.auth.showLogin();
                return;
            }

            // Role Restrictions
            if (user.role === 'Patient' && page !== 'patient-portal') {
                page = 'patient-portal';
            } else if (user.role !== 'Patient' && page === 'patient-portal') {
                page = 'reception'; // Bounce back
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

                        // Navigate based on role (Strict Redirects)
                        if (user.role === 'Technician') App.router.navigate('technician');
                        else if (user.role === 'Reception') App.router.navigate('reception');
                        else App.router.navigate('reception'); // Admin/Radio default

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
                        localStorage.setItem('rad_user', JSON.stringify(sessionUser));
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

            render: () => {
                const studies = App.state.studies;
                const waiting = studies.filter(s => s.status === 'Waiting');

                // Sort waiting by date
                waiting.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

                const canEdit = ['Reception', 'Admin', 'Radiologist'].includes(App.state.user.role);
                const newBtn = canEdit ? `<button onclick="App.controllers.reception.openNewVisitModal()" class="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg shadow-md shadow-brand-500/20 transition-all font-bold text-sm flex items-center gap-2"><i class="fa-solid fa-plus"></i> New Visit</button>` : '';

                const html = `
                    <div class="h-full flex flex-col p-6 gap-6">
                        <!-- Action Bar -->
                        <div class="flex flex-col md:flex-row justify-between items-center gap-4">
                            <h2 class="text-2xl font-display font-bold text-slate-800">Reception Desk</h2>
                            
                            <!-- Search & Actions -->
                            <div class="flex items-center gap-3 w-full md:w-auto">
                                <div class="relative flex-1 md:w-64">
                                    <i class="fa-solid fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"></i>
                                    <input type="text" id="patient-search" onkeyup="App.controllers.reception.searchPatients(this.value)" 
                                        class="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-4 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500 shadow-sm"
                                        placeholder="Search patient...">
                                    <!-- Search Results Dropdown -->
                                    <div id="search-results" class="absolute top-full left-0 right-0 bg-white shadow-xl rounded-xl border border-slate-100 mt-2 hidden z-20 max-h-60 overflow-y-auto"></div>
                                </div>

                                ${newBtn}
                            </div>
                        </div>

                        <!-- Content Grid -->
                        <div class="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 overflow-hidden">
                            <!-- Waiting List -->
                            <div class="lg:col-span-2 glass-panel p-6 overflow-hidden flex flex-col">
                                <h3 class="font-bold text-slate-500 uppercase text-xs mb-4 flex items-center">
                                    <i class="fa-regular fa-clock mr-2"></i> Waiting Room (${waiting.length})
                                </h3>
                                <div class="overflow-y-auto flex-1 space-y-3">
                                    ${waiting.map(s => App.components.studyCard(s)).join('')}
                                    ${waiting.length === 0 ? '<div class="text-center text-slate-400 py-10">No patients waiting.</div>' : ''}
                                </div>
                            </div>
                            
                            <!-- Recent Activity (All Visits) -->
                            <div class="glass-panel p-6 overflow-hidden flex flex-col">
                                <h3 class="font-bold text-slate-500 uppercase text-xs mb-4 flex items-center">
                                    <i class="fa-solid fa-history mr-2"></i> Recent Visits
                                </h3>
                                <div class="overflow-y-auto flex-1 space-y-3 pr-2">
                                     ${App.helpers.getRecentVisits(5).map(v => App.components.miniVisitCard(v)).join('')}
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
                document.getElementById('pf-name').textContent = patient.full_name;
                document.getElementById('pf-info').textContent = `${patient.dob.split('T')[0]} | ${patient.gender} | ${patient.phone}`;

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

            // --- New Visit Modal ---
            openNewVisitModal: () => {
                const modal = document.getElementById('new-visit-modal');
                modal.classList.remove('hidden');

                // Populate Patient Select
                const select = document.getElementById('visit-patient-select');
                select.innerHTML = '<option value="">Select Existing Patient...</option>' +
                    App.state.patients.map(p => `<option value="${p.id}">${p.full_name} (${p.phone})</option>`).join('');

                // Reset Fields
                document.getElementById('visit-referrer').value = '';
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
                const patientId = document.getElementById('visit-patient-select').value;
                if (!patientId) return alert("Select a patient");
                if (App.controllers.reception.tempQueue.length === 0) return alert("Add at least one study");

                // --- OPTIMISTIC UI START ---
                // 1. Generate IDs Locally
                const visitId = App.helpers.generateId('VS');
                const visitData = {
                    id: visitId,
                    patient_id: patientId,
                    referrer_doctor: document.getElementById('visit-referrer').value,
                    check_in_time: document.getElementById('visit-date').value,
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
                const name = document.getElementById('pat-name').value;
                const dob = document.getElementById('pat-dob').value;
                const gender = document.getElementById('pat-gender').value;
                const phone = document.getElementById('pat-phone').value;

                if (!name || !dob) return alert("Fill required fields");

                // 1. Optimistic Update
                const newId = App.helpers.generateId('PT');
                const newPatient = { id: newId, full_name: name, dob, gender, phone };

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
            render: () => {
                const studies = App.state.studies;
                // Tech sees Waiting (to start) and Scanning (in progress)
                const todo = studies.filter(s => ['Waiting', 'Scanning'].includes(s.status));
                const isTech = ['Technician', 'Admin', 'Radiologist'].includes(App.state.user.role);

                const html = `
                    <div class="h-full flex flex-col p-6 gap-6">
                         <h2 class="text-2xl font-display font-bold text-slate-800">Technician Worklist</h2>
                         <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto pb-20">
                            ${todo.map(s => App.components.studyCard(s, isTech)).join('')}
                            ${todo.length === 0 ? '<div class="col-span-full text-center text-slate-400">No pending scans.</div>' : ''}
                         </div>
                    </div>
                `;
                App.ui.renderPage('technician', html);
            },

            startScan: async (id) => {
                if (!confirm("Start Scanning patient?")) return;
                // Optimistic UI
                const s = App.state.studies.find(x => x.id === id);
                if (s) s.status = 'Scanning';
                App.controllers.technician.render();

                await API.updateStudyStatus(id, 'Scanning');
            },

            completeScan: async (id) => {
                if (!confirm("Complete scan and send to Radiologist?")) return;
                const s = App.state.studies.find(x => x.id === id);
                if (s) s.status = 'Reporting';
                App.controllers.technician.render();

                await API.updateStudyStatus(id, 'Reporting');
            }
        },

        radiologist: {
            render: () => {
                const studies = App.state.studies;
                const reporting = studies.filter(s => s.status === 'Reporting');

                const html = `
                    <div class="h-full flex flex-col p-6 gap-6">
                        <h2 class="text-2xl font-display font-bold text-slate-800">Reporting Queue</h2>
                        <div class="flex-1 flex gap-6 overflow-hidden">
                            <!-- Queue List -->
                            <div class="w-1/3 glass-panel p-4 overflow-y-auto">
                                ${reporting.map(s => `
                                    <div onclick="App.controllers.radiologist.openEditor('${s.id}')" class="p-4 mb-3 bg-white border border-slate-100 rounded-xl shadow-sm hover:shadow-md cursor-pointer transition-all group">
                                        <div class="flex justify-between items-start mb-2">
                                            <span class="font-bold text-slate-800">${App.helpers.getPatientName(s.visit_id)}</span>
                                            <span class="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-bold">${s.modality}</span>
                                        </div>
                                        <p class="text-sm text-slate-500">${s.study_name}</p>
                                    </div>
                                `).join('')}
                                ${reporting.length === 0 ? '<div class="text-center text-slate-400 mt-10">Queue empty. Good job!</div>' : ''}
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
                App.state.currentStudy = study; // Store for printing

                const html = `
                    <div class="flex flex-col h-full bg-white rounded-xl overflow-hidden relative">
                        <!-- Toolbar -->
                        <div class="h-14 border-b border-slate-100 flex justify-between items-center px-4 bg-slate-50/50">
                            <div>
                                <h3 class="font-bold text-slate-800">${patient.full_name} <span class="text-slate-400 font-normal">| ${String(patient.dob).split('T')[0]}</span></h3>
                                <p class="text-xs text-slate-500">${study.study_name}</p>
                            </div>
                            <div class="flex gap-2">
                                <button onclick="App.controllers.radiologist.toggleTemplates()" class="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-sm hover:border-brand-300">
                                    <i class="fa-solid fa-wand-magic-sparkles mr-1"></i> Templates
                                </button>
                                <button onclick="App.controllers.radiologist.printReport()" class="px-4 py-1.5 bg-brand-600 text-white rounded-lg text-sm font-bold shadow-md hover:bg-brand-700">
                                    Sign & Print <i class="fa-solid fa-print ml-1"></i>
                                </button>
                            </div>
                        </div>

                        <div class="flex flex-1 overflow-hidden">
                            <!-- Editor Area -->
                            <div class="flex-1 p-8 overflow-y-auto bg-white relative">
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

                // Init Quill
                App.state.quill = new Quill('#quill-editor', {
                    theme: 'snow',
                    modules: { toolbar: [['bold', 'italic', 'underline'], [{ 'header': 1 }, { 'header': 2 }], [{ 'list': 'ordered' }, { 'list': 'bullet' }]] }
                });
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

            let actions = '';
            if (isTech) {
                if (study.status === 'Waiting') actions = `<button onclick="App.controllers.technician.startScan('${study.id}')" class="px-3 py-1 bg-blue-600 text-white text-xs rounded-lg font-bold hover:bg-blue-700">Start</button>`;
                if (study.status === 'Scanning') actions = `<button onclick="App.controllers.technician.completeScan('${study.id}')" class="px-3 py-1 bg-green-600 text-white text-xs rounded-lg font-bold hover:bg-green-700">Complete</button>`;
            }

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
                        ${actions}
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
        }
    }
};

// Start
document.addEventListener('DOMContentLoaded', App.init);
