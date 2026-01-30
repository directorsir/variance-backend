const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

/**
 * TWILIO VOICE WEBHOOK
 * This answers the call and starts audio streaming
 */
app.post("/voice", (req, res) => {
  console.log("Incoming call");

  res.type("text/xml").send(`
<Response>
  <Say>
    Hello. Before we begin, I am not an attorney, and this call does not create an attorney client relationship.
    Please tell me briefly how I can help you today.
  </Say>

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
const server = http.createServer(app);

/**
 * SIMPLE BRAIN — decides what to say back
 */
function decideResponse(transcript) {
  const text = transcript.toLowerCase();

  if (text.includes("accident") || text.includes("crash") || text.includes("hit")) {
    return "I’m sorry that happened. Were you physically injured in the accident?";
  }

  return "Thank you. What type of legal help are you looking for today?";
}

/**
 * WEBSOCKET — Twilio Media Stream
 */
const wss = new WebSocket.Server({
  server,
  path: "/stream",
});

wss.on("connection", (twilioSocket) => {
  console.log("Twilio stream connected");

  let deepgramReady = false;
  let streamStarted = false;
  let lastResponseSent = false;

  const deepgramSocket = new WebSocket(
    "wss://api.deepgram.com/v1/listen?model=phonecall&encoding=mulaw&sample_rate=8000&punctuate=true",
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

    if (transcript && transcript.length > 0 && !lastResponseSent) {
      console.log("Caller said:", transcript);

      const aiResponse = decideResponse(transcript);
      lastResponseSent = true;

      /**
       * Tell Twilio to speak back
       * (we close the stream and respond verbally)
       */
      twilioSocket.send(
        JSON.stringify({
          event: "mark",
          mark: {
            name: aiResponse,
          },
        })
      );

      console.log("AI response decided:", aiResponse);
    }
  });

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
        const audioBuffer = Buffer.from(data.media.payload, "base64");
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

server.listen(PORT, () => {
  console.log("Server running on port", PORT);
});