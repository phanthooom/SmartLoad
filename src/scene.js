import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';

let cachedTruckGeometry = null;

export class CargoScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf0f2f5); // light gray background
    this.scene.fog = new THREE.Fog(0xf0f2f5, 15, 80);

    const gridHelper = new THREE.GridHelper(200, 200, 0xffffff, 0xffffff);
    gridHelper.position.y = -1.0;
    this.scene.add(gridHelper);
    
    const w = canvas.clientWidth || 800;
    const h = canvas.clientHeight || 600;
    
    this.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000);
    this.camera.position.set(8, 5, 8);
    
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.addEventListener('change', () => this.requestRender());

    this.setupLighting();
    
    this.cargoGroup = new THREE.Group();
    this.scene.add(this.cargoGroup);
    
    this.containerGroup = new THREE.Group();
    this.scene.add(this.containerGroup);

    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.pointer = new THREE.Vector2();
    this.selectedMesh = null;
    
    // Performance: caches and render-on-demand
    this._geoCache = {};
    this._matCache = {};
    this._texCache = {};
    this._renderScheduled = false;
    this.currentToolMode = 'translate';

    
    // Watch sidebar class changes to trigger render
    const appEl = document.getElementById('app');
    if (appEl) {
      new MutationObserver(() => this.requestRender()).observe(appEl, { attributes: true, attributeFilter: ['class'] });
    }
    
    window.addEventListener('resize', this.onWindowResize.bind(this));
    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown.bind(this));
    this.renderer.domElement.addEventListener('pointermove', this.onPointerMove.bind(this));
    this.renderer.domElement.addEventListener('pointerup', this.onPointerUp.bind(this));

    // Use ResizeObserver for responsive canvas updates during CSS transitions
    const resizeObserver = new ResizeObserver(() => {
      this.onWindowResize();
    });
    resizeObserver.observe(this.canvas.parentElement);
    this.currentViewOffset = 0;
    this.controls.minDistance = 0.5;
    this.controls.maxDistance = 100;

    // Custom trackpad panning logic
    this.renderer.domElement.addEventListener('wheel', (e) => {
      // Heuristic to detect standard physical mouse wheel vs smooth trackpad scroll
      const isMouseWheel = Math.abs(e.deltaY) >= 50 && e.deltaX === 0 && Number.isInteger(e.deltaY);
      
      // If it's a physical mouse wheel or a pinch-to-zoom (ctrlKey), let OrbitControls handle zoom
      if (isMouseWheel || e.ctrlKey) {
        return;
      }
      
      // It's a trackpad two-finger swipe - intercept and PAN
      e.stopPropagation();
      e.preventDefault();
      
      const distance = this.camera.position.distanceTo(this.controls.target);
      const fov = this.camera.fov * Math.PI / 180;
      const height = this.renderer.domElement.clientHeight;
      // Calculate scale to perfectly match pixel movement to world coordinates
      const scale = (2 * Math.tan(fov / 2) * distance) / height;
      
      const panX = e.deltaX * scale;
      const panY = e.deltaY * scale;
      
      const te = this.camera.matrixWorld.elements;
      const cameraRight = new THREE.Vector3(te[0], te[1], te[2]);
      const cameraUp = new THREE.Vector3(te[4], te[5], te[6]);
      
      const offset = new THREE.Vector3();
      offset.copy(cameraRight).multiplyScalar(panX);
      offset.add(cameraUp.multiplyScalar(-panY)); // scroll down moves camera up, so scene moves down
      
      this.camera.position.add(offset);
      this.controls.target.add(offset);
      this.controls.update();
    }, { passive: false, capture: true });

    this.transformControl = new TransformControls(this.camera, this.renderer.domElement);
    this.transformControl.addEventListener('change', () => this.requestRender());
    this.transformControl.addEventListener('dragging-changed', (event) => {
      this.controls.enabled = !event.value;
    });
    this.scene.add(this.transformControl.getHelper());
    this.transformControl.addEventListener('change', () => {
      const debug = document.getElementById('debug-overlay');
      if (this.selectedMesh) {
        // Prevent NaN or extreme positions if TransformControls bugs out
        const posX = this.selectedMesh.position.x;
        const posY = this.selectedMesh.position.y;
        const posZ = this.selectedMesh.position.z;
        
        const p = this.selectedMesh.userData;
        const w = p.w / 100;
        const h = p.h / 100;
        const l = p.l / 100;

        if (isNaN(posX) || isNaN(posY) || isNaN(posZ) || Math.abs(posX) > 1000 || Math.abs(posY) > 1000 || Math.abs(posZ) > 1000) {
          if (debug) debug.innerText = `ERROR: Invalid Pos: ${posX}, ${posY}, ${posZ}`;
          this.selectedMesh.position.set(p.x/100 + w/2, p.y/100 + h/2, p.z/100 + l/2);
          return;
        }

        const isOutside = (
          posX - w/2 < -0.1 || posX + w/2 > (this.containerW / 100) + 0.1 ||
          posZ - l/2 < -0.1 || posZ + l/2 > (this.containerL / 100) + 0.1
        );

        if (isOutside) {
          this.selectedMesh.position.y = -1.0 + h / 2; // Snap to ground
          this.selectedMesh.userData.isStaged = true;
          this.selectedMesh.userData.isManual = false;
        } else {
          this.selectedMesh.userData.isStaged = false;
          this.selectedMesh.userData.isManual = true;
        }
        
        p.x = (this.selectedMesh.position.x - w/2) * 100;
        p.y = (this.selectedMesh.position.y - h/2) * 100;
        p.z = (this.selectedMesh.position.z - l/2) * 100;
        
        if (debug) debug.innerText = `Pos: ${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)} [Staged: ${p.isStaged}]`;
      }
    });

    // Keyboard shortcuts for TransformControls
    window.addEventListener('keydown', (event) => {
      const debug = document.getElementById('debug-overlay');
      if (debug) debug.innerText = `Keydown: ${event.key}`;
      if (!this.selectedMesh) {
        if (debug) debug.innerText += `\nNo mesh selected`;
        return;
      }
      switch(event.key.toLowerCase()) {
        case 't': 
          if(this.onToolChange) this.onToolChange('translate');
          else this.setToolMode('translate'); 
          break;
        case 'r': 
          if(this.onToolChange) this.onToolChange('rotate');
          else this.setToolMode('rotate'); 
          break;
        case 'c': 
          if (this.onCargoClone) this.onCargoClone(this.selectedMesh.userData);
          break;
        case 'escape': 
          if(this.onToolChange) this.onToolChange('select');
          else this.setToolMode('select');
          break;
        case 'delete':
        case 'backspace':
          this.deleteSelected();
          break;
      }
    });

    this.renderer.domElement.addEventListener('dblclick', this.onDoubleClick.bind(this));

    this.requestRender(); // Initial render
  }

  setToolMode(mode) {
    this.currentToolMode = mode;
    if (mode === 'translate' || mode === 'rotate') {
      this.transformControl.setMode(mode);
      if (this.selectedMesh) {
        try {
          this.transformControl.attach(this.selectedMesh);
        } catch(e) {}
      }
    } else {
      this.transformControl.detach();
      if (mode === 'select' && this.selectedMesh) {
          // Just keep it selected but remove gizmo
      }
    }
  }

  deleteSelected() {
    if (this.selectedMesh) {
      if (this.onCargoDelete) {
        this.onCargoDelete(this.selectedMesh.userData);
      }
      this.transformControl.detach();
      if (Array.isArray(this.selectedMesh.material)) {
        this.selectedMesh.material.forEach(m => m.emissive.setHex(0x000000));
      }
      this.selectedMesh = null;
      this.setFocusMode(false);
      this.resetCameraTarget();
      if (this.onCargoSelect) this.onCargoSelect(null);
      this.requestRender();
    }
  }

  onDoubleClick(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointer, this.camera);
    const intersects = this.raycaster.intersectObjects(this.cargoGroup.children, true);

    if (intersects.length > 0) {
      const mesh = intersects[0].object;
      
      if (this.zoomedMesh === mesh) {
        // Кликнули на ту же коробку — зум аут (возврат)
        this.targetCameraPos = new THREE.Vector3(8, 5, 8);
        this.targetControlsCenter = new THREE.Vector3(0, 0, 0);
        this.zoomedMesh = null;
      } else {
        // Кликнули на новую коробку — зум ин
        const targetPos = new THREE.Vector3();
        mesh.getWorldPosition(targetPos);
        
        const offset = new THREE.Vector3(2, 2, 2); 
        this.targetCameraPos = targetPos.clone().add(offset);
        this.targetControlsCenter = targetPos.clone();
        this.zoomedMesh = mesh;
      }
    } else {
      // Кликнули в пустоту — зум аут
      this.targetCameraPos = new THREE.Vector3(8, 5, 8);
      this.targetControlsCenter = new THREE.Vector3(0, 0, 0);
      this.zoomedMesh = null;
    }
    this.requestRender();
  }

  onPointerDown(event) {
    const debug = document.getElementById('debug-overlay');
    if (debug) debug.innerText = `Pointer down at ${event.clientX}, ${event.clientY}`;

    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // Check if clicking on TransformControls
    if (this.transformControl.dragging) return;

    this.raycaster.setFromCamera(this.pointer, this.camera);
    const intersects = this.raycaster.intersectObjects(this.cargoGroup.children, true);
    
    if (event.shiftKey && intersects.length > 0) {
      this.draggedMesh = intersects[0].object;
      this.controls.enabled = false;
      
      // We want to drag on the XZ plane at the object's current Y height
      this.dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.draggedMesh.position.y);
      const intersectPoint = new THREE.Vector3();
      this.raycaster.ray.intersectPlane(this.dragPlane, intersectPoint);
      
      this.dragOffset = new THREE.Vector3().copy(this.draggedMesh.position).sub(intersectPoint);
      
      // Also select it if not selected
      if (this.selectedMesh !== this.draggedMesh) {
         this.selectCargoById(this.draggedMesh.userData.id, false);
      }
      return; 
    }

    if (intersects.length > 0) {
      if (debug) debug.innerText += `\nHit: ${intersects[0].object.userData.name}`;
      
      if (this.selectedMesh !== intersects[0].object) {
        if (this.selectedMesh) {
          if (Array.isArray(this.selectedMesh.material)) {
            this.selectedMesh.material.forEach(m => m.emissive.setHex(0x000000));
          }
        }
        
        this.selectedMesh = intersects[0].object;
        if (Array.isArray(this.selectedMesh.material)) {
          this.selectedMesh.material.forEach(m => m.emissive.setHex(0x444444));
        }
        
        if (this.currentToolMode === 'translate' || this.currentToolMode === 'rotate') {
          try {
            this.transformControl.attach(this.selectedMesh);
          } catch(e) {
            console.error("Attach error", e);
          }
        }
        
        this.setFocusMode(true);
        this.zoomToMesh(this.selectedMesh, false); // Update target without moving camera closer
        if (this.onCargoSelect) this.onCargoSelect(this.selectedMesh.userData);
      }
    } else {
      if (this.selectedMesh) {
        if (Array.isArray(this.selectedMesh.material)) {
          this.selectedMesh.material.forEach(m => m.emissive.setHex(0x000000));
        }
        this.selectedMesh = null;
        this.transformControl.detach();
        this.setFocusMode(false);
        this.resetCameraTarget();
        if (this.onCargoSelect) this.onCargoSelect(null);
      }
    }
  }

  onPointerMove(event) {
    if (this.draggedMesh && this.dragPlane) {
      const rect = this.renderer.domElement.getBoundingClientRect();
      this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const intersectPoint = new THREE.Vector3();
      if (this.raycaster.ray.intersectPlane(this.dragPlane, intersectPoint)) {
        this.draggedMesh.position.copy(intersectPoint.add(this.dragOffset));
        this.requestRender();
      }
    }
  }

  onPointerUp(event) {
    if (this.draggedMesh) {
      this.draggedMesh = null;
      this.controls.enabled = true;
    }
  }

  resetCameraTarget() {
    if (this.containerW && this.containerH && this.containerL) {
      const targetPos = new THREE.Vector3(
        this.containerW / 200,
        this.containerH / 200,
        this.containerL / 200
      );
      
      const startTarget = this.controls.target.clone();
      let progress = 0;
      const animateReset = () => {
        progress += 0.05;
        if (progress <= 1) {
          const ease = 1 - Math.pow(1 - progress, 3);
          this.controls.target.lerpVectors(startTarget, targetPos, ease);
          this.controls.update();
          requestAnimationFrame(animateReset);
        } else {
          this.controls.target.copy(targetPos);
          this.controls.update();
        }
      };
      animateReset();
    }
  }

  selectCargoById(id, moveCamera = true) {
    let targetMesh = null;
    for (const mesh of this.cargoGroup.children) {
      if (mesh.userData && mesh.userData.id === id) {
        targetMesh = mesh;
        break; // Select the first one found
      }
    }

    if (targetMesh) {
      if (this.selectedMesh !== targetMesh) {
        if (this.selectedMesh && Array.isArray(this.selectedMesh.material)) {
          this.selectedMesh.material.forEach(m => m.emissive.setHex(0x000000));
        }
        
        this.selectedMesh = targetMesh;
        if (Array.isArray(this.selectedMesh.material)) {
          this.selectedMesh.material.forEach(m => m.emissive.setHex(0x444444));
        }
        
        if (this.currentToolMode === 'translate' || this.currentToolMode === 'rotate') {
          try {
            this.transformControl.attach(this.selectedMesh);
          } catch(e) {
            console.error("Attach error", e);
          }
        }
        
        this.setFocusMode(true);
      }
      
      this.zoomToMesh(this.selectedMesh, moveCamera);
    }
  }

  zoomToMesh(mesh, moveCamera = true) {
    const targetPos = new THREE.Vector3();
    mesh.getWorldPosition(targetPos);
    
    // Smart distance calculation based on object size
    mesh.geometry.computeBoundingBox();
    const bbox = mesh.geometry.boundingBox;
    const size = new THREE.Vector3();
    bbox.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    
    // Calculate a comfortable distance (at least 1.5m away for context)
    const dist = Math.max(maxDim * 3, 1.5); 
    
    // Approach from current camera direction
    const currentDir = new THREE.Vector3().subVectors(this.camera.position, this.controls.target).normalize();
    if (currentDir.lengthSq() < 0.01) {
      currentDir.set(1, 1, 1).normalize();
    }
    
    const targetCamPos = targetPos.clone().add(currentDir.multiplyScalar(dist));
    
    const startCamPos = this.camera.position.clone();
    const startTarget = this.controls.target.clone();
    
    let progress = 0;
    const animateZoom = () => {
      progress += 0.05; // 20 frames animation
      if (progress <= 1) {
        // Easing function (easeOutCubic)
        const ease = 1 - Math.pow(1 - progress, 3);
        
        if (moveCamera) {
          this.camera.position.lerpVectors(startCamPos, targetCamPos, ease);
        }
        this.controls.target.lerpVectors(startTarget, targetPos, ease);
        this.controls.update();
        
        requestAnimationFrame(animateZoom);
      } else {
        // Ensure final position is exact
        if (moveCamera) {
          this.camera.position.copy(targetCamPos);
        }
        this.controls.target.copy(targetPos);
        this.controls.update();
      }
    };
    
    animateZoom();
  }

  setFocusMode(active) {
    this.cargoGroup.children.forEach(mesh => {
      const isSelected = (mesh === this.selectedMesh);
      const targetOpacity = (active && !isSelected) ? 0.2 : 1.0;
      const isTransparent = (active && !isSelected);
      
      const updateMat = (m) => {
        m.transparent = isTransparent;
        m.opacity = targetOpacity;
        m.needsUpdate = true;
      };

      if (mesh.material) {
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach(updateMat);
        } else {
          updateMat(mesh.material);
        }
      }
      
      // Update edges (LineSegments)
      mesh.children.forEach(child => {
        if (child.isLineSegments && child.material) {
          child.material.transparent = isTransparent;
          child.material.opacity = (active && !isSelected) ? 0.1 : 1.0;
          child.material.needsUpdate = true;
        }
      });
    });
    this.requestRender();
  }

  setupLighting() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(10, 20, 10);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.camera.near = 0.1;
    dirLight.shadow.camera.far = 50;
    dirLight.shadow.camera.left = -10;
    dirLight.shadow.camera.right = 10;
    dirLight.shadow.camera.top = 10;
    dirLight.shadow.camera.bottom = -10;
    this.scene.add(dirLight);
  }

  createWoodTexture(baseColor = '#8B5A2B') {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 200; i++) {
      ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.1})`;
      ctx.fillRect(0, Math.random() * 512, 512, 2);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(4, 10);
    return texture;
  }

  updateFloorColor(colorHex) {
    this.floorColor = colorHex;
    const floor = this.containerGroup.children.find(c => c.geometry && c.geometry.type === 'BoxGeometry' && c.position.y < 0);
    if (floor && floor.material) {
      if (floor.material.map) floor.material.map.dispose();
      floor.material.map = this.createWoodTexture(this.floorColor);
      floor.material.needsUpdate = true;
    }
  }

  createCorrugatedTextures(colorHex) {
    const diffCanvas = document.createElement('canvas');
    diffCanvas.width = 512;
    diffCanvas.height = 512;
    const diffCtx = diffCanvas.getContext('2d');
    
    diffCtx.fillStyle = colorHex;
    diffCtx.fillRect(0, 0, 512, 512);
    
    const normCanvas = document.createElement('canvas');
    normCanvas.width = 512;
    normCanvas.height = 512;
    const normCtx = normCanvas.getContext('2d');
    
    for (let x = 0; x < 512; x++) {
      const wave = Math.sin((x / 512) * Math.PI * 2 * 14);
      if (wave > 0) diffCtx.fillStyle = `rgba(255,255,255,${wave * 0.15})`;
      else diffCtx.fillStyle = `rgba(0,0,0,${-wave * 0.25})`;
      diffCtx.fillRect(x, 0, 1, 512);

      const dx = Math.cos((x / 512) * Math.PI * 2 * 14);
      const r = Math.floor((dx + 1) * 127.5);
      normCtx.fillStyle = `rgb(${r}, 128, 255)`;
      normCtx.fillRect(x, 0, 1, 512);
    }
    
    const diffTex = new THREE.CanvasTexture(diffCanvas);
    diffTex.wrapS = THREE.RepeatWrapping;
    diffTex.wrapT = THREE.RepeatWrapping;
    
    const normTex = new THREE.CanvasTexture(normCanvas);
    normTex.wrapS = THREE.RepeatWrapping;
    normTex.wrapT = THREE.RepeatWrapping;
    
    return { diffuse: diffTex, normal: normTex };
  }

  disposeGroup(group) {
    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);
      
      // Recurse into children (e.g., edges on cargo meshes)
      if (child.children && child.children.length > 0) {
        this.disposeGroup(child);
      }
      
      // Skip cached geometries — they'll be reused
      if (child.geometry && !this._isCachedGeo(child.geometry)) {
        child.geometry.dispose();
      }
      
      // Skip cached materials — they'll be reused
      if (child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach(mat => {
          if (this._isCachedMat(mat)) return;
          if (mat.map && !this._isCachedTex(mat.map)) mat.map.dispose();
          if (mat.normalMap) mat.normalMap.dispose();
          mat.dispose();
        });
      }
    }
  }
  
  _isCachedGeo(geo) {
    for (const key in this._geoCache) {
      if (this._geoCache[key] === geo) return true;
    }
    return false;
  }
  
  _isCachedMat(mat) {
    for (const key in this._matCache) {
      const cached = this._matCache[key];
      if (Array.isArray(cached)) {
        if (cached.includes(mat)) return true;
      } else if (cached === mat) return true;
    }
    if (this._palletMat === mat) return true;
    return false;
  }
  
  _isCachedTex(tex) {
    for (const key in this._texCache) {
      if (this._texCache[key] === tex) return true;
    }
    return false;
  }

  createContainer(w, h, l, type = '') {
    console.log("createContainer called with:", w, h, l, type);
    this.containerW = w;
    this.containerH = h;
    this.containerL = l;

    this.disposeGroup(this.containerGroup);
    
    if (!w || !h || !l) {
      console.warn("createContainer aborting: w, h, or l is 0 or undefined");
      return;
    }
    
    const sx = w / 100;
    const sy = h / 100;
    const sz = l / 100;

    // прицеп (прозрачный белый бокс как в ДжетЛоадер)
    const trailerGeo = new THREE.BoxGeometry(sx, sy, sz);
    const trailerMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.1, side: THREE.DoubleSide
    });
    const floorMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: false, side: THREE.DoubleSide
    });
    const invisibleMat = new THREE.MeshBasicMaterial({ visible: false });
    // Materials: +x, -x, +y, -y, +z (front), -z (back)
    const trailerMaterials = [
      trailerMat, trailerMat, trailerMat, floorMat, trailerMat, invisibleMat
    ];
    const trailer = new THREE.Mesh(trailerGeo, trailerMaterials);
    trailer.position.set(sx/2, sy/2, sz/2);
    trailer.raycast = () => {};
    this.containerGroup.add(trailer);

    // Добавляем чуть приоткрытые двери сзади (Z=0)
    const doorGeoL = new THREE.PlaneGeometry(sx/2, sy);
    doorGeoL.translate(sx/4, 0, 0); // hinge at X=0
    const doorL = new THREE.Mesh(doorGeoL, trailerMat);
    doorL.position.set(0, sy/2, 0);
    doorL.rotation.y = Math.PI / 16; // slightly open outwards
    
    const doorGeoR = new THREE.PlaneGeometry(sx/2, sy);
    doorGeoR.translate(-sx/4, 0, 0); // hinge at X=sx
    const doorR = new THREE.Mesh(doorGeoR, trailerMat);
    doorR.position.set(sx, sy/2, 0);
    doorR.rotation.y = -Math.PI / 16;
    
    const doorEdgesMat = new THREE.LineBasicMaterial({ color: 0x000000 });
    doorL.add(new THREE.LineSegments(new THREE.EdgesGeometry(doorGeoL), doorEdgesMat));
    doorR.add(new THREE.LineSegments(new THREE.EdgesGeometry(doorGeoR), doorEdgesMat));
    
    this.containerGroup.add(doorL);
    this.containerGroup.add(doorR);

    // Колеса прицепа (Сдвоенные, в стиле STL тягача)
    const wRadius = 0.5;
    const wThickness = 0.2; // толщина одного ската
    const wheelMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xcccccc });
    const wEdgeMat = new THREE.LineBasicMaterial({ color: 0x666666 });

    const createSingleTire = () => {
        const group = new THREE.Group();
        
        // Шина
        const tireGeo = new THREE.CylinderGeometry(wRadius, wRadius, wThickness, 32);
        tireGeo.rotateZ(Math.PI / 2);
        const tire = new THREE.Mesh(tireGeo, wheelMat);
        tire.add(new THREE.LineSegments(new THREE.EdgesGeometry(tireGeo, 15), wEdgeMat));
        group.add(tire);
        
        // Внешний обод диска (чуть выпирает для контура)
        const rimOuterGeo = new THREE.CylinderGeometry(wRadius * 0.75, wRadius * 0.75, wThickness + 0.002, 32);
        rimOuterGeo.rotateZ(Math.PI / 2);
        const rimOuter = new THREE.Mesh(rimOuterGeo, wheelMat);
        rimOuter.add(new THREE.LineSegments(new THREE.EdgesGeometry(rimOuterGeo, 15), wEdgeMat));
        group.add(rimOuter);

        // Внутренняя часть диска (чуть утоплена)
        const rimInnerGeo = new THREE.CylinderGeometry(wRadius * 0.5, wRadius * 0.5, wThickness - 0.002, 32);
        rimInnerGeo.rotateZ(Math.PI / 2);
        const rimInner = new THREE.Mesh(rimInnerGeo, wheelMat);
        rimInner.add(new THREE.LineSegments(new THREE.EdgesGeometry(rimInnerGeo, 15), wEdgeMat));
        group.add(rimInner);

        // Ступица (выпирает)
        const hubGeo = new THREE.CylinderGeometry(wRadius * 0.25, wRadius * 0.25, wThickness + 0.004, 16);
        hubGeo.rotateZ(Math.PI / 2);
        const hub = new THREE.Mesh(hubGeo, wheelMat);
        hub.add(new THREE.LineSegments(new THREE.EdgesGeometry(hubGeo, 15), wEdgeMat));
        group.add(hub);

        return group;
    };

    const wheelY = -0.5; // touches Y=0 and Y=-1.0
    const spacing = 0.22; // расстояние между сдвоенными колесами

    for (let i = 0; i < 3; i++) {
      const zPos = 1.5 + i * 1.5;
      
      // Левая сторона (внешнее и внутреннее)
      const lo = createSingleTire();
      lo.position.set(0.1, wheelY, zPos);
      this.containerGroup.add(lo);
      
      const li = createSingleTire();
      li.position.set(0.1 + spacing, wheelY, zPos);
      this.containerGroup.add(li);
      
      // Правая сторона (внешнее и внутреннее)
      const ro = createSingleTire();
      ro.position.set(sx - 0.1, wheelY, zPos);
      this.containerGroup.add(ro);
      
      const ri = createSingleTire();
      ri.position.set(sx - 0.1 - spacing, wheelY, zPos);
      this.containerGroup.add(ri);
    }

    // тонкие грани прицепа
    const edgesGeo = new THREE.EdgesGeometry(trailerGeo);
    const edgesMat = new THREE.LineBasicMaterial({ color: 0x000000 });
    const edges = new THREE.LineSegments(edgesGeo, edgesMat);
    edges.position.set(sx/2, sy/2, sz/2);
    edges.raycast = () => {};
    this.containerGroup.add(edges);

    if (type !== 'none' && type !== '') {
      this.containerGroup.add(this._createTruckCabin(sx, sy, sz));
    }
    
    // Add Dimensions
    this.containerGroup.add(this.drawDimensions(sx, sy, sz));

    // Set camera to look from the front-left diagonally
    this.camera.position.set(-sx * 1.5, sy * 3, sz * 1.3);
    this.controls.target.set(sx/2, sy/2, sz/2);
    this.controls.update();

    this.renderer.render(this.scene, this.camera);
    this.requestRender();
  }

  drawStagingZone(sx, sz) {
    const zoneW = 4; // 4 meters wide
    const zoneL = sz + 2; // slightly longer than container
    
    // Create a dashed border or a subtle plane
    const zoneGeo = new THREE.PlaneGeometry(zoneW, zoneL);
    
    // Create a custom striped/hatched texture programmatically
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(253, 224, 71, 0.1)'; // faint yellow
    ctx.fillRect(0, 0, 128, 128);
    ctx.lineWidth = 10;
    ctx.strokeStyle = 'rgba(253, 224, 71, 0.4)'; // stronger yellow stripes
    for (let i = -128; i < 256; i += 32) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + 128, 128);
      ctx.stroke();
    }
    
    const zoneTex = new THREE.CanvasTexture(canvas);
    zoneTex.wrapS = THREE.RepeatWrapping;
    zoneTex.wrapT = THREE.RepeatWrapping;
    zoneTex.repeat.set(zoneW, zoneL);
    
    const zoneMat = new THREE.MeshBasicMaterial({ 
      map: zoneTex, 
      transparent: true, 
      side: THREE.DoubleSide,
      depthWrite: false 
    });
    
    const stagingZone = new THREE.Mesh(zoneGeo, zoneMat);
    stagingZone.rotation.x = -Math.PI / 2;
    // Position it to the left of the container (negative X)
    stagingZone.position.set(-zoneW/2 - 0.5, 0.01, sz/2);
    stagingZone.raycast = () => {}; // non-interactive
    
    this.containerGroup.add(stagingZone);
  }

  createTextTexture(text, bgColor) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, 256, 256);
    
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Simple text wrapping
    const words = text.split(' ');
    let lines = [];
    let line = '';
    for(let i=0; i<words.length; i++) {
      let testLine = line + words[i] + ' ';
      if (ctx.measureText(testLine).width > 230 && i > 0) {
        lines.push(line);
        line = words[i] + ' ';
      } else {
        line = testLine;
      }
    }
    lines.push(line);
    
    let startY = 128 - (lines.length - 1) * 20;
    for(let i=0; i<lines.length; i++) {
      ctx.fillText(lines[i], 128, startY + i*40);
    }
    
    // Draw box outline
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, 246, 246);

    return new THREE.CanvasTexture(canvas);
  }



  createDimensionLabel(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    
    ctx.clearRect(0, 0, 128, 32);
    
    ctx.fillStyle = '#000000';
    ctx.font = '600 18px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 64, 16);
    
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(0.8, 0.2, 1);
    return sprite;
  }

  drawDimensions(sx, sy, sz) {
    const group = new THREE.Group();
    const lineMat = new THREE.LineBasicMaterial({ color: 0x000000 });
    
    const offset = 0.6; // Offset lines by 0.6 meters from the truck
    const tickLen = 0.15; // Length of the tick marks
    
    const points = [];
    
    // --- Z-axis ruler (Length) ---
    points.push(new THREE.Vector3(-offset, 0, -0.2), new THREE.Vector3(-offset, 0, sz + 0.2));
    
    const stepZ = 2; // Ticks every 2 meters
    for (let z = 0; z <= sz; z += stepZ) {
        points.push(new THREE.Vector3(-offset - tickLen/2, 0, z), new THREE.Vector3(-offset + tickLen/2, 0, z));
        if (z > 0) {
            const label = this.createDimensionLabel(`${(z*1000).toFixed(0)}`);
            label.position.set(-offset - 0.3, 0.05, z);
            group.add(label);
        }
    }
    if (sz % stepZ !== 0) {
        points.push(new THREE.Vector3(-offset - tickLen/2, 0, sz), new THREE.Vector3(-offset + tickLen/2, 0, sz));
        const label = this.createDimensionLabel(`${(sz*1000).toFixed(0)}`);
        label.position.set(-offset - 0.3, 0.05, sz);
        group.add(label);
    }
    
    // --- X-axis ruler (Width) ---
    points.push(new THREE.Vector3(-0.2, 0, -offset), new THREE.Vector3(sx + 0.2, 0, -offset));
    
    const stepX = 1; // Ticks every 1 meter
    for (let x = 0; x <= sx; x += stepX) {
        points.push(new THREE.Vector3(x, 0, -offset - tickLen/2), new THREE.Vector3(x, 0, -offset + tickLen/2));
        if (x > 0) {
            const label = this.createDimensionLabel(`${(x*1000).toFixed(0)}`);
            label.position.set(x, 0.05, -offset - 0.2);
            group.add(label);
        }
    }
    if (sx % stepX !== 0) {
        points.push(new THREE.Vector3(sx, 0, -offset - tickLen/2), new THREE.Vector3(sx, 0, -offset + tickLen/2));
        const label = this.createDimensionLabel(`${(sx*1000).toFixed(0)}`);
        label.position.set(sx, 0.05, -offset - 0.2);
        group.add(label);
    }

    // --- Y-axis ruler (Height) ---
    points.push(new THREE.Vector3(sx + offset, -0.2, sz), new THREE.Vector3(sx + offset, sy + 0.2, sz));
    
    const stepY = 1; // Ticks every 1 meter
    for (let y = 0; y <= sy; y += stepY) {
        points.push(new THREE.Vector3(sx + offset - tickLen/2, y, sz), new THREE.Vector3(sx + offset + tickLen/2, y, sz));
        if (y > 0) {
            const label = this.createDimensionLabel(`${(y*1000).toFixed(0)}`);
            label.position.set(sx + offset + 0.3, y, sz);
            group.add(label);
        }
    }
    if (sy % stepY !== 0) {
        points.push(new THREE.Vector3(sx + offset - tickLen/2, sy, sz), new THREE.Vector3(sx + offset + tickLen/2, sy, sz));
        const label = this.createDimensionLabel(`${(sy*1000).toFixed(0)}`);
        label.position.set(sx + offset + 0.3, sy, sz);
        group.add(label);
    }
    
    group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points), lineMat));
    
    group.traverse(c => {
        if (c.isLine || c.isSprite) c.raycast = () => {};
    });
    
    return group;
  }

  _createTruckCabin(sx, sy, sz) {
    const group = new THREE.Group();
    
    const setupMesh = (geometry) => {
        const cabinMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xcccccc });
        const mesh = new THREE.Mesh(geometry, cabinMat);
        
        // Correct STL orientation from CAD to Three.js
        geometry.rotateX(-Math.PI / 2);
        
        geometry.computeBoundingBox();
        const bbox = geometry.boundingBox;
        const size = new THREE.Vector3();
        bbox.getSize(size);
        
        const targetHeight = 3.8;
        const scale = targetHeight / size.y;
        mesh.scale.set(scale, scale, scale);
        
        geometry.translate(
            -(bbox.max.x + bbox.min.x) / 2,
            -bbox.min.y,
            -(bbox.max.z + bbox.min.z) / 2
        );
        
        // Position it so the center of the truck is at the front of the trailer.
        // This makes the cabin stick out forward (+Z) and the chassis go under the trailer (-Z).
        mesh.position.set(sx/2, -1.0, sz);
        
        const edgeMat = new THREE.LineBasicMaterial({ color: 0x666666 });
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 15), edgeMat);
        mesh.add(edges);
        
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.raycast = () => {};
        
        group.add(mesh);
        this.requestRender();
    };

    if (cachedTruckGeometry) {
        setupMesh(cachedTruckGeometry);
    } else {
        const loader = new STLLoader();
        loader.load('/models/truck.stl', (geometry) => {
            cachedTruckGeometry = geometry;
            setupMesh(geometry);
        }, undefined, (error) => {
            console.error('Error loading truck STL:', error);
        });
    }

    return group;
  }

  drawCargo(placedItems, pallets = [], stagedItems = []) {
    if (this.transformControl) {
      this.transformControl.detach();
      this.selectedMesh = null;
    }
    
    // Clear old cargo (but keep class-level caches alive for reuse)
    this.disposeGroup(this.cargoGroup);
    
    // Draw pallets with shared material
    if (pallets.length > 0) {
      if (!this._palletMat) {
        const woodTex = this.createWoodTexture('#d4a373');
        this._palletMat = new THREE.MeshLambertMaterial({ map: woodTex });
      }
      
      for (const pal of pallets) {
        const pw = pal.w / 100;
        const ph = pal.h / 100;
        const pl = pal.l / 100;
        const geoKey = `pal_${pw}_${ph}_${pl}`;
        if (!this._geoCache[geoKey]) {
          this._geoCache[geoKey] = new THREE.BoxGeometry(pw, ph, pl);
        }
        const mesh = new THREE.Mesh(this._geoCache[geoKey], this._palletMat);
        mesh.position.set(pal.x/100 + pw/2, pal.y/100 + ph/2, pal.z/100 + pl/2);
        mesh.receiveShadow = true;
        this.cargoGroup.add(mesh);
      }
    }

    const allItemsToDraw = [...placedItems, ...stagedItems];

    for (const p of allItemsToDraw) {
      if (!p.packed && !p.isStaged) continue; // Only skip if it's completely unpacked and NOT staged
      
      const w = p.w / 100;
      const h = p.h / 100;
      const l = p.l / 100;
      const x = p.x / 100;
      const y = p.y / 100;
      const z = p.z / 100;

      // Reuse geometry from class-level cache
      const geoKey = `${w}_${h}_${l}`;
      if (!this._geoCache[geoKey]) {
        this._geoCache[geoKey] = new THREE.BoxGeometry(w, h, l);
      }
      
      // Reuse materials from class-level cache
      const matKey = `${p.name}_${p.color}`;
      if (!this._matCache[matKey]) {
        const texKey = `${p.name}_${p.color}`;
        if (!this._texCache[texKey]) {
          this._texCache[texKey] = this.createTextTexture(p.name, p.color);
        }
        const labelMat = new THREE.MeshLambertMaterial({ map: this._texCache[texKey] });
        const plainMat = new THREE.MeshLambertMaterial({ color: p.color });
        this._matCache[matKey] = [plainMat, plainMat, plainMat, plainMat, labelMat, plainMat];
      }

      const mesh = new THREE.Mesh(this._geoCache[geoKey], this._matCache[matKey]);
      mesh.userData = p;
      mesh.position.set(x + w/2, y + h/2, z + l/2);
      mesh.receiveShadow = true;
      
      // If it's staged, make it slightly darker or transparent to indicate it's not in the truck
      // Actually, since it's sharing a material, we shouldn't modify the material directly.
      // But we can rely on it being physically on the floor outside the truck to be obvious.
      
      this.cargoGroup.add(mesh);
    }
    
    this.requestRender();
  }


  onWindowResize() {
    const parent = this.canvas.parentElement;
    const w = parent ? parent.clientWidth : this.canvas.clientWidth;
    const h = parent ? parent.clientHeight : this.canvas.clientHeight;
    if (w === 0 || h === 0) return; // Not visible yet, skip
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.requestRender();
  }

  // --- Render-on-Demand ---
  // Instead of rendering 60fps constantly, we only render when something changes.
  // This drops GPU/CPU usage to ~0% when the scene is static.
  
  requestRender() {
    if (!this._renderScheduled) {
      this._renderScheduled = true;
      requestAnimationFrame(() => this._render());
    }
  }

  _render() {
    this._renderScheduled = false;
    
    let needsMore = false;
    
    // Camera lerp animation (double-click zoom in/out)
    if (this.targetCameraPos && this.targetControlsCenter) {
      this.camera.position.lerp(this.targetCameraPos, 0.1);
      this.controls.target.lerp(this.targetControlsCenter, 0.1);
      
      if (this.camera.position.distanceTo(this.targetCameraPos) < 0.05 && 
          this.controls.target.distanceTo(this.targetControlsCenter) < 0.05) {
        this.camera.position.copy(this.targetCameraPos);
        this.controls.target.copy(this.targetControlsCenter);
        this.targetCameraPos = null;
        this.targetControlsCenter = null;
      } else {
        needsMore = true;
      }
    }
    
    // Sidebar offset animation
    const app = document.getElementById('app');
    const isSidebarOpen = app && !app.classList.contains('sidebar-closed');
    const isDesktop = window.innerWidth > 768;
    const targetOffset = (isSidebarOpen && isDesktop) ? -240 : 0;
    
    // Initialize currentViewOffset if it's undefined
    if (this.currentViewOffset === undefined) {
      this.currentViewOffset = targetOffset;
    }
    
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    
    if (width > 0 && height > 0) {
      if (Math.abs(this.currentViewOffset - targetOffset) > 0.5) {
        this.currentViewOffset += (targetOffset - this.currentViewOffset) * 0.1;
        this.camera.setViewOffset(width, height, this.currentViewOffset, 0, width, height);
        needsMore = true;
      } else if (this.currentViewOffset !== targetOffset || this.camera.view === null && targetOffset !== 0) {
        this.currentViewOffset = targetOffset;
        if (targetOffset === 0) {
          this.camera.clearViewOffset();
        } else {
          this.camera.setViewOffset(width, height, this.currentViewOffset, 0, width, height);
        }
      }
    }
    
    this.controls.update(); // Drives damping; fires 'change' if camera moved → chains requestRender
    this.renderer.render(this.scene, this.camera);
    
    // If an animation is in progress, keep rendering
    if (needsMore) {
      this.requestRender();
    }
  }

  clearCaches() {
    // Dispose all cached geometries
    for (const key in this._geoCache) {
      this._geoCache[key].dispose();
    }
    this._geoCache = {};
    
    // Dispose all cached materials and their textures
    for (const key in this._matCache) {
      const mats = Array.isArray(this._matCache[key]) ? this._matCache[key] : [this._matCache[key]];
      mats.forEach(m => {
        if (m.map) m.map.dispose();
        m.dispose();
      });
    }
    this._matCache = {};
    
    // Dispose cached textures
    for (const key in this._texCache) {
      this._texCache[key].dispose();
    }
    this._texCache = {};
    
    if (this._palletMat) {
      if (this._palletMat.map) this._palletMat.map.dispose();
      this._palletMat.dispose();
      this._palletMat = null;
    }
  }

  spawnManualClone(p) {
    const mesh = new THREE.Mesh();
    mesh.userData = p;
    this.cargoGroup.add(mesh);
  }
}
