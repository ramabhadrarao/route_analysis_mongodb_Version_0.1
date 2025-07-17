// File: utils/geometryUtils.js
// Purpose: Geometric utility functions for blind spot calculations

class GeometryUtils {
  
  // Earth curvature and sight line calculations
  static calculateLineOfSight(observer, target, earthRadius = 6371000) {
    const distance = this.calculateDistance(observer, target);
    const earthCurvature = (distance * distance) / (2 * earthRadius);
    return observer.elevation - target.elevation - earthCurvature;
  }
  
  // Haversine distance calculation
  static calculateDistance(point1, point2) {
    const R = 6371000; // Earth's radius in meters
    const dLat = (point2.latitude - point1.latitude) * Math.PI / 180;
    const dLon = (point2.longitude - point1.longitude) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(point1.latitude * Math.PI / 180) * Math.cos(point2.latitude * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }
  
  // AASHTO stopping sight distance
  static calculateStoppingSightDistance(speed, reactionTime = 2.5, friction = 0.35) {
    const reactionDistance = 0.278 * speed * reactionTime;
    const brakingDistance = (speed * speed) / (254 * friction);
    return reactionDistance + brakingDistance;
  }
  
  // Convert coordinates to local Cartesian system
  static toLocalCartesian(point, origin) {
    const lat = (point.latitude - origin.latitude) * Math.PI / 180;
    const lng = (point.longitude - origin.longitude) * Math.PI / 180;
    
    const R = 6371000; // Earth radius in meters
    const x = R * lng * Math.cos(origin.latitude * Math.PI / 180);
    const y = R * lat;
    
    return { x, y };
  }
}

module.exports = GeometryUtils;