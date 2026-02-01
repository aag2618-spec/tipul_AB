-- Migration: Add MANAGER role to enum
-- This migration adds the MANAGER role between USER and ADMIN

-- Step 1: Add MANAGER to the Role enum
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'MANAGER';

-- Note: The new role is now available for use
-- Users with MANAGER role will have access to management features like loading questionnaires
