

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    checkLogin();
});

// 检查登录状态
function checkLogin() {
    const token = sessionStorage.getItem('adminToken');

    if (token) {
        showAdminPanel();
        loadMods();
        setupEventListeners();
    } else {
        showLoginScreen();
        setupLoginForm();
    }
}

// 显示登录界面
function showLoginScreen() {
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('adminPanel').style.display = 'none';
}

// 显示管理面板
function showAdminPanel() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('adminPanel').style.display = 'block';
    loadCategories();
}

// 设置登录表单
function setupLoginForm() {
    const loginForm = document.getElementById('loginForm');

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;

        try {
            const response = await fetch(`${API_BASE}/admin/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (response.ok) {
                sessionStorage.setItem('adminToken', data.admin.token);
                showAdminPanel();
                loadMods();
                setupEventListeners();
                document.getElementById('password').value = '';
                showNotification('登录成功', 'success');
            } else {
                showNotification(data.error || '登录失败', 'error');
                document.getElementById('password').value = '';
            }
        } catch (error) {
            showNotification('登录失败，请重试', 'error');
            console.error('Login error:', error);
        }
    });
}

// 设置事件监听器
function setupEventListeners() {
    // 添加模组表单
    document.getElementById('addModForm').addEventListener('submit', handleAddMod);

    // 编辑模组表单
    document.getElementById('editModForm').addEventListener('submit', handleEditMod);

    // 添加分类表单
    document.getElementById('addCategoryForm').addEventListener('submit', handleAddCategory);

    // 编辑分类表单
    document.getElementById('editCategoryForm').addEventListener('submit', handleEditCategory);

    // 搜索和筛选
    document.getElementById('searchMod').addEventListener('input', loadMods);
    document.getElementById('filterCategory').addEventListener('change', loadMods);

    // 退出登录
    document.getElementById('logoutBtn').addEventListener('click', async (e) => {
        e.preventDefault();

        const token = sessionStorage.getItem('adminToken');
        if (token) {
            try {
                await fetch(`${API_BASE}/admin/logout`, {
                    method: 'POST',
                    headers: { 'Authorization': token }
                });
            } catch (error) {
                console.error('Logout error:', error);
            }
        }

        sessionStorage.removeItem('adminToken');
        showLoginScreen();
        setupLoginForm();
        showNotification('已登出', 'success');
    });

    // 侧边栏导航
    document.querySelectorAll('.sidebar-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const target = link.getAttribute('href');
            document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            document.querySelectorAll('.admin-section').forEach(section => {
                section.style.display = 'none';
            });
            const targetSection = document.querySelector(target);
            if (targetSection) {
                targetSection.style.display = 'block';
            }
        });
    });

    // 关闭模组编辑弹窗
    const modCloseBtn = document.querySelector('#editModal .close-modal');
    if (modCloseBtn) {
        modCloseBtn.addEventListener('click', closeEditModal);
    }

    // 点击模组编辑弹窗外部关闭
    document.getElementById('editModal').addEventListener('click', (e) => {
        if (e.target.id === 'editModal') {
            closeEditModal();
        }
    });

    // 点击分类编辑弹窗外部关闭
    document.getElementById('editCategoryModal').addEventListener('click', (e) => {
        if (e.target.id === 'editCategoryModal') {
            closeEditCategoryModal();
        }
    });
}

// 加载模组列表
async function loadMods() {
    const search = document.getElementById('searchMod').value;
    const category = document.getElementById('filterCategory').value;
    
    try {
        const response = await fetch(`${API_BASE}/mods?category=${category}`);
        let mods = await response.json();
        
        // 前端搜索
        if (search) {
            mods = mods.filter(mod => 
                mod.name.toLowerCase().includes(search.toLowerCase()) ||
                mod.description.toLowerCase().includes(search.toLowerCase())
            );
        }
        
        displayModsTable(mods);
    } catch (error) {
        showNotification('加载失败', 'error');
        console.error('Error loading mods:', error);
    }
}

// 显示模组表格
function displayModsTable(mods) {
    const tbody = document.getElementById('modsTableBody');
    
    if (mods.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 2rem;">
                    暂无模组数据
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = mods.map(mod => `
        <tr>
            <td class="mod-icon-cell">${escapeHtml(mod.icon)}</td>
            <td>
                <strong>${escapeHtml(mod.name)}</strong>
                <div style="font-size: 0.85rem; color: var(--text-gray); margin-top: 0.3rem;">
                    ${escapeHtml(mod.description.substring(0, 50))}${mod.description.length > 50 ? '...' : ''}
                </div>
                ${mod.sourceLink ? `<div style="font-size: 0.8rem; color: var(--secondary-color); margin-top: 0.3rem;">
                    <i class="fas fa-code"></i> 有源码链接
                </div>` : ''}
            </td>
            <td>${escapeHtml(getCategoryName(mod.category))}</td>
            <td>
                <div class="rating-stars">
                    ${generateStars(mod.rating)}
                    <span>${escapeHtml(mod.rating)}</span>
                </div>
            </td>
            <td>${formatNumber(mod.downloads)}</td>
            <td>
                <div class="action-buttons">
                    <button class="action-btn edit" onclick="openEditModal(${mod.id})">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="action-btn delete" onclick="deleteMod(${mod.id})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

// 添加模组
async function handleAddMod(e) {
    e.preventDefault();

    const form = e.target;
    const formData = new FormData(form);
    const modData = {
        name: formData.get('name'),
        description: formData.get('description'),
        category: formData.get('category'),
        icon: formData.get('icon') || '📦',
        tags: formData.get('tags') ? formData.get('tags').split(',').map(t => t.trim()) : [],
        rating: parseFloat(formData.get('rating')),
        downloads: parseInt(formData.get('downloads')),
        cloudLink: formData.get('cloudLink'),
        sourceLink: formData.get('sourceLink') || null,
        backgroundImage: formData.get('backgroundImage') || null
    };

    try {
        const response = await fetch(`${API_BASE}/mods`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(modData)
        });

        if (response.ok) {
            showNotification('模组添加成功！', 'success');
            form.reset();
            document.getElementById('modIcon').value = '📦';
            document.getElementById('modRating').value = 4.5;
            document.getElementById('modDownloads').value = 0;
            loadMods();
        } else {
            showNotification('添加失败，请重试', 'error');
        }
    } catch (error) {
        showNotification('添加失败，请重试', 'error');
        console.error('Error adding mod:', error);
    }
}

// 打开编辑弹窗
async function openEditModal(modId) {
    try {
        const response = await fetch(`${API_BASE}/mods/${modId}`);
        const mod = await response.json();
        
        document.getElementById('editModId').value = mod.id;
        document.getElementById('editModName').value = mod.name;
        document.getElementById('editModDescription').value = mod.description;
        document.getElementById('editModCategory').value = mod.category;
        document.getElementById('editModIcon').value = mod.icon || '📦';
        document.getElementById('editModTags').value = mod.tags ? mod.tags.join(', ') : '';
        document.getElementById('editModRating').value = mod.rating;
        document.getElementById('editModDownloads').value = mod.downloads;
        document.getElementById('editModCloudLink').value = mod.cloudLink;
        document.getElementById('editModSourceLink').value = mod.sourceLink || '';
        document.getElementById('editModBackgroundImage').value = mod.backgroundImage || '';

        document.getElementById('editModal').classList.add('show');
    } catch (error) {
        showNotification('加载模组信息失败', 'error');
        console.error('Error loading mod:', error);
    }
}

// 关闭编辑弹窗
function closeEditModal() {
    document.getElementById('editModal').classList.remove('show');
}

// 编辑模组
async function handleEditMod(e) {
    e.preventDefault();

    const modId = document.getElementById('editModId').value;
    const form = e.target;
    const formData = new FormData(form);
    const modData = {
        name: formData.get('name'),
        description: formData.get('description'),
        category: formData.get('category'),
        icon: formData.get('icon') || '📦',
        tags: formData.get('tags') ? formData.get('tags').split(',').map(t => t.trim()) : [],
        rating: parseFloat(formData.get('rating')),
        downloads: parseInt(formData.get('downloads')),
        cloudLink: formData.get('cloudLink'),
        sourceLink: formData.get('sourceLink') || null,
        backgroundImage: formData.get('backgroundImage') || null
    };

    try {
        const response = await fetch(`${API_BASE}/mods/${modId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(modData)
        });

        if (response.ok) {
            showNotification('模组更新成功！', 'success');
            closeEditModal();
            loadMods();
        } else {
            showNotification('更新失败，请重试', 'error');
        }
    } catch (error) {
        showNotification('更新失败，请重试', 'error');
        console.error('Error updating mod:', error);
    }
}

// 删除模组
async function deleteMod(modId) {
    if (!confirm('确定要删除这个模组吗？')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/mods/${modId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            showNotification('模组删除成功！', 'success');
            loadMods();
        } else {
            showNotification('删除失败，请重试', 'error');
        }
    } catch (error) {
        showNotification('删除失败，请重试', 'error');
        console.error('Error deleting mod:', error);
    }
}

// 显示通知
function showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = `notification ${type} show`;

    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

// ==================== 分类管理 ====================

// 加载分类列表
async function loadCategories() {
    try {
        const response = await fetch(`${API_BASE}/categories`);
        const categories = await response.json();
        displayCategoriesTable(categories);
        updateCategorySelects(categories);
    } catch (error) {
        showNotification('加载分类失败', 'error');
        console.error('Error loading categories:', error);
    }
}

// 显示分类表格
async function displayCategoriesTable(categories) {
    const tbody = document.getElementById('categoriesTableBody');

    if (categories.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; padding: 2rem;">
                    暂无分类数据
                </td>
            </tr>
        `;
        return;
    }

    // 获取每个分类的模组数量
    const modCounts = await Promise.all(
        categories.map(async (cat) => {
            try {
                const response = await fetch(`${API_BASE}/mods?category=${cat.name}`);
                const mods = await response.json();
                return { id: cat.id, count: mods.length };
            } catch {
                return { id: cat.id, count: 0 };
            }
        })
    );

    tbody.innerHTML = categories.map(cat => {
        const modCount = modCounts.find(m => m.id === cat.id)?.count || 0;
        return `
            <tr>
                <td class="category-icon-cell">${cat.icon || ''}</td>
                <td><strong>${cat.name}</strong></td>
                <td>${cat.description || '-'}</td>
                <td>${modCount}</td>
                <td>
                    <div class="action-buttons">
                        <button class="action-btn edit" onclick="openEditCategoryModal(${cat.id})">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="action-btn delete" onclick="deleteCategory(${cat.id}, ${modCount})">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// 更新模组表单中的分类下拉框
function updateCategorySelects(categories) {
    const options = categories.map(cat => `<option value="${cat.name}">${cat.name}</option>`).join('');

    const addSelect = document.getElementById('modCategory');
    const editSelect = document.getElementById('editModCategory');
    const filterSelect = document.getElementById('filterCategory');

    if (addSelect) {
        addSelect.innerHTML = `<option value="">选择分类</option>${options}`;
    }
    if (editSelect) {
        editSelect.innerHTML = options;
    }
    if (filterSelect) {
        filterSelect.innerHTML = `<option value="">所有分类</option>${options}`;
    }
}

// 添加分类
async function handleAddCategory(e) {
    e.preventDefault();

    const form = e.target;
    const formData = new FormData(form);
    const categoryData = {
        name: formData.get('name'),
        icon: formData.get('icon') || '',
        description: formData.get('description') || ''
    };

    try {
        const token = sessionStorage.getItem('adminToken');
        const response = await fetch(`${API_BASE}/categories`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': token
            },
            body: JSON.stringify(categoryData)
        });

        if (response.ok) {
            showNotification('分类添加成功！', 'success');
            form.reset();
            loadCategories();
        } else {
            const data = await response.json();
            showNotification(data.error || '添加失败', 'error');
        }
    } catch (error) {
        showNotification('添加失败，请重试', 'error');
        console.error('Error adding category:', error);
    }
}

// 打开编辑分类弹窗
async function openEditCategoryModal(categoryId) {
    try {
        const response = await fetch(`${API_BASE}/categories/${categoryId}`);
        const category = await response.json();

        document.getElementById('editCategoryId').value = category.id;
        document.getElementById('editCategoryName').value = category.name;
        document.getElementById('editCategoryIcon').value = category.icon || '';
        document.getElementById('editCategoryDescription').value = category.description || '';

        document.getElementById('editCategoryModal').classList.add('show');
    } catch (error) {
        showNotification('加载分类信息失败', 'error');
        console.error('Error loading category:', error);
    }
}

// 关闭编辑分类弹窗
function closeEditCategoryModal() {
    document.getElementById('editCategoryModal').classList.remove('show');
}

// 编辑分类
async function handleEditCategory(e) {
    e.preventDefault();

    const categoryId = document.getElementById('editCategoryId').value;
    const form = e.target;
    const formData = new FormData(form);
    const categoryData = {
        name: formData.get('name'),
        icon: formData.get('icon') || '',
        description: formData.get('description') || ''
    };

    try {
        const token = sessionStorage.getItem('adminToken');
        const response = await fetch(`${API_BASE}/categories/${categoryId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': token
            },
            body: JSON.stringify(categoryData)
        });

        if (response.ok) {
            showNotification('分类更新成功！', 'success');
            closeEditCategoryModal();
            loadCategories();
        } else {
            const data = await response.json();
            showNotification(data.error || '更新失败', 'error');
        }
    } catch (error) {
        showNotification('更新失败，请重试', 'error');
        console.error('Error updating category:', error);
    }
}

// 删除分类
async function deleteCategory(categoryId, modCount) {
    if (modCount > 0) {
        showNotification('该分类下还有模组，无法删除', 'error');
        return;
    }

    if (!confirm('确定要删除这个分类吗？')) {
        return;
    }

    try {
        const token = sessionStorage.getItem('adminToken');
        const response = await fetch(`${API_BASE}/categories/${categoryId}`, {
            method: 'DELETE',
            headers: { 'Authorization': token }
        });

        if (response.ok) {
            showNotification('分类删除成功！', 'success');
            loadCategories();
        } else {
            const data = await response.json();
            showNotification(data.error || '删除失败', 'error');
        }
    } catch (error) {
        showNotification('删除失败，请重试', 'error');
        console.error('Error deleting category:', error);
    }
}

