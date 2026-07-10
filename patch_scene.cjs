const fs = require('fs');
let content = fs.readFileSync('src/scene.js', 'utf-8');

// 1. Imports
content = content.replace(
  "import { TransformControls } from 'three/addons/controls/TransformControls.js';",
  "import { TransformControls } from 'three/addons/controls/TransformControls.js';\nimport { STLLoader } from 'three/addons/loaders/STLLoader.js';\n\nlet cachedTruckGeometry = null;"
);

// 2. Background and grid
content = content.replace(
  "this.scene.background = new THREE.Color(0xf1f5f9); // light gray background",
  `this.scene.background = new THREE.Color(0xf0f2f5); // light gray background
    this.scene.fog = new THREE.Fog(0xf0f2f5, 15, 80);

    const gridHelper = new THREE.GridHelper(200, 200, 0xffffff, 0xffffff);
    gridHelper.position.y = -1.0;
    this.scene.add(gridHelper);`
);

// 3. Ground snap
content = content.replace(
  "this.selectedMesh.position.y = h / 2; // Snap to ground",
  "this.selectedMesh.position.y = -1.0 + h / 2; // Snap to ground"
);

// 4. Trailer edges
content = content.replace(
  /color: 0xffffff, transparent: true, opacity: 0.3, side: THREE.DoubleSide/g,
  "color: 0xffffff, transparent: true, opacity: 0.1, side: THREE.DoubleSide"
);
content = content.replace(
  /color: 0x333333, linewidth: 2/g,
  "color: 0x000000"
);

// 5. Camera position
content = content.replace(
  "this.camera.position.set(-sx * 2, sy * 1.5, sz/2);",
  "this.camera.position.set(-sx * 1.5, sy * 3, sz * 1.3);"
);

fs.writeFileSync('src/scene.js', content);
