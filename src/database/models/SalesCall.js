const { DataTypes } = require('sequelize');

let SalesCall;

const defineSalesCall = (sequelize) => {
  
  SalesCall = sequelize.define('SalesCall', {
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
    sales_representative_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    manager_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    customer_name: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    customer_phone: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    customer_email: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    appointment_date: {
      type: DataTypes.DATE,
      allowNull: false
    },
    call_start_time: {
      type: DataTypes.DATE,
      allowNull: true
    },
    call_end_time: {
      type: DataTypes.DATE,
      allowNull: true
    },
    duration: {
      type: DataTypes.INTEGER, // in seconds
      allowNull: true
    },
    status: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'scheduled',
      validate: {
        isIn: [['scheduled', 'in_progress', 'completed', 'cancelled', 'no_show']]
      }
    },
    outcome: {
      type: DataTypes.STRING(50),
      allowNull: true,
      validate: {
        isIn: [['sale', 'no_sale', 'follow_up', 'rescheduled']]
      }
    },
    sale_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true
    },
    otter_ai_recording_id: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    recording_url: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    transcript_url: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    analysis_data: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {}
    },
    performance_score: {
      type: DataTypes.DECIMAL(3, 2), // 0.00 to 1.00
      allowNull: true
    },
    strengths: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: []
    },
    weaknesses: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: []
    },
    recommendations: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: []
    },
    script_compliance: {
      type: DataTypes.DECIMAL(3, 2), // 0.00 to 1.00
      allowNull: true
    },
    key_topics_covered: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: []
    },
    objections_handled: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: []
    },
    customer_sentiment: {
      type: DataTypes.STRING(20),
      allowNull: true,
      validate: {
        isIn: [['positive', 'neutral', 'negative']]
      }
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    tags: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: []
    },
    is_live_monitored: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    live_session_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'live_sessions',
        key: 'id'
      }
    }
  }, {
    tableName: 'sales_calls',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        name: 'idx_sales_calls_organization_id',
        fields: ['organization_id']
      },
      {
        name: 'idx_sales_calls_sales_representative_id',
        fields: ['sales_representative_id']
      },
      {
        name: 'idx_sales_calls_appointment_date',
        fields: ['appointment_date']
      },
      {
        name: 'idx_sales_calls_status',
        fields: ['status']
      },
      {
        name: 'idx_sales_calls_outcome',
        fields: ['outcome']
      },
      {
        name: 'idx_sales_calls_customer_email',
        fields: ['customer_email']
      }
    ]
  });

  // Instance methods
  SalesCall.prototype.calculateDuration = function() {
    if (this.call_start_time && this.call_end_time) {
      return Math.floor((this.call_end_time - this.call_start_time) / 1000);
    }
    return null;
  };

  SalesCall.prototype.isCompleted = function() {
    return this.status === 'completed';
  };

  SalesCall.prototype.isSuccessful = function() {
    return this.outcome === 'sale';
  };

  // Class methods
  SalesCall.findByOrganization = function(organizationId, options = {}) {
    return this.findAll({
      where: { organization_id: organizationId },
      include: [
        {
          model: sequelize.models.User,
          as: 'salesRepresentative',
          attributes: ['id', 'first_name', 'last_name', 'email']
        },
        {
          model: sequelize.models.User,
          as: 'manager',
          attributes: ['id', 'first_name', 'last_name', 'email']
        }
      ],
      ...options
    });
  };

  SalesCall.findBySalesRepresentative = function(salesRepresentativeId, options = {}) {
    return this.findAll({
      where: { sales_representative_id: salesRepresentativeId },
      ...options
    });
  };

  SalesCall.findByDateRange = function(organizationId, startDate, endDate) {
    return this.findAll({
      where: {
        organization_id: organizationId,
        appointment_date: {
          [sequelize.Op.between]: [startDate, endDate]
        }
      },
      include: [
        {
          model: sequelize.models.User,
          as: 'salesRepresentative',
          attributes: ['id', 'first_name', 'last_name']
        }
      ]
    });
  };

  SalesCall.getPerformanceStats = function(organizationId, startDate, endDate) {
    return this.findAll({
      where: {
        organization_id: organizationId,
        appointment_date: {
          [sequelize.Op.between]: [startDate, endDate]
        },
        status: 'completed'
      },
      attributes: [
        'outcome',
        'sale_amount',
        'performance_score',
        'script_compliance',
        'duration'
      ]
    });
  };

  return SalesCall;
};

module.exports = defineSalesCall;
