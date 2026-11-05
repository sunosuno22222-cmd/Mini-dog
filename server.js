import express from "express";
import path from "node:path";
import dotenv from "dotenv";
import { apiRouter, handleDiscordInteractions } from "./src/server/api";
dotenv.config();
const app = express();
const PORT = Number(process.env.PORT) || 3e3;
const HOST = "0.0.0.0";
app.use(express.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf.toString("utf8");
  }
}));
app.use(express.urlencoded({ extended: true }));
app.use("/assets", express.static(path.join(process.cwd(), "public/assets")));
app.post("/api/public/discord/interactions", handleDiscordInteractions);
app.use("/api", apiRouter);
const distPath = path.join(process.cwd(), "dist");
app.use(express.static(distPath));
app.get("*", (_req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});
app.listen(PORT, HOST, () => {
  console.log(`Server listening on http://${HOST}:${PORT}`);
});
