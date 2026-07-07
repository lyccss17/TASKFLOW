// ===== app.js =====
// Configuration & shared state
const CONFIG = {
    API_URL: 'https://script.google.com/macros/s/AKfycbxYl-863SRru-YLYhTPQPSXhhK-uNqEkw93fc0tJSYCNlE8F2hvQWjYDmJbjjtmARSM/exec',
    ADMIN_PASSWORD: 'admin123'
};

let tasks = [], bulletins = [], stores = [], activityLog = [], charts = {};
let searchTerm = '', filteredTasks = [], currentTaskFilter = 'all';
let calendarDate = new Date();
let notifications = [], notificationIdCounter = 0;
let hasRequestedNotificationPermission = false;
let currentStoreChart = null;

// ========== UTILITY ==========
function formatDate(d) { if (!d) return ''; if (typeof d === 'string' && d.includes('T')) return d.split('T')[0]; return d; }
function getBulletinId(post) { return post.id || post.postid || post.bulletinid || post['Bulletin ID'] || `bul_${Date.now()}`; }

function openModal(title, body) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBody').innerHTML = body;
    document.getElementById('modal').classList.add('active');
}
function closeModal() {
    document.getElementById('modal').classList.remove('active');
    document.getElementById('modalBody').innerHTML = '';
}
function verifyPassword() {
    const p = prompt('🔐 Admin password:');
    if (p === null) return false;
    if (p === CONFIG.ADMIN_PASSWORD) return true;
    showToast('❌ Incorrect password', 'error');
    return false;
}
function showLoading(s) { document.getElementById('loading').style.display = s ? 'block' : 'none'; }
function showError(m) { const e = document.getElementById('errorDisplay'); e.textContent = m; e.style.display = 'block'; }
function hideError() { document.getElementById('errorDisplay').style.display = 'none'; }
function showToast(message, type = 'success') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// ========== NOTIFICATIONS ==========
function requestNotificationPermission() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') return;
    if (Notification.permission === 'denied') return;
    Notification.requestPermission();
    hasRequestedNotificationPermission = true;
}

function addNotification(title, body, type = 'info') {
    const id = ++notificationIdCounter;
    notifications.unshift({ id, title, body, time: new Date(), read: false, type });
    if (notifications.length > 100) notifications.pop();
    saveNotifications();
    updateNotificationBadge();
    renderNotifications();
    if ('Notification' in window && Notification.permission === 'granted') {
        try {
            new Notification(title, { body, icon: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23667eea"%3E%3Cpath d="M19 3h-4.18C14.4 1.84 13.3 1 12 1c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm2 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/%3E%3C/svg%3E' });
        } catch (e) {}
    }
}

function saveNotifications() { try { localStorage.setItem('taskflow_notifications', JSON.stringify(notifications)); } catch (e) {} }
function loadNotifications() {
    try {
        const saved = localStorage.getItem('taskflow_notifications');
        if (saved) {
            const parsed = JSON.parse(saved);
            notifications = parsed;
            if (notifications.length) notificationIdCounter = Math.max(...notifications.map(n => n.id || 0), 0);
            updateNotificationBadge();
            renderNotifications();
        }
    } catch (e) {}
}
function updateNotificationBadge() {
    const unread = notifications.filter(n => !n.read).length;
    const badge = document.getElementById('notifBadge');
    if (unread > 0) { badge.style.display = 'inline'; badge.textContent = unread > 99 ? '99+' : unread; }
    else { badge.style.display = 'none'; }
}
function renderNotifications() {
    const container = document.getElementById('notificationList');
    if (!notifications.length) { container.innerHTML = '<div class="notif-empty">No notifications</div>'; return; }
    let html = '';
    notifications.slice(0, 50).forEach(n => {
        const time = n.time ? new Date(n.time).toLocaleString() : '';
        html += `<div class="notification-item ${n.read ? '' : 'unread'}">
            <button class="notif-dismiss" onclick="dismissNotification(${n.id})">&times;</button>
            <div><strong>${n.title}</strong></div>
            <div>${n.body}</div>
            <div class="notif-time">${time}</div>
        </div>`;
    });
    container.innerHTML = html;
}
function dismissNotification(id) { notifications = notifications.filter(n => n.id !== id); saveNotifications(); updateNotificationBadge(); renderNotifications(); }
function markAllRead() { notifications.forEach(n => n.read = true); saveNotifications(); updateNotificationBadge(); renderNotifications(); showToast('All notifications marked as read'); }
function toggleNotifications() {
    const panel = document.getElementById('notificationPanel');
    panel.classList.toggle('open');
    if (panel.classList.contains('open')) {
        const unread = notifications.filter(n => !n.read);
        if (unread.length) { unread.forEach(n => n.read = true); saveNotifications(); updateNotificationBadge(); renderNotifications(); }
    }
}

// ========== API ==========
async function callAPI(action, data = {}) {
    const params = new URLSearchParams({ action, ...data });
    const res = await fetch(`${CONFIG.API_URL}?${params.toString()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}
async function fetchTasks() { return (await callAPI('getTasks')) || []; }
async function fetchBulletins() { return (await callAPI('getBulletins')) || []; }
async function fetchStores() { return (await callAPI('getStores')) || []; }
async function fetchActivityLog() { return (await callAPI('getActivityLog')) || []; }
async function addTaskToSheet(d) { return callAPI('addTask', d); }
async function updateTaskInSheet(id, d) { return callAPI('updateTask', { id, ...d }); }
async function deleteTaskFromSheet(id) { return callAPI('deleteTask', { id }); }
async function addBulletinToSheet(content, type) { return callAPI('addBulletin', { content, type }); }
async function updateBulletinInSheet(id, content, type) { return callAPI('updateBulletin', { id, content, type }); }
async function deleteBulletinFromSheet(id) { return callAPI('deleteBulletin', { id }); }
async function addStoreToSheet(d) { return callAPI('addStore', d); }
async function updateStoreInSheet(id, d) { return callAPI('updateStore', { id, ...d }); }
async function deleteStoreFromSheet(id) { return callAPI('deleteStore', { id }); }

// ========== LOAD ==========
async function loadData() {
    showLoading(true); hideError();
    try {
        const [t, b, s, a] = await Promise.all([fetchTasks(), fetchBulletins(), fetchStores(), fetchActivityLog()]);
        if (tasks.length > 0 && t.length > tasks.length) {
            const newTasks = t.filter(task => !tasks.some(ot => (ot.id || ot.taskid) === (task.id || task.taskid)));
            newTasks.forEach(task => {
                addNotification('📋 New Task', `${task.title || 'Task'} assigned to ${task.assignedto || task.assignedTo || 'someone'}`);
            });
        }
        tasks = t || [];
        bulletins = b || [];
        stores = s || [];
        activityLog = a || [];
        loadNotifications();
        renderAll();
    } catch (e) { showError('Failed to load data. Check API URL.'); console.error(e); }
    finally { showLoading(false); }
}

// ========== RENDER ALL ==========
function renderAll() {
    renderDashboard();
    renderAllTasks();
    renderManagerTasks();
    renderStoreButtons();
    renderStores();
    renderActivityLog();
    renderRecentActivity();
    renderBulletin();
    renderCalendar();
}

function renderDashboard() {
    const total = tasks.length, completed = tasks.filter(t => t.status?.toLowerCase() === 'completed').length;
    const today = new Date().toISOString().split('T')[0];
    const overdue = tasks.filter(t => formatDate(t.duedate) < today && t.status?.toLowerCase() !== 'completed').length;
    const inProgress = tasks.filter(t => t.status?.toLowerCase() === 'in progress').length;
    document.getElementById('totalTasks').textContent = total;
    document.getElementById('completedTasks').textContent = completed;
    document.getElementById('overdueTasks').textContent = overdue;
    document.getElementById('inProgressTasks').textContent = inProgress;
    document.getElementById('totalStores').textContent = stores.length;
    renderCharts();
}

function renderCharts() {
    const p = { High: 0, Medium: 0, Low: 0 };
    tasks.forEach(t => { if (t.priority) p[t.priority] = (p[t.priority] || 0) + 1; });
    if (charts.priority) charts.priority.destroy();
    charts.priority = new Chart('priorityChart', {
        type: 'doughnut',
        data: { labels: ['High', 'Medium', 'Low'], datasets: [{ data: [p.High || 0, p.Medium || 0, p.Low || 0], backgroundColor: ['#f87171', '#fbbf24', '#60a5fa'] }] },
        options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 9 } } }, title: { display: false } } }
    });
    const s = { Pending: 0, 'In Progress': 0, Completed: 0 };
    tasks.forEach(t => {
        if (t.status) {
            const k = t.status.toLowerCase();
            if (k === 'pending') s.Pending++;
            else if (k === 'in progress') s['In Progress']++;
            else if (k === 'completed') s.Completed++;
        }
    });
    if (charts.status) charts.status.destroy();
    charts.status = new Chart('statusChart', {
        type: 'doughnut',
        data: { labels: ['Pending', 'In Progress', 'Completed'], datasets: [{ data: [s.Pending || 0, s['In Progress'] || 0, s.Completed || 0], backgroundColor: ['#fbbf24', '#60a5fa', '#34d399'] }] },
        options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 9 } } }, title: { display: false } } }
    });
}

function renderBulletin() {
    const c = document.getElementById('bulletinContent');
    if (!bulletins.length) { c.innerHTML = '<div class="empty-state"><i class="fas fa-thumbtack"></i><p>No posts</p></div>'; return; }
    let html = '';
    const sorted = [...bulletins].reverse();
    sorted.forEach(post => {
        const id = getBulletinId(post);
        let date = post.timestamp || post.dateposted || post.date || '';
        if (date.includes('T')) { const d = new Date(date); d.setHours(d.getHours() + 8); date = d.toISOString().replace('T', ' ').slice(0, 16); }
        html += `<div class="sticky-note">
            <div class="note-content">${post.content || ''}</div>
            <div class="note-footer">
                <span class="note-badge">${post.type || 'Note'}</span>
                <span><i class="far fa-clock"></i> ${date || ''}</span>
                <div class="note-actions">
                    <button class="edit-note" onclick="showEditBulletin('${id}')"><i class="fas fa-pen"></i></button>
                    <button class="delete-note" onclick="showDeleteBulletin('${id}')"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        </div>`;
    });
    c.innerHTML = html;
}

function renderAllTasks() {
    const c = document.getElementById('allTasksContainer');
    let list = searchTerm ? filteredTasks : tasks;
    if (currentTaskFilter === 'active') list = list.filter(t => t.status?.toLowerCase() !== 'completed');
    else if (currentTaskFilter === 'completed') list = list.filter(t => t.status?.toLowerCase() === 'completed');
    if (!list.length) { c.innerHTML = '<div class="empty-state"><i class="fas fa-tasks"></i><p>No tasks</p></div>'; return; }
    let html = '<div class="table-container"><table><thead><tr><th>Title</th><th>Store</th><th>Assigned</th><th>Priority</th><th>Due</th><th>Status</th><th>Progress</th></tr></thead><tbody>';
    list.forEach(task => {
        const due = formatDate(task.duedate), today = new Date().toISOString().split('T')[0];
        const overdue = due && due < today && task.status?.toLowerCase() !== 'completed';
        html += `<tr class="${overdue ? 'overdue' : ''}"><td>${task.title || ''}</td><td>${task.store || ''}</td><td>${task.assignedto || task.assignedTo || ''}</td>
            <td class="priority-${(task.priority || '').toLowerCase()}">${task.priority || ''}</td>
            <td class="${overdue ? 'due-date' : ''}">${due || ''}</td>
            <td><span class="badge badge-${(task.status || 'pending').toLowerCase().replace(' ', '-')}">${task.status || 'Pending'}</span></td>
            <td><div class="progress-container"><div class="progress-bar" style="width:${task.progress || 0}%;background:${(task.progress || 0) === 100 ? '#34d399' : '#667eea'}"></div></div> ${task.progress || 0}%</td></tr>`;
    });
    html += '</tbody></table></div>';
    c.innerHTML = html;
}

function renderManagerTasks() {
    const c = document.getElementById('managerTasksContainer');
    if (!tasks.length) { c.innerHTML = '<div class="empty-state"><i class="fas fa-tasks"></i><p>No tasks</p></div>'; return; }
    let html = '<div class="table-container"><table><thead><tr><th>Title</th><th>Store</th><th>Assigned</th><th>Priority</th><th>Due</th><th>Status</th><th>Progress</th><th>Actions</th></tr></thead><tbody>';
    tasks.forEach(task => {
        const id = task.id || task.taskid || task.taskId || task.ID || task['Task ID'];
        const due = formatDate(task.duedate), today = new Date().toISOString().split('T')[0];
        const overdue = due && due < today && task.status?.toLowerCase() !== 'completed';
        html += `<tr class="${overdue ? 'overdue' : ''}"><td>${task.title || ''}</td><td>${task.store || ''}</td><td>${task.assignedto || task.assignedTo || ''}</td>
            <td class="priority-${(task.priority || '').toLowerCase()}">${task.priority || ''}</td>
            <td class="${overdue ? 'due-date' : ''}">${due || ''}</td>
            <td><span class="badge badge-${(task.status || 'pending').toLowerCase().replace(' ', '-')}">${task.status || 'Pending'}</span></td>
            <td><div class="progress-container"><div class="progress-bar" style="width:${task.progress || 0}%;background:${(task.progress || 0) === 100 ? '#34d399' : '#667eea'}"></div></div> ${task.progress || 0}%</td>
            <td><button class="btn btn-warning btn-sm" onclick="showEditTask('${id}')"><i class="fas fa-edit"></i></button> <button class="btn btn-danger btn-sm" onclick="showDeleteTask('${id}')"><i class="fas fa-trash"></i></button></td></tr>`;
    });
    html += '</tbody></table></div>';
    c.innerHTML = html;
}

function renderStores() {
    const c = document.getElementById('storesContainer');
    if (!stores.length) { c.innerHTML = '<div class="empty-state"><i class="fas fa-store"></i><p>No stores</p></div>'; return; }
    let html = '<div class="table-container"><table><thead><tr><th>Store</th><th>Actions</th></tr></thead><tbody>';
    stores.forEach(s => { html += `<tr><td><strong>${s.name || ''}</strong></td><td><button class="btn btn-warning btn-sm" onclick="showEditStore('${s.storeid}')"><i class="fas fa-edit"></i></button> <button class="btn btn-danger btn-sm" onclick="showDeleteStore('${s.storeid}')"><i class="fas fa-trash"></i></button></td></tr>`; });
    html += '</tbody></table></div>';
    c.innerHTML = html;
}

function renderActivityLog() {
    const c = document.getElementById('activityLogContainer');
    if (!activityLog.length) { c.innerHTML = '<div class="empty-state"><i class="fas fa-history"></i><p>No activity</p></div>'; return; }
    let html = '';
    activityLog.slice(0, 30).forEach(log => {
        let ts = log.timestamp || '';
        if (ts.includes('T')) { const d = new Date(ts); d.setHours(d.getHours() + 8); ts = d.toISOString().replace('T', ' ').slice(0, 19); }
        html += `<div class="log-entry"><div><span class="log-action">${log.action || ''}</span> ${log.details || ''}</div><div class="log-time"><i class="far fa-clock"></i> ${ts || ''} by ${log.user || 'System'}</div></div>`;
    });
    c.innerHTML = html;
}

function renderRecentActivity() {
    const c = document.getElementById('recentActivity');
    const recent = activityLog.slice(0, 8);
    if (!recent.length) { c.innerHTML = '<div class="empty-state"><i class="fas fa-clock"></i><p>No recent activity</p></div>'; return; }
    let html = '';
    recent.forEach(log => {
        let ts = log.timestamp || '';
        if (ts.includes('T')) { const d = new Date(ts); d.setHours(d.getHours() + 8); ts = d.toISOString().replace('T', ' ').slice(0, 19); }
        html += `<div class="log-entry"><div><span class="log-action">${log.action || ''}</span> ${log.details || ''}</div><div class="log-time"><i class="far fa-clock"></i> ${ts || ''} by ${log.user || 'System'}</div></div>`;
    });
    c.innerHTML = html;
}

// ========== CALENDAR ==========
function renderCalendar() {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    document.getElementById('calendarMonthYear').textContent = new Date(year, month).toLocaleString('default', { month: 'long', year: 'numeric' });
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    let html = '';
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    dayNames.forEach(d => { html += `<div class="calendar-header">${d}</div>`; });
    for (let i = firstDay - 1; i >= 0; i--) {
        const day = daysInPrevMonth - i;
        html += `<div class="calendar-day empty other-month"><div class="day-number">${day}</div></div>`;
    }
    for (let day = 1; day <= daysInMonth; day++) {
        const dateObj = new Date(year, month, day);
        const dateStr = dateObj.toISOString().split('T')[0];
        const isToday = dateStr === todayStr;
        const dayTasks = tasks.filter(t => formatDate(t.duedate) === dateStr);
        const sorted = [...dayTasks].sort((a, b) => {
            const aC = a.status?.toLowerCase() === 'completed';
            const bC = b.status?.toLowerCase() === 'completed';
            if (aC && !bC) return 1;
            if (!aC && bC) return -1;
            return 0;
        });
        let tasksHtml = '';
        sorted.slice(0, 4).forEach(task => {
            const status = task.status?.toLowerCase() || 'pending';
            const isOverdue = dateStr < todayStr && status !== 'completed';
            let cls = status === 'completed' ? 'completed' : status === 'in progress' ? 'inprogress' : isOverdue ? 'overdue' : 'pending';
            const name = task.title && task.title.length > 22 ? task.title.slice(0, 20) + '…' : (task.title || 'Task');
            tasksHtml += `<div class="task-item ${cls}" onclick="event.stopPropagation();showTaskDetails('${task.id || task.taskid || ''}')" title="${task.title || 'Task'}">${name}</div>`;
        });
        if (sorted.length > 4) tasksHtml += `<div class="task-more" onclick="event.stopPropagation();showDayTasks('${dateStr}')">+${sorted.length - 4} more</div>`;
        const classes = `calendar-day ${isToday ? 'today' : ''}`;
        html += `<div class="${classes}" onclick="showDayTasks('${dateStr}')">
            <div class="day-number">${day}</div>
            ${dayTasks.length > 0 ? `<div class="day-tasks">${tasksHtml}</div>` : ''}
        </div>`;
    }
    const remaining = (7 - ((firstDay + daysInMonth) % 7)) % 7;
    for (let day = 1; day <= remaining; day++) {
        html += `<div class="calendar-day empty other-month"><div class="day-number">${day}</div></div>`;
    }
    document.getElementById('calendarContainer').innerHTML = html;
}
function changeMonth(delta) { calendarDate.setMonth(calendarDate.getMonth() + delta); renderCalendar(); }
function goToday() { calendarDate = new Date(); renderCalendar(); }
function showTaskDetails(taskId) {
    const task = tasks.find(t => (t.id || t.taskid || t.taskId || t.ID || t['Task ID']) === taskId);
    if (!task) { showToast('Task not found', 'error'); return; }
    const status = task.status?.toLowerCase() || 'pending';
    const badgeClass = status === 'completed' ? 'badge-completed' : status === 'in progress' ? 'badge-inprogress' : 'badge-pending';
    const due = formatDate(task.duedate);
    const today = new Date().toISOString().split('T')[0];
    const isOverdue = due && due < today && status !== 'completed';
    openModal('📋 Task Details', `
        <div style="padding:0.5rem 0;">
            <h3 style="margin-bottom:0.3rem;">${task.title || 'Task'}</h3>
            <p style="color:#64748b;font-size:0.9rem;">${task.description || 'No description'}</p>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;margin-top:0.8rem;font-size:0.85rem;">
                <div><strong>Store:</strong> ${task.store || '-'}</div>
                <div><strong>Assigned:</strong> ${task.assignedto || task.assignedTo || '-'}</div>
                <div><strong>Priority:</strong> <span class="priority-${(task.priority || '').toLowerCase()}">${task.priority || '-'}</span></div>
                <div><strong>Due:</strong> ${due || '-'} ${isOverdue ? '⚠️' : ''}</div>
                <div><strong>Status:</strong> <span class="badge ${badgeClass}">${task.status || 'Pending'}</span></div>
                <div><strong>Progress:</strong> ${task.progress || 0}%</div>
            </div>
            ${task.remarks ? `<div style="margin-top:0.5rem;font-size:0.85rem;"><strong>Remarks:</strong> ${task.remarks}</div>` : ''}
        </div>
    `);
}
function showDayTasks(dateStr) {
    const dayTasks = tasks.filter(t => formatDate(t.duedate) === dateStr);
    if (!dayTasks.length) { showToast(`No tasks for ${dateStr}`, 'info'); return; }
    let html = `<div style="max-height:350px;overflow-y:auto;">`;
    dayTasks.forEach(t => {
        const status = t.status?.toLowerCase() || 'pending';
        const badgeClass = status === 'completed' ? 'badge-completed' : status === 'in progress' ? 'badge-inprogress' : 'badge-pending';
        const today = new Date().toISOString().split('T')[0];
        const isOverdue = dateStr < today && status !== 'completed';
        const taskId = t.id || t.taskid || t.taskId || t.ID || t['Task ID'];
        html += `<div style="padding:0.4rem 0;border-bottom:1px solid #eef2f6;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.3rem;cursor:pointer;" onclick="showTaskDetails('${taskId}')">
            <span><strong>${t.title || 'Task'}</strong> <span style="font-size:0.7rem;color:#64748b;">${t.assignedto || t.assignedTo || ''}</span></span>
            <span><span class="badge ${badgeClass}">${t.status || 'Pending'}</span> ${isOverdue ? '<span style="color:#ef4444;font-weight:600;font-size:0.7rem;">⚠️ Overdue</span>' : ''}</span>
        </div>`;
    });
    html += `</div>`;
    const dateDisplay = new Date(dateStr).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    openModal(`📅 ${dateDisplay} (${dayTasks.length} tasks)`, html);
}

// ========== TASK CRUD ==========
function showAddTask() { if (!verifyPassword()) return; openModal('Add New Task', `
    <div class="password-protected"><i class="fas fa-lock"></i> Admin</div>
    <div class="form-group"><label>Title *</label><input type="text" id="taskTitle" placeholder="Title"></div>
    <div class="form-group"><label>Description</label><textarea id="taskDescription"></textarea></div>
    <div class="form-group"><label>Store *</label><select id="taskStore">${stores.map(s => `<option value="${s.name}">${s.name}</option>`).join('')}</select></div>
    <div class="form-group"><label>Assigned *</label><input type="text" id="taskAssigned" placeholder="Name"></div>
    <div class="form-group"><label>Priority</label><select id="taskPriority"><option>High</option><option selected>Medium</option><option>Low</option></select></div>
    <div class="form-group"><label>Due Date *</label><input type="date" id="taskDueDate"></div>
    <div class="form-group"><label>Status</label><select id="taskStatus"><option>Pending</option><option>In Progress</option><option>Completed</option></select></div>
    <div class="form-group"><label>Progress %</label><input type="number" id="taskProgress" value="0" min="0" max="100"></div>
    <div class="form-group"><label>Remarks</label><input type="text" id="taskRemarks"></div>
    <button class="btn btn-primary" onclick="addTask()" style="width:100%;"><i class="fas fa-save"></i> Create</button>
`); }

async function addTask() {
    const title = document.getElementById('taskTitle').value.trim(), store = document.getElementById('taskStore').value, assignedTo = document.getElementById('taskAssigned').value.trim(), dueDate = document.getElementById('taskDueDate').value;
    if (!title || !store || !assignedTo || !dueDate) { alert('Fill all required fields'); return; }
    try {
        showLoading(true);
        await addTaskToSheet({ title, description: document.getElementById('taskDescription').value.trim(), store, assignedTo, priority: document.getElementById('taskPriority').value, dueDate, status: document.getElementById('taskStatus').value, progress: parseInt(document.getElementById('taskProgress').value) || 0, remarks: document.getElementById('taskRemarks').value.trim(), createdBy: 'Admin' });
        closeModal(); await loadData();
        showToast('✅ Task added', 'success');
        addNotification('📋 Task Created', `"${title}" assigned to ${assignedTo}`);
    } catch (e) { showToast('❌ ' + e.message, 'error'); } finally { showLoading(false); }
}

function showEditTask(id) { if (!verifyPassword()) return; const task = tasks.find(t => [t.id, t.taskid, t.taskId, t.ID, t['Task ID']].includes(id)); if (!task) { alert('Task not found'); return; } openModal('Edit Task', `
    <div class="password-protected"><i class="fas fa-lock"></i> Admin</div>
    <div class="form-group"><label>Title *</label><input type="text" id="editTaskTitle" value="${task.title || ''}"></div>
    <div class="form-group"><label>Description</label><textarea id="editTaskDescription">${task.description || ''}</textarea></div>
    <div class="form-group"><label>Store *</label><select id="editTaskStore">${stores.map(s => `<option value="${s.name}" ${s.name === task.store ? 'selected' : ''}>${s.name}</option>`).join('')}</select></div>
    <div class="form-group"><label>Assigned *</label><input type="text" id="editTaskAssigned" value="${task.assignedto || task.assignedTo || ''}"></div>
    <div class="form-group"><label>Priority</label><select id="editTaskPriority">${['High', 'Medium', 'Low'].map(p => `<option value="${p}" ${p === task.priority ? 'selected' : ''}>${p}</option>`).join('')}</select></div>
    <div class="form-group"><label>Due Date *</label><input type="date" id="editTaskDueDate" value="${formatDate(task.duedate)}"></div>
    <div class="form-group"><label>Remarks</label><input type="text" id="editTaskRemarks" value="${task.remarks || ''}"></div>
    <p style="font-size:0.8rem;color:#64748b;">Status & progress managed in Store View</p>
    <button class="btn btn-warning" onclick="updateTask('${id}')" style="width:100%;"><i class="fas fa-save"></i> Update</button>
`); }

async function updateTask(id) {
    const task = tasks.find(t => [t.id, t.taskid, t.taskId, t.ID, t['Task ID']].includes(id));
    if (!task) { alert('Task not found'); return; }
    const title = document.getElementById('editTaskTitle').value.trim(), store = document.getElementById('editTaskStore').value, assignedTo = document.getElementById('editTaskAssigned').value.trim(), dueDate = document.getElementById('editTaskDueDate').value;
    if (!title || !store || !assignedTo || !dueDate) { alert('Fill all required fields'); return; }
    try {
        showLoading(true);
        await updateTaskInSheet(id, { title, description: document.getElementById('editTaskDescription').value.trim(), store, assignedTo, priority: document.getElementById('editTaskPriority').value, dueDate, remarks: document.getElementById('editTaskRemarks').value.trim(), status: task.status || 'Pending', progress: task.progress || 0, updatedBy: 'Admin' });
        closeModal(); await loadData(); showToast('✅ Updated', 'success');
    } catch (e) { showToast('❌ ' + e.message, 'error'); } finally { showLoading(false); }
}

function showDeleteTask(id) { if (!verifyPassword()) return; if (confirm('Delete task?')) deleteTask(id); }
async function deleteTask(id) { try { showLoading(true); await deleteTaskFromSheet(id); await loadData(); showToast('✅ Deleted', 'success'); } catch (e) { showToast('❌ ' + e.message, 'error'); } finally { showLoading(false); } }

function showUpdateTask(id) {
    const task = tasks.find(t => [t.id, t.taskid, t.taskId, t.ID, t['Task ID']].includes(id));
    if (!task) { alert('Task not found'); return; }
    openModal('Update Progress', `
        <div class="form-group"><label>Task: <strong>${task.title || ''}</strong></label><p style="color:#64748b;font-size:0.8rem;">${task.store || ''} | ${task.assignedto || task.assignedTo || ''}</p></div>
        <div class="form-group"><label>Status</label><select id="updateTaskStatus">${['Pending', 'In Progress', 'Completed'].map(s => `<option value="${s}" ${s === task.status ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
        <div class="form-group"><label>Progress %</label><input type="number" id="updateTaskProgress" value="${task.progress || 0}" min="0" max="100"></div>
        <div class="form-group"><label>Remarks</label><input type="text" id="updateTaskRemarks" value="${task.remarks || ''}"></div>
        <button class="btn btn-success" onclick="updateTaskProgress('${id}')" style="width:100%;"><i class="fas fa-check"></i> Update</button>
    `);
}

async function updateTaskProgress(id) {
    const task = tasks.find(t => [t.id, t.taskid, t.taskId, t.ID, t['Task ID']].includes(id));
    if (!task) { alert('Task not found'); return; }
    const status = document.getElementById('updateTaskStatus').value, progress = parseInt(document.getElementById('updateTaskProgress').value) || 0, remarks = document.getElementById('updateTaskRemarks').value.trim();
    const wasCompleted = task.status?.toLowerCase() === 'completed';
    const isNowCompleted = status.toLowerCase() === 'completed';
    try {
        showLoading(true);
        await updateTaskInSheet(id, { title: task.title || '', description: task.description || '', store: task.store || '', assignedTo: task.assignedto || task.assignedTo || '', priority: task.priority || 'Medium', dueDate: task.duedate || '', status, progress, remarks, updatedBy: 'Store Member' });
        closeModal(); await loadData();
        showToast('✅ Updated', 'success');
        if (!wasCompleted && isNowCompleted) {
            addNotification('🎉 Task Completed', `"${task.title}" has been completed!`);
        }
    } catch (e) { showToast('❌ ' + e.message, 'error'); } finally { showLoading(false); }
}

// ========== BULLETIN CRUD ==========
function showAddBulletin() {
    openModal('Add Bulletin', `
        <div class="form-group"><label>Content *</label><textarea id="bulletinContentInput" required></textarea></div>
        <div class="form-group"><label>Type</label><select id="bulletinType"><option>Announcement</option><option>Reminder</option><option selected>Note</option></select></div>
        <button class="btn btn-primary" onclick="addBulletin()" style="width:100%;"><i class="fas fa-save"></i> Post</button>
    `);
}
async function addBulletin() {
    const content = document.getElementById('bulletinContentInput').value.trim();
    if (!content) { alert('Enter content'); return; }
    try {
        showLoading(true);
        await addBulletinToSheet(content, document.getElementById('bulletinType').value);
        closeModal();
        await loadData();
        showToast('✅ Posted', 'success');
        addNotification('📌 New Bulletin', content.substring(0, 50) + (content.length > 50 ? '...' : ''));
    } catch (e) { showToast('❌ ' + e.message, 'error'); } finally { showLoading(false); }
}
function showEditBulletin(id) {
    if (!verifyPassword()) return;
    const post = bulletins.find(b => getBulletinId(b) === id);
    if (!post) { showToast('Post not found', 'error'); return; }
    openModal('Edit Bulletin', `
        <div class="password-protected"><i class="fas fa-lock"></i> Admin</div>
        <div class="form-group"><label>Content *</label><textarea id="editBulletinContent">${post.content || ''}</textarea></div>
        <div class="form-group"><label>Type</label><select id="editBulletinType">
            <option ${(post.type || 'Note') === 'Announcement' ? 'selected' : ''}>Announcement</option>
            <option ${(post.type || 'Note') === 'Reminder' ? 'selected' : ''}>Reminder</option>
            <option ${(post.type || 'Note') === 'Note' ? 'selected' : ''}>Note</option>
        </select></div>
        <button class="btn btn-warning" onclick="updateBulletin('${id}')" style="width:100%;"><i class="fas fa-save"></i> Update</button>
    `);
}
async function updateBulletin(id) {
    const content = document.getElementById('editBulletinContent').value.trim();
    const type = document.getElementById('editBulletinType').value;
    if (!content) { alert('Enter content'); return; }
    try { showLoading(true); await updateBulletinInSheet(id, content, type); closeModal(); await loadData(); showToast('✅ Updated', 'success'); } catch (e) { showToast('❌ ' + e.message, 'error'); } finally { showLoading(false); }
}
function showDeleteBulletin(id) { if (!verifyPassword()) return; if (confirm('Delete this bulletin post?')) deleteBulletin(id); }
async function deleteBulletin(id) { try { showLoading(true); await deleteBulletinFromSheet(id); await loadData(); showToast('✅ Deleted', 'success'); } catch (e) { showToast('❌ ' + e.message, 'error'); } finally { showLoading(false); } }

// ========== STORE CRUD ==========
function showAddStore() { if (!verifyPassword()) return; openModal('Add Store', `<div class="form-group"><label>Store Name *</label><input type="text" id="storeName" placeholder="Store name"></div><button class="btn btn-primary" onclick="addStore()" style="width:100%;"><i class="fas fa-save"></i> Add</button>`); }
async function addStore() { const name = document.getElementById('storeName').value.trim(); if (!name) { alert('Enter name'); return; } try { showLoading(true); await addStoreToSheet({ name, createdBy: 'Admin' }); closeModal(); await loadData(); showToast('✅ Added', 'success'); } catch (e) { showToast('❌ ' + e.message, 'error'); } finally { showLoading(false); } }
function showEditStore(id) { if (!verifyPassword()) return; const s = stores.find(st => st.storeid === id); if (!s) { alert('Store not found'); return; } openModal('Edit Store', `<div class="form-group"><label>Store Name *</label><input type="text" id="editStoreName" value="${s.name || ''}"></div><button class="btn btn-warning" onclick="updateStore('${id}')" style="width:100%;"><i class="fas fa-save"></i> Update</button>`); }
async function updateStore(id) { const name = document.getElementById('editStoreName').value.trim(); if (!name) { alert('Enter name'); return; } try { showLoading(true); await updateStoreInSheet(id, { name }); closeModal(); await loadData(); showToast('✅ Updated', 'success'); } catch (e) { showToast('❌ ' + e.message, 'error'); } finally { showLoading(false); } }
function showDeleteStore(id) { if (!verifyPassword()) return; if (confirm('Delete store?')) deleteStore(id); }
async function deleteStore(id) { try { showLoading(true); await deleteStoreFromSheet(id); await loadData(); showToast('✅ Deleted', 'success'); } catch (e) { showToast('❌ ' + e.message, 'error'); } finally { showLoading(false); } }

// ========== FILTERS ==========
function setTaskFilter(filter) {
    currentTaskFilter = filter;
    document.querySelectorAll('.task-filter-btns .btn').forEach(b => b.classList.remove('active'));
    const map = { all: 'filterAll', active: 'filterActive', completed: 'filterCompleted' };
    const el = document.getElementById(map[filter]);
    if (el) el.classList.add('active');
    renderAllTasks();
}
function filterTasks() { const s = document.getElementById('searchInput').value.toLowerCase().trim(); searchTerm = s; filteredTasks = s ? tasks.filter(t => (t.title || '').toLowerCase().includes(s) || (t.store || '').toLowerCase().includes(s) || (t.assignedto || t.assignedTo || '').toLowerCase().includes(s)) : tasks; renderAllTasks(); }
function clearFilter() { document.getElementById('searchInput').value = ''; searchTerm = ''; filteredTasks = []; renderAllTasks(); }
function switchAdminTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelector(`.tab-btn[onclick*="${tab}"]`).classList.add('active');
    document.getElementById(`admin-${tab}`).classList.add('active');
    if (tab === 'stores') renderStores();
    if (tab === 'activity') renderActivityLog();
}

// ========== NAVIGATION ==========
document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', function () {
        const v = this.dataset.view;
        if (!v) return;
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
        const viewEl = document.getElementById(`view-${v}`);
        if (viewEl) viewEl.classList.add('active');
        if (v === 'store') renderStoreButtons();
        if (v === 'dashboard') renderCharts();
        if (v === 'admin') switchAdminTab('stores');
        if (v === 'calendar') renderCalendar();
        document.getElementById('notificationPanel').classList.remove('open');
    });
});
document.getElementById('modal').addEventListener('click', function (e) { if (e.target === this) closeModal(); });

// ========== INIT ==========
setTimeout(requestNotificationPermission, 1000);
loadData();
setInterval(loadData, 60000);
console.log('✅ TaskFlow loaded.');