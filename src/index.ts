import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import "./server.js";

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create an Express app for serving static files
const staticApp = express();

// Serve static files from the public directory
staticApp.use(express.static(path.join(__dirname, "../public")));

// Start the static server
const STATIC_PORT = 8080;
staticApp.listen(STATIC_PORT, () => {
  console.log(`Static server running on http://localhost:${STATIC_PORT}`);
  console.log(`Open http://localhost:${STATIC_PORT} in your browser to use the Todo Assistant`);
});