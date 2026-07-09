import { CargoScene } from './scene.js';
import { UI } from './ui.js';

document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('three-canvas');
  const scene = new CargoScene(canvas);
  const ui = new UI(scene);
});
