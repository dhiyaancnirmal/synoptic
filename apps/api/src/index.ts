import compression from "compression";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { createServer } from "node:http";
import { Server as SocketIOServer } from "socket.io";

import { registerHealthRoute } from "./routes/health.js";

const app = express();

app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json());

registerHealthRoute(app);

app.get("/", (_req, res) => {
  res.json({ service: "synoptic-api", status: "scaffold" });
});

const port = Number(process.env.PORT ?? 3001);
const server = createServer(app);

const io = new SocketIOServer(server, {
  cors: {
    origin: "*"
  }
});

io.on("connection", (socket) => {
  socket.emit("system.ready", { message: "Synoptic API scaffold socket ready" });
});

server.listen(port, () => {
  console.log(`Synoptic API scaffold listening on http://localhost:${port}`);
});
