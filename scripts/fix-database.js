const { initializeDatabase } = require('../src/database/connection');

async function fixDatabase() {
  try {
    console.log('🔧 Initializing database...');
    await initializeDatabase();
    console.log('✅ Database initialized successfully');
    
    const { getSequelize } = require('../src/database/connection');
    const sequelize = getSequelize();
    
    // Test the connection
    await sequelize.authenticate();
    console.log('✅ Database connected successfully');
    
    // Check existing users
    const [users] = await sequelize.query('SELECT id, email, organization_id FROM users');
    console.log('📋 Existing users:', users);
    
    // Check if there are any users with null organization_id
    const usersWithNullOrg = users.filter(user => user.organization_id === null);
    console.log('👥 Users without organization:', usersWithNullOrg.length);
    
    // Check organizations
    const [orgs] = await sequelize.query('SELECT id, name FROM organizations');
    console.log('🏢 Existing organizations:', orgs);
    
    // If there are users without organizations, create a default one
    if (usersWithNullOrg.length > 0 && orgs.length === 0) {
      console.log('🏗️  Creating default organization...');
      const [newOrg] = await sequelize.query(`
        INSERT INTO organizations (name, type, status, subscription_plan, subscription_status, timezone)
        VALUES ('Default Organization', 'headquarters', 'active', 'enterprise', 'active', 'UTC')
        RETURNING id, name
      `);
      console.log('✅ Created organization:', newOrg[0]);
      
      // Update users to have the default organization
      await sequelize.query(`
        UPDATE users 
        SET organization_id = $1 
        WHERE organization_id IS NULL
      `, [newOrg[0].id]);
      console.log('✅ Updated users with default organization');
    }
    
    console.log('🎉 Database fix completed successfully!');
    
  } catch (error) {
    console.error('❌ Error fixing database:', error);
  } finally {
    process.exit(0);
  }
}

fixDatabase();
