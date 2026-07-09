import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';

export class CargoScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.scene.background = null; // transparent, controlled by CSS
    
    this.camera = new THREE.PerspectiveCamera(45, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
    this.camera.position.set(8, 5, 8);
    
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);
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

    // TransformControls for manual manipulation
    this.transformControl = new TransformControls(this.camera, this.renderer.domElement);
    this.transformControl.setSize(2.0); // Make gizmo much larger and visible
    
    this.transformControl.addEventListener('dragging-changed', (event) => {
      this.controls.enabled = !event.value;
    });
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
          this.selectedMesh.position.y = h / 2; // Snap to ground
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
    this.scene.add(this.transformControl);
    this.transformControl.addEventListener('change', () => this.requestRender());

    // Keyboard shortcuts for TransformControls
    window.addEventListener('keydown', (event) => {
      const debug = document.getElementById('debug-overlay');
      if (debug) debug.innerText = `Keydown: ${event.key}`;
      if (!this.selectedMesh) {
        if (debug) debug.innerText += `\nNo mesh selected`;
        return;
      }
      switch(event.key.toLowerCase()) {
        case 't': this.transformControl.setMode('translate'); break;
        case 'r': this.transformControl.setMode('rotate'); break;
        case 'c': 
          if (this.onCargoClone) this.onCargoClone(this.selectedMesh.userData);
          break;
        case 'escape': 
          if (this.selectedMesh && Array.isArray(this.selectedMesh.material)) {
            this.selectedMesh.material.forEach(m => m.emissive.setHex(0x000000));
          }
          this.transformControl.detach();
          this.selectedMesh = null;
          this.setFocusMode(false);
          this.resetCameraTarget();
          if (this.onCargoSelect) this.onCargoSelect(null);
          break;
      }
    });

    this.renderer.domElement.addEventListener('dblclick', this.onDoubleClick.bind(this));

    this.requestRender(); // Initial render
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
        
        try {
          this.transformControl.attach(this.selectedMesh);
        } catch(e) {
          console.error("Attach error", e);
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
        
        try {
          this.transformControl.attach(this.selectedMesh);
        } catch(e) {
          console.error("Attach error", e);
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
    this.containerW = w;
    this.containerH = h;
    this.containerL = l;

    this.disposeGroup(this.containerGroup);
    
    const sx = w / 100;
    const sy = h / 100;
    const sz = l / 100;

    const floorGeo = new THREE.BoxGeometry(sx, 0.05, sz);
    const woodTex = this.createWoodTexture(this.floorColor || '#8B5A2B');
    const floorMat = new THREE.MeshStandardMaterial({ map: woodTex });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.position.set(sx/2, -0.025, sz/2);
    floor.receiveShadow = true;
    floor.raycast = () => {};
    this.containerGroup.add(floor);

    const isSeaContainer = ['10ft', '20ft', '40ft', '40ft_std', '45ft_hc'].includes(type) || type === '';
    const isTruck = ['truck', 'gazelle', 'truck_3t', 'truck_5t', 'truck_10t'].includes(type);
    const isTrailer = ['eurotrailer', 'isotherm', 'euro_82', 'euro_86', 'euro_90', 'euro_92', 'euro_96', 'mega_100'].includes(type);
    const isRef = type === 'refrigerator';

    if (isSeaContainer) {
      const color = type.includes('40') ? '#2e4975' : (type.includes('45') ? '#8c2626' : '#275c3f');
      const { diffuse, normal } = this.createCorrugatedTextures(color);
      diffuse.repeat.set(sz, 1);
      normal.repeat.set(sz, 1);
      
      const wallMat = new THREE.MeshStandardMaterial({ map: diffuse, normalMap: normal, metalness: 0.3, roughness: 0.7 });
      wallMat.side = THREE.DoubleSide;

      const backGeo = new THREE.PlaneGeometry(sx, sy);
      const backWall = new THREE.Mesh(backGeo, wallMat.clone());
      backWall.material.map.repeat.set(sx, 1);
      backWall.material.normalMap.repeat.set(sx, 1);
      backWall.position.set(sx/2, sy/2, 0);
      backWall.receiveShadow = true;
      backWall.raycast = () => {};
      this.containerGroup.add(backWall);

      const leftGeo = new THREE.PlaneGeometry(sz, sy);
      const leftWall = new THREE.Mesh(leftGeo, wallMat);
      leftWall.rotation.y = Math.PI / 2;
      leftWall.position.set(0, sy/2, sz/2);
      leftWall.receiveShadow = true;
      leftWall.raycast = () => {};
      this.containerGroup.add(leftWall);

      const pGeo = new THREE.BoxGeometry(0.1, sy, 0.1);
      const pMat = new THREE.MeshStandardMaterial({ color });
      [[0.05, sy/2, 0.05], [sx-0.05, sy/2, 0.05], [0.05, sy/2, sz-0.05], [sx-0.05, sy/2, sz-0.05]].forEach(pos => {
        const p = new THREE.Mesh(pGeo, pMat);
        p.position.set(...pos);
        p.raycast = () => {};
        this.containerGroup.add(p);
      });
      
      const frameMat = new THREE.MeshStandardMaterial({ color });
      const frameRight = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, sz), frameMat);
      frameRight.position.set(sx, sy, sz/2);
      frameRight.raycast = () => {};
      this.containerGroup.add(frameRight);
      
      const frameFront = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.05, 0.05), frameMat);
      frameFront.position.set(sx/2, sy, sz);
      frameFront.raycast = () => {};
      this.containerGroup.add(frameFront);

    } else if (isTruck || isTrailer || isRef) {
      const wallColor = isRef ? '#ffffff' : (isTrailer ? '#d1d5db' : '#3b82f6');
      const wallMat = new THREE.MeshStandardMaterial({ color: wallColor, side: THREE.DoubleSide, roughness: 0.9 });
      
      const backGeo = new THREE.PlaneGeometry(sx, sy);
      const backWall = new THREE.Mesh(backGeo, wallMat);
      backWall.position.set(sx/2, sy/2, 0);
      backWall.raycast = () => {};
      this.containerGroup.add(backWall);

      const leftGeo = new THREE.PlaneGeometry(sz, sy);
      const leftWall = new THREE.Mesh(leftGeo, wallMat);
      leftWall.rotation.y = Math.PI / 2;
      leftWall.position.set(0, sy/2, sz/2);
      leftWall.raycast = () => {};
      this.containerGroup.add(leftWall);
      
      const pGeo = new THREE.BoxGeometry(0.05, sy, 0.05);
      const pMat = new THREE.MeshStandardMaterial({ color: '#4b5563' });
      [[0.025, sy/2, 0.025], [sx-0.025, sy/2, 0.025], [0.025, sy/2, sz-0.025], [sx-0.025, sy/2, sz-0.025]].forEach(pos => {
        const p = new THREE.Mesh(pGeo, pMat);
        p.position.set(...pos);
        p.raycast = () => {};
        this.containerGroup.add(p);
      });
      
      const wheelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.2, 32);
      const wheelMat = new THREE.MeshStandardMaterial({ color: '#1f2937', roughness: 0.8 });
      wheelGeo.rotateZ(Math.PI / 2);
      
      const numWheels = Math.max(2, Math.floor(sz / 3));
      for (let i = 0; i < numWheels; i++) {
        const zPos = sz - 1.5 - (i * 1.5);
        if (zPos < 0) continue;
        const w1 = new THREE.Mesh(wheelGeo, wheelMat);
        w1.position.set(0.1, -0.45, zPos);
        w1.raycast = () => {};
        this.containerGroup.add(w1);
        
        const w2 = new THREE.Mesh(wheelGeo, wheelMat);
        w2.position.set(sx - 0.1, -0.45, zPos);
        w2.raycast = () => {};
        this.containerGroup.add(w2);
      }
      
      if (isTruck) {
        const cabDepth = 2.0;
        const cabHeight = Math.min(sy * 0.9, 2.5);
        const cabGeo = new THREE.BoxGeometry(sx * 0.9, cabHeight, cabDepth);
        const cabMat = new THREE.MeshStandardMaterial({ color: wallColor });
        const cab = new THREE.Mesh(cabGeo, cabMat);
        cab.position.set(sx/2, cabHeight/2, -cabDepth/2 - 0.1);
        cab.raycast = () => {};
        this.containerGroup.add(cab);
        
        const cw1 = new THREE.Mesh(wheelGeo, wheelMat);
        cw1.position.set(0.1, -0.45, -cabDepth/2);
        cw1.raycast = () => {};
        this.containerGroup.add(cw1);
        const cw2 = new THREE.Mesh(wheelGeo, wheelMat);
        cw2.position.set(sx - 0.1, -0.45, -cabDepth/2);
        cw2.raycast = () => {};
        this.containerGroup.add(cw2);
      }
      
      if (isRef) {
        const refGeo = new THREE.BoxGeometry(Math.min(sx * 0.8, 1.8), Math.min(sy * 0.6, 1.5), 0.4);
        const refMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.5 });
        const refMesh = new THREE.Mesh(refGeo, refMat);
        refMesh.position.set(sx/2, sy * 0.7, -0.2);
        refMesh.raycast = () => {};
        this.containerGroup.add(refMesh);
      }
    }

    const edgesGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(sx, sy, sz));
    const edgesMat = new THREE.LineBasicMaterial({ color: 0x9ca3af, linewidth: 1, transparent: true, opacity: 0.2 });
    const edges = new THREE.LineSegments(edgesGeo, edgesMat);
    edges.position.set(sx/2, sy/2, sz/2);
    edges.raycast = () => {};
    this.containerGroup.add(edges);

    this.camera.position.set(sx * 1.5, sy * 1.5, sz * 1.5);
    this.controls.target.set(sx/2, sy/2, sz/2);
    this.controls.update();

    // Draw Staging Zone (Loading Area) on the floor next to the truck
    this.drawStagingZone(sx, sz);
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
    this.camera.aspect = this.canvas.clientWidth / this.canvas.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
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
    
    if (Math.abs(this.currentViewOffset - targetOffset) > 0.5) {
      this.currentViewOffset += (targetOffset - this.currentViewOffset) * 0.1;
      const width = this.canvas.clientWidth;
      const height = this.canvas.clientHeight;
      if (width > 0 && height > 0) {
        this.camera.setViewOffset(width, height, this.currentViewOffset, 0, width, height);
      }
      needsMore = true;
    } else if (this.currentViewOffset !== targetOffset) {
      this.currentViewOffset = targetOffset;
      const width = this.canvas.clientWidth;
      const height = this.canvas.clientHeight;
      if (targetOffset === 0) {
        this.camera.clearViewOffset();
      } else {
        this.camera.setViewOffset(width, height, this.currentViewOffset, 0, width, height);
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
