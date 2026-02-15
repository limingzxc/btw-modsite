// ==================== 日志管理功能 ====================

// 日志分页状态
let currentLogPage = 1;
const LOGS_PER_PAGE = 50;

// 加载日志统计
async function loadLogsStats() {
    try {
        const token = sessionStorage.getItem('adminToken');
        console.log('Loading logs stats, token:', token);

        const response = await fetch(`${API_BASE}/logs/stats`, {
            headers: { 'Authorization': token }
        });

        console.log('Stats response status:', response.status);

        if (response.ok) {
            const data = await response.json();
            console.log('Stats data:', data);
            console.log('Overall stats:', data.overall);

            // 更新统计卡片
            const totalEl = document.getElementById('totalRequests');
            const avgEl = document.getElementById('avgResponseTime');
            const errorEl = document.getElementById('errorCount');
            const maxEl = document.getElementById('maxResponseTime');

            console.log('Elements:', { totalEl, avgEl, errorEl, maxEl });

            if (totalEl) totalEl.textContent = data.overall?.total || '-';
            if (avgEl) avgEl.textContent = data.overall?.avgResponseTime ? `${Math.round(data.overall.avgResponseTime)}ms` : '-';
            if (errorEl) errorEl.textContent = data.overall?.errorCount || '-';
            if (maxEl) maxEl.textContent = data.overall?.maxResponseTime ? `${data.overall.maxResponseTime}ms` : '-';
        } else {
            console.error('Stats response not ok, status:', response.status);
            showNotification('加载统计失败', 'error');
        }
    } catch (error) {
        console.error('Error loading logs stats:', error);
        showNotification('加载统计失败', 'error');
    }
}

// 加载日志列表
async function loadLogs(page = 1) {
    const pathFilter = document.getElementById('logPathFilter').value;
    const methodFilter = document.getElementById('logMethodFilter').value;
    const statusFilter = document.getElementById('logStatusFilter').value;

    try {
        const token = sessionStorage.getItem('adminToken');
        const params = new URLSearchParams({
            page: page,
            limit: LOGS_PER_PAGE,
            ...(pathFilter && { path: pathFilter }),
            ...(methodFilter && { method: methodFilter }),
            ...(statusFilter && { statusCode: statusFilter })
        });

        const response = await fetch(`${API_BASE}/logs?${params}`, {
            headers: { 'Authorization': token }
        });

        if (response.ok) {
            const data = await response.json();
            currentLogPage = page;
            displayLogsTable(data.logs);
            displayLogsPagination(data.pagination);
        } else {
            showNotification('加载日志失败', 'error');
        }
    } catch (error) {
        console.error('Error loading logs:', error);
        showNotification('加载日志失败', 'error');
    }
}

// 显示日志表格
function displayLogsTable(logs) {
    const tbody = document.getElementById('logsTableBody');

    if (logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: #999;">暂无日志记录</td></tr>';
        return;
    }

    tbody.innerHTML = logs.map(log => {
        const statusClass = log.status_code >= 200 && log.status_code < 300 ? 'success' :
                           log.status_code >= 400 && log.status_code < 500 ? 'warning' : 'error';
        const methodClass = log.method.toLowerCase();

        const userDisplay = escapeHtml(log.username || log.admin_name || '-');
        const time = new Date(log.created_at).toLocaleString('zh-CN');

        return `
            <tr>
                <td>${time}</td>
                <td><span class="method-badge ${methodClass}">${escapeHtml(log.method)}</span></td>
                <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(log.path)}</td>
                <td><span class="status-badge ${statusClass}">${escapeHtml(log.status_code)}</span></td>
                <td>${escapeHtml(log.response_time)}ms</td>
                <td>${escapeHtml(log.ip || '-')}</td>
                <td>${userDisplay}</td>
                <td><button class="btn-detail" onclick="showLogDetail(${log.id})">详情</button></td>
            </tr>
        `;
    }).join('');
}

// 显示分页
function displayLogsPagination(pagination) {
    const container = document.getElementById('logsPagination');
    const { page, totalPages } = pagination;

    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }

    let html = `
        <button ${page === 1 ? 'disabled' : ''} onclick="loadLogs(${page - 1})">
            <i class="fas fa-chevron-left"></i>
        </button>
    `;

    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= page - 2 && i <= page + 2)) {
            html += `<button class="${i === page ? 'active' : ''}" onclick="loadLogs(${i})">${i}</button>`;
        } else if (i === page - 3 || i === page + 3) {
            html += '<button disabled>...</button>';
        }
    }

    html += `
        <button ${page === totalPages ? 'disabled' : ''} onclick="loadLogs(${page + 1})">
            <i class="fas fa-chevron-right"></i>
        </button>
    `;

    container.innerHTML = html;
}

// 显示日志详情
async function showLogDetail(logId) {
    try {
        const token = sessionStorage.getItem('adminToken');
        const response = await fetch(`${API_BASE}/logs/${logId}`, {
            headers: { 'Authorization': token }
        });

        if (response.ok) {
            const log = await response.json();
            displayLogDetail(log);
            document.getElementById('logDetailModal').classList.add('show');
        } else {
            const data = await response.json();
            showNotification(data.error || '加载日志详情失败', 'error');
        }
    } catch (error) {
        console.error('Error loading log detail:', error);
        showNotification('加载日志详情失败', 'error');
    }
}

// 显示日志详情内容
function displayLogDetail(log) {
    const content = document.getElementById('logDetailContent');

    content.innerHTML = `
        <div class="log-detail-item">
            <label>请求时间</label>
            <div class="value">${new Date(log.created_at).toLocaleString('zh-CN')}</div>
        </div>

        <div class="log-detail-item">
            <label>请求方法</label>
            <div class="value">${log.method}</div>
        </div>

        <div class="log-detail-item">
            <label>请求路径</label>
            <div class="value">${log.path}</div>
        </div>

        <div class="log-detail-item">
            <label>状态码</label>
            <div class="value">${log.status_code}</div>
        </div>

        <div class="log-detail-item">
            <label>响应时间</label>
            <div class="value">${log.response_time}ms</div>
        </div>

        <div class="log-detail-item">
            <label>客户端IP</label>
            <div class="value">${log.ip || '-'}</div>
        </div>

        <div class="log-detail-item">
            <label>User Agent</label>
            <div class="value">${log.user_agent || '-'}</div>
        </div>

        ${log.username ? `
        <div class="log-detail-item">
            <label>用户</label>
            <div class="value">${log.username} (ID: ${log.user_id})</div>
        </div>
        ` : ''}

        ${log.admin_name ? `
        <div class="log-detail-item">
            <label>管理员</label>
            <div class="value">${log.admin_name} (ID: ${log.admin_id})</div>
        </div>
        ` : ''}

        ${log.request_body ? `
        <div class="log-detail-item">
            <label>请求体</label>
            <div class="code-block">${log.request_body}</div>
        </div>
        ` : ''}

        ${log.error ? `
        <div class="log-detail-item">
            <label>错误信息</label>
            <div class="code-block" style="color: #ff4757;">${log.error}</div>
        </div>
        ` : ''}
    `;
}

// 关闭日志详情弹窗
function closeLogDetailModal() {
    document.getElementById('logDetailModal').classList.remove('show');
}

// 重置筛选条件
function resetLogFilters() {
    document.getElementById('logPathFilter').value = '';
    document.getElementById('logMethodFilter').value = '';
    document.getElementById('logStatusFilter').value = '';
    loadLogs(1);
}

// 导出日志
async function exportLogs() {
    if (!confirm('确定要导出最近1000条日志吗？')) {
        return;
    }

    try {
        const token = sessionStorage.getItem('adminToken');
        const response = await fetch(`${API_BASE}/logs/export?limit=1000`, {
            headers: { 'Authorization': token }
        });

        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `logs_${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            showNotification('日志导出成功', 'success');
        } else {
            showNotification('导出日志失败', 'error');
        }
    } catch (error) {
        console.error('Error exporting logs:', error);
        showNotification('导出日志失败', 'error');
    }
}

// 清理旧日志
async function cleanupLogs() {
    const days = prompt('请输入要保留的天数（1-365）：', '30');
    const daysNum = parseInt(days);

    if (isNaN(daysNum) || daysNum < 1 || daysNum > 365) {
        showNotification('无效的天数', 'error');
        return;
    }

    if (!confirm(`确定要删除${daysNum}天之前的所有日志吗？此操作不可撤销！`)) {
        return;
    }

    try {
        const token = sessionStorage.getItem('adminToken');
        const response = await fetch(`${API_BASE}/logs/cleanup?days=${daysNum}`, {
            method: 'DELETE',
            headers: { 'Authorization': token }
        });

        if (response.ok) {
            const data = await response.json();
            showNotification(data.message, 'success');
            loadLogsStats();
            loadLogs(currentLogPage);
        } else {
            const data = await response.json();
            showNotification(data.error || '清理失败', 'error');
        }
    } catch (error) {
        console.error('Error cleaning up logs:', error);
        showNotification('清理日志失败', 'error');
    }
}

// 监听侧边栏链接点击，自动加载日志数据
document.addEventListener('DOMContentLoaded', function() {
    const logsLink = document.querySelector('a[href="#logs"]');
    if (logsLink) {
        logsLink.addEventListener('click', function(e) {
            // 延迟加载，确保section已显示
            setTimeout(() => {
                loadLogsStats();
                loadLogs(1);
            }, 100);
        });
    }
});

