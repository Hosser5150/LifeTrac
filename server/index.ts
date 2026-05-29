import { createApp } from "./app";

const port = Number(process.env.PORT || 4174);
const app = createApp();

app.listen(port, "127.0.0.1", () => {
  console.log(`Memory timeline API listening on http://127.0.0.1:${port}`);
});
