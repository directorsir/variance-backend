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

wss.on("connection", (twilioSocket) => {
  console.log("Twilio stream connected");

  const deepgramSocket = new WebSocket(
    "wss://api.deepgram.com/v1/listen?model=phonecall&punctuate=true",
    {
      headers: {
        Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
      },
    }
  );

  deepgramSocket.on("open", () => {
    console.log("Deepgram connected");
  });

  deepgramSocket.on("message", (msg) => {
    const data = JSON.parse(msg);
    const transcript =
      data.channel?.alternatives?.[0]?.transcript;

    if (transcript && transcript.length > 0) {
      console.log("Caller said:", transcript);
    }
  });

  twilioSocket.on("message", (msg) => {
    const data = JSON.parse(msg);

    if (data.event === "media") {
      const audioBuffer = Buffer.from(
        data.media.payload,
        "base64"
      );
      deepgramSocket.send(audioBuffer);
    }
  });

  twilioSocket.on("close", () => {
    deepgramSocket.close();
    console.log("Twilio stream disconnected");
  });
});

  ws.on("close", () => {
    console.log("Twilio stream disconnected");
  });
});

server.listen(PORT, () => {
  console.log("Server running on port", PORT);
});