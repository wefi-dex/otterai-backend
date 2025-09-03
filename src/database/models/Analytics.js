const { DataTypes } = require('sequelize');

let Analytics;

const defineAnalytics = (sequelize) => {
  
  Analytics = sequelize.define('Analytics', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false
    },
    organization_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'organizations',
        key: 'id'
      }
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    report_type: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    report_name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    report_data: {
      type: DataTypes.JSONB,
      allowNull: false
    },
    filters: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {}
    },
    date_range: {
      type: DataTypes.JSONB,
      allowNull: true
    },
    generated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    is_scheduled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    schedule_frequency: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    last_generated: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    tableName: 'analytics',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        name: 'idx_analytics_organization_id',
        fields: ['organization_id']
      },
      {
        name: 'idx_analytics_user_id',
        fields: ['user_id']
      },
      {
        name: 'idx_analytics_report_type',
        fields: ['report_type']
      },
      {
        name: 'idx_analytics_generated_at',
        fields: ['generated_at']
      }
    ]
  });

  // Instance methods
  Analytics.prototype.isExpired = function() {
    if (!this.expires_at) return false;
    return new Date() > this.expires_at;
  };

  Analytics.prototype.isScheduled = function() {
    return this.is_scheduled === true;
  };

  // Class methods
  Analytics.findByOrganization = function(organizationId, options = {}) {
    return this.findAll({
      where: { organization_id: organizationId },
      ...options
    });
  };

  Analytics.findByUser = function(userId, options = {}) {
    return this.findAll({
      where: { user_id: userId },
      ...options
    });
  };

  Analytics.findByReportType = function(organizationId, reportType, options = {}) {
    return this.findAll({
      where: {
        organization_id: organizationId,
        report_type: reportType
      },
      ...options
    });
  };

  Analytics.findExpired = function(organizationId) {
    return this.findAll({
      where: {
        organization_id: organizationId,
        expires_at: {
          [sequelize.Op.lt]: new Date()
        }
      }
    });
  };

  return Analytics;
};

module.exports = defineAnalytics;
