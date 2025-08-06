// 任务数据管理
const TaskManager = {
  userId: null,
  currentCategory: '无标签',
  tasks: [],
  currentEditingTaskId: null,
  tags: [], // 新增：存储用户标签数组

  // 初始化函数
  async init() {
    console.log('================ 开始初始化 TaskManager ================');
    const startTime = Date.now();

    
    // 添加uTools插件激活事件
    utools.onPluginEnter(({ code, type, payload }) => {
      console.log('uTools插件被激活', code, type, payload);
      // 处理插件激活时的逻辑
      this.loadTasks();
    });


    // 获取uTools用户信息
    const userInfo = utools.getUser();
   this.userId = userInfo.nickname || 'default_user';

    // 显示用户名
    this.displayUsername(this.userId || '用户',userInfo.avatar);

    // 加载用户标签数据 - 新增
    await this.loadTags();

    // 加载用户的提醒时间设置
    await this.loadUserRemindTime();

    await this.loadTasks();
    this.renderTaskCategories();
    this.renderTasks();
    this.bindEventListeners();
    this.bindTagModalEvents();
    this.initTagDragAndDrop(); 

// 绑定提醒时间选择事件
    this.bindRemindTimeEvents();

    // 添加定时检查任务截止时间 (新增代码)
    this.checkDeadlineInterval = setInterval(() => {
      this.checkTaskDeadlines();
    }, 60000); // 每分钟检查一次


    // 计算初始化耗时
    const endTime = Date.now();
    console.log(`================ 初始化完成，耗时: ${endTime - startTime}ms ================`);
  },

  // 新增：加载用户标签
  async loadTags() {
      const tagsJson = utools.dbStorage.getItem(`label_${this.userId}`);
      if (!tagsJson) {
        // 初始化默认标签
        const defaultTags = [
          { name: '个人', background_color: '#c8e6c9' ,dot_color:'#2AFA23'},
          { name: '工作', background_color: '#bbdefb' ,dot_color:'#3282F6'},
          { name: '重要', background_color: '#ffcdd2' ,dot_color:'#ED1C24'}
        ];
        utools.dbStorage.setItem(`label_${this.userId}`, defaultTags);
        this.tags = defaultTags;
    }else{
      this.tags =  tagsJson;
     }
  },


  // 加载任务数据
  async loadTasks() {
  try {
    console.log(`开始加载任务`);
    // 直接从uTools数据库获取任务
    this.tasks = utools.db.allDocs(`tasks_${this.userId}`).map(item => item.value) || [];
    console.log(`成功加载到 ${this.tasks.length} 个任务`);
    this.autoUpdateTaskStatuses();
  } catch (error) {
    console.error('加载任务失败:', error);
  }
},

  // 新增：自动更新所有任务状态
  autoUpdateTaskStatuses() {
    const now = new Date();
    this.tasks.forEach(task => {
      // 只有当任务状态不是'已完成'时才自动更新
      if (task.status !== '已完成') {
        const startTime = new Date(task.startTime);
        const endTime = new Date(task.endTime);

        if (now < startTime) {
          task.status = '未开始';
        } else if (now >= startTime && now < endTime) {
          task.status = '进行中';
        } else if (now >= endTime) {
          task.status = '已结束';
        }
      }
    });
  },

  // 更新任务状态
  async updateTaskStatus(taskId, status) {
  const updatedTask = utools.dbStorage.getItem(`tasks_${this.userId}_${taskId}`);
  
  if (status !== '已完成') {
    // 取消勾选时，计算正确的状态
    const task = this.tasks.find(t => t.id === taskId);
    if (task) {
      const now = new Date();
      const startTime = new Date(task.startTime);
      const endTime = new Date(task.endTime);
      
      if (now < startTime) {
        updatedTask.status = '未开始';
      } else if (now >= startTime && now < endTime) {
        updatedTask.status = '进行中';
      } else if (now >= endTime) {
        updatedTask.status = '已结束';
      }
    }
  } else {
    // 勾选完成时，直接设置状态
    updatedTask.status = status;
  }
  
  utools.dbStorage.setItem(`tasks_${this.userId}_${taskId}`, updatedTask);
  const index = this.tasks.findIndex(task => task.id === taskId);
  if (index !== -1) {
    this.tasks[index] = updatedTask;
    this.renderTaskCategories();
    this.renderTasks();
  }
},

  initTagsSelector() {
    // 绑定标签展开/折叠按钮事件
    let toggleBtn = document.querySelector('.toggle-tags-btn');
    let toggleIcon = toggleBtn.querySelector('.toggle-icon');
    const tagsList = document.querySelector('.tags-list');
    const tagsSelector = document.querySelector('.tags-selector');
    let searchInput = document.querySelector('.tag-search-input');

    // 优化：使用事件委托代替克隆元素来移除事件监听器
    const resetElementEvents = (element) => {
      const newElement = element.cloneNode(true);
      element.parentNode.replaceChild(newElement, element);
      return newElement;
    };

    toggleBtn = resetElementEvents(toggleBtn);
    toggleIcon = toggleBtn.querySelector('.toggle-icon');
    searchInput = resetElementEvents(searchInput);

    // 关键修复1：先清空选中标签显示容器
    const selectedTagsContainer = document.querySelector('.selected-tags');
    if (selectedTagsContainer) {
      selectedTagsContainer.innerHTML = '';
    }

    // 使用DocumentFragment优化DOM操作
    const fragment = document.createDocumentFragment();
    this.tags.forEach(tag => {
      const tagItem = document.createElement('div');
      tagItem.className = 'tag-item';
      tagItem.innerHTML = `
        <input type="checkbox" name="taskTag" value="${tag.name}" data-color="${tag.dot_color}" id="tag-${tag.name}">
        <label for="tag-${tag.name}" style="text-align:left;">
          <span class="tag-color-dot" style="background-color: ${tag.dot_color};"></span>
          ${tag.name}
        </label>
      `;
      fragment.appendChild(tagItem);
    });

    // 一次性添加所有标签项
    tagsList.innerHTML = '';
    tagsList.appendChild(fragment);
    if (!this.currentEditingTaskId) {
      document.querySelectorAll('input[name="taskTag"]').forEach(checkbox => {
        checkbox.checked = false;
      });

      // 确保在标签项添加到DOM后清除选中状态
      setTimeout(() => {
        document.querySelectorAll('input[name="taskTag"]').forEach(checkbox => {
          checkbox.checked = false;
        });
        // 更新选中标签显示
        this.updateSelectedTags();
      }, 0);
    }
    
    // 预加载图片
    const downImg = new Image();
    downImg.src = '../public/pic/down.png';
    const searchImg = new Image();
    searchImg.src = '../public/pic/search.png';

    if (tagsList.classList.contains('hidden')) {
        toggleIcon.src = downImg.src;
        toggleIcon.alt = '展开';
        } else {
        toggleIcon.src = searchImg.src;
        toggleIcon.alt = '搜索';
        }

    toggleBtn.addEventListener('click', () => {
        tagsList.classList.toggle('hidden');
        if (tagsList.classList.contains('hidden')) {
            // 折叠时显示向下箭头图片
            toggleIcon.src = downImg.src;
            toggleIcon.alt = '展开';
        } else {
            // 展开时显示搜索图片
            toggleIcon.src = searchImg.src;
            toggleIcon.alt = '搜索';
            // 聚焦到输入框
            searchInput.focus();
        }
    });

    // 添加输入框聚焦事件
    searchInput.addEventListener('focus', () => {
        if (tagsList.classList.contains('hidden')) {
            // 展开标签列表
            tagsList.classList.remove('hidden');
            // 切换为搜索图标
            toggleIcon.src = searchImg.src;
            toggleIcon.alt = '搜索';
        }
    });

    // 点击页面其他区域关闭标签列表
    // 使用事件委托优化，避免重复绑定
    document.addEventListener('click', (e) => {
        // 检查点击是否发生在标签选择器外部
        if (!tagsSelector.contains(e.target)) {
            if (!tagsList.classList.contains('hidden')) {
                tagsList.classList.add('hidden');
                // 恢复向下箭头图片
                toggleIcon.src = downImg.src;
                toggleIcon.alt = '展开';
            }
        }
    });

    // 绑定标签复选框事件
    const tagCheckboxes = document.querySelectorAll('input[name="taskTag"]');
    tagCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', () => {
            const checkedCheckboxes = document.querySelectorAll('input[name="taskTag"]:checked');
            // 检查是否超过3个标签
            if (checkbox.checked && checkedCheckboxes.length > 3) {
                checkbox.checked = false;
                // 替换alert调用
                showCustomAlert('最多只能选择3个标签');
            }
            this.updateSelectedTags();
            searchInput.focus();
        });
    });


    // 绑定标签搜索事件
    searchInput.addEventListener('input', () => {
        this.filterTags(searchInput.value);
    });
    searchInput.addEventListener('blur', () => {
        // 使用setTimeout确保在点击其他元素（如标签复选框）后再执行
        setTimeout(() => {
            // 检查是否需要关闭标签列表
            if (!tagsSelector.contains(document.activeElement)) {
                tagsList.classList.add('hidden');
                // 切换为向下箭头图标
                toggleIcon.src = downImg.src;
                toggleIcon.alt = '展开';
            }
        }, 200);
    });
  },
initTagDragAndDrop() {
    const categoryList = document.getElementById('categoryList');
    let dragStartIndex;
    let isDragging = false;
    let dragTimer;
    let draggedItem;
    let initialY;

    // 为每个可拖动的标签项添加事件监听
    const setupDraggableTags = () => {
      // 移除旧的事件监听器
      document.querySelectorAll('.category-item').forEach(item => {
        item.removeEventListener('mousedown', handleMouseDown);
      });

      // 为用户自定义标签添加拖动事件（排除系统分类）
      document.querySelectorAll('.category-item').forEach((item) => {
        const category = item.dataset.category;
        // 只让用户自定义标签可拖动
        if (!['无标签', '星标', '今日截止', '已完成'].includes(category)) {
          item.setAttribute('draggable', 'true');
          item.classList.add('draggable');
          item.addEventListener('mousedown', handleMouseDown);
        } else {
          item.setAttribute('draggable', 'false');
          item.classList.remove('draggable');
        }
      });
    };

    // 鼠标按下事件 - 开始计时以检测长按
    const handleMouseDown = (e) => {
      // 只有左键点击才触发
      if (e.button !== 0) return;

      // 阻止默认行为，防止选中文本
      e.preventDefault();

      draggedItem = e.currentTarget;
      initialY = e.clientY;
      isDragging = false;
      hasMoved = false;

      // 过滤掉系统分类，获取真正的用户标签索引
      const category = draggedItem.dataset.category;
      const userTags = this.tags.filter(tag => tag && !['无标签', '星标', '今日截止', '已完成'].includes(tag.name));
      dragStartIndex = userTags.findIndex(tag => tag.name === category);

      // 立即绑定移动和释放事件到文档
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('mouseleave', handleMouseUp);
    };

    // 鼠标移动事件 - 处理拖动
    const handleMouseMove = (e) => {
      // 阻止默认行为
      e.preventDefault();

      // 检测是否有足够的位移来判断为拖动操作
      if (!hasMoved && Math.abs(e.clientY - initialY) > 5) {
        hasMoved = true;
        isDragging = true;
        draggedItem.classList.add('dragging-ready');
        // 提高被拖动元素的层级
        draggedItem.style.zIndex = '100';
      }

      if (!isDragging) return;

      // 获取所有可拖动的标签项
      const categoryItems = Array.from(document.querySelectorAll('.category-item.draggable'));

      // 计算当前鼠标位置对应的标签项
      let targetIndex = -1;
      for (let i = 0; i < categoryItems.length; i++) {
        const rect = categoryItems[i].getBoundingClientRect();
        if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
          targetIndex = i;
          break;
        }
      }

      // 如果找到了目标位置且不同于起始位置，则调整标签顺序
      if (targetIndex !== -1 && targetIndex !== dragStartIndex) {
        // 确保我们操作的是有效的标签数组
        if (Array.isArray(this.tags)) {
          // 过滤掉NULL值
          this.tags = this.tags.filter(tag => tag !== null && tag !== undefined);

          // 更新数组顺序
          const userTags = [...this.tags].filter(tag => !['无标签', '星标', '今日截止', '已完成'].includes(tag.name));
          const temp = userTags[dragStartIndex];
          userTags.splice(dragStartIndex, 1);
          userTags.splice(targetIndex, 0, temp);

          // 合并系统标签和重新排序的用户标签
          const systemTags = this.tags.filter(tag => ['无标签', '星标', '今日截止', '已完成'].includes(tag.name));
          this.tags = [...systemTags, ...userTags];

          // 重新渲染分类列表
          this.renderTaskCategories();
          setupDraggableTags();

          // 更新拖动起始索引
          dragStartIndex = targetIndex;
        }
      }
    };

    // 鼠标释放事件 - 结束拖动
    const handleMouseUp = () => {
      // 移除文档上的事件监听器
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mouseleave', handleMouseUp);

      if (isDragging && hasMoved) {
        isDragging = false;
        draggedItem.classList.remove('dragging');
        draggedItem.classList.remove('dragging-ready');  // 移除拖拽准备状态类
        draggedItem.style.zIndex = '1';
        document.body.style.cursor = 'default';

        // 确保我们操作的是有效的标签数组
        if (Array.isArray(this.tags)) {
          // 过滤掉NULL值
          this.tags = this.tags.filter(tag => tag !== null && tag !== undefined);

          // 保存新的标签顺序到数据库
          utools.dbStorage.setItem(`label_${this.userId}`, this.tags);

          // 重新初始化标签选择器
          this.initTagsSelector();

          this.renderTasks();
        }
      }
      // 如果没有移动，则视为普通点击，不执行任何操作
    };

    // 初始设置
    setupDraggableTags();

    // 监听分类列表更新，重新设置拖动事件
    const observer = new MutationObserver(() => {
      if (!isDragging) {
        setupDraggableTags();
      }
    });

    observer.observe(categoryList, {
      childList: true,
      subtree: true
    });
  },

  // 更新选中的标签 - 微调
  updateSelectedTags() {
    const selectedTagsContainer = document.querySelector('.selected-tags');
    selectedTagsContainer.innerHTML = '';

    const checkedCheckboxes = document.querySelectorAll('input[name="taskTag"]:checked');
    checkedCheckboxes.forEach(checkbox => {
      const tag = checkbox.value;
      const color = checkbox.dataset.color;

      // 截断过长标签，长度大于8时显示省略号
      const displayTag = tag.length > 8 ? tag.substring(0, 8) + '...' : tag;

      const tagElement = document.createElement('div');
      tagElement.className = 'selected-tag';
      tagElement.dataset.tag = tag;
      tagElement.innerHTML = `
        <span style="display: inline-block; width: 12px; height: 12px; border-radius: 50%; background-color: ${color}; margin-right: 5px;"></span>
        ${displayTag}
        <span class="remove-tag" data-tag="${tag}">×</span>
      `;

      selectedTagsContainer.appendChild(tagElement);
    });

    const searchInput = document.querySelector('.tag-search-input');
    if (checkedCheckboxes.length > 0) {
        searchInput.placeholder = '';
    } else {
        searchInput.placeholder = '添加标签';
    }

    // 绑定删除标签事件
    document.querySelectorAll('.remove-tag').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tagToRemove = e.target.dataset.tag;
        const checkbox = document.querySelector(`input[name="taskTag"][value="${tagToRemove}"]`);
        if (checkbox) {
          checkbox.checked = false;
          this.updateSelectedTags();
        }
      });
    });
  },


  // 设置选中的标签（编辑任务时使用）
  setSelectedTags(tags) {
    // 先取消所有选中状态
    document.querySelectorAll('input[name="taskTag"]').forEach(checkbox => {
      checkbox.checked = false;
    });

    const limitedTags = tags.slice(0, 3);
    if (tags.length > 3) {
    // 替换alert调用
    showCustomAlert('最多只能选择3个标签，已自动保留前3个');
}

    // 选中指定的标签
    tags.forEach(tag => {
      const checkbox = document.querySelector(`input[name="taskTag"][value="${tag}"]`);
      if (checkbox) {
        checkbox.checked = true;
      }
    });

    // 更新显示
    this.updateSelectedTags();
  },

  // 过滤标签
   filterTags(searchTerm) {
    const tagsList = document.querySelector('.tags-list');
    const tagItems = document.querySelectorAll('.tags-list > div:not(.tag-list-empty-state)');
    searchTerm = searchTerm.toLowerCase();

    // 使用requestAnimationFrame优化重绘
    requestAnimationFrame(() => {
        let hasVisibleItems = false;
        
        tagItems.forEach(item => {
            const tagText = item.textContent.toLowerCase();
            if (tagText.includes(searchTerm)) {
                item.style.display = 'flex';
                hasVisibleItems = true;
            } else {
                item.style.display = 'none';
            }
        });

        // 检查是否已有空状态元素
        let emptyState = document.querySelector('.tag-list-empty-state');
        
        // 根据是否有可见项决定显示或隐藏空状态
        if (!hasVisibleItems) {
            if (!emptyState) {
                // 创建空状态元素
                emptyState = document.createElement('div');
                emptyState.className = 'tag-list-empty-state';
                emptyState.innerHTML = `
                    <img src="../public/pic/empty.png" alt="暂无标签">
                    <p>暂无标签</p>
                `;
                tagsList.appendChild(emptyState);
            } else {
                emptyState.style.display = 'flex';
            }
        } else if (emptyState) {
            emptyState.style.display = 'none';
        }
    });
  },

 // 加载用户的提醒时间设置
  async loadUserRemindTime() {
      console.log('开始加载用户提醒时间设置');
     const remindTime= utools.dbStorage.getItem(`remindTime_${this.userId}`);
     if (remindTime) {
      this.remindTime = remindTime;
      if (document.getElementById('remindTimeSelect')) 
          document.getElementById('remindTimeSelect').value = this.remindTime;
     } else {
      this.remindTime = 60;
     }
  },

  // 保存用户的提醒时间设置
 async saveUserRemindTime(remindTime) {
  try {
    console.log(`开始保存用户提醒时间: ${remindTime}分钟`);
    // 使用uTools数据库保存设置
    utools.dbStorage.setItem(`remindTime_${this.userId}`, JSON.stringify(remindTime));
    this.remindTime = remindTime;
    console.log('保存用户提醒时间成功');
  } catch (error) {
    console.error('保存用户提醒时间发生错误:', error);
  }
},

  // 绑定提醒时间选择事件
  bindRemindTimeEvents() {
    const select = document.getElementById('remindTimeSelect');
    if (select) {
      select.addEventListener('change', (e) => {
        const remindTime = parseInt(e.target.value);
        console.log(`用户选择提醒时间: ${remindTime}分钟`);
        this.saveUserRemindTime(remindTime);
      });
    }
  },

  // 检查任务截止时间并发送提醒
  checkTaskDeadlines() {
    console.log('开始检查任务截止时间');
    const now = new Date();
    const remindTimeMs = this.remindTime * 60000; // 转换为毫秒

    this.tasks.forEach(task => {
      // 跳过已完成、已提醒或无结束时间的任务
      if (task.status === '已完成' || task.status === '已结束' || task.notified || !task.endTime) {
        return;
      }

      const endTime = new Date(task.endTime);
      const timeDiff = endTime - now;

      // 如果任务将在设定的提醒时间内结束且尚未提醒
      if (timeDiff > 0 && timeDiff <= remindTimeMs) {
        console.log(`任务 ${task.title} 将在${this.remindTime}分钟内结束，发送提醒`);
        this.showExpiringAlert(task);
        task.notified = true; // 标记为已提醒，避免重复弹窗
      } else if (timeDiff <= 0) {
        console.log(`任务 ${task.title} 已过期`);
      } else {
        console.log(`任务 ${task.title} 距离结束还有 ${Math.ceil(timeDiff / 3600000)} 小时`);
      }
    });
  },

_truncateTitle(title, maxLength = 20) {
    if (title.length <= maxLength) return title;
    return title.substring(0, maxLength) + '...';
},


  // 显示任务即将结束弹窗 - 修改后
 showExpiringAlert(task) {
    console.log(`显示任务 ${task.title} 的即将结束弹窗`);
    // 截断标题到与屏幕显示一致的长度
    const truncatedTitle = this._truncateTitle(task.title);
    // 使用uTools系统通知
    utools.showNotification(`任务: ${truncatedTitle}即将到期\n截止时间: ${this.formatDateTime(new Date(task.endTime))}`);
},

  // 渲染任务分类
  renderTaskCategories() {
    const baseCategories = [
      { name: '无标签', count: this.getTaskCountByCategory('无标签') },
      { name: '星标', count: this.getTaskCountByCategory('星标') },
      { name: '今日截止', count: this.getTaskCountByCategory('今日截止') },
      { name: '已完成', count: this.getTaskCountByCategory('已完成') }
    ];

    // 从标签数组生成标签分类
    const tagCategories = this.tags.map(tag => ({
      name: tag.name,
      background_color: tag.background_color,
      dot_color:tag.dot_color,
      count: this.getTaskCountByCategory(tag.name)
    }));

    // 合并基础分类和标签分类
    const categories = [...baseCategories, ...tagCategories];

    const categoryList = document.getElementById('categoryList');
    categoryList.innerHTML = '';

    categories.forEach((category, index) => {
      const categoryItem = document.createElement('div');
      categoryItem.className = `category-item ${this.currentCategory === category.name ? 'active' : ''}`;
      categoryItem.dataset.category = category.name;
      // 存储颜色数据，供设置内容区域颜色使用
      if (category.background_color) {
        categoryItem.dataset.background_color = category.background_color;
      }

      // 使用标签颜色（如果有）
      const dotStyle = category.background_color ? 
        `class="category-dot" style="background-color:${category.background_color};"` :
        `class="category-dot" style="background-color:#f5e9c3;"`;

      categoryItem.innerHTML = `
        <span><span ${dotStyle}></span>${category.name}</span>
        <span class="task-count">${category.count}</span>
      `;
      categoryList.appendChild(categoryItem);

    });
    // 设置右侧内容区域颜色
    this.setContentAreaColor();
  },

  // 根据分类获取任务数量
  getTaskCountByCategory(category) {
    switch (category) {
      case '无标签':
        return this.tasks.filter(task => task.tags.length === 0).length;
      case '星标':
        return this.tasks.filter(task => task.priority === '高' || task.priority === '极高').length;
      case '今日截止':
        return this.tasks.filter(task => this.isToday(new Date(task.endTime))).length;
      case '已完成':
        return this.tasks.filter(task => task.status === '已完成').length;
      default:
        return this.tasks.filter(task => task.tags.includes(category)).length;
    }
  },

  // 判断日期是否为今天
  isToday(date) {
    if (!date) return false;
    const today = new Date();
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear();
  },

  // 修改setContentAreaColor函数
setContentAreaColor() {
  const contentArea = document.getElementById('taskContent');
  contentArea.className = 'task-content'; // 重置类名

  // 查找当前选中分类的颜色
  const activeCategory = document.querySelector('.category-item.active');

  if (activeCategory && activeCategory.dataset.background_color) {
    // 使用标签背景颜色
    contentArea.style.backgroundColor = activeCategory.dataset.background_color;
  } else {
    // 使用默认颜色
    contentArea.style.backgroundColor = '#f5e9c3';
  }
},

renderTask(task, isCompleted) {
const taskItem = document.createElement('div');
// 添加优先级样式类和completed类
const taskClass = isCompleted ? `task-item priority-${task.priority} completed` : `task-item priority-${task.priority}`;
taskItem.className = taskClass;
taskItem.dataset.id = task.id;

// 格式化日期显示
const createdAt = new Date(task.createdAt);
const formattedDate = this.formatDateTime(createdAt);

// 生成标签HTML
const tagsHTML = task.tags.length > 0 ? `
  <div class="task-tags">
    ${task.tags.map(tag => {
      // 查找标签颜色
      const tagInfo = this.tags.find(t => t.name === tag);
      const color = tagInfo ? tagInfo.color : 'gray';
      // 截断过长标签
      const displayTag = tag.length > 8 ? tag.substring(0, 8) + '...' : tag;
      return `<span class="tag" style="background-color: ${color}30; border-color: ${color};">${displayTag}</span>`;
    }).join('')}
  </div>
` : '';

// 生成时间范围HTML
const timeRangeHTML = task.startTime && task.endTime ? `
  <div class="task-duration">
    持续时间: ${this.formatDateTime(new Date(task.startTime))} - ${this.formatDateTime(new Date(task.endTime))}
  </div>
` : '';

// 设置任务HTML内容
taskItem.innerHTML = `
  <div class="task-checkbox">
    <input type="checkbox" ${isCompleted ? 'checked' : ''} data-id="${task.id}">
  </div>
  <div class="task-details">
    <h3 class="task-title">${task.title} <span class="priority-tag ${task.priority}">${task.priority}</span></h3>
    <div class="task-meta">
      <span class="task-status">${task.status}</span>
      <span class="task-priority">优先级: ${task.priority}</span>
      <span class="task-date">创建时间: ${formattedDate}</span>
    </div>
    ${task.notes ? `<div class="task-notes">备注: ${task.notes}</div>` : ''}
    ${tagsHTML}
    ${timeRangeHTML}
  </div>
  <div class="task-actions">
    <button class="edit-btn" data-id="${task.id}"></button>
    <button class="delete-btn" data-id="${task.id}"></button>
  </div>
`;

return taskItem;
},

  // 渲染任务列表
  // 渲染任务列表
renderTasks() {
const taskList = document.getElementById('taskList');
taskList.innerHTML = '';

const filteredTasks = this.getFilteredTasks();

// 添加任务状态自动更新逻辑
const now = new Date();
filteredTasks.forEach(task => {
  // 深拷贝任务对象避免直接修改原数组
  const updatedTask = {...task};
  
  // 检查条件：状态不是已完成，且存在结束时间，且当前时间已超过结束时间
  if (
    updatedTask.status !== '已完成' && 
    updatedTask.endTime && 
    now > new Date(updatedTask.endTime)
  ) {
    // 更新任务状态为已结束
    updatedTask.status = '已结束';
    utools.dbStorage.setItem(`tasks_${this.userId}_${updatedTask.id}`, updatedTask);
    task.status = '已结束';
  }
});


if (filteredTasks.length === 0) {
  taskList.innerHTML = '<div class="empty-state">该分类下暂无任务</div>';
  return;
}

// 分离未完成和已完成的任务
const unfinishedTasks = filteredTasks.filter(task => task.status !== '已完成');
const completedTasks = filteredTasks.filter(task => task.status === '已完成');

// 使用DocumentFragment优化DOM操作
const fragment = document.createDocumentFragment();

// 先渲染未完成的任务
unfinishedTasks.forEach(task => {
  fragment.appendChild(this.renderTask(task, false));
});

// 再渲染已完成的任务
completedTasks.forEach(task => {
  fragment.appendChild(this.renderTask(task, true));
});

// 一次性添加到DOM
taskList.appendChild(fragment);
},

  // 格式化日期
  formatDateTime(date) {
    return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`;
  },

  // 根据当前分类筛选任务
  getFilteredTasks() {
    switch (this.currentCategory) {
      case '无标签':
        return this.tasks.filter(task => task.tags.length === 0);
      case '星标':
        return this.tasks.filter(task => task.priority === '高' || task.priority === '极高');
      case '今日截止':
        return this.tasks.filter(task => this.isToday(new Date(task.endTime)));
      case '已完成':
        return this.tasks.filter(task => task.status === '已完成');
      default:
        return this.tasks.filter(task => task.tags.includes(this.currentCategory));
    }
  },

  // 绑定事件监听器
  bindEventListeners() {
    // 分类切换
    document.getElementById('categoryList').addEventListener('click', (e) => {
      const categoryItem = e.target.closest('.category-item');
      if (categoryItem) {
        this.currentCategory = categoryItem.dataset.category;
        this.renderTaskCategories();
        this.renderTasks();
      }
    });
    this.bindTagContextMenu();
    this.initTagsSelector();

    document.querySelectorAll('.priority-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
          // 移除所有按钮的active类
          document.querySelectorAll('.priority-btn').forEach(b => b.classList.remove('active'));
          // 为当前点击的按钮添加active类
          e.target.classList.add('active');
          // 更新隐藏输入框的值
          document.getElementById('taskPriority').value = e.target.dataset.priority;
      });
    });

    // 添加任务列表空白区域双击事件监听器
    document.getElementById('taskContent').addEventListener('dblclick', (e) => {
      // 确保点击的是taskContent区域或taskList区域，而不是其中的任务项、按钮或其他交互元素
      if (e.target.id === 'taskContent' || e.target.id === 'taskList') {
        this.showAddTaskModal();
      }
    });

    document.getElementById('importFile').addEventListener('change', () => {
      this.importTasks();
    });

    // 添加导出CSV按钮事件
    document.getElementById('exportCsvBtn').addEventListener('click', () => {
      this.exportTasks('csv');
    });

    // 添加导出JSON按钮事件
    document.getElementById('exportJsonBtn').addEventListener('click', () => {
      this.exportTasks('json');
    });

 // 添加取消按钮事件监听
    document.getElementById('cancelTaskBtn').addEventListener('click', () => {
        this.hideAddTaskModal();
    });

    window.addEventListener('click', (e) => {
        const modal = document.getElementById('taskModal');
        if (e.target === modal) {
            this.hideAddTaskModal();
        }
    });
    
    // 任务状态切换
    document.getElementById('taskList').addEventListener('change', (e) => {
      if (e.target.type === 'checkbox') {
        const taskId = e.target.dataset.id;
        this.updateTaskStatus(taskId, e.target.checked ? '已完成' : '未开始');
      }
    });

    document.getElementById('taskList').addEventListener('click', (e) => {
      if (e.target.classList.contains('delete-btn')) {
        const taskId = e.target.dataset.id;
        this.deleteTask(taskId);
      }
      else if (e.target.classList.contains('edit-btn')) {
        const taskId = e.target.dataset.id;
        this.editTask(taskId);
      }
    });

    // 添加新任务
    document.getElementById('addTaskBtn').addEventListener('click', () => {
      this.showAddTaskModal();
    });


     document.getElementById('todayTaskSummaryBtn').addEventListener('click', () => this.generateTodayTaskSummary());

    // 提交新任务
    document.getElementById('taskForm').addEventListener('submit', (e) => {
      e.preventDefault();
      if (this.currentEditingTaskId) {
        this.updateTask(this.currentEditingTaskId);
      } else {
        this.addNewTask();
      }
    });
  },

  bindTagModalEvents() {
    const addCategoryBtn = document.getElementById('addCategoryBtn');
    const tagModal = document.getElementById('tagModal');
    const cancelTagBtn = document.getElementById('cancelTagBtn');
    const tagForm = document.getElementById('tagForm');
    const colorOptions = document.querySelectorAll('.color-option');
    const selectedColorInput = document.getElementById('selectedColor');

    // 打开标签模态框
    addCategoryBtn.addEventListener('click', () => {
        tagModal.style.display = 'block';
        // 阻止背景滚动
        document.body.style.overflow = 'hidden';
        // 重置表单
        tagForm.reset();
        // 重置颜色选择
        colorOptions.forEach(option => option.classList.remove('selected'));
        colorOptions[0].classList.add('selected');
        selectedColorInput.value = colorOptions[0].dataset.color;
    });

    // 关闭标签模态框
    cancelTagBtn.addEventListener('click', () => {
        tagModal.style.display = 'none';
        // 恢复背景滚动
        document.body.style.overflow = 'auto';
    });


    // 点击模态框外部关闭
    window.addEventListener('click', (e) => {
        if (e.target === tagModal) {
            tagModal.style.display = 'none';
        }
    });

    // 颜色选择
    colorOptions.forEach(option => {
        option.style.backgroundColor = option.dataset.color;

        option.addEventListener('click', () => {
            colorOptions.forEach(opt => opt.classList.remove('selected'));
            option.classList.add('selected');
            selectedColorInput.value = option.dataset.color;
        });
    });

    // 提交标签表单
    tagForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const tagName = document.getElementById('tagName').value.trim();
        const tagColor = selectedColorInput.value;

        if (tagName) {
            this.addNewTag(tagName, tagColor);
            tagModal.style.display = 'none';
        }
    });
},

  bindTagContextMenu() {
    const categoryList = document.getElementById('categoryList');
    const contextMenu = document.getElementById('tagContextMenu');
    let selectedCategoryItem = null;

    // 右键点击事件
    categoryList.addEventListener('contextmenu', (e) => {
      const categoryItem = e.target.closest('.category-item');
      // 只对标签分类（非基础分类）显示右键菜单
      if (categoryItem && !['无标签', '星标', '今日截止', '已完成'].includes(categoryItem.dataset.category)) {
        e.preventDefault();
        selectedCategoryItem = categoryItem;

        // 显示右键菜单
        contextMenu.style.display = 'block';
        contextMenu.style.left = `${e.clientX}px`;
        contextMenu.style.top = `${e.clientY}px`;
      }
    });

    // 点击页面其他区域关闭右键菜单
    document.addEventListener('click', () => {
      contextMenu.style.display = 'none';
    });

    // 编辑标签
    document.getElementById('editTagItem').addEventListener('click', async () => {
      if (selectedCategoryItem) {
        const tagName = selectedCategoryItem.dataset.category;
        const tag = this.tags.find(t => t.name === tagName);
        if (tag) {
          // 打开标签模态框
          const tagModal = document.getElementById('tagModal');
          const tagNameInput = document.getElementById('tagName');
          const selectedColorInput = document.getElementById('selectedColor');
          const colorOptions = document.querySelectorAll('.color-option');

          tagModal.style.display = 'block';
          tagNameInput.value = tag.name;
          selectedColorInput.value = tag.background_color;

          // 选中对应的颜色选项
          colorOptions.forEach(option => {
            if (option.dataset.color === tag.background_color) {
              colorOptions.forEach(opt => opt.classList.remove('selected'));
              option.classList.add('selected');
            }
          });

          // 临时保存标签原始名称（用于更新）
          tagModal.dataset.originalTagName = tag.name;
        }
        contextMenu.style.display = 'none';
      }
    });

    // 删除标签
    document.getElementById('deleteTagItem').addEventListener('click', async () => {
      if (selectedCategoryItem) {
        const tagName = selectedCategoryItem.dataset.category;
        // 从标签数组中删除
        this.tags = this.tags.filter(tag => tag.name !== tagName);

        // 更新所有使用该标签的任务
        this.tasks.forEach(task => {
          task.tags = task.tags.filter(t => t !== tagName);
          if (task.tags.length === 0) {
            task.tags = [];
          }
        });

        // 保存到数据库
        await utools.dbStorage.setItem(`label_${this.userId}`, this.tags);
        
        await Promise.all(this.tasks.map(task => 
          utools.dbStorage.setItem(`tasks_${this.userId}_${task.id}`, task)
        ));

        // 更新UI
        this.renderTaskCategories();
        this.renderTasks();
        this.initTagsSelector();

        // 显示删除成功提示
        utools.showNotification('标签删除成功');

        contextMenu.style.display = 'none';
      }
    });
  },

// 修改 addNewTag 函数以支持编辑标签
  async addNewTag(tagName, tagColor) {
// 检查是否是编辑模式
const tagModal = document.getElementById('tagModal');
const originalTagName = tagModal.dataset.originalTagName;

if (originalTagName) {
  // 编辑现有标签
  const tagIndex = this.tags.findIndex(tag => tag.name === originalTagName);
  if (tagIndex !== -1) {
    // 更新标签
    this.tags[tagIndex] = {
      name: tagName,
      background_color: tagColor,
      dot_color: this.darkenColor(tagColor, 0.2)
    };

    // 更新所有使用该标签的任务
    const updatedTasks = [];
    this.tasks.forEach(task => {
      if (task.tags.includes(originalTagName)) {
        const updatedTask = {...task};
        updatedTask.tags = task.tags.map(t => t === originalTagName ? tagName : t);
        updatedTasks.push(updatedTask);
      }
    });

    // 保存到数据库
    await utools.dbStorage.setItem(`label_${this.userId}`, this.tags);
    
    // 批量更新任务
    for (const task of updatedTasks) {
      await utools.dbStorage.setItem(`tasks_${this.userId}_${task.id}`, task);
    }

    // 更新UI
    this.renderTaskCategories();
    this.renderTasks();
    this.initTagsSelector();

    // 显示编辑成功提示
    utools.showNotification('标签编辑成功');

    // 清除编辑模式标记
    delete tagModal.dataset.originalTagName;
  }
} else {
  // 检查标签是否已存在
  const tagExists = this.tags.some(tag => tag.name === tagName);
  if (tagExists) {
      utools.showNotification('标签已存在');
      return;
  }

  // 添加新标签
  const newTag = { name: tagName, background_color: tagColor, dot_color: this.darkenColor(tagColor, 0.2) };
  this.tags.push(newTag);

  // 保存到数据库
  utools.dbStorage.setItem(`label_${this.userId}`, this.tags);

  this.renderTaskCategories();
  this.renderTasks();
  this.initTagsSelector();

  // 显示添加成功提示
  utools.showNotification('标签添加成功');
}
},

// 生成今日任务总结
  async generateTodayTaskSummary() {
    try {
      // 显示加载提示
      utools.showNotification('正在生成今日任务总结...');
      
      // 获取今日任务
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      const todayTasks = this.tasks.filter(task => {
        const taskDate = new Date(task.startTime || task.endTime);
        return taskDate >= today && taskDate < tomorrow;
      });
      
      // 准备任务数据摘要
      const completedTasks = todayTasks.filter(task => task.status === '已完成');
      const incompleteTasks = todayTasks.filter(task => task.status !== '已完成');
      
      // 准备AI提示信息
      const messages = [
        {
          role: "system",
          content: "你是一个任务管理助手，需要对用户今日的任务完成情况进行总结。好的地方要赞赏，不好的地方也要指出来，并给出改进建议。"
        },
        {
          role: "user",
          content: `今日任务总数: ${todayTasks.length}\n完成任务数: ${completedTasks.length}\n未完成任务数: ${incompleteTasks.length}\n\n完成的任务:\n${completedTasks.map(task => `- ${task.title} (优先级: ${task.priority})`).join('\n')}\n\n未完成的任务:\n${incompleteTasks.map(task => `- ${task.title} (优先级: ${task.priority}, 状态: ${task.status})`).join('\n')}`
        }
      ];
      
      // 调用utools.ai生成总结
      const result = await utools.ai({ messages });
      
      // 显示总结结果（使用自定义警告框）
      showCustomAlert(result.content, 'left');
    } catch (error) {
      console.error('生成今日任务总结失败:', error);
      // 显示错误信息（使用自定义警告框）
      showCustomAlert('生成今日任务总结失败: ' + error.message);
    }
  },
  // 删除任务
  async deleteTask(taskId) {
    this.tasks = this.tasks.filter(task => task.id !== taskId);
    utools.dbStorage.removeItem(`tasks_${this.userId}_${taskId}`);
    this.renderTaskCategories();
    this.renderTasks();
  },

  // 显示添加任务模态框
  showAddTaskModal() {
    document.getElementById('taskModal').style.display = 'block';
    
    this.initTagsSelector();

    // 只有在非编辑模式下才设置默认时间
    if (!this.currentEditingTaskId) {
        // 设置开始时间默认值为当前时间
        const now = new Date();
        document.getElementById('createdTimeDisplay').textContent = '创建于 ' + this.formatDateTime(now);
        // 手动格式化本地时间为YYYY-MM-DDTHH:MM格式
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        
        const formattedNow = `${year}-${month}-${day}T${hours}:${minutes}`;
        document.getElementById('taskStartTime').value = formattedNow;
      
        // 修改：设置结束时间默认值为1天后
        const tomorrow = new Date(now);
        tomorrow.setDate(now.getDate() + 1);
        
        const tomorrowYear = tomorrow.getFullYear();
        const tomorrowMonth = String(tomorrow.getMonth() + 1).padStart(2, '0');
        const tomorrowDay = String(tomorrow.getDate()).padStart(2, '0');
        const tomorrowHours = String(tomorrow.getHours()).padStart(2, '0');
        const tomorrowMinutes = String(tomorrow.getMinutes()).padStart(2, '0');
        
        const formattedTomorrow = `${tomorrowYear}-${tomorrowMonth}-${tomorrowDay}T${tomorrowHours}:${tomorrowMinutes}`;
        document.getElementById('taskEndTime').value = formattedTomorrow;
    }
},

  // 隐藏添加任务模态框
  hideAddTaskModal() {
    document.getElementById('taskModal').style.display = 'none';
    document.getElementById('taskForm').reset();
    this.currentEditingTaskId = null; // 重置编辑状态
  },

  // 添加新任务
  async addNewTask() {
    try {
      // 先获取元素并检查是否存在
      const titleElement = document.getElementById('taskTitle');
      const startTimeElement = document.getElementById('taskStartTime');
      const endTimeElement = document.getElementById('taskEndTime');
      const selectedTags = Array.from(document.querySelectorAll('.selected-tag')).map(tag => tag.dataset.tag);
      const priorityElement = document.getElementById('taskPriority');
      const notesElement = document.getElementById('taskNotes');

      // 获取元素值
      const title = titleElement.value;
      const startTime = startTimeElement.value;
      const endTime = endTimeElement.value;
      const tags = selectedTags;
      const priority = priorityElement.value;
      const notes = notesElement.value;

      // 检查标签数量
     if (tags.length > 3) {
    // 替换alert调用
          showCustomAlert('最多只能选择3个标签');
          return;
      }

      const newTask = {
        id: this.generateUUID(),
        user_id: this.userId,
        title: title,
        status: '未开始',
        startTime: startTime,
        endTime: endTime ? endTime : null,
        tags: tags,
        priority: priority || '中',
        notes: notes,
        createdAt: new Date().toISOString()
      };

      // 保存任务
      //utools.dbStorage.setItem(`tasks_${newTask.id}`, JSON.stringify(tasks));
      utools.dbStorage.setItem(`tasks_${newTask.user_id}_${newTask.id}`, newTask);
      // 添加字段映射
      this.tasks.push(newTask);
      this.hideAddTaskModal();
      this.renderTaskCategories();
      this.renderTasks();
    } catch (error) {
      showCustomAlert('保存任务失败: ' + error.message);
    }
  },
  // 添加编辑任务方法
editTask(taskId) {
    const task = this.tasks.find(t => t.id === taskId);
    if (task) {
      this.currentEditingTaskId = taskId;
      document.getElementById('taskTitle').value = task.title;
      // 设置优先级
      document.querySelectorAll('.priority-btn').forEach(btn => {
        if (btn.dataset.priority === task.priority) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
      document.getElementById('taskPriority').value = task.priority;
      // 设置标签
      
      // 设置时间
      document.getElementById('taskStartTime').value = task.startTime ? new Date(task.startTime).toISOString().slice(0, 16) : '';
      document.getElementById('taskEndTime').value = task.endTime ? new Date(task.endTime).toISOString().slice(0, 16) : '';
      document.getElementById('taskNotes').value = task.notes || '';

      const createdAt = new Date(task.createdAt);
      document.getElementById('createdTimeDisplay').textContent = '创建于 ' + this.formatDateTime(createdAt);
      document.querySelector('.created-time-group').style.display = 'flex';

      this.showAddTaskModal();
      this.setSelectedTags(task.tags);
    }
  },

  // 更新任务方法
async updateTask(taskId) {
    const oldTask = utools.dbStorage.getItem(`tasks_${this.userId}_${taskId}`);
    const title = document.getElementById('taskTitle').value;
    const priority = document.getElementById('taskPriority').value;
    const notes = document.getElementById('taskNotes').value;
    const startTime = document.getElementById('taskStartTime').value;
    const endTime = document.getElementById('taskEndTime').value;
    const tags = Array.from(document.querySelectorAll('.selected-tag')).map(tag => tag.dataset.tag);
    const id = taskId;
    const user_id =  this.userId;
    const status = oldTask.status;
    const createdAt = oldTask.createdAt;
    if (!title) {
        showCustomAlert('请输入任务标题');
        return;
    }

    if (tags.length > 3) {
        showCustomAlert('最多只能选择3个标签');
        return;
    }

    const updatedTask = {
        id,
        user_id,
        title,
        status,
        startTime: startTime ? startTime : null,
        endTime: endTime ? endTime : null,
        tags,
        priority,
        notes,
        createdAt
    };
    utools.dbStorage.setItem(`tasks_${this.userId}_${taskId}`, updatedTask);
          // 更新本地缓存
      const localIndex = this.tasks.findIndex(t => t.id === taskId);
        if (localIndex !== -1) {
           this.tasks[localIndex] = updatedTask;
          // 更新任务状态
          this.autoUpdateTaskStatuses();
                this.hideAddTaskModal();
                this.renderTaskCategories();
                this.renderTasks();
       }
    },

exportTasks(format) {
    const filteredTasks = this.tasks;

    if (filteredTasks.length === 0) {
      showCustomAlert('当前没有任务可导出');
      return;
    }

    // 准备导出数据
    const exportData = filteredTasks.map(task => ({
      标题: task.title,
      状态: task.status,
      优先级: task.priority,
      创建时间: this.formatDateTime(new Date(task.createdAt)),
      开始时间: task.startTime ? this.formatDateTime(new Date(task.startTime)) : '',
      截止时间: task.endTime ? this.formatDateTime(new Date(task.endTime)) : '',
      标签: task.tags.join(','),
      备注: task.notes || ''
    }));

    // 生成导出内容和默认文件名
    let content = '';
let defaultFilename = `tasks_${new Date().toISOString().slice(0, 10)}`;
let contentType = ''; // 修复了拼写错误

if (format === 'csv') {
      // 改进CSV生成逻辑
      const headers = Object.keys(exportData[0]);
      // 处理每个字段，确保包含逗号或引号的字段被引号括起来
      const formatField = (field) => {
        if (typeof field !== 'string') field = String(field);
        if (field.includes(',') || field.includes('"') || field.includes('\n')) {
          // 转义双引号并添加引号
          return `"${field.replace(/"/g, '""')}"`;
        }
        return field;
      };

      // 格式化表头
      const formattedHeaders = headers.map(formatField).join(',');
      // 格式化每行数据
      const formattedRows = exportData.map(obj => {
        return Object.values(obj).map(formatField).join(',');
      }).join('\n');

      content = `${formattedHeaders}\n${formattedRows}`;
      defaultFilename += '.csv';
      contentType = 'text/csv';
    } else if (format === 'json') {
      content = JSON.stringify(exportData, null, 2);
      defaultFilename += '.json';
      contentType = 'application/json';
    }

    // 显示保存文件对话框
    path = utools.showSaveDialog({
      title: '保存任务导出文件',
      defaultPath: defaultFilename,
      filters: [{
        name: format === 'csv' ? 'CSV文件' : 'JSON文件',
        extensions: [format]
      }]
    });
    console.log(path);
    if (path) {
        // 用户点击了确定按钮，写入文件
        try {
          window.services.writeFile(path, content);
          showCustomAlert(`导出成功，文件已保存至：${path}`);
        } catch (error) {
          showCustomAlert(`导出失败: ${error.message}`);
        }}
       else {
        // 用户点击了取消按钮
        console.log('用户取消了导出操作');
      }
  },

  
   displayUsername(userName, avatarUrl) {
    if (userName) {
      const usernameDisplay = document.getElementById('usernameDisplay');
      if (avatarUrl) {
        // 如果有头像地址，显示头像和用户名
        usernameDisplay.innerHTML = `
          <div style="display: flex; align-items: center;">
            <img src="${avatarUrl}" alt="用户头像" style="width: 24px; height: 24px; border-radius: 50%; margin-right: 8px;">
            <span>${userName}</span>
          </div>
        `;
      } else {
        // 如果没有头像地址，只显示用户名
        usernameDisplay.textContent = `欢迎, ${userName}`;
      }
    }
  },
  importTasks() {
    const fileInput = document.getElementById('importFile');
    if (!fileInput.files || fileInput.files.length === 0) {
      showCustomAlert('请选择要导入的文件');
      return;
    }

    const file = fileInput.files[0];
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        let tasks;
        if (file.name.endsWith('.csv')) {
          tasks = this.parseCsvData(e.target.result);
        } else if (file.name.endsWith('.json')) {
          tasks = JSON.parse(e.target.result);
        } else {
          showCustomAlert('不支持的文件格式，请选择CSV或JSON文件');
          return;
        }

        if (tasks.length === 0) {
          showCustomAlert('没有找到可导入的任务');
          return;
        }

        // 导入任务到系统
        const successCount = await this.importTasksToSystem(tasks);
        showCustomAlert(`成功导入 ${successCount} 个任务`);

        // 重新加载任务
        await this.loadTasks();
        this.renderTaskCategories();
        this.renderTasks();

        // 重置文件输入
        fileInput.value = '';
      } catch (error) {
        showCustomAlert('导入任务失败: ' + error.message);
      }
    };

    reader.readAsText(file);
  },

  // 解析CSV数据
  parseCsvData(csvData) {
    const lines = csvData.split('\n');
    if (lines.length < 2) {
      return [];
    }

    const headers = this.parseCsvLine(lines[0]);
    const tasks = [];

    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;

      const values = this.parseCsvLine(lines[i]);
      const task = {};

      for (let j = 0; j < headers.length; j++) {
        task[headers[j]] = values[j] || '';
      }

      tasks.push(task);
    }

    return tasks;
  },

  // 辅助方法：正确解析CSV行，处理带引号的字段
  parseCsvLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = '"';

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      // 处理引号
      if (char === quoteChar) {
        if (inQuotes && i + 1 < line.length && line[i + 1] === quoteChar) {
          // 处理双引号转义
          current += quoteChar;
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        // 字段分隔符
        result.push(current);
        current = '';
      } else {
        // 普通字符
        current += char;
      }
    }

    // 添加最后一个字段
    result.push(current);

    return result;
  },

  // 导入任务到系统
  async importTasksToSystem(tasks) {
    let successCount = 0;
    for (const task of tasks) {
        // 转换任务数据格式
        const formattedTask = {
          id: this.generateUUID(), // 生成唯一ID
          userId: this.userId, // 添加用户ID
          title: task.标题,
          status: task.状态,
          priority: task.优先级,
          startTime: task.开始时间 ? new Date(task.开始时间).toISOString() : null,
          endTime: task.截止时间 ? new Date(task.截止时间).toISOString() : null,
          tags: task.标签 ? task.标签.split(',') : [],
          notes: task.备注,
          createdAt: task.创建时间
        };
        utools.dbStorage.setItem(`tasks_${this.userId}_${formattedTask.id}`,formattedTask);
        successCount++;
      }

    return successCount;
  },

  generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0,
              v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
},
darkenColor(hexColor, factor = 0.2) {
  // 移除 # 号（如果存在）
  hexColor = hexColor.replace('#', '');

  // 将十六进制转换为 RGB
  let r = parseInt(hexColor.substring(0, 2), 16);
  let g = parseInt(hexColor.substring(2, 4), 16);
  let b = parseInt(hexColor.substring(4, 6), 16);

  // 降低 RGB 值（变暗）
  r = Math.floor(r * (1 - factor));
  g = Math.floor(g * (1 - factor));
  b = Math.floor(b * (1 - factor));

  // 确保值在 0-255 范围内
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));

  // 将 RGB 转换回十六进制
  const toHex = (c) => {
    const hex = c.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };

  return '#' + toHex(r) + toHex(g) + toHex(b);
}

};

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
  TaskManager.init();
});
function showCustomAlert(message, alignment = 'center') {
    const alertElement = document.getElementById('customAlert');
    const messageElement = document.getElementById('alertMessage');
    const confirmBtn = document.getElementById('confirmAlertBtn');

    // 修复markdown解析 - 标题替换问题
    const htmlContent = message
        .replace(/(#{1,6})\s+([^\n]+)/g, function(match, p1, p2) {
            const level = p1.length; // 获取#的数量
            return `<h${level}>${p2}</h${level}>`;
        }) // 标题
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // 粗体
        .replace(/\*(.*?)\*/g, '<em>$1</em>') // 斜体
        .replace(/`(.*?)`/g, '<code>$1</code>') // 代码
        .replace(/^-\s+(.*)/gm, '<ul><li>$1</li></ul>') // 无序列表
        .replace(/^\d+\.\s+(.*)/gm, '<ol><li>$1</li></ol>') // 有序列表
        .replace(/\n/g, '<br>'); // 换行

    // 设置警告消息
    messageElement.innerHTML = htmlContent;

    // 设置文本对齐方式
    messageElement.style.textAlign = alignment;

    // 显示警告
    alertElement.style.display = 'flex';

    // 确认按钮点击事件
    confirmBtn.onclick = function() {
        alertElement.style.display = 'none';
    };

    // 点击警告外部关闭
    alertElement.onclick = function(event) {
        if (event.target === alertElement) {
            alertElement.style.display = 'none';
        }
    };
}