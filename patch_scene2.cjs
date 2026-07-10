const fs = require('fs');
let content = fs.readFileSync('src/scene.js', 'utf-8');

// Replace createDimensionLabel and drawDimensions
const newDrawDimensions = `
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
            const label = this.createDimensionLabel(\`\${(z*1000).toFixed(0)}\`);
            label.position.set(-offset - 0.3, 0.05, z);
            group.add(label);
        }
    }
    if (sz % stepZ !== 0) {
        points.push(new THREE.Vector3(-offset - tickLen/2, 0, sz), new THREE.Vector3(-offset + tickLen/2, 0, sz));
        const label = this.createDimensionLabel(\`\${(sz*1000).toFixed(0)}\`);
        label.position.set(-offset - 0.3, 0.05, sz);
        group.add(label);
    }
    
    // --- X-axis ruler (Width) ---
    points.push(new THREE.Vector3(-0.2, 0, -offset), new THREE.Vector3(sx + 0.2, 0, -offset));
    
    const stepX = 1; // Ticks every 1 meter
    for (let x = 0; x <= sx; x += stepX) {
        points.push(new THREE.Vector3(x, 0, -offset - tickLen/2), new THREE.Vector3(x, 0, -offset + tickLen/2));
        if (x > 0) {
            const label = this.createDimensionLabel(\`\${(x*1000).toFixed(0)}\`);
            label.position.set(x, 0.05, -offset - 0.2);
            group.add(label);
        }
    }
    if (sx % stepX !== 0) {
        points.push(new THREE.Vector3(sx, 0, -offset - tickLen/2), new THREE.Vector3(sx, 0, -offset + tickLen/2));
        const label = this.createDimensionLabel(\`\${(sx*1000).toFixed(0)}\`);
        label.position.set(sx, 0.05, -offset - 0.2);
        group.add(label);
    }

    // --- Y-axis ruler (Height) ---
    points.push(new THREE.Vector3(sx + offset, -0.2, sz), new THREE.Vector3(sx + offset, sy + 0.2, sz));
    
    const stepY = 1; // Ticks every 1 meter
    for (let y = 0; y <= sy; y += stepY) {
        points.push(new THREE.Vector3(sx + offset - tickLen/2, y, sz), new THREE.Vector3(sx + offset + tickLen/2, y, sz));
        if (y > 0) {
            const label = this.createDimensionLabel(\`\${(y*1000).toFixed(0)}\`);
            label.position.set(sx + offset + 0.3, y, sz);
            group.add(label);
        }
    }
    if (sy % stepY !== 0) {
        points.push(new THREE.Vector3(sx + offset - tickLen/2, sy, sz), new THREE.Vector3(sx + offset + tickLen/2, sy, sz));
        const label = this.createDimensionLabel(\`\${(sy*1000).toFixed(0)}\`);
        label.position.set(sx + offset + 0.3, sy, sz);
        group.add(label);
    }
    
    group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points), lineMat));
    
    group.traverse(c => {
        if (c.isLine || c.isSprite) c.raycast = () => {};
    });
    
    return group;
  }`;

// Replace everything from createDimensionLabel to end of drawDimensions
const startIdx = content.indexOf('  createDimensionLabel(text) {');
const endIdx = content.indexOf('  _createTruckCabin(sx, sy, sz) {');
if (startIdx !== -1 && endIdx !== -1) {
    content = content.substring(0, startIdx) + newDrawDimensions + '\n\n' + content.substring(endIdx);
}

// Now replace _createTruckCabin completely with STL loader
const newCabin = `  _createTruckCabin(sx, sy, sz) {
    const group = new THREE.Group();
    
    const setupMesh = (geometry) => {
        const cabinMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xcccccc });
        const mesh = new THREE.Mesh(geometry, cabinMat);
        
        geometry.computeBoundingBox();
        const bbox = geometry.boundingBox;
        const size = new THREE.Vector3();
        bbox.getSize(size);
        
        const targetHeight = 3.5;
        const scale = targetHeight / size.y;
        mesh.scale.set(scale, scale, scale);
        
        geometry.translate(
            -(bbox.max.x + bbox.min.x) / 2,
            -bbox.min.y,
            -(bbox.max.z + bbox.min.z) / 2
        );
        
        const scaledLength = size.z * scale;
        mesh.position.set(sx/2, -1.0, sz + 0.4 + scaledLength/2);
        
        const edgeMat = new THREE.LineBasicMaterial({ color: 0x666666 });
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 15), edgeMat);
        mesh.add(edges);
        
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.raycast = () => {};
        
        group.add(mesh);
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
  }`;

const cabStartIdx = content.indexOf('  _createTruckCabin(sx, sy, sz) {');
const drawItemsIdx = content.indexOf('  drawCargo() {');
if (cabStartIdx !== -1 && drawItemsIdx !== -1) {
    content = content.substring(0, cabStartIdx) + newCabin + '\n\n' + content.substring(drawItemsIdx);
}

fs.writeFileSync('src/scene.js', content);
