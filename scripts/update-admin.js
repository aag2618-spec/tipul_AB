// Script to update user role to ADMIN
// Run this script to make aag2618@gmail.com an ADMIN

const updateUserRole = async () => {
  const RENDER_URL = "https://tipul-mh2t.onrender.com";
  
  try {
    console.log("Connecting to database...");
    
    // This would need to be run with Prisma directly
    const updateQuery = `
      UPDATE "User" 
      SET role = 'ADMIN' 
      WHERE email = 'aag2618@gmail.com';
    `;
    
    console.log("SQL Query to run:");
    console.log(updateQuery);
    console.log("\nThis needs to be run directly in Render's PostgreSQL console.");
    
  } catch (error) {
    console.error("Error:", error);
  }
};

updateUserRole();

// INSTRUCTIONS:
// 1. Go to Render Dashboard
// 2. Select your PostgreSQL database
// 3. Click "Connect" → "External Connection" or use the Console
// 4. Run the SQL query shown above
