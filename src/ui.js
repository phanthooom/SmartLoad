import { Packer } from './packer.js';

export class UI {
  constructor(sceneObj) {
    this.sceneObj = sceneObj;
    this.cargoList = [];
    this.containerTypes = {
      '10ft': { w: 235.2, h: 239.3, l: 283.1, maxWeight: 10000 },
      '20ft': { w: 235.2, h: 239.3, l: 589.8, maxWeight: 28200 },
      '40ft_std': { w: 235.2, h: 239.3, l: 1203.2, maxWeight: 28800 },
      '40ft': { w: 235.2, h: 269.8, l: 1203.2, maxWeight: 28800 },
      '45ft_hc': { w: 235.2, h: 269.8, l: 1355.6, maxWeight: 29600 },
      'truck': { w: 245.0, h: 270.0, l: 1360.0, maxWeight: 24000 },
      'eurotrailer': { w: 248.0, h: 298.0, l: 1362.0, maxWeight: 22000 },
      'refrigerator': { w: 249.0, h: 260.0, l: 1336.0, maxWeight: 22000 },
      'isotherm': { w: 248.0, h: 270.0, l: 1362.0, maxWeight: 22000 },
      'euro_82': { w: 245.0, h: 245.0, l: 1360.0, maxWeight: 22000 },
      'euro_86': { w: 245.0, h: 260.0, l: 1360.0, maxWeight: 22000 },
      'euro_90': { w: 245.0, h: 270.0, l: 1360.0, maxWeight: 24000 },
      'euro_92': { w: 245.0, h: 280.0, l: 1360.0, maxWeight: 24000 },
      'euro_96': { w: 245.0, h: 290.0, l: 1360.0, maxWeight: 24000 },
      'mega_100': { w: 245.0, h: 300.0, l: 1360.0, maxWeight: 24000 },
      'gazelle': { w: 190.0, h: 190.0, l: 320.0, maxWeight: 1500 },
      'truck_3t': { w: 220.0, h: 220.0, l: 400.0, maxWeight: 3000 },
      'truck_5t': { w: 245.0, h: 240.0, l: 600.0, maxWeight: 5000 },
      'truck_10t': { w: 245.0, h: 250.0, l: 750.0, maxWeight: 10000 }
    };
    this.currentContainer = this.containerTypes['20ft'];
    
    this.boxPresets = {
      'box-s': { name: 'Коробка S', l: 30, w: 20, h: 15, weight: 2 },
      'box-m': { name: 'Коробка M', l: 40, w: 30, h: 20, weight: 5 },
      'box-l': { name: 'Коробка L', l: 60, w: 40, h: 40, weight: 15 },
      'euro': { name: 'Европаллета', l: 120, w: 80, h: 15, weight: 25 },
    };
    
    // UI Elements
    const typeSelect = document.getElementById('container-type');
    typeSelect.addEventListener('change', (e) => {
      this.updateContainerInfo(e.target.value);
    });

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

    const presetSelect = document.getElementById('box-preset');
    this.containerSelect = document.getElementById('container-type');
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
            // Check password on 4th digit
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
    
    // Focus first box
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
      // Remove shake class after animation completes
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

    // Sidebar Toggle
    document.getElementById('sidebar-toggle').addEventListener('click', () => {
      document.getElementById('sidebar').classList.toggle('closed');
      document.getElementById('app').classList.toggle('sidebar-closed');
    });

    this.containerSelect.addEventListener('change', (e) => {
      this.currentContainer = this.containerTypes[e.target.value];
      this.updateContainerInfo();
      this.sceneObj.createContainer(this.currentContainer.w, this.currentContainer.h, this.currentContainer.l, e.target.value);
    });

    this.sceneObj.onCargoSelect = (cargoData) => {
      document.querySelectorAll('#cargo-table tbody tr').forEach(tr => {
        if (cargoData && tr.dataset.id === cargoData.id) {
          tr.style.backgroundColor = 'rgba(59, 130, 246, 0.4)';
        } else {
          tr.style.backgroundColor = '';
        }
      });
    };

    this.sceneObj.onCargoClone = (cargoData) => {
      if (!cargoData || !cargoData.id) return;
      const item = this.cargoList.find(c => c.id === cargoData.id);
      if (item) {
        item.qty += 1;
        this.renderTable();
        
        // Inject a manual clone directly into the scene
        const cloneData = { ...cargoData, isManual: true };
        // Offset slightly
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
    this.updateContainerInfo();
    this.sceneObj.createContainer(this.currentContainer.w, this.currentContainer.h, this.currentContainer.l, this.containerSelect.value);
  }

  updateContainerInfo() {
    document.getElementById('c-length').innerText = this.currentContainer.l.toFixed(1);
    document.getElementById('c-width').innerText = this.currentContainer.w.toFixed(1);
    document.getElementById('c-height').innerText = this.currentContainer.h.toFixed(1);
    document.getElementById('c-weight').innerText = this.currentContainer.maxWeight;
  }

  getRandomColor() {
    const letters = '6789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
      color += letters[Math.floor(Math.random() * 10)];
    }
    return color;
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
  }

  removeCargo(id) {
    this.cargoList = this.cargoList.filter(c => c.id !== id);
    this.renderTable();
  }

  renderTable() {
    this.tableBody.innerHTML = '';
    this.cargoList.forEach(c => {
      const tr = document.createElement('tr');
      tr.dataset.id = c.id;
      tr.style.cursor = 'pointer'; // Make row look clickable
      
      tr.innerHTML = `
        <td><div class="color-dot" style="background-color: ${c.color}"></div></td>
        <td>${c.name}</td>
        <td>${c.qty}</td>
        <td>${c.l}x${c.w}x${c.h}</td>
        <td><button class="delete-btn" data-id="${c.id}">×</button></td>
      `;
      this.tableBody.appendChild(tr);
    });
    
    const btns = this.tableBody.querySelectorAll('.delete-btn');
    btns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent triggering row click
        this.removeCargo(e.target.dataset.id);
      });
    });

    // Add click event for selecting cargo in 3D
    this.tableBody.querySelectorAll('tr').forEach(tr => {
      tr.addEventListener('click', (e) => {
        if (e.target.closest('.delete-btn')) return;
        
        document.querySelectorAll('#cargo-table tbody tr').forEach(r => {
          r.style.backgroundColor = '';
        });
        tr.style.backgroundColor = 'rgba(59, 130, 246, 0.4)';
        
        if (this.sceneObj && this.sceneObj.selectCargoById) {
          this.sceneObj.selectCargoById(tr.dataset.id);
        }
      });
    });
  }

  calculate() {
    if (this.cargoList.length === 0) return;
    
    this.overlay.classList.remove('hidden');
    
    // Run in timeout to let UI update (overlay show)
    setTimeout(() => {
      try {
        const packer = new Packer(this.currentContainer.w, this.currentContainer.h, this.currentContainer.l);
        
        let totalWeight = 0;
        let totalCargoVolume = 0;
        
        const manualItems = [];
        const stagedItems = [];
        this.sceneObj.cargoGroup.children.forEach(mesh => {
          if (mesh.userData) {
            if (mesh.userData.isStaged) {
              stagedItems.push({ ...mesh.userData });
            } else if (mesh.userData.isManual) {
              manualItems.push({ ...mesh.userData });
            }
          }
        });
        
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
        
        const usePallets = document.getElementById('cargo-palletize') && document.getElementById('cargo-palletize').checked;
        const placedItems = packer.pack(manualItems, usePallets);
        
        let actualPackedWeight = 0;
        let actualPackedVolume = 0;

        placedItems.forEach(p => {
          if (p.packed) {
            actualPackedWeight += p.weight;
            actualPackedVolume += (p.w * p.h * p.l);
          }
        });

        // Add weight/volume for pallets
        if (usePallets && packer.pallets.length > 0) {
          const palletWeight = 20; // 20kg per pallet
          actualPackedWeight += packer.pallets.length * palletWeight;
        }
        
        this.sceneObj.drawCargo(placedItems, packer.pallets || [], stagedItems);
        
        const packedCount = placedItems.filter(p => p.packed).length;
        
        // Calculate Stats (Based on what is ACTUALLY inside the truck)
        const cVol = this.currentContainer.w * this.currentContainer.h * this.currentContainer.l;
        const volPercent = (actualPackedVolume / cVol) * 100;
        const freeVolM3 = (cVol - actualPackedVolume) / 1000000; // cm3 to m3
        
        this.statVol.innerText = isNaN(volPercent) ? '0%' : volPercent.toFixed(1) + '%';
        this.statWeight.innerText = isNaN(actualPackedWeight) ? '0 кг' : actualPackedWeight.toFixed(1) + ' кг';


        
        if (volPercent > 100) {
          this.statVol.style.color = 'var(--danger-color)';
          this.statFree.innerText = "ПЕРЕГРУЗ!";
        } else {
          this.statVol.style.color = '#60a5fa';
          this.statFree.innerText = isNaN(freeVolM3) ? '0 м³' : freeVolM3.toFixed(2) + ' м³';
        }

        if (actualPackedWeight > this.currentContainer.maxWeight) {
          this.statWeight.style.color = 'var(--danger-color)';
        } else {
          this.statWeight.style.color = '#60a5fa';
        }

        const totalExpectedToPack = packer.items.length + manualItems.length;
        if(packedCount < totalExpectedToPack) {
          // Only alert if there are actually items that failed to pack,
          // ignoring the ones intentionally staged on the floor.
          alert(`Внимание! Умещено только ${packedCount} из ${totalExpectedToPack} коробок, отправленных на погрузку.`);
        }
        
        this.overlay.classList.add('hidden');
      } catch (err) {
        const debug = document.getElementById('debug-overlay');
        if (debug) debug.innerText = 'ERROR: ' + err.message + '\n' + err.stack;
        this.overlay.classList.add('hidden');
        console.error(err);
      }
    }, 100);
  }
}
