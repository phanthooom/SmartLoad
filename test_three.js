import * as THREE from 'three';

const w = 235.2;
const h = 239.3;
const l = 283.1;
const sx = w / 100;
const sy = h / 100;
const sz = l / 100;

const trailerGeo = new THREE.BoxGeometry(sx, sy, sz);
const trailerMat = new THREE.MeshBasicMaterial({
  color: 0x378ADD, transparent: true, opacity: 0.08, side: THREE.DoubleSide
});
const trailer = new THREE.Mesh(trailerGeo, trailerMat);
trailer.position.set(sx/2, sy/2, sz/2);

const edgesGeo = new THREE.EdgesGeometry(trailerGeo);
const edgesMat = new THREE.LineBasicMaterial({ color: 0x185FA5 });
const edges = new THREE.LineSegments(edgesGeo, edgesMat);

console.log("Success! trailer:", trailer.position, "edges:", edges.position);
