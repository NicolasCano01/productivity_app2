// ============================================
// PRODUCTIVITY HUB - CATEGORY MANAGEMENT
// ============================================


// Available colors for categories
const CATEGORY_COLORS = [
    '#EF4444', '#F97316', '#F59E0B', '#EAB308', '#84CC16', '#10B981',
    '#14B8A6', '#06B6D4', '#0EA5E9', '#3B82F6', '#6366F1', '#8B5CF6',
    '#A855F7', '#D946EF', '#EC4899', '#F43F5E', '#64748B'
];

let selectedColor = CATEGORY_COLORS[0];
let draggedCategoryId = null;

// NOTE: Categories should be fetched from database ordered by display_order
// Ensure supabase.js fetches with: .order('display_order', { nullsFirst: false })

// Open category management modal
function openCategoryModal() {
    const modal = document.getElementById('category-modal');
    modal.classList.remove('hidden');
    
    // Reset form
    editingCategoryId = null;
    document.getElementById('category-form').reset();
    selectedColor = CATEGORY_COLORS[0];
    
    // Render color picker
    renderColorPicker();
    
    // Render category list
    renderCategoryList();
}

// Close category modal
function closeCategoryModal() {
    document.getElementById('category-modal').classList.add('hidden');
    editingCategoryId = null;
}

// Render color picker circles
function renderColorPicker() {
    const container = document.getElementById('color-picker');
    container.innerHTML = CATEGORY_COLORS.map(color => 
        '<button type="button" class="w-10 h-10 rounded-full border-2 transition-all ' + 
        (color === selectedColor ? 'border-gray-800 scale-110' : 'border-transparent') + 
        '" style="background-color: ' + color + ';" onclick="selectColor(\'' + color + '\')"></button>'
    ).join('');
}

// Select a color
function selectColor(color) {
    selectedColor = color;
    renderColorPicker();
}

// Render list of existing categories with drag-drop
function renderCategoryList() {
    const list = document.getElementById('category-list');
    
    if (appState.categories.length === 0) {
        list.innerHTML = '<p class="text-gray-500 text-sm text-center py-4">No categories yet</p>';
        return;
    }
    
    list.innerHTML = appState.categories.map(cat => 
        '<div class="category-item flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg transition cursor-move" ' +
        'draggable="true" ' +
        'data-category-id="' + cat.id + '" ' +
        'ondragstart="handleCategoryDragStart(event, \'' + cat.id + '\')" ' +
        'ondragend="handleCategoryDragEnd(event)" ' +
        'ondragover="handleCategoryDragOver(event)" ' +
        'ondrop="handleCategoryDrop(event, \'' + cat.id + '\')" ' +
        'ondragleave="handleCategoryDragLeave(event)">' +
        '<div class="flex items-center gap-3">' +
        '<i class="fas fa-grip-vertical text-gray-400 text-sm"></i>' +
        '<div class="w-6 h-6 rounded-full" style="background-color: ' + cat.color_hex + ';"></div>' +
        '<span class="font-medium text-gray-800">' + escapeHtml(cat.name) + '</span>' +
        '</div>' +
        '<div class="flex items-center gap-2">' +
        '<button onclick="event.stopPropagation(); editCategory(\'' + cat.id + '\')" class="text-primary hover:text-blue-700 p-1" title="Edit">' +
        '<i class="fas fa-pen text-sm"></i>' +
        '</button>' +
        '<button onclick="event.stopPropagation(); deleteCategory(\'' + cat.id + '\')" class="text-danger hover:text-red-700 p-1" title="Delete">' +
        '<i class="fas fa-trash text-sm"></i>' +
        '</button>' +
        '</div>' +
        '</div>'
    ).join('');
}

// Drag and drop handlers for categories
function handleCategoryDragStart(event, categoryId) {
    draggedCategoryId = categoryId;
    event.currentTarget.style.opacity = '0.4';
    event.dataTransfer.effectAllowed = 'move';
}

function handleCategoryDragEnd(event) {
    event.currentTarget.style.opacity = '1';
    document.querySelectorAll('.category-item').forEach(item => {
        item.classList.remove('drag-over');
    });
}

function handleCategoryDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    
    const draggedItem = document.querySelector('[data-category-id="' + draggedCategoryId + '"]');
    const currentItem = event.currentTarget;
    
    if (draggedItem && currentItem !== draggedItem) {
        currentItem.classList.add('drag-over');
    }
}

function handleCategoryDragLeave(event) {
    event.currentTarget.classList.remove('drag-over');
}

async function handleCategoryDrop(event, targetCategoryId) {
    event.preventDefault();
    event.currentTarget.classList.remove('drag-over');
    
    if (!draggedCategoryId || draggedCategoryId === targetCategoryId) {
        return;
    }
    
    const draggedIndex = appState.categories.findIndex(c => c.id === draggedCategoryId);
    const targetIndex = appState.categories.findIndex(c => c.id === targetCategoryId);
    
    if (draggedIndex === -1 || targetIndex === -1) return;
    
    // Optimistic update
    const draggedCategory = appState.categories[draggedIndex];
    appState.categories.splice(draggedIndex, 1);
    appState.categories.splice(targetIndex, 0, draggedCategory);
    
    renderCategoryList();
    populateFilterDropdowns();
    
    // Background database update
    try {
        const updates = appState.categories.map((category, index) => ({
            id: category.id,
            display_order: index
        }));
        
        for (const update of updates) {
            await supabaseClient
                .from('categories')
                .update({ display_order: update.display_order })
                .eq('id', update.id);
        }
        
        console.log('✅ Category order saved');
        
    } catch (error) {
        console.error('Error reordering categories:', error);
        showToast('Failed to save order', 'error');
        // Refetch categories on error
        const { data } = await supabaseClient.from('categories').select('*').order('display_order');
        if (data) appState.categories = data;
        renderCategoryList();
        populateFilterDropdowns();
    }
    
    draggedCategoryId = null;
}

// Edit category
function editCategory(categoryId) {
    const category = appState.categories.find(c => c.id === categoryId);
    if (!category) return;
    
    editingCategoryId = categoryId;
    document.getElementById('category-name').value = category.name;
    selectedColor = category.color_hex;
    renderColorPicker();
}

async function saveCategory(event) {
    event.preventDefault();
    
    // Prevent double-submission
    const submitBtn = event.submitter;
    if (submitBtn && submitBtn.disabled) return;
    if (submitBtn) submitBtn.disabled = true;
    
    const categoryName = document.getElementById('category-name').value.trim();
    
    if (!categoryName) {
        showToast('Category name is required', 'error');
        if (submitBtn) submitBtn.disabled = false;
        return;
    }
    
    try {
        if (editingCategoryId) {
            // Update existing category
            const { error } = await supabaseClient
                .from('categories')
                .update({
                    name: categoryName,
                    color_hex: selectedColor
                })
                .eq('id', editingCategoryId);
            
            if (error) throw error;
            
            // Update in appState
            const categoryIndex = appState.categories.findIndex(c => c.id === editingCategoryId);
            if (categoryIndex !== -1) {
                appState.categories[categoryIndex].name = categoryName;
                appState.categories[categoryIndex].color_hex = selectedColor;
            }
            
            showToast('Category updated!', 'success');
            
        } else {
            // Create new category
            const newCategory = {
                name: categoryName,
                color_hex: selectedColor,
                display_order: appState.categories.length
            };
            
            const { data, error } = await supabaseClient
                .from('categories')
                .insert([newCategory])
                .select()
                .single();
            
            if (error) throw error;
            
            // Add to appState
            appState.categories.push(data);
            
            showToast('Category created!', 'success');
        }
        
        // Reset form
        document.getElementById('category-form').reset();
        selectedColor = CATEGORY_COLORS[0];
        editingCategoryId = null;
        renderColorPicker();
        renderCategoryList();
        
        // Update filter dropdowns so new category appears immediately
        populateFilterDropdowns();
        
        if (submitBtn) submitBtn.disabled = false;
        
    } catch (error) {
        console.error('Error saving category:', error);
        showToast('Failed to save category', 'error');
        if (submitBtn) submitBtn.disabled = false;
    }
}

// Delete category with undo functionality (soft delete — 30-day retention)
async function deleteCategory(categoryId) {
    const category = appState.categories.find(c => c.id === categoryId);
    if (!category) return;

    const affectedTasks = appState.tasks.filter(t => t.category_id === categoryId);
    const taskCount = affectedTasks.length;

    // Snapshot for undo
    const deletedCategory = { ...category };
    const affectedTaskIds = affectedTasks.map(t => ({ id: t.id, category_id: t.category_id }));

    // Optimistic UI removal
    appState.categories = appState.categories.filter(c => c.id !== categoryId);
    appState.tasks.forEach(task => {
        if (task.category_id === categoryId) {
            task.category_id = null;
            task.category = null;
        }
    });
    renderCategoryList();
    populateFilterDropdowns();
    if (currentPanel === 'tasks') renderTasks();

    // Capture the deferred-delete timer so undo can cancel it
    let deleteTimer = null;

    const message = taskCount > 0
        ? `Category deleted (${taskCount} task${taskCount > 1 ? 's' : ''} uncategorized)`
        : 'Category deleted';

    showUndoToast(message, () => {
        // Cancel the pending DB delete — the category is still in the DB!
        if (deleteTimer) clearTimeout(deleteTimer);

        // Restore state only (no DB insert needed — delete hasn't fired yet)
        appState.categories.push(deletedCategory);
        appState.categories.sort((a, b) => (a.display_order || 0) - (b.display_order || 0));

        appState.tasks.forEach(task => {
            const original = affectedTaskIds.find(t => t.id === task.id);
            if (original) {
                task.category_id = original.category_id;
                task.category = {
                    id: deletedCategory.id,
                    name: deletedCategory.name,
                    color_hex: deletedCategory.color_hex
                };
            }
        });

        renderCategoryList();
        populateFilterDropdowns();
        if (currentPanel === 'tasks') renderTasks();
    });

    // Soft-delete after undo window (set deleted_at + null out tasks)
    deleteTimer = setTimeout(async () => {
        try {
            await supabaseClient
                .from('tasks')
                .update({ category_id: null })
                .eq('category_id', categoryId);

            const { error } = await supabaseClient
                .from('categories')
                .update({ deleted_at: new Date().toISOString() })
                .eq('id', categoryId);

            if (error) throw error;
            console.log('✅ Category soft-deleted (will purge in 30 days)');
        } catch (error) {
            console.error('Error soft-deleting category:', error);
        }
    }, 5000);
}
