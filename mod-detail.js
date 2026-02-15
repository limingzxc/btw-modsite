const API_BASE = 'http://localhost:3000/api';

let currentUser = null;

document.addEventListener('DOMContentLoaded', () => {
    const user = checkLoginStatus();
    currentUser = user;
    updateAuthUI(user);
    const urlParams = new URLSearchParams(window.location.search);
    const modId = urlParams.get('id');

    if (modId) {
        loadModDetail(modId);
        setupRatingModal();
    } else {
        document.getElementById('modDetail').innerHTML = '<p style="text-align: center; color: var(--text-gray);">模组ID不存在</p>';
    }
});

// 检查登录状态
function checkLoginStatus() {
    const token = localStorage.getItem('userToken');
    const username = localStorage.getItem('currentUsername');
    if (token && username) {
        currentUser = { username };
        updateAuthUI();
    }
}

// 更新认证UI
function updateAuthUI() {
    // 更新导航栏
    const authMenuDetail = document.getElementById('authMenuDetail');
    const userMenuDetail = document.getElementById('userMenuDetail');
    const usernameDisplayDetail = document.getElementById('usernameDisplayDetail');

    if (currentUser) {
        if (authMenuDetail) authMenuDetail.style.display = 'none';
        if (userMenuDetail) userMenuDetail.style.display = 'flex';
        if (usernameDisplayDetail) usernameDisplayDetail.textContent = currentUser.username;
    } else {
        if (authMenuDetail) authMenuDetail.style.display = 'flex';
        if (userMenuDetail) userMenuDetail.style.display = 'none';
    }

    // 更新页面内的认证区域
    const authButtons = document.getElementById('authButtons');
    const userInfo = document.getElementById('userInfo');

    if (authButtons) {
        if (currentUser) {
            authButtons.style.display = 'none';
            if (userInfo) {
                userInfo.style.display = 'block';
                const welcomeEl = document.getElementById('welcomeUsername');
                if (welcomeEl) {
                    welcomeEl.textContent = currentUser.username;
                }
            }
        } else {
            authButtons.style.display = 'flex';
            if (userInfo) userInfo.style.display = 'none';
        }
    }
}

// 登出
function handleLogout() {
    if (!currentUser) return;

    handleLogoutCommon(() => {
        // 重新加载模组详情
        const urlParams = new URLSearchParams(window.location.search);
        const modId = urlParams.get('id');
        if (modId) {
            loadModDetail(modId);
        }
    });
}

async function loadModDetail(modId) {
    try {
        const response = await fetch(`${API_BASE}/mods/${modId}`);

        if (!response.ok) {
            throw new Error('模组不存在');
        }

        const mod = await response.json();

        // 检查用户是否已评分
        let hasRated = false;
        let userRating = null;

        if (currentUser) {
            try {
                const token = localStorage.getItem('userToken');
                if (token) {
                    const ratedResponse = await fetch(`${API_BASE}/mods/${modId}/rated`, {
                        headers: { 'Authorization': token }
                    });
                    if (ratedResponse.ok) {
                        const ratedData = await ratedResponse.json();
                        hasRated = ratedData.hasRated;
                        userRating = ratedData.rating;
                    }
                }
            } catch (error) {
                console.error('检查评分状态失败:', error);
            }
        }

        renderModDetail(mod, hasRated, userRating);
    } catch (error) {
        console.error('加载模组详情失败:', error);
        document.getElementById('modDetail').innerHTML = `
            <div style="text-align: center; padding: 4rem;">
                <i class="fas fa-exclamation-circle" style="font-size: 4rem; color: var(--accent-color); margin-bottom: 1rem;"></i>
                <p style="color: var(--text-gray); font-size: 1.2rem;">模组加载失败</p>
                <a href="index.html" class="btn btn-primary" style="margin-top: 1rem; display: inline-block;">返回首页</a>
            </div>
        `;
    }
}

function renderModDetail(mod, hasRated = false, userRating = null) {
    const categoryName = getCategoryName(mod.category);
    const ratingStars = generateStars(mod.rating);
    const backgroundStyle = mod.backgroundImage ? `background-image: url('${mod.backgroundImage}');` : '';

    document.getElementById('modDetail').innerHTML = `
        <a href="index.html" class="btn back-btn">
            <i class="fas fa-arrow-left"></i> 返回首页
        </a>

        <div class="mod-header" style="${backgroundStyle}">
            <div class="mod-title-section">
                <div class="mod-large-icon">${escapeHtml(mod.icon)}</div>
                <div class="mod-info">
                    <h1 class="mod-name">${escapeHtml(mod.name)}</h1>
                    <span class="mod-category">${escapeHtml(categoryName)}</span>
                    <div class="mod-meta">
                        <div class="mod-meta-item">
                            <i class="fas fa-star"></i>
                            <span>${escapeHtml(mod.rating)} / 5.0</span>
                        </div>
                        <div class="mod-meta-item">
                            <i class="fas fa-download"></i>
                            <span>${formatNumber(mod.downloads)} 下载</span>
                        </div>
                        <div class="mod-meta-item">
                            <i class="fas fa-calendar"></i>
                            <span>添加于 ${escapeHtml(mod.createdAt)}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div class="mod-description">
                <h3 style="color: var(--text-light); margin-bottom: 1rem;">模组介绍</h3>
                <p>${mod.description}</p>
            </div>

            <div class="mod-tags-section">
                <h4>标签</h4>
                <div class="mod-tags">
                    ${mod.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
                </div>
            </div>
        </div>

        <div class="mod-stats-section">
            <h3 style="color: var(--text-light); margin-bottom: 1.5rem; text-align: center;">模组统计</h3>
            <div class="mod-stats-grid">
                <div class="stat-item">
                    <div class="stat-icon"><i class="fas fa-star"></i></div>
                    <div class="stat-value">${mod.rating}</div>
                    <div class="stat-label">平均评分</div>
                </div>
                <div class="stat-item">
                    <div class="stat-icon"><i class="fas fa-download"></i></div>
                    <div class="stat-value">${formatNumber(mod.downloads)}</div>
                    <div class="stat-label">总下载量</div>
                </div>
                <div class="stat-item">
                    <div class="stat-icon"><i class="fas fa-tags"></i></div>
                    <div class="stat-value">${mod.tags.length}</div>
                    <div class="stat-label">标签数量</div>
                </div>
            </div>
        </div>

        <div class="mod-actions-section">
            <h3><i class="fas fa-cog"></i> 操作</h3>
            <div class="action-buttons">
                ${mod.sourceLink ? `
                    <button class="action-btn source-btn" onclick="openSource()">
                        <i class="fas fa-code"></i> 查看源码
                    </button>
                ` : ''}
                <button class="action-btn download-btn" onclick="downloadMod(${mod.id})">
                    <i class="fas fa-cloud-download-alt"></i> 立即下载
                </button>
                <button class="action-btn rate-btn" onclick="openRatingModal('${mod.name}', ${mod.id})">
                    <i class="fas fa-heart"></i> ${hasRated ? `已评分 (${userRating}★)` : '评价模组'}
                </button>
            </div>
        </div>

        <!-- 用户认证区域 -->
        <div class="auth-section">
            <div id="authButtons" style="display: ${currentUser ? 'none' : 'flex'};">
                <a href="login.html" class="btn btn-primary">
                    <i class="fas fa-sign-in-alt"></i> 登录
                </a>
                <a href="register.html" class="btn btn-secondary">
                    <i class="fas fa-user-plus"></i> 注册
                </a>
            </div>
            <div id="userInfo" style="display: ${currentUser ? 'block' : 'none'};">
                <span>欢迎, <strong id="welcomeUsername">${currentUser?.username || ''}</strong></span>
                <a href="index.html" class="btn btn-sm btn-secondary" onclick="handleLogout(); return false;">
                    <i class="fas fa-sign-out-alt"></i> 退出
                </a>
            </div>
        </div>

        <!-- 评分显示 -->
        <div style="margin-top: 2rem; padding: 2rem; background: var(--darker-bg); border-radius: 15px;">
            <h3 style="color: var(--text-light); margin-bottom: 1rem;">用户评分</h3>
            <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem;">
                <div style="font-size: 3rem; font-weight: bold; color: var(--text-light);">${mod.rating}</div>
                <div>
                    <div style="color: #ffd700; font-size: 1.5rem;">
                        ${ratingStars}
                    </div>
                </div>
            </div>
        </div>
    `;
}

function getCategoryName(category) {
    const names = {
        'adventure': '冒险',
        'technology': '科技',
        'magic': '魔法',
        'decoration': '装饰',
        'utility': '实用'
    };
    return names[category] || category;
}

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

function formatNumber(num) {
    if (num >= 10000) {
        return (num / 10000).toFixed(1) + '万';
    } else if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'k';
    }
    return num.toString();
}

async function downloadMod(modId) {
    try {
        await fetch(`${API_BASE}/mods/${modId}/download`, {
            method: 'POST'
        });

        const modResponse = await fetch(`${API_BASE}/mods/${modId}`);
        const mod = await modResponse.json();

        if (mod.cloudLink) {
            window.open(mod.cloudLink, '_blank');
            showNotification('下载链接已打开', 'success');
        }
    } catch (error) {
        console.error('下载失败:', error);
        showNotification('下载失败，请重试', 'error');
    }
}

function openSource() {
    const urlParams = new URLSearchParams(window.location.search);
    const modId = urlParams.get('id');

    fetch(`${API_BASE}/mods/${modId}`)
        .then(res => res.json())
        .then(mod => {
            if (mod.sourceLink) {
                window.open(mod.sourceLink, '_blank');
            }
        });
}

function setupRatingModal() {
    const modal = document.getElementById('ratingModal');
    const closeBtn = document.querySelector('#ratingModal .close-modal');
    const stars = document.querySelectorAll('#ratingModal .star');
    const ratingValue = document.getElementById('ratingValue');
    const ratingText = document.getElementById('ratingText');
    const submitBtn = document.getElementById('submitRating');

    const ratingTexts = ['', '非常差', '较差', '一般', '不错', '非常棒'];

    stars.forEach(star => {
        star.addEventListener('mouseenter', function() {
            const rating = parseInt(this.dataset.rating);
            highlightStars(rating, true);
            ratingText.textContent = ratingTexts[rating];
        });

        star.addEventListener('mouseleave', function() {
            const currentRating = parseInt(ratingValue.value);
            highlightStars(currentRating, false);
            ratingText.textContent = currentRating > 0 ? ratingTexts[currentRating] : '请选择评分';
        });

        star.addEventListener('click', function() {
            const rating = parseInt(this.dataset.rating);
            ratingValue.value = rating;
            highlightStars(rating, false);
            stars.forEach(s => s.classList.remove('selected'));
            for (let i = 0; i < rating; i++) {
                stars[i].classList.add('selected');
            }
            submitBtn.disabled = false;
            ratingText.textContent = ratingTexts[rating];
        });
    });

    closeBtn.addEventListener('click', closeRatingModal);

    modal.addEventListener('click', (e) => {
        if (e.target.id === 'ratingModal') {
            closeRatingModal();
        }
    });

    submitBtn.addEventListener('click', submitRating);
}

function highlightStars(rating, isHover) {
    const stars = document.querySelectorAll('#ratingModal .star');
    stars.forEach((star, index) => {
        if (index < rating) {
            star.querySelector('i').className = isHover ? 'fas fa-star' : 'fas fa-star';
            star.classList.add('hovered');
        } else {
            star.querySelector('i').className = 'far fa-star';
            star.classList.remove('hovered');
        }
    });
}

function openRatingModal(modName, modId) {
    const token = localStorage.getItem('userToken');

    if (!currentUser || !token) {
        showNotification('请先登录', 'error');
        setTimeout(() => {
            window.location.href = 'login.html';
        }, 1000);
        return;
    }

    // 检查是否已评分
    fetch(`${API_BASE}/mods/${modId}/rated`, {
        headers: { 'Authorization': token }
    })
    .then(res => {
        if (!res.ok) {
            throw new Error('验证失败');
        }
        return res.json();
    })
    .then(data => {
        if (data.hasRated) {
            showNotification(`您已经评价过这个模组了，评分：${data.rating}★`, 'error');
            return;
        }

        document.getElementById('ratingModName').textContent = modName;
        document.getElementById('ratingValue').value = 0;
        document.getElementById('ratingModal').classList.add('show');

        // 重置星星
        const stars = document.querySelectorAll('#ratingModal .star');
        stars.forEach(star => {
            star.classList.remove('selected', 'hovered');
            star.querySelector('i').className = 'far fa-star';
        });
        document.getElementById('ratingText').textContent = '请选择评分';
        document.getElementById('submitRating').disabled = true;
    })
    .catch(error => {
        console.error('检查评分状态失败:', error);
        showNotification('验证失败，请重新登录', 'error');
        setTimeout(() => {
            window.location.href = 'login.html';
        }, 1500);
    });
}

function closeRatingModal() {
    document.getElementById('ratingModal').classList.remove('show');
}

async function submitRating() {
    const urlParams = new URLSearchParams(window.location.search);
    const modId = urlParams.get('id');
    const rating = parseInt(document.getElementById('ratingValue').value);

    if (rating === 0) {
        showNotification('请选择评分', 'error');
        return;
    }

    const token = localStorage.getItem('userToken');

    if (!token) {
        showNotification('请先登录', 'error');
        setTimeout(() => {
            window.location.href = 'login.html';
        }, 1500);
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/mods/${modId}/rate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': token
            },
            body: JSON.stringify({ rating })
        });

        if (response.ok) {
            showNotification('评分成功！感谢您的反馈', 'success');
            closeRatingModal();
            loadModDetail(modId);
        } else {
            const data = await response.json();
            showNotification(data.error || '评分失败', 'error');
            if (data.error && data.error.includes('无效')) {
                setTimeout(() => {
                    window.location.href = 'login.html';
                }, 1500);
            }
        }
    } catch (error) {
        console.error('评分失败:', error);
        showNotification('评分失败，请重试', 'error');
    }
}

function showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = `notification ${type} show`;

    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

