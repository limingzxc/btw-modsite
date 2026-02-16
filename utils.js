// 通用工具函数库

const API_BASE = '/api';

/**
 * HTML 转义函数，防止 XSS 攻击
 * @param {string} text - 需要转义的文本
 * @returns {string} 转义后的 HTML
 */
function escapeHtml(text) {
    if (!text) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
}

/**
 * 生成星级评分 HTML
 * @param {number} rating - 评分 (1-5)
 * @returns {string} 星级 HTML
 */
function generateStars(rating) {
    let stars = '';
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;

    for (let i = 0; i < fullStars; i++) {
        stars += '<i class="fas fa-star"></i>';
    }

    if (hasHalfStar) {
        stars += '<i class="fas fa-star-half-alt"></i>';
    }

    const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);
    for (let i = 0; i < emptyStars; i++) {
        stars += '<i class="far fa-star"></i>';
    }

    return stars;
}

/**
 * 格式化数字显示
 * @param {number} num - 数字
 * @returns {string} 格式化后的字符串
 */
function formatNumber(num) {
    if (num >= 10000) {
        return (num / 10000).toFixed(1) + '万';
    } else if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'k';
    }
    return num.toString();
}



/**
 * 显示通知消息
 * @param {string} message - 消息内容
 * @param {string} type - 消息类型 ('success' | 'error')
 */
function showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    if (notification) {
        notification.textContent = message;
        notification.className = `notification ${type} show`;

        setTimeout(() => {
            notification.classList.remove('show');
        }, 3000);
    }
}

/**
 * 检查用户登录状态
 */
function checkLoginStatus() {
    const token = localStorage.getItem('userToken');
    const username = localStorage.getItem('currentUsername');
    return token && username ? { username } : null;
}

/**
 * 更新认证 UI
 * @param {Object} user - 用户对象
 * @param {string} user.username - 用户名
 */
function updateAuthUI(user) {
    const authMenu = document.getElementById('authMenu') || document.getElementById('authMenuLogin') || document.getElementById('authMenuRegister');
    const userMenu = document.getElementById('userMenu') || document.getElementById('userMenuLogin') || document.getElementById('userMenuRegister');
    const usernameDisplay = document.getElementById('usernameDisplay') || document.getElementById('usernameDisplayLogin') || document.getElementById('usernameDisplayRegister');

    if (user) {
        if (authMenu) authMenu.style.display = 'none';
        if (userMenu) userMenu.style.display = 'flex';
        if (usernameDisplay) usernameDisplay.textContent = user.username;
    } else {
        if (authMenu) authMenu.style.display = 'flex';
        if (userMenu) userMenu.style.display = 'none';
    }
}

/**
 * 处理登出
 * @param {Function} callback - 登出后的回调函数
 */
async function handleLogoutCommon(callback) {
    try {
        await fetch(`${API_BASE}/auth/logout`, {
            method: 'POST',
            headers: { 'Authorization': localStorage.getItem('userToken') }
        });
    } catch (error) {
        console.error('登出失败:', error);
    }

    localStorage.removeItem('userToken');
    localStorage.removeItem('currentUsername');

    if (callback) {
        callback();
    }

    updateAuthUI(null);
    showNotification('已登出', 'success');
}

// 如果模块化导出可用，则导出函数
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        escapeHtml,
        generateStars,
        formatNumber,
        showNotification,
        checkLoginStatus,
        updateAuthUI,
        handleLogout
    };
}
