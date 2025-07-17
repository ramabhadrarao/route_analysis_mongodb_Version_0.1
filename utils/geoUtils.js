// File: utils/geoUtils.js
// Purpose: Geographic utility functions

const geolib = require('geolib');

// Calculate distance between two coordinates
function calculateDistance(lat1, lon1, lat2, lon2) {
  return geolib.getDistance(
    { latitude: lat1, longitude: lon1 },
    { latitude: lat2, longitude: lon2 }
  ) / 1000; // Convert to kilometers
}

// Generate route points from coordinates
async function generateRoutePoints(fromCoords, toCoords, numberOfPoints = 10) {
  const points = [];
  
  // Add start point
  points.push({
    latitude: fromCoords.latitude,
    longitude: fromCoords.longitude,
    pointOrder: 0,
    distanceFromStart: 0
  });
  
  // Generate intermediate points
  for (let i = 1; i < numberOfPoints - 1; i++) {
    const ratio = i / (numberOfPoints - 1);
    const lat = fromCoords.latitude + (toCoords.latitude - fromCoords.latitude) * ratio;
    const lon = fromCoords.longitude + (toCoords.longitude - fromCoords.longitude) * ratio;
    
    points.push({
      latitude: lat,
      longitude: lon,
      pointOrder: i,
      distanceFromStart: calculateDistance(fromCoords.latitude, fromCoords.longitude, lat, lon)
    });
  }
  
  // Add end point
  const totalDistance = calculateDistance(
    fromCoords.latitude, fromCoords.longitude,
    toCoords.latitude, toCoords.longitude
  );
  
  points.push({
    latitude: toCoords.latitude,
    longitude: toCoords.longitude,
    pointOrder: numberOfPoints - 1,
    distanceFromStart: totalDistance
  });
  
  // Calculate distance to end for each point
  points.forEach(point => {
    point.distanceToEnd = totalDistance - point.distanceFromStart;
  });
  
  return points;
}

// Check if point is within route buffer
function isPointNearRoute(routePoints, targetPoint, bufferKm = 5) {
  return routePoints.some(routePoint => {
    const distance = calculateDistance(
      routePoint.latitude, routePoint.longitude,
      targetPoint.latitude, targetPoint.longitude
    );
    return distance <= bufferKm;
  });
}

// Get nearest route point to a given coordinate
function getNearestRoutePoint(routePoints, targetPoint) {
  let nearestPoint = null;
  let minDistance = Infinity;
  
  routePoints.forEach(routePoint => {
    const distance = calculateDistance(
      routePoint.latitude, routePoint.longitude,
      targetPoint.latitude, targetPoint.longitude
    );
    
    if (distance < minDistance) {
      minDistance = distance;
      nearestPoint = { ...routePoint, distanceToTarget: distance };
    }
  });
  
  return nearestPoint;
}

// Calculate route bounds
function calculateRouteBounds(routePoints) {
  const lats = routePoints.map(p => p.latitude);
  const lngs = routePoints.map(p => p.longitude);
  
  return {
    north: Math.max(...lats),
    south: Math.min(...lats),
    east: Math.max(...lngs),
    west: Math.min(...lngs)
  };
}

module.exports = {
  calculateDistance,
  generateRoutePoints,
  isPointNearRoute,
  getNearestRoutePoint,
  calculateRouteBounds
};