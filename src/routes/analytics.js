const express = require('express');
const { getSequelize } = require('../database/connection');
const { requireRole, authenticateToken } = require('../middleware/auth');
const { logger } = require('../utils/logger');

const router = express.Router();

// Get models from sequelize instance
const getModels = () => {
  try {
    const sequelize = getSequelize();
    return {
      Analytics: sequelize.models.Analytics,
      SalesCall: sequelize.models.SalesCall,
      User: sequelize.models.User
    };
  } catch (error) {
    logger.error('Failed to get models:', error);
    throw new Error('Database not initialized');
  }
};

/**
 * @route   GET /api/v1/analytics/overview
 * @desc    Get analytics overview for organization
 * @access  Private (All authenticated users)
 */
router.get('/overview', authenticateToken, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const organizationId = req.user.organization_id;

    const { SalesCall, User } = getModels();

    const whereClause = { organization_id: organizationId };
    if (startDate && endDate) {
      whereClause.appointment_date = {
        [require('sequelize').Op.between]: [new Date(startDate), new Date(endDate)]
      };
    }

    // Get sales calls data
    const salesCalls = await SalesCall.findAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'salesRepresentative',
          attributes: ['id', 'first_name', 'last_name']
        }
      ]
    });

    // Calculate metrics
    const totalCalls = salesCalls.length;
    const completedCalls = salesCalls.filter(call => call.status === 'completed').length;
    const successfulSales = salesCalls.filter(call => call.outcome === 'sale').length;
    const totalRevenue = salesCalls
      .filter(call => call.sale_amount)
      .reduce((sum, call) => sum + parseFloat(call.sale_amount), 0);

    const averageCallDuration = salesCalls
      .filter(call => call.duration)
      .reduce((sum, call) => sum + call.duration, 0) / 
      salesCalls.filter(call => call.duration).length || 0;

    const averagePerformanceScore = salesCalls
      .filter(call => call.performance_score)
      .reduce((sum, call) => sum + parseFloat(call.performance_score), 0) /
      salesCalls.filter(call => call.performance_score).length || 0;

    const conversionRate = completedCalls > 0 ? (successfulSales / completedCalls) * 100 : 0;

    // Get top performers
    const salesRepStats = {};
    salesCalls.forEach(call => {
      if (!salesRepStats[call.sales_representative_id]) {
        salesRepStats[call.sales_representative_id] = {
          id: call.sales_representative_id,
          name: `${call.salesRepresentative?.first_name} ${call.salesRepresentative?.last_name}`,
          totalCalls: 0,
          successfulSales: 0,
          totalRevenue: 0,
          averageScore: 0,
          scores: []
        };
      }
      
      salesRepStats[call.sales_representative_id].totalCalls++;
      if (call.outcome === 'sale') {
        salesRepStats[call.sales_representative_id].successfulSales++;
        salesRepStats[call.sales_representative_id].totalRevenue += parseFloat(call.sale_amount || 0);
      }
      if (call.performance_score) {
        salesRepStats[call.sales_representative_id].scores.push(parseFloat(call.performance_score));
      }
    });

    // Calculate average scores
    Object.values(salesRepStats).forEach(rep => {
      rep.averageScore = rep.scores.length > 0 ? 
        rep.scores.reduce((sum, score) => sum + score, 0) / rep.scores.length : 0;
      delete rep.scores;
    });

    const topPerformers = Object.values(salesRepStats)
      .sort((a, b) => b.averageScore - a.averageScore)
      .slice(0, 5);

    const overview = {
      totalCalls,
      completedCalls,
      successfulSales,
      totalRevenue,
      averageCallDuration,
      averagePerformanceScore,
      conversionRate,
      topPerformers
    };

    res.status(200).json({
      success: true,
      data: overview
    });
  } catch (error) {
    logger.error('Error fetching analytics overview:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch analytics overview',
        code: 'ANALYTICS_OVERVIEW_FETCH_FAILED'
      }
    });
  }
});

/**
 * @route   GET /api/v1/analytics/performance
 * @desc    Get detailed performance analytics
 * @access  Private (Managers, Admins)
 */
router.get('/performance', [
  authenticateToken,
  requireRole(['sales_manager', 'admin', 'super_admin'])
], async (req, res) => {
  try {
    const { startDate, endDate, salesRepresentativeId, periodType = 'monthly' } = req.query;
    const organizationId = req.user.organization_id;

    const whereClause = { organization_id: organizationId };
    if (startDate && endDate) {
      whereClause.appointment_date = {
        [require('sequelize').Op.between]: [new Date(startDate), new Date(endDate)]
      };
    }
    if (salesRepresentativeId) {
      whereClause.sales_representative_id = salesRepresentativeId;
    }

    // Get analytics data
    const { Analytics, SalesCall, User } = getModels();

    const analytics = await Analytics.findByOrganization(
      organizationId,
      periodType,
      startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
      endDate ? new Date(endDate) : new Date()
    );

    // Get sales calls for detailed analysis
    const salesCalls = await SalesCall.findAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'salesRepresentative',
          attributes: ['id', 'first_name', 'last_name']
        }
      ],
      order: [['appointment_date', 'ASC']]
    });

    // Calculate trends
    const trends = calculateTrends(salesCalls, periodType);

    // Get common strengths and weaknesses
    const strengths = [];
    const weaknesses = [];
    const objections = [];

    salesCalls.forEach(call => {
      if (call.strengths) {
        call.strengths.forEach(strength => {
          const existing = strengths.find(s => s.name === strength);
          if (existing) {
            existing.count++;
          } else {
            strengths.push({ name: strength, count: 1 });
          }
        });
      }

      if (call.weaknesses) {
        call.weaknesses.forEach(weakness => {
          const existing = weaknesses.find(w => w.name === weakness);
          if (existing) {
            existing.count++;
          } else {
            weaknesses.push({ name: weakness, count: 1 });
          }
        });
      }

      if (call.objectionsHandled) {
        call.objectionsHandled.forEach(objection => {
          const existing = objections.find(o => o.name === objection);
          if (existing) {
            existing.count++;
          } else {
            objections.push({ name: objection, count: 1 });
          }
        });
      }
    });

    const performance = {
      analytics,
      trends,
      topStrengths: strengths.sort((a, b) => b.count - a.count).slice(0, 5),
      topWeaknesses: weaknesses.sort((a, b) => b.count - a.count).slice(0, 5),
      commonObjections: objections.sort((a, b) => b.count - a.count).slice(0, 5)
    };

    res.status(200).json({
      success: true,
      data: performance
    });
  } catch (error) {
    logger.error('Error fetching performance analytics:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch performance analytics',
        code: 'PERFORMANCE_ANALYTICS_FETCH_FAILED'
      }
    });
  }
});

/**
 * @route   GET /api/v1/analytics/user/:userId
 * @desc    Get analytics for specific user
 * @access  Private (Managers, Admins, Self)
 */
router.get('/user/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const { startDate, endDate } = req.query;
    const organizationId = req.user.organization_id;

    // Verify user access
    if (req.user.role === 'sales_representative' && req.user.id !== userId) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Access denied',
          code: 'ACCESS_DENIED'
        }
      });
    }

    const whereClause = { 
      organization_id: organizationId,
      sales_representative_id: userId
    };
    
    if (startDate && endDate) {
      whereClause.appointment_date = {
        [require('sequelize').Op.between]: [new Date(startDate), new Date(endDate)]
      };
    }

    // Get user's sales calls
    const { SalesCall, Analytics } = getModels();

    const salesCalls = await SalesCall.findAll({
      where: whereClause,
      order: [['appointment_date', 'DESC']]
    });

    // Calculate user metrics
    const totalCalls = salesCalls.length;
    const completedCalls = salesCalls.filter(call => call.status === 'completed').length;
    const successfulSales = salesCalls.filter(call => call.outcome === 'sale').length;
    const totalRevenue = salesCalls
      .filter(call => call.sale_amount)
      .reduce((sum, call) => sum + parseFloat(call.sale_amount), 0);

    const averagePerformanceScore = salesCalls
      .filter(call => call.performance_score)
      .reduce((sum, call) => sum + parseFloat(call.performance_score), 0) /
      salesCalls.filter(call => call.performance_score).length || 0;

    const averageScriptCompliance = salesCalls
      .filter(call => call.script_compliance)
      .reduce((sum, call) => sum + parseFloat(call.script_compliance), 0) /
      salesCalls.filter(call => call.script_compliance).length || 0;

    const conversionRate = completedCalls > 0 ? (successfulSales / completedCalls) * 100 : 0;

    // Get user analytics
    const userAnalytics = await Analytics.findByUser(
      userId,
      'monthly',
      startDate ? new Date(startDate) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // Last 90 days
      endDate ? new Date(endDate) : new Date()
    );

    const userStats = {
      totalCalls,
      completedCalls,
      successfulSales,
      totalRevenue,
      averagePerformanceScore,
      averageScriptCompliance,
      conversionRate,
      analytics: userAnalytics,
      recentCalls: salesCalls.slice(0, 10)
    };

    res.status(200).json({
      success: true,
      data: userStats
    });
  } catch (error) {
    logger.error('Error fetching user analytics:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch user analytics',
        code: 'USER_ANALYTICS_FETCH_FAILED'
      }
    });
  }
});

/**
 * @route   GET /api/v1/analytics/trends
 * @desc    Get performance trends over time
 * @access  Private (Managers, Admins)
 */
router.get('/trends', [
  authenticateToken,
  requireRole(['sales_manager', 'admin', 'super_admin'])
], async (req, res) => {
  try {
    const { startDate, endDate, periodType = 'weekly' } = req.query;
    const organizationId = req.user.organization_id;

    const whereClause = { organization_id: organizationId };
    if (startDate && endDate) {
      whereClause.appointment_date = {
        [require('sequelize').Op.between]: [new Date(startDate), new Date(endDate)]
      };
    }

    const { SalesCall } = getModels();

    const salesCalls = await SalesCall.findAll({
      where: whereClause,
      order: [['appointment_date', 'ASC']]
    });

    const trends = calculateTrends(salesCalls, periodType);

    res.status(200).json({
      success: true,
      data: trends
    });
  } catch (error) {
    logger.error('Error fetching trends:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch trends',
        code: 'TRENDS_FETCH_FAILED'
      }
    });
  }
});

/**
 * Calculate trends from sales calls data
 */
const calculateTrends = (salesCalls, periodType) => {
  const trends = {};
  const periods = {};

  salesCalls.forEach(call => {
    let periodKey;
    const date = new Date(call.appointment_date);

    switch (periodType) {
      case 'daily':
        periodKey = date.toISOString().split('T')[0];
        break;
      case 'weekly':
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        periodKey = weekStart.toISOString().split('T')[0];
        break;
      case 'monthly':
        periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        break;
      default:
        periodKey = date.toISOString().split('T')[0];
    }

    if (!periods[periodKey]) {
      periods[periodKey] = {
        period: periodKey,
        totalCalls: 0,
        completedCalls: 0,
        successfulSales: 0,
        totalRevenue: 0,
        averagePerformanceScore: 0,
        performanceScores: []
      };
    }

    periods[periodKey].totalCalls++;
    if (call.status === 'completed') {
      periods[periodKey].completedCalls++;
    }
    if (call.outcome === 'sale') {
      periods[periodKey].successfulSales++;
      periods[periodKey].totalRevenue += parseFloat(call.saleAmount || 0);
    }
    if (call.performanceScore) {
      periods[periodKey].performanceScores.push(parseFloat(call.performanceScore));
    }
  });

  // Calculate averages
  Object.values(periods).forEach(period => {
    period.averagePerformanceScore = period.performanceScores.length > 0 ?
      period.performanceScores.reduce((sum, score) => sum + score, 0) / period.performanceScores.length : 0;
    delete period.performanceScores;
  });

  return Object.values(periods).sort((a, b) => a.period.localeCompare(b.period));
};

module.exports = router;
