const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

/**
 * TWILIO VOICE WEBHOOK
 * Answers the phone and starts streaming audio
 */
app.post("/voice", (req, res) => {
  console.log("Incoming call received");

  res.status(200).type("text/xml").send(`
<Response>
  <Say>Hello. Please tell me how I can help you.</Say>

  <Connect>
    <Stream url="wss://variance-backend.onrender.com/stream" />
  </Connect>

  <Pause length="60" />
</Response>
  `);
});

/**
 * Health check
 */
app.get("/", (req, res) => {
  res.send("Backend is live.");
});

const PORT = process.env.PORT || 3000;

/**
 * Create HTTP server (required for WebSockets)
 */
const server = http.createServer(app);

/**
 * WebSocket server for Twilio Media Streams
 */
const wss = new WebSocket.Server({
  server,
  path: "/stream",
});

wss.on("connection", (twilioSocket) => {
  console.log("Twilio stream connected");

  let deepgramReady = false;
  let streamStarted = false;

  /**
   * Connect to Deepgram
   */
  const deepgramSocket = new WebSocket(
    "wss://api.deepgram.com/v1/listen?model=phonecall&encoding=mulaw&sample_rate=8000&punctuate=true&interim_results=true",
    {
      headers: {
        Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
      },
    }
  );

  deepgramSocket.on("open", () => {
    deepgramReady = true;
    console.log("Deepgram connected");
  });

  deepgramSocket.on("message", (message) => {
    let data;
    try {
      data = JSON.parse(message.toString());
    } catch {
      return;
    }

    const transcript =
      data.channel &&
      data.channel.alternatives &&
      data.channel.alternatives[0] &&
      data.channel.alternatives[0].transcript;

    if (transcript && transcript.length > 0) {
      console.log("Caller said:", transcript);
    }
  });

  deepgramSocket.on("error", (err) => {
    console.error("Deepgram error:", err.message);
  });

  /**
   * Receive audio from Twilio and forward to Deepgram
   */
  twilioSocket.on("message", (message) => {
    try {
      const data = JSON.parse(message.toString());

      if (data.event === "start") {
        streamStarted = true;
        console.log("Twilio stream started");
      }

      if (
        data.event === "media" &&
        deepgramReady &&
        streamStarted &&
        deepgramSocket.readyState === WebSocket.OPEN
      ) {
        const audioBuffer = Buffer.from(
          data.media.payload,
          "base64"
        );
        deepgramSocket.send(audioBuffer);
      }
    } catch (err) {
      console.error("Twilio stream error:", err.message);
    }
  });

  twilioSocket.on("close", () => {
    if (deepgramSocket.readyState === WebSocket.OPEN) {
      deepgramSocket.close();
    }
    console.log("Twilio stream disconnected");
  });
});

/**
 * Start server
 */
server.listen(PORT, () => {
  console.log("Server running on port", PORT);
});