export class Packer {
  constructor(containerW, containerH, containerL) {
    this.cW = containerW;
    this.cH = containerH;
    this.cL = containerL;
    this.items = [];
    this.placedItems = [];
    this.pallets = []; // Store generated pallets
  }

  addItem(item) {
    this.items.push(item);
  }

  pack(manualItems = [], usePallets = false) {
    this.items.sort((a, b) => (b.w * b.h * b.l) - (a.w * a.h * a.l));
    this.placedItems = [...manualItems];
    this.pallets = [];

    if (usePallets) {
      return this._packWithPallets();
    } else {
      return this._packStandard(this.items, this.cW, this.cH, this.cL, this.placedItems);
    }
  }

  _packWithPallets() {
    // 1. Pack items into virtual pallets (120x80 cm footprint, max height 150cm)
    // In our coordinate system: X is W(width), Y is H(height), Z is L(length). 
    // Let's use W=80, L=120, H=150 for EUR pallet.
    const palletW = 80;
    const palletH = 150;
    const palletL = 120;
    
    let remainingItems = [...this.items];
    const packedPallets = []; // array of { items: [], w, h, l }

    while (remainingItems.length > 0) {
      const palletPacker = new Packer(palletW, palletH, palletL);
      // Try to pack as many remaining items as possible into one pallet
      const packedInPallet = palletPacker._packStandard(remainingItems, palletW, palletH, palletL, []);
      
      if (packedInPallet.length === 0) {
        // Item is too big for a pallet, pack it directly into container later
        const tooBig = remainingItems.shift();
        tooBig.skipPallet = true;
        packedPallets.push({ items: [tooBig], isRaw: true, w: tooBig.w, h: tooBig.h, l: tooBig.l });
        continue;
      }

      // Remove packed items from remaining
      remainingItems = remainingItems.filter(item => !packedInPallet.find(p => p.id === item.id));
      
      // Real height of this loaded pallet (max Y + H of items + 15cm pallet base)
      let maxH = 15; // pallet wooden base
      for (const p of packedInPallet) {
        p.y += 15; // shift items up to sit on the pallet
        if (p.y + p.h > maxH) maxH = p.y + p.h;
      }
      
      packedPallets.push({ items: packedInPallet, isRaw: false, w: palletW, h: maxH, l: palletL });
    }

    // 2. Pack the loaded pallets into the main container
    const containerPacker = new Packer(this.cW, this.cH, this.cL);
    // Convert pallets to "items" for the packer
    const palletItemsForPacking = packedPallets.map((p, index) => ({
      ...p,
      id: `pallet_${index}`,
      rotatable: p.isRaw ? p.items[0].rotatable : false // Don't rotate loaded pallets!
    }));

    const placedPallets = containerPacker._packStandard(palletItemsForPacking, this.cW, this.cH, this.cL, this.placedItems);

    // 3. Flatten back into placedItems with global coordinates
    const finalPlacedItems = [...this.placedItems];
    
    for (const pp of placedPallets) {
      if (!pp.packed) continue; // Pallet didn't fit in container
      
      if (pp.isRaw) {
        // It was a raw item too big for a pallet
        const rawItem = pp.items[0];
        finalPlacedItems.push({ ...rawItem, packed: true, x: pp.x, y: pp.y, z: pp.z, w: pp.w, h: pp.h, l: pp.l });
      } else {
        // Record the pallet object for 3D rendering
        this.pallets.push({ x: pp.x, y: pp.y, z: pp.z, w: pp.w, h: 15, l: pp.l });
        
        // Translate inner items to global coordinates
        for (const inner of pp.items) {
          finalPlacedItems.push({
            ...inner,
            packed: true,
            x: pp.x + inner.x,
            y: pp.y + inner.y,
            z: pp.z + inner.z,
            w: inner.w, h: inner.h, l: inner.l
          });
        }
      }
    }

    this.placedItems = finalPlacedItems;
    // Mark remaining unpacked items
    for (const item of this.items) {
      if (!this.placedItems.find(p => p.id === item.id)) {
        item.packed = false;
      }
    }

    return this.placedItems;
  }

  _packStandard(itemsToPack, cW, cH, cL, startingPlaced) {
    const localPlaced = [...startingPlaced];
    
    for (const item of itemsToPack) {
      let placed = false;
      
      const rots = item.rotatable ? [
        [item.w, item.h, item.l],
        [item.w, item.l, item.h],
        [item.h, item.w, item.l],
        [item.h, item.l, item.w],
        [item.l, item.w, item.h],
        [item.l, item.h, item.w],
      ] : [[item.w, item.h, item.l]];

      const uniqueRots = [];
      const seen = new Set();
      for (const r of rots) {
        const k = r.join(',');
        if(!seen.has(k)) { seen.add(k); uniqueRots.push(r); }
      }

      const points = [[0,0,0]];
      for (const p of localPlaced) {
        points.push([p.x + p.w, p.y, p.z]);
        points.push([p.x, p.y + p.h, p.z]);
        points.push([p.x, p.y, p.z + p.l]);
        
        points.push([p.x + p.w, 0, 0]);
        points.push([0, p.y + p.h, 0]);
        points.push([0, 0, p.z + p.l]);
        
        points.push([p.x + p.w, 0, p.z]);
        points.push([p.x + p.w, p.y, 0]);
        points.push([0, p.y + p.h, p.z]);
        points.push([p.x, p.y + p.h, 0]);
        points.push([p.x, 0, p.z + p.l]);
        points.push([0, p.y, p.z + p.l]);
      }

      points.sort((a,b) => {
        if(a[1] !== b[1]) return a[1] - b[1]; // y
        if(a[2] !== b[2]) return a[2] - b[2]; // z
        return a[0] - b[0]; // x
      });

      for (const [x,y,z] of points) {
        if (placed) break;
        for (const [rw, rh, rl] of uniqueRots) {
          if (this._canPlace(x, y, z, rw, rh, rl, cW, cH, cL, localPlaced)) {
            localPlaced.push({
              ...item, packed: true, x, y, z, w: rw, h: rh, l: rl
            });
            placed = true;
            break;
          }
        }
      }
      item.packed = placed;
    }
    return localPlaced;
  }

  _canPlace(x, y, z, w, h, l, cW, cH, cL, localPlaced) {
    if (x + w > cW || y + h > cH || z + l > cL) return false;
    for (const p of localPlaced) {
      if (
        x < p.x + p.w && x + w > p.x &&
        y < p.y + p.h && y + h > p.y &&
        z < p.z + p.l && z + l > p.z
      ) {
        return false;
      }
    }
    return true;
  }
}
