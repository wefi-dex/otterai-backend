const { DataTypes } = require('sequelize');

let Notification;

const defineNotification = (sequelize) => {
  
  Notification = sequelize.define('Notification', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false
    },
    organization_id: {
      type: DataTypes.UUID,
      allowNull: true, // Allow null for external webhooks
      references: {
        model: 'organizations',
        key: 'id'
      }
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: true, // Allow null for external webhooks
      references: {
        model: 'users',
        key: 'id'
      }
    },
    type: {
      type: DataTypes.STRING(100),
      allowNull: false,
      validate: {
        isIn: [
          'call_started',
          'call_completed',
          'performance_alert',
          'live_intervention',
          'system_alert',
          'reminder',
          'achievement',
          'coaching_tip'
        ]
      }
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    data: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {}
    },
    is_read: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    is_sent: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    sent_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    read_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    priority: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'normal',
      validate: {
        isIn: ['low', 'normal', 'high', 'urgent']
      }
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    tableName: 'notifications',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        name: 'idx_notifications_organization_id',
        fields: ['organization_id']
      },
      {
        name: 'idx_notifications_user_id',
        fields: ['user_id']
      },
      {
        name: 'idx_notifications_type',
        fields: ['type']
      },
      {
        name: 'idx_notifications_is_read',
        fields: ['is_read']
      },
      {
        name: 'idx_notifications_priority',
        fields: ['priority']
      },
      {
        name: 'idx_notifications_created_at',
        fields: ['created_at']
      }
    ]
  });

  // Instance methods
  Notification.prototype.markAsRead = function() {
    this.is_read = true;
    this.read_at = new Date();
    return this.save();
  };

  Notification.prototype.markAsSent = function() {
    this.is_sent = true;
    this.sent_at = new Date();
    return this.save();
  };

  Notification.prototype.isExpired = function() {
    if (!this.expires_at) return false;
    return new Date() > this.expires_at;
  };

  Notification.prototype.isHighPriority = function() {
    return this.priority === 'high' || this.priority === 'urgent';
  };

  // Class methods
  Notification.findUnreadByUser = function(userId, options = {}) {
    return this.findAll({
      where: {
        user_id: userId,
        is_read: false
      },
      order: [['created_at', 'DESC']],
      ...options
    });
  };

  Notification.findByType = function(organizationId, type, options = {}) {
    return this.findAll({
      where: {
        organization_id: organizationId,
        type
      },
      order: [['created_at', 'DESC']],
      ...options
    });
  };

  Notification.findHighPriority = function(organizationId, options = {}) {
    return this.findAll({
      where: {
        organization_id: organizationId,
        priority: ['high', 'urgent']
      },
      order: [['created_at', 'DESC']],
      ...options
    });
  };

  Notification.findExpired = function(organizationId) {
    return this.findAll({
      where: {
        organization_id: organizationId,
        expires_at: {
          [sequelize.Op.lt]: new Date()
        }
      }
    });
  };

  // Instance methods
  Notification.prototype.toJSON = function() {
    const values = Object.assign({}, this.get());
    
    // Convert snake_case to camelCase for frontend compatibility
    return {
      id: values.id,
      organizationId: values.organization_id,
      userId: values.user_id,
      type: values.type,
      title: values.title,
      message: values.message,
      priority: values.priority,
      status: values.is_read ? 'read' : 'unread',
      readAt: values.read_at,
      actionUrl: values.action_url,
      actionData: values.action_data,
      relatedEntityType: values.related_entity_type,
      relatedEntityId: values.related_entity_id,
      expiresAt: values.expires_at,
      createdAt: values.created_at,
      updatedAt: values.updated_at,
      user: values.user
    };
  };

  return Notification;
};

module.exports = defineNotification;
