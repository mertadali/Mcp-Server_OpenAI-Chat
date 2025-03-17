import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import "./server.js";

// Get the directory name
// Dizin adını al
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create an Express app for serving static files
// Statik dosyaları sunmak için bir Express uygulaması oluştur
const staticApp = express();

// Serve static files from the public directory
// Public dizininden statik dosyaları sun
staticApp.use(express.static(path.join(__dirname, "../public")));

// Start the static server
// Statik sunucuyu başlat
const STATIC_PORT = 8080;
staticApp.listen(STATIC_PORT, () => {
  console.log(`Static server running on http://localhost:${STATIC_PORT}`);
  console.log(`Open http://localhost:${STATIC_PORT} in your browser to use the Todo Assistant`);
});