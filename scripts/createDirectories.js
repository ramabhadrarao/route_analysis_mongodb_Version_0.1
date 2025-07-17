// File: scripts/createDirectories.js
// Purpose: Create necessary directories for the application

const fs = require('fs');
const path = require('path');

// Directories to create
const directories = [
  './uploads',
  './logs',
  './public',
  './public/images',
  './public/reports',
  './templates',
  './templates/pdf'
];

console.log('Creating necessary directories...');

directories.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`✅ Created directory: ${dir}`);
  } else {
    console.log(`📁 Directory already exists: ${dir}`);
  }
});

// Create a .gitkeep file in uploads to track the directory
const gitkeepPath = path.join('./uploads', '.gitkeep');
if (!fs.existsSync(gitkeepPath)) {
  fs.writeFileSync(gitkeepPath, '# This file keeps the uploads directory in git\n');
  console.log('✅ Created .gitkeep in uploads directory');
}

console.log('🎉 All directories created successfully!');