// 简易桌位布局设计器逻辑（原生 JS）
(() => {
  const totalTablesInput = document.getElementById('totalTables');
  const seatsPerTableInput = document.getElementById('seatsPerTable');
  const rowPatternInput = document.getElementById('rowPattern');
  const generateBtn = document.getElementById('generateBtn');
  const peopleInput = document.getElementById('peopleInput');
  const importBtn = document.getElementById('importBtn');
  const clearPeopleBtn = document.getElementById('clearPeople');
  const peopleList = document.getElementById('peopleList');
  const inner = document.getElementById('inner');
  const canvas = document.getElementById('canvas');
  const zoomRange = document.getElementById('zoomRange');
  const resetView = document.getElementById('resetView');
  const assignedList = document.getElementById('assignedList');
  const contextMenu = document.getElementById('contextMenu');

  const configSelect = document.getElementById('configSelect');
  const saveConfigBtn = document.getElementById('saveConfigBtn');
  const deleteConfigBtn = document.getElementById('deleteConfigBtn');

  let people = []; // {id,name}
  let assigned = {}; // seatId -> personId
  let currentTables = [];
  let autoSaveTimer = null;

  // Utilities
  function uid(prefix = ''){return prefix + Math.random().toString(36).slice(2,9)}

  // Auto-save to localStorage with debounce
  function scheduleAutoSave(){
    if(autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(()=>{
      saveToLocalStorage('__autosave__');
    }, 1000); // save 1 second after last change
  }

  function saveToLocalStorage(key){
    try{
      const data = {
        people,
        assigned,
        tables: currentTables,
        view: { pan, scale },
        timestamp: Date.now()
      };
      localStorage.setItem('seating_' + key, JSON.stringify(data));
    }catch(e){
      console.error('Failed to save to localStorage:', e);
    }
  }

  function loadFromLocalStorage(key){
    try{
      const data = localStorage.getItem('seating_' + key);
      if(!data) return null;
      return JSON.parse(data);
    }catch(e){
      console.error('Failed to load from localStorage:', e);
      return null;
    }
  }

  function getAllConfigs(){
    const configs = [];
    for(let i=0; i<localStorage.length; i++){
      const key = localStorage.key(i);
      if(key && key.startsWith('seating_') && key !== 'seating___autosave__'){
        const name = key.replace('seating_', '');
        const data = loadFromLocalStorage(name);
        if(data){
          configs.push({ name, timestamp: data.timestamp || 0 });
        }
      }
    }
    return configs.sort((a,b) => b.timestamp - a.timestamp);
  }

  function updateConfigSelect(){
    const configs = getAllConfigs();
    const currentValue = configSelect.value;
    configSelect.innerHTML = '<option value="">选择配置...</option>';
    configs.forEach(cfg => {
      const opt = document.createElement('option');
      opt.value = cfg.name;
      const date = new Date(cfg.timestamp);
      opt.textContent = `${cfg.name} (${date.toLocaleString('zh-CN')})`;
      configSelect.appendChild(opt);
    });
    if(currentValue && configs.find(c => c.name === currentValue)){
      configSelect.value = currentValue;
    }
  }

  function applyConfig(data){
    if(!data) return;
    people = Array.isArray(data.people) ? data.people : [];
    assigned = data.assigned && typeof data.assigned === 'object' ? data.assigned : {};
    currentTables = Array.isArray(data.tables) ? data.tables : [];
    if(data.view){ pan = data.view.pan || {x:0,y:0}; scale = data.view.scale || 1; }
    renderPeopleList();
    renderCanvas(currentTables);
    zoomRange.value = String(scale);
    applyTransform();
    renderAssignedPanel();
  }

  // 存储搜索关键字
  let unassignedSearchTerm = '';
  let assignedSearchTerm = '';

  function renderPeopleList(){
    peopleList.innerHTML = '';
    // only show people who are not currently assigned
    const assignedIds = new Set(Object.values(assigned));
    let unassigned = people.filter(p => !assignedIds.has(p.id));
    
    // 应用搜索过滤
    if(unassignedSearchTerm) {
      unassigned = unassigned.filter(p => p.name.toLowerCase().includes(unassignedSearchTerm.toLowerCase()));
    }
    
    unassigned.forEach(p => {
      const div = document.createElement('div');
      div.className = 'person';
      div.draggable = true;
      div.dataset.id = p.id;
      div.textContent = p.name;
      div.addEventListener('dragstart', (e)=>{
        e.dataTransfer.setData('text/plain', p.id);
        div.classList.add('dragging');
      });
      div.addEventListener('dragend', ()=>div.classList.remove('dragging'));
      peopleList.appendChild(div);
    });
    
    // 如果没有匹配项，显示提示信息
    if(unassignedSearchTerm && unassigned.length === 0) {
      const noResults = document.createElement('div');
      noResults.textContent = '没有找到匹配的人员';
      noResults.style.padding = '10px';
      noResults.style.color = '#999';
      noResults.style.textAlign = 'center';
      noResults.style.fontStyle = 'italic';
      peopleList.appendChild(noResults);
    }
    
    renderAssignedPanel();
  }

  function renderAssignedPanel(){
    assignedList.innerHTML = '';
    let assignedEntries = Object.entries(assigned);
    
    // 应用搜索过滤
    if(assignedSearchTerm) {
      assignedEntries = assignedEntries.filter(([seatId, pid]) => {
        const p = people.find(pp => pp.id === pid);
        return p && (p.name.toLowerCase().includes(assignedSearchTerm.toLowerCase()) || 
                    seatId.toLowerCase().includes(assignedSearchTerm.toLowerCase()));
      });
    }
    
    assignedEntries.forEach(([seatId, pid])=>{
      const p = people.find(pp=>pp.id===pid);
      if(!p) return;
      const el = document.createElement('div');
      el.className = 'assignedItem';
      const left = document.createElement('div');
      left.textContent = `${p.name} → ${seatId}`;
      left.style.cursor = 'pointer';
      left.title = '点击定位到此座位';
      left.addEventListener('click', ()=>{
        const seatEl = inner.querySelector(`[data-seat-id='${seatId}']`);
        if(seatEl) focusOnSeat(seatEl);
      });
      const btn = document.createElement('button'); btn.className = 'btn-unassign'; btn.textContent = '取消';
      btn.title = '取消分配';
      btn.addEventListener('click', ()=>{
        const p = people.find(pp => pp.id === pid);
        if(p && confirm(`确定要取消 ${p.name} 在 ${seatId} 的分配吗？`)) {
          delete assigned[seatId];
          const seatEl = inner.querySelector(`[data-seat-id='${seatId}']`);
          if(seatEl) clearSeatVisual(seatEl);
          renderAssignedPanel();
          renderPeopleList();
          updateTableOccupancy(seatId);
          scheduleAutoSave();
          showMessage.success(`${p.name} 在 ${seatId} 的分配已取消！`);
        }
      });
      el.appendChild(left);
      el.appendChild(btn);
      assignedList.appendChild(el);
    })
    
    // 如果没有匹配项，显示提示信息
    if(assignedSearchTerm && assignedEntries.length === 0) {
      const noResults = document.createElement('div');
      noResults.textContent = '没有找到匹配的已分配人员';
      noResults.style.padding = '10px';
      noResults.style.color = '#999';
      noResults.style.textAlign = 'center';
      noResults.style.fontStyle = 'italic';
      assignedList.appendChild(noResults);
    }
  }

  // Helper function to handle duplicate names
  function getUniqueName(name) {
    // Check if the name already exists in the current people list
    let uniqueName = name;
    let counter = 1;
    
    // Check if name already has a pattern like "(number)" and extract the base name
    const match = name.match(/^(.*?)\((\d+)\)$/);
    let baseName = name;
    if (match) {
      baseName = match[1].trim();
    }
    
    // Keep incrementing the counter until we find a unique name
    let testName = uniqueName;
    while (people.some(p => p.name === testName)) {
      testName = `${baseName}(${counter})`;
      counter++;
    }
    
    return testName;
  }

  // parse people input (newline or comma separated)
  function importPeople(){
    const raw = peopleInput.value.trim();
    if(!raw) {
      showMessage.warning('请输入姓名列表');
      return;
    }
    const lines = raw.split(/\r?\n|,/).map(s=>s.trim()).filter(Boolean);
    const originalCount = people.length;
    lines.forEach(name=>{
      const uniqueName = getUniqueName(name);
      people.push({id: uid('p_'), name: uniqueName});
    })
    renderPeopleList();
    peopleInput.value = '';
    scheduleAutoSave();
    
    const importedCount = people.length - originalCount;
    if(importedCount > 0) {
      showMessage.success(`成功导入 ${importedCount} 个姓名！`);
    } else {
      showMessage.info('没有导入任何新姓名');
    }
  }

  // Import people from CSV or TXT file
  function importPeopleFromFile(file) {
    const reader = new FileReader();
    
    reader.onload = function(e) {
      const content = e.target.result;
      let names = [];
      
      // For CSV files, we need to handle potential CSV parsing
      if (file.name.toLowerCase().endsWith('.csv')) {
        // Simple CSV parsing - could be enhanced for more complex CSV
        const lines = content.split(/\r?\n/).filter(line => line.trim() !== '');
        lines.forEach(line => {
          // Handle basic CSV parsing (comma-separated values)
          // This is a simplified version - could be enhanced for quoted values containing commas
          const values = line.split(',').map(val => val.trim()).filter(val => val !== '');
          names = names.concat(values);
        });
      } else {
        // For TXT files, treat each line as a name
        names = content.split(/\r?\n/).map(name => name.trim()).filter(name => name !== '');
      }
      
      // Add unique, non-empty names to the people array with duplicate handling
      let importedCount = 0;
      names.forEach(name => {
        if (name) {
          const uniqueName = getUniqueName(name);
          people.push({id: uid('p_'), name: uniqueName});
          importedCount++;
        }
      });
      
      renderPeopleList();
      scheduleAutoSave();
      
      // Show how many names were imported
      showMessage.success(`成功导入 ${importedCount} 个姓名！`);
    };
    
    reader.onerror = function() {
      showMessage.error('文件读取失败！');
    };
    
    reader.readAsText(file);
  }

  // Event listener for file input
  const importFileBtn = document.getElementById('importFileBtn');
  const importFileInput = document.getElementById('importFile');
  
  importFileBtn.addEventListener('click', function() {
    importFileInput.click();
  });
  
  importFileInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
      if (file.type === 'text/csv' || file.type === 'text/plain' || file.name.toLowerCase().endsWith('.csv') || file.name.toLowerCase().endsWith('.txt')) {
        importPeopleFromFile(file);
      } else {
        alert('请上传 CSV 或 TXT 文件！');
      }
    }
    // Clear the input so the same file can be selected again
    e.target.value = '';
  });

  // 获取搜索框元素
  const unassignedSearchInput = document.getElementById('unassignedSearch');
  const assignedSearchInput = document.getElementById('assignedSearch');
  
  // 添加搜索事件监听器
  unassignedSearchInput.addEventListener('input', (e) => {
    unassignedSearchTerm = e.target.value.trim();
    renderPeopleList(); // 重新渲染未分配列表
  });
  
  assignedSearchInput.addEventListener('input', (e) => {
    assignedSearchTerm = e.target.value.trim();
    renderAssignedPanel(); // 重新渲染已分配面板
  });

  importBtn.addEventListener('click', importPeople);
  clearPeopleBtn.addEventListener('click', ()=>{
    if(people.length === 0) {
      showMessage.info('当前没有人员可清空');
      return;
    }
    if(!confirm('确定要清空所有人员和分配信息吗？此操作不可恢复。')) {
      return; // 用户取消操作
    }
    people = [];
    assigned = {};
    renderPeopleList();
    renderCanvas([]);
    scheduleAutoSave();
    showMessage.success('人员列表已清空！');
  })

  // Config management
  saveConfigBtn.addEventListener('click', ()=>{
    const currentConfig = configSelect.value;
    if(!currentConfig || !currentConfig.trim()) {
      // 如果没有选择配置，提示用户先选择或使用另存为
      showMessage.warning('请先选择一个现有配置，或使用"另存为"创建新配置');
      return;
    }
    saveToLocalStorage(currentConfig);
    updateConfigSelect();
    configSelect.value = currentConfig;
    showMessage.success(`配置 "${currentConfig}" 已保存！`);
  });
  
  // 另存为功能
  const saveAsConfigBtn = document.getElementById('saveAsConfigBtn');
  saveAsConfigBtn.addEventListener('click', ()=>{
    const name = prompt('请输入新配置名称:');
    if(!name || !name.trim()) return;
    const cleanName = name.trim();
    if(getAllConfigs().some(cfg => cfg.name === cleanName)) {
      if(!confirm(`配置 "${cleanName}" 已存在，是否覆盖？`)) {
        return;
      }
    }
    saveToLocalStorage(cleanName);
    updateConfigSelect();
    configSelect.value = cleanName;
    showMessage.success('配置已保存！');
  });

  configSelect.addEventListener('change', ()=>{
    const name = configSelect.value;
    if(!name) return;
    const data = loadFromLocalStorage(name);
    if(data){
      applyConfig(data);
    }
  });

  deleteConfigBtn.addEventListener('click', ()=>{
    const name = configSelect.value;
    if(!name){
      showMessage.warning('请先选择一个配置');
      return;
    }
    if(confirm(`确定要删除配置"${name}"吗？`)){
      localStorage.removeItem('seating_' + name);
      updateConfigSelect();
      showMessage.success('配置已删除');
    }
  });

  // Layout generation
  function parsePattern(pattern){
    return pattern.split(',').map(s=>parseInt(s.trim(),10)).filter(n=>!isNaN(n) && n>0);
  }

  function buildRows(total, patternArr){
    const rows = [];
    let remaining = total;
    let i = 0;
    while(remaining>0){
      const v = patternArr[i % patternArr.length] || patternArr[patternArr.length-1] || 1;
      const take = Math.min(v, remaining);
      rows.push(take);
      remaining -= take;
      i++;
    }
    return rows;
  }

  function renderCanvas(tables){
    inner.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'canvasGrid';
    tables.forEach((row, rowIndex)=>{
      const rowEl = document.createElement('div');
      rowEl.className = 'row';
      for(let i=0;i<row.count;i++){
        const table = document.createElement('div');
        table.className = 'table';
        const tableId = row.startId + i;
        table.dataset.tableId = 'T' + tableId;
        // compute occupancy to show in title
        const seatsPerTable = row.seatsPerTable || 1;
        let occ = 0;
        for(const s of Object.keys(assigned)){
          if(s.startsWith('T'+tableId+'-')) occ++;
        }
        const title = document.createElement('div'); title.className = 'title'; title.textContent = `桌 ${tableId} (${occ}/${seatsPerTable})`;
        table.appendChild(title);
        const seatsWrap = document.createElement('div'); seatsWrap.className = 'seats';
        // adapt layout: calculate visual size based on seats count
        const seatsCount = row.seatsPerTable || 1;
        // choose columns up to 3 for compact layout (since seats are wider now: 6rem = 96px)
        const cols = Math.min(seatsCount, 3);
        const seatWidth = 96, seatHeight = 48, gap = 6; // 6rem = 96px, 3rem = 48px
        const tableWidth = Math.max(160, cols * (seatWidth + gap) + 40);
        const rowsNeeded = Math.ceil(seatsCount / cols);
        const tableHeight = 32 + rowsNeeded * (seatHeight + gap) + 40; // title height + seats + padding
        table.style.width = tableWidth + 'px';
        table.style.height = tableHeight + 'px';

        for(let s=0;s<seatsCount;s++){
          const seat = document.createElement('div');
          seat.className = 'seat';
          const seatId = `T${tableId}-S${s+1}`;
          seat.dataset.seatId = seatId;
          // show "编号. 名字" if occupied, otherwise show seat number
          const pid = assigned[seatId];
          const seatNumberLabel = String(s+1);
          if(pid){
            const p = people.find(pp=>pp.id===pid);
            seat.classList.add('occupied');
            seat.textContent = p ? `${seatNumberLabel}. ${p.name}` : `${seatNumberLabel}`;
          } else {
            seat.textContent = seatNumberLabel;
          }
          // drag over & drop
          seat.addEventListener('dragover', (e)=>{e.preventDefault(); seat.classList.add('over')});
          seat.addEventListener('dragleave', ()=>seat.classList.remove('over'));
          seat.addEventListener('drop', (e)=>{
            e.preventDefault(); seat.classList.remove('over');
            const pid = e.dataTransfer.getData('text/plain');
            if(!pid) return;
            assignPersonToSeat(pid, seatId, seat);
          })
          // custom right click on seat
          seat.addEventListener('contextmenu', (e)=>{
            e.preventDefault();
            e.stopPropagation(); // 阻止事件冒泡到桌子
            // show custom menu at page coords
            if(contextMenu) showContextMenu(e.pageX, e.pageY, seat);
          });
          seatsWrap.appendChild(seat);
        }
        table.appendChild(seatsWrap);
        // Add right-click context menu for tables (only when clicking on the table, not on seats)
        table.addEventListener('contextmenu', (e) => {
          // Check if the target is the table itself, not a seat inside it
          if (e.target === table || e.target === title) {
            e.preventDefault();
            showTableContextMenu(e.pageX, e.pageY, table);
          }
        });
        rowEl.appendChild(table);
      }
      grid.appendChild(rowEl);
    })
    inner.appendChild(grid);
    // apply current assignment state to seats
    for(const [seatId, pid] of Object.entries(assigned)){
      const seat = inner.querySelector(`[data-seat-id='${seatId}']`);
      if(seat){
        const p = people.find(pp=>pp.id===pid);
        if(p) renderOccupant(seat, p);
      }
    }
  }

  function assignPersonToSeat(pid, seatId, seatEl){
    // avoid duplicate assignment: if person already assigned to other seat, free it
    for(const [s, p] of Object.entries(assigned)){
      if(p===pid){
        delete assigned[s];
        const oldSeat = inner.querySelector(`[data-seat-id='${s}']`);
        if(oldSeat) clearSeatVisual(oldSeat);
      }
    }
    // if seat occupied, move existing person back to list
    if(assigned[seatId]){
      // swap back
      const prev = assigned[seatId];
      delete assigned[seatId];
    }
    assigned[seatId] = pid;
    renderSeatAssignment(seatEl, pid, seatId);
    renderAssignedPanel();
    renderPeopleList();
    // update table occupancy count
    updateTableOccupancy(seatId);
    scheduleAutoSave();
  }

  function renderSeatAssignment(seatEl, pid, seatId){
    const p = people.find(pp=>pp.id===pid);
    if(!p) return;
    
    // Update visual state without cloning (to preserve contextmenu listener)
    seatEl.classList.add('occupied');
    // show "编号. 名字"
    const m = /-S(\d+)$/.exec(seatId);
    const num = m ? m[1] : '';
    seatEl.textContent = num ? `${num}. ${p.name}` : p.name;
    
    // make occupant draggable back to people list
    seatEl.draggable = true;
    
    // Remove old listeners by storing flag
    if(!seatEl._listenersAttached){
      seatEl.addEventListener('dragstart', seatDragStart);
      seatEl._listenersAttached = true;
    }
    
    // allow double-click to remove
    seatEl.title = '双击可移除该座位人员，右键查看更多操作';
    seatEl.ondblclick = ()=>{
      const p = people.find(pp => pp.id === pid);
      if(p && confirm(`确定要取消 ${p.name} 在 ${seatId} 的分配吗？`)) {
        delete assigned[seatId];
        clearSeatVisual(seatEl);
        renderAssignedPanel();
        renderPeopleList();
        // update table occupancy
        updateTableOccupancy(seatId);
        scheduleAutoSave();
        showMessage.success(`${p.name} 在 ${seatId} 的分配已取消！`);
      }
    };
  }

  // helper to render occupant (used when rebuilding canvas)
  function renderOccupant(seatEl, person){
    if(!seatEl || !person) return;
    const seatId = seatEl.dataset.seatId;
    if(!seatId) return;
    // reuse renderSeatAssignment to attach listeners and visuals
    renderSeatAssignment(seatEl, person.id, seatId);
  }

  // focus the canvas so that seatEl is centered in the view
  function focusOnSeat(seatEl){
    if(!seatEl) return;
    const seatRect = seatEl.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const seatCenter = { x: seatRect.left + seatRect.width/2, y: seatRect.top + seatRect.height/2 };
    const canvasCenter = { x: canvasRect.left + canvasRect.width/2, y: canvasRect.top + canvasRect.height/2 };
    const deltaPixels = { x: canvasCenter.x - seatCenter.x, y: canvasCenter.y - seatCenter.y };
    // because transform is translate(...) scale(...), changing pan by dp moves screen by dp * scale
    pan.x = pan.x + deltaPixels.x / scale;
    pan.y = pan.y + deltaPixels.y / scale;
    applyTransform();
    // flash highlight
    try{
      seatEl.animate([{boxShadow:'0 0 0 rgba(0,0,0,0)'},{boxShadow:'0 0 12px rgba(2,120,210,0.6)'}], {duration:400, direction:'alternate'});
    }catch(e){}
  }

  // context menu handling
  let contextTargetSeat = null;
  function showContextMenu(x,y,seatEl){
    contextTargetSeat = seatEl;
    // 考虑画布的缩放和平移
    const canvasRect = canvas.getBoundingClientRect();
    // 计算相对于画布的坐标
    const adjustedX = (x - canvasRect.left - pan.x) / scale;
    const adjustedY = (y - canvasRect.top - pan.y) / scale;
    contextMenu.style.left = (canvasRect.left + pan.x + adjustedX * scale) + 'px';
    contextMenu.style.top = (canvasRect.top + pan.y + adjustedY * scale) + 'px';
    contextMenu.style.display = 'block';
  }
  function hideContextMenu(){ contextTargetSeat = null; if(contextMenu) contextMenu.style.display = 'none'; }
  
  // table context menu handling
  let contextTargetTable = null;
  function showTableContextMenu(x,y,tableEl){
    contextTargetTable = tableEl;
    // 考虑画布的缩放和平移
    const canvasRect = canvas.getBoundingClientRect();
    // 计算相对于画布的坐标
    const adjustedX = (x - canvasRect.left - pan.x) / scale;
    const adjustedY = (y - canvasRect.top - pan.y) / scale;
    tableContextMenu.style.left = (canvasRect.left + pan.x + adjustedX * scale) + 'px';
    tableContextMenu.style.top = (canvasRect.top + pan.y + adjustedY * scale) + 'px';
    tableContextMenu.style.display = 'block';
  }
  function hideTableContextMenu(){ contextTargetTable = null; if(tableContextMenu) tableContextMenu.style.display = 'none'; }

  // handle clicks on seat menu
  if(contextMenu){
    contextMenu.addEventListener('click', (e)=>{
      const action = e.target && e.target.dataset && e.target.dataset.action;
      if(!action || !contextTargetSeat) return;
      if(action === 'focus'){
        focusOnSeat(contextTargetSeat);
      } else if(action === 'unassign'){
        const sid = contextTargetSeat.dataset.seatId;
        if(sid && assigned[sid]){
          const pid = assigned[sid];
          const p = people.find(pp => pp.id === pid);
          if(p && confirm(`确定要取消 ${p.name} 在 ${sid} 的分配吗？`)) {
            delete assigned[sid];
            clearSeatVisual(contextTargetSeat);
            renderAssignedPanel();
            renderPeopleList();
            updateTableOccupancy(sid);
            scheduleAutoSave();
            showMessage.success(`${p.name} 在 ${sid} 的分配已取消！`);
          }
        }
      }
      hideContextMenu();
    });
  }
  
  // handle clicks on table menu
  if(tableContextMenu){
    tableContextMenu.addEventListener('click', (e)=>{
      const action = e.target && e.target.dataset && e.target.dataset.action;
      if(!action || !contextTargetTable) return;
      
      const tableId = contextTargetTable.dataset.tableId;
      
      if(action === 'renameTable'){
        renameTable(tableId);
      } else if(action === 'clearTable'){
        const userConfirmed = confirm(`确定要清空 ${tableId} 上的所有人员吗？`);
        if (userConfirmed) {
          clearTable(tableId);
        }
      }
      hideTableContextMenu();
    });
  }

  // Function to rename a table
  function renameTable(tableId) {
    const titleElement = contextTargetTable.querySelector('.title');
    if (!titleElement) return;
    
    const currentText = titleElement.textContent;
    // Extract current table name from "Name (count/total)" format
    const match = currentText.match(/^(.+?)\s+\(\d+\/\d+\)$/);
    const currentTableName = match ? match[1] : tableId;
    
    const newName = prompt('请输入新的桌名:', currentTableName);
    if (newName !== null && newName.trim() !== '') {
      const trimmedName = newName.trim();
      // Update the occupancy count
      const seatsPerTable = parseInt(currentText.match(/\((\d+)\/(\d+)\)/)?.[2]) || 1; // Get total seats
      let occ = 0;
      for(const s of Object.keys(assigned)){
        if(s.startsWith(tableId+'-')) occ++;
      }
      titleElement.textContent = `${trimmedName} (${occ}/${seatsPerTable})`;
    }
  }

  // hide menu on global interactions
  document.addEventListener('click', (e)=>{ 
    if(contextMenu && e.button===0) hideContextMenu(); 
    if(tableContextMenu && e.button===0) hideTableContextMenu(); 
  });
  document.addEventListener('keydown', (e)=>{ 
    if(e.key === 'Escape') {
      hideContextMenu(); 
      hideTableContextMenu();
    }
  });

  function seatDragStart(e){
    const seat = e.currentTarget;
    const seatId = seat.dataset.seatId;
    const pid = assigned[seatId];
    if(!pid) { e.preventDefault(); return; }
    e.dataTransfer.setData('text/plain', pid);
    // mark that on drop if dropped outside a seat -> we will unassign
    setTimeout(()=>{
      // small delay to allow dragend to run
    },0);
  }

  function clearSeatVisual(seatEl){
    seatEl.classList.remove('occupied');
    seatEl.draggable = false;
    // reset to seat number only
    const m = /-S(\d+)$/.exec(seatEl.dataset.seatId || '');
    seatEl.textContent = m ? m[1] : '';
    seatEl.title = '';
    seatEl.ondblclick = null;
    // Don't clone - keep the contextmenu listener intact
  }

  function clearTable(tableId){
    // 先确认是否清空桌子
    const userConfirmed = confirm(`确定要清空 ${tableId} 上的所有人员吗？`);
    if (!userConfirmed) {
      return; // 用户取消操作
    }
    
    // remove all seats assigned for this table
    Object.keys(assigned).forEach(k=>{ if(k.startsWith(tableId)) delete assigned[k]; });
    // re-render seats
    const seats = inner.querySelectorAll(`[data-seat-id^='${tableId}-']`);
    seats.forEach(s=>clearSeatVisual(s));
    renderAssignedPanel();
    renderPeopleList();
    updateTableOccupancy(tableId + '-S1'); // update table title
    scheduleAutoSave();
    
    // Find the table element and update its title to show 0 occupancy
    const tableElement = inner.querySelector(`[data-table-id='${tableId}']`);
    if(tableElement) {
      const titleElement = tableElement.querySelector('.title');
      if(titleElement) {
        // Extract table name from current title and update occupancy to 0
        const currentText = titleElement.textContent;
        const match = currentText.match(/^(.+?)\s+\(\d+\/(\d+)\)$/);
        if(match) {
          const tableName = match[1];
          const totalSeats = match[2];
          titleElement.textContent = `${tableName} (0/${totalSeats})`;
        }
      }
    }
    
    showMessage.success(`${tableId} 的人员已清空！`);
  }

  // Update table occupancy display in title
  function updateTableOccupancy(seatId){
    const match = /^(T\d+)-/.exec(seatId);
    if(!match) return;
    const tableId = match[1];
    const table = inner.querySelector(`[data-table-id='${tableId}']`);
    if(!table) return;
    
    // Count occupied seats for this table
    let occ = 0;
    let total = 0;
    const seats = inner.querySelectorAll(`[data-seat-id^='${tableId}-']`);
    total = seats.length;
    seats.forEach(s => {
      if(assigned[s.dataset.seatId]) occ++;
    });
    
    const titleEl = table.querySelector('.title');
    if(titleEl){
      // Keep the custom table name if it exists, otherwise use default
      const currentText = titleEl.textContent;
      const nameMatch = currentText.match(/^(.+?)\s+\(\d+\/\d+\)$/);
      let tableName = nameMatch ? nameMatch[1] : tableId.replace('T','');
      // Ensure it's not empty
      if (!tableName || tableName === tableId.replace('T', '')) {
        tableName = `桌 ${tableId.replace('T', '')}`;
      }
      titleEl.textContent = `${tableName} (${occ}/${total})`;
    }
  }

  // if dropped anywhere on canvas but not on seat, unassign
  canvas.addEventListener('drop', (e)=>{
    const pid = e.dataTransfer.getData('text/plain');
    if(!pid) return;
    // find if drop target is a seat
    const seat = e.target.closest('.seat');
    if(!seat){
      // remove any existing assignment for that person
      const existingSeatId = Object.keys(assigned).find(s => assigned[s] === pid);
      if(existingSeatId) {
        const p = people.find(pp => pp.id === pid);
        if(p && confirm(`确定要取消 ${p.name} 在 ${existingSeatId} 的分配吗？`)) {
          delete assigned[existingSeatId];
          const seatEl = inner.querySelector(`[data-seat-id='${existingSeatId}']`);
          if(seatEl) clearSeatVisual(seatEl);
          renderAssignedPanel();
          renderPeopleList();
          // update table occupancy
          updateTableOccupancy(existingSeatId);
          scheduleAutoSave();
          showMessage.success(`${p.name} 在 ${existingSeatId} 的分配已取消！`);
        }
      }
    }
  })

  // generate tables based on inputs
  generateBtn.addEventListener('click', ()=>{
    const total = Math.max(1, parseInt(totalTablesInput.value,10) || 1);
    const seatsPerTable = Math.max(1, parseInt(seatsPerTableInput.value,10) || 1);
    const pattern = parsePattern(rowPatternInput.value || '1');
    const rows = buildRows(total, pattern);
    // construct tables structure: rows array with count and seatsPerTable and startId
    const tables = [];
    let cur = 1;
    rows.forEach(count => {
      tables.push({count, seatsPerTable, startId: cur});
      cur += count;
    })
    // remember current tables for export/import
    currentTables = tables;
    // clear assignments for seats that no longer exist
    const validSeatPrefix = new Set();
    tables.forEach(r=>{
      for(let t=0;t<r.count;t++){
        for(let s=1;s<=r.seatsPerTable;s++){
          validSeatPrefix.add(`T${r.startId + t}-S${s}`);
        }
      }
    })
    Object.keys(assigned).forEach(k => { if(!validSeatPrefix.has(k)) delete assigned[k]; })
    renderCanvas(tables);
    scheduleAutoSave();
    showMessage.success(`成功生成 ${total} 桌布局，共 ${rows.reduce((a, b) => a + b, 0)} 行！`);
  })

  // Export / Import JSON
  const exportBtnEl = document.getElementById('exportBtn');
  const importFileEl = document.getElementById('importFile');
  const importBtnJson = document.getElementById('importBtnJson');
  const exportCsvBtn = document.getElementById('exportCsvBtn');
  const exportCsvByTableBtn = document.getElementById('exportCsvByTableBtn');

  const exportImageBtn = document.getElementById('exportImageBtn');
  const printBtn = document.getElementById('printBtn');

  function downloadJSON(filename, obj){
    const blob = new Blob([JSON.stringify(obj, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    showMessage.success(`布局已导出为 ${filename}！`);
  }

  // 导出CSV功能（座位明细）
  function exportToCSV() {
    // 准备CSV数据
    const csvRows = [];
    
    // 添加表头
    csvRows.push(['桌号', '座位号', '姓名'].join(','));
    
    // 按桌子顺序整理数据
    const tables = currentTables;
    if (tables && tables.length > 0) {
      tables.forEach(row => {
        for (let i = 0; i < row.count; i++) {
          const tableId = row.startId + i;
          const seatsPerTable = row.seatsPerTable || 1;
          
          // 检查该桌子的所有座位
          for (let s = 1; s <= seatsPerTable; s++) {
            const seatId = `T${tableId}-S${s}`;
            const personId = assigned[seatId];
            let personName = '';
            
            if (personId) {
              const person = people.find(p => p.id === personId);
              if (person) {
                personName = person.name;
              }
            }
            
            // 添加一行数据
            csvRows.push([`T${tableId}`, `S${s}`, `"${personName}"`].join(','));
          }
        }
      });
    } else {
      // 如果没有桌子数据，列出所有分配信息
      Object.entries(assigned).forEach(([seatId, personId]) => {
        const match = seatId.match(/T(\d+)-S(\d+)/);
        if (match) {
          const tableNum = match[1];
          const seatNum = match[2];
          const person = people.find(p => p.id === personId);
          const personName = person ? person.name : '';
          csvRows.push([`T${tableNum}`, `S${seatNum}`, `"${personName}"`].join(','));
        }
      });
    }
    
    // 创建并下载CSV文件
    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'seating-layout-detailed.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    
    showMessage.success('座位分配明细已导出为CSV文件！');
  }

  // 导出CSV功能（按桌汇总）
  function exportToCSVByTable() {
    // 按桌子分组整理数据
    const tableGroups = {};
    
    // 首先获取所有桌子信息
    const tables = currentTables;
    if (tables && tables.length > 0) {
      tables.forEach(row => {
        for (let i = 0; i < row.count; i++) {
          const tableId = `T${row.startId + i}`;
          const seatsPerTable = row.seatsPerTable || 1;
          tableGroups[tableId] = {
            seats: Array(seatsPerTable).fill(''),
            seatLabels: Array.from({length: seatsPerTable}, (_, idx) => `座位${idx+1}`)
          };
        }
      });
    } else {
      // 如果没有桌子数据，从分配信息中获取桌子
      Object.keys(assigned).forEach(seatId => {
        const match = seatId.match(/(T\d+)-S\d+/);
        if (match) {
          const tableId = match[1];
          if (!tableGroups[tableId]) {
            // 估算座位数，这里我们先初始化为10个座位，后续再调整
            tableGroups[tableId] = {
              seats: Array(10).fill(''),
              seatLabels: Array.from({length: 10}, (_, idx) => `座位${idx+1}`)
            };
          }
        }
      });
    }
    
    // 填充分配信息
    Object.entries(assigned).forEach(([seatId, personId]) => {
      const match = seatId.match(/(T\d+)-S(\d+)/);
      if (match) {
        const tableId = match[1];
        const seatNum = parseInt(match[2]) - 1; // 转换为数组索引
        
        if (tableGroups[tableId]) {
          const person = people.find(p => p.id === personId);
          const personName = person ? person.name : '';
          
          // 如果座位数组太小，扩展它
          if (seatNum >= tableGroups[tableId].seats.length) {
            const oldLength = tableGroups[tableId].seats.length;
            const newLength = seatNum + 1;
            tableGroups[tableId].seats.length = newLength;
            tableGroups[tableId].seats.fill('', oldLength);
            tableGroups[tableId].seatLabels.length = newLength;
            for (let i = oldLength; i < newLength; i++) {
              tableGroups[tableId].seatLabels[i] = `座位${i+1}`;
            }
          }
          
          tableGroups[tableId].seats[seatNum] = personName;
        }
      }
    });
    
    // 准备CSV数据
    const csvRows = [];
    
    // 添加表头 - 桌号和每个座位
    const header = ['桌号'];
    if (Object.keys(tableGroups).length > 0) {
      // 使用第一个桌子的座位数来构建表头
      const firstTable = Object.values(tableGroups)[0];
      for (let i = 0; i < firstTable.seatLabels.length; i++) {
        header.push(firstTable.seatLabels[i]);
      }
    }
    csvRows.push(header.join(','));
    
    // 添加每桌的数据行
    Object.entries(tableGroups).forEach(([tableId, tableData]) => {
      const row = [tableId];
      tableData.seats.forEach(seat => {
        row.push(`"${seat}"`); // 用引号包围内容，处理包含逗号的姓名
      });
      csvRows.push(row.join(','));
    });
    
    // 创建并下载CSV文件
    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'seating-layout-by-table.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    
    showMessage.success('按桌汇总的座位分配已导出为CSV文件！');
  }

  function exportLayout(){
    const payload = {
      people: people,
      assigned: assigned,
      tables: currentTables,
      view: { pan, scale }
    };
    downloadJSON('seating-layout.json', payload);
  }

  function importLayoutFromObject(obj){
    if(!obj) return;
    // basic validation and fallback
    people = Array.isArray(obj.people) ? obj.people : [];
    assigned = obj.assigned && typeof obj.assigned === 'object' ? obj.assigned : {};
    currentTables = Array.isArray(obj.tables) ? obj.tables : [];
    // restore view
    if(obj.view){ pan = obj.view.pan || {x:0,y:0}; scale = obj.view.scale || 1; }
    renderPeopleList();
    renderCanvas(currentTables);
    zoomRange.value = String(scale);
    applyTransform();
    renderAssignedPanel();
  }

  exportBtnEl.addEventListener('click', exportLayout);
  exportCsvBtn.addEventListener('click', exportToCSV);
  exportCsvByTableBtn.addEventListener('click', exportToCSVByTable);
  importBtnJson.addEventListener('click', ()=>importFileEl.click());
  importFileEl.addEventListener('change', (e)=>{
    const f = e.target.files && e.target.files[0];
    if(!f) return;
    const reader = new FileReader();
    reader.onload = (ev)=>{
      try{ 
        const obj = JSON.parse(ev.target.result);
        importLayoutFromObject(obj);
        showMessage.success('布局文件导入成功！');
      }catch(err){ 
        showMessage.error('无效的 JSON 文件: '+err.message); 
      }
    };
    reader.readAsText(f);
    // clear input so same file can be reselected later
    e.target.value = '';
  });

  // 导出画布为图片并下载
  function exportCanvasAsImage(){
    const target = document.getElementById('inner');
    if(typeof html2canvas === 'undefined'){
      showMessage.error('html2canvas 未加载，无法导出图片。请确保有网络或把库本地化。');
      return;
    }
    
    // 创建临时容器来存放画布的完整视图
    const tempContainer = document.createElement('div');
    tempContainer.id = 'temp-canvas-container';
    tempContainer.style.position = 'absolute';
    tempContainer.style.left = '-9999px';
    tempContainer.style.top = '0';
    tempContainer.style.width = 'max-content';
    tempContainer.style.height = 'max-content';
    tempContainer.style.overflow = 'visible';
    tempContainer.style.backgroundColor = '#ffffff';
    
    // 创建一个克隆元素，不包含transform
    const clone = target.cloneNode(true);
    clone.style.transform = '';
    clone.style.transformOrigin = '';
    clone.style.position = 'relative';
    clone.style.left = '0';
    clone.style.top = '0';
    
    tempContainer.appendChild(clone);
    document.body.appendChild(tempContainer);
    
    // 捕获临时容器的内容
    html2canvas(tempContainer, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      scrollX: 0,
      scrollY: 0
    }).then(c => {
      // 移除临时容器
      document.body.removeChild(tempContainer);
      
      const url = c.toDataURL('image/png');
      const a = document.createElement('a'); a.href = url; a.download = 'seating-layout.png'; document.body.appendChild(a); a.click(); a.remove();
      showMessage.success('画布已导出为图片！');
    }).catch(err => {
      // 即使出错也要移除临时容器
      if(document.body.contains(tempContainer)) {
        document.body.removeChild(tempContainer);
      }
      showMessage.error('生成图片失败: '+err.message);
    });
  }

  // 打印布局：先将画布渲染为图片，然后在新窗口打开并触发打印
  function printCanvas(){
    const target = document.getElementById('inner');
    if(typeof html2canvas === 'undefined'){
      showMessage.error('html2canvas 未加载，无法打印。');
      return;
    }
    
    // 创建临时容器来存放画布的完整视图
    const tempContainer = document.createElement('div');
    tempContainer.id = 'temp-canvas-container';
    tempContainer.style.position = 'absolute';
    tempContainer.style.left = '-9999px';
    tempContainer.style.top = '0';
    tempContainer.style.width = 'max-content';
    tempContainer.style.height = 'max-content';
    tempContainer.style.overflow = 'visible';
    tempContainer.style.backgroundColor = '#ffffff';
    
    // 创建一个克隆元素，不包含transform
    const clone = target.cloneNode(true);
    clone.style.transform = '';
    clone.style.transformOrigin = '';
    clone.style.position = 'relative';
    clone.style.left = '0';
    clone.style.top = '0';
    
    tempContainer.appendChild(clone);
    document.body.appendChild(tempContainer);
    
    // 捕获临时容器的内容
    html2canvas(tempContainer, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      scrollX: 0,
      scrollY: 0
    }).then(c => {
      // 移除临时容器
      document.body.removeChild(tempContainer);
      
      const url = c.toDataURL('image/png');
      const w = window.open('');
      if(!w) { 
        showMessage.error('弹窗被拦截，请允许弹窗后重试'); 
        return; 
      }
      w.document.write('<title>打印布局</title>');
      w.document.write('<img src="'+url+'" style="max-width:100%;height:auto;display:block;margin:0 auto">');
      w.document.close();
      w.focus();
      // 给浏览器小延迟让图片加载完
      setTimeout(()=>{ w.print(); }, 600);
      showMessage.info('打印窗口已打开，请在新窗口中操作打印');
    }).catch(err => {
      // 即使出错也要移除临时容器
      if(document.body.contains(tempContainer)) {
        document.body.removeChild(tempContainer);
      }
      showMessage.error('打印失败: '+err.message);
    });
  }

  exportImageBtn.addEventListener('click', exportCanvasAsImage);
  printBtn.addEventListener('click', printCanvas);

  // Canvas pan & zoom
  let pan = {x:0,y:0}, scale = 1, isPanning=false, startPan={x:0,y:0};
  function applyTransform(){
    inner.style.transform = `translate(${pan.x}px, ${pan.y}px) scale(${scale})`;
    updateZoomDisplay();
  }
  
  function updateZoomDisplay(){
    const zoomDisplay = document.getElementById('zoomDisplay');
    if(zoomDisplay) {
      zoomDisplay.textContent = `${Math.round(scale * 100)}%`;
    }
  }
  
  zoomRange.addEventListener('input', ()=>{
    scale = parseFloat(zoomRange.value);
    applyTransform();
  })
  resetView.addEventListener('click', ()=>{
    pan={x:0,y:0};
    scale=1;
    zoomRange.value='1';
    applyTransform();
  })

  // support mouse drag pan when space pressed or right button
  let spaceDown = false;
  window.addEventListener('keydown', (e)=>{ if(e.code==='Space'){ spaceDown=true; canvas.style.cursor='grab'; e.preventDefault(); } });
  window.addEventListener('keyup', (e)=>{ if(e.code==='Space'){ spaceDown=false; canvas.style.cursor='default'; } });

  let lastPointer = null;
  canvas.addEventListener('pointerdown', (e)=>{
    // only pan when space held or right button (but not on tables/seats)
    if((e.button===2 || spaceDown) && !e.target.closest('.table, .seat')) {
      // prevent browser context menu from appearing when starting right-button pan
      if(e.button===2) e.preventDefault();
      isPanning = true; startPan = {x: e.clientX - pan.x, y: e.clientY - pan.y}; canvas.setPointerCapture(e.pointerId);
    }
  })
  canvas.addEventListener('pointermove', (e)=>{
    if(!isPanning) return;
    pan.x = e.clientX - startPan.x; pan.y = e.clientY - startPan.y; applyTransform();
  })
  canvas.addEventListener('pointerup', (e)=>{ if(isPanning){ isPanning=false; try{ canvas.releasePointerCapture(e.pointerId);}catch(e){} } })
  // suppress context menu while panning with right button (or when space pan active)
  canvas.addEventListener('contextmenu', (e)=>{
    // 如果目标元素是桌子或座位，阻止默认上下文菜单并允许自定义菜单
    if(e.target.closest('.table, .seat')){
      e.preventDefault();
    } 
    // 如果正在拖拽或按住空格键，阻止默认上下文菜单
    else if(isPanning || spaceDown){
      e.preventDefault();
    }
    // 在其他区域允许默认行为（显示浏览器上下文菜单，用户可选择保存图片等）
  }, {passive: false});
  // wheel to zoom
  canvas.addEventListener('wheel', (e)=>{
    if(e.ctrlKey) return; // let browser handle
    e.preventDefault();
    const delta = -e.deltaY * 0.001;
    let newScale = Math.min(2, Math.max(0.3, scale + delta));
    // zoom towards cursor: adjust pan so cursor appears fixed
    const rect = inner.getBoundingClientRect();
    const cx = (e.clientX - rect.left);
    const cy = (e.clientY - rect.top);
    const prevScale = scale;
    scale = newScale;
    // compute new pan
    pan.x = pan.x - (cx)*(scale/prevScale - 1);
    pan.y = pan.y - (cy)*(scale/prevScale - 1);
    zoomRange.value = String(scale.toFixed(2));
    applyTransform();
  }, {passive:false})

  // initial sample
  document.addEventListener('DOMContentLoaded', ()=>{
    // Try to load autosave first
    const autosave = loadFromLocalStorage('__autosave__');
    if(autosave){
      applyConfig(autosave);
    } else {
      // prefill example people
      people = ["张三","李四","王五","赵六","小明","小红","小强","小李","阿梅","老王"].map(n=>({id:uid('p_'), name:n}));
      renderPeopleList();
      // generate default layout
      generateBtn.click();
    }
    // Load config list
    updateConfigSelect();
    // Update zoom display after initialization
    updateZoomDisplay();
  })

  // 通用提示框函数
  function show(message, type = 'info', duration = 3000) {
    const container = document.getElementById('notificationContainer');
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    
    // 根据类型添加图标
    const icons = {
      success: '✓',
      warning: '⚠',
      error: '✕',
      info: 'ℹ'
    };
    
    notification.innerHTML = `
      <div class="notification-icon">${icons[type] || icons.info}</div>
      <div class="notification-content">${message}</div>
      <button class="notification-close">&times;</button>
    `;
    
    container.appendChild(notification);
    
    // 添加关闭事件
    const closeBtn = notification.querySelector('.notification-close');
    closeBtn.addEventListener('click', () => {
      closeNotification(notification);
    });
    
    // 自动关闭
    if (duration > 0) {
      setTimeout(() => {
        closeNotification(notification);
      }, duration);
    }
    
    return notification;
  }
  
  // 关闭通知的辅助函数
  function closeNotification(notification) {
    notification.classList.add('fade-out');
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }
  
  // 便捷的提示函数
  const showMessage = {
    success: (message, duration) => show(message, 'success', duration),
    warning: (message, duration) => show(message, 'warning', duration),
    error: (message, duration) => show(message, 'error', duration),
    info: (message, duration) => show(message, 'info', duration)
  };

  // 添加键盘快捷键支持
  document.addEventListener('keydown', (e) => {
    // 检查是否按下 Ctrl+S (或 Cmd+S on Mac)
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault(); // 阻止浏览器默认的保存行为
      
      // 触发保存当前配置功能
      const currentConfig = configSelect.value;
      if(!currentConfig || !currentConfig.trim()) {
        // 如果没有选择配置，提示用户先选择或使用另存为
        showMessage.warning('请先选择一个现有配置，或使用"另存为"创建新配置');
        return;
      }
      saveToLocalStorage(currentConfig);
      updateConfigSelect();
      configSelect.value = currentConfig;
      showMessage.success(`配置 "${currentConfig}" 已保存！`);
    }
  });
})();
