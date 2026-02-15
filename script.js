let currentUser = null;

document.addEventListener('DOMContentLoaded', () => {
    const user = checkLoginStatus();
    currentUser = user;
    updateAuthUI(user);
    loadCategories();
    loadMods();
    setupEventListeners();
    setupScrollSpy(); // 添加滚动监听
});

async function loadCategories() {
    try {
        const response = await fetch(`${API_BASE}/categories`);
        const categories = await response.json();
        renderFilterButtons(categories);
    } catch (error) {
        console.error('加载分类失败:', error);
    }
}

function renderFilterButtons(categories) {
    const container = document.querySelector('.filter-buttons');
    if (!container) return;

    let html = '<button class="filter-btn active" data-filter="all">全部</button>';

    categories.forEach(cat => {
        const displayName = cat.description || cat.name;
        html += `<button class="filter-btn" data-filter="${cat.name}">${displayName}</button>`;
    });

    container.innerHTML = html;

    // 重新绑定筛选按钮事件
    setupFilterButtons();
}

function setupFilterButtons() {
    const filterBtns = document.querySelectorAll('.filter-btn');
    const sortSelect = document.getElementById('sortSelect');

    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const filter = btn.dataset.filter;
            const sortBy = sortSelect ? sortSelect.value : 'default';

            loadMods(filter, sortBy);
        });
    });
}

async function loadMods(category = 'all', sortBy = 'default') {
    try {
        const response = await fetch(`${API_BASE}/mods?category=${category}&sortBy=${sortBy}`);
        const mods = await response.json();
        renderMods(mods);
    } catch (error) {
        console.error('加载模组失败:', error);
        document.getElementById('modsGrid').innerHTML = '<p style="text-align: center; color: var(--text-gray);">加载失败，请刷新页面重试</p>';
    }
}

function renderMods(mods) {
    const grid = document.getElementById('modsGrid');

    if (mods.length === 0) {
        grid.innerHTML = '<p style="text-align: center; color: var(--text-gray); grid-column: 1/-1; padding: 2rem;">暂无模组</p>';
        return;
    }

    grid.innerHTML = mods.map(mod => `
        <div class="mod-card" data-category="${escapeHtml(mod.category)}" onclick="viewModDetail(${mod.id})" style="cursor: pointer; ${mod.backgroundImage ? '--mod-bg-image: url(' + escapeHtml(mod.backgroundImage) + ')' : ''}">
            <div class="mod-image">
                <div class="mod-icon ${escapeHtml(mod.category)}-icon">${escapeHtml(mod.icon)}</div>
            </div>
            <div class="mod-content">
                <h3>${escapeHtml(mod.name)}</h3>
                <p>${escapeHtml(mod.description)}</p>
                <div class="mod-tags">
                    ${mod.tags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}
                </div>
                <div class="mod-rating">
                    ${generateStars(mod.rating)}
                    <span>${escapeHtml(mod.rating)}</span>
                </div>
                <div class="mod-downloads">
                    <i class="fas fa-download"></i>
                    <span>${formatNumber(mod.downloads)} 下载</span>
                </div>
                <div class="mod-actions">
                    ${mod.sourceLink ? `
                        <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation(); openSource(${mod.id})">
                            <i class="fas fa-code"></i> 源码
                        </button>
                    ` : ''}
                    <button class="btn btn-sm btn-primary" onclick="event.stopPropagation(); downloadMod(${mod.id})">
                        <i class="fas fa-cloud-download-alt"></i> 下载
                    </button>
                </div>
            </div>
        </div>
    `).join('');

    // 重新设置滚动观察
    setupScrollObserver();
}



async function downloadMod(modId) {
    try {
        const response = await fetch(`${API_BASE}/mods/${modId}/download`, {
            method: 'POST'
        });
        const data = await response.json();
        
        // 获取模组信息
        const modResponse = await fetch(`${API_BASE}/mods/${modId}`);
        const mod = await modResponse.json();
        
        if (mod.cloudLink) {
            window.open(mod.cloudLink, '_blank');
        }
    } catch (error) {
        console.error('下载失败:', error);
        alert('下载失败，请重试');
    }
}

async function openSource(modId) {
    try {
        const response = await fetch(`${API_BASE}/mods/${modId}`);
        const mod = await response.json();
        
        if (mod.sourceLink) {
            window.open(mod.sourceLink, '_blank');
        } else {
            alert('该模组暂无源码链接');
        }
    } catch (error) {
        console.error('打开源码失败:', error);
        alert('打开源码失败，请重试');
    }
}

function viewModDetail(modId) {
    window.location.href = `mod-detail.html?id=${modId}`;
}

function setupEventListeners() {
    const hamburger = document.querySelector('.hamburger');
    const navMenu = document.querySelector('.nav-menu');
    const sortSelect = document.getElementById('sortSelect');
    const navbar = document.querySelector('.navbar');

    hamburger.addEventListener('click', () => {
        hamburger.classList.toggle('active');
        navMenu.classList.toggle('active');
    });

    document.querySelectorAll('.nav-menu a').forEach(link => {
        link.addEventListener('click', () => {
            hamburger.classList.remove('active');
            navMenu.classList.remove('active');
        });
    });

    // 排序选择器事件
    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            const activeFilter = document.querySelector('.filter-btn.active')?.dataset.filter || 'all';
            loadMods(activeFilter, e.target.value);
        });
    }

    window.addEventListener('scroll', () => {
        updateActiveNavLink(); // 滚动时更新激活的导航链接

        if (window.scrollY > 100) {
            navbar.style.background = 'rgba(26, 26, 46, 0.98)';
            navbar.style.boxShadow = '0 2px 30px rgba(0, 0, 0, 0.4)';
        } else {
            navbar.style.background = 'rgba(26, 26, 46, 0.95)';
            navbar.style.boxShadow = '0 2px 20px rgba(0, 0, 0, 0.3)';
        }
    });
}

// 滚动监听 - 自动更新激活的导航链接
function setupScrollSpy() {
    updateActiveNavLink(); // 初始化时执行一次
    window.addEventListener('scroll', updateActiveNavLink);
}

// 更新激活的导航链接
function updateActiveNavLink() {
    const sections = ['home', 'mods', 'download', 'contact'];
    const scrollPosition = window.scrollY + 150; // 偏移150px，考虑导航栏高度

    let currentSection = 'home';

    for (const sectionId of sections) {
        const section = document.getElementById(sectionId);
        if (section) {
            const sectionTop = section.offsetTop;
            const sectionBottom = sectionTop + section.offsetHeight;

            // 找到最后一个可见的 section
            if (scrollPosition >= sectionTop && scrollPosition < sectionBottom) {
                currentSection = sectionId;
            }
            // 如果已经滚动到底部，选择最后一个 section
            if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 50) {
                currentSection = 'contact';
            }
        }
    }

    // 更新导航链接的 active 类
    document.querySelectorAll('.nav-menu a').forEach(link => {
        link.classList.remove('active');
        const href = link.getAttribute('href');
        if (href === `#${currentSection}`) {
            link.classList.add('active');
        }
    });
}

function setupScrollObserver() {
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);

    document.querySelectorAll('.feature-card, .mod-card, .step').forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(30px)';
        el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(el);
    });
}

function showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = `notification ${type} show`;

    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}
