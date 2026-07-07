// ===== store.js =====
// Store View logic: buttons per store, analytics, performance evaluation

let selectedStoreId = null;

function renderStoreButtons() {
    const grid = document.getElementById('storeButtonGrid');
    if (!stores.length) {
        grid.innerHTML = '<div class="empty-state"><i class="fas fa-store"></i><p>No stores available</p></div>';
        document.getElementById('storeDetailPanel').style.display = 'none';
        return;
    }
    let html = '';
    stores.forEach(store => {
        const storeTasks = tasks.filter(t => t.store === store.name);
        const activeCount = storeTasks.filter(t => t.status?.toLowerCase() !== 'completed').length;
        const totalCount = storeTasks.length;
        const isActive = selectedStoreId === store.storeid;
        html += `<button class="store-btn ${isActive ? 'active' : ''}" onclick="selectStore('${store.storeid}')">
            <i class="fas fa-store"></i> ${store.name}
            <span class="badge-count">${activeCount}/${totalCount}</span>
        </button>`;
    });
    grid.innerHTML = html;

    // If a store was selected, show its details
    if (selectedStoreId && stores.some(s => s.storeid === selectedStoreId)) {
        renderStoreDetail(selectedStoreId);
        document.getElementById('storeDetailPanel').style.display = 'block';
    } else if (stores.length > 0 && !selectedStoreId) {
        // Auto-select first store
        selectStore(stores[0].storeid);
    } else {
        document.getElementById('storeDetailPanel').style.display = 'none';
    }
}

function selectStore(storeId) {
    selectedStoreId = storeId;
    renderStoreButtons();
    renderStoreDetail(storeId);
    document.getElementById('storeDetailPanel').style.display = 'block';
}

function renderStoreDetail(storeId) {
    const store = stores.find(s => s.storeid === storeId);
    if (!store) return;

    const storeTasks = tasks.filter(t => t.store === store.name);
    const total = storeTasks.length;
    const completed = storeTasks.filter(t => t.status?.toLowerCase() === 'completed').length;
    const pending = storeTasks.filter(t => t.status?.toLowerCase() === 'pending').length;
    const inProgress = storeTasks.filter(t => t.status?.toLowerCase() === 'in progress').length;
    const today = new Date().toISOString().split('T')[0];
    const overdue = storeTasks.filter(t => formatDate(t.duedate) < today && t.status?.toLowerCase() !== 'completed').length;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    // Update header
    document.getElementById('storeDetailName').textContent = store.name;
    document.getElementById('storeTaskCount').textContent = `${total} tasks`;
    document.getElementById('storeCompletionRate').textContent = `${completionRate}% complete`;
    document.getElementById('storeStaffCount').textContent = [...new Set(storeTasks.map(t => t.assignedto || t.assignedTo).filter(Boolean))].length;

    // Update stats
    document.getElementById('storePending').textContent = pending;
    document.getElementById('storeInProgress').textContent = inProgress;
    document.getElementById('storeCompleted').textContent = completed;
    document.getElementById('storeOverdue').textContent = overdue;

    // Render store chart
    renderStoreChart(pending, inProgress, completed);

    // Render performance by assigned person
    renderPerformance(storeTasks);

    // Render task list
    renderStoreTaskList(storeTasks);
}

function renderStoreChart(pending, inProgress, completed) {
    const ctx = document.getElementById('storeStatusChart').getContext('2d');
    if (currentStoreChart) currentStoreChart.destroy();
    currentStoreChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Pending', 'In Progress', 'Completed'],
            datasets: [{
                data: [pending || 0, inProgress || 0, completed || 0],
                backgroundColor: ['#fbbf24', '#60a5fa', '#34d399'],
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.5)'
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 9 } } },
                title: { display: false }
            },
            cutout: '65%'
        }
    });
}

function renderPerformance(storeTasks) {
    const container = document.getElementById('storePerformanceList');
    // Group by assigned person
    const perfMap = {};
    storeTasks.forEach(task => {
        const name = task.assignedto || task.assignedTo || 'Unassigned';
        if (!perfMap[name]) {
            perfMap[name] = { total: 0, completed: 0, overdue: 0, inProgress: 0 };
        }
        perfMap[name].total++;
        const status = task.status?.toLowerCase() || 'pending';
        if (status === 'completed') perfMap[name].completed++;
        else if (status === 'in progress') perfMap[name].inProgress++;
        const due = formatDate(task.duedate);
        const today = new Date().toISOString().split('T')[0];
        if (due && due < today && status !== 'completed') perfMap[name].overdue++;
    });

    const entries = Object.entries(perfMap);
    if (!entries.length) {
        container.innerHTML = '<div style="color:#5b4a7a;font-size:0.85rem;">No assignments yet</div>';
        return;
    }

    let html = '';
    entries.forEach(([name, stats]) => {
        const rate = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
        const color = rate >= 80 ? '#34d399' : rate >= 50 ? '#fbbf24' : '#f87171';
        html += `<div class="perf-card">
            <div class="perf-name"><i class="fas fa-user-circle"></i> ${name}</div>
            <div class="perf-stats">
                <span>📋 ${stats.total} tasks</span>
                <span>✅ ${stats.completed} done</span>
                <span>⏳ ${stats.inProgress} in progress</span>
                <span>⚠️ ${stats.overdue} overdue</span>
            </div>
            <div style="display:flex;align-items:center;gap:0.5rem;margin-top:0.2rem;">
                <div class="progress-container" style="flex:1;width:auto;"><div class="progress-bar" style="width:${rate}%;background:${color};"></div></div>
                <span class="perf-rate" style="color:${color};">${rate}%</span>
            </div>
        </div>`;
    });
    container.innerHTML = html;
}

function renderStoreTaskList(storeTasks) {
    const container = document.getElementById('storeTaskList');
    if (!storeTasks.length) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-list"></i><p>No tasks for this store</p></div>';
        return;
    }
    const sorted = [...storeTasks].sort((a, b) => {
        const aC = a.status?.toLowerCase() === 'completed' ? 1 : 0;
        const bC = b.status?.toLowerCase() === 'completed' ? 1 : 0;
        if (aC !== bC) return aC - bC;
        return 0;
    });
    let html = '<div class="table-container"><table><thead><tr><th>Title</th><th>Assigned</th><th>Priority</th><th>Due</th><th>Status</th><th>Progress</th><th>Remarks</th><th>Update</th></tr></thead><tbody>';
    const today = new Date().toISOString().split('T')[0];
    sorted.forEach(task => {
        const id = task.id || task.taskid || task.taskId || task.ID || task['Task ID'];
        const due = formatDate(task.duedate);
        const overdue = due && due < today && task.status?.toLowerCase() !== 'completed';
        html += `<tr class="${overdue ? 'overdue' : ''}">
            <td>${task.title || ''}</td>
            <td>${task.assignedto || task.assignedTo || ''}</td>
            <td class="priority-${(task.priority || '').toLowerCase()}">${task.priority || ''}</td>
            <td class="${overdue ? 'due-date' : ''}">${due || ''}</td>
            <td><span class="badge badge-${(task.status || 'pending').toLowerCase().replace(' ', '-')}">${task.status || 'Pending'}</span></td>
            <td><div class="progress-container"><div class="progress-bar" style="width:${task.progress || 0}%;background:${(task.progress || 0) === 100 ? '#34d399' : '#667eea'}"></div></div> ${task.progress || 0}%</td>
            <td>${task.remarks || '-'}</td>
            <td><button class="btn btn-primary btn-sm" onclick="showUpdateTask('${id}')"><i class="fas fa-pen"></i></button></td>
        </tr>`;
    });
    html += '</tbody></table></div>';
    container.innerHTML = html;
}

// Override loadData to re-render store buttons
const originalLoadData = loadData;
loadData = async function() {
    await originalLoadData();
    renderStoreButtons();
};