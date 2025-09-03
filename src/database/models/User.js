const { DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');

let User;

const defineUser = (sequelize) => {
  
  User = sequelize.define('User', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true
      }
    },
    password: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    first_name: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    last_name: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    phone: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    role: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'sales_representative',
      validate: {
        isIn: [['sales_representative', 'sales_manager', 'admin', 'super_admin']]
      }
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'active',
      validate: {
        isIn: [['active', 'inactive', 'suspended']]
      }
    },
    organization_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'organizations',
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
    last_login_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    preferences: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {}
    },
    profile_image_url: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    is_online: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    device_token: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    reset_password_token: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    reset_password_expires: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    tableName: 'users',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        name: 'idx_users_email',
        fields: ['email']
      },
      {
        name: 'idx_users_organization_id',
        fields: ['organization_id']
      },
      {
        name: 'idx_users_role',
        fields: ['role']
      },
      {
        name: 'idx_users_status',
        fields: ['status']
      },
      {
        name: 'idx_users_manager_id',
        fields: ['manager_id']
      },
      {
        name: 'idx_users_reset_password_token',
        fields: ['reset_password_token']
      }
    ],
    hooks: {
      beforeCreate: async (user) => {
        if (user.password) {
          user.password = await bcrypt.hash(user.password, 12);
        }
      },
      beforeUpdate: async (user) => {
        if (user.changed('password')) {
          user.password = await bcrypt.hash(user.password, 12);
        }
      }
    }
  });

  // Instance methods
  User.prototype.comparePassword = async function(candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
  };

  User.prototype.toJSON = function() {
    const values = Object.assign({}, this.get());
    delete values.password;
    return values;
  };

  // Class methods
  User.findByEmail = function(email) {
    return this.findOne({ where: { email } });
  };

  User.findByOrganization = function(organizationId) {
    return this.findAll({ 
      where: { organization_id: organizationId },
      include: [
        {
          model: sequelize.models.Organization,
          as: 'organization',
          attributes: ['id', 'name', 'type']
        }
      ]
    });
  };

  User.findSalesRepresentatives = function(organizationId) {
    return this.findAll({
      where: {
        organization_id: organizationId,
        role: 'sales_representative',
        status: 'active'
      }
    });
  };

  User.findManagers = function(organizationId) {
    return this.findAll({
      where: {
        organization_id: organizationId,
        role: 'sales_manager',
        status: 'active'
      }
    });
  };

  return User;
};

module.exports = defineUser;
