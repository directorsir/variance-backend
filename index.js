const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

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

app.get("/", (req, res) => {
  res.send("Backend is live.");
});

const PORT = process.env.PORT || 3000;

const server = http.createServer(app);

const wss = new WebSocket.Server({
  server,
  path: "/stream",
});

wss.on("connection", (twilioSocket) => {
  console.log("Twilio stream connected");

  let deepgramReady = false;
  let streamStarted = false;

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
    } catch (e) {
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

  twilioSocket.on("message", (message) => {
    let data;
    try {
      data = JSON.parse(message.toString());
    } catch (e) {
      return;
    }

    if (data.event === "start") {
  streamStarted = true;
  console.log("Twilio stream started");
}

if (
  data.event === "media" &&
  deepgramReady &&
  streamStarted
) {
  const audioBuffer = Buffer.from(
    data.media.payload,
    "base64"
  );
  if (deepgramSocket.readyState === WebSocket.OPEN) {
  deepgramSocket.send(audioBuffer); {
      const audioBuffer = Buffer.from(
        data.media.payload,
        "base64"
      );
      if (deepgramSocket.readyState === WebSocket.OPEN) {
  deepgramSocket.send(audioBuffer);
    }
  });

  twilioSocket.on("close", () => {
    deepgramSocket.close();
    console.log("Twilio stream disconnected");
  });
});

server.listen(PORT, () => {
  console.log("Server running on port", PORT);
});