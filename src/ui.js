import { Packer } from './packer.js';

export class UI {
  constructor(sceneObj) {
    this.sceneObj = sceneObj;
    this.cargoList = [];
    this.containerTypes = {
      '10ft': { name: '10ft Standard Container', type: 'container', w: 235.2, h: 239.3, l: 283.1, maxWeight: 10000 },
      '20ft': { name: '20ft Standard Container', type: 'container', w: 235.2, h: 239.3, l: 589.8, maxWeight: 28200 },
      '40ft_std': { name: '40ft Standard Container', type: 'container', w: 235.2, h: 239.3, l: 1203.2, maxWeight: 28800 },
      '40ft': { name: '40ft High Cube', type: 'container', w: 235.2, h: 269.8, l: 1203.2, maxWeight: 28800 },
      '45ft_hc': { name: '45ft High Cube', type: 'container', w: 235.2, h: 269.8, l: 1355.6, maxWeight: 29600 },
      'truck': { name: 'Truck Trailer', type: 'truck', w: 245.0, h: 270.0, l: 1360.0, maxWeight: 24000 },
      'eurotrailer': { name: 'Евротрейлер (Полуприцеп)', type: 'truck', w: 248.0, h: 298.0, l: 1362.0, maxWeight: 22000 },
      'refrigerator': { name: 'Рефрижератор', type: 'truck', w: 249.0, h: 260.0, l: 1336.0, maxWeight: 22000 },
      'isotherm': { name: 'Изотерм (Полуприцеп)', type: 'truck', w: 248.0, h: 270.0, l: 1362.0, maxWeight: 22000 },
      'euro_82': { name: 'Еврофура 82 м³', type: 'truck', w: 245.0, h: 245.0, l: 1360.0, maxWeight: 22000 },
      'euro_86': { name: 'Еврофура 86 м³', type: 'truck', w: 245.0, h: 260.0, l: 1360.0, maxWeight: 22000 },
      'euro_90': { name: 'Еврофура 90 м³', type: 'truck', w: 245.0, h: 270.0, l: 1360.0, maxWeight: 24000 },
      'euro_92': { name: 'Еврофура 92 м³', type: 'truck', w: 245.0, h: 280.0, l: 1360.0, maxWeight: 24000 },
      'euro_96': { name: 'Еврофура 96 м³', type: 'truck', w: 245.0, h: 290.0, l: 1360.0, maxWeight: 24000 },
      'mega_100': { name: 'Мега фура 100 м³', type: 'truck', w: 245.0, h: 300.0, l: 1360.0, maxWeight: 24000 },
      'gazelle': { name: 'Газель (Тент) 1.5 т', type: 'truck', w: 190.0, h: 190.0, l: 320.0, maxWeight: 1500 },
      'truck_3t': { name: 'Грузовик 3 т (Бычок)', type: 'truck', w: 220.0, h: 220.0, l: 400.0, maxWeight: 3000 },
      'truck_5t': { name: 'Грузовик 5 т (Пятитонник)', type: 'truck', w: 245.0, h: 240.0, l: 600.0, maxWeight: 5000 },
      'truck_10t': { name: 'Грузовик 10 т (Десятитонник)', type: 'truck', w: 245.0, h: 250.0, l: 750.0, maxWeight: 10000 }
    };
    this.projectTransports = []; // Start empty (0 / 10)
    this.currentContainerKey = null;
    this.currentContainer = null;
    
    this.boxPresets = {
      'box-s': { name: 'Коробка S', l: 30, w: 20, h: 15, weight: 2 },
      'box-m': { name: 'Коробка M', l: 40, w: 30, h: 20, weight: 5 },
      'box-l': { name: 'Коробка L', l: 60, w: 40, h: 40, weight: 15 },
      'euro': { name: 'Европаллета', l: 120, w: 80, h: 15, weight: 25 },
    };
    
    // UI Elements
    this.presetSelect = document.getElementById('box-preset');
    this.form = document.getElementById('cargo-form');
    this.tableBody = document.querySelector('#cargo-table tbody');
    this.calcBtn = document.getElementById('calculate-btn');
    this.overlay = document.getElementById('loading-overlay');
    
    this.statVol = document.getElementById('stat-volume-percent');
    this.statWeight = document.getElementById('stat-weight');
    this.statFree = document.getElementById('stat-free-vol');

    this.initLogin();
    this.initAutoLogout();
    this.initNavigation();
    this.initModal();
    this.initTransportCatalog();
    this.initSceneToolbar();
    this.initSettings();
    this.init();
  }
  
  initAutoLogout() {
    let inactivityTimer;
    const timeout = 5 * 60 * 1000; // 5 minutes

    const resetTimer = () => {
      clearTimeout(inactivityTimer);
      if (localStorage.getItem('smartload_auth') === 'true') {
        inactivityTimer = setTimeout(() => {
          localStorage.removeItem('smartload_auth');
          window.location.reload();
        }, timeout);
      }
    };

    window.addEventListener('mousemove', resetTimer);
    window.addEventListener('mousedown', resetTimer);
    window.addEventListener('keydown', resetTimer);
    window.addEventListener('touchstart', resetTimer);
    window.addEventListener('wheel', resetTimer);

    resetTimer();
  }

  initLogin() {
    const loginScreen = document.getElementById('login-screen');
    const splashScreen = document.getElementById('splash-screen');
    if (!loginScreen || !splashScreen) return;

    if (localStorage.getItem('smartload_auth') === 'true') {
      loginScreen.remove();
      this.startSplashTimer();
      return;
    }

    const pinBoxes = document.querySelectorAll('.pin-box');
    const errorText = document.getElementById('login-error');

    pinBoxes.forEach((box, index) => {
      box.addEventListener('input', (e) => {
        errorText.style.opacity = '0';
        box.classList.remove('shake');
        
        if (e.target.value.length === 1) {
          if (index < pinBoxes.length - 1) {
            pinBoxes[index + 1].focus();
          } else {
            this.checkLogin(pinBoxes, loginScreen);
          }
        }
      });

      box.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !e.target.value && index > 0) {
          pinBoxes[index - 1].focus();
        }
      });
    });
    
    if (pinBoxes.length > 0) pinBoxes[0].focus();
  }

  checkLogin(pinBoxes, loginScreen) {
    let enteredCode = '';
    pinBoxes.forEach(b => enteredCode += b.value);
    
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const expectedCode = h + m;

    if (enteredCode === expectedCode) {
      localStorage.setItem('smartload_auth', 'true');
      loginScreen.style.opacity = '0';
      setTimeout(() => {
        loginScreen.remove();
        this.startSplashTimer();
      }, 500);
    } else {
      const errorText = document.getElementById('login-error');
      errorText.style.opacity = '1';
      pinBoxes.forEach(b => {
        b.value = '';
        b.classList.add('shake');
      });
      pinBoxes[0].focus();
      setTimeout(() => {
        pinBoxes.forEach(b => b.classList.remove('shake'));
      }, 400);
    }
  }

  startSplashTimer() {
    setTimeout(() => {
      const splash = document.getElementById('splash-screen');
      if (splash) {
        splash.style.opacity = '0';
        setTimeout(() => splash.remove(), 500);
      }
    }, 2500);
  }
  
  initSceneToolbar() {
    const toolbarBtns = document.querySelectorAll('.toolbar-btn');
    if (!toolbarBtns.length) return;
    
    // Bind to sceneObj tool mode change event (from keyboard shortcuts)
    if (this.sceneObj) {
      this.sceneObj.onToolChange = (tool) => {
        if (tool !== 'delete') {
          toolbarBtns.forEach(b => b.classList.remove('active'));
          const btn = Array.from(toolbarBtns).find(b => b.getAttribute('data-tool') === tool);
          if (btn) btn.classList.add('active');
        }
        this.sceneObj.setToolMode(tool);
      };
    }

    toolbarBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const tool = btn.getAttribute('data-tool');
        
        if (tool === 'delete') {
          if (this.sceneObj) this.sceneObj.deleteSelected();
          return; // Don't change active tool state for actions
        } else if (tool === 'clone') {
          if (this.sceneObj && this.sceneObj.selectedMesh) {
             if (this.sceneObj.onCargoClone) this.sceneObj.onCargoClone(this.sceneObj.selectedMesh.userData);
          }
          return;
        }
        
        // Switch tool mode
        toolbarBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        if (this.sceneObj) {
          this.sceneObj.setToolMode(tool);
        }
      });
    });
  }
  
  initSettings() {
    // Load saved settings or defaults
    const cargoLen = localStorage.getItem('smartload_cargo_len') || 'cm';
    const cargoWeight = localStorage.getItem('smartload_cargo_weight') || 'kg';
    const areaLen = localStorage.getItem('smartload_area_len') || 'cm';
    const areaWeight = localStorage.getItem('smartload_area_weight') || 'kg';

    const setRadio = (name, val) => {
      const radio = document.querySelector(`input[name="${name}"][value="${val}"]`);
      if (radio) radio.checked = true;
    };
    
    setRadio('cargo_len', cargoLen);
    setRadio('cargo_weight', cargoWeight);
    setRadio('area_len', areaLen);
    setRadio('area_weight', areaWeight);

    // Save button logic
    const saveBtn = document.getElementById('save-settings-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        const newCargoLen = document.querySelector('input[name="cargo_len"]:checked').value;
        const newCargoWeight = document.querySelector('input[name="cargo_weight"]:checked').value;
        const newAreaLen = document.querySelector('input[name="area_len"]:checked').value;
        const newAreaWeight = document.querySelector('input[name="area_weight"]:checked').value;
        
        localStorage.setItem('smartload_cargo_len', newCargoLen);
        localStorage.setItem('smartload_cargo_weight', newCargoWeight);
        localStorage.setItem('smartload_area_len', newAreaLen);
        localStorage.setItem('smartload_area_weight', newAreaWeight);
        
        // Update UI labels (just visual for now, converting actual numbers is complex without state mgmt)
        alert('Настройки сохранены! Новые параметры будут применяться при добавлении грузов.');
      });
    }
  }

  
  initNavigation() {
    const navBtns = document.querySelectorAll('.nav-btn');
    const views = document.querySelectorAll('.view');
    
    navBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        navBtns.forEach(b => b.classList.remove('active'));
        views.forEach(v => v.classList.remove('active'));
        
        btn.classList.add('active');
        const targetId = btn.getAttribute('data-target');
        document.getElementById(targetId).classList.add('active');
        
        // If switching to scene, trigger resize to fix canvas size
        if(targetId === 'view-scene' && this.sceneObj) {
            setTimeout(() => this.sceneObj.onWindowResize(), 100);
            setTimeout(() => this.sceneObj.onWindowResize(), 400);
        }
      });
    });
    
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('smartload_auth');
            window.location.reload();
        });
    }
  }
  
  initModal() {
      const modal = document.getElementById('cargo-modal');
      const btnOpen = document.getElementById('btn-open-cargo-modal');
      const btnClose = document.getElementById('btn-close-cargo-modal');
      const btnCancel = document.getElementById('btn-cancel-cargo');
      
      const openModal = () => modal.classList.remove('hidden');
      const closeModal = () => modal.classList.add('hidden');
      
      btnOpen.addEventListener('click', openModal);
      btnClose.addEventListener('click', closeModal);
      btnCancel.addEventListener('click', closeModal);
      
      modal.addEventListener('click', (e) => {
          if(e.target === modal) closeModal();
      });
  }
  
  initTransportCatalog() {
      const listContainer = document.getElementById('transport-list');
      const filterBtns = document.querySelectorAll('.t-tab');
      const projectListContainer = document.getElementById('project-transport-list');
      const tCount = document.getElementById('project-t-count');
      
      const renderProjectTransports = () => {
          projectListContainer.innerHTML = '';
          tCount.innerText = this.projectTransports.length;
          
          this.projectTransports.forEach((key, index) => {
              const t = this.containerTypes[key];
              if(!t) return;
              
              const isActive = (key === this.currentContainerKey);
              const item = document.createElement('div');
              item.style.cssText = `display: flex; justify-content: space-between; align-items: center; padding: 1rem; border-bottom: 1px solid #e2e8f0; cursor: pointer; border-left: 3px solid ${isActive ? 'var(--accent-color)' : 'transparent'}; background: ${isActive ? '#eff6ff' : 'transparent'}; transition: all 0.2s;`;
              
              const isTruck = t.type === 'truck';
              const icon = isTruck ? '<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none"><rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg>' 
                                   : '<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none"><rect x="2" y="7" width="20" height="10" rx="2" ry="2"></rect><line x1="2" y1="12" x2="22" y2="12"></line></svg>';
              
              item.innerHTML = `
                  <div style="display: flex; align-items: center; gap: 1rem;">
                      <div style="color: ${isActive ? 'var(--accent-color)' : '#94a3b8'};">${icon}</div>
                      <div>
                          <div style="font-weight: 600; font-size: 0.9rem;">${t.name}</div>
                          <div style="font-size: 0.8rem; color: #64748b;">${t.l} x ${t.w} x ${t.h} мм, ${t.maxWeight} кг, ${((t.l*t.w*t.h)/1000000).toFixed(1)} м³</div>
                      </div>
                  </div>
                  <div style="display: flex; align-items: center; gap: 0.75rem;">
                      <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" style="cursor: pointer; color: #ef4444;" class="btn-del-t" title="Удалить"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                  </div>
              `;
              
              // Click on item to make it active
              item.addEventListener('click', (e) => {
                  if (e.target.closest('.btn-del-t')) return; // Don't activate on delete click
                  this.currentContainerKey = key;
                  this.currentContainer = t;
                  renderProjectTransports();
                  if (this.sceneObj) {
                      this.sceneObj.createContainer(t.w, t.h, t.l, key);
                  }
                  this.calculate();
              });
              
              const delBtn = item.querySelector('.btn-del-t');
              if(delBtn) {
                  delBtn.addEventListener('click', (e) => {
                      e.stopPropagation();
                      this.projectTransports.splice(index, 1);
                      
                      // If list is now empty
                      if (this.projectTransports.length === 0) {
                          this.currentContainerKey = null;
                          this.currentContainer = null;
                      }
                      // If we deleted the active one, switch to first (if any)
                      else if (key === this.currentContainerKey) {
                          this.currentContainerKey = this.projectTransports[0];
                          this.currentContainer = this.containerTypes[this.currentContainerKey];
                      }
                      
                      renderProjectTransports();
                      renderCatalog(); // To update the 'added' state of buttons
                      
                      if (this.sceneObj) {
                          if (this.currentContainer) {
                              this.sceneObj.createContainer(this.currentContainer.w, this.currentContainer.h, this.currentContainer.l, this.currentContainerKey);
                          } else {
                              this.sceneObj.createContainer(0, 0, 0, ''); // empty
                          }
                      }
                      this.calculate();
                  });
              }
              
              projectListContainer.appendChild(item);
          });
      };
      
      const renderCatalog = (filter = 'all') => {
          listContainer.innerHTML = '';
          for(const [key, t] of Object.entries(this.containerTypes)) {
              if(filter !== 'all' && t.type !== filter) continue;
              
              const alreadyAdded = this.projectTransports.includes(key);
              const item = document.createElement('div');
              item.className = 't-item-v2';
              
              const isTruck = t.type === 'truck';
              const icon = isTruck ? '<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none"><rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg>' 
                                   : '<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none"><rect x="2" y="7" width="20" height="10" rx="2" ry="2"></rect><line x1="2" y1="12" x2="22" y2="12"></line></svg>';
                                   
              item.innerHTML = `
                  <div class="t-item-v2-info">
                      <div class="t-item-v2-icon">${icon}</div>
                      <div>
                          <div style="font-weight: 600; font-size: 0.9rem;">${t.name}</div>
                          <div style="font-size: 0.8rem; color: #64748b;">${t.l} x ${t.w} x ${t.h} мм, ${t.maxWeight} кг, ${((t.l*t.w*t.h)/1000000).toFixed(1)} м³</div>
                      </div>
                  </div>
                  <button class="btn-add-t" style="background: none; border: none; color: ${alreadyAdded ? '#94a3b8' : 'var(--accent-color)'}; font-weight: 600; font-size: 0.85rem; cursor: pointer; display: flex; align-items: center; gap: 0.5rem;">
                      ${alreadyAdded ? '✓ добавлен' : 'добавить →'}
                  </button>
              `;
              
              if (!alreadyAdded) {
                  item.querySelector('.btn-add-t').addEventListener('click', () => {
                      this.projectTransports.push(key);
                      this.currentContainerKey = key;
                      this.currentContainer = t;
                      renderProjectTransports();
                      renderCatalog(filter); // Re-render to update "добавлен" status
                      if (this.sceneObj) {
                          this.sceneObj.createContainer(t.w, t.h, t.l, key);
                      }
                      this.calculate();
                  });
              }
              
              listContainer.appendChild(item);
          }
      };
      
      filterBtns.forEach(btn => {
          btn.addEventListener('click', () => {
              filterBtns.forEach(b => b.classList.remove('active'));
              btn.classList.add('active');
              renderCatalog(btn.getAttribute('data-filter'));
          });
      });
      
      renderProjectTransports();
      renderCatalog();
      
      // Init active info
      this.updateTransportInfoUI();
      
      const floorColorInput = document.getElementById('floor-color');
      const floorColorHex = document.getElementById('floor-color-hex');
      if (floorColorInput) {
        floorColorInput.addEventListener('input', (e) => {
          const color = e.target.value;
          if (floorColorHex) floorColorHex.innerText = color;
          if (this.sceneObj) {
            this.sceneObj.updateFloorColor(color);
          }
        });
      }
  }
  
  setTransport(key) {
      this.currentContainerKey = key;
      this.currentContainer = this.containerTypes[key];
      this.updateTransportInfoUI();
      if(this.sceneObj) {
          this.sceneObj.createContainer(this.currentContainer.w, this.currentContainer.h, this.currentContainer.l, key);
      }
      this.calculate(); // Auto recalculate on change
  }
  
  updateTransportInfoUI() {
      const t = this.currentContainer;
      if (!t) {
          const nameEl = document.getElementById('active-t-name');
          if (nameEl) nameEl.innerText = 'Не выбран';
          const dimEl = document.getElementById('active-t-dim');
          if (dimEl) dimEl.innerText = '—';
          const weightEl = document.getElementById('active-t-weight');
          if (weightEl) weightEl.innerText = '—';
          return;
      }
      
      const nameEl = document.getElementById('active-t-name');
      if (nameEl) nameEl.innerText = t.name;
      const dimEl = document.getElementById('active-t-dim');
      if (dimEl) dimEl.innerText = `${t.l} x ${t.w} x ${t.h} см`;
      const weightEl = document.getElementById('active-t-weight');
      if (weightEl) weightEl.innerText = `${t.maxWeight} кг`;
  }

  init() {
    this.presetSelect.addEventListener('change', (e) => {
      const preset = this.boxPresets[e.target.value];
      if (preset) {
        document.getElementById('cargo-name').value = preset.name;
        document.getElementById('cargo-l').value = preset.l;
        document.getElementById('cargo-w').value = preset.w;
        document.getElementById('cargo-h').value = preset.h;
        document.getElementById('cargo-weight').value = preset.weight;
      }
    });

    this.sceneObj.onCargoSelect = (cargoData) => {
      document.querySelectorAll('#cargo-table tbody tr').forEach(tr => {
        if (cargoData && tr.dataset.id === cargoData.id) {
          tr.classList.add('active');
        } else {
          tr.classList.remove('active');
        }
      });
    };

    this.sceneObj.onCargoClone = (cargoData) => {
      if (!cargoData || !cargoData.id) return;
      const item = this.cargoList.find(c => c.id === cargoData.id);
      if (item) {
        item.qty += 1;
        this.renderTable();
        
        const cloneData = { ...cargoData, isManual: true };
        cloneData.x += 10;
        cloneData.y += 10;
        
        this.sceneObj.spawnManualClone(cloneData);
        this.calculate();
      }
    };

    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.addCargo();
    });

    this.calcBtn.addEventListener('click', () => {
      this.calculate();
    });

    // Initial setup
    if (this.currentContainer) {
      this.sceneObj.createContainer(this.currentContainer.w, this.currentContainer.h, this.currentContainer.l, this.currentContainerKey);
    } else {
      this.sceneObj.createContainer(0, 0, 0, '');
    }
  }

  getRandomColor() {
    // Generate a pleasant pastel/corporate color instead of dark random colors
    const hue = Math.floor(Math.random() * 360);
    return `hsl(${hue}, 70%, 65%)`;
  }

  addCargo() {
    const name = document.getElementById('cargo-name').value;
    const qty = parseInt(document.getElementById('cargo-qty').value);
    const l = parseFloat(document.getElementById('cargo-l').value);
    const w = parseFloat(document.getElementById('cargo-w').value);
    const h = parseFloat(document.getElementById('cargo-h').value);
    const weight = parseFloat(document.getElementById('cargo-weight').value);
    const rotatable = document.getElementById('cargo-rotatable').checked;
    
    const color = this.getRandomColor();
    
    const itemInfo = {
      id: Date.now().toString(),
      name, qty, l, w, h, weight, rotatable, color
    };
    
    this.cargoList.push(itemInfo);
    this.renderTable();
    this.form.reset();
    document.getElementById('cargo-modal').classList.add('hidden');
  }

  removeCargo(id) {
    this.cargoList = this.cargoList.filter(c => c.id !== id);
    this.renderTable();
  }

  renderTable() {
    this.tableBody.innerHTML = '';
    const emptyMsg = document.getElementById('empty-cargo-msg');
    
    if (this.cargoList.length === 0) {
        if(emptyMsg) emptyMsg.style.display = 'flex';
        return;
    }
    
    if(emptyMsg) emptyMsg.style.display = 'none';

    this.cargoList.forEach(c => {
      const tr = document.createElement('tr');
      tr.dataset.id = c.id;
      tr.style.cursor = 'pointer';
      
      tr.innerHTML = `
        <td><div class="color-dot" style="background-color: ${c.color}"></div></td>
        <td><strong>${c.name}</strong></td>
        <td>${c.qty} шт</td>
        <td>${c.l} x ${c.w} x ${c.h}</td>
        <td>${c.weight} кг</td>
        <td>
           <button class="icon-btn delete-btn" data-id="${c.id}" title="Удалить">
              <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
           </button>
        </td>
      `;
      this.tableBody.appendChild(tr);
    });
    
    const btns = this.tableBody.querySelectorAll('.delete-btn');
    btns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.removeCargo(e.target.dataset.id);
      });
    });

    this.tableBody.querySelectorAll('tr').forEach(tr => {
      tr.addEventListener('click', (e) => {
        if (e.target.closest('.delete-btn')) return;
        
        document.querySelectorAll('#cargo-table tbody tr').forEach(r => r.classList.remove('active'));
        tr.classList.add('active');
        
        if (this.sceneObj && this.sceneObj.selectCargoById) {
          this.sceneObj.selectCargoById(tr.dataset.id);
          // Auto switch to scene view to see the selected cargo
          document.querySelector('.nav-btn[data-target="view-scene"]').click();
        }
      });
    });
  }

  calculate() {
    // Update Scene Right Sidebar Header
    const t = this.currentContainer;
    const tNameEl = document.getElementById('scene-t-name');
    const tDimEl = document.getElementById('scene-t-dim');
    
    if (!t) {
        if (tNameEl) tNameEl.innerText = 'Транспорт не выбран';
        if (tDimEl) tDimEl.innerText = '—';
        this.statVol.innerText = '0%';
        this.statWeight.innerText = '0 кг';
        this.statFree.innerText = '0 м³';
        if (this.sceneObj) this.sceneObj.drawCargo([], [], []); 
        return;
    }
    
    if (tNameEl) tNameEl.innerText = t.name;
    if (tDimEl) tDimEl.innerText = `${t.l} x ${t.w} x ${t.h} мм, ${t.maxWeight} кг, ${((t.l*t.w*t.h)/1000000).toFixed(1)} м³`;

    if (this.cargoList.length === 0) {
        // Draw empty truck
        this.sceneObj.drawCargo([], [], []); 
        this.statVol.innerText = '0%';
        this.statWeight.innerText = '0 кг';
        this.statFree.innerText = `${((t.l*t.w*t.h)/1000000).toFixed(1)} м³`;
        document.getElementById('scene-cargo-list').innerHTML = '';
        document.getElementById('cargo-total-count').innerText = '0 шт';
        return;
    }
    
    this.overlay.classList.remove('hidden');
    
    setTimeout(() => {
      try {
        const packer = new Packer(this.currentContainer.w, this.currentContainer.h, this.currentContainer.l);
        
        let totalWeight = 0;
        let totalCargoVolume = 0;
        
        const manualItems = [];
        const stagedItems = [];
        if (this.sceneObj && this.sceneObj.cargoGroup) {
            this.sceneObj.cargoGroup.children.forEach(mesh => {
              if (mesh.userData) {
                if (mesh.userData.isStaged) {
                  stagedItems.push({ ...mesh.userData });
                } else if (mesh.userData.isManual) {
                  manualItems.push({ ...mesh.userData });
                }
              }
            });
        }
        
        let targetTotalWeight = 0;
        let targetTotalVolume = 0;
        
        this.cargoList.forEach(c => {
          const manualCount = manualItems.filter(m => m.id === c.id).length;
          const stagedCount = stagedItems.filter(s => s.id === c.id).length;
          const remainingCount = Math.max(0, c.qty - manualCount - stagedCount);
          
          for(let i=0; i<remainingCount; i++) {
            packer.addItem({
              id: c.id, name: c.name, w: c.w, h: c.h, l: c.l,
              weight: c.weight, rotatable: c.rotatable, color: c.color
            });
          }
          
          targetTotalWeight += (c.weight * c.qty);
          targetTotalVolume += (c.w * c.h * c.l * c.qty);
        });
        
        const palletizeEl = document.getElementById('cargo-palletize');
        const usePallets = palletizeEl && palletizeEl.checked;
        const placedItems = packer.pack(manualItems, usePallets);
        
        let actualPackedWeight = 0;
        let actualPackedVolume = 0;

        placedItems.forEach(p => {
          if (p.packed || p.isManual) {
            actualPackedWeight += p.weight;
            actualPackedVolume += (p.w * p.h * p.l);
          }
        });

        if (usePallets && packer.pallets && packer.pallets.length > 0) {
          const palletWeight = 20; 
          actualPackedWeight += packer.pallets.length * palletWeight;
        }
        
        this.sceneObj.drawCargo(placedItems, packer.pallets || [], stagedItems);
        
        const cVol = this.currentContainer.w * this.currentContainer.h * this.currentContainer.l;
        const volPercent = (actualPackedVolume / cVol) * 100;
        const freeVolM3 = (cVol - actualPackedVolume) / 1000000;
        
        this.statVol.innerText = isNaN(volPercent) ? '0%' : volPercent.toFixed(1) + '%';
        this.statVol.style.color = volPercent > 90 ? 'var(--danger-color)' : 'var(--text-main)';
        
        this.statWeight.innerText = isNaN(actualPackedWeight) ? '0 кг' : actualPackedWeight.toFixed(1) + ' кг';
        this.statWeight.style.color = actualPackedWeight > this.currentContainer.maxWeight ? 'var(--danger-color)' : 'var(--text-main)';
        
        this.statFree.innerText = isNaN(freeVolM3) ? '0 м³' : freeVolM3.toFixed(2) + ' м³';
        
        const packedCount = placedItems.filter(p => p.packed).length;
        const totalExpectedToPack = packer.items.length + manualItems.length;
        if(packedCount < totalExpectedToPack) {
          alert(`Внимание! Умещено только ${packedCount} из ${totalExpectedToPack} коробок.`);
        }
        
        // Populate Right Sidebar cargo list
        const sceneCargoList = document.getElementById('scene-cargo-list');
        if (sceneCargoList) {
            sceneCargoList.innerHTML = '';
            document.getElementById('cargo-total-count').innerText = `${this.cargoList.reduce((acc, c) => acc + c.qty, 0)} шт`;
            
            this.cargoList.forEach(c => {
               const div = document.createElement('div');
               div.style.cssText = 'background: white; border: 1px solid var(--panel-border); border-radius: 8px; padding: 0.75rem; display: flex; align-items: flex-start; gap: 0.75rem;';
               div.innerHTML = `
                 <div style="width: 32px; height: 32px; border-radius: 50%; background: ${c.color || '#4ade80'}; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                    <svg viewBox="0 0 24 24" width="16" height="16" stroke="white" stroke-width="2" fill="none"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path></svg>
                 </div>
                 <div style="flex: 1; overflow: hidden;">
                    <div style="font-weight: 600; font-size: 0.85rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${c.name}</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted);">${c.l} x ${c.w} x ${c.h} мм, ${c.weight} кг, ${c.qty} шт</div>
                    <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem; color: #94a3b8;">
                       <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" style="cursor: pointer;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                       <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" style="cursor: pointer;"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>
                    </div>
                 </div>
               `;
               sceneCargoList.appendChild(div);
            });
        }
        
        this.overlay.classList.add('hidden');
      } catch (err) {
        const debug = document.getElementById('debug-overlay');
        if (debug) {
            debug.style.display = 'block';
            debug.innerText = 'ERROR: ' + err.message + '\n' + err.stack;
        }
        this.overlay.classList.add('hidden');
        console.error(err);
      }
    }, 100);
  }
}
