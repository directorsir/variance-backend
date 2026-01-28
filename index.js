const express = require("express");
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
</Response>
  `);
});


app.get("/", (req, res) => {
  res.send("Backend is live.");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
