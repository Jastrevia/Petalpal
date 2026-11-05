const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);
// Watch repo root so assets in Resources can be required directly
config.watchFolders = [path.resolve(__dirname, '..')];

module.exports = config;
