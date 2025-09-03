const { DataTypes } = require('sequelize');

let LiveSession;

const defineLiveSession = (sequelize) => {
  
  LiveSession = sequelize.define('LiveSession', {
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
    sales_call_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'sales_calls',
        key: 'id'
      }
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    session_token: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true
    },
    status: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'active',
      validate: {
        isIn: [['connecting', 'active', 'paused', 'ended']]
      }
    },
    started_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    ended_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    duration: {
      type: DataTypes.INTEGER, // in seconds
      allowNull: true
    },
    participants: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: []
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    tableName: 'live_sessions',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        name: 'idx_live_sessions_organization_id',
        fields: ['organization_id']
      },
      {
        name: 'idx_live_sessions_sales_call_id',
        fields: ['sales_call_id']
      },
      {
        name: 'idx_live_sessions_user_id',
        fields: ['user_id']
      },
      {
        name: 'idx_live_sessions_status',
        fields: ['status']
      },
      {
        name: 'idx_live_sessions_session_token',
        fields: ['session_token']
      }
    ]
  });

  // Instance methods
  LiveSession.prototype.calculateDuration = function() {
    if (this.started_at && this.ended_at) {
      return Math.floor((this.ended_at - this.started_at) / 1000);
    }
    return null;
  };

  LiveSession.prototype.isActive = function() {
    return this.status === 'active';
  };

  LiveSession.prototype.isEnded = function() {
    return this.status === 'ended';
  };

  LiveSession.prototype.addParticipant = function(participant) {
    if (!this.participants) {
      this.participants = [];
    }
    this.participants.push(participant);
    return this.save();
  };

  // Class methods
  LiveSession.findActiveByOrganization = function(organizationId) {
    return this.findAll({
      where: {
        organization_id: organizationId,
        status: 'active'
      }
    });
  };

  LiveSession.findByUser = function(userId, options = {}) {
    return this.findAll({
      where: { user_id: userId },
      order: [['started_at', 'DESC']],
      ...options
    });
  };

  LiveSession.findBySalesCall = function(salesCallId) {
    return this.findAll({
      where: { sales_call_id: salesCallId }
    });
  };

  LiveSession.findByStatus = function(organizationId, status) {
    return this.findAll({
      where: {
        organization_id: organizationId,
        status
      }
    });
  };

  return LiveSession;
};

module.exports = defineLiveSession;
