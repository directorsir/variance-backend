const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.post("/voice", (req, res) => {
  res.type("text/xml");
  res.send(`
<Response>
  <Say>Hello. Please tell me how I can help you.</Say>

  <Connect>
    <Stream url="wss://variance-backend.onrender.com/stream" />
  </Connect>

  <Pause length="60" />
</Response>
  `);
});

app.get("/", (req, res) => {
  res.send("Backend is live.");
});

const PORT = process.env.PORT || 3000;

/**
 * IMPORTANT:
 * WebSockets require the HTTP server,
 * not app.listen()
 */
const server = http.createServer(app);

const wss = new WebSocket.Server({ server, path: "/stream" });

wss.on("connection", (ws) => {
  console.log("Twilio stream connected");

  ws.on("message", (msg) => {
    const data = JSON.parse(msg);

    if (data.event === "start") {
      console.log("Stream started");
    }

    if (data.event === "media") {
      console.log("Receiving audio...");
    }

    if (data.event === "stop") {
      console.log("Stream stopped");
    }
  });

  ws.on("close", () => {
    console.log("Twilio stream disconnected");
  });
});

server.listen(PORT, () => {
  console.log("Server running on port", PORT);
});