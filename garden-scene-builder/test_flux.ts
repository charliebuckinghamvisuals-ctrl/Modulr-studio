import Replicate from "replicate";
import dotenv from "dotenv";

dotenv.config();

const replicate = new Replicate();

async function test() {
  try {
    const output = await replicate.run(
      "black-forest-labs/flux-dev",
      {
        input: {
          prompt: "A beautiful garden",
          image: "https://replicate.delivery/pbxt/IZuV71r2XG5XnO0WnQyYgNlK6lP8Fj2B3yRk9gVpB2T7R9bZ/input.png",
          prompt_strength: 0.8
        }
      }
    );
    console.log("OUTPUT:", output);
  } catch (e: any) {
    console.error("ERROR", e.response?.data || e.message);
  }
}

test();
