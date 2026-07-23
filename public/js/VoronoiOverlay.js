function initVoronoiOverlay(regions) {
  if (!window.delaunay || !window.delaunayVoronoi) {
    console.error('initVoronoiOverlay: window.delaunay/delaunayVoronoi not built yet — '
      + 'call this after the fixed Voronoi partition is constructed.');
    return;
  }

  const existing = document.getElementById('voronoi-overlay');
  if (existing) existing.remove();

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.id = 'voronoi-overlay';
  svg.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    pointer-events: none; z-index: 9500;
  `;
  svg.setAttribute('viewBox', `0 0 ${window.innerWidth} ${window.innerHeight}`);
  document.body.appendChild(svg);

  window._voronoiCellPaths = [];

  regions.forEach((region, i) => {
    const cellPoints = window.delaunayVoronoi.cellPolygon(i);
    if (!cellPoints) {
      console.warn(`initVoronoiOverlay: no cell polygon for region "${region.id}" (index ${i})`);
      return;
    }

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M' + cellPoints.map(p => p.join(',')).join('L') + 'Z');
    path.setAttribute('fill', 'rgba(150,150,150,0.08)');
    path.setAttribute('stroke', 'rgba(200,200,200,0.4)');
    path.setAttribute('stroke-width', '2');
    svg.appendChild(path);
    window._voronoiCellPaths[i] = path;

    const siteX = window.delaunay.points[i * 2];
    const siteY = window.delaunay.points[i * 2 + 1];
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', siteX);
    label.setAttribute('y', siteY);
    label.setAttribute('fill', 'rgba(255,255,255,0.5)');
    label.setAttribute('font-size', '14');
    label.setAttribute('text-anchor', 'middle');
    label.textContent = region.label || region.id;
    svg.appendChild(label);
  });

  window._voronoiOverlaySvg = svg;
  console.log(`✅ Voronoi overlay built: ${window._voronoiCellPaths.filter(Boolean).length} region cells`);
}

// Called every frame from tracking.js's updateCursorPosition(). Only
// re-colors the active cell — geometry is untouched (it's fixed).
let _lastDrawnActiveIndex = null;
function drawVoronoi() {
  if (!window._voronoiCellPaths || window._voronoiCellPaths.length === 0) return;
  if (window.activeIndex === _lastDrawnActiveIndex) return; // nothing changed, skip work

  if (_lastDrawnActiveIndex != null && window._voronoiCellPaths[_lastDrawnActiveIndex]) {
    const prev = window._voronoiCellPaths[_lastDrawnActiveIndex];
    prev.setAttribute('fill', 'rgba(150,150,150,0.08)');
    prev.setAttribute('stroke', 'rgba(200,200,200,0.4)');
    prev.setAttribute('stroke-width', '2');
  }

  const active = window._voronoiCellPaths[window.activeIndex];
  if (active) {
    active.setAttribute('fill', 'rgba(100,255,100,0.35)');
    active.setAttribute('stroke', 'rgba(100,255,100,0.9)');
    active.setAttribute('stroke-width', '3');
  }

  _lastDrawnActiveIndex = window.activeIndex;
}

window.initVoronoiOverlay = initVoronoiOverlay;
window.drawVoronoi = drawVoronoi;