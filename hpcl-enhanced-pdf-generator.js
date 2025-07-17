// File: hpcl-enhanced-pdf-generator.js
// Purpose: DYNAMIC HPCL PDF Report Generator with Real Route Model Integration
// Dependencies: pdfkit, fs, path, mongoose models
// Author: HPCL Journey Risk Management System
// Updated: 2024 - Fully Dynamic with Database Integration

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

class HPCLDynamicPDFGenerator {
    constructor() {
        // HPCL Official Color Scheme
        this.colors = {
            primary: [0, 82, 147],      // HPCL Blue #005293
            secondary: [60, 60, 60],    // Dark Gray
            danger: [220, 53, 69],      // Red #dc3545
            warning: [253, 126, 20],    // Orange #fd7e14
            success: [40, 167, 69],     // Green #28a745
            info: [0, 82, 147],         // HPCL Blue
            lightGray: [245, 245, 245], // Light Gray #f5f5f5
            white: [255, 255, 255],     // White
            accent: [255, 193, 7]       // Yellow accent #ffc107
        };
        
        // Check for HPCL logo
        this.logoPath = path.join(__dirname, 'HPCL-Logo.png');
        this.hasLogo = fs.existsSync(this.logoPath);
        
        console.log('✅ DYNAMIC HPCL PDF Generator initialized');
        console.log(`🖼️ HPCL Logo: ${this.hasLogo ? 'Found' : 'Not found'} at ${this.logoPath}`);
    }

    /**
     * DYNAMIC: Load route data from database with related models
     * @param {string} routeId - MongoDB ObjectId string
     * @param {string} userId - User ID for ownership verification
     * @returns {Object} Complete route data with related information
     */
    async loadDynamicRouteData(routeId, userId = null) {
        try {
            console.log(`🔄 Loading dynamic route data for: ${routeId}`);
            
            // Import models dynamically
            const Route = require('./models/Route');
            const SharpTurn = require('./models/SharpTurn');
            const BlindSpot = require('./models/BlindSpot');
            const AccidentProneArea = require('./models/AccidentProneArea');
            const RoadCondition = require('./models/RoadCondition');
            const WeatherCondition = require('./models/WeatherCondition');
            const TrafficData = require('./models/TrafficData');
            const EmergencyService = require('./models/EmergencyService');
            const NetworkCoverage = require('./models/NetworkCoverage');

            // Build query filter
            let routeFilter = { _id: routeId, status: { $ne: 'deleted' } };
            if (userId) {
                routeFilter.userId = userId;
            }

            // Load main route data
            const routeData = await Route.findOne(routeFilter).lean();
            
            if (!routeData) {
                throw new Error(`Route not found with ID: ${routeId}`);
            }

            console.log(`📊 Found route: ${routeData.routeName || routeData.routeId}`);

            // Load all related data dynamically
            const [
                sharpTurns,
                blindSpots,
                accidentAreas,
                roadConditions,
                weatherConditions,
                trafficData,
                emergencyServices,
                networkCoverage
            ] = await Promise.all([
                SharpTurn.find({ routeId }).lean(),
                BlindSpot.find({ routeId }).lean(),
                AccidentProneArea.find({ routeId }).lean(),
                RoadCondition.find({ routeId }).lean(),
                WeatherCondition.find({ routeId }).lean(),
                TrafficData.find({ routeId }).lean(),
                EmergencyService.find({ routeId }).lean(),
                NetworkCoverage.find({ routeId }).lean()
            ]);

            // Calculate dynamic statistics
            const dynamicStats = this.calculateDynamicStatistics({
                sharpTurns,
                blindSpots,
                accidentAreas,
                roadConditions,
                weatherConditions,
                trafficData,
                emergencyServices,
                networkCoverage
            });

            // Combine all data
            const completeRouteData = {
                ...routeData,
                dynamicStats,
                relatedData: {
                    sharpTurns: sharpTurns.length,
                    blindSpots: blindSpots.length,
                    accidentAreas: accidentAreas.length,
                    roadConditions: roadConditions.length,
                    weatherConditions: weatherConditions.length,
                    trafficData: trafficData.length,
                    emergencyServices: emergencyServices.length,
                    networkCoverage: networkCoverage.length
                },
                dataQuality: this.assessDataQuality(dynamicStats.totalDataPoints),
                lastAnalyzed: this.getLatestAnalysisDate([
                    ...sharpTurns, ...blindSpots, ...accidentAreas, 
                    ...roadConditions, ...weatherConditions, ...trafficData
                ])
            };

            console.log(`✅ Dynamic data loaded: ${dynamicStats.totalDataPoints} total data points`);
            return completeRouteData;

        } catch (error) {
            console.error('❌ Error loading dynamic route data:', error);
            throw new Error(`Failed to load route data: ${error.message}`);
        }
    }

    /**
     * DYNAMIC: Calculate real-time statistics from collected data
     * @param {Object} dataCollections - All related data collections
     * @returns {Object} Calculated statistics
     */
    calculateDynamicStatistics(dataCollections) {
        const stats = {
            totalDataPoints: 0,
            riskAnalysis: {
                avgRiskScore: 0,
                maxRiskScore: 0,
                criticalPoints: 0,
                riskDistribution: { low: 0, medium: 0, high: 0, critical: 0 }
            },
            safetyMetrics: {
                sharpTurnsSeverity: { gentle: 0, moderate: 0, sharp: 0, hairpin: 0 },
                blindSpotTypes: { crest: 0, curve: 0, intersection: 0, obstruction: 0 },
                accidentSeverity: { minor: 0, moderate: 0, major: 0, fatal: 0 },
                emergencyServiceTypes: { hospital: 0, police: 0, fire_station: 0 }
            },
            infrastructureMetrics: {
                roadQuality: { excellent: 0, good: 0, fair: 0, poor: 0, critical: 0 },
                weatherRisk: 0,
                trafficCongestion: 0,
                networkDeadZones: 0
            }
        };

        // Calculate from sharp turns
        if (dataCollections.sharpTurns) {
            stats.totalDataPoints += dataCollections.sharpTurns.length;
            dataCollections.sharpTurns.forEach(turn => {
                if (turn.riskScore) {
                    stats.riskAnalysis.avgRiskScore += turn.riskScore;
                    stats.riskAnalysis.maxRiskScore = Math.max(stats.riskAnalysis.maxRiskScore, turn.riskScore);
                    if (turn.riskScore >= 8) stats.riskAnalysis.criticalPoints++;
                    this.categorizeRisk(turn.riskScore, stats.riskAnalysis.riskDistribution);
                }
                if (turn.turnSeverity) {
                    stats.safetyMetrics.sharpTurnsSeverity[turn.turnSeverity]++;
                }
            });
        }

        // Calculate from blind spots
        if (dataCollections.blindSpots) {
            stats.totalDataPoints += dataCollections.blindSpots.length;
            dataCollections.blindSpots.forEach(spot => {
                if (spot.riskScore) {
                    stats.riskAnalysis.avgRiskScore += spot.riskScore;
                    stats.riskAnalysis.maxRiskScore = Math.max(stats.riskAnalysis.maxRiskScore, spot.riskScore);
                    if (spot.riskScore >= 8) stats.riskAnalysis.criticalPoints++;
                    this.categorizeRisk(spot.riskScore, stats.riskAnalysis.riskDistribution);
                }
                if (spot.spotType) {
                    stats.safetyMetrics.blindSpotTypes[spot.spotType]++;
                }
            });
        }

        // Calculate from accident areas
        if (dataCollections.accidentAreas) {
            stats.totalDataPoints += dataCollections.accidentAreas.length;
            dataCollections.accidentAreas.forEach(area => {
                if (area.riskScore) {
                    stats.riskAnalysis.avgRiskScore += area.riskScore;
                    stats.riskAnalysis.maxRiskScore = Math.max(stats.riskAnalysis.maxRiskScore, area.riskScore);
                    if (area.riskScore >= 8) stats.riskAnalysis.criticalPoints++;
                    this.categorizeRisk(area.riskScore, stats.riskAnalysis.riskDistribution);
                }
                if (area.accidentSeverity) {
                    stats.safetyMetrics.accidentSeverity[area.accidentSeverity]++;
                }
            });
        }

        // Calculate from road conditions
        if (dataCollections.roadConditions) {
            stats.totalDataPoints += dataCollections.roadConditions.length;
            dataCollections.roadConditions.forEach(road => {
                if (road.surfaceQuality) {
                    stats.infrastructureMetrics.roadQuality[road.surfaceQuality]++;
                }
            });
        }

        // Calculate from weather conditions
        if (dataCollections.weatherConditions) {
            stats.totalDataPoints += dataCollections.weatherConditions.length;
            const avgWeatherRisk = dataCollections.weatherConditions.reduce((sum, w) => sum + (w.riskScore || 0), 0) / dataCollections.weatherConditions.length;
            stats.infrastructureMetrics.weatherRisk = avgWeatherRisk || 0;
        }

        // Calculate from traffic data
        if (dataCollections.trafficData) {
            stats.totalDataPoints += dataCollections.trafficData.length;
            const heavyTraffic = dataCollections.trafficData.filter(t => ['heavy', 'severe'].includes(t.congestionLevel)).length;
            stats.infrastructureMetrics.trafficCongestion = (heavyTraffic / dataCollections.trafficData.length) * 100;
        }

        // Calculate from emergency services
        if (dataCollections.emergencyServices) {
            stats.totalDataPoints += dataCollections.emergencyServices.length;
            dataCollections.emergencyServices.forEach(service => {
                if (service.serviceType && stats.safetyMetrics.emergencyServiceTypes[service.serviceType] !== undefined) {
                    stats.safetyMetrics.emergencyServiceTypes[service.serviceType]++;
                }
            });
        }

        // Calculate from network coverage
        if (dataCollections.networkCoverage) {
            const deadZones = dataCollections.networkCoverage.filter(n => n.isDeadZone).length;
            stats.infrastructureMetrics.networkDeadZones = deadZones;
        }

        // Finalize averages
        if (stats.totalDataPoints > 0) {
            stats.riskAnalysis.avgRiskScore /= stats.totalDataPoints;
            stats.riskAnalysis.avgRiskScore = Math.round(stats.riskAnalysis.avgRiskScore * 100) / 100;
        }

        return stats;
    }

    /**
     * Helper: Categorize risk score into distribution
     */
    categorizeRisk(riskScore, distribution) {
        if (riskScore >= 8) distribution.critical++;
        else if (riskScore >= 6) distribution.high++;
        else if (riskScore >= 4) distribution.medium++;
        else distribution.low++;
    }

    /**
     * Helper: Assess data quality based on total data points
     */
    assessDataQuality(totalDataPoints) {
        if (totalDataPoints >= 100) return { level: 'excellent', score: 95 };
        if (totalDataPoints >= 50) return { level: 'good', score: 80 };
        if (totalDataPoints >= 20) return { level: 'fair', score: 65 };
        if (totalDataPoints >= 5) return { level: 'poor', score: 40 };
        return { level: 'insufficient', score: 20 };
    }

    /**
     * Helper: Get latest analysis date from data collections
     */
    getLatestAnalysisDate(dataArrays) {
        let latestDate = null;
        
        dataArrays.forEach(item => {
            const dates = [item.createdAt, item.updatedAt, item.lastUpdated].filter(d => d);
            dates.forEach(date => {
                if (!latestDate || new Date(date) > new Date(latestDate)) {
                    latestDate = date;
                }
            });
        });
        
        return latestDate || new Date();
    }

    /**
     * Clean text to remove Unicode characters
     */
    cleanTextForPdf(text) {
        if (!text) return '';
        
        const unicodeReplacements = {
            '\u2705': '[OK]', '\u2713': '[OK]', '\u2717': '[X]', '\u26A0': '[!]',
            '\u00B0': ' deg', '\u2192': '->', '\u2022': '*', '\u2013': '-', '\u2014': '--'
        };
        
        let cleanedText = String(text);
        for (const [unicode, replacement] of Object.entries(unicodeReplacements)) {
            cleanedText = cleanedText.replace(new RegExp(unicode, 'g'), replacement);
        }
        
        return cleanedText.replace(/[^\x00-\x7F]/g, '?');
    }

    /**
     * DYNAMIC: Add title page header with logo
     */
    addDynamicTitlePageHeader(doc, routeData) {
        // Header background
        doc.rect(0, 0, doc.page.width, 90).fill(this.colors.primary);
        
        // Add HPCL Logo if available
        if (this.hasLogo) {
            try {
                doc.image(this.logoPath, 20, 15, { width: 50, height: 50 });
            } catch (error) {
                console.warn('Warning: Could not load HPCL logo:', error.message);
            }
        }
        
        // Company name and division
        doc.fontSize(22).fill('white').font('Helvetica-Bold')
           .text('HINDUSTAN PETROLEUM CORPORATION LIMITED', 80, 20);
        
        doc.fontSize(14).font('Helvetica')
           .text('Journey Risk Management Division', 80, 45);
        
        doc.fontSize(11)
           .text('Powered by Route Analytics Pro - AI Intelligence Platform', 80, 65);
    }

    /**
     * DYNAMIC: Add main title with route-specific information
     */
    addDynamicMainTitle(doc, routeData) {
        // Main title
        doc.y = 120;
        doc.fontSize(26).fillColor(this.colors.primary).font('Helvetica-Bold')
           .text('COMPREHENSIVE JOURNEY RISK', 0, doc.y, { align: 'center', width: doc.page.width });
        
        doc.y += 32;
        doc.text('MANAGEMENT ANALYSIS REPORT', 0, doc.y, { align: 'center', width: doc.page.width });
        
        // Dynamic subtitle based on data quality
        doc.y += 35;
        const dataQualityText = routeData.dataQuality.level === 'excellent' ? 
            'Enhanced with Complete AI Analysis & Multi-API Integration' :
            routeData.dataQuality.level === 'good' ?
            'Enhanced with Advanced AI Analysis & API Integration' :
            'Enhanced with Artificial Intelligence & Multi-API Analysis';
            
        doc.fontSize(15).fillColor(this.colors.secondary).font('Helvetica')
           .text(dataQualityText, 0, doc.y, { align: 'center', width: doc.page.width });
    }

    /**
     * DYNAMIC: Add route details box with real data
     */
    addDynamicRouteDetailsBox(doc, routeData) {
        doc.y += 45;
        const boxY = doc.y;
        const boxHeight = 160; // Increased for more content
        
        // Box background
        doc.rect(50, boxY, doc.page.width - 100, boxHeight).fill([250, 250, 250]).stroke();
        
        // Box header with data quality indicator
        const headerColor = routeData.dataQuality.level === 'excellent' ? this.colors.success :
                           routeData.dataQuality.level === 'good' ? this.colors.info :
                           routeData.dataQuality.level === 'fair' ? this.colors.warning : this.colors.danger;
        
        doc.rect(50, boxY, doc.page.width - 100, 30).fill(headerColor);
        
        doc.fontSize(16).fillColor('white').font('Helvetica-Bold')
           .text(`📋 ROUTE ANALYSIS DETAILS (${routeData.dataQuality.level.toUpperCase()} DATA)`, 60, boxY + 8);
        
        // Dynamic route details
        const detailsStartY = boxY + 40;
        
        const formatDuration = (minutes) => {
            if (!minutes) return 'Not specified';
            const hours = Math.floor(minutes / 60);
            const mins = minutes % 60;
            return hours > 0 ? `${hours} hours ${mins} mins` : `${mins} minutes`;
        };
        
        // Build dynamic route details
        const routeDetails = [
            `Supply Location: ${this.cleanTextForPdf(routeData.fromAddress)} [${this.cleanTextForPdf(routeData.fromCode || 'N/A')}]`,
            `Destination: ${this.cleanTextForPdf(routeData.toAddress)} [${this.cleanTextForPdf(routeData.toCode || 'N/A')}]`,
            `Total Distance: ${routeData.totalDistance || 0} km`,
            `Estimated Duration: ${formatDuration(routeData.estimatedDuration)}`,
            `Route Terrain: ${this.cleanTextForPdf(routeData.terrain || 'Mixed')}`,
            `GPS Tracking Points: ${routeData.routePoints?.length || 0}`,
            `Analysis Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`,
            `Report Generated: ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}`
        ];
        
        // Add highways if available
        if (routeData.majorHighways && routeData.majorHighways.length > 0) {
            routeDetails.splice(5, 0, `Major Highways: ${routeData.majorHighways.slice(0, 3).join(', ')}`);
        }
        
        // Add dynamic statistics
        if (routeData.dynamicStats.totalDataPoints > 0) {
            routeDetails.splice(-2, 0, `Total Data Points Analyzed: ${routeData.dynamicStats.totalDataPoints}`);
            routeDetails.splice(-2, 0, `Critical Risk Points: ${routeData.dynamicStats.riskAnalysis.criticalPoints}`);
        }
        
        // Render details
        doc.fontSize(11).fillColor(this.colors.secondary).font('Helvetica');
        
        let detailY = detailsStartY;
        routeDetails.forEach(detail => {
            doc.text(`• ${detail}`, 65, detailY);
            detailY += 13;
        });
        
        // Dynamic risk level indicator
        this.addDynamicRiskIndicator(doc, routeData, boxY + boxHeight + 15);
    }

    /**
     * DYNAMIC: Add risk indicator based on actual calculated risk
     */
    addDynamicRiskIndicator(doc, routeData, yPosition) {
        // Determine risk level from multiple sources
        let riskLevel = 'PENDING';
        let riskScore = 0;
        let riskColor = this.colors.secondary;
        
        if (routeData.riskScores?.totalWeightedScore) {
            riskScore = routeData.riskScores.totalWeightedScore;
            riskLevel = routeData.riskLevel || this.calculateRiskLevel(riskScore);
        } else if (routeData.dynamicStats.riskAnalysis.avgRiskScore > 0) {
            riskScore = routeData.dynamicStats.riskAnalysis.avgRiskScore;
            riskLevel = this.calculateRiskLevel(riskScore);
        }
        
        // Set color based on risk level
        switch (riskLevel) {
            case 'CRITICAL': riskColor = this.colors.danger; break;
            case 'HIGH': riskColor = [255, 87, 34]; break;
            case 'MEDIUM': riskColor = this.colors.warning; break;
            case 'LOW': riskColor = this.colors.success; break;
            default: riskColor = this.colors.secondary; break;
        }
        
        // Risk indicator box
        doc.y = yPosition;
        doc.rect(50, doc.y, doc.page.width - 100, 25).fill(riskColor);
        
        let riskText = `ROUTE RISK LEVEL: ${riskLevel}`;
        if (riskScore > 0) {
            riskText += ` (Score: ${riskScore.toFixed(1)}/10)`;
        }
        if (routeData.dynamicStats.riskAnalysis.criticalPoints > 0) {
            riskText += ` • ${routeData.dynamicStats.riskAnalysis.criticalPoints} Critical Points`;
        }
        
        doc.fontSize(13).fillColor('white').font('Helvetica-Bold')
           .text(riskText, 0, doc.y + 7, { align: 'center', width: doc.page.width });
    }

    /**
     * Helper: Calculate risk level from score
     */
    calculateRiskLevel(score) {
        if (score >= 8) return 'CRITICAL';
        if (score >= 6) return 'HIGH';
        if (score >= 4) return 'MEDIUM';
        return 'LOW';
    }

    /**
     * DYNAMIC: Add footer with data source information
     */
    addDynamicTitlePageFooter(doc, routeData) {
        const footerY = doc.page.height - 60;
        
        // Footer separator line
        doc.strokeColor(this.colors.primary).lineWidth(2)
           .moveTo(50, footerY).lineTo(doc.page.width - 50, footerY).stroke();
        
        // Main footer
        doc.fontSize(10).fillColor(this.colors.primary).font('Helvetica-Bold')
           .text('Generated by HPCL Journey Risk Management System', 
                 0, footerY + 10, { align: 'center', width: doc.page.width });
        
        // Dynamic data source information
        const dataSources = [];
        if (routeData.relatedData.sharpTurns > 0) dataSources.push('Sharp Turns Analysis');
        if (routeData.relatedData.blindSpots > 0) dataSources.push('Blind Spots Detection');
        if (routeData.relatedData.accidentAreas > 0) dataSources.push('Accident Data');
        if (routeData.relatedData.emergencyServices > 0) dataSources.push('Emergency Services');
        if (routeData.relatedData.networkCoverage > 0) dataSources.push('Network Coverage');
        
        const dataSourceText = dataSources.length > 0 ? 
            `Data Sources: ${dataSources.slice(0, 3).join(' • ')}${dataSources.length > 3 ? ' • +More' : ''}` :
            'Real-time Risk Assessment • Professional Safety Analysis';
        
        doc.fontSize(9).fillColor(this.colors.secondary).font('Helvetica')
           .text(dataSourceText, 0, footerY + 25, { align: 'center', width: doc.page.width });
        
        // Analysis timestamp
        const analysisDate = routeData.lastAnalyzed ? 
            new Date(routeData.lastAnalyzed).toLocaleString() : 
            'Recently analyzed';
        
        doc.fontSize(8).fillColor([120, 120, 120])
           .text(`Last Analysis: ${analysisDate} • CONFIDENTIAL - For Internal HPCL Use Only`, 
                 0, footerY + 38, { align: 'center', width: doc.page.width });
    }

    /**
     * MAIN METHOD: Generate dynamic title page from Route ID
     * @param {string} routeId - MongoDB ObjectId
     * @param {string} userId - User ID for ownership verification
     * @param {string} outputPath - Output file path
     */
    async generateDynamicTitlePage(routeId, userId = null, outputPath = null) {
        try {
            console.log('📄 Generating DYNAMIC HPCL Title Page...');
            console.log(`🔍 Route ID: ${routeId}`);
            console.log(`👤 User ID: ${userId || 'Not specified'}`);
            
            // Load complete dynamic route data
            const routeData = await this.loadDynamicRouteData(routeId, userId);
            
            // Create PDF document
            const doc = new PDFDocument({ 
                margin: 0,
                size: 'A4',
                info: {
                    Title: `HPCL Journey Risk Analysis - ${routeData.routeName || 'Route Analysis'}`,
                    Author: 'HPCL Journey Risk Management System',
                    Subject: `Dynamic Route Analysis: ${routeData.fromName || 'Source'} to ${routeData.toName || 'Destination'}`,
                    Keywords: `HPCL, Dynamic Analysis, ${routeData.routeId}, Safety, Risk Assessment`,
                    Creator: 'HPCL Risk Management Division - Dynamic Generator'
                }
            });

            // Generate dynamic content
            this.addDynamicTitlePageHeader(doc, routeData);
            this.addDynamicMainTitle(doc, routeData);
            this.addDynamicRouteDetailsBox(doc, routeData);
            this.addDynamicTitlePageFooter(doc, routeData);

            // Save or return
            if (outputPath) {
                return new Promise((resolve, reject) => {
                    const stream = fs.createWriteStream(outputPath);
                    doc.pipe(stream);
                    doc.end();

                    stream.on('finish', () => {
                        console.log(`✅ DYNAMIC HPCL Title Page generated: ${outputPath}`);
                        console.log(`📊 Route: ${routeData.routeName || routeData.routeId}`);
                        console.log(`🛣️ Distance: ${routeData.totalDistance}km`);
                        console.log(`📈 Data Points: ${routeData.dynamicStats.totalDataPoints}`);
                        console.log(`⚠️ Critical Points: ${routeData.dynamicStats.riskAnalysis.criticalPoints}`);
                        console.log(`🎯 Data Quality: ${routeData.dataQuality.level} (${routeData.dataQuality.score}%)`);
                        resolve({ filePath: outputPath, routeData });
                    });

                    stream.on('error', reject);
                });
            } else {
                return { doc, routeData };
            }

        } catch (error) {
            console.error('❌ Error generating dynamic title page:', error);
            throw error;
        }
    }
}

// Export the dynamic class
module.exports = HPCLDynamicPDFGenerator;

// Example usage
if (require.main === module) {
    const generator = new HPCLDynamicPDFGenerator();
    
    // Example: Generate from actual route ID
    const routeId = '507f1f77bcf86cd799439011'; // Replace with actual route ID
    const userId = '507f191e810c19729de860ea';   // Replace with actual user ID
    
    generator.generateDynamicTitlePage(routeId, userId, 'hpcl-dynamic-route-analysis.pdf')
        .then((result) => {
            console.log('\n🎉 DYNAMIC title page generation completed!');
            console.log(`📁 File: ${result.filePath}`);
            console.log(`📊 Analysis: ${result.routeData.dynamicStats.totalDataPoints} data points`);
        })
        .catch((error) => {
            console.error('❌ Dynamic generation failed:', error);
        });
}

/* 
 * USAGE EXAMPLES:
 * 
 * 1. Generate from Route ID:
 *    const generator = new HPCLDynamicPDFGenerator();
 *    await generator.generateDynamicTitlePage(routeId, userId, 'output.pdf');
 * 
 * 2. For multi-page report:
 *    const { doc, routeData } = await generator.generateDynamicTitlePage(routeId, userId);
 *    doc.addPage();
 *    // Add more pages...
 *    doc.end();
 * 
 * 3. API Integration:
 *    router.get('/routes/:routeId/generate-pdf', async (req, res) => {
 *        const result = await generator.generateDynamicTitlePage(
 *            req.params.routeId, 
 *            req.user.id, 
 *            `route-${req.params.routeId}.pdf`
 *        );
 *        res.download(result.filePath);
 *    });
 */